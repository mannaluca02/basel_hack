import { Language } from '../../i18n/language';
import { AdvisorEvent } from '../advisor-data-source';
import {
  AgentReplyKind,
  AnalysisArea,
  AnalysisMetric,
  ContextUpdateReason,
  MessageHeader,
  Money,
  MoneyUnit,
  ProgressGroup,
  ProgressGroupId,
  ProgressGroupStatus,
  ResultStatus,
} from '../contracts';
import {
  AgentActivity,
  EventImpactScenario,
  IncomeMilestone,
  LifeEvent,
  RiskItem,
  TranscriptEntry,
} from '../ui-models';

/**
 * Scripted synthetic advice call (about 3 minutes) replayed by `MockDataSource`.
 *
 * Persona: the synthetic test family `public-family-synthetic-v1` (married couple in Basel, two
 * children, gross incomes CHF 100'000 and 60'000, 3a CHF 20'000 + 5'000 per year). No names, no
 * birth dates, years only (rule 7). Every amount below is invented mock output standing in for the
 * logic backend; none is a Logismata result and the UI must not compute anything from it (rule 3).
 * The agent texts quote the same amounts as the charts so the demo stays consistent.
 *
 * Texts exist in German and English; French and Italian fall back to German like the UI strings.
 */

export interface ScriptContext {
  readonly language: Language;
  /** BCP 47 locale for `AgentReply.locale`. */
  readonly locale: string;
  /** Emit time, ISO 8601. */
  readonly at: string;
  /** Unique per emitted message. */
  readonly messageId: string;
}

export interface ScriptStep {
  /** Offset from call start. Steps are sorted by it. */
  readonly atMs: number;
  build(ctx: ScriptContext): AdvisorEvent;
}

type Text = Readonly<{ de: string; en: string }>;

export const MOCK_CASE_ID = 'case_demo';
const CUSTOMER = 'person_demo_01';
const PARTNER = 'person_demo_02';
const CONTEXT_REF = `/api/cases/${MOCK_CASE_ID}/advisor/context`;
const BASELINE = 'scenario_demo_baseline';
const HOME = 'scenario_demo_home';

const CHART_LIFE_EVENTS = 'chart_life_events';
const CHART_PILLAR3A = 'chart_pillar3a_growth';
const CHART_INCOME = 'chart_income_timeline';
const CHART_IMPACT = 'chart_event_impact';

const s = (seconds: number): number => Math.round(seconds * 1000);
const tr = (ctx: ScriptContext, text: Text): string => (ctx.language === 'en' ? text.en : text.de);

function header(ctx: ScriptContext, turnId?: string): MessageHeader {
  return {
    schemaVersion: '1.0',
    messageId: ctx.messageId,
    caseId: MOCK_CASE_ID,
    correlationId: `correlation_mock_${turnId ?? 'system'}`,
    ...(turnId ? { turnId } : {}),
  };
}

const unit = (period: Money['period'], basis: Money['basis']): MoneyUnit => ({
  currency: 'CHF',
  unit: 'cent',
  period,
  basis,
});
const money = (amount: number, period: Money['period'], basis: Money['basis']): Money => ({
  ...unit(period, basis),
  amount,
});
const MONTHLY_GROSS = unit('month', 'gross');
const YEARLY_GROSS = unit('year', 'gross');

// --- Step builders -----------------------------------------------------------------------------

function agent(
  atSec: number,
  activity: AgentActivity,
  turnId?: string,
  replyId?: string,
): ScriptStep {
  return {
    atMs: s(atSec),
    build: (ctx) => ({
      type: 'agent',
      payload: {
        activity,
        at: ctx.at,
        ...(turnId ? { turnId } : {}),
        ...(replyId ? { replyId } : {}),
      },
    }),
  };
}

interface SayOptions {
  readonly kind?: AgentReplyKind;
  readonly contextRevision: number;
  readonly references?: readonly string[];
  readonly runId?: string;
  readonly requiresConfirmation?: boolean;
}

/** Agent turn: reply text (I05), then audio starts: speaking state and transcript line. */
function say(atSec: number, n: number, text: Text, options: SayOptions): ScriptStep[] {
  const turnId = `turn_mock_${n}`;
  const replyId = `reply_mock_${n}`;
  return [
    {
      atMs: s(atSec),
      build: (ctx) => ({
        type: 'reply',
        payload: {
          ...header(ctx, turnId),
          turnId,
          replyId,
          kind: options.kind ?? 'question',
          text: tr(ctx, text),
          locale: ctx.locale,
          references: options.references ?? [],
          requiresConfirmation: options.requiresConfirmation ?? false,
          contextRevision: options.contextRevision,
          ...(options.runId ? { runId: options.runId } : {}),
        },
      }),
    },
    agent(atSec + 0.3, 'speaking', turnId, replyId),
    transcript(
      atSec + 0.3,
      { entryId: `entry_agent_${n}`, turnId, replyId, speaker: 'agent' },
      text,
      'final',
    ),
  ];
}

/** Customer turn: listening state, one interim line, then the final line under the same id. */
function hear(
  atSec: number,
  durationSec: number,
  n: number,
  interim: Text,
  final: Text,
): ScriptStep[] {
  const line = {
    entryId: `entry_customer_${n}`,
    turnId: `turn_mock_${n}`,
    speaker: 'customer',
  } as const;
  return [
    agent(atSec, 'listening', line.turnId),
    transcript(atSec + durationSec * 0.4, line, interim, 'interim'),
    transcript(atSec + durationSec, line, final, 'final'),
  ];
}

function transcript(
  atSec: number,
  line: Pick<TranscriptEntry, 'entryId' | 'turnId' | 'speaker' | 'replyId'>,
  text: Text,
  status: TranscriptEntry['status'],
): ScriptStep {
  return {
    atMs: s(atSec),
    build: (ctx) => ({
      type: 'transcript',
      payload: { ...line, text: tr(ctx, text), status, at: ctx.at },
    }),
  };
}

function context(atSec: number, contextRevision: number, reason: ContextUpdateReason): ScriptStep {
  return {
    atMs: s(atSec),
    build: (ctx) => ({
      type: 'context',
      payload: {
        ...header(ctx),
        eventId: `event_mock_${contextRevision}`,
        contextRevision,
        reason,
        contextRef: CONTEXT_REF,
        interruptPolicy: 'if_current_answer_invalid',
      },
    }),
  };
}

const PROGRESS_ORDER: readonly ProgressGroupId[] = [
  'goals',
  'household',
  'income',
  'pillar1',
  'pillar2',
  'pillar3',
  'scenarios',
];

function progress(
  atSec: number,
  profileVersion: number,
  percent: number,
  statuses: Partial<Record<ProgressGroupId, ProgressGroupStatus>>,
  reviewOpen: boolean,
): ScriptStep {
  const groups: ProgressGroup[] = PROGRESS_ORDER.map((groupId) => ({
    groupId,
    status: statuses[groupId] ?? 'open',
  }));
  return {
    atMs: s(atSec),
    build: (ctx) => ({
      type: 'progress',
      payload: {
        ...header(ctx),
        profileVersion,
        domain: 'data_capture',
        percent,
        groups,
        openGroups: groups
          .filter((g) => g.status === 'open' || g.status === 'partial')
          .map((g) => g.groupId),
        reviewOpen,
      },
    }),
  };
}

function analysis(
  atSec: number,
  run: number,
  profileVersion: number,
  scenarioVersionId: string,
  areaStatus: Partial<Record<AnalysisArea, ResultStatus>>,
  metrics: readonly AnalysisMetric[],
  reviewReasons: readonly string[],
): ScriptStep {
  return {
    atMs: s(atSec),
    build: (ctx) => ({
      type: 'analysis',
      payload: {
        ...header(ctx),
        profileVersion,
        scenarioVersionId,
        runId: `run_mock_0${run}`,
        calculationInputHash: `mock_input_hash_0${run}`,
        areaStatus,
        metrics,
        assumptions: ['pillar3a_return_1_5_percent', 'retirement_target_75_percent_of_gross'],
        sourceRefs: ['mock_call_script'],
        reviewReasons,
      },
    }),
  };
}

function info(
  atSec: number,
  infoId: string,
  category: 'basics' | 'term' | 'assumption',
  title: Text,
  body: Text,
  related: { relatedChartId?: string; relatedRiskId?: string } = {},
): ScriptStep {
  return {
    atMs: s(atSec),
    build: (ctx) => ({
      type: 'info',
      payload: {
        infoId,
        category,
        title: tr(ctx, title),
        body: tr(ctx, body),
        at: ctx.at,
        ...related,
      },
    }),
  };
}

type RiskInput = Omit<RiskItem, 'title' | 'explanation'> & { title: Text; explanation: Text };

function risk(atSec: number, item: RiskInput): ScriptStep {
  return {
    atMs: s(atSec),
    build: (ctx) => ({
      type: 'risk',
      payload: { ...item, title: tr(ctx, item.title), explanation: tr(ctx, item.explanation) },
    }),
  };
}

// --- Mock calculation output (Rappen) ----------------------------------------------------------

const TIMELINE_YEARS = [2026, 2030, 2035, 2040, 2045, 2050, 2054, 2056, 2060, 2066, 2070];
/** FE-31: 2054 mixes salary and pension, so it is no bar; 2066 is ten years into the pension. */
const TIMELINE_MILESTONES: readonly IncomeMilestone[] = [
  { year: 2026, kind: 'today' },
  { year: 2050, kind: 'last_working' },
  { year: 2056, kind: 'first_pension' },
  { year: 2066, kind: 'pension_plus_10' },
  { year: 2070, kind: 'end' },
];
const WORKING = [0, 0, 0, 0, 0, 0];

const PILLAR3A_YEARS = [2026, 2031, 2036, 2041, 2046, 2051, 2056];
/** Paid out at the customer's retirement, the same year as in the life events. */
const PILLAR3A_PAYOUT_YEAR = 2056;
const PILLAR3A_WITH = [
  2_000_000, 4_730_700, 7_672_400, 10_841_500, 14_255_500, 17_933_400, 21_895_500,
];
const PILLAR3A_WITHOUT = [
  2_000_000, 2_154_600, 2_321_100, 2_500_500, 2_693_700, 2_901_900, 3_126_200,
];

const RETIREMENT_GAP = money(272_000, 'month', 'gross');
const DISABILITY_GAP = money(21_000, 'month', 'gross');
const DEATH_GAP = money(0, 'month', 'gross');
const TAX_SAVING_3A = money(150_000, 'year', 'net_after_income_tax');

const DISABILITY: EventImpactScenario = {
  event: 'disability',
  personId: CUSTOMER,
  status: 'estimated',
  incomeBefore: 1_333_300,
  incomeAfter: { employment: 500_000, pillar1: 229_000, pillar2: 350_000, pillar3: 0 },
  needed: 1_100_000,
  gap: DISABILITY_GAP.amount,
};
const DEATH: EventImpactScenario = {
  event: 'death',
  personId: CUSTOMER,
  status: 'estimated',
  incomeBefore: 1_333_300,
  incomeAfter: { employment: 500_000, pillar1: 220_000, pillar2: 200_000, pillar3: 0 },
  needed: 900_000,
  gap: DEATH_GAP.amount,
};
const RETIREMENT: EventImpactScenario = {
  event: 'retirement',
  personId: CUSTOMER,
  status: 'estimated',
  incomeBefore: 1_333_300,
  incomeAfter: { employment: 0, pillar1: 378_000, pillar2: 300_000, pillar3: 50_000 },
  needed: 1_000_000,
  gap: RETIREMENT_GAP.amount,
};

const LIFE_EVENTS: readonly (Omit<LifeEvent, 'label'> & { label: Text })[] = [
  {
    eventId: 'event_marriage',
    kind: 'marriage',
    year: 2018,
    certainty: 'past',
    label: { de: 'Heirat', en: 'Marriage' },
  },
  {
    eventId: 'event_child_1',
    kind: 'child_birth',
    year: 2019,
    certainty: 'past',
    label: { de: 'Geburt erstes Kind', en: 'First child born' },
  },
  {
    eventId: 'event_child_2',
    kind: 'child_birth',
    year: 2023,
    certainty: 'past',
    label: { de: 'Geburt zweites Kind', en: 'Second child born' },
  },
  {
    eventId: 'event_today',
    kind: 'today',
    year: 2026,
    certainty: 'confirmed',
    label: { de: 'Heute', en: 'Today' },
  },
  {
    eventId: 'event_retirement_partner',
    kind: 'retirement',
    year: 2054,
    personId: PARTNER,
    certainty: 'planned',
    label: { de: 'Pensionierung Partner', en: 'Partner retires' },
  },
  {
    eventId: 'event_retirement_customer',
    kind: 'retirement',
    year: 2056,
    personId: CUSTOMER,
    certainty: 'planned',
    label: { de: 'Deine Pensionierung', en: 'Your retirement' },
  },
];
const HOME_PURCHASE = {
  eventId: 'event_home_purchase',
  kind: 'home_purchase',
  year: 2031,
  certainty: 'planned',
  label: { de: 'Geplanter Hauskauf', en: 'Planned home purchase' },
} as const;

function lifeEventsChart(
  atSec: number,
  revision: number,
  profileVersion: number,
  scenarioVersionId: string,
  withHome: boolean,
): ScriptStep {
  const events = withHome
    ? [...LIFE_EVENTS, HOME_PURCHASE].sort((a, b) => a.year - b.year)
    : LIFE_EVENTS;
  return {
    atMs: s(atSec),
    build: (ctx) => ({
      type: 'chart',
      payload: {
        chartId: CHART_LIFE_EVENTS,
        type: 'life_events',
        status: 'valid',
        revision,
        updatedAt: ctx.at,
        reviewReasons: [],
        profileVersion,
        scenarioVersionId,
        fromYear: 2018,
        toYear: 2060,
        events: events.map((e) => ({ ...e, label: tr(ctx, e.label) })),
      },
    }),
  };
}

function pillar3aChart(
  atSec: number,
  revision: number,
  profileVersion: number,
  scenarioVersionId: string,
  runId: string,
  taxSaving: Money | null,
): ScriptStep {
  const status: ResultStatus = taxSaving ? 'estimated' : 'valid';
  return {
    atMs: s(atSec),
    build: (ctx) => ({
      type: 'chart',
      payload: {
        chartId: CHART_PILLAR3A,
        type: 'pillar3a_growth',
        status,
        revision,
        updatedAt: ctx.at,
        reviewReasons: [],
        profileVersion,
        scenarioVersionId,
        runId,
        unit: unit('once', 'capital'),
        years: PILLAR3A_YEARS,
        series: {
          withContributions: { values: PILLAR3A_WITH, status: 'valid' },
          withoutContributions: { values: PILLAR3A_WITHOUT, status: 'valid' },
        },
        taxSaving,
        payoutYear: PILLAR3A_PAYOUT_YEAR,
      },
    }),
  };
}

/** Before the partner's pension is estimated, pillar 2 and the gap after 2054 are unknown. */
function incomeChart(
  atSec: number,
  revision: number,
  profileVersion: number,
  runId: string,
  partnerEstimated: boolean,
): ScriptStep {
  const pillar2: (number | null)[] = partnerEstimated
    ? [...WORKING, 1_200_000, 3_600_000, 3_600_000, 3_600_000, 3_600_000]
    : [...WORKING, null, null, null, null, null];
  const gap: (number | null)[] = partnerEstimated
    ? [...WORKING, 0, 3_264_000, 3_264_000, 3_264_000, 3_264_000]
    : [...WORKING, 0, null, null, null, null];
  const status: ResultStatus = partnerEstimated ? 'estimated' : 'needs_input';
  return {
    atMs: s(atSec),
    build: (ctx) => ({
      type: 'chart',
      payload: {
        chartId: CHART_INCOME,
        type: 'income_timeline',
        status,
        revision,
        updatedAt: ctx.at,
        reviewReasons: partnerEstimated
          ? ['bvg_minimum_estimate_partner']
          : ['pension_certificate_missing_partner'],
        profileVersion,
        scenarioVersionId: BASELINE,
        runId,
        unit: YEARLY_GROSS,
        years: TIMELINE_YEARS,
        series: {
          employment: {
            values: [
              16_000_000, 16_000_000, 16_000_000, 16_000_000, 16_000_000, 16_000_000, 10_000_000, 0,
              0, 0, 0,
            ],
            status: 'valid',
          },
          pillar1: {
            values: [...WORKING, 3_024_000, 4_536_000, 4_536_000, 4_536_000, 4_536_000],
            status: 'estimated',
          },
          pillar2: { values: pillar2, status },
          pillar3: {
            values: [...WORKING, 0, 600_000, 600_000, 600_000, 600_000],
            status: 'estimated',
          },
          gap: { values: gap, status },
        },
        target: {
          values: [
            null,
            null,
            null,
            null,
            null,
            null,
            12_000_000,
            12_000_000,
            12_000_000,
            12_000_000,
            12_000_000,
          ],
          status: 'valid',
        },
        milestones: TIMELINE_MILESTONES,
      },
    }),
  };
}

function impactChart(
  atSec: number,
  revision: number,
  profileVersion: number,
  scenarios: readonly EventImpactScenario[],
): ScriptStep {
  return {
    atMs: s(atSec),
    build: (ctx) => ({
      type: 'chart',
      payload: {
        chartId: CHART_IMPACT,
        type: 'event_impact',
        status: 'estimated',
        revision,
        updatedAt: ctx.at,
        reviewReasons: ['bvg_minimum_estimate_partner'],
        profileVersion,
        scenarioVersionId: BASELINE,
        runId: 'run_mock_03',
        unit: MONTHLY_GROSS,
        scenarios,
      },
    }),
  };
}

function summary(
  atSec: number,
  profileVersion: number,
  scenarioVersionId: string,
  complete: boolean,
): ScriptStep {
  return {
    atMs: s(atSec),
    build: (ctx) => {
      const t = (text: Text) => tr(ctx, text);
      return {
        type: 'summary',
        payload: {
          ...header(ctx),
          snapshotId: complete ? 'snapshot_mock_02' : 'snapshot_mock_01',
          profileVersion,
          scenarioVersionId,
          runRefs: complete ? ['run_mock_03', 'run_mock_04'] : ['run_mock_03'],
          audiences: ['customer', 'advisor'],
          status: 'draft',
          reviewOpen: true,
          keyFacts: [
            {
              factId: 'fact_household',
              label: t({ de: 'Haushalt', en: 'Household' }),
              value: null,
              text: t({
                de: 'Verheiratet, zwei Kinder (6 und 3 Jahre), Miete in Basel',
                en: 'Married, two children (aged 6 and 3), renting in Basel',
              }),
            },
            {
              factId: 'fact_income',
              label: t({ de: 'Bruttoeinkommen Haushalt', en: 'Household gross income' }),
              value: money(16_000_000, 'year', 'gross'),
            },
            {
              factId: 'fact_pillar3a',
              label: t({ de: 'Säule 3a heute', en: 'Pillar 3a today' }),
              value: money(2_000_000, 'once', 'capital'),
            },
          ],
          goals: [
            {
              id: 'goal_retirement',
              text: t({
                de: 'Finanziell abgesicherte Pensionierung',
                en: 'A financially secure retirement',
              }),
            },
            {
              id: 'goal_family',
              text: t({
                de: 'Familie bei Krankheit oder Tod absichern',
                en: 'Protect the family against illness or death',
              }),
            },
            ...(complete
              ? [
                  {
                    id: 'goal_home',
                    text: t({
                      de: 'Hauskauf in rund fünf Jahren (2031)',
                      en: 'Buy a home in about five years (2031)',
                    }),
                  },
                ]
              : []),
          ],
          pillars: {
            pillar1: {
              status: 'estimated',
              text: t({
                de: 'AHV-Ehepaarrente, aus den Einkommen geschätzt',
                en: 'AHV couple pension, estimated from income',
              }),
              retirementIncome: money(378_000, 'month', 'gross'),
            },
            pillar2: {
              status: 'estimated',
              text: t({
                de: 'Eigener Ausweis erfasst, Partner mit BVG-Minimum geschätzt',
                en: 'Own certificate captured, partner estimated with the BVG minimum',
              }),
              retirementIncome: money(300_000, 'month', 'gross'),
            },
            pillar3: {
              status: 'estimated',
              text: t({
                de: '3a-Konto mit jährlichen Einzahlungen',
                en: '3a account with yearly contributions',
              }),
              retirementIncome: money(50_000, 'month', 'gross'),
            },
          },
          gaps: [
            {
              gapId: 'gap_retirement',
              label: t({
                de: 'Vorsorgelücke ab Pensionierung',
                en: 'Pension gap after retirement',
              }),
              amount: RETIREMENT_GAP,
              status: 'estimated',
              relatedRiskId: 'risk_retirement_gap',
            },
            {
              gapId: 'gap_disability',
              label: t({ de: 'Lücke bei Erwerbsunfähigkeit', en: 'Gap in case of disability' }),
              amount: DISABILITY_GAP,
              status: 'estimated',
              relatedRiskId: 'risk_disability',
            },
            {
              gapId: 'gap_death',
              label: t({ de: 'Lücke im Todesfall', en: 'Gap in case of death' }),
              amount: DEATH_GAP,
              status: 'estimated',
              relatedRiskId: 'risk_death',
            },
          ],
          openQuestions: [
            {
              id: 'question_partner_certificate',
              text: t({
                de: 'Pensionskassenausweis des Partners fehlt',
                en: "Partner's pension fund certificate is missing",
              }),
            },
            ...(complete
              ? [
                  {
                    id: 'question_home_financing',
                    text: t({
                      de: 'Kaufpreis und Finanzierung des Hauses sind offen',
                      en: 'Home price and financing are still open',
                    }),
                  },
                ]
              : []),
          ],
          nextSteps: [
            {
              id: 'step_review',
              text: t({
                de: 'Eine Fachperson von Pax prüft die geschätzten Werte',
                en: 'A Pax advisor reviews the estimated figures',
              }),
            },
            {
              id: 'step_certificate',
              text: t({
                de: 'Pensionskassenausweis des Partners nachreichen',
                en: "Submit the partner's pension fund certificate",
              }),
            },
            ...(complete
              ? [
                  {
                    id: 'step_options',
                    text: t({
                      de: 'Danach Lösungen für die Vorsorgelücke besprechen',
                      en: 'Then discuss options for the pension gap',
                    }),
                  },
                ]
              : []),
          ],
          productGate: {
            needsCaptured: complete,
            financesCaptured: true,
            allPillarsCaptured: true,
            suitabilityCheckDone: false,
          },
          products: complete
            ? [
                {
                  candidateId: 'candidate_disability',
                  productId: 'pax_disability',
                  name: t({ de: 'Pax Erwerbsunfähigkeitsversicherung', en: 'Pax disability insurance' }),
                  personId: CUSTOMER,
                  need: DISABILITY_GAP,
                  unitLinked: false,
                },
                {
                  candidateId: 'candidate_fondsstar',
                  productId: 'pax_fondsstar',
                  name: t({ de: 'Pax FondsStar', en: 'Pax FondsStar' }),
                  personId: CUSTOMER,
                  need: RETIREMENT_GAP,
                  unitLinked: true,
                },
              ]
            : [],
        },
      };
    },
  };
}

// --- The call ----------------------------------------------------------------------------------

const RISK_RETIREMENT_BASE = {
  riskId: 'risk_retirement_gap',
  category: 'retirement',
  pillars: ['pillar1', 'pillar2', 'pillar3'],
  scenarioVersionId: BASELINE,
  title: { de: 'Vorsorgelücke im Alter', en: 'Pension gap in retirement' },
  relatedChartId: CHART_INCOME,
  relatedInfoId: 'info_bvg_minimum',
} as const;

const RISK_HOME_BASE = {
  riskId: 'risk_home_purchase',
  category: 'home_purchase',
  severity: 'medium',
  pillars: ['pillar2', 'pillar3'],
  scenarioVersionId: HOME,
  amount: null,
  title: { de: 'Finanzierung Hauskauf', en: 'Home purchase financing' },
  relatedChartId: CHART_LIFE_EVENTS,
  relatedInfoId: 'info_home_purchase_wef',
} as const;

const steps: ScriptStep[] = [
  progress(0, 1, 0, {}, false),
  ...say(
    0.5,
    1,
    {
      de: 'Grüezi! Ich bin dein digitaler Vorsorgeberater von Pax. Wie viel Zeit möchtest du dir heute nehmen?',
      en: "Hello! I'm your digital pension advisor from Pax. How much time would you like to take today?",
    },
    { contextRevision: 1 },
  ),

  ...hear(
    7,
    4,
    2,
    { de: 'Etwa zwanzig', en: 'About twenty' },
    { de: 'Etwa zwanzig Minuten.', en: 'About twenty minutes.' },
  ),
  agent(11.5, 'thinking', 'turn_mock_2'),
  ...say(
    13,
    3,
    {
      de: 'Gut, dann halten wir es kompakt. Erzähl mir kurz von deinem Haushalt: Wer lebt bei dir, und wie wohnt ihr?',
      en: "Good, then let's keep it compact. Tell me briefly about your household: who lives with you, and how do you live?",
    },
    { contextRevision: 1 },
  ),

  ...hear(
    20,
    6,
    4,
    { de: 'Ich bin verheiratet, wir haben zwei Kinder', en: "I'm married, we have two children" },
    {
      de: 'Ich bin verheiratet, wir haben zwei Kinder, sechs und drei Jahre alt. Wir wohnen zur Miete in Basel.',
      en: "I'm married, we have two children, six and three years old. We rent a flat in Basel.",
    },
  ),
  agent(26.5, 'thinking', 'turn_mock_4'),
  context(27, 2, 'confirmed_profile_changed'),
  progress(27.5, 2, 15, { goals: 'partial', household: 'done' }, false),
  lifeEventsChart(28, 1, 2, BASELINE, false),
  info(
    28.5,
    'info_three_pillars',
    'basics',
    { de: 'Das Drei-Säulen-System', en: 'The three-pillar system' },
    {
      de: 'Die Schweizer Vorsorge ruht auf drei Säulen: Die 1. Säule (AHV/IV) sichert den Existenzbedarf. Die 2. Säule (Pensionskasse) soll zusammen mit der AHV den gewohnten Lebensstandard ermöglichen. Die 3. Säule ist die freiwillige private Vorsorge.',
      en: 'Swiss pension provision rests on three pillars: pillar 1 (AHV/IV) covers basic living costs. Pillar 2 (occupational pension fund) together with the AHV aims to maintain your accustomed standard of living. Pillar 3 is voluntary private provision.',
    },
  ),
  ...say(
    29.5,
    5,
    {
      de: 'Danke. Ich habe euren Haushalt auf der Zeitachse eingetragen. Wie hoch sind eure Bruttojahreseinkommen?',
      en: "Thanks. I've added your household to the timeline. What are your gross annual incomes?",
    },
    { contextRevision: 2, references: [CHART_LIFE_EVENTS] },
  ),

  ...hear(
    36,
    6,
    6,
    { de: 'Ich verdiene hunderttausend', en: 'I earn a hundred thousand' },
    {
      de: "Ich verdiene 100'000 Franken brutto im Jahr, mein Partner 60'000.",
      en: 'I earn 100,000 francs gross a year, my partner 60,000.',
    },
  ),
  agent(42.5, 'thinking', 'turn_mock_6'),
  context(43, 3, 'confirmed_profile_changed'),
  progress(43.5, 3, 30, { goals: 'partial', household: 'done', income: 'done' }, false),
  ...say(
    45,
    7,
    {
      de: 'Habt ihr bereits Erspartes oder eine Säule 3a?',
      en: 'Do you already have savings or a pillar 3a account?',
    },
    { contextRevision: 3 },
  ),

  ...hear(
    50,
    8,
    8,
    { de: 'Ich habe ein 3a-Konto', en: 'I have a 3a account' },
    {
      de: "Ich habe ein 3a-Konto mit rund 20'000 Franken und zahle jedes Jahr 5'000 ein. Dazu haben wir etwa 25'000 auf dem Sparkonto.",
      en: 'I have a 3a account with about 20,000 francs and pay in 5,000 every year. We also have about 25,000 in a savings account.',
    },
  ),
  agent(58.5, 'thinking', 'turn_mock_8'),
  context(59, 4, 'confirmed_profile_changed'),
  context(59.2, 5, 'analysis_started'),
  progress(
    59.5,
    4,
    45,
    { goals: 'partial', household: 'done', income: 'done', pillar1: 'estimated', pillar3: 'done' },
    false,
  ),
  info(
    60,
    'info_pillar3a',
    'basics',
    { de: 'Säule 3a', en: 'Pillar 3a' },
    {
      de: 'Die Säule 3a ist die gebundene Selbstvorsorge. Einzahlungen bis zum gesetzlichen Maximalbetrag kannst du vom steuerbaren Einkommen abziehen. Das Guthaben ist bis kurz vor der Pensionierung gebunden; Ausnahmen sind zum Beispiel Wohneigentum oder der Schritt in die Selbstständigkeit.',
      en: 'Pillar 3a is tied private pension provision. Contributions up to the legal maximum can be deducted from taxable income. The money is tied up until shortly before retirement; exceptions include buying a home or becoming self-employed.',
    },
    { relatedChartId: CHART_PILLAR3A },
  ),
  analysis(
    61,
    1,
    4,
    BASELINE,
    { budget: 'valid', retirement: 'needs_input', risk: 'needs_input' },
    [
      {
        metricId: 'pillar3a_capital_at_retirement',
        area: 'retirement',
        personId: CUSTOMER,
        value: money(PILLAR3A_WITH[6], 'once', 'capital'),
        status: 'estimated',
        sourceRef: 'mock_call_script',
      },
    ],
    ['pension_certificates_missing'],
  ),
  context(61.5, 6, 'analysis_ready'),
  pillar3aChart(62, 1, 4, BASELINE, 'run_mock_01', null),
  ...say(
    63,
    9,
    {
      de: "In der neuen Grafik siehst du, wie dein 3a-Guthaben bis 2056 wachsen kann: mit Einzahlungen auf rund 219'000 Franken, ohne Einzahlungen auf rund 31'000. Hast du einen Pensionskassenausweis zur Hand?",
      en: 'The new chart shows how your 3a balance can grow until 2056: to about 219,000 francs with contributions, about 31,000 without. Do you have a pension fund certificate at hand?',
    },
    {
      kind: 'explanation',
      contextRevision: 6,
      runId: 'run_mock_01',
      references: ['run_mock_01', CHART_PILLAR3A],
    },
  ),

  ...hear(
    74,
    7,
    10,
    { de: 'Meinen habe ich hier', en: 'I have mine here' },
    {
      de: "Meinen habe ich hier: 24'000 Franken Altersrente pro Jahr. Für meinen Partner haben wir keinen.",
      en: "I have mine here: a retirement pension of 24,000 francs a year. We don't have one for my partner.",
    },
  ),
  agent(81.5, 'thinking', 'turn_mock_10'),
  context(82, 7, 'confirmed_profile_changed'),
  progress(
    82.5,
    5,
    60,
    {
      goals: 'partial',
      household: 'done',
      income: 'done',
      pillar1: 'estimated',
      pillar2: 'partial',
      pillar3: 'done',
    },
    false,
  ),
  analysis(
    83,
    2,
    5,
    BASELINE,
    { budget: 'valid', retirement: 'needs_input', risk: 'needs_input' },
    [{ metricId: 'retirement_gap', area: 'retirement', value: null, status: 'needs_input' }],
    ['pension_certificate_missing_partner'],
  ),
  incomeChart(84, 1, 5, 'run_mock_02', false),
  risk(84.5, {
    ...RISK_RETIREMENT_BASE,
    severity: 'medium',
    amount: null,
    status: 'needs_data',
    resultStatus: 'needs_input',
    profileVersion: 5,
    runId: 'run_mock_02',
    explanation: {
      de: 'Ohne Pensionskassenausweis des Partners lässt sich die Lücke nach der Pensionierung noch nicht beziffern.',
      en: "Without the partner's pension fund certificate the gap after retirement cannot be quantified yet.",
    },
  }),
  ...say(
    85,
    11,
    {
      de: 'Danke. Ohne den Ausweis deines Partners kann ich die Lücke im Alter noch nicht berechnen. Soll ich vorerst mit der gesetzlichen BVG-Mindestleistung schätzen? Eine Fachperson prüft das später.',
      en: "Thanks. Without your partner's certificate I can't calculate the retirement gap yet. Shall I estimate it with the statutory BVG minimum for now? An advisor will review it later.",
    },
    {
      kind: 'patch_proposal',
      contextRevision: 7,
      requiresConfirmation: true,
      runId: 'run_mock_02',
      references: ['run_mock_02', CHART_INCOME],
    },
  ),

  ...hear(95, 3, 12, { de: 'Ja', en: 'Yes' }, { de: 'Ja, mach das.', en: 'Yes, go ahead.' }),
  agent(98.5, 'thinking', 'turn_mock_12'),
  context(99, 8, 'confirmed_profile_changed'),
  progress(
    99.5,
    6,
    75,
    {
      goals: 'partial',
      household: 'done',
      income: 'done',
      pillar1: 'estimated',
      pillar2: 'estimated',
      pillar3: 'done',
    },
    true,
  ),
  info(
    100,
    'info_bvg_minimum',
    'assumption',
    { de: 'Annahme: BVG-Minimum', en: 'Assumption: BVG minimum' },
    {
      de: 'Für deinen Partner liegt kein Pensionskassenausweis vor. Die 2. Säule ist deshalb mit den gesetzlichen Mindestleistungen nach BVG geschätzt. Viele Pensionskassen leisten mehr; mit dem Ausweis wird die Berechnung genauer.',
      en: 'There is no pension fund certificate for your partner, so pillar 2 is estimated with the statutory BVG minimum benefits. Many pension funds pay more; the certificate makes the calculation more precise.',
    },
    { relatedChartId: CHART_INCOME, relatedRiskId: 'risk_retirement_gap' },
  ),
  analysis(
    101,
    3,
    6,
    BASELINE,
    { budget: 'valid', retirement: 'estimated', risk: 'estimated' },
    [
      {
        metricId: 'retirement_gap',
        area: 'retirement',
        value: RETIREMENT_GAP,
        status: 'estimated',
        sourceRef: 'mock_call_script',
      },
      {
        metricId: 'disability_gap',
        area: 'risk',
        personId: CUSTOMER,
        value: DISABILITY_GAP,
        status: 'estimated',
        sourceRef: 'mock_call_script',
      },
      {
        metricId: 'death_gap',
        area: 'risk',
        personId: CUSTOMER,
        value: DEATH_GAP,
        status: 'estimated',
        sourceRef: 'mock_call_script',
      },
    ],
    ['bvg_minimum_estimate_partner'],
  ),
  context(101.5, 9, 'analysis_ready'),
  incomeChart(102, 2, 6, 'run_mock_03', true),
  risk(102.5, {
    ...RISK_RETIREMENT_BASE,
    severity: 'high',
    amount: RETIREMENT_GAP,
    status: 'identified',
    resultStatus: 'estimated',
    profileVersion: 6,
    runId: 'run_mock_03',
    explanation: {
      de: 'Nach der Pensionierung decken AHV, Pensionskasse und Säule 3a das Zielbudget von 75 % des heutigen Einkommens nicht vollständig. Die Lücke ist geschätzt, weil der Ausweis des Partners fehlt.',
      en: "After retirement, AHV, pension fund and pillar 3a do not fully cover the target budget of 75 % of today's income. The gap is estimated because the partner's certificate is missing.",
    },
  }),
  ...say(
    104,
    13,
    {
      de: "Die Grafik ist aktualisiert. Ab deiner Pensionierung 2056 fehlen eurem Haushalt nach dieser Schätzung rund 2'720 Franken pro Monat gegenüber eurem Zielbudget.",
      en: 'The chart is updated. From your retirement in 2056, this estimate shows your household about 2,720 francs a month short of your target budget.',
    },
    {
      kind: 'explanation',
      contextRevision: 9,
      runId: 'run_mock_03',
      references: ['run_mock_03', CHART_INCOME, 'risk_retirement_gap'],
    },
  ),
  summary(105, 6, BASELINE, false),

  ...hear(
    116,
    6,
    14,
    { de: 'Und was passiert, wenn ich krank werde', en: 'And what happens if I fall ill' },
    {
      de: 'Und was passiert, wenn ich krank werde und nicht mehr arbeiten kann?',
      en: "And what happens if I fall ill and can't work any more?",
    },
  ),
  agent(122.5, 'thinking', 'turn_mock_14'),
  impactChart(124, 1, 6, [DISABILITY]),
  risk(124.5, {
    riskId: 'risk_disability',
    category: 'disability',
    severity: 'low',
    pillars: ['pillar1', 'pillar2'],
    amount: DISABILITY_GAP,
    status: 'identified',
    resultStatus: 'estimated',
    profileVersion: 6,
    scenarioVersionId: BASELINE,
    runId: 'run_mock_03',
    title: { de: 'Erwerbsunfähigkeit', en: 'Disability' },
    explanation: {
      de: 'Kannst du nicht mehr arbeiten, fangen IV, Pensionskasse und das Einkommen deines Partners den Grossteil auf. Es bleibt eine kleine monatliche Lücke.',
      en: "If you can no longer work, disability insurance, the pension fund and your partner's income cover most of it. A small monthly gap remains.",
    },
    relatedChartId: CHART_IMPACT,
    relatedInfoId: 'info_disability',
  }),
  info(
    125,
    'info_disability',
    'term',
    { de: 'Erwerbsunfähigkeit', en: 'Disability' },
    {
      de: 'Kannst du wegen Krankheit oder Unfall nicht mehr arbeiten, zahlen die IV (1. Säule) und die Pensionskasse (2. Säule) Renten. Sie decken meist nur einen Teil des bisherigen Einkommens.',
      en: 'If you cannot work because of illness or an accident, disability insurance (pillar 1) and the pension fund (pillar 2) pay pensions. They usually cover only part of your previous income.',
    },
    { relatedChartId: CHART_IMPACT, relatedRiskId: 'risk_disability' },
  ),
  ...say(
    126,
    15,
    {
      de: 'Bei einer Erwerbsunfähigkeit würden IV, Pensionskasse und das Einkommen deines Partners den Grossteil auffangen. Es fehlen rund 210 Franken pro Monat. Im Todesfall entsteht nach dieser Schätzung keine Lücke.',
      en: "In case of disability, disability insurance, the pension fund and your partner's income would cover most of it. About 210 francs a month would be missing. In case of death this estimate shows no gap.",
    },
    {
      kind: 'explanation',
      contextRevision: 9,
      runId: 'run_mock_03',
      references: ['run_mock_03', CHART_IMPACT, 'risk_disability', 'risk_death'],
    },
  ),
  impactChart(129, 2, 6, [DISABILITY, DEATH, RETIREMENT]),
  risk(129.5, {
    riskId: 'risk_death',
    category: 'death',
    severity: 'low',
    pillars: ['pillar1', 'pillar2'],
    amount: DEATH_GAP,
    status: 'addressed',
    resultStatus: 'estimated',
    profileVersion: 6,
    scenarioVersionId: BASELINE,
    runId: 'run_mock_03',
    title: { de: 'Todesfall', en: 'Death' },
    explanation: {
      de: 'Hinterlassenenrenten aus AHV und Pensionskasse und das Einkommen deines Partners decken den Bedarf der Familie nach dieser Schätzung.',
      en: "According to this estimate, survivors' pensions from AHV and the pension fund plus your partner's income cover the family's needs.",
    },
    relatedChartId: CHART_IMPACT,
  }),

  ...say(
    138,
    16,
    {
      de: 'Plant ihr in den nächsten Jahren grössere Veränderungen, zum Beispiel einen Hauskauf?',
      en: 'Are you planning any major changes in the coming years, for example buying a home?',
    },
    { contextRevision: 9 },
  ),
  ...hear(
    143,
    5,
    17,
    { de: 'Ja, in etwa fünf Jahren', en: 'Yes, in about five years' },
    {
      de: 'Ja, in etwa fünf Jahren möchten wir ein Haus kaufen.',
      en: "Yes, we'd like to buy a house in about five years.",
    },
  ),
  agent(148.5, 'thinking', 'turn_mock_17'),
  context(149, 10, 'confirmed_profile_changed'),
  progress(
    149.5,
    7,
    90,
    {
      goals: 'done',
      household: 'done',
      income: 'done',
      pillar1: 'estimated',
      pillar2: 'estimated',
      pillar3: 'done',
      scenarios: 'partial',
    },
    true,
  ),
  lifeEventsChart(150, 2, 7, HOME, true),
  risk(150.5, {
    ...RISK_HOME_BASE,
    status: 'needs_data',
    resultStatus: 'needs_input',
    profileVersion: 7,
    explanation: {
      de: 'Für die Tragbarkeit des Hauskaufs fehlen noch Eigenmittel und Kaufpreis.',
      en: 'Equity and purchase price are still missing to assess whether the home is affordable.',
    },
  }),
  ...say(
    151,
    18,
    {
      de: 'Ich habe den Hauskauf 2031 auf der Zeitachse eingetragen. Wie viel Eigenkapital könnt ihr dafür einsetzen?',
      en: "I've added the home purchase in 2031 to the timeline. How much equity can you put towards it?",
    },
    { contextRevision: 10, references: [CHART_LIFE_EVENTS] },
  ),

  ...hear(
    158,
    6,
    19,
    { de: "Etwa 25'000 vom Sparkonto", en: 'About 25,000 from savings' },
    {
      de: "Etwa 25'000 vom Sparkonto, vielleicht auch etwas aus der Pensionskasse.",
      en: 'About 25,000 from our savings, maybe also some from the pension fund.',
    },
  ),
  agent(164.5, 'thinking', 'turn_mock_19'),
  context(165, 11, 'confirmed_profile_changed'),
  analysis(
    166,
    4,
    8,
    HOME,
    { budget: 'requires_review', retirement: 'estimated', risk: 'estimated' },
    [
      {
        metricId: 'retirement_gap',
        area: 'retirement',
        value: RETIREMENT_GAP,
        status: 'estimated',
        sourceRef: 'mock_call_script',
      },
      {
        metricId: 'disability_gap',
        area: 'risk',
        personId: CUSTOMER,
        value: DISABILITY_GAP,
        status: 'estimated',
        sourceRef: 'mock_call_script',
      },
      {
        metricId: 'death_gap',
        area: 'risk',
        personId: CUSTOMER,
        value: DEATH_GAP,
        status: 'estimated',
        sourceRef: 'mock_call_script',
      },
      {
        metricId: 'pillar3a_tax_saving',
        area: 'budget',
        personId: CUSTOMER,
        value: TAX_SAVING_3A,
        status: 'estimated',
        sourceRef: 'mock_call_script',
      },
    ],
    ['bvg_minimum_estimate_partner', 'home_purchase_affordability_open'],
  ),
  pillar3aChart(166.5, 2, 8, HOME, 'run_mock_04', TAX_SAVING_3A),
  info(
    167,
    'info_3a_tax',
    'assumption',
    { de: 'Annahme: Rendite und Steuern 3a', en: 'Assumption: 3a return and taxes' },
    {
      de: 'Die 3a-Grafik rechnet mit 1,5 % Rendite pro Jahr und gleichbleibenden Einzahlungen. Die Steuerersparnis ist eine Schätzung auf Basis eures Einkommens und Wohnorts.',
      en: 'The 3a chart assumes a 1.5 % return per year and constant contributions. The tax saving is an estimate based on your income and place of residence.',
    },
    { relatedChartId: CHART_PILLAR3A },
  ),
  risk(167.5, {
    ...RISK_HOME_BASE,
    status: 'identified',
    resultStatus: 'requires_review',
    profileVersion: 8,
    runId: 'run_mock_04',
    explanation: {
      de: 'Ein Vorbezug aus der Pensionskasse senkt die spätere Altersrente und vergrössert die Vorsorgelücke. Die Tragbarkeit prüft eine Fachperson mit euch.',
      en: 'Withdrawing pension fund money lowers the later retirement pension and widens the pension gap. An advisor will check affordability with you.',
    },
  }),
  info(
    168,
    'info_home_purchase_wef',
    'term',
    { de: 'Vorbezug für Wohneigentum', en: 'Early withdrawal for home ownership' },
    {
      de: 'Guthaben aus der 2. Säule und der Säule 3a können für selbst genutztes Wohneigentum vorbezogen werden. Ein Vorbezug senkt die späteren Altersleistungen und wird besteuert.',
      en: 'Pillar 2 and pillar 3a savings can be withdrawn early to buy a home you live in. An early withdrawal reduces later retirement benefits and is taxed.',
    },
    { relatedRiskId: 'risk_home_purchase' },
  ),
  context(168.5, 12, 'analysis_ready'),
  progress(
    169,
    8,
    100,
    {
      goals: 'done',
      household: 'done',
      income: 'done',
      pillar1: 'estimated',
      pillar2: 'estimated',
      pillar3: 'done',
      scenarios: 'done',
    },
    true,
  ),
  summary(169.5, 8, HOME, true),
  context(170, 13, 'review_state_changed'),
  ...say(
    170.5,
    20,
    {
      de: "Danke, damit habe ich alle Angaben für eine erste Analyse. Mit deinen 3a-Einzahlungen sparst du voraussichtlich rund 1'500 Franken Steuern pro Jahr. Tippe auf meinen Avatar, um die Zusammenfassung zu sehen. Eine Fachperson von Pax prüft die geschätzten Werte, bevor wir über Lösungen sprechen.",
      en: 'Thanks, that gives me everything for a first analysis. With your 3a contributions you are likely to save about 1,500 francs in tax a year. Tap my avatar to see the summary. A Pax advisor will review the estimated figures before we talk about solutions.',
    },
    {
      kind: 'summary_notice',
      contextRevision: 13,
      runId: 'run_mock_04',
      references: ['run_mock_04', 'snapshot_mock_02'],
    },
  ),
  agent(184, 'idle'),
];

/** The full call, sorted by time (stable for steps with the same offset). */
export const MOCK_CALL_SCRIPT: readonly ScriptStep[] = steps
  .map((step, index) => ({ step, index }))
  .sort((a, b) => a.step.atMs - b.step.atMs || a.index - b.index)
  .map(({ step }) => step);
