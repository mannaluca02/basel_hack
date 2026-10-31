import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type {
  AdvisorContext,
  ConfirmationTarget,
  CustomerConfirmation,
  InsuranceCaseDto,
  PrivacyNoticeResponse,
  VoiceLog,
} from '@pax/contracts';
import { filter } from 'rxjs';
import { AppLanguage } from '../../i18n/language';
import { AdvisorDataSource } from '../advisor-data-source';
import { CaseStore } from '../store/case-store';
import { CustomerApi } from './customer-api';

/** The assumptions every confirmed profile rests on, in the backend's own wording. */
const PROFILE_ASSUMPTIONS = [
  'assumption.synthetic',
  'assumption.separate',
  'assumption.snapshot',
  'assumption.rounding',
];

export interface ReviewError {
  readonly code: string;
  /** The backend's localized text; `null` when the backend could not be reached at all. */
  readonly message: string | null;
}

export interface ProfileNotice {
  readonly privacy: PrivacyNoticeResponse['display'];
  readonly assumptions: readonly string[];
}

/** Turn and reply of the voice orchestration the question is spoken in. */
export interface VoiceQuestion {
  readonly questionTurnId: string;
  readonly questionReplyId: string;
}

export type ProfileState =
  'pending_acceptance' | 'open_ambiguity' | 'incomplete' | 'ready' | 'confirmed';

/**
 * The customer's view of the shared case: open packages, clarifications and the two separate
 * customer actions. The case service stays the only source of truth, so after every event,
 * reconnect and mutation the state is loaded again rather than patched locally.
 */
@Injectable({ providedIn: 'root' })
export class CustomerReview {
  private readonly api = inject(CustomerApi);
  private readonly store = inject(CaseStore);
  private readonly caseState = signal<InsuranceCaseDto | null>(null);
  private readonly contextState = signal<AdvisorContext | null>(null);
  private readonly confirmationState = signal<CustomerConfirmation | null>(null);
  private readonly noticeState = signal<ProfileNotice | null>(null);
  private readonly errorState = signal<ReviewError | null>(null);
  private readonly invalidatedState = signal(false);
  private readonly outdatedState = signal<ReadonlySet<string>>(new Set());
  private readonly busyState = signal(false);
  /** Only the newest reload may write: an older one can answer last. */
  private reloads = 0;
  private shown: { id: string; profile: boolean; notice: boolean } | null = null;
  private playback: { id: string; playbackId: string } | null = null;
  /** The question already reported as presented, so a re-render cannot report it twice. */
  private reportedQuestion: string | null = null;
  /** Asked for once: a refused change must not repeat with every reload. */
  private requestedLocale: string | null = null;

  readonly signedIn = computed(() => this.api.session() !== null);
  /** False once the stream is gone; the view then only changes with the customer's actions. */
  readonly live = computed(() => this.store.connection() !== 'disconnected');
  readonly current = this.caseState.asReadonly();
  /** The open question, if any; anything already answered or invalidated is not held. */
  readonly confirmation = this.confirmationState.asReadonly();
  /** Loaded for an open profile question: it must be on screen before that question counts. */
  readonly profileNotice = this.noticeState.asReadonly();
  readonly error = this.errorState.asReadonly();
  /** The question on screen was invalidated by the backend and is no longer open. */
  readonly invalidated = this.invalidatedState.asReadonly();
  /** Packages still marked `proposed` that the backend refused as stale. */
  readonly outdated = this.outdatedState.asReadonly();
  readonly busy = this.busyState.asReadonly();

  /** Newest first, including decided ones so the outcome stays visible. */
  readonly batches = computed(() =>
    (this.caseState()?.proposalBatches ?? []).filter((batch) => batch.changes.length).reverse(),
  );
  readonly pendingBatches = computed(() =>
    this.batches().filter(
      (batch) => batch.status === 'proposed' && !this.outdatedState().has(batch.id),
    ),
  );
  /** Server-derived `dialogueStatus`, so an answered clarification is not asked again. */
  readonly openAmbiguities = computed(() =>
    (this.contextState()?.ambiguities ?? []).filter((item) => item.status === 'open'),
  );

  /** A missing `nextQuestion` says nothing here: only a clean confirmed version counts. */
  readonly profileState = computed<ProfileState>(() => {
    const dto = this.caseState();
    if (this.pendingBatches().length) return 'pending_acceptance';
    if (this.openAmbiguities().length) return 'open_ambiguity';
    if (dto && !dto.draftDirty && dto.confirmedVersions.length) return 'confirmed';
    return this.contextState()?.missingFields.length ? 'incomplete' : 'ready';
  });

  /** The draft holds no household yet: a demo persona can fill it. */
  readonly empty = computed(() => this.caseState()?.draft.financial === null);
  /** Analyses for the newest confirmed profile exist. */
  readonly calculated = computed(() => {
    const dto = this.caseState();
    const version = dto?.confirmedVersions?.at(-1)?.version;
    return (dto?.runs ?? []).some((run) => run.profileVersion === version && run.status !== 'stale');
  });

  constructor() {
    const source = inject(AdvisorDataSource);
    const destroyRef = inject(DestroyRef);
    source.events
      .pipe(
        filter((event) => event.type === 'context'),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe(() => void this.refresh());
    // Also on `disconnected`: a refused stream usually means the session is gone, and only a
    // request can tell. It does not reconnect here, that would loop on a stream that keeps failing.
    source.connection
      .pipe(
        filter((state) => state !== 'connecting'),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe(() => void this.refresh());
    void this.refresh();

    const language = inject(AppLanguage).language;
    effect(() => {
      const dto = this.caseState();
      const locale = language();
      if (!dto || dto.locale === locale || this.requestedLocale === locale) return;
      this.requestedLocale = locale;
      untracked(() => void this.act(() => this.api.setLocale(dto.id, locale)));
    });
  }

  signIn(accessCode: string): Promise<void> {
    return this.act(async () => {
      await this.api.signIn(accessCode);
    });
  }

  /** Fills the empty draft with the synthetic Pax persona; it still needs both customer actions. */
  loadPersona(): Promise<void> {
    return this.act(async () => {
      const caseId = this.caseId();
      const { caseRevision } = await this.api.loadCase(caseId);
      await this.api.loadPersona(caseId, caseRevision);
    });
  }

  /** Runs the standard scenarios on the newest confirmed profile. */
  calculate(): Promise<void> {
    return this.act(async () => {
      const caseId = this.caseId();
      const version = (await this.api.loadCase(caseId)).confirmedVersions.at(-1)?.version;
      if (version) await this.api.runStandardAnalyses(caseId, version);
    });
  }

  /**
   * Asks the backend for one bound question on the current state. With `voice` it is spoken;
   * a change voice cannot render comes back as a screen question with the same IDs.
   */
  open(target: ConfirmationTarget, voice?: VoiceQuestion): Promise<void> {
    return this.act(async () => {
      const caseId = this.caseId();
      this.invalidatedState.set(false);
      this.noticeState.set(null);
      try {
        const { caseRevision } = await this.api.loadCase(caseId);
        const ids = voice ?? {
          questionTurnId: `question_turn_${crypto.randomUUID()}`,
          questionReplyId: `question_reply_${crypto.randomUUID()}`,
        };
        const create = (channel: 'voice' | 'screen') =>
          this.api.createConfirmation(caseId, {
            expectedCaseRevision: caseRevision,
            target,
            channel,
            ...ids,
          });
        const question = await create(voice ? 'voice' : 'screen').catch((error: unknown) => {
          if (codeOf(error) === 'VOICE_CONFIRMATION_REQUIRES_SCREEN') return create('screen');
          throw error;
        });
        this.confirmationState.set(question);
      } catch (error) {
        if (target.kind === 'accept_batch' && codeOf(error) === 'STALE_PROPOSAL') {
          this.outdatedState.update((ids) => new Set(ids).add(target.batchId));
        }
        throw error;
      }
    });
  }

  /** Call only once the question is really on screen: the backend takes this client's word. */
  async reviewDisplayed(shown: { profile: boolean; notice: boolean }): Promise<void> {
    const question = this.confirmationState();
    if (!question) return;
    this.shown = { id: question.id, ...shown };
    await this.reportPresented();
  }

  /** The real TTS `ended` callback. An interrupted playback must not end up here. */
  async playbackEnded(playbackId: string): Promise<void> {
    const question = this.confirmationState();
    if (question?.channel !== 'voice') return;
    this.playback = { id: question.id, playbackId };
    await this.reportPresented();
  }

  /** A final answer that was created for the open question; any other is never re-attached. */
  async answerVoice(voiceLog: VoiceLog): Promise<void> {
    const question = this.confirmationState();
    if (
      question?.channel !== 'voice' ||
      question.status !== 'awaiting_answer' ||
      voiceLog.correlationId !== question.questionId
    ) {
      return;
    }
    await this.act(async () => {
      await this.api.answerConfirmation(question.caseId, question.id, {
        ...binding(question),
        channel: 'voice',
        voiceLog,
      });
      this.confirmationState.set(null);
    });
  }

  /** The answer to the open screen question. Never repeated: the reload shows what happened. */
  async decide(decision: 'accept' | 'reject'): Promise<void> {
    const question = this.confirmationState();
    if (!question || this.busyState()) return;
    await this.act(async () => {
      await this.api.answerConfirmation(question.caseId, question.id, {
        ...binding(question),
        channel: 'screen',
        decision,
        answerMessageId: `answer_${crypto.randomUUID()}`,
      });
      this.confirmationState.set(null);
    });
  }

  /**
   * Withdraws the open question. Unlike a rejection this leaves its package open. Resolves to
   * whether no question is open any more; on `false` the conversation must not move on.
   */
  async cancel(reason: 'new_question' | 'cancelled_by_customer'): Promise<boolean> {
    const question = this.confirmationState();
    if (!question) return true;
    await this.act(async () => {
      await this.api.cancelConfirmation(question.caseId, question.id, {
        expectedCaseRevision: question.basisCaseRevision,
        reason,
      });
      this.confirmationState.set(null);
    });
    return this.confirmationState() === null;
  }

  private async reportPresented(): Promise<void> {
    const question = this.confirmationState();
    if (question?.status !== 'awaiting_presentation') return;
    const shown = this.shown?.id === question.id ? this.shown : null;
    const playback = this.playback?.id === question.id ? this.playback : null;
    if (!shown || (question.channel === 'voice' && !playback)) return;
    if (this.reportedQuestion === question.id) return;
    this.reportedQuestion = question.id;
    await this.act(async () => {
      this.confirmationState.set(
        await this.api.confirmationPresented(question.caseId, question.id, {
          ...binding(question),
          reviewDisplayed: true,
          profileAndAssumptionsDisplayed: shown.profile,
          privacyNoticeDisplayed: shown.notice,
          ...(playback ? { playback: { playbackId: playback.playbackId, event: 'ended' } } : {}),
        }),
      );
    });
  }

  private caseId(): string {
    const caseId = this.api.session()?.caseId;
    if (!caseId) throw new Error('CustomerReview: no customer session');
    return caseId;
  }

  private async refresh(): Promise<void> {
    const session = this.api.session();
    if (!session) return;
    const caseId = session.caseId;
    const reload = ++this.reloads;
    try {
      const [dto, context, confirmation] = await Promise.all([
        this.api.loadCase(caseId),
        this.api.loadContext(caseId),
        this.api.currentConfirmation(caseId),
      ]);
      if (reload !== this.reloads || this.api.session() !== session) return;
      this.caseState.set(dto);
      this.contextState.set(context);
      this.hold(confirmation);
    } catch (error) {
      if (reload === this.reloads && this.api.session() === session) this.fail(error);
    }
  }

  private hold(confirmation: CustomerConfirmation | null): void {
    const held = this.confirmationState();
    if (held?.id === confirmation?.id && confirmation?.status === 'invalidated') {
      this.invalidatedState.set(true);
    }
    const open = confirmation && isOpen(confirmation) ? confirmation : null;
    this.confirmationState.set(open);
    if (open?.target.kind === 'confirm_profile' && !this.noticeState()) {
      this.loadNotice().catch((error: unknown) => this.fail(error));
    }
  }

  private async loadNotice(): Promise<void> {
    const [{ display }, messages] = await Promise.all([this.api.privacy(), this.api.messages()]);
    this.noticeState.set({
      privacy: display,
      assumptions: PROFILE_ASSUMPTIONS.map((key) => messages[key]),
    });
  }

  /** Every mutation ends on the central state, also a failed one whose outcome is unknown. */
  private async act(work: () => Promise<void>): Promise<void> {
    this.busyState.set(true);
    this.errorState.set(null);
    try {
      await work();
    } catch (error) {
      this.fail(error);
    } finally {
      this.busyState.set(false);
      this.store.connect();
      // A stream may stay open (or reconnect) without delivering a notification. Also reload
      // after failed commands: the server may have committed before the response was lost.
      this.store.refresh();
      await this.refresh();
    }
  }

  private fail(error: unknown): void {
    const code = codeOf(error) ?? 'TRANSPORT';
    const message = error instanceof HttpErrorResponse ? (error.error?.message ?? null) : null;
    this.errorState.set({ code, message });
    if (code === 'UNAUTHORIZED' || code === 'CSRF_INVALID') this.endSession();
  }

  /** The customer signs in again; nothing of the old session stays on screen. */
  private endSession(): void {
    this.api.clearSession();
    this.store.clear();
    this.caseState.set(null);
    this.contextState.set(null);
    this.confirmationState.set(null);
    this.noticeState.set(null);
  }
}

function codeOf(error: unknown): string | undefined {
  return error instanceof HttpErrorResponse ? error.error?.code : undefined;
}

function isOpen({ status }: CustomerConfirmation): boolean {
  return status === 'awaiting_presentation' || status === 'awaiting_answer';
}

function binding(question: CustomerConfirmation) {
  return {
    expectedCaseRevision: question.basisCaseRevision,
    questionId: question.questionId,
    questionHash: question.questionHash,
    questionTurnId: question.questionTurnId,
    questionReplyId: question.questionReplyId,
  };
}
