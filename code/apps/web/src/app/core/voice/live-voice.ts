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
import { LabTrace } from './lab-trace';
import { PaxiCaseVoice } from './paxi-case-voice';
import { VoiceActivity } from './voice-activity';
import { VoiceLabApi } from './voice-lab-api';

interface LiveTurnResult {
  mode: 'synthetic' | 'live';
  source: { text: string };
  extraction: TurnExtraction & {
    adapter: string;
    route: string;
    result: { proposalBatch?: unknown; issues?: { code: string }[] };
  };
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
type VoiceAvatarEvent = { type: 'activity'; state: 'idle' | 'listening' | 'thinking' };

/**
 * Earnie's live voice over the case backend, shared by the app and the Voice Lab (debug): GPT-Live
 * over WebRTC through `voice/sessions`, every settled turn recorded on the case, every customer
 * turn evaluated by `voice-lab/turns` (model-v1 after the extraction consent). What it hears
 * arrives as proposal packages; only the customer's acceptance changes the draft.
 *
 * The conversation keeps running across views; it ends on stop, a new session, a language change
 * or a human handover.
 */
@Injectable({ providedIn: 'root' })
export class LiveVoice {
  private readonly env = inject(APP_ENVIRONMENT);
  private readonly customer = inject(CustomerApi);
  private readonly store = inject(CaseStore);
  private readonly trace = inject(LabTrace);
  private readonly api = inject(VoiceLabApi);
  private readonly language = inject(AppLanguage);
  private readonly transloco = inject(TranslocoService);
  private readonly avatarEvents = new Subject<VoiceAvatarEvent>();
  private sessionId: string | null = null;
  private sequence = 0;
  private epoch = 0;
  private destroyed = false;
  private queue: Promise<void> = Promise.resolve();

  readonly apiMode = this.env.dataSource === 'api';
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
  readonly promptSkills = signal<readonly PromptSkill[]>([]);
  readonly selectedSkills = signal<readonly string[]>([]);
  readonly promptSettingsReady = signal(false);
  readonly timeBudget = signal(10);
  readonly priority = signal<IntakeFieldId | ''>('');
  readonly dialogue = signal<readonly DialogueLine[]>([]);
  readonly intake = signal(emptyIntakeMemory);
  readonly evaluating = signal(false);
  readonly extractionFailed = signal(false);
  readonly latestExtraction = signal<LiveTurnResult['extraction'] | null>(null);
  readonly latestSource = signal('');
  /** The remote voice, for the avatar's local audio visual. */
  readonly audio = signal<MediaStream | null>(null);
  /** Activity events for the avatar renderer. */
  readonly events = this.avatarEvents.asObservable();
  private readonly voiceActivity = signal<VoiceAvatarEvent['state']>('idle');

  readonly rows = computed(() => {
    const c = this.store.canonical();
    return c ? intakeRows(c, this.personId(), this.intake()) : [];
  });
  readonly active = computed(() => this.state() === 'connecting' || this.state() === 'connected');
  readonly caseReady = computed(
    () =>
      this.apiMode &&
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
      if (epoch === this.epoch) this.sessionId = response.voiceSession.id;
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
    },
    onAudio: (stream) => {
      this.audio.set(stream);
      this.trace.add('local', 'avatar output-energy visualization', {
        enabled: stream !== null,
        signal: 'local heuristic',
        playbackEvidence: false,
      });
    },
    onEvent: (event) => {
      this.voiceActivity.set(event.state);
      this.avatarEvents.next(event);
    },
    onTrace: (direction, payload) => this.trace.add(direction, 'GPT-Live data channel', payload),
    onTurn: (speaker, text, segmentation) => {
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
          this.trace.add('local', 'transcript segmentation', { segmentation, speaker, messageId });
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
        .catch(() => {
          if (epoch === this.epoch) {
            this.error.set('TURN_ROUTING_FAILED');
            this.stop();
          }
        });
    },
  });

  constructor() {
    const ring = inject(VoiceActivity);
    effect(() => ring.live.set(this.active() ? this.activity() : null));
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
      this.trace.add('receive', 'SSE advisor.context.updated', update);
    });
    effect(() => {
      const persons = this.persons();
      if (!persons.some((person) => person.personId === this.personId())) {
        if (this.active()) this.stop();
        this.personId.set(persons[0]?.personId ?? '');
      }
    });
    effect(() => {
      // Clarifications and source quotes belong to the selected speaker, not to the whole case.
      this.personId();
      this.intake.set(emptyIntakeMemory);
      this.latestExtraction.set(null);
      this.latestSource.set('');
      this.extractionFailed.set(false);
    });
    // Fires on projection and on memory changes (rows depends on both); updateContext dedupes by
    // value, so no feedback loop.
    effect(() => {
      const rows = this.rows();
      if (this.state() === 'connected' && rows.length) this.voice.updateContext(this.steer(rows));
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
        this.latestExtraction.set(null);
        this.latestSource.set('');
        this.intake.set(emptyIntakeMemory);
        this.extractionFailed.set(false);
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
      if (this.apiMode) void this.loadNotice();
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
        this.error.set('SESSION_EXPIRED');
      } else if (this.error() !== 'SESSION_EXPIRED') this.error.set('API_REQUEST_FAILED');
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
        this.error.set('SESSION_EXPIRED');
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
  ): Promise<void> {
    const asked = nextIntakeField(this.rows());
    this.evaluating.set(true);
    this.extractionFailed.set(false);
    const post = () =>
      this.api.post<LiveTurnResult>('voice-lab/turns', {
        mode: 'live',
        voiceSessionId: sid,
        messageId,
        personId,
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
      this.extracted(result);
      // A disabled/failing extractor and smalltalk are not answers to a question. In particular,
      // never advance the plan or mark fields skipped on infrastructure errors.
      if (result.extraction.result.issues?.length) this.extractionFailed.set(true);
      else if (
        result.extraction.clarifications?.length ||
        result.extraction.request?.observations?.length
      )
        this.intake.update((memory) => afterCustomerTurn(memory, asked, result.extraction));
    } catch (error) {
      if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 410))
        throw error;
      if (epoch !== this.epoch) return;
      this.trace.add('local', 'voice-lab/turns', {
        code: 'EXTRACTION_FAILED',
        conversationContinues: true,
      });
      this.extractionFailed.set(true);
    } finally {
      this.evaluating.set(false);
    }
  }

  private question(id: IntakeFieldId): string {
    return this.transloco.translate(INTAKE_TEXT[id].question);
  }

  /** The short clarification names gross and year, so it only fits income; other fields repeat their own question. */
  private steer(rows: IntakeRow[]) {
    return steeringContext(
      rows,
      (id) => this.question(id),
      nextIntakeField(rows) === 'annual_gross_income_chf'
        ? this.transloco.translate('lab.intake.clarify')
        : undefined,
    );
  }

  private extracted(result: LiveTurnResult): void {
    this.extractionFailed.set(false);
    this.latestExtraction.set(result.extraction);
    this.latestSource.set(result.source.text);
    this.trace.add('local', result.extraction.route, {
      adapter: result.extraction.adapter,
      request: result.extraction.request,
      result: result.extraction.result,
    });
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
      this.promptSkills.set(settings.skills);
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
