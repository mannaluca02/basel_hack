import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CUSTOMER_SESSION_KEY } from '../../core/advisor/api/customer-api';
import { APP_ENVIRONMENT } from '../../core/config/app-environment';
import { provideI18nTesting } from '../../core/i18n/i18n-testing';
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
      { provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: '/api', demoStart } },
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

describe('SuitabilityForm answers', () => {
  it('sends every chosen answer, a single investment, and clamps the guaranteed part', async () => {
    const http = configure();
    const fixture = TestBed.createComponent(SuitabilityForm);
    fixture.componentRef.setInput('caseId', CASE);
    fixture.componentRef.setInput('productId', 'pax_lifestar');
    fixture.componentRef.setInput('productName', 'Pax LifeStar');
    fixture.componentRef.setInput('personId', 'person_1');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const choose = (name: string, value: string) => {
      const select = root.querySelector<HTMLSelectElement>(`select[name="${name}"]`)!;
      select.value = value;
      select.dispatchEvent(new Event('change'));
    };
    const type = (name: string, value: string) => {
      const input = root.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    choose('netIncome', 'over_250k');
    choose('netWorth', 'over_300k');
    choose('annualSavingCapacity', 'over_7k');
    choose('singleInvestmentCapacity', '150k_300k');
    choose('investmentGoal', 'high_risk');
    choose('horizon', '10_to_15_years');
    choose('securitiesExperience', 'extensive');
    choose('lossReaction', 'buy_more');
    choose('selectedStrategy', 'dynamic');
    type('single', '50000');
    type('guarantee', '140');
    const confirm = root.querySelector<HTMLInputElement>('input[name="confirm"]')!;
    confirm.checked = true;
    confirm.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(root.querySelector<HTMLInputElement>('input[name="guarantee"]')!.value).toBe('100');
    // The field shows francs again, not the cents sent to the backend.
    expect(root.querySelector<HTMLInputElement>('input[name="single"]')!.value).toBe('50000');

    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await settle(fixture);
    http.expectOne(`/api/cases/${CASE}`).flush({ id: CASE, caseRevision: 2 });
    await settle(fixture);
    const request = http.expectOne(`/api/cases/${CASE}/suitability`);
    expect(request.request.body.answers).toEqual({
      netIncome: 'over_250k', netWorth: 'over_300k', annualSavingCapacity: 'over_7k', singleInvestmentCapacity: '150k_300k',
      investmentGoal: 'high_risk', horizon: '10_to_15_years', securitiesExperience: 'extensive', lossReaction: 'buy_more',
      guaranteedPercent: 100, selectedStrategy: 'dynamic', annualPremiumCents: null, singleInvestmentCents: 5_000_000,
    });
    request.flush({ code: 'STALE_CONTEXT', message: 'Bitte neu laden.' }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Bitte neu laden.');
  });
});

