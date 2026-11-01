import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdvisorDataSource } from '../../core/advisor/advisor-data-source';
import { CUSTOMER_SESSION_KEY } from '../../core/advisor/api/customer-api';
import { FakeDataSource } from '../../core/advisor/store/case-testing';
import { APP_ENVIRONMENT } from '../../core/config/app-environment';
import { Consent } from '../../core/consent/consent';
import { provideI18nTesting } from '../../core/i18n/i18n-testing';
import { JourneyView } from './journey-view';
import { polyfillDialog } from '../../core/layout/dialog-testing';

const CASE = 'case_journey';
const RUN = 'run_1';
const url = (path = '') => `/api/cases/${CASE}${path}`;

const candidate = (id: string, productId: string, productName: string) => ({
  id,
  productId,
  productName,
  personId: 'person_1',
  needAmountCents: 4_000_000,
  needPeriod: 'year',
  explanation: `${productName} closes the gap`,
  reasonDetails: [{ code: 'GAP', text: 'Income gap after disability' }],
  eligibility: 'ready_for_demo',
  premiumCents: null,
  premiumStatus: 'pax_tariff_api_unavailable',
  conditions: [],
});

interface State {
  recommendation: 'none' | 'review' | 'ready';
  candidates: ReturnType<typeof candidate>[];
  quote: Record<string, unknown> | null;
  application: Record<string, unknown> | null;
  policy: Record<string, unknown> | null;
  checks: Record<string, unknown>[];
}

function summaries(state: State) {
  const recommendations =
    state.recommendation === 'none'
      ? []
      : [
          {
            id: 'rec_1',
            runId: RUN,
            status: state.recommendation === 'review' ? 'human_review_required' : 'ready_for_demo',
            candidates: state.candidates,
            disclaimer: 'Demo only',
            documentsLanguageNotice: 'Documents in German',
          },
        ];
  return { customer: { runId: RUN, profileVersion: 1, recommendations } };
}

function portal(state: State) {
  return {
    quotes: state.quote ? [state.quote] : [],
    applications: state.application ? [state.application] : [],
    policies: state.policy ? [state.policy] : [],
    complianceSteps: [
      {
        id: 'identification',
        status: 'required_in_real_integration',
        label: 'Identification',
        explanation: 'ID check',
      },
      {
        id: 'aml_check',
        status: 'required_in_real_integration',
        label: 'AML check',
        explanation: 'Anti-money laundering',
      },
      {
        id: 'health_declaration',
        status: 'required_in_real_integration',
        label: 'Health declaration',
        explanation: 'Health',
      },
      {
        id: 'signature',
        status: 'required_in_real_integration',
        label: 'Signature',
        explanation: 'Signature',
      },
    ],
  };
}

describe('JourneyView', () => {
  beforeAll(() => {
    polyfillDialog();
  });

  let fixture: ComponentFixture<JourneyView>;
  let http: HttpTestingController;
  let state: State;
  let revision: number;
  const element = () => fixture.nativeElement as HTMLElement;
  const button = (action: string) =>
    element().querySelector<HTMLButtonElement>(`[data-action="${action}"]`);

  async function setup(demoStart = true) {
    sessionStorage.setItem(
      CUSTOMER_SESSION_KEY,
      JSON.stringify({ caseId: CASE, csrfToken: 'csrf_test' }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        provideRouter([]),
        {
          provide: APP_ENVIRONMENT,
          useValue: { apiBaseUrl: '/api', dataSource: 'api', demoStart },
        },
        { provide: AdvisorDataSource, useValue: new FakeDataSource() },
      ],
    });
    TestBed.inject(Consent).grant();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(JourneyView);
    fixture.detectChanges();
    await serve();
  }

  /** Answers the reads, a few rounds deep; commands are answered by the test. */
  async function serve() {
    for (let i = 0; i < 4; i++) {
      for (const request of http.match((r) => r.method === 'GET')) {
        const path = request.request.url;
        if (path === url('/summaries')) request.flush(summaries(state));
        else if (path === url('/portal')) request.flush(portal(state));
        else if (path === url('/suitability')) request.flush({ checks: state.checks });
        else if (path === url('/dossier?audience=customer&format=html'))
          request.flush('<!doctype html><h1>Dossier Müller</h1>');
        else if (path === url()) request.flush({ id: CASE, caseRevision: revision });
        else request.flush({ code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
      }
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
    }
  }

  /** Waits for the command (after its revision read) and answers it. */
  async function command(path: string): Promise<TestRequest> {
    await serve();
    const request = http.expectOne((r) => r.method === 'POST' && r.url === url(path));
    expect(request.request.headers.get('X-CSRF-Token')).toBe('csrf_test');
    return request;
  }

  beforeEach(() => {
    sessionStorage.clear();
    revision = 7;
    state = {
      recommendation: 'review',
      candidates: [
        candidate('cand_disability', 'pax_disability', 'Pax Disability'),
        candidate('cand_term', 'pax_term_life', 'Pax Term Life'),
      ],
      quote: null,
      application: null,
      policy: null,
      checks: [],
    };
  });

  afterEach(() => {
    fixture?.destroy();
    sessionStorage.clear();
  });

  it('waits for the advice before anything else', async () => {
    state.recommendation = 'none';
    await setup();
    expect(element().textContent).toContain('Die Empfehlung folgt');
    expect(element().querySelector('[aria-current="step"]')?.textContent).toContain('Empfehlung');
  });

  it('walks from the recommendation through quote and application to the demo policy', async () => {
    await setup();
    expect(element().textContent).toContain('Pax-Fachperson prüft die Beratung');

    // The simulated Pax review of the advice.
    button('review')!.click();
    const review = await command('/demo-review');
    state.recommendation = 'ready';
    review.flush({
      adviceApproved: true,
      applicationsAccepted: [],
      policiesIssued: [],
      simulated: true,
    });
    await serve();

    // Choose one solution and request the quote.
    expect(element().textContent).toContain('Pax Disability closes the gap');
    expect(button('quote')!.disabled).toBe(true);
    const box = element().querySelector<HTMLInputElement>('.candidate input[type="checkbox"]')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    button('quote')!.click();
    const quote = await command('/demo-quotes');
    expect(quote.request.body).toMatchObject({
      expectedCaseRevision: 7,
      recommendationId: 'rec_1',
      selectedCandidateIds: ['cand_disability'],
      demoAcknowledged: true,
    });
    state.quote = {
      id: 'quote_1',
      recommendationId: 'rec_1',
      stale: false,
      expiresAt: '2099-01-01T00:00:00.000Z',
      documents: [
        { id: 'disability_terms', sha256: 'a' },
        { id: 'disability_brochure', sha256: 'b' },
      ],
      configurations: [state.candidates[0]],
    };
    quote.flush(state.quote);
    await serve();
    // From the offer on, the chosen recommendation stays on top, with the dossier.
    const recommended = () => element().querySelector('.recommended');
    expect(recommended()?.textContent).toContain('Deine Empfehlung');
    expect(recommended()?.textContent).toContain('Pax Disability closes the gap');
    expect(recommended()?.querySelector('[data-action="dossier"]')).not.toBeNull();
    expect(element().querySelectorAll('[data-action="dossier"]').length).toBe(1);

    // The product documents, each a download; the application needs them read.
    const links = Array.from(element().querySelectorAll<HTMLAnchorElement>('.documents a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      url('/documents/disability_terms'),
      url('/documents/disability_brochure'),
    ]);
    expect(links[0].textContent).toContain('Pax Disability – Versicherungsbedingungen');
    expect(element().textContent).toContain('nicht angebunden');
    expect(button('apply')!.disabled).toBe(true);
    const read = element().querySelector<HTMLInputElement>('.confirm input')!;
    read.checked = true;
    read.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    button('apply')!.click();
    const application = await command('/demo-applications');
    expect(application.request.body).toMatchObject({
      quoteId: 'quote_1',
      informationDocumentsAcknowledged: true,
      acknowledgedDocumentIds: ['disability_terms', 'disability_brochure'],
    });
    state.application = { id: 'app_1', quoteId: 'quote_1', status: 'draft', stale: false };
    application.flush(state.application);
    await serve();

    // Real contracts need four more steps; the demo names them instead of skipping silently.
    expect(element().textContent).toContain('AML check');
    button('submit')!.click();
    const submit = await command('/demo-applications/submit');
    expect(submit.request.body).toMatchObject({ applicationId: 'app_1' });
    state.application = { ...state.application, status: 'submitted' };
    submit.flush(state.application);
    await serve();
    expect(element().querySelector('[aria-current="step"]')?.textContent).toContain(
      'Prüfung durch Pax',
    );

    button('review')!.click();
    const decision = await command('/demo-review');
    state.application = { ...state.application, status: 'accepted_for_demo' };
    state.policy = {
      id: 'policy_1',
      displayLabel: 'Demo-Police Pax',
      issuedAt: '2026-10-31T12:00:00.000Z',
      adviceContextChanged: false,
      configuration: [state.candidates[0]],
    };
    decision.flush({
      adviceApproved: false,
      applicationsAccepted: ['app_1'],
      policiesIssued: ['policy_1'],
      simulated: true,
    });
    await serve();

    expect(element().querySelector('[aria-current="step"]')?.textContent).toContain('Police');
    expect(element().querySelector('.policy')?.textContent).toContain(
      'Demo – kein Versicherungsschutz',
    );
    expect(element().querySelector('.policy')?.textContent).toContain('Demo-Police Pax');
    expect(element().querySelector('app-nps-card')).toBeNull();
    expect(recommended()?.textContent).toContain('Pax Disability');

    // The advice dossier opens in a dialog on the same page, loaded with the app's session.
    const open = button('dossier')!;
    open.click();
    fixture.detectChanges();
    await serve();
    const dialog = element().querySelector<HTMLDialogElement>('app-dossier-dialog dialog')!;
    expect(dialog.open).toBe(true);
    const frame = dialog.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('allow-same-origin allow-modals');
    expect(frame.srcdoc).toContain('Dossier Müller');
    dialog.querySelector<HTMLButtonElement>('[data-action="close"]')!.click();
    fixture.detectChanges();
    expect(element().querySelector('app-dossier-dialog')).toBeNull();
    expect(document.activeElement).toBe(open);
  });

  it('asks for the suitability check before a fund-linked product can be quoted', async () => {
    state.recommendation = 'ready';
    state.candidates = [candidate('cand_fonds', 'pax_fondsstar', 'Pax FondsStar')];
    await setup();
    const box = element().querySelector<HTMLInputElement>('.candidate input[type="checkbox"]')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(element().querySelector('app-suitability-form')?.textContent).toContain(
      'Eignungsprüfung für Pax FondsStar',
    );
    expect(button('quote')!.disabled).toBe(true);
  });

  it('unlocks the quote once the suitability check of the fund-linked product is suitable', async () => {
    state.recommendation = 'ready';
    state.candidates = [candidate('cand_fonds', 'pax_fondsstar', 'Pax FondsStar')];
    await setup();
    const box = element().querySelector<HTMLInputElement>('.candidate input[type="checkbox"]')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const form = element().querySelector('app-suitability-form')!;
    const premium = form.querySelector<HTMLInputElement>('input[name="premium"]')!;
    premium.value = '2400';
    premium.dispatchEvent(new Event('input'));
    const confirm = form.querySelector<HTMLInputElement>('input[name="confirm"]')!;
    confirm.checked = true;
    confirm.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    const check = await command('/suitability');
    expect(check.request.body).toMatchObject({ productId: 'pax_fondsstar', personId: 'person_1' });
    check.flush({ productId: 'pax_fondsstar', personId: 'person_1', profileVersion: 1, result: 'suitable', reasons: [] });
    await serve();

    expect(element().querySelector('app-suitability-form')).toBeNull();
    expect(button('quote')!.disabled).toBe(false);
  });

  it('waits for a real Pax specialist outside the demo start', async () => {
    await setup(false);
    expect(element().textContent).toContain('Pax-Fachperson prüft die Beratung');
    expect(button('review')).toBeNull();
  });

  it('shows the backend message when a command is refused', async () => {
    state.recommendation = 'ready';
    await setup();
    const box = element().querySelector<HTMLInputElement>('.candidate input[type="checkbox"]')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    button('quote')!.click();
    const quote = await command('/demo-quotes');
    quote.flush(
      {
        code: 'PERSONAL_FUNDS_NOT_SUPPORTED_BY_OWN_RESOURCES',
        message: 'Bitte prüfen und bestätigen Sie Ihre Eingaben.',
      },
      { status: 422, statusText: 'Unprocessable' },
    );
    await serve();
    // A known refusal in the app's own words, an unknown one with the backend's text.
    expect(element().querySelector('[role="alert"]')?.textContent).toContain(
      'kein eigenes Einkommen oder Vermögen',
    );
    button('quote')!.click();
    const again = await command('/demo-quotes');
    again.flush(
      { code: 'SOMETHING_NEW', message: 'Neue Meldung vom Backend.' },
      { status: 409, statusText: 'Conflict' },
    );
    await serve();
    expect(element().querySelector('[role="alert"]')?.textContent).toContain(
      'Neue Meldung vom Backend.',
    );
  });
});
