import { HttpClient } from '@angular/common/http';
import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import type {
  AdvisorContext,
  AgentAccessResponse,
  AnswerConfirmationInput,
  CancelConfirmationInput,
  ConfirmationOutcome,
  CreateConfirmationInput,
  CustomerConfirmation,
  HumanHandoverView,
  InsuranceCaseDto,
  PresentConfirmationInput,
  PrivacyNoticeResponse,
  SessionResponse,
  SummaryBundle as CaseSummaries,
  SuitabilityView,
  VoiceSession,
  VoiceTranscript,
} from '@pax/contracts';
import { firstValueFrom } from 'rxjs';
import { APP_ENVIRONMENT } from '../../config/app-environment';
import { CONSENT_NOTICE_VERSION, sessionStorageOf } from '../../consent/consent';
import { AppLanguage, Language } from '../../i18n/language';
import type { AgentTurn } from './summary-projection';

export const CUSTOMER_SESSION_KEY = 'pax.customer-session';

/** The conversation length the backend paces its questions by; nothing in the UI sets it yet. */
const TIME_BUDGET_MINUTES = 30;

/** How many of the latest live voice sessions the Chat tab shows. */
const VOICE_SESSIONS_SHOWN = 3;

/** The backend's separate notice for external voice processing. */
export interface VoicePrivacyNotice {
  readonly version: string;
  readonly enabled: boolean;
  /** In the language of the request. */
  readonly text: string;
}

export interface CustomerSession {
  readonly csrfToken: string;
  readonly caseId: string;
}

/**
 * Customer session and routes of the shared case service. The session itself is the HttpOnly
 * cookie the backend sets, which also proves who an EventSource belongs to. Every sign-in is a new
 * owner with a new case, so the CSRF token and the case are kept in the tab to survive a reload.
 * The session token in the login response is deliberately dropped.
 */
@Injectable({ providedIn: 'root' })
export class CustomerApi {
  private readonly http = inject(HttpClient);
  private readonly language = inject(AppLanguage);
  private readonly base = inject(APP_ENVIRONMENT).apiBaseUrl;
  private readonly storage = sessionStorageOf(inject(DOCUMENT));
  private readonly sessionState = signal(this.readStored());

  readonly session = this.sessionState.asReadonly();

  async signIn(accessCode: string): Promise<void> {
    const { csrfToken } = await firstValueFrom(
      this.http.post<SessionResponse>(`${this.base}/sessions`, { accessCode }),
    );
    const caseId = await this.createCase(csrfToken);
    this.keep({ csrfToken, caseId });
  }

  /** Demo start: the backend's ready synthetic case, without an access code. */
  async startDemo(fresh = false): Promise<void> {
    const { csrfToken, caseId } = await firstValueFrom(
      this.http.post<CustomerSession>(`${this.base}/demo/start`, {
        locale: this.language.language(),
        fresh,
      }),
    );
    this.keep({ csrfToken, caseId });
  }

  clearSession(): void {
    this.sessionState.set(null);
    try {
      this.storage?.removeItem(CUSTOMER_SESSION_KEY);
    } catch {
      // Nothing was stored then.
    }
  }

  eventsUrl(caseId: string): string {
    return `${this.caseUrl(caseId)}/advisor/events`;
  }

  loadCase(caseId: string): Promise<InsuranceCaseDto> {
    return firstValueFrom(this.http.get<InsuranceCaseDto>(this.caseUrl(caseId)));
  }

  loadContext(caseId: string): Promise<AdvisorContext> {
    return firstValueFrom(this.http.get<AdvisorContext>(`${this.caseUrl(caseId)}/advisor/context`));
  }

  /** Customer and advisor projection of one snapshot, in the case's language. */
  loadSummaries(caseId: string): Promise<CaseSummaries> {
    return firstValueFrom(this.http.get<CaseSummaries>(`${this.caseUrl(caseId)}/summaries`));
  }

  /** Suitability pre-checks for fund-linked products (Pax form 0054, not binding). */
  loadSuitability(caseId: string): Promise<SuitabilityView> {
    return firstValueFrom(this.http.get<SuitabilityView>(`${this.caseUrl(caseId)}/suitability`));
  }

  /** The call history a linked voice agent recorded. */
  loadAgentTurns(caseId: string): Promise<readonly AgentTurn[]> {
    return firstValueFrom(
      this.http.get<{ turns: AgentTurn[] }>(`${this.caseUrl(caseId)}/voice/agent-turns`),
    ).then(({ turns }) => turns);
  }

  /**
   * The finished turns of the app's own live voice (backend voice sessions), oldest first. Only
   * the latest sessions with turns are read: the Chat tab shows the recent conversation.
   */
  async loadVoiceTurns(caseId: string): Promise<readonly AgentTurn[]> {
    const { sessions } = await firstValueFrom(
      this.http.get<{ sessions: VoiceSession[] }>(`${this.caseUrl(caseId)}/voice/sessions`),
    );
    const recent = sessions
      .filter((session) => session.turnCount > 0)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-VOICE_SESSIONS_SHOWN);
    const transcripts = await Promise.all(
      recent.map((session) =>
        firstValueFrom(
          this.http.get<VoiceTranscript>(
            `${this.caseUrl(caseId)}/voice/sessions/${encodeURIComponent(session.id)}/transcript`,
          ),
        ),
      ),
    );
    return transcripts.flatMap(({ voiceSession, turns }) =>
      turns.map((turn) => ({
        messageId: turn.log.messageId,
        conversationId: voiceSession.id,
        speaker: turn.speaker,
        text: turn.log.text,
        at: turn.receivedAt,
      })),
    );
  }

  /**
   * Demo start only: accepts the open proposal packages, confirms the profile and recalculates
   * the standard scenarios. The demo has no review stand, so this is the customer's acceptance.
   */
  demoAccept(caseId: string): Promise<unknown> {
    return this.post(`${this.caseUrl(caseId)}/demo-accept`, {});
  }

  loadHandover(caseId: string): Promise<HumanHandoverView> {
    return firstValueFrom(this.http.get<HumanHandoverView>(`${this.caseUrl(caseId)}/handover`));
  }

  /** `request` stops voice, AI and graphics work and asks for a human advisor; `resume` returns. */
  async handover(caseId: string, action: 'request' | 'resume'): Promise<HumanHandoverView> {
    const { caseRevision } = await this.loadCase(caseId);
    return this.post(`${this.caseUrl(caseId)}/handover`, {
      action,
      messageId: `handover_${crypto.randomUUID()}`,
      expectedCaseRevision: caseRevision,
      source: 'ui',
    });
  }

  /** The backend answers and asks in the case's language. Invalidates an open question. */
  setLocale(caseId: string, locale: Language): Promise<void> {
    return firstValueFrom(
      this.http.patch<void>(
        `${this.caseUrl(caseId)}/preferences`,
        { locale },
        { headers: { 'X-CSRF-Token': this.session()?.csrfToken ?? '' } },
      ),
    );
  }

  /** Loads a synthetic Pax persona as an unconfirmed draft. */
  loadPersona(caseId: string, expectedCaseRevision: number): Promise<InsuranceCaseDto> {
    return this.post(`${this.caseUrl(caseId)}/demo-profile`, { persona: 'mueller', expectedCaseRevision });
  }

  /** Runs the standard scenarios of the confirmed profile and derives the recommendation. */
  runStandardAnalyses(caseId: string, expectedProfileVersion: number): Promise<unknown> {
    return this.post(`${this.caseUrl(caseId)}/standard-analyses`, { expectedProfileVersion });
  }

  /** A 15-minute grant for an agent acting on this case; hand it on, never keep or show it. */
  agentAccess(caseId: string): Promise<AgentAccessResponse> {
    return this.post(`${this.caseUrl(caseId)}/agent-access`, {});
  }

  voicePrivacy(): Promise<VoicePrivacyNotice> {
    return firstValueFrom(
      this.http.get<VoicePrivacyNotice>(`${this.base}/voice/privacy`, {
        params: { locale: this.language.language() },
      }),
    );
  }

  privacy(): Promise<PrivacyNoticeResponse> {
    return firstValueFrom(this.http.get<PrivacyNoticeResponse>(`${this.base}/privacy`));
  }

  /** The backend's own wording, in the language of the request. */
  async messages(): Promise<Readonly<Record<string, string>>> {
    const catalog = await firstValueFrom(
      this.http.get<{ messages: Record<string, string> }>(`${this.base}/translations`),
    );
    return catalog.messages;
  }

  currentConfirmation(caseId: string): Promise<CustomerConfirmation | null> {
    return firstValueFrom(
      this.http.get<{ confirmation: CustomerConfirmation | null }>(
        `${this.confirmationsUrl(caseId)}/current`,
      ),
    ).then(({ confirmation }) => confirmation);
  }

  createConfirmation(
    caseId: string,
    input: CreateConfirmationInput,
  ): Promise<CustomerConfirmation> {
    return this.post(this.confirmationsUrl(caseId), input);
  }

  confirmationPresented(
    caseId: string,
    confirmationId: string,
    input: PresentConfirmationInput,
  ): Promise<CustomerConfirmation> {
    return this.post(`${this.confirmationsUrl(caseId)}/${confirmationId}/presented`, input);
  }

  answerConfirmation(
    caseId: string,
    confirmationId: string,
    input: AnswerConfirmationInput,
  ): Promise<ConfirmationOutcome> {
    return this.post(`${this.confirmationsUrl(caseId)}/${confirmationId}/answer`, input);
  }

  cancelConfirmation(
    caseId: string,
    confirmationId: string,
    input: CancelConfirmationInput,
  ): Promise<CustomerConfirmation> {
    return this.post(`${this.confirmationsUrl(caseId)}/${confirmationId}/cancel`, input);
  }

  private async createCase(csrfToken: string): Promise<string> {
    const created = await this.post<InsuranceCaseDto>(
      `${this.base}/cases`,
      {
        locale: this.language.language(),
        timeBudgetMinutes: TIME_BUDGET_MINUTES,
        noticeVersion: CONSENT_NOTICE_VERSION,
        dataClassification: 'synthetic',
      },
      csrfToken,
    );
    return created.id;
  }

  private post<T>(url: string, body: unknown, csrfToken = this.session()?.csrfToken): Promise<T> {
    return firstValueFrom(
      this.http.post<T>(url, body, { headers: { 'X-CSRF-Token': csrfToken ?? '' } }),
    );
  }

  private caseUrl(caseId: string): string {
    return `${this.base}/cases/${encodeURIComponent(caseId)}`;
  }

  private confirmationsUrl(caseId: string): string {
    return `${this.caseUrl(caseId)}/customer-confirmations`;
  }

  private keep(session: CustomerSession): void {
    this.sessionState.set(session);
    try {
      this.storage?.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(session));
    } catch {
      // Not persisted; the session then lasts until the next reload.
    }
  }

  private readStored(): CustomerSession | null {
    try {
      const stored = this.storage?.getItem(CUSTOMER_SESSION_KEY);
      return stored ? (JSON.parse(stored) as CustomerSession) : null;
    } catch {
      return null;
    }
  }
}
