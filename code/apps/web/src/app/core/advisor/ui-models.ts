import { MoneyUnit, Money, Pillar, ResultStatus, VersionRefs } from './contracts';

/**
 * Data the UI needs that has no interface contract yet. These are frontend proposals; FE-06 (#13)
 * aligns them with the owners (risks/charts: Valentin, transcript: Dario, info: Earnie). Text
 * fields arrive already translated into the locale the frontend asked for.
 */

// --- Agent presentation (avatar ring states) ---------------------------------------------------

/** Technical agent state from plan 5.6; `speaking` only after real audio start (I06). */
export type AgentActivity = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface AgentPresentation {
  readonly activity: AgentActivity;
  readonly turnId?: string;
  readonly replyId?: string;
  /** ISO timestamp. */
  readonly at: string;
}

// --- Transcript (call history, Dario) ----------------------------------------------------------

export type Speaker = 'customer' | 'agent';

export interface TranscriptEntry {
  /** Stable per line: interim updates and the final text share one id. */
  readonly entryId: string;
  readonly turnId: string;
  readonly speaker: Speaker;
  readonly text: string;
  readonly status: 'interim' | 'final';
  /** ISO timestamp. */
  readonly at: string;
  /** Set for agent lines: the I05 reply that was spoken. */
  readonly replyId?: string;
}

// --- Risks (Valentin) --------------------------------------------------------------------------

export type RiskCategory =
  'retirement' | 'disability' | 'death' | 'longevity' | 'liquidity' | 'home_purchase';

export type RiskSeverity = 'low' | 'medium' | 'high';
export type RiskStatus = 'identified' | 'needs_data' | 'addressed';

export interface RiskItem extends VersionRefs {
  readonly riskId: string;
  readonly category: RiskCategory;
  readonly severity: RiskSeverity;
  readonly pillars: readonly Pillar[];
  /** The gap behind the risk, if quantified; `null` when not (yet) known. */
  readonly amount: Money | null;
  readonly status: RiskStatus;
  /** Status of the underlying figure, e.g. `estimated` while a certificate is missing. */
  readonly resultStatus: ResultStatus;
  readonly title: string;
  readonly explanation: string;
  readonly relatedChartId?: string;
  readonly relatedInfoId?: string;
}

// --- Info cards (Earnie) -----------------------------------------------------------------------

/** Neutral information only; product content never goes to the Info tab. */
export type InfoCategory = 'basics' | 'term' | 'assumption';

export interface InfoItem {
  readonly infoId: string;
  readonly category: InfoCategory;
  readonly title: string;
  readonly body: string;
  /** ISO timestamp of when the advisor pushed it. */
  readonly at: string;
  readonly sourceRef?: string;
  readonly relatedChartId?: string;
  readonly relatedRiskId?: string;
}

// --- Charts (Valentin / Earnie) ----------------------------------------------------------------

export type ChartType = 'income_timeline' | 'event_impact' | 'pillar3a_growth' | 'life_events';

interface ChartBase extends VersionRefs {
  readonly chartId: string;
  readonly type: ChartType;
  readonly status: ResultStatus;
  /** Increments with every update of this chartId; an update replaces the card content in place. */
  readonly revision: number;
  /** ISO timestamp. */
  readonly updatedAt: string;
  readonly reviewReasons: readonly string[];
}

/** One value per category (e.g. per year), in Rappen; `null` means unknown for that point. */
export interface MoneySeries {
  readonly values: readonly (number | null)[];
  readonly status: ResultStatus;
}

/** FE-12: stacked household income from today to retirement, gap after retirement. */
export interface IncomeTimelineChart extends ChartBase {
  readonly type: 'income_timeline';
  readonly unit: MoneyUnit;
  readonly years: readonly number[];
  /** Every pillar is always present (rule 2); unknown values are `null`, not dropped. */
  readonly series: Readonly<Record<'employment' | Pillar | 'gap', MoneySeries>>;
  readonly target: MoneySeries;
}

export type ImpactEventKind = 'disability' | 'death' | 'retirement';

export interface EventImpactScenario {
  readonly event: ImpactEventKind;
  /** The person the event happens to. */
  readonly personId: string;
  readonly status: ResultStatus;
  readonly incomeBefore: number | null;
  readonly incomeAfter: Readonly<Record<'employment' | Pillar, number | null>>;
  readonly needed: number | null;
  /** `0` is a calculated zero gap, `null` an unknown gap. */
  readonly gap: number | null;
}

/** FE-13: income before/after a life event compared with the needed income. */
export interface EventImpactChart extends ChartBase {
  readonly type: 'event_impact';
  readonly unit: MoneyUnit;
  readonly scenarios: readonly EventImpactScenario[];
}

/** FE-14: accumulated 3a capital with and without yearly contributions. */
export interface Pillar3aGrowthChart extends ChartBase {
  readonly type: 'pillar3a_growth';
  readonly unit: MoneyUnit;
  readonly years: readonly number[];
  readonly series: Readonly<Record<'withContributions' | 'withoutContributions', MoneySeries>>;
  readonly taxSaving: Money | null;
}

export type LifeEventKind = 'marriage' | 'child_birth' | 'home_purchase' | 'retirement' | 'today';

export interface LifeEvent {
  readonly eventId: string;
  readonly kind: LifeEventKind;
  readonly year: number;
  readonly label: string;
  readonly personId?: string;
  readonly certainty: 'past' | 'confirmed' | 'planned';
}

/** FE-15: horizontal life-event timeline. */
export interface LifeEventsChart extends ChartBase {
  readonly type: 'life_events';
  readonly fromYear: number;
  readonly toYear: number;
  readonly events: readonly LifeEvent[];
}

export type ChartResult =
  IncomeTimelineChart | EventImpactChart | Pillar3aGrowthChart | LifeEventsChart;
