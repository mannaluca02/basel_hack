import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { APP_ENVIRONMENT } from '../../core/config/app-environment';
import { provideI18nTesting } from '../../core/i18n/i18n-testing';
import { provideAdvisorDataSource } from '../../core/advisor/provide-advisor-data-source';
import { CUSTOMER_SESSION_KEY } from '../../core/advisor/api/customer-api';
import { HumanAdvisorStatus } from './human-advisor-status';

const CASE_ID = 'case_status';
const view = (wantsHumanAdvisor: boolean) => ({
  caseId: CASE_ID,
  caseRevision: 4,
  contextRevision: 9,
  handover: { status: wantsHumanAdvisor ? 'human_requested' : 'digital', wantsHumanAdvisor },
  contact: { organization: 'Pax', displayPhone: '+41 61 277 66 66', phone: '+41612776666' },
});

describe('HumanAdvisorStatus', () => {
  function render(placement: 'banner' | 'sheet') {
    sessionStorage.clear();
    sessionStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify({ csrfToken: 'csrf_1', caseId: CASE_ID }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        provideAdvisorDataSource(),
        { provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: '/api' } },
      ],
    });
    const fixture = TestBed.createComponent(HumanAdvisorStatus);
    fixture.componentRef.setInput('placement', placement);
    fixture.detectChanges();
    return fixture;
  }

  /** Answers one handover command: the case read for its revision, then the command itself. */
  async function answer(wantsHumanAdvisor: boolean) {
    const http = TestBed.inject(HttpTestingController);
    await Promise.resolve();
    http.expectOne(`/api/cases/${CASE_ID}`).flush({ id: CASE_ID, caseRevision: 4 });
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne(`/api/cases/${CASE_ID}/handover`).flush(view(wantsHumanAdvisor));
    await new Promise((resolve) => setTimeout(resolve));
  }

  it('offers the request in the sheet and then shows the Pax contact and the way back', async () => {
    const fixture = render('sheet');
    fixture.nativeElement.querySelector('button').click();
    await answer(true);
    fixture.detectChanges();

    const status: HTMLElement = fixture.nativeElement.querySelector('.status');
    expect(status.querySelector('a')!.getAttribute('href')).toBe('tel:+41612776666');
    status.querySelector('button')!.click();
    await answer(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.status')).toBeNull();
  });

  it('stays out of the way as a banner until help was asked for', () => {
    const fixture = render('banner');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});
