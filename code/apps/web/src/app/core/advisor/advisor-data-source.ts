import { Observable } from 'rxjs';
import type { InsuranceCaseDto } from '@pax/contracts';
import {
  AdvisorContextUpdate,
  AgentReply,
  AnalysisResult,
  ProgressSnapshot,
  SummaryBundle,
} from './contracts';
import { AgentPresentation, ChartResult, InfoItem, RiskItem, TranscriptEntry } from './ui-models';

/**
 * One live update from the advisor backend. `type` matches the planned SSE event name, `payload`
 * the event data, so `ApiDataSource` maps an SSE message one to one.
 * Items with an id (transcript entry, chart, risk, info, reply) are upserts: a known id replaces
 * the earlier version in place.
 */
export type AdvisorEvent =
  | { readonly type: 'agent'; readonly payload: AgentPresentation }
  | { readonly type: 'transcript'; readonly payload: TranscriptEntry }
  | { readonly type: 'reply'; readonly payload: AgentReply }
  | { readonly type: 'progress'; readonly payload: ProgressSnapshot }
  | { readonly type: 'analysis'; readonly payload: AnalysisResult }
  | { readonly type: 'chart'; readonly payload: ChartResult }
  | { readonly type: 'risk'; readonly payload: RiskItem }
  | { readonly type: 'info'; readonly payload: InfoItem }
  | { readonly type: 'summary'; readonly payload: SummaryBundle }
  | { readonly type: 'context'; readonly payload: AdvisorContextUpdate };

export type AdvisorEventType = AdvisorEvent['type'];

/** Full current state of one case, loaded at start and after every reconnect. */
export interface AdvisorSnapshot {
  readonly canonical?: InsuranceCaseDto;
  readonly caseId: string;
  readonly contextRevision: number;
  readonly agent: AgentPresentation;
  readonly progress: ProgressSnapshot | null;
  readonly transcript: readonly TranscriptEntry[];
  readonly replies: readonly AgentReply[];
  /** In order of first appearance: the feed order of the Graphics tab. */
  readonly charts: readonly ChartResult[];
  readonly risks: readonly RiskItem[];
  readonly info: readonly InfoItem[];
  readonly analysis: AnalysisResult | null;
  readonly summary: SummaryBundle | null;
}

/** A case before anything is known about it. */
export function emptySnapshot(caseId: string): AdvisorSnapshot {
  return {
    caseId,
    contextRevision: 0,
    agent: { activity: 'idle', at: new Date(0).toISOString() },
    progress: null,
    transcript: [],
    replies: [],
    charts: [],
    risks: [],
    info: [],
    analysis: null,
    summary: null,
  };
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

/**
 * The single seam between the UI and the advisor backend; `ApiDataSource` implements it,
 * bound by `provideAdvisorDataSource`.
 */
export abstract class AdvisorDataSource {
  /** Hot stream of live events. Subscribers only see events emitted after they subscribed. */
  abstract readonly events: Observable<AdvisorEvent>;
  /** Replays the current state to new subscribers. */
  abstract readonly connection: Observable<ConnectionState>;
  /** Current full state. Load it before applying events and again after a reconnect. */
  abstract snapshot(): Observable<AdvisorSnapshot>;
  /** Starts or resumes the live stream. Calling it while connected does nothing. */
  abstract connect(): void;
  /** Stops the live stream; the state is kept and `connect()` resumes. */
  abstract disconnect(): void;
}
