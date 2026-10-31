import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CUSTOMER_SESSION_KEY } from '../../core/advisor/api/customer-api';
import { APP_ENVIRONMENT } from '../../core/config/app-environment';
import { provideI18nTesting } from '../../core/i18n/i18n-testing';
import { InsightsView } from './insights-view';
import { NpsCard } from './nps-card';
import { SuitabilityForm } from './suitability-form';

const CASE = 'case_parts';
const settle = async (fixture: ComponentFixture<unknown>) => {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
};

function configure(demoStart = true) {
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
      { provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: '/api', dataSource: 'api', demoStart } },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

afterEach(() => sessionStorage.clear());

describe('SuitabilityForm', () => {
  it('sends the customer’s own answers with an amount and shows why it is advised against', async () => {
    const http = configure();
    const fixture = TestBed.createComponent(SuitabilityForm);
    fixture.componentRef.setInput('caseId', CASE);
    fixture.componentRef.setInput('productId', 'pax_fondsstar');
    fixture.componentRef.setInput('productName', 'Pax FondsStar');
    fixture.componentRef.setInput('personId', 'person_1');
    const checked: unknown[] = [];
    fixture.componentInstance.checked.subscribe((check) => checked.push(check));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const submit = root.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(true);

    const premium = root.querySelector<HTMLInputElement>('input[name="premium"]')!;
    premium.value = '2400';
    premium.dispatchEvent(new Event('input'));
    const confirm = root.querySelector<HTMLInputElement>('input[name="confirm"]')!;
    confirm.checked = true;
    confirm.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(submit.disabled).toBe(false);

    submit.click();
    await settle(fixture);
    http.expectOne(`/api/cases/${CASE}`).flush({ id: CASE, caseRevision: 4 });
    await settle(fixture);
    const request = http.expectOne(`/api/cases/${CASE}/suitability`);
    expect(request.request.body).toMatchObject({
      expectedCaseRevision: 4,
      productId: 'pax_fondsstar',
      personId: 'person_1',
      answersConfirmedByCustomer: true,
      answers: {
        annualPremiumCents: 240000,
        singleInvestmentCents: null,
        selectedStrategy: 'balanced',
      },
    });
    request.flush({ result: 'advised_against', reasons: ['STRATEGY_DOES_NOT_MATCH_PROFILE'] });
    await settle(fixture);

    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      'passt nicht zu deinem Anlageprofil',
    );
    expect(checked).toHaveLength(1);
  });
});

describe('NpsCard', () => {
  it('records one score for the stage and thanks, also when it was already recorded', async () => {
    const http = configure();
    const fixture = TestBed.createComponent(NpsCard);
    fixture.componentRef.setInput('caseId', CASE);
    fixture.componentRef.setInput('stage', 'portal');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const scores = root.querySelectorAll<HTMLButtonElement>('.score');
    expect(scores).toHaveLength(11);

    scores[9].click();
    const request = http.expectOne(`/api/cases/${CASE}/feedback`);
    expect(request.request.body).toEqual({ stage: 'portal', score: 9 });
    request.flush({ code: 'FEEDBACK_ALREADY_RECORDED' }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    expect(root.textContent).toContain('Danke');
  });
});

describe('InsightsView', () => {
  it('shows the funnel, drop-offs and NPS of the demo cases', async () => {
    const http = configure();
    const fixture = TestBed.createComponent(InsightsView);
    fixture.detectChanges();
    http.expectOne('/api/demo/insights').flush({
      caseCount: 3,
      currentStageCounts: { recommendation: 2, demo_policy: 1 },
      potentialDropoffs: { recommendation: 1 },
      dropoffDefinition: '',
      blockingReasons: { LIFE_INSURANCE_DEMO_REVIEW_REQUIRED: 3 },
      humanHandover: { requested: 1 },
      nps: { responses: 2, score: 50 },
    });
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const row = Array.from(root.querySelectorAll('tbody tr')).find((tr) =>
      tr.textContent?.includes('Empfehlung'),
    )!;
    expect(row.textContent).toMatch(/Empfehlung\s*2\s*1/);
    expect(root.querySelector('.figures')?.textContent).toContain('50');
    expect(root.textContent).toContain('LIFE_INSURANCE_DEMO_REVIEW_REQUIRED');
  });

  it('is not available outside the demo start', () => {
    const http = configure(false);
    const fixture = TestBed.createComponent(InsightsView);
    fixture.detectChanges();
    http.expectNone('/api/demo/insights');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('nur im Demo-Start');
  });
});
