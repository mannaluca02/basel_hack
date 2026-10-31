import type {
  AdvisorContext,
  InsuranceCaseDto,
  SummaryBundle as CaseSummaries,
  SuitabilityView,
} from '@pax/contracts';
import type { Language } from '../../i18n/language';
import type {
  Money,
  MoneyUnit,
  Pillar,
  PillarSummary,
  ResultStatus,
  SummaryBundle,
  SummaryFact,
  SummaryGap,
  SummaryPoint,
  SummaryProduct,
} from '../contracts';
import type { InfoItem, RiskItem, TranscriptEntry } from '../ui-models';

/**
 * The summary sheet, the Info tab and the call history from the backend's own outputs:
 * `/summaries` (one snapshot for customer and advisor), the advisor context and the call history
 * a linked voice agent recorded. Amounts are the backend's; nothing is recalculated here.
 */

export interface AgentTurn {
  readonly messageId: string;
  readonly conversationId: string;
  readonly speaker: 'customer' | 'agent';
  readonly text: string;
  readonly at: string;
}

type Text = Readonly<Record<Language, string>>;

const GOALS: Readonly<Record<string, Text>> = {
  family: { de: 'Familie', fr: 'Famille', it: 'Famiglia', en: 'Family' },
  home: { de: 'Eigenheim', fr: 'Logement en propriété', it: 'Casa propria', en: 'Home ownership' },
  retirement: { de: 'Pensionierung', fr: 'Retraite', it: 'Pensionamento', en: 'Retirement' },
  child_protection: { de: 'Schutz der Kinder', fr: 'Protection des enfants', it: 'Protezione dei figli', en: 'Protecting the children' },
  income_protection: { de: 'Einkommen absichern', fr: 'Protéger le revenu', it: 'Proteggere il reddito', en: 'Protecting the income' },
  survivor_protection: { de: 'Hinterbliebene absichern', fr: 'Protéger les proches', it: 'Proteggere i superstiti', en: 'Protecting survivors' },
};

const TEXT = {
  by: { de: 'bis {year}', fr: "d'ici {year}", it: 'entro il {year}', en: 'by {year}' },
  pillar1: { de: 'AHV-Rente im Alter', fr: 'Rente AVS à la retraite', it: 'Rendita AVS in vecchiaia', en: 'State pension (AHV) at retirement' },
  pillar2: { de: 'Pensionskassenrente im Alter', fr: 'Rente de caisse de pension à la retraite', it: 'Rendita di cassa pensione in vecchiaia', en: 'Pension fund pension at retirement' },
  pillar3: { de: 'Private Vorsorge im Alter', fr: 'Prévoyance privée à la retraite', it: 'Previdenza privata in vecchiaia', en: 'Private pension at retirement' },
  review: {
    de: 'Eine Pax-Fachperson prüft die Berechnung und die Empfehlung.',
    fr: 'Un·e spécialiste Pax vérifie le calcul et la recommandation.',
    it: 'Uno specialista Pax verifica il calcolo e la raccomandazione.',
    en: 'A Pax specialist reviews the calculation and the recommendation.',
  },
  recommendation: {
    de: 'Passende Lösungen ansehen, sobald die Prüfung abgeschlossen ist.',
    fr: "Voir les solutions adaptées une fois la vérification terminée.",
    it: 'Vedere le soluzioni adatte una volta conclusa la verifica.',
    en: 'Look at fitting solutions once the review is done.',
  },
  complete: {
    de: 'Fehlende Angaben ergänzen: {fields}.',
    fr: 'Compléter les informations manquantes : {fields}.',
    it: 'Completare i dati mancanti: {fields}.',
    en: 'Add the missing details: {fields}.',
  },
  assumption: { de: 'Annahme der Berechnung', fr: 'Hypothèse du calcul', it: 'Ipotesi del calcolo', en: 'Calculation assumption' },
} satisfies Record<string, Text>;

/** Mirror of `QUALIFIED_PRODUCT_IDS` in @pax/contracts: loss risk in the saving process. */
const UNIT_LINKED = new Set(['pax_fondsstar', 'pax_lifestar', 'pax_payout']);

const PILLAR_KEYS: Readonly<Record<Pillar, '1' | '2' | '3'>> = { pillar1: '1', pillar2: '2', pillar3: '3' };

export function projectSummary(
  dto: InsuranceCaseDto,
  context: AdvisorContext | null,
  summaries: CaseSummaries | null,
  risks: readonly RiskItem[],
  language: Language,
  suitability: SuitabilityView | null = null,
): SummaryBundle | null {
  const summary = summaries?.customer;
  if (!summary || summary.profileVersion === null || summary.runId === null) return null;
  const t = (text: Text) => text[language];
  const run = dto.runs.find((r) => r.id === summary.runId);
  const progress = context?.progress.groups ?? [];
  const complete = (...ids: string[]) => ids.every((id) => progress.find((g) => g.id === id)?.complete === true);
  const reviewOpen = context?.progress.reviewOpen ?? summary.reviewTasks.some((task) => task.status === 'open');

  const keyFacts: SummaryFact[] = (summary.presentation?.metrics ?? []).slice(0, 6).map((metric) => ({
    factId: metric.id,
    label: metric.label,
    value:
      metric.valueCents === null
        ? null
        : money(metric.valueCents, metric.period, metric.period === 'once' ? 'capital' : 'net_after_income_tax'),
  }));

  const goals: SummaryPoint[] = summary.goals.map((goal) => ({
    id: goal.id,
    text: [GOALS[goal.kind] ? t(GOALS[goal.kind]!) : goal.kind, goal.targetMonth ? t(TEXT.by).replace('{year}', goal.targetMonth.slice(0, 4)) : '']
      .filter(Boolean)
      .join(' '),
  }));

  const pillars = Object.fromEntries(
    (Object.keys(PILLAR_KEYS) as Pillar[]).map((pillar) => {
      const picture = summary.pillarPicture?.find((p) => p.pillar === PILLAR_KEYS[pillar]);
      const pension = picture?.annualPensions.find((a) => a.event === 'retirement_household');
      const value: PillarSummary = {
        status: (picture?.status ?? 'needs_input') as ResultStatus,
        text: t(TEXT[pillar]),
        retirementIncome: pension && pension.amountCents !== null ? money(pension.amountCents, 'year', 'gross') : null,
      };
      return [pillar, value];
    }),
  ) as Record<Pillar, PillarSummary>;

  const gaps: SummaryGap[] = risks
    .filter((risk) => risk.status !== 'addressed')
    .map((risk) => ({ gapId: risk.riskId, label: risk.title, amount: risk.amount, status: risk.resultStatus, relatedRiskId: risk.riskId }));

  const missing = context?.missingFields ?? [];
  const openQuestions: SummaryPoint[] = missing.length
    ? [{ id: 'missing_fields', text: t(TEXT.complete).replace('{fields}', missing.join(', ')) }]
    : [];
  const nextSteps: SummaryPoint[] = [
    ...(reviewOpen ? [{ id: 'expert_review', text: t(TEXT.review) }] : []),
    ...(summary.recommendations.length ? [{ id: 'recommendation', text: t(TEXT.recommendation) }] : []),
  ];

  const recommendation = [...summary.recommendations].reverse().find((r) => r.runId === summary.runId);
  const products: SummaryProduct[] = (recommendation?.candidates ?? []).map((candidate) => ({
    candidateId: candidate.id,
    productId: candidate.productId,
    name: candidate.productName,
    ...(candidate.personId ? { personId: candidate.personId } : {}),
    need: money(candidate.needAmountCents, candidate.needPeriod, candidate.needPeriod === 'once' ? 'capital' : 'net_after_income_tax'),
    unitLinked: UNIT_LINKED.has(candidate.productId),
  }));

  return {
    schemaVersion: '1.0',
    messageId: `summary_${summary.snapshotId.slice(0, 16)}`,
    caseId: dto.id,
    correlationId: `case_${dto.id}`,
    snapshotId: summary.snapshotId,
    profileVersion: summary.profileVersion,
    scenarioVersionId: run?.scenarioVersionId ?? 'baseline',
    runRefs: [summary.runId],
    audiences: ['customer', 'advisor'],
    status: reviewOpen || summary.draftPending ? 'draft' : 'final',
    reviewOpen,
    keyFacts,
    goals,
    pillars,
    gaps,
    openQuestions,
    nextSteps,
    productGate: {
      needsCaptured: complete('life_goals'),
      financesCaptured: complete('income', 'budget', 'capital'),
      allPillarsCaptured: complete('pillar_1', 'pillar_2', 'pillar_3'),
      // A suitable pre-check for the current profile; the binding check stays with a Pax advisor.
      suitabilityCheckDone: (suitability?.checks ?? []).some(
        (check) => check.profileVersion === summary.profileVersion && check.result === 'suitable',
      ),
    },
    products,
  };
}

/** The assumptions behind the shown figures, in the backend's localized wording. */
export function projectInfo(dto: InsuranceCaseDto, summaries: CaseSummaries | null, language: Language): InfoItem[] {
  // The time of the run they belong to, so a reload of the same run marks nothing as new.
  const at = dto.runs.find((run) => run.id === summaries?.customer.runId)?.createdAt ?? dto.updatedAt;
  return (summaries?.customer.assumptions ?? []).map((body, index) => ({
    infoId: `info_assumption_${index}`,
    category: 'assumption',
    title: TEXT.assumption[language],
    body,
    at,
    sourceRef: summaries?.customer.runId ? `run:${summaries.customer.runId}` : undefined,
  }));
}

/** The voice agent's call history; it only records finished turns. */
export function projectTranscript(turns: readonly AgentTurn[]): TranscriptEntry[] {
  return turns.map((turn) => ({
    entryId: turn.messageId,
    turnId: turn.messageId,
    speaker: turn.speaker,
    text: turn.text,
    status: 'final',
    at: turn.at,
  }));
}

function money(amount: number, period: MoneyUnit['period'], basis: MoneyUnit['basis']): Money {
  return { currency: 'CHF', unit: 'cent', period, basis, amount };
}
