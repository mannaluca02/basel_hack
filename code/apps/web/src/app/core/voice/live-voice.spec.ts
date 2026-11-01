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

  it('ends a call that has no person to speak for', () => {
    live.state.set('connected');
    TestBed.tick();
    expect(live.state()).toBe('idle');
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

