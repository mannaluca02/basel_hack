import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT } from '../../config/app-environment';
import { provideI18nTesting } from '../../i18n/i18n-testing';
import { provideAdvisorDataSource } from '../provide-advisor-data-source';
import { CUSTOMER_SESSION_KEY } from './customer-api';
import { HumanAdvisor } from './human-advisor';
import { VoiceAgentLink } from './voice-agent-link';

const CASE_ID = 'case_api';
const view = (wantsHumanAdvisor: boolean) => ({
  caseId: CASE_ID,
  caseRevision: 4,
  contextRevision: 9,
  handover: { status: wantsHumanAdvisor ? 'human_requested' : 'digital', wantsHumanAdvisor },
  contact: { organization: 'Pax', displayPhone: '+41 61 277 66 66' },
});

function setup() {
  sessionStorage.clear();
  sessionStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify({ csrfToken: 'csrf_1', caseId: CASE_ID }));
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideI18nTesting(),
      provideAdvisorDataSource(),
      { provide: APP_ENVIRONMENT, useValue: { production: false, apiBaseUrl: '/api', dataSource: 'api' } },
    ],
  });
  return { advisor: TestBed.inject(HumanAdvisor), http: TestBed.inject(HttpTestingController) };
}

describe('HumanAdvisor', () => {
  it('asks for a human advisor against the current case revision, with the CSRF token', async () => {
    const { advisor, http } = setup();

    const requested = advisor.request();
    await Promise.resolve();
    http.expectOne(`/api/cases/${CASE_ID}`).flush({ id: CASE_ID, caseRevision: 4 });
    await new Promise((resolve) => setTimeout(resolve));
    const command = http.expectOne(`/api/cases/${CASE_ID}/handover`);
    expect(command.request.method).toBe('POST');
    expect(command.request.headers.get('X-CSRF-Token')).toBe('csrf_1');
    expect(command.request.body).toMatchObject({ action: 'request', expectedCaseRevision: 4, source: 'ui' });
    command.flush(view(true));
    await requested;

    expect(advisor.requested()).toBe(true);
    expect(advisor.contact()).toMatchObject({ displayPhone: '+41 61 277 66 66' });
  });

  it('shows the stored state again after a failed command', async () => {
    const { advisor, http } = setup();

    const resumed = advisor.resume();
    await Promise.resolve();
    http.expectOne(`/api/cases/${CASE_ID}`).flush({ code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne(`/api/cases/${CASE_ID}/handover`).flush(view(true));
    await resumed;

    expect(advisor.failed()).toBe(true);
    expect(advisor.requested()).toBe(true);
  });

  it('ends a running Paxi call as soon as a human advisor is asked for', async () => {
    const { advisor, http } = setup();
    const link = TestBed.inject(VoiceAgentLink);
    vi.spyOn(link, 'windowOpen', 'get').mockReturnValue(true);
    const control = vi.spyOn(link, 'control').mockImplementation(() => undefined);

    const requested = advisor.request();
    await Promise.resolve();
    http.expectOne(`/api/cases/${CASE_ID}`).flush({ id: CASE_ID, caseRevision: 4 });
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne(`/api/cases/${CASE_ID}/handover`).flush(view(true));
    await requested;

    expect(control).toHaveBeenCalledWith('end');
  });
});
