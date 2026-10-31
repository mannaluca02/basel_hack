import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdvisorDataSource } from '../advisor/advisor-data-source';
import { CUSTOMER_SESSION_KEY } from '../advisor/api/customer-api';
import { VoiceAgentLink } from '../advisor/api/voice-agent-link';
import { FakeDataSource } from '../advisor/store/case-testing';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { Consent } from '../consent/consent';
import { provideI18nTesting } from '../i18n/i18n-testing';
import { VoiceCall } from './voice-call';

function setup(voiceAgentUrl?: string) {
  const source = new FakeDataSource();
  sessionStorage.clear();
  sessionStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify({ csrfToken: 'csrf_1', caseId: 'case_1' }));
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideI18nTesting(),
      { provide: AdvisorDataSource, useValue: source },
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, apiBaseUrl: '/api', dataSource: 'api', ...(voiceAgentUrl ? { voiceAgentUrl } : {}) },
      },
    ],
  });
  TestBed.inject(Consent).grant();
  return { source, call: TestBed.inject(VoiceCall), http: TestBed.inject(HttpTestingController) };
}

describe('VoiceCall', () => {
  afterEach(() => vi.restoreAllMocks());

  it("starts and ends the scripted call, and marks an end as the customer's own", () => {
    const { source, call } = setup();
    expect(call.viaPaxi).toBe(false);
    call.start();
    expect(source.connectionState.value).toBe('connected');
    expect(call.state()).toBe('active');
    call.end();
    expect(source.connectionState.value).toBe('disconnected');
    expect(call.state()).toBe('idle');
    expect(call.endedByUser()).toBe(true);
  });

  it('shows the voice notice first, opens Paxi and passes the controls to its window only', async () => {
    const { call, http } = setup('http://localhost:3100');
    const paxi = { closed: false, location: { href: '' }, postMessage: vi.fn(), close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(paxi as unknown as Window);

    call.start();
    http.expectOne((r) => r.url === '/api/voice/privacy').flush({ version: 'voice-synthetic-v1', enabled: true, text: 'Hinweis' });
    await Promise.resolve();
    expect(call.state()).toBe('notice');
    expect(call.notice()?.text).toBe('Hinweis');

    call.confirm();
    http.expectOne('/api/cases/case_1/agent-access').flush({ sessionToken: 'a'.repeat(43), expiresAt: '2099-01-01T00:00:00.000Z' });
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('http://localhost:3100/api/case-link').flush({ linkId: 'link_1' });
    await new Promise((resolve) => setTimeout(resolve));
    expect(paxi.location.href).toBe(
      `http://localhost:3100/?link=link_1&app=${encodeURIComponent(window.location.origin)}`,
    );
    expect(call.state()).toBe('active');

    call.toggleMute();
    call.stopSpeaking();
    call.end();
    expect(paxi.postMessage.mock.calls).toEqual([
      [{ type: 'pax.call', action: 'mute' }, 'http://localhost:3100'],
      [{ type: 'pax.call', action: 'stop_speaking' }, 'http://localhost:3100'],
      [{ type: 'pax.call', action: 'end' }, 'http://localhost:3100'],
    ]);
    expect(call.state()).toBe('idle');
    expect(TestBed.inject(VoiceAgentLink).windowOpen).toBe(true);
  });
});
