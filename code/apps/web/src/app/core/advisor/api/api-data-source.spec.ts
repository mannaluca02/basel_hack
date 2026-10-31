import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { APP_ENVIRONMENT } from '../../config/app-environment';
import { CONSENT_NOTICE_VERSION } from '../../consent/consent';
import { provideI18nTesting } from '../../i18n/i18n-testing';
import { AdvisorDataSource, AdvisorEvent, AdvisorSnapshot, ConnectionState } from '../advisor-data-source';
import { provideAdvisorDataSource } from '../provide-advisor-data-source';
import { ApiDataSource } from './api-data-source';
import { CUSTOMER_SESSION_KEY, CustomerApi } from './customer-api';
import mueller from './mueller-case.testing.json';
import { FakeEventSource } from './review-testing';

const CASE_ID = 'case_api';

function setup(
  session: object | null = { csrfToken: 'csrf_1', caseId: CASE_ID },
  demoStart = false,
) {
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
        useValue: { production: false, apiBaseUrl: '/api', dataSource: 'api', demoStart },
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

  it('takes the ready demo case from the backend when started as a demo', async () => {
    const { source, http } = setup(null, true);

    source.connect();
    const start = http.expectOne('/api/demo/start');
    expect(start.request.method).toBe('POST');
    start.flush({ csrfToken: 'csrf_demo', caseId: CASE_ID, expiresAt: '2026-10-31T13:00:00.000Z' });
    await new Promise((resolve) => setTimeout(resolve));

    expect(FakeEventSource.instances.map((s) => s.url)).toEqual([
      `/api/cases/${CASE_ID}/advisor/events`,
    ]);
    expect(TestBed.inject(CustomerApi).session()).toEqual({ csrfToken: 'csrf_demo', caseId: CASE_ID });
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

  it('pushes the current charts, risks, history and summary after a context event', async () => {
    const { source, http } = setup();
    const events: AdvisorEvent[] = [];
    source.events.subscribe((event) => events.push(event));
    source.connect();
    FakeEventSource.instances[0].open();

    FakeEventSource.instances[0].emit('advisor.context.updated', { contextRevision: 13 });
    http.expectOne(`/api/cases/${CASE_ID}`).flush(mueller.case);
    http.expectOne(`/api/cases/${CASE_ID}/advisor/context`).flush(mueller.context);
    http.expectOne(`/api/cases/${CASE_ID}/summaries`).flush(mueller.summaries);
    http.expectOne(`/api/cases/${CASE_ID}/voice/agent-turns`).flush({ turns: [] });
    http.expectOne(`/api/cases/${CASE_ID}/voice/sessions`).flush({ caseId: CASE_ID, sessions: [] });
    http.expectOne(`/api/cases/${CASE_ID}/suitability`).flush({ checks: [] });
    await new Promise((resolve) => setTimeout(resolve));

    const types = events.map((event) => event.type);
    expect(types[0]).toBe('context');
    expect(types.filter((type) => type === 'chart')).toHaveLength(4);
    expect(types).toContain('risk');
    expect(types).toContain('progress');
    expect(types.at(-1)).toBe('summary');
  });

  it('starts the demo case again when the stored demo session was refused', async () => {
    const { source, http } = setup({ csrfToken: 'csrf_old', caseId: 'case_old' }, true);
    source.connect();
    FakeEventSource.instances[0].fail({ closed: true });

    http.expectOne('/api/demo/start').flush({ csrfToken: 'csrf_new', caseId: CASE_ID });
    await new Promise((resolve) => setTimeout(resolve));

    expect(FakeEventSource.instances.map((stream) => stream.url)).toEqual([
      '/api/cases/case_old/advisor/events',
      `/api/cases/${CASE_ID}/advisor/events`,
    ]);
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
      estimates: [],
      activeRunId: null,
      proposalBatches: [],
    });
    const missing = { status: 404, statusText: 'Not Found' };
    http.expectOne(`/api/cases/${CASE_ID}/advisor/context`).flush({ code: 'NOT_FOUND' }, missing);
    http.expectOne(`/api/cases/${CASE_ID}/summaries`).flush({ code: 'NOT_FOUND' }, missing);
    http.expectOne(`/api/cases/${CASE_ID}/suitability`).flush({ code: 'NOT_FOUND' }, missing);
    http.expectOne(`/api/cases/${CASE_ID}/voice/agent-turns`).flush({
      turns: [{ messageId: 'conv_a0', conversationId: 'conv', speaker: 'agent', text: 'Hoi', at: '2026-10-31T12:00:00.000Z' }],
    });
    // The app's own live voice: only sessions with turns are read, merged by time.
    http.expectOne(`/api/cases/${CASE_ID}/voice/sessions`).flush({
      caseId: CASE_ID,
      sessions: [
        { id: 'voice_live', createdAt: '2026-10-31T12:01:00.000Z', turnCount: 1 },
        { id: 'voice_empty', createdAt: '2026-10-31T12:02:00.000Z', turnCount: 0 },
      ],
    });
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne(`/api/cases/${CASE_ID}/voice/sessions/voice_live/transcript`).flush({
      caseId: CASE_ID,
      voiceSession: { id: 'voice_live' },
      turns: [{ speaker: 'customer', receivedAt: '2026-10-31T12:01:30.000Z', log: { messageId: 'turn_1', text: 'Grüezi' } }],
    });

    expect(await snapshot).toMatchObject({
      caseId: CASE_ID,
      contextRevision: 12,
      charts: [],
      summary: null,
      transcript: [
        { entryId: 'conv_a0', speaker: 'agent', text: 'Hoi', status: 'final' },
        { entryId: 'turn_1', speaker: 'customer', text: 'Grüezi', status: 'final' },
      ],
    });
  });

  it('rebinds the stream and rejects former-session snapshots even when authentication returns the same case ID', async () => {
    const { source, states, http } = setup();
    const events: AdvisorEvent[] = [], snapshots: AdvisorSnapshot[] = [];
    source.events.subscribe(event => events.push(event));
    source.connect();
    const oldStream = FakeEventSource.instances[0]; oldStream.open();
    source.snapshot().subscribe(snapshot => snapshots.push(snapshot));
    const oldRead = http.expectOne(`/api/cases/${CASE_ID}`);
    const oldRelatedReads = http.match(request => request.method === 'GET');
    const login = TestBed.inject(CustomerApi).signIn('replacement-access-code');
    http.expectOne('/api/sessions').flush({ csrfToken: 'csrf_replacement' });
    await new Promise(resolve => setTimeout(resolve));
    http.expectOne('/api/cases').flush({ id: CASE_ID });
    await login;

    source.connect();
    expect(oldStream.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
    const currentStream = FakeEventSource.instances[1]; currentStream.open();
    const update = { caseId: CASE_ID, contextRevision: 8, reason: 'human_handover_requested' };
    oldStream.emit('advisor.context.updated', update); oldStream.fail({ closed: true }); oldStream.open();
    expect(currentStream.closed).toBe(false);
    expect(states.at(-1)).toBe('connected');
    expect(events).toEqual([]);
    currentStream.emit('advisor.context.updated', update);
    expect(events).toEqual([{ type: 'context', payload: update }]);
    oldRead.flush({ ...mueller.case, id: CASE_ID, contextRevision: 100 });
    for(const request of oldRelatedReads)request.flush({code:'NOT_FOUND'},{status:404,statusText:'Not Found'});
    source.disconnect();
    for(const request of http.match(request => request.method === 'GET')){
      if(request.request.url===`/api/cases/${CASE_ID}`)request.flush({...mueller.case,id:CASE_ID});
      else request.flush({code:'NOT_FOUND'},{status:404,statusText:'Not Found'});
    }
    await new Promise(resolve => setTimeout(resolve));
    expect(snapshots).toEqual([]);
    http.verify();
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
