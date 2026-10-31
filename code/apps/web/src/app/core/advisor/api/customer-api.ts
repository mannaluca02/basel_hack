import { HttpClient } from '@angular/common/http';
import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import type {
  AdvisorContext,
  AnswerConfirmationInput,
  CancelConfirmationInput,
  ConfirmationOutcome,
  CreateConfirmationInput,
  CustomerConfirmation,
  InsuranceCaseDto,
  PresentConfirmationInput,
  PrivacyNoticeResponse,
  SessionResponse,
} from '@pax/contracts';
import { firstValueFrom } from 'rxjs';
import { APP_ENVIRONMENT } from '../../config/app-environment';
import { CONSENT_NOTICE_VERSION, sessionStorageOf } from '../../consent/consent';
import { AppLanguage, Language } from '../../i18n/language';

export const CUSTOMER_SESSION_KEY = 'pax.customer-session';

/** The conversation length the backend paces its questions by; nothing in the UI sets it yet. */
const TIME_BUDGET_MINUTES = 30;

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
