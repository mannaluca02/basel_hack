/**
 * Frontend mirror of the planned interface contracts I04, I05, I08, I09 and I10.
 * Source: documentation/baselhack/plans/interface-contracts.md (draft 1.1) and
 * documentation/baselhack/catalog/interface-contracts.json. Required fields follow the catalog;
 * fields the catalog leaves open (metric shape, summary sections, progress groups) are frontend
 * proposals and are listed in FE-06 (#13) for confirmation with the backend owners.
 *
 * Rule 3: every amount here is produced by the backend (or the mock). The UI formats it, it never
 * derives a new financial figure from it.
 */

import type { AdvisorContextUpdated } from '@pax/contracts';

/** Common message header, section 3 of the contracts. */
export interface MessageHeader {
  readonly schemaVersion: '1.0';
  readonly messageId: string;
  readonly caseId: string;
  readonly correlationId: string;
  readonly turnId?: string;
}

/** Version references that bind a displayed value to the input it was calculated from. */
export interface VersionRefs {
  readonly profileVersion: number;
  readonly scenarioVersionId: string;
  readonly runId?: string;
}

export type Pillar = 'pillar1' | 'pillar2' | 'pillar3';
export const PILLARS: readonly Pillar[] = ['pillar1', 'pillar2', 'pillar3'];

/** I04 status per area; everything except `valid` must stay visibly distinguishable. */
export type ResultStatus =
  'valid' | 'estimated' | 'requires_review' | 'needs_input' | 'provider_error' | 'stale';

export type MoneyPeriod = 'month' | 'year' | 'once';
export type MoneyBasis = 'gross' | 'net_before_income_tax' | 'net_after_income_tax' | 'capital';

/** Unit of a money value: implementation plan 8.1, amounts in whole Rappen. */
export interface MoneyUnit {
  readonly currency: 'CHF';
  readonly unit: 'cent';
  readonly period: MoneyPeriod;
  readonly basis: MoneyBasis;
}

/** `amount` is in Rappen. `null` instead of a Money object means unknown; `0` is a real zero. */
export interface Money extends MoneyUnit {
  readonly amount: number;
}

// --- I04 AnalysisResult: Valentin -> Luca ------------------------------------------------------

export type AnalysisArea = 'budget' | 'risk' | 'retirement';

export interface AnalysisMetric {
  readonly metricId: string;
  readonly area: AnalysisArea;
  readonly personId?: string;
  readonly value: Money | null;
  readonly status: ResultStatus;
  readonly sourceRef?: string;
}

export interface AnalysisResult extends MessageHeader {
  readonly profileVersion: number;
  readonly scenarioVersionId: string;
  readonly runId: string;
  readonly calculationInputHash: string;
  readonly areaStatus: Readonly<Partial<Record<AnalysisArea, ResultStatus>>>;
  readonly metrics: readonly AnalysisMetric[];
  readonly assumptions?: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly reviewReasons: readonly string[];
}

// --- I05 AgentReply: Earnie -> Dario and visible text ------------------------------------------

export type AgentReplyKind =
  'question' | 'patch_proposal' | 'explanation' | 'summary_notice' | 'error';

export interface AgentReply extends MessageHeader {
  readonly turnId: string;
  readonly replyId: string;
  readonly kind: AgentReplyKind;
  /** Already in the requested locale; the UI shows it as is. */
  readonly text: string;
  readonly locale: string;
  /** Result/source references, e.g. `run_demo_03`, `chart_income_timeline`. */
  readonly references: readonly string[];
  readonly requiresConfirmation: boolean;
  readonly contextRevision: number;
  readonly contextId?: string;
  readonly runId?: string;
}

// --- I08 SummaryBundle: Earnie -> Luca ---------------------------------------------------------

export type SummaryAudience = 'customer' | 'advisor';

export interface SummaryPoint {
  readonly id: string;
  readonly text: string;
}

export interface SummaryFact {
  readonly factId: string;
  readonly label: string;
  /** Either an amount or a plain text value. */
  readonly value: Money | null;
  readonly text?: string;
}

export interface PillarSummary {
  readonly status: ResultStatus;
  readonly text: string;
  /** Expected retirement income from this pillar, if known. */
  readonly retirementIncome: Money | null;
}

export interface SummaryGap {
  readonly gapId: string;
  readonly label: string;
  readonly amount: Money | null;
  readonly status: ResultStatus;
  readonly relatedRiskId?: string;
}

/** A product family the analysis points to, only shown once the product gate is open. */
export interface SummaryProduct {
  readonly candidateId: string;
  readonly productId: string;
  /** Already in the requested locale. */
  readonly name: string;
  readonly personId?: string;
  /** The need behind it, if quantified. */
  readonly need: Money | null;
  /** Fund-linked or capitalization: loss risk in the saving process, needs the suitability check. */
  readonly unitLinked: boolean;
}

/** Inputs for the product gate (rules 1 and 6); the UI only reads them. */
export interface ProductGate {
  readonly needsCaptured: boolean;
  readonly financesCaptured: boolean;
  readonly allPillarsCaptured: boolean;
  readonly suitabilityCheckDone: boolean;
}

export interface SummaryBundle extends MessageHeader {
  readonly snapshotId: string;
  readonly profileVersion: number;
  readonly scenarioVersionId: string;
  readonly runRefs: readonly string[];
  readonly audiences: readonly SummaryAudience[];
  /** A draft is never shown as final to the customer. */
  readonly status: 'draft' | 'final';
  readonly reviewOpen: boolean;
  readonly keyFacts: readonly SummaryFact[];
  readonly goals: readonly SummaryPoint[];
  /** Record, not array: all three pillars are always present (rule 2). */
  readonly pillars: Readonly<Record<Pillar, PillarSummary>>;
  readonly gaps: readonly SummaryGap[];
  readonly openQuestions: readonly SummaryPoint[];
  readonly nextSteps: readonly SummaryPoint[];
  readonly productGate: ProductGate;
  /** From the current recommendation; empty or missing before there is one. */
  readonly products?: readonly SummaryProduct[];
}

// --- I09 ProgressSnapshot: data maturity -> avatar ring and progress views ---------------------

export type ProgressGroupId =
  'goals' | 'household' | 'income' | 'pillar1' | 'pillar2' | 'pillar3' | 'scenarios';

export type ProgressGroupStatus = 'open' | 'partial' | 'estimated' | 'done';

export interface ProgressGroup {
  readonly groupId: ProgressGroupId;
  readonly status: ProgressGroupStatus;
}

export interface ProgressSnapshot extends MessageHeader {
  readonly profileVersion: number;
  /** Data capture, never an insurance or risk score. */
  readonly domain: 'data_capture';
  /** 0..100, or `null` when unknown. */
  readonly percent: number | null;
  readonly groups: readonly ProgressGroup[];
  readonly openGroups: readonly ProgressGroupId[];
  /** 100 % captured and an open expert review can be true at the same time. */
  readonly reviewOpen: boolean;
}

// --- I10 AdvisorContextUpdate: Earnie -> Dario and Luca ----------------------------------------

export type ContextUpdateReason =
  | 'confirmed_profile_changed'
  | 'analysis_started'
  | 'analysis_ready'
  | 'graph_context_changed'
  | 'review_state_changed'
  | 'conversation_preference_changed';

/** The runtime's event; `handover` is left out until the UI has a use for it. */
export type AdvisorContextUpdate = Omit<AdvisorContextUpdated, 'handover'> & Partial<Pick<AdvisorContextUpdated, 'handover'>>;
