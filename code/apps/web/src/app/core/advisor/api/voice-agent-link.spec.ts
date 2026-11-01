import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT } from '../../config/app-environment';
import { AppLanguage } from '../../i18n/language';
import { provideI18nTesting } from '../../i18n/i18n-testing';
import { provideAdvisorDataSource } from '../provide-advisor-data-source';
import { CUSTOMER_SESSION_KEY } from './customer-api';
import { VoiceAgentLink } from './voice-agent-link';

const PAXI = 'http://localhost:3100';

function setup() {
  sessionStorage.clear();
  sessionStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify({ csrfToken: 'csrf_1', caseId: 'case_1' }));
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideI18nTesting(),
      provideAdvisorDataSource(),
      { provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: '/api', dataSource: 'api', voiceAgentUrl: PAXI } },
    ],
  });
  return { link: TestBed.inject(VoiceAgentLink), http: TestBed.inject(HttpTestingController) };
}

describe('VoiceAgentLink', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function openPaxi(expiresAt: string) {
    const { link, http } = setup();
    const paxi = { closed: false, location: { href: '' }, postMessage: vi.fn(), close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(paxi as unknown as Window);
    const notice = link.showNotice();
    http.expectOne((r) => r.url === '/api/voice/privacy').flush({ version: 'voice-synthetic-v1', enabled: true, text: 'Hinweis' });
    await notice;
    const opened = link.open();
    http.expectOne('/api/cases/case_1/agent-access').flush({ sessionToken: 'a'.repeat(43), expiresAt });
    await vi.advanceTimersByTimeAsync(0);
    http.expectOne(`${PAXI}/api/case-link`).flush({ linkId: 'link_1' });
    await opened;
    const receive = (data: unknown, origin = PAXI, source: unknown = paxi) =>
      (link as unknown as { receive(event: unknown): void }).receive({ origin, source, data });
    return { link, http, paxi, receive };
  }

  it('opens Paxi with the case link and tells it where to report back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { link, paxi } = await openPaxi(new Date(Date.now() + 900_000).toISOString());
    expect(paxi.location.href).toBe(`${PAXI}/?link=link_1&app=${encodeURIComponent(window.location.origin)}`);
    expect(link.state()).toBe('opened');
  });

  it('follows Paxi\'s activity and end, only from its own window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { link, receive } = await openPaxi(new Date(Date.now() + 900_000).toISOString());
    receive({ type: 'pax.status', state: 'connected', activity: 'speaking' });
    expect(link.activity()).toBe('speaking');
    receive({ type: 'pax.status', activity: 'listening' }, 'http://evil.example');
    receive({ type: 'pax.status', activity: 'listening' }, PAXI, {});
    expect(link.activity()).toBe('speaking');
    receive({ type: 'pax.status', state: 'ended' });
    expect(link.state()).toBe('idle');
    expect(link.activity()).toBe('idle');
  });

  it('passes controls and the app language to the Paxi window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { link, paxi } = await openPaxi(new Date(Date.now() + 900_000).toISOString());
    await TestBed.inject(AppLanguage).use('it');
    TestBed.tick();
    link.control('mute');
    expect(paxi.postMessage.mock.calls).toEqual([
      [{ type: 'pax.call', action: 'language', language: 'it' }, PAXI],
      [{ type: 'pax.call', action: 'mute' }, PAXI],
    ]);
  });

  it('renews the grant for the same link two minutes before it runs out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { http } = await openPaxi(new Date(Date.now() + 3 * 60_000).toISOString());
    await vi.advanceTimersByTimeAsync(60_000);
    http.expectOne('/api/cases/case_1/agent-access').flush({ sessionToken: 'b'.repeat(43), expiresAt: new Date(Date.now() + 900_000).toISOString() });
    await vi.advanceTimersByTimeAsync(0);
    const renewal = http.expectOne(`${PAXI}/api/case-link/link_1`);
    expect(renewal.request.method).toBe('PUT');
    expect(renewal.request.body).toMatchObject({ caseId: 'case_1', agentToken: 'b'.repeat(43) });
  });

  it('ends the link when the customer closes the Paxi window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { link, paxi } = await openPaxi(new Date(Date.now() + 900_000).toISOString());
    paxi.closed = true;
    await vi.advanceTimersByTimeAsync(2500);
    expect(link.state()).toBe('idle');
  });

  it('reports a notice that cannot be loaded, and closes the notice on dismiss', async () => {
    const { link, http } = setup();
    const failing = link.showNotice();
    http.expectOne((r) => r.url === '/api/voice/privacy').flush({ code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await failing;
    expect(link.state()).toBe('failed');

    const loading = link.showNotice();
    http.expectOne((r) => r.url === '/api/voice/privacy').flush({ version: 'voice-synthetic-v1', enabled: true, text: 'Hinweis' });
    await loading;
    expect(link.state()).toBe('notice');
    link.dismiss();
    expect(link.state()).toBe('idle');
  });

  it('closes the reserved window and reports a failed hand-over', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { link, http } = setup();
    const paxi = { closed: false, location: { href: '' }, postMessage: vi.fn(), close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(paxi as unknown as Window);
    const notice = link.showNotice();
    http.expectOne((r) => r.url === '/api/voice/privacy').flush({ version: 'voice-synthetic-v1', enabled: true, text: 'Hinweis' });
    await notice;
    const opened = link.open();
    http.expectOne('/api/cases/case_1/agent-access').flush({ code: 'FORBIDDEN' }, { status: 403, statusText: 'Forbidden' });
    await opened;
    expect(paxi.close).toHaveBeenCalled();
    expect(link.state()).toBe('failed');
  });

  it('is not available, and does nothing, without a configured voice agent', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        provideAdvisorDataSource(),
        { provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: '/api', dataSource: 'api' } },
      ],
    });
    const link = TestBed.inject(VoiceAgentLink);
    expect(link.available).toBe(false);
    await link.open();
    link.control('mute');
    TestBed.inject(HttpTestingController).verify();
    expect(link.state()).toBe('idle');
  });
});

