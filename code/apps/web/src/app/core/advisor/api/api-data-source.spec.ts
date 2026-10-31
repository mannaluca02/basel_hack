import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { APP_ENVIRONMENT } from '../../config/app-environment';
import { CONSENT_NOTICE_VERSION } from '../../consent/consent';
import { provideI18nTesting } from '../../i18n/i18n-testing';
import { AdvisorDataSource, AdvisorEvent, ConnectionState } from '../advisor-data-source';
import { provideAdvisorDataSource } from '../provide-advisor-data-source';
import { ApiDataSource } from './api-data-source';
import { CUSTOMER_SESSION_KEY, CustomerApi } from './customer-api';
import { FakeEventSource } from './review-testing';

const CASE_ID = 'case_api';

function setup(session: object | null = { csrfToken: 'csrf_1', caseId: CASE_ID }) {
  sessionStorage.clear();
  if (session) sessionStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(session));
  FakeEventSource.reset();
  vi.stubGlobal('EventSource', FakeEventSource);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideI18nTesting(),
      provideAdvisorDataSource(),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, apiBaseUrl: '/api', dataSource: 'api' },
      },
    ],
  });
  const source = TestBed.inject(AdvisorDataSource);
  const states: ConnectionState[] = [];
  source.connection.subscribe((state) => states.push(state));
  return { source, states, http: TestBed.inject(HttpTestingController) };
}

describe('ApiDataSource', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is what the "api" data source mode binds', () => {
    expect(setup().source).toBeInstanceOf(ApiDataSource);
  });

  it('opens no stream without a customer session', () => {
    const { source, states } = setup(null);

    source.connect();

    expect(FakeEventSource.instances).toEqual([]);
    expect(states).toEqual(['disconnected']);
  });

  it('streams the case events with the session cookie and reports the connection', () => {
    const { source, states } = setup();

    source.connect();
    source.connect();

    expect(FakeEventSource.instances).toHaveLength(1);
    const [stream] = FakeEventSource.instances;
    expect(stream.url).toBe(`/api/cases/${CASE_ID}/advisor/events`);
    expect(stream.init).toEqual({ withCredentials: true });

    stream.open();
    expect(states).toEqual(['disconnected', 'connecting', 'connected']);
  });

  it('passes a runtime context event on as a context update', () => {
    const { source } = setup();
    const events: AdvisorEvent[] = [];
    source.events.subscribe((event) => events.push(event));
    source.connect();

    const update = { contextRevision: 8, reason: 'agent_proposal_batch_available' };
    FakeEventSource.instances[0].emit('advisor.context.updated', update);

    expect(events).toEqual([{ type: 'context', payload: update }]);
  });

  it('reports a dropped stream and reconnects to a fresh "connected"', () => {
    const { source, states } = setup();
    source.connect();
    const [stream] = FakeEventSource.instances;
    stream.open();

    stream.fail();
    stream.open();

    expect(states.slice(-2)).toEqual(['connecting', 'connected']);
  });

  it('can connect again after the browser gave the stream up', () => {
    const { source, states } = setup();
    source.connect();
    FakeEventSource.instances[0].fail({ closed: true });
    expect(states.at(-1)).toBe('disconnected');

    source.connect();

    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('stops the stream on disconnect', () => {
    const { source, states } = setup();
    source.connect();
    const [stream] = FakeEventSource.instances;
    stream.open();

    source.disconnect();

    expect(stream.closed).toBe(true);
    expect(states.at(-1)).toBe('disconnected');
  });

  it('takes the snapshot from the current case', async () => {
    const { source, http } = setup();

    const snapshot = firstValueFrom(source.snapshot());
    http.expectOne(`/api/cases/${CASE_ID}`).flush({
      id: CASE_ID,
      contextRevision: 12,
      draft: { financial: null, insurance: null, goals: [], reviewFlags: [] },
      confirmedVersions: [],
      runs: [],
      activeRunId: null,
      proposalBatches: [],
    });
    http
      .expectOne(`/api/cases/${CASE_ID}/advisor/context`)
      .flush({ code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });

    expect(await snapshot).toMatchObject({ caseId: CASE_ID, contextRevision: 12, charts: [] });
  });
});

describe('CustomerApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  function login(api: CustomerApi, http: HttpTestingController) {
    const signedIn = api.signIn('synthetic-access-code');
    const request = http.expectOne('/api/sessions');
    expect(request.request.body).toEqual({ accessCode: 'synthetic-access-code' });
    request.flush({ sessionToken: 'secret_session', csrfToken: 'csrf_new', role: 'customer' });
    return signedIn;
  }

  async function settled() {
    await new Promise((resolve) => setTimeout(resolve));
  }

  it('starts a case under the notice the customer saw and stores no session token', async () => {
    const { http } = setup(null);
    const api = TestBed.inject(CustomerApi);

    const signedIn = login(api, http);
    await settled();
    const create = http.expectOne({ method: 'POST', url: '/api/cases' });
    expect(create.request.headers.get('X-CSRF-Token')).toBe('csrf_new');
    expect(create.request.body).toMatchObject({
      locale: 'de',
      noticeVersion: CONSENT_NOTICE_VERSION,
      dataClassification: 'synthetic',
    });
    create.flush({ id: 'case_new' });
    await signedIn;

    expect(api.session()).toEqual({ csrfToken: 'csrf_new', caseId: 'case_new' });
    expect(sessionStorage.getItem(CUSTOMER_SESSION_KEY)).not.toContain('secret_session');
  });

  it('resumes after a reload from the tab session and sends its CSRF token with writes', () => {
    const { http } = setup();
    const api = TestBed.inject(CustomerApi);

    void api.cancelConfirmation(CASE_ID, 'question_1', {
      expectedCaseRevision: 3,
      reason: 'new_question',
    });

    const request = http.expectOne(
      `/api/cases/${CASE_ID}/customer-confirmations/question_1/cancel`,
    );
    expect(request.request.headers.get('X-CSRF-Token')).toBe('csrf_1');
  });

  it('forgets the session on request', () => {
    setup();
    const api = TestBed.inject(CustomerApi);

    api.clearSession();

    expect(api.session()).toBeNull();
    expect(sessionStorage.getItem(CUSTOMER_SESSION_KEY)).toBeNull();
  });
});
