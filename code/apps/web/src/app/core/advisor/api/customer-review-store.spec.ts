import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT } from '../../config/app-environment';
import { Consent } from '../../consent/consent';
import { provideI18nTesting } from '../../i18n/i18n-testing';
import { AdvisorDataSource } from '../advisor-data-source';
import { CaseStore } from '../store/case-store';
import { ApiDataSource } from './api-data-source';
import { CUSTOMER_SESSION_KEY } from './customer-api';
import { CustomerReview } from './customer-review';
import {
  BATCH_ID, CASE_ID, FakeEventSource, acceptedCase, acceptedContext, batchConfirmation,
  reviewCase, serve, settle,
} from './review-testing';

/** Real Review → authenticated HTTP → ApiDataSource → presenter → CaseStore chain, no SSE data. */
describe('review mutations update the canonical view without SSE notifications', () => {
  afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); });

  it.each([
    { reconnecting: false, unknownOutcome: false },
    { reconnecting: true, unknownOutcome: false },
    { reconnecting: false, unknownOutcome: true },
  ])('reloads accepted values with $reconnecting reconnecting and $unknownOutcome unknown outcome', async ({ reconnecting, unknownOutcome }) => {
    sessionStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify({ caseId: CASE_ID, csrfToken: 'csrf_test' }));
    FakeEventSource.reset();
    vi.stubGlobal('EventSource', FakeEventSource);
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideI18nTesting(),
      { provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: '/api' } },
      { provide: AdvisorDataSource, useClass: ApiDataSource },
    ] });
    TestBed.inject(Consent).grant();
    const review = TestBed.inject(CustomerReview);
    const store = TestBed.inject(CaseStore);
    const http = TestBed.inject(HttpTestingController);
    store.connect();
    FakeEventSource.instances[0].open();
    await settle();
    serve(http, { confirmation: batchConfirmation({ status: 'awaiting_answer' }) });
    await settle();
    expect(store.projection()?.persons[0].grossCents).toBe(12000000);
    if (reconnecting) FakeEventSource.instances[0].fail();

    const mutation = review.decide('accept');
    const request = http.expectOne({ method: 'POST', url: `/api/cases/${CASE_ID}/customer-confirmations/${review.confirmation()!.id}/answer` });
    expect(request.request.headers.get('X-CSRF-Token')).toBe('csrf_test');
    if (unknownOutcome) request.error(new ProgressEvent('error'));
    else request.flush({});
    await settle();
    const accepted = { ...acceptedCase(), caseRevision: reviewCase().caseRevision + 1, contextRevision: reviewCase().contextRevision + 1 };
    // No stream.emit(...) and no manual store.refresh(): only the customer's review action.
    serve(http, { dto: accepted, context: acceptedContext(), confirmation: null });
    await mutation;
    await settle();
    expect(store.projection()?.persons[0].grossCents).toBe(11900000);
    expect(store.projection()?.pending.some(batch => batch.id === BATCH_ID)).toBe(false);
    expect(store.canonical()?.proposalBatches.find(batch => batch.id === BATCH_ID)?.status).toBe('accepted');
    expect(store.canonical()?.caseRevision).toBe(accepted.caseRevision);
    expect(review.error()?.code ?? null).toBe(unknownOutcome ? 'TRANSPORT' : null);
    http.verify();
  });
});
