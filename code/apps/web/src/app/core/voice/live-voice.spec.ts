import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdvisorDataSource, emptySnapshot } from '../advisor/advisor-data-source';
import { CUSTOMER_SESSION_KEY } from '../advisor/api/customer-api';
import { CASE_ID, reviewCase } from '../advisor/api/review-testing';
import { CaseStore } from '../advisor/store/case-store';
import { FakeDataSource } from '../advisor/store/case-testing';
import { Consent } from '../consent/consent';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { provideI18nTesting } from '../i18n/i18n-testing';
import { AppLanguage } from '../i18n/language';
import { INTAKE_FIELDS } from './intake-plan';
import { LiveVoice } from './live-voice';
import { VoiceActivity } from './voice-activity';

describe('LiveVoice', () => {
  let live: LiveVoice;
  let ring: VoiceActivity;
  let source: FakeDataSource;

  /** A signed-in case with persons, as after the demo start. */
  function loadCase() {
    source.nextSnapshot = of({ ...emptySnapshot(CASE_ID), canonical: reviewCase() });
    TestBed.inject(CaseStore).refresh();
    TestBed.tick();
  }

  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem(
      CUSTOMER_SESSION_KEY,
      JSON.stringify({ caseId: CASE_ID, csrfToken: 'csrf_test' }),
    );
    source = new FakeDataSource();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        { provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: '/api', dataSource: 'api' } },
        { provide: AdvisorDataSource, useValue: source },
      ],
    });
    TestBed.inject(Consent).grant();
    live = TestBed.inject(LiveVoice);
    ring = TestBed.inject(VoiceActivity);
    TestBed.tick();
  });

  afterEach(() => TestBed.inject(HttpTestingController).match(() => true));

  it('is idle without a call and leaves the avatar ring to the advisor', () => {
    expect(live.active()).toBe(false);
    expect(live.activity()).toBe('idle');
    expect(ring.live()).toBeNull();
  });

  it('tells the avatar ring what the call is doing', () => {
    loadCase();
    expect(live.validPerson()).toBe(true);
    live.state.set('connecting');
    TestBed.tick();
    expect(ring.live()).toBe('thinking');

    live.state.set('connected');
    TestBed.tick();
    expect(ring.live()).toBe('listening');

    // An evaluated customer turn shows as thinking until the backend answered.
    live.evaluating.set(true);
    TestBed.tick();
    expect(ring.live()).toBe('thinking');
    live.evaluating.set(false);

    live.stop();
    TestBed.tick();
    expect(live.state()).toBe('idle');
    expect(ring.live()).toBeNull();
  });

  it('reports a failed call as an error, but hands the ring back once it is over', () => {
    live.state.set('error');
    TestBed.tick();
    expect(live.activity()).toBe('error');
    expect(ring.live()).toBeNull();
  });

  it('asks for both consents again after a language change', async () => {
    live.consent.set(true);
    live.extractionConsent.set(true);

    await TestBed.inject(AppLanguage).use('fr');
    TestBed.tick();

    expect(live.consent()).toBe(false);
    expect(live.extractionConsent()).toBe(false);
  });

  it('speaks for the first person of the case', () => {
    loadCase();
    expect(live.personId()).toBe(reviewCase().draft.financial!.persons[0].id);
  });

  it('ends a call when the person it speaks for disappears', () => {
    loadCase();
    live.state.set('connected');
    TestBed.tick();
    source.nextSnapshot = of({ ...emptySnapshot(CASE_ID), canonical: reviewCase({ draft: { ...reviewCase().draft, financial: null, insurance: null } }) });
    TestBed.inject(CaseStore).refresh();
    TestBed.tick();
    expect(live.state()).toBe('idle');
  });

  it('talks to set up the first person while the case has none (live start)', () => {
    source.nextSnapshot = of({ ...emptySnapshot(CASE_ID), canonical: reviewCase({ draft: { ...reviewCase().draft, financial: null, insurance: null } }) });
    TestBed.inject(CaseStore).refresh();
    TestBed.tick();
    expect(live.setupMode()).toBe(true);
    expect(live.speakable()).toBe(true);
    expect(live.personId()).toBe('');
    live.state.set('connected');
    TestBed.tick();
    // No person yet is no reason to end the call.
    expect(live.state()).toBe('connected');
  });

  it('offers no call without a loaded case: no person, not available', () => {
    expect(live.persons()).toEqual([]);
    expect(live.validPerson()).toBe(false);
    expect(live.available()).toBe(false);
  });

  it('hands Paxi\'s reply emotions to the shell during a call and clears them after it', () => {
    loadCase();
    live.state.set('connected');
    TestBed.tick();
    const transport = (live as unknown as { voice: { options: { onEvent(event: unknown): void } } }).voice.options;
    transport.onEvent({ type: 'emotion', emotion: 'curious' });
    transport.onEvent({ type: 'emotion', emotion: 'curious' });
    expect(ring.emotion()?.emotion).toBe('curious');
    expect(ring.emotion()?.seq).toBe(2);

    live.stop();
    TestBed.tick();
    expect(ring.emotion()).toBeNull();
  });
});


describe('LiveVoice in the live build', () => {
  function setup(liveStart: boolean) {
    sessionStorage.clear();
    sessionStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify({ caseId: CASE_ID, csrfToken: 'csrf_test' }));
    const source = new FakeDataSource();
    source.nextSnapshot = of({ ...emptySnapshot(CASE_ID), canonical: reviewCase() });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        { provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: '/api', dataSource: 'api', demoStart: true, liveStart } },
        { provide: AdvisorDataSource, useValue: source },
      ],
    });
    TestBed.inject(Consent).grant();
    const live = TestBed.inject(LiveVoice);
    TestBed.inject(CaseStore).refresh();
    TestBed.tick();
    // A running call: the transport reports a settled customer turn.
    (live as unknown as { sessionId: string }).sessionId = 'session_1';
    const transport = (live as unknown as { voice: { options: { onTurn(speaker: string, text: string, how: string): void } } }).voice.options;
    return { live, source, http: TestBed.inject(HttpTestingController), say: (text: string) => transport.onTurn('customer', text, 'client-settled') };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  async function answerTurn(http: HttpTestingController) {
    await settle();
    http.expectOne(`/api/cases/${CASE_ID}`).flush(reviewCase());
    await settle();
    http.expectOne(`/api/cases/${CASE_ID}/voice/sessions/session_1/turns`).flush({});
    await settle();
    http.expectOne(`/api/cases/${CASE_ID}/voice-lab/turns`).flush({
      mode: 'live', source: { text: 'x' },
      extraction: { adapter: 'model-v1', route: 'VoiceIntegrationService.propose', result: { proposalBatch: { id: 'batch_1' }, issues: [] } },
    });
    await settle();
  }

  it('takes what Paxi heard into the case at once, without the acceptance card', async () => {
    const { http, say } = setup(true);
    say('Ich verdiene 95000 Franken brutto im Jahr.');
    await answerTurn(http);
    const accept = http.expectOne(`/api/cases/${CASE_ID}/demo-accept`);
    expect(accept.request.headers.get('X-CSRF-Token')).toBe('csrf_test');
    accept.flush({ accepted: ['batch_1'], skipped: [], profileVersion: null, runs: [], missing: ['goals'] });
    await settle();
  });

  it('leaves the acceptance to the customer outside the live build', async () => {
    const { http, say } = setup(false);
    say('Ich verdiene 95000 Franken brutto im Jahr.');
    await answerTurn(http);
    http.expectNone(`/api/cases/${CASE_ID}/demo-accept`);
  });

  /** Every intake field given up on, so the profile questions are next. */
  const intakeThrough = (live: LiveVoice) =>
    live.intake.set({ attempts: Object.fromEntries(INTAKE_FIELDS.map((id) => [id, 2])), clarifications: {} });
  const steer = (live: LiveVoice) =>
    (live as unknown as { steer(rows: unknown): { done: boolean; nextQuestion: string | null } }).steer(live.rows());

  it('asks the profile questions of the backend once the intake fields are through, and only then is done', () => {
    const { live } = setup(true);
    intakeThrough(live);
    expect(steer(live)).toMatchObject({ done: false, nextQuestion: null });
    live.caseAsks.set([{ key: 'goals', text: 'Was möchten Sie erreichen?' }]);
    expect(steer(live)).toMatchObject({ done: false, nextQuestion: 'Was möchten Sie erreichen?' });
    live.caseAsks.set([]);
    expect(steer(live).done).toBe(true);
  });

  it('once nothing is open, hands Paxi the calculated result to explain itself, not to a colleague', () => {
    const { live, source } = setup(true);
    const presentation = {
      ...reviewCase().presentation,
      recommendations: [{ candidates: [{ productName: 'Pax 3a', explanation: 'Vorsorgelücke' }] }],
      activeRun: { metrics: [{ label: 'Rentenlücke', formatted: 'CHF 1’200', periodLabel: 'pro Monat', valueCents: 120000 }, { label: 'Leer', formatted: '–', periodLabel: '', valueCents: null }] },
    } as unknown as ReturnType<typeof reviewCase>['presentation'];
    source.nextSnapshot = of({ ...emptySnapshot(CASE_ID), canonical: reviewCase({ presentation }) });
    TestBed.inject(CaseStore).refresh();
    TestBed.tick();
    intakeThrough(live);
    live.caseAsks.set([]);
    expect(steer(live)).toMatchObject({ done: true, analysis: { products: [{ product: 'Pax 3a', why: 'Vorsorgelücke' }], keyFigures: ['Rentenlücke: CHF 1’200 (pro Monat)'] } });
    // While a question is open there is nothing to explain yet.
    live.caseAsks.set([{ key: 'goals', text: 'Ziele?' }]);
    expect(steer(live)).not.toHaveProperty('analysis');
  });

  it('keeps the intake steering outside the live build', () => {
    const { live } = setup(false);
    intakeThrough(live);
    live.caseAsks.set([{ key: 'goals', text: 'Was möchten Sie erreichen?' }]);
    expect(live.caseAsk()).toBeNull();
    expect(steer(live).done).toBe(true);
  });

  it('takes the answers over and reloads the open questions', async () => {
    const { live, http, say } = setup(true);
    intakeThrough(live);
    live.caseAsks.set([{ key: 'goals', text: 'Ziele?' }, { key: 'insurance.relationshipSinceYear', text: 'Seit wann?' }]);
    const turn = async (answers: { proposalBatch: unknown; answered: string[] }) => {
      await settle();
      http.expectOne(`/api/cases/${CASE_ID}`).flush(reviewCase());
      await settle();
      http.expectOne(`/api/cases/${CASE_ID}/voice/sessions/session_1/turns`).flush({});
      await settle();
      const request = http.expectOne(`/api/cases/${CASE_ID}/voice-lab/turns`);
      bodies.push(request.request.body);
      request.flush({
        mode: 'live', source: { text: 'x' },
        extraction: { adapter: 'model-v1', route: 'VoiceIntegrationService.propose', result: { proposalBatch: null, issues: [] }, answers },
      });
      await settle();
    };
    const bodies: { askedKey?: string }[] = [];

    say('Wir wollen für die Pension sparen.');
    await turn({ proposalBatch: { id: 'ask_1' }, answered: ['goals'] });
    // The question Paxi is on goes along, so the answer fills that field and no other.
    expect(bodies[0].askedKey).toBe('goals');
    http.expectOne(`/api/cases/${CASE_ID}/demo-accept`).flush({ accepted: ['ask_1'], skipped: [], profileVersion: null, runs: [], missing: [] });
    await settle();
    http.match((r) => r.url === `/api/cases/${CASE_ID}`).forEach((r) => r.flush(reviewCase()));
    http.expectOne(`/api/cases/${CASE_ID}/voice-lab/questions`).flush({ asks: [{ key: 'insurance.relationshipSinceYear', text: 'Seit wann?' }, { key: 'insurance.sharedChildren', text: 'Kinder?' }] });
    await settle();
    expect(live.caseAsk()?.key).toBe('insurance.relationshipSinceYear');

    // An answer Paxi had no chance to ask for yet (no agent line since) costs nothing.
    say('Hmm.');
    await turn({ proposalBatch: null, answered: [] });
    expect(live.caseAsk()?.key).toBe('insurance.relationshipSinceYear');
  });

  it('puts an unanswered question at the back of the queue, never away, and is done only when nothing is open', async () => {
    const { live, http, say } = setup(true);
    intakeThrough(live);
    live.caseAsks.set([{ key: 'goals', text: 'Ziele?', about: 'goals' }, { key: 'insurance.sharedChildren', text: 'Kinder?' }]);
    expect(steer(live)).toMatchObject({ done: false, nextQuestion: 'Ziele?', nextQuestionMeans: 'goals' });
    const agent = (live as unknown as { voice: { options: { onTurn(a: string, b: string, c: string): void } } }).voice.options;
    const unanswered = async (text: string) => {
      agent.onTurn('agent', 'Was ist dir wichtig?', 'client-settled');
      say(text);
      // The agent's turn and the customer's are recorded one after the other.
      for (let i = 0; i < 6; i++) {
        await settle();
        http.match(`/api/cases/${CASE_ID}`).forEach((r) => r.flush(reviewCase()));
        http.match(`/api/cases/${CASE_ID}/voice/sessions/session_1/turns`).forEach((r) => r.flush({}));
      }
      http.expectOne(`/api/cases/${CASE_ID}/voice-lab/turns`).flush({
        mode: 'live', source: { text }, extraction: { adapter: 'model-v1', route: 'x', result: { proposalBatch: null, issues: [] }, answers: { proposalBatch: null, answered: [] } },
      });
      // Checked and updated after every answer, also one that gave nothing.
      await settle();
      http.expectOne(`/api/cases/${CASE_ID}/demo-accept`).flush({ accepted: [], skipped: [], profileVersion: null, runs: [], missing: ['goals'] });
      await settle();
      http.match((r) => r.url === `/api/cases/${CASE_ID}`).forEach((r) => r.flush(reviewCase()));
      http.expectOne(`/api/cases/${CASE_ID}/voice-lab/questions`).flush({ asks: live.caseAsks() });
      await settle();
      steer(live);
    };
    await unanswered('Weiss nicht.');
    expect(live.caseAsk()?.key).toBe('insurance.sharedChildren');
    await unanswered('Auch nicht.');
    // Both tried once: the first comes round again; nothing is dropped, so not done.
    expect(live.caseAsk()?.key).toBe('goals');
    expect(steer(live).done).toBe(false);
  });

  it('sets up the person from the first sentence, then extracts that sentence again for her', async () => {
    sessionStorage.clear();
    sessionStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify({ caseId: CASE_ID, csrfToken: 'csrf_test' }));
    const empty = reviewCase({ draft: { ...reviewCase().draft, financial: null, insurance: null }, proposalBatches: [] });
    const source = new FakeDataSource();
    source.nextSnapshot = of({ ...emptySnapshot(CASE_ID), canonical: empty });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        { provide: APP_ENVIRONMENT, useValue: { apiBaseUrl: '/api', dataSource: 'api', demoStart: true, liveStart: true } },
        { provide: AdvisorDataSource, useValue: source },
      ],
    });
    TestBed.inject(Consent).grant();
    const live = TestBed.inject(LiveVoice);
    TestBed.inject(CaseStore).refresh();
    TestBed.tick();
    expect(live.setupMode()).toBe(true);
    (live as unknown as { sessionId: string }).sessionId = 'session_1';
    const http = TestBed.inject(HttpTestingController);
    (live as unknown as { voice: { options: { onTurn(a: string, b: string, c: string): void } } }).voice.options
      .onTurn('customer', 'Ich bin 34, arbeite 80 Prozent und verdiene 95000.', 'client-settled');
    const turn = { mode: 'live', source: { text: 'x' } };

    await settle();
    http.expectOne(`/api/cases/${CASE_ID}`).flush(empty);
    await settle();
    http.expectOne(`/api/cases/${CASE_ID}/voice/sessions/session_1/turns`).flush({});
    await settle();
    const setupTurn = http.expectOne(`/api/cases/${CASE_ID}/voice-lab/turns`);
    expect(setupTurn.request.body.personId).toBeUndefined();
    setupTurn.flush({ ...turn, extraction: { adapter: 'model-v1', route: 'setup', result: { proposalBatch: { id: 'setup' }, issues: [] } } });
    await settle();
    http.expectOne(`/api/cases/${CASE_ID}/demo-accept`).flush({ accepted: ['setup'], skipped: [], profileVersion: null, runs: [] });
    await settle();
    http.match((r) => r.url === `/api/cases/${CASE_ID}`).forEach((r) => r.flush(reviewCase()));
    await settle();
    const replay = http.expectOne(`/api/cases/${CASE_ID}/voice-lab/turns`);
    expect(replay.request.body).toMatchObject({ messageId: setupTurn.request.body.messageId, personId: reviewCase().draft.financial!.persons[0].id });
  });
});

