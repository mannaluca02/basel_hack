import { errorCode, httpFailure } from '../http/diagnostics';
import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import type { InsuranceCaseDto, VoiceSessionStartResponse } from '@pax/contracts';
import { Subject } from 'rxjs';
import { CustomerApi, type CustomerSession } from '../advisor/api/customer-api';
import { CaseStore } from '../advisor/store/case-store';
import type { AgentActivity } from '../advisor/ui-models';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { AppLanguage } from '../i18n/language';
import { HandoverControl } from './handover-control';
import {
  afterCustomerTurn,
  emptyIntakeMemory,
  intakeRows,
  nextIntakeField,
  steeringContext,
  type IntakeFieldId,
  type IntakeRow,
  type TurnExtraction,
} from './intake-plan';
import { INTAKE_TEXT } from './intake-text';
import type { ReplyEmotion } from './emotions';
import { PaxiCaseVoice } from './paxi-case-voice';
import { ReportInbox, type ReportCall } from './report-inbox';
import { VoiceActivity } from './voice-activity';
import { VoiceLabApi } from './voice-lab-api';

interface LiveTurnResult {
  mode: 'synthetic' | 'live';
  source: { text: string };
  extraction: TurnExtraction & {
    adapter: string;
    route: string;
    result: { proposalBatch?: unknown; issues?: { code: string }[] };
    /** The answers to the open profile questions (live, once the person exists). */
    answers?: { proposalBatch: unknown; answered: string[] };
    /** Read by GPT-Live's background model, not by a backend model call. */
    delegated?: true;
  };
}
/** One open profile question of the backend (`voice-lab/questions`), in conversation order. */
interface CaseAsk {
  key: string;
  text: string;
  /** What the answer must give, for Paxi (not shown). */
  about?: string;
}
interface DialogueLine {
  id: number;
  speaker: 'customer' | 'agent';
  text: string;
  origin: 'live';
}
interface ExtractionNotice {
  enabled: boolean;
  version: string;
  noticeHash: string;
  text: string;
}
interface PromptSkill {
  id: string;
  name: string;
  description: string;
}
type VoiceAvatarEvent =
  | { type: 'activity'; state: 'idle' | 'listening' | 'thinking' }
  | { type: 'emotion'; emotion: ReplyEmotion };

/**
 * Earnie's live voice over the case backend: GPT-Live
 * over WebRTC through `voice/sessions`, every settled turn recorded on the case, every customer
 * turn evaluated by `voice-lab/turns` (model-v1 after the extraction consent). With reports,
 * GPT-Live's background model reads the turn and the turn carries its tool calls; otherwise the
 * backend reads it itself. What it hears arrives as proposal packages; only the customer's
 * acceptance changes the draft.
 *
 * The conversation keeps running across views; it ends on stop, a new session, a language change
 * or a human handover.
 */
@Injectable({ providedIn: 'root' })
export class LiveVoice {
  private readonly env = inject(APP_ENVIRONMENT);
  private readonly customer = inject(CustomerApi);
  private readonly store = inject(CaseStore);
  private readonly api = inject(VoiceLabApi);
  private readonly language = inject(AppLanguage);
  private readonly transloco = inject(TranslocoService);
  private readonly ring = inject(VoiceActivity);
  private emotionSeq = 0;
  private readonly avatarEvents = new Subject<VoiceAvatarEvent>();
  private sessionId: string | null = null;
  private sequence = 0;
  private epoch = 0;
  private destroyed = false;
  private queue: Promise<void> = Promise.resolve();
  /** The session runs GPT-Live's background model (voice/sessions answered reports: true). */
  private reports = false;
  private readonly inbox = new ReportInbox();

  /** Live configuration: accepted automatically, no acceptance card. */
  private readonly liveStart = this.env.liveStart === true;
  readonly personId = signal('');
  /** Voice transfer consent; the extraction consent is separate. */
  readonly consent = signal(false);
  readonly extractionConsent = signal(false);
  readonly busy = signal(false);
  readonly state = signal<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  readonly error = signal<string | null>(null);
  readonly notice = signal('');
  readonly providerAvailable = signal(false);
  readonly extractionNotice = signal<ExtractionNotice | null>(null);
  readonly selectedSkills = signal<readonly string[]>([]);
  readonly promptSettingsReady = signal(false);
  readonly timeBudget = signal(10);
  readonly priority = signal<IntakeFieldId | ''>('');
  readonly dialogue = signal<readonly DialogueLine[]>([]);
  readonly intake = signal(emptyIntakeMemory);
  readonly evaluating = signal(false);
  /** Live build: what the profile still needs after the intake fields; null until loaded. */
  readonly caseAsks = signal<readonly CaseAsk[] | null>(null);
  private readonly askAttempts = signal<Readonly<Record<string, number>>>({});
  /**
   * Live build: the profile question Paxi asks next, once the intake fields are through. One left
   * unanswered goes to the back of the queue, never away: every question comes round again until
   * the profile is complete, and none can block the others.
   */
  readonly caseAsk = computed(() => {
    if (!this.liveStart || nextIntakeField(this.rows()) !== null) return null;
    const asks = this.caseAsks() ?? [],
      attempts = this.askAttempts();
    return asks.reduce<CaseAsk | null>((best, ask) =>
      !best || (attempts[ask.key] ?? 0) < (attempts[best.key] ?? 0) ? ask : best, null);
  });
  /** The dialogue line count when the current profile question became current. */
  private askSince = { key: '', line: 0 };
  /** The remote voice, for the avatar's local audio visual. */
  readonly audio = signal<MediaStream | null>(null);
  /** Activity events for the avatar renderer. */
  readonly events = this.avatarEvents.asObservable();
  private readonly voiceActivity = signal<'idle' | 'listening' | 'thinking'>('idle');

  readonly rows = computed(() => {
    const c = this.store.canonical();
    return c ? intakeRows(c, this.personId(), this.intake()) : [];
  });
  readonly active = computed(() => this.state() === 'connecting' || this.state() === 'connected');
  /** A customer session exists (signed in, or the demo start's session). */
  readonly signedIn = computed(() => !!this.customer.session());
  readonly caseReady = computed(
    () =>
      !!this.customer.session() &&
      this.store.canonical()?.id === this.customer.session()?.caseId,
  );
  /** Persons with financial data: the extraction proposes per person. */
  readonly persons = computed(() => {
    if (!this.caseReady()) return [];
    const financial = this.store.canonical()?.draft.financial?.persons ?? [];
    return (this.store.projection()?.persons ?? []).filter((person) =>
      financial.some((p) => p.id === person.personId),
    );
  });
  readonly validPerson = computed(() =>
    this.persons().some((person) => person.personId === this.personId()),
  );
  /**
   * A live case without test data that has no person yet: the conversation first gives age and
   * employment rate, the backend proposes the person from them (voice-lab/turns without personId).
   */
  readonly setupMode = computed(() => this.caseReady() && this.persons().length === 0);
  /** Paxi may talk: about a known person, or to set up the first one. */
  readonly speakable = computed(() => this.validPerson() || this.setupMode());
  readonly handoverControl = new HandoverControl(this.customer.session, () => {
    const c = this.store.canonical();
    return c ? { caseId: c.id, handover: c.handover } : null;
  });
  readonly handoverActive = this.handoverControl.stopped;
  /** The backend offers GPT-Live together with the model extraction it needs. */
  readonly available = computed(
    () =>
      this.caseReady() &&
      this.providerAvailable() &&
      !!this.extractionNotice()?.enabled &&
      this.promptSettingsReady(),
  );
  /** For the avatar ring: an evaluated turn shows as thinking. */
  readonly activity = computed<AgentActivity>(() => {
    switch (this.state()) {
      case 'idle':
        return 'idle';
      case 'error':
        return 'error';
      case 'connecting':
        return 'thinking';
      case 'connected':
        return this.evaluating()
          ? 'thinking'
          : this.voiceActivity() === 'idle'
            ? 'listening'
            : this.voiceActivity();
    }
  });

  private readonly voice = new PaxiCaseVoice({
    open: async (sdp) => {
      const epoch = this.epoch;
      const c = await this.customer.loadCase(this.caseId());
      if (epoch !== this.epoch) throw new Error('ABORTED');
      const response = await this.api.post<VoiceSessionStartResponse>('voice/sessions', {
        messageId: `start_${crypto.randomUUID()}`,
        expectedCaseRevision: c.caseRevision,
        provider: 'gpt-live',
        locale: c.locale,
        dataClassification: 'synthetic',
        noticeVersion: 'voice-synthetic-v1',
        allowExternalVoiceProcessing: true,
        sdp,
        conversationSettings: {
          skillIds: this.selectedSkills(),
          timeBudgetMinutes: this.timeBudget(),
          priorities: this.priority() ? [this.priority()] : [],
        },
      });
      if (epoch === this.epoch) {
        this.sessionId = response.voiceSession.id;
        this.reports = response.reports === true;
      }
      return response;
    },
    opening: () =>
      'Use the configured persona and assigned conversation skills. Start with a brief invitation to describe their life with work, family and housing, in the configured language. Do not read a form question. Follow their story and the selected priorities.',
    close: (sid) => {
      if (this.sessionId === sid) this.sessionId = null;
      return this.api.post(`voice/sessions/${sid}/close`, { reason: 'customer_closed' });
    },
    onStatus: (state, detail) => {
      this.state.set(state);
      if (detail) this.error.set(detail);
      if (state === 'connected') void this.loadAsks(this.epoch).then(() => this.refreshDelegation(this.epoch));
    },
    onDelegation: (id) => this.inbox.started(id),
    onReport: (id, calls) => this.inbox.finished(id, calls),
    onAudio: (stream) => {
      this.audio.set(stream);
      this.ring.audio.set(stream);
    },
    onEvent: (event) => {
      if (event.type === 'activity') this.voiceActivity.set(event.state);
      // Paxi in the shell shows the emotion; a repeated one counts again (new sequence number).
      else this.ring.emotion.set({ emotion: event.emotion, seq: ++this.emotionSeq });
      this.avatarEvents.next(event);
    },
    onTurn: (speaker, text) => {
      const epoch = this.epoch,
        sid = this.sessionId,
        personId = this.personId();
      if (!sid) return;
      this.append(speaker, text);
      this.queue = this.queue
        .then(async () => {
          if (epoch !== this.epoch || this.destroyed) return;
          const c = await this.customer.loadCase(this.caseId());
          if (epoch !== this.epoch) return;
          const messageId = `turn_${crypto.randomUUID()}`;
          await this.api.post(`voice/sessions/${sid}/turns`, {
            speaker,
            log: {
              schemaVersion: '1.0',
              messageId,
              caseId: c.id,
              correlationId: sid,
              turnId: messageId,
              source: 'voice',
              locale: c.locale,
              text,
              transcriptStatus: 'final',
              dataClassification: 'synthetic',
            },
          });
          if (epoch !== this.epoch) return;
          if (speaker === 'customer') await this.extractLive(sid, messageId, personId, epoch);
          this.store.refresh();
        })
        .catch((error: unknown) => {
          if (epoch === this.epoch) {
            console.warn('[paxi]', { event: 'voice_error', code: 'TURN_ROUTING_FAILED', http: httpFailure(error) });
            this.error.set(errorCode(error) ?? 'TURN_ROUTING_FAILED');
            this.stop();
          }
        });
    },
  });

  constructor() {
    effect(() => this.ring.live.set(this.active() ? this.activity() : null));
    // Paxi in the shell shows his latest line, without loading this chunk.
    effect(() => {
      const said = [...this.dialogue()].reverse().find((line) => line.speaker === 'agent');
      this.ring.caption.set(this.active() && said ? said.text : null);
    });
    effect(() => {
      if (!this.active()) this.ring.emotion.set(null);
    });
    this.store.digitalStops.pipe(takeUntilDestroyed()).subscribe((command) => {
      if (command.reason === 'session-ended') {
        this.handoverControl.synchronizeSession();
        this.stop();
      } else {
        const session = this.customer.session();
        if (session && this.handoverControl.observe(session, command.update)) this.stop();
      }
    });
    this.store.contextUpdates.pipe(takeUntilDestroyed()).subscribe((update) => {
      const session = this.customer.session();
      if (session) this.handoverControl.observe(session, update);
    });
    effect(() => {
      const persons = this.persons();
      if (!persons.some((person) => person.personId === this.personId())) {
        // A person that disappeared ends the call; the first one appearing (setup) continues it.
        if (this.active() && this.personId() !== '') this.stop();
        this.personId.set(persons[0]?.personId ?? '');
      }
    });
    effect(() => {
      // Clarifications and source quotes belong to the selected speaker, not to the whole case.
      this.personId();
      this.intake.set(emptyIntakeMemory);
    });
    // Fires on projection and on memory changes (rows depends on both); updateContext dedupes by
    // value, so no feedback loop.
    effect(() => {
      const rows = this.rows();
      if (this.state() !== 'connected') return;
      if (this.setupMode()) this.voice.updateContext(this.setupSteering());
      else if (rows.length) this.voice.updateContext(this.steer(rows));
    });
    let previousSession = this.customer.session();
    effect(() => {
      const session = this.customer.session();
      this.handoverControl.synchronizeSession();
      if (!session || session !== previousSession) {
        this.stop();
        if (previousSession) {
          this.consent.set(false);
          this.extractionConsent.set(false);
        }
        this.dialogue.set([]);
        this.intake.set(emptyIntakeMemory);
      }
      previousSession = session;
    });
    // The notices and the voice are per language: a new language asks again.
    let locale = this.language.language();
    effect(() => {
      const next = this.language.language();
      if (next === locale) return;
      locale = next;
      this.stop();
      this.consent.set(false);
      this.extractionConsent.set(false);
      void this.loadNotice();
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stop();
    });
  }

  /** The extraction consent settles before any media opens. Callers check the blockers first. */
  async start(): Promise<void> {
    if (this.active()) return;
    const epoch = ++this.epoch,
      notice = this.extractionNotice();
    this.error.set(null);
    this.intake.set(emptyIntakeMemory);
    // Loaded again once connected, in the call's language; every call gets its attempts anew.
    this.caseAsks.set(null);
    this.askAttempts.set({});
    if (notice?.enabled) {
      let granted = false;
      const session = this.currentSession();
      await this.run(async () => {
        const c = await this.readCurrentCase(session);
        await this.forSession(session, () =>
          this.api.post('extraction/consent', {
            expectedCaseRevision: c.caseRevision,
            noticeVersion: notice.version,
            noticeHash: notice.noticeHash,
            dataClassification: 'synthetic',
            allowSyntheticModelExtraction: true,
          }),
        );
        granted = true;
      });
      if (!granted || epoch !== this.epoch) return;
    }
    await this.voice.start();
  }

  stop(): void {
    ++this.epoch;
    this.reports = false;
    this.inbox.clear();
    this.setupReports.clear();
    this.voice.stop();
    this.state.set('idle');
  }

  /** Voice notice, extraction notice and prompt settings for the current language. */
  async loadNotice(): Promise<void> {
    void this.loadExtractionNotice();
    void this.loadPromptSettings();
    try {
      const privacy = await this.api.get<{
        text: string;
        providers: { provider: string; available: boolean }[];
      }>(`voice/privacy?locale=${this.language.language()}`);
      this.notice.set(privacy.text);
      this.providerAvailable.set(
        privacy.providers.some((p) => p.provider === 'gpt-live' && p.available),
      );
    } catch {
      this.providerAvailable.set(false);
      this.error.set('BACKEND_UNAVAILABLE');
    }
  }

  /** One case operation at a time; an expired session clears the sign-in. */
  async run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await work();
    } catch (error) {
      if (error instanceof SupersededCaseOperation) return;
      if (
        error instanceof HttpErrorResponse &&
        (error.status === 401 || error.status === 410 || error.error?.code === 'CSRF_INVALID')
      ) {
        this.customer.clearSession();
        this.store.clear();
        this.error.set(this.liveStart ? errorCode(error) ?? 'SESSION_EXPIRED' : 'SESSION_EXPIRED');
      } else if (this.error() !== 'SESSION_EXPIRED') this.error.set(errorCode(error) ?? 'API_REQUEST_FAILED');
      this.store.refresh();
    } finally {
      this.busy.set(false);
    }
  }

  async readCurrentCase(session = this.currentSession()): Promise<InsuranceCaseDto> {
    try {
      const c = await this.forSession(session, () => this.customer.loadCase(session.caseId));
      if (c.id !== session.caseId) throw new SupersededCaseOperation();
      this.handoverControl.observe(session, { caseId: c.id, handover: c.handover });
      return c;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.customer.clearSession();
        this.store.clear();
        this.error.set(this.liveStart ? errorCode(error) ?? 'SESSION_EXPIRED' : 'SESSION_EXPIRED');
      }
      throw error;
    }
  }

  currentSession(): CustomerSession {
    const session = this.customer.session();
    if (!session) throw new Error('UNAUTHORIZED');
    return session;
  }

  /** A sign-out or a new session in between supersedes the work. */
  async forSession<T>(session: CustomerSession, work: () => Promise<T>): Promise<T> {
    const assertCurrent = () => {
      if (this.destroyed || this.customer.session() !== session)
        throw new SupersededCaseOperation();
    };
    assertCurrent();
    try {
      const value = await work();
      assertCurrent();
      return value;
    } catch (error) {
      assertCurrent();
      throw error;
    }
  }

  /** Only a failed extraction is non-fatal; a vanished session still ends the conversation. */
  private async extractLive(
    sid: string,
    messageId: string,
    personId: string,
    epoch: number,
    replayed?: ReportCall[],
  ): Promise<void> {
    if (!personId) this.setupMessages.push(messageId);
    // The background model's calls for this turn; a setup turn keeps them for its replay.
    const calls = replayed ?? (this.reports ? await this.inbox.take() : undefined);
    if (epoch !== this.epoch) return;
    if (!personId && calls) this.setupReports.set(messageId, calls);
    const asked = nextIntakeField(this.rows()),
      askedKey = this.caseAsk()?.key,
      // Only a question Paxi had the chance to ask counts: an agent line since it became current.
      askedCase = this.dialogue().some((line) => line.speaker === 'agent' && line.id > this.askSince.line)
        ? this.caseAsk()?.key
        : undefined;
    this.evaluating.set(true);
    const post = () =>
      this.api.post<LiveTurnResult>('voice-lab/turns', {
        mode: 'live',
        voiceSessionId: sid,
        messageId,
        // Without a person yet, the backend sets up the case frame from the conversation.
        ...(personId ? { personId } : {}),
        // The profile question Paxi is on: the backend fills that field with this answer, no other.
        ...(personId && askedKey ? { askedKey } : {}),
        ...(calls ? { report: { calls } } : {}),
      });
    try {
      let result: LiveTurnResult;
      try {
        result = await post();
      } catch (error) {
        // A customer accept racing this turn changes revision/draft: read fresh and retry once
        // with the same id, without counting an attempt.
        if (!(
          error instanceof HttpErrorResponse &&
          ['VERSION_CONFLICT', 'STALE_PROPOSAL', 'STALE_CONTEXT'].includes(error.error?.code)
        ))
          throw error;
        this.store.refresh();
        await this.customer.loadCase(this.caseId());
        if (epoch !== this.epoch) return;
        result = await post();
      }
      if (epoch !== this.epoch) return;
      // Live build: after every question and answer, what Paxi heard goes into the case, the case
      // is checked (complete: confirmed and calculated; a failed calculation is retried) and the
      // charts and open questions are reloaded, without a button.
      const proposed = !!(result.extraction.result.proposalBatch || result.extraction.answers?.proposalBatch);
      if (this.liveStart && (personId || proposed)) {
        await this.acceptLive(epoch);
        // The person now exists: what was said before her (income in the same sentence as the
        // age, say) is extracted again for the intake fields.
        if (!personId && proposed) await this.replaySetupTurns(sid, epoch);
        await this.loadAsks(epoch);
      }
      // The background model's tools follow the case: the open fields and the question asked now.
      await this.refreshDelegation(epoch);
      // A profile question still open after its turn counts as one unanswered attempt.
      if (askedCase && this.caseAsks()?.some((ask) => ask.key === askedCase))
        this.askAttempts.update((attempts) => ({ ...attempts, [askedCase]: (attempts[askedCase] ?? 0) + 1 }));
      // A disabled/failing extractor and smalltalk are not answers to a question. In particular,
      // never advance the plan or mark fields skipped on infrastructure errors.
      if (
        !result.extraction.result.issues?.length &&
        (result.extraction.clarifications?.length || result.extraction.request?.observations?.length)
      )
        this.intake.update((memory) => afterCustomerTurn(memory, asked, result.extraction));
    } catch (error) {
      if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 410))
        throw error;
      // The conversation continues; the next turn tries again.
    } finally {
      this.evaluating.set(false);
    }
  }

  /** Customer turns spoken before the case had a person; extracted again once it has one. */
  private setupMessages: string[] = [];
  /** The background model's calls of those turns: the replay sends them again, now with the person. */
  private readonly setupReports = new Map<string, ReportCall[]>();

  private async replaySetupTurns(sid: string, epoch: number): Promise<void> {
    const person = (await this.customer.loadCase(this.caseId())).draft.financial?.persons[0]?.id;
    if (!person || epoch !== this.epoch) return;
    for (const earlier of this.setupMessages.splice(0)) {
      const calls = this.setupReports.get(earlier);
      this.setupReports.delete(earlier);
      await this.extractLive(sid, earlier, person, epoch, calls);
    }
  }

  /** With reports: the background model's tools for the case as it is now, sent to GPT-Live. */
  private async refreshDelegation(epoch: number): Promise<void> {
    if (!this.reports || epoch !== this.epoch) return;
    const asked = this.caseAsk()?.key;
    try {
      const { delegation } = await this.api.getCase<{ delegation: unknown }>(
        `voice-lab/delegation${asked ? `?askedKey=${encodeURIComponent(asked)}` : ''}`,
      );
      if (epoch === this.epoch) this.voice.updateDelegation(delegation);
    } catch {
      // The tools stay as they were; the next turn tries again.
    }
  }

  /** Live build: takes over the open proposals right away (POST demo-accept), then reloads. */
  private async acceptLive(epoch: number): Promise<void> {
    if (epoch !== this.epoch) return;
    try {
      await this.customer.demoAccept(this.caseId());
    } catch (error) {
      // The conversation goes on; the next proposal tries again.
      if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 410)) throw error;
    } finally {
      this.store.refresh();
    }
  }

  /** Live build: the open profile questions, fresh after every acceptance. */
  private async loadAsks(epoch: number): Promise<void> {
    if (!this.liveStart) return;
    try {
      const { asks } = await this.api.getCase<{ asks: CaseAsk[] }>('voice-lab/questions');
      if (epoch === this.epoch) this.caseAsks.set(asks);
    } catch {
      // The last list stays; the next acceptance loads it again.
    }
  }

  private question(id: IntakeFieldId): string {
    return this.transloco.translate(INTAKE_TEXT[id].question);
  }

  /** The short clarification names gross and year, so it only fits income; other fields repeat their own question. */
  /** Until the case knows the person: age and employment rate first, naturally, no form. */
  private setupSteering() {
    return { setup: true, nextQuestion: this.transloco.translate('voice.setup.question'), neverAskAgain: [] };
  }

  private steer(rows: IntakeRow[]) {
    const context = steeringContext(
      rows,
      (id) => this.question(id),
      nextIntakeField(rows) === 'annual_gross_income_chf'
        ? this.transloco.translate('lab.intake.clarify')
        : undefined,
    );
    // Live build: after the intake fields, Paxi asks what the profile still needs (nothing is
    // assumed); done only once the backend has nothing left, so the charts can be calculated.
    if (!this.liveStart || !context.done) return context;
    if (this.caseAsks() === null) return { ...context, done: false };
    const ask = this.caseAsk();
    if ((ask?.key ?? '') !== this.askSince.key) this.askSince = { key: ask?.key ?? '', line: this.sequence };
    // A skipped intake field may come back as a profile question (the backend still needs it).
    const neverAskAgain = rows.filter((r) => r.status === 'proposed' || r.status === 'accepted').map((r) => r.fieldId);
    const analysis = ask ? null : this.analysis();
    return { ...context, neverAskAgain, done: !ask, nextQuestion: ask?.text ?? null, ...(ask?.about ? { nextQuestionMeans: ask.about } : {}),
      ...(analysis ? { analysis } : {}) };
  }

  /** The calculated result, for Paxi to explain itself: the recommended products and key figures. */
  private analysis() {
    const presentation = this.store.canonical()?.presentation;
    const products = (presentation?.recommendations.at(-1)?.candidates ?? []).slice(0, 3)
      .map((c) => ({ product: c.productName, why: c.explanation }));
    const keyFigures = (presentation?.activeRun?.metrics ?? []).filter((m) => m.valueCents !== null).slice(0, 8)
      .map((m) => `${m.label}: ${m.formatted} (${m.periodLabel})`);
    return products.length || keyFigures.length ? { products, keyFigures } : null;
  }

  private append(speaker: DialogueLine['speaker'], text: string): void {
    this.dialogue.update((lines) => [
      ...lines.slice(-39),
      { id: ++this.sequence, speaker, text, origin: 'live' },
    ]);
  }

  private caseId(): string {
    const id = this.customer.session()?.caseId;
    if (!id) throw new Error('UNAUTHORIZED');
    return id;
  }

  /** Live requires model extraction; an unavailable notice must block starting, not silently use rules. */
  private async loadExtractionNotice(): Promise<void> {
    try {
      this.extractionNotice.set(
        await this.api.get(`extraction/privacy?locale=${this.language.language()}`),
      );
    } catch {
      this.extractionNotice.set(null);
    }
  }

  private async loadPromptSettings(): Promise<void> {
    try {
      const settings = await this.api.get<{
        skills: PromptSkill[];
        defaultTimeBudgetMinutes: number;
      }>('voice/settings');
      if (!this.promptSettingsReady()) {
        this.selectedSkills.set(settings.skills.map((skill) => skill.id));
        this.timeBudget.set(settings.defaultTimeBudgetMinutes);
      } else
        this.selectedSkills.update((ids) =>
          ids.filter((id) => settings.skills.some((skill) => skill.id === id)),
        );
      this.promptSettingsReady.set(true);
    } catch {
      this.promptSettingsReady.set(false);
    }
  }
}

/** Work of a former session or a destroyed app; dropped silently. */
class SupersededCaseOperation extends Error {}
