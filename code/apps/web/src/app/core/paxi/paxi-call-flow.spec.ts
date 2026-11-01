import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_HUMAN_HANDOVER } from '@pax/contracts';
import { AdvisorDataSource } from '../advisor/advisor-data-source';
import { ApiDataSource } from '../advisor/api/api-data-source';
import { CustomerApi } from '../advisor/api/customer-api';
import { CASE_ID, FakeEventSource, reviewCase, reviewContext } from '../advisor/api/review-testing';
import { CaseStore } from '../advisor/store/case-store';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { Consent } from '../consent/consent';
import { provideI18nTesting } from '../i18n/i18n-testing';
import { LiveVoice } from '../voice/live-voice';
import { startPaxiWhenReady } from './paxi-call';

/**
 * FE-29, end to end in the frontend: "I agree" in the api configuration without the demo start,
 * then a long sign-in on the review panel. The real LiveVoice, CustomerApi, CaseStore and data
 * source run against the backend's HTTP contract; only the network and the microphone are fakes.
 */
describe('Paxi call start after a late sign-in', () => {
  let http: HttpTestingController;
  let microphone: ReturnType<typeof vi.fn>;
  const caseUrl = `/api/cases/${CASE_ID}`;
  const dto = reviewCase({ proposalBatches: [], ambiguities: [], confirmedVersions: [], handover: DEFAULT_HUMAN_HANDOVER });

  /** Answers every pending read; the voice notices offer GPT-Live and the model extraction. */
  async function serve() {
    for (let i = 0; i < 6; i++) {
      for (const request of http.match((r) => r.method === 'POST' && r.url.endsWith('/extraction/consent'))) request.flush({});
      for (const request of http.match((r) => r.method === 'GET')) {
        const url = request.request.url;
        if (url.startsWith('/api/voice/privacy'))
          request.flush({ text: 'Voice notice', providers: [{ provider: 'gpt-live', available: true }] });
        else if (url === '/api/voice/settings') request.flush({ skills: [], defaultTimeBudgetMinutes: 10 });
        else if (url.startsWith('/api/extraction/privacy'))
          request.flush({ enabled: true, version: 'notice', noticeHash: 'hash', text: 'Extraction notice' });
        else if (url === caseUrl) request.flush(dto);
        else if (url === `${caseUrl}/advisor/context`) request.flush(reviewContext());
        else request.flush({ code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
      }
      await vi.advanceTimersByTimeAsync(0);
      TestBed.tick();
    }
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    sessionStorage.clear();
    FakeEventSource.reset();
    vi.stubGlobal('EventSource', FakeEventSource);
    microphone = vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
    vi.stubGlobal('navigator', { userAgent: navigator.userAgent, mediaDevices: { getUserMedia: microphone } });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        { provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: '/api' } },
        { provide: AdvisorDataSource, useClass: ApiDataSource },
      ],
    });
    TestBed.inject(Consent).grant();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('waits through a long sign-in, then gives both consents and opens the microphone', async () => {
    const live = TestBed.inject(LiveVoice);
    const store = TestBed.inject(CaseStore);
    const done = vi.fn();
    // "I agree" without a session: the customer still has to sign in.
    startPaxiWhenReady(live, TestBed.inject(Injector), done);
    TestBed.tick();
    expect(live.signedIn()).toBe(false);

    // Three minutes on the sign-in form: the start keeps waiting.
    await vi.advanceTimersByTimeAsync(180_000);
    expect(done).not.toHaveBeenCalled();

    // The review panel signs in: session, then the new case.
    const signIn = TestBed.inject(CustomerApi).signIn('synthetic-access-code');
    http.expectOne('/api/sessions').flush({ csrfToken: 'csrf_new' });
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne({ method: 'POST', url: '/api/cases' }).flush({ id: CASE_ID });
    await signIn;
    expect(live.signedIn()).toBe(true);

    // The case and the voice notices load; then the call starts by itself.
    store.connect();
    store.refresh();
    const notices = live.loadNotice();
    await serve();
    await notices;
    await serve();

    expect(live.consent()).toBe(true);
    expect(live.extractionConsent()).toBe(true);
    expect(microphone).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(done).toHaveBeenCalledOnce());
  });
});
