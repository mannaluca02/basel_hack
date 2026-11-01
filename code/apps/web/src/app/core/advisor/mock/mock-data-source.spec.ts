import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { APP_ENVIRONMENT } from '../../config/app-environment';
import { provideI18nTesting } from '../../i18n/i18n-testing';
import { AppLanguage, LOCALES } from '../../i18n/language';
import { AdvisorDataSource, AdvisorEvent, AdvisorEventType } from '../advisor-data-source';
import { AgentReply, PILLARS } from '../contracts';
import { provideAdvisorDataSource } from '../provide-advisor-data-source';
import { MOCK_CALL_SCRIPT } from './mock-call-script';
import { MockDataSource } from './mock-data-source';

const EVENT_TYPES: readonly AdvisorEventType[] = [
  'agent',
  'transcript',
  'reply',
  'progress',
  'analysis',
  'chart',
  'risk',
  'info',
  'summary',
  'context',
];

function buildAll(language: 'de' | 'en' = 'de'): AdvisorEvent[] {
  return MOCK_CALL_SCRIPT.map((step, index) =>
    step.build({
      language,
      locale: LOCALES[language],
      at: '2026-10-31T10:00:00.000Z',
      messageId: `message_mock_${index + 1}`,
    }),
  );
}

function ofType<T extends AdvisorEventType>(events: readonly AdvisorEvent[], type: T) {
  return events.filter((e): e is Extract<AdvisorEvent, { type: T }> => e.type === type);
}

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideI18nTesting(),
      provideAdvisorDataSource(),
      {
        provide: APP_ENVIRONMENT,
        useValue: { apiBaseUrl: '/api', dataSource: 'mock' },
      },
    ],
  });
}

describe('provideAdvisorDataSource', () => {
  it('uses the scripted mock when dataSource is "mock"', () => {
    setup();
    expect(TestBed.inject(AdvisorDataSource)).toBeInstanceOf(MockDataSource);
  });
});

describe('MOCK_CALL_SCRIPT', () => {
  const events = buildAll();

  it('is sorted and lasts about three minutes', () => {
    const offsets = MOCK_CALL_SCRIPT.map((step) => step.atMs);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(offsets.at(-1)).toBeGreaterThanOrEqual(150_000);
    expect(offsets.at(-1)).toBeLessThanOrEqual(210_000);
  });

  it('emits every event type the tabs and the avatar ring need', () => {
    expect(new Set(events.map((e) => e.type))).toEqual(new Set(EVENT_TYPES));
    expect(new Set(ofType(events, 'agent').map((e) => e.payload.activity))).toEqual(
      new Set(['listening', 'thinking', 'speaking', 'idle']),
    );
  });

  it('updates every chart in place at least once after it first appears', () => {
    const revisions = new Map<string, number[]>();
    for (const { payload } of ofType(events, 'chart')) {
      revisions.set(payload.chartId, [...(revisions.get(payload.chartId) ?? []), payload.revision]);
    }
    expect(revisions.size).toBe(4);
    for (const list of revisions.values()) expect(list).toEqual([1, 2]);
  });

  it('turns an unknown risk into an identified one under the same id', () => {
    const retirement = ofType(events, 'risk')
      .map((e) => e.payload)
      .filter((r) => r.riskId === 'risk_retirement_gap');
    expect(retirement.map((r) => [r.status, r.amount?.amount ?? null])).toEqual([
      ['needs_data', null],
      ['identified', 272_000],
    ]);
  });

  it('only increases progress and ends at 100 % with the review still open', () => {
    const progress = ofType(events, 'progress').map((e) => e.payload);
    const percents = progress.map((p) => p.percent ?? -1);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(progress.at(-1)?.percent).toBe(100);
    expect(progress.at(-1)?.reviewOpen).toBe(true);
  });

  it('always covers all three pillars (rule 2)', () => {
    for (const { payload } of ofType(events, 'summary')) {
      expect(Object.keys(payload.pillars).sort()).toEqual([...PILLARS].sort());
    }
    for (const { payload } of ofType(events, 'chart')) {
      if (payload.type !== 'income_timeline') continue;
      for (const pillar of PILLARS) {
        expect(payload.series[pillar].values).toHaveLength(payload.years.length);
      }
    }
  });

  it('keeps the product gate closed until the suitability check (rules 1 and 6)', () => {
    const summaries = ofType(events, 'summary').map((e) => e.payload);
    expect(summaries[0].productGate.needsCaptured).toBe(false);
    expect(summaries.every((s) => !s.productGate.suitabilityCheckDone)).toBe(true);
  });

  it('contains no persona names or full birth dates (rule 7)', () => {
    const text = JSON.stringify([buildAll('de'), buildAll('en')]);
    expect(text).not.toMatch(/\b(TEST|Nina|Tom|Mila|Leo)\b/);
    expect(text).not.toMatch(/\b\d{1,2}\.\d{1,2}\.(19|20)\d{2}\b/);
  });

  it('gives every emitted message a unique id', () => {
    const ids = events.flatMap((e) => ('messageId' in e.payload ? [e.payload.messageId] : []));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has the same structure in German and English, with different texts', () => {
    const english = buildAll('en');
    expect(english.map((e) => e.type)).toEqual(events.map((e) => e.type));
    expect(ofType(english, 'reply')[0].payload.text).not.toBe(
      ofType(events, 'reply')[0].payload.text,
    );
  });
});

describe('MockDataSource', () => {
  let source: AdvisorDataSource;
  let received: AdvisorEvent[];
  const lastReply = (): AgentReply | undefined => ofType(received, 'reply').at(-1)?.payload;

  beforeEach(() => {
    setup();
    source = TestBed.inject(AdvisorDataSource);
    received = [];
    source.events.subscribe((event) => received.push(event));
  });

  afterEach(() => vi.useRealTimers());

  it('replays the full call and ends with a complete snapshot', async () => {
    vi.useFakeTimers();
    source.connect();
    vi.advanceTimersByTime(MOCK_CALL_SCRIPT.at(-1)!.atMs + 1_000);

    expect(received).toHaveLength(MOCK_CALL_SCRIPT.length);
    const snapshot = await firstValueFrom(source.snapshot());
    expect(snapshot.agent.activity).toBe('idle');
    expect(snapshot.progress?.percent).toBe(100);
    expect(snapshot.charts.map((c) => [c.chartId, c.revision])).toEqual([
      ['chart_life_events', 2],
      ['chart_pillar3a_growth', 2],
      ['chart_income_timeline', 2],
      ['chart_event_impact', 2],
    ]);
    expect(snapshot.risks).toHaveLength(4);
    expect(snapshot.info).toHaveLength(6);
    expect(snapshot.transcript.every((line) => line.status === 'final')).toBe(true);
    expect(snapshot.summary?.snapshotId).toBe('snapshot_mock_02');
    expect(snapshot.contextRevision).toBe(13);
  });

  it('pauses the call while disconnected and resumes where it stopped', () => {
    vi.useFakeTimers();
    const states: string[] = [];
    source.connection.subscribe((state) => states.push(state));

    source.connect();
    vi.advanceTimersByTime(30_000);
    const beforePause = received.length;
    expect(beforePause).toBeGreaterThan(0);

    source.disconnect();
    vi.advanceTimersByTime(60_000);
    expect(received).toHaveLength(beforePause);

    source.connect();
    vi.advanceTimersByTime(10_000);
    expect(received.length).toBeGreaterThan(beforePause);
    expect(states).toEqual(['disconnected', 'connected', 'disconnected', 'connected']);
  });

  it('writes texts in the current UI language', async () => {
    await TestBed.inject(AppLanguage).use('en');
    vi.useFakeTimers();
    source.connect();
    vi.advanceTimersByTime(1_000);

    expect(lastReply()?.locale).toBe('en-CH');
    expect(lastReply()?.text).toMatch(/^Hello!/);
  });

  it('falls back to German texts for French, with the French locale', async () => {
    await TestBed.inject(AppLanguage).use('fr');
    vi.useFakeTimers();
    source.connect();
    vi.advanceTimersByTime(1_000);

    expect(lastReply()?.locale).toBe('fr-CH');
    expect(lastReply()?.text).toMatch(/^Grüezi!/);
  });
});
