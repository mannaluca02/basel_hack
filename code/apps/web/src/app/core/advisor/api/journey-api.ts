import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CustomerSummary,
  DemoApplication,
  DemoQuote,
  PortalDto,
  SuitabilityAnswers,
  SuitabilityCheck,
  SuitabilityView,
  SummaryBundle,
} from '@pax/contracts';
import { firstValueFrom } from 'rxjs';
import { APP_ENVIRONMENT } from '../../config/app-environment';
import { CustomerApi } from './customer-api';

export type Recommendation = CustomerSummary['recommendations'][number];
export type FeedbackStage = 'advice' | 'recommendation' | 'portal';

/** What the simulated Pax review of the demo did (POST demo-review). */
export interface DemoReviewResult {
  readonly adviceApproved: boolean;
  readonly applicationsAccepted: readonly string[];
  readonly policiesIssued: readonly string[];
  readonly simulated: true;
}

/** Aggregate funnel signals and NPS for product management; no amounts, no free text. */
export interface Insights {
  readonly caseCount: number;
  readonly currentStageCounts: Readonly<Record<string, number>>;
  readonly potentialDropoffs: Readonly<Record<string, number>>;
  readonly dropoffDefinition: string;
  readonly blockingReasons: Readonly<Record<string, number>>;
  readonly humanHandover: { readonly requested: number };
  readonly nps: { readonly responses: number; readonly score: number | null };
}

/**
 * The backend's journey after the advice: recommendation → (suitability) → demo quote → demo
 * application → submission → Pax review → demo policy in the portal, plus NPS, the customer
 * dossier and the product documents. Every command carries the case revision and a fresh
 * idempotency key; the backend refuses a stale one and the caller reloads.
 */
@Injectable({ providedIn: 'root' })
export class JourneyApi {
  private readonly http = inject(HttpClient);
  private readonly customer = inject(CustomerApi);
  private readonly base = inject(APP_ENVIRONMENT).apiBaseUrl;

  summaries(caseId: string): Promise<SummaryBundle> {
    return this.customer.loadSummaries(caseId);
  }

  portal(caseId: string): Promise<PortalDto> {
    return firstValueFrom(this.http.get<PortalDto>(`${this.caseUrl(caseId)}/portal`));
  }

  suitability(caseId: string): Promise<SuitabilityView> {
    return this.customer.loadSuitability(caseId);
  }

  async quote(
    caseId: string,
    recommendationId: string,
    candidateIds: readonly string[],
  ): Promise<DemoQuote> {
    return this.command<DemoQuote>(caseId, 'demo-quotes', {
      recommendationId,
      selectedCandidateIds: candidateIds,
      informationDocumentsAcknowledged: false,
    });
  }

  /** The customer read every product document of the quote. */
  async apply(caseId: string, quote: DemoQuote): Promise<DemoApplication> {
    return this.command<DemoApplication>(caseId, 'demo-applications', {
      quoteId: quote.id,
      informationDocumentsAcknowledged: true,
      acknowledgedDocumentIds: quote.documents.map((d) => d.id),
    });
  }

  async submit(
    caseId: string,
    application: DemoApplication,
    quote: DemoQuote,
  ): Promise<DemoApplication> {
    return this.command<DemoApplication>(caseId, 'demo-applications/submit', {
      applicationId: application.id,
      informationDocumentsAcknowledged: true,
      acknowledgedDocumentIds: quote.documents.map((d) => d.id),
    });
  }

  /** Demo start only: the Pax specialist's review, simulated by the backend. */
  demoReview(caseId: string): Promise<DemoReviewResult> {
    return this.post<DemoReviewResult>(`${this.caseUrl(caseId)}/demo-review`, {});
  }

  async checkSuitability(
    caseId: string,
    productId: SuitabilityCheck['productId'],
    personId: string,
    answers: SuitabilityAnswers,
  ): Promise<SuitabilityCheck> {
    const { caseRevision } = await this.customer.loadCase(caseId);
    return this.post<SuitabilityCheck>(`${this.caseUrl(caseId)}/suitability`, {
      expectedCaseRevision: caseRevision,
      productId,
      personId,
      answers,
      answersConfirmedByCustomer: true,
    });
  }

  feedback(caseId: string, stage: FeedbackStage, score: number): Promise<unknown> {
    return this.post(`${this.caseUrl(caseId)}/feedback`, { stage, score });
  }

  /** Demo start only: the reviewer's aggregate, for product management. */
  insights(): Promise<Insights> {
    return firstValueFrom(this.http.get<Insights>(`${this.base}/demo/insights`));
  }

  /** The customer's advice dossier as escaped print HTML from the backend. */
  dossierHtml(caseId: string): Promise<string> {
    return firstValueFrom(
      this.http.get(`${this.caseUrl(caseId)}/dossier?audience=customer&format=html`, {
        responseType: 'text',
      }),
    );
  }

  documentUrl(caseId: string, documentId: string): string {
    return `${this.caseUrl(caseId)}/documents/${encodeURIComponent(documentId)}`;
  }

  private async command<T>(
    caseId: string,
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const { caseRevision } = await this.customer.loadCase(caseId);
    return this.post<T>(`${this.caseUrl(caseId)}/${path}`, {
      expectedCaseRevision: caseRevision,
      idempotencyKey: crypto.randomUUID(),
      demoAcknowledged: true,
      ...body,
    });
  }

  private post<T>(url: string, body: unknown): Promise<T> {
    return firstValueFrom(
      this.http.post<T>(url, body, {
        headers: { 'X-CSRF-Token': this.customer.session()?.csrfToken ?? '' },
      }),
    );
  }

  private caseUrl(caseId: string): string {
    return `${this.base}/cases/${encodeURIComponent(caseId)}`;
  }
}
