import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { CustomerSummary, PortalDto, SuitabilityCheck, SuitabilityView } from '@pax/contracts';
import { CustomerApi } from '../../core/advisor/api/customer-api';
import { FeedbackStage, JourneyApi, Recommendation } from '../../core/advisor/api/journey-api';
import { CaseStore } from '../../core/advisor/store/case-store';
import { APP_ENVIRONMENT } from '../../core/config/app-environment';
import { LocaleFormat } from '../../core/i18n/locale-format';
import { NpsCard } from './nps-card';
import { SuitabilityForm } from './suitability-form';

type Step =
  | 'locked'
  | 'none'
  | 'review'
  | 'select'
  | 'quote'
  | 'application'
  | 'submitted'
  | 'needsInformation'
  | 'declined'
  | 'policy';
type Candidate = Recommendation['candidates'][number];
type Quote = PortalDto['quotes'][number];

/** The five stages on screen; translation keys in full for the i18n check. */
const STAGES = [
  { id: 'recommendation', label: 'journey.steps.recommendation' },
  { id: 'quote', label: 'journey.steps.quote' },
  { id: 'application', label: 'journey.steps.application' },
  { id: 'review', label: 'journey.steps.review' },
  { id: 'policy', label: 'journey.steps.policy' },
] as const;
const STAGE_OF: Readonly<Record<Step, number>> = {
  locked: 0,
  none: 0,
  review: 0,
  select: 0,
  quote: 1,
  application: 2,
  submitted: 3,
  needsInformation: 3,
  declined: 3,
  policy: 4,
};

/** Own words for the refusals a customer can run into; other codes show the backend's text. */
const ERRORS: Readonly<Record<string, string>> = {
  PERSONAL_FUNDS_NOT_SUPPORTED_BY_OWN_RESOURCES:
    'journey.errors.PERSONAL_FUNDS_NOT_SUPPORTED_BY_OWN_RESOURCES',
  PERSONAL_AFFORDABILITY_NOT_ESTABLISHED: 'journey.errors.PERSONAL_AFFORDABILITY_NOT_ESTABLISHED',
  HOUSEHOLD_AFFORDABILITY_NOT_ESTABLISHED: 'journey.errors.HOUSEHOLD_AFFORDABILITY_NOT_ESTABLISHED',
  ALTERNATIVE_PRODUCTS_CANNOT_BE_STACKED: 'journey.errors.ALTERNATIVE_PRODUCTS_CANNOT_BE_STACKED',
  SUITABILITY_CHECK_REQUIRED: 'journey.errors.SUITABILITY_CHECK_REQUIRED',
  SUITABILITY_ADVISED_AGAINST: 'journey.errors.SUITABILITY_ADVISED_AGAINST',
  QUOTE_EXPIRED: 'journey.errors.QUOTE_EXPIRED',
  HUMAN_REVIEW_REQUIRED: 'journey.errors.HUMAN_REVIEW_REQUIRED',
};

/** Fund-linked and capitalisation products: the suitability pre-check comes first. */
const QUALIFIED = new Set<string>(['pax_fondsstar', 'pax_lifestar', 'pax_payout']);
/** Product of each document (backend DOCUMENTS) and its kind. */
const DOCUMENT_PRODUCT: Readonly<Record<string, string>> = {
  term: 'pax_term_life',
  disability: 'pax_disability',
  pax3a: 'pax_3a',
  fondsstar: 'pax_fondsstar',
  lifestar: 'pax_lifestar',
  child: 'pax_child',
  payout: 'pax_payout',
};
const DOCUMENT_KIND: Readonly<Record<string, string>> = {
  terms: 'journey.document.terms',
  brochure: 'journey.document.brochure',
  kid: 'journey.document.kid',
};

/**
 * The end-to-end journey after the advice (Must-have of the challenge): recommendation → Pax
 * review → quote → application → submission → Pax review → demo policy in the customer portal.
 * Every step is the backend's demo journey; nothing here has legal effect, no premium is invented
 * and the policy never claims cover. In the demo start the Pax specialist's steps are simulated
 * by the backend (demo-review) and labelled as such; elsewhere the case waits for a real reviewer.
 *
 * Also the customer's documentation: product documents to acknowledge, the advice dossier, and an
 * NPS question for the reached stage.
 */
@Component({
  selector: 'app-journey-view',
  imports: [TranslocoPipe, RouterLink, NgTemplateOutlet, NpsCard, SuitabilityForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './journey-view.html',
  styleUrl: './journey-view.scss',
})
export class JourneyView {
  private readonly api = inject(JourneyApi);
  private readonly customer = inject(CustomerApi);
  private readonly store = inject(CaseStore);
  private readonly format = inject(LocaleFormat);
  private readonly transloco = inject(TranslocoService);
  protected readonly demoStart = inject(APP_ENVIRONMENT).demoStart === true;

  protected readonly stages = STAGES;
  protected readonly summary = signal<CustomerSummary | null>(null);
  protected readonly portal = signal<PortalDto | null>(null);
  private readonly suitability = signal<SuitabilityView | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly documentsRead = signal(false);

  protected readonly caseId = computed(() => this.customer.session()?.caseId ?? null);

  protected readonly recommendation = computed<Recommendation | null>(() => {
    const summary = this.summary();
    return summary?.recommendations.filter((r) => r.runId === summary.runId).at(-1) ?? null;
  });
  private readonly application = computed(
    () =>
      this.portal()
        ?.applications.filter((a) => !a.stale)
        .at(-1) ?? null,
  );
  protected readonly quote = computed<Quote | null>(() => {
    const portal = this.portal(),
      application = this.application(),
      recommendation = this.recommendation();
    if (!portal) return null;
    if (application) return portal.quotes.find((q) => q.id === application.quoteId) ?? null;
    const now = new Date().toISOString();
    return (
      portal.quotes
        .filter((q) => !q.stale && q.expiresAt > now && q.recommendationId === recommendation?.id)
        .at(-1) ?? null
    );
  });
  protected readonly currentPolicy = computed(
    () =>
      this.portal()
        ?.policies.filter((p) => !p.adviceContextChanged)
        .at(-1) ?? null,
  );

  protected readonly step = computed<Step>(() => {
    const recommendation = this.recommendation();
    if (!recommendation) return 'locked';
    if (recommendation.status === 'no_new_contract' || !recommendation.candidates.length)
      return 'none';
    if (this.currentPolicy()) return 'policy';
    const application = this.application();
    if (application) {
      switch (application.status) {
        case 'draft':
          return 'application';
        case 'needs_information':
          return 'needsInformation';
        case 'declined':
          return 'declined';
        default:
          return 'submitted';
      }
    }
    if (this.quote()) return 'quote';
    return recommendation.status === 'human_review_required' ? 'review' : 'select';
  });
  protected readonly stageIndex = computed(() => STAGE_OF[this.step()]);

  /** Selected fund-linked products whose person has no suitable pre-check for this profile yet. */
  protected readonly pendingSuitability = computed(() => {
    const view = this.suitability(),
      version = this.summary()?.profileVersion,
      person = this.firstPerson();
    const candidates = this.recommendation()?.candidates ?? [];
    return candidates.filter((c) => {
      if (!this.selected().has(c.id) || !QUALIFIED.has(c.productId)) return false;
      const personId = c.personId ?? person;
      const check = [...(view?.checks ?? [])]
        .reverse()
        .find(
          (x) =>
            x.productId === c.productId && x.personId === personId && x.profileVersion === version,
        );
      return check?.result !== 'suitable';
    });
  });

  /** The NPS question fits the furthest stage reached. */
  protected readonly npsStage = computed<FeedbackStage | null>(() => {
    if (this.currentPolicy()) return 'portal';
    if (this.recommendation()) return 'recommendation';
    return this.summary()?.profileVersion ? 'advice' : null;
  });

  protected readonly firstPerson = computed(
    () => this.store.canonical()?.draft.insurance?.persons[0]?.personId ?? '',
  );

  constructor() {
    // Reload on every case change: SSE (the voice, the review) and our own commands.
    effect(() => {
      const caseId = this.caseId();
      this.store.contextRevision();
      untracked(() => {
        if (caseId) void this.load(caseId);
        else this.loading.set(false);
      });
    });
  }

  /** 1-based position of the person in the profile, for "Person 1"; 0 for household products. */
  protected personNumber(personId: string | null): number {
    if (!personId) return 0;
    return (
      (this.store.canonical()?.draft.financial?.persons.findIndex((p) => p.id === personId) ?? -1) +
      1
    );
  }

  protected need(candidate: Candidate): string {
    return this.format.chf(candidate.needAmountCents / 100, { maximumFractionDigits: 0 });
  }

  protected toggle(candidate: Candidate, checked: boolean): void {
    this.selected.update((ids) => {
      const next = new Set(ids);
      if (checked) next.add(candidate.id);
      else next.delete(candidate.id);
      return next;
    });
  }

  protected documentLabel(documentId: string, quote: Quote): string {
    const [prefix] = documentId.split('_');
    const productId = DOCUMENT_PRODUCT[prefix];
    return quote.configurations.find((c) => c.productId === productId)?.productName ?? documentId;
  }

  protected documentKind(documentId: string): string {
    return DOCUMENT_KIND[documentId.split('_').at(-1) ?? ''] ?? 'journey.document.terms';
  }

  protected documentUrl(documentId: string): string {
    return this.api.documentUrl(this.caseId() ?? '', documentId);
  }

  protected dossierUrl(): string {
    return this.api.dossierUrl(this.caseId() ?? '');
  }

  protected time(value: string): string {
    return this.format.date(value, { timeStyle: 'short' });
  }

  protected date(value: string): string {
    return this.format.date(value, { dateStyle: 'long' });
  }

  protected suitabilityChecked(check: SuitabilityCheck): void {
    this.suitability.update((view) => (view ? { ...view, checks: [...view.checks, check] } : view));
  }

  protected requestQuote(): Promise<void> {
    const recommendation = this.recommendation();
    return this.run((caseId) =>
      this.api
        .quote(caseId, recommendation!.id, [...this.selected()])
        .then(() => this.documentsRead.set(false)),
    );
  }

  protected createApplication(): Promise<void> {
    return this.run((caseId) => this.api.apply(caseId, this.quote()!));
  }

  protected submit(): Promise<void> {
    return this.run((caseId) => this.api.submit(caseId, this.application()!, this.quote()!));
  }

  protected simulateReview(): Promise<void> {
    return this.run((caseId) => this.api.demoReview(caseId));
  }

  private async run(command: (caseId: string) => Promise<unknown>): Promise<void> {
    const caseId = this.caseId();
    if (!caseId || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await command(caseId);
    } catch (error) {
      const code = error instanceof HttpErrorResponse ? error.error?.code : undefined;
      this.error.set(
        code && ERRORS[code]
          ? this.transloco.translate(ERRORS[code])
          : error instanceof HttpErrorResponse
            ? (error.error?.message ?? code ?? error.message)
            : String(error),
      );
    } finally {
      this.busy.set(false);
      await this.load(caseId);
    }
  }

  private loads = 0;

  private async load(caseId: string): Promise<void> {
    const load = ++this.loads;
    try {
      const [summaries, portal, suitability] = await Promise.all([
        this.api.summaries(caseId),
        this.api.portal(caseId),
        this.api.suitability(caseId).catch(() => null),
      ]);
      // Only the newest load may land; an older one can answer last.
      if (load !== this.loads || this.caseId() !== caseId) return;
      this.summary.set(summaries.customer);
      this.portal.set(portal);
      this.suitability.set(suitability);
    } catch (error) {
      if (load === this.loads) console.error('JourneyView: loading the journey failed', error);
    } finally {
      if (load === this.loads) this.loading.set(false);
    }
  }
}
