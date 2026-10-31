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
import { InfoItem, LifeEventsChart, RiskItem, TranscriptEntry } from '../ui-models';

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
