import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DEFAULT_HUMAN_HANDOVER } from '@pax/contracts';
import { AdvisorDataSource } from '../../core/advisor/advisor-data-source';
import { ApiDataSource } from '../../core/advisor/api/api-data-source';
import { CUSTOMER_SESSION_KEY } from '../../core/advisor/api/customer-api';
import {
  CASE_ID,
  FakeEventSource,
  reviewCase,
  reviewContext,
  settle,
} from '../../core/advisor/api/review-testing';
import { CaseStore } from '../../core/advisor/store/case-store';
import { APP_ENVIRONMENT } from '../../core/config/app-environment';
import { Consent } from '../../core/consent/consent';
import { provideI18nTesting } from '../../core/i18n/i18n-testing';
import { LiveVoiceControl } from './live-voice-control';

describe('LiveVoiceControl', () => {
  let fixture: ComponentFixture<LiveVoiceControl>;
  let http: HttpTestingController;
  let microphone: ReturnType<typeof vi.fn>;
  let consents: unknown[];
  const caseUrl = `/api/cases/${CASE_ID}`;
  const quietCase = () =>
    reviewCase({
      proposalBatches: [],
      ambiguities: [],
      confirmedVersions: [],
      handover: DEFAULT_HUMAN_HANDOVER,
    });
  const element = () => fixture.nativeElement as HTMLElement;
  const mic = () => element().querySelector<HTMLButtonElement>('.mic');
  const start = () => element().querySelector<HTMLButtonElement>('[data-action="start"]');

  let dto = quietCase();

  async function setup(gptLive = true, demoStart = false, voiceAgentUrl?: string) {
    consents = [];
    sessionStorage.setItem(
      CUSTOMER_SESSION_KEY,
      JSON.stringify({ caseId: CASE_ID, csrfToken: 'csrf_test' }),
    );
    FakeEventSource.reset();
    vi.stubGlobal('EventSource', FakeEventSource);
    microphone = vi
      .fn()
      .mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
    vi.stubGlobal('navigator', {
      userAgent: navigator.userAgent,
      mediaDevices: { getUserMedia: microphone },
    });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        {
          provide: APP_ENVIRONMENT,
          useValue: { apiBaseUrl: '/api', dataSource: 'api', demoStart, voiceAgentUrl },
        },
        { provide: AdvisorDataSource, useClass: ApiDataSource },
      ],
    });
    TestBed.inject(Consent).grant();
    http = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(CaseStore);
    store.connect();
    store.refresh();
    fixture = TestBed.createComponent(LiveVoiceControl);
    fixture.detectChanges();
    await serve(gptLive);
  }

  /** Answers every pending read, a few rounds deep. */
  async function serve(gptLive = true) {
    for (let i = 0; i < 4; i++) {
      for (const request of http.match(
        (request) => request.method === 'POST' && request.url.endsWith('/extraction/consent'),
      )) {
        consents.push(request.request.body);
        request.flush({});
      }
      for (const request of http.match((request) => request.method === 'GET')) {
        const url = request.request.url;
        if (url.startsWith('/api/voice/privacy'))
          request.flush({
            text: 'Synthetic voice notice',
            providers: [{ provider: 'gpt-live', available: gptLive }],
          });
        else if (url === '/api/voice/settings')
          request.flush({ skills: [], defaultTimeBudgetMinutes: 10 });
        else if (url.startsWith('/api/extraction/privacy'))
          request.flush({
            enabled: true,
            version: 'notice',
            noticeHash: 'hash',
            text: 'Synthetic extraction notice',
          });
        else if (url === caseUrl) request.flush(dto);
        else if (url === `${caseUrl}/advisor/context`) request.flush(reviewContext());
        else request.flush({ code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
      }
      await settle();
      fixture.detectChanges();
    }
  }

  function consent() {
    for (const box of Array.from(
      element().querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    )) {
      box.checked = true;
      box.dispatchEvent(new Event('change'));
    }
    fixture.detectChanges();
  }

  afterEach(() => {
    dto = quietCase();
    fixture?.destroy();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('stays hidden while the backend offers no GPT-Live', async () => {
    await setup(false);
    expect(mic()).toBeNull();
  });

  it('asks for both consents before the microphone opens', async () => {
    await setup();
    mic()!.click();
    fixture.detectChanges();
    expect(element().textContent).toContain('Synthetic voice notice');
    expect(element().textContent).toContain('Synthetic extraction notice');
    expect(start()!.disabled).toBe(true);

    consent();
    expect(start()!.disabled).toBe(false);
    start()!.click();
    await serve();

    expect(consents).toEqual([
      expect.objectContaining({ noticeHash: 'hash', allowSyntheticModelExtraction: true }),
    ]);
    expect(microphone).toHaveBeenCalledOnce();
    // The panel closed; the denied microphone is readable above the tab bar.
    expect(start()).toBeNull();
    expect(element().querySelector('[role="alert"]')!.textContent).toContain(
      'Website-Einstellungen',
    );
  });

  it('offers the demo start to accept what Paxi heard, and recalculates', async () => {
    dto = reviewCase({ handover: DEFAULT_HUMAN_HANDOVER });
    await setup(true, true);
    const accept = element().querySelector<HTMLButtonElement>('[data-action="accept"]')!;
    expect(accept.textContent).toContain('Übernehmen');

    accept.click();
    const request = http.expectOne(`${caseUrl}/demo-accept`);
    expect(request.request.headers.get('X-CSRF-Token')).toBe('csrf_test');
    dto = quietCase();
    request.flush({ accepted: ['batch'], skipped: [], profileVersion: 2, runs: [] });
    await serve();

    expect(element().querySelector('[data-action="accept"]')).toBeNull();
  });

  it('never offers the acceptance outside the demo start', async () => {
    dto = reviewCase({ handover: DEFAULT_HUMAN_HANDOVER });
    await setup();
    expect(element().querySelector('[data-action="accept"]')).toBeNull();
  });

  it('leaves the call to Paxi in the paxi configuration, but still offers the acceptance', async () => {
    dto = reviewCase({ handover: DEFAULT_HUMAN_HANDOVER });
    await setup(true, true, 'http://localhost:3100');
    expect(mic()).toBeNull();
    expect(element().querySelector('[data-action="accept"]')).not.toBeNull();
  });

  it('closes the consent panel with Cancel or Escape, without starting', async () => {
    await setup();
    mic()!.click();
    fixture.detectChanges();
    const cancel = Array.from(element().querySelectorAll<HTMLButtonElement>('.panel button')).find((b) => b.textContent?.includes('Abbrechen'))!;
    cancel.click();
    fixture.detectChanges();
    expect(element().querySelector('.panel')).toBeNull();

    mic()!.click();
    fixture.detectChanges();
    expect(element().querySelector('.panel')).not.toBeNull();
    element().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(element().querySelector('.panel')).toBeNull();
    expect(microphone).not.toHaveBeenCalled();
  });
});

