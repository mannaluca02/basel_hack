import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import {
  AdvisorDataSource,
  AdvisorEvent,
  AdvisorEventType,
  AdvisorSnapshot,
  ConnectionState,
  emptySnapshot,
} from '../advisor-data-source';
import { AdvisorContextUpdate, AgentReply, AnalysisResult, ProgressSnapshot } from '../contracts';
import {
  EventImpactChart,
  IncomeTimelineChart,
  InfoItem,
  LifeEventsChart,
  MoneySeries,
  Pillar3aGrowthChart,
  RiskItem,
  TranscriptEntry,
} from '../ui-models';

/** Synthetic fixtures for the store specs. No persona data. */

const AT = '2026-10-31T10:00:00.000Z';
export const CASE_ID = 'case_test';

const header = (messageId: string) =>
  ({
    schemaVersion: '1.0',
    messageId,
    caseId: CASE_ID,
    correlationId: 'correlation_test',
  }) as const;

export function event<T extends AdvisorEventType>(
  type: T,
  payload: Extract<AdvisorEvent, { type: T }>['payload'],
): AdvisorEvent {
  return { type, payload } as AdvisorEvent;
}

export function chart(overrides: Partial<LifeEventsChart> = {}): LifeEventsChart {
  return {
    chartId: 'chart_a',
    type: 'life_events',
    status: 'valid',
    revision: 1,
    updatedAt: AT,
    reviewReasons: [],
    profileVersion: 1,
    scenarioVersionId: 'scenario_1',
    fromYear: 2020,
    toYear: 2060,
    events: [],
    ...overrides,
  };
}

const valid = (values: readonly (number | null)[]): MoneySeries => ({ values, status: 'valid' });

/** Two years; pillar 2 and the gap are unknown in the second one. Amounts in Rappen. */
export function incomeChart(overrides: Partial<IncomeTimelineChart> = {}): IncomeTimelineChart {
  return {
    chartId: 'chart_income',
    type: 'income_timeline',
    status: 'needs_input',
    revision: 1,
    updatedAt: AT,
    reviewReasons: [],
    profileVersion: 1,
    scenarioVersionId: 'scenario_1',
    runId: 'run_01',
    unit: { currency: 'CHF', unit: 'cent', period: 'year', basis: 'gross' },
    years: [2030, 2060],
    series: {
      employment: valid([10_000_000, 0]),
      pillar1: { values: [0, 3_000_000], status: 'estimated' },
      pillar2: { values: [0, null], status: 'needs_input' },
      pillar3: valid([0, 600_000]),
      gap: { values: [0, null], status: 'needs_input' },
    },
    target: valid([null, 8_000_000]),
    milestones: [
      { year: 2030, kind: 'today' },
      { year: 2060, kind: 'first_pension' },
    ],
    ...overrides,
  };
}

export function impactChart(overrides: Partial<EventImpactChart> = {}): EventImpactChart {
  return {
    chartId: 'chart_impact',
    type: 'event_impact',
    status: 'estimated',
    revision: 1,
    updatedAt: AT,
    reviewReasons: [],
    profileVersion: 1,
    scenarioVersionId: 'scenario_1',
    runId: 'run_01',
    unit: { currency: 'CHF', unit: 'cent', period: 'month', basis: 'gross' },
    scenarios: [
      {
        event: 'disability',
        personId: 'person_test',
        status: 'estimated',
        incomeBefore: 1_000_000,
        incomeAfter: { employment: 400_000, pillar1: 200_000, pillar2: 300_000, pillar3: 0 },
        needed: 950_000,
        gap: 50_000,
      },
    ],
    ...overrides,
  };
}

export function pillar3aChart(overrides: Partial<Pillar3aGrowthChart> = {}): Pillar3aGrowthChart {
  return {
    chartId: 'chart_3a',
    type: 'pillar3a_growth',
    status: 'valid',
    revision: 1,
    updatedAt: AT,
    reviewReasons: [],
    profileVersion: 1,
    scenarioVersionId: 'scenario_1',
    runId: 'run_01',
    unit: { currency: 'CHF', unit: 'cent', period: 'once', basis: 'capital' },
    years: [2030, 2040],
    series: {
      withContributions: valid([1_000_000, 8_000_000]),
      withoutContributions: valid([1_000_000, 1_200_000]),
    },
    taxSaving: null,
    ...overrides,
  };
}

export function risk(overrides: Partial<RiskItem> = {}): RiskItem {
  return {
    riskId: 'risk_a',
    category: 'retirement',
    severity: 'medium',
    pillars: ['pillar1', 'pillar2', 'pillar3'],
    amount: null,
    status: 'needs_data',
    resultStatus: 'needs_input',
    title: 'Risk',
    explanation: 'Explanation',
    profileVersion: 1,
    scenarioVersionId: 'scenario_1',
    ...overrides,
  };
}

export function info(overrides: Partial<InfoItem> = {}): InfoItem {
  return {
    infoId: 'info_a',
    category: 'basics',
    title: 'Info',
    body: 'Body',
    at: AT,
    ...overrides,
  };
}

export function analysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    ...header('message_analysis'),
    profileVersion: 1,
    scenarioVersionId: 'scenario_1',
    runId: 'run_01',
    calculationInputHash: 'hash_01',
    areaStatus: { retirement: 'valid' },
    metrics: [],
    sourceRefs: [],
    reviewReasons: [],
    ...overrides,
  };
}

export function reply(overrides: Partial<AgentReply> = {}): AgentReply {
  return {
    ...header('message_reply'),
    turnId: 'turn_1',
    replyId: 'reply_1',
    kind: 'explanation',
    text: 'Text',
    locale: 'de-CH',
    references: [],
    requiresConfirmation: false,
    contextRevision: 1,
    ...overrides,
  };
}

export function line(overrides: Partial<TranscriptEntry> = {}): TranscriptEntry {
  return {
    entryId: 'entry_1',
    turnId: 'turn_1',
    speaker: 'customer',
    text: 'Text',
    status: 'final',
    at: AT,
    ...overrides,
  };
}

export function contextUpdate(contextRevision: number): AdvisorContextUpdate {
  return {
    ...header(`message_context_${contextRevision}`),
    eventId: `event_${contextRevision}`,
    contextRevision,
    reason: 'confirmed_profile_changed',
    contextRef: `/api/cases/${CASE_ID}/advisor/context`,
    interruptPolicy: 'if_current_answer_invalid',
  };
}

export function progress(overrides: Partial<ProgressSnapshot> = {}): ProgressSnapshot {
  return {
    ...header('message_progress'),
    profileVersion: 1,
    domain: 'data_capture',
    percent: 60,
    groups: [
      { groupId: 'household', status: 'done' },
      { groupId: 'pillar3', status: 'open' },
    ],
    openGroups: ['pillar3'],
    reviewOpen: false,
    ...overrides,
  };
}

export function snapshot(overrides: Partial<AdvisorSnapshot> = {}): AdvisorSnapshot {
  return { ...emptySnapshot(CASE_ID), ...overrides };
}

/** Data source the spec drives by hand: push events, choose what `snapshot()` answers. */
export class FakeDataSource extends AdvisorDataSource {
  readonly eventStream = new Subject<AdvisorEvent>();
  readonly connectionState = new BehaviorSubject<ConnectionState>('disconnected');
  readonly events = this.eventStream.asObservable();
  readonly connection = this.connectionState.asObservable();
  snapshotRequests = 0;
  nextSnapshot: Observable<AdvisorSnapshot> = of(snapshot());

  snapshot(): Observable<AdvisorSnapshot> {
    this.snapshotRequests++;
    return this.nextSnapshot;
  }

  connect(): void {
    if (this.connectionState.value !== 'connected') this.connectionState.next('connected');
  }

  disconnect(): void {
    if (this.connectionState.value === 'connected') this.connectionState.next('disconnected');
  }

  emit(...events: AdvisorEvent[]): void {
    for (const e of events) this.eventStream.next(e);
  }
}
