import type { AdvisorContext, InsuranceCaseDto, LifeAnalysis } from '@pax/contracts';
import type { MoneyUnit, ProgressGroup, ProgressGroupId, ProgressSnapshot, ResultStatus } from '../contracts';
import type { Language } from '../../i18n/language';
import type {
  ChartResult,
  EventImpactChart,
  EventImpactScenario,
  IncomeTimelineChart,
  LifeEvent,
  LifeEventsChart,
  MoneySeries,
  RiskItem,
  RiskSeverity,
} from '../ui-models';

/**
 * Maps the shared case of the backend onto the view models of the workspace tabs. Every amount is
 * a backend figure; the projection only groups months into years and picks per person and event.
 * The few sums it does (persons of one month, benefits per pillar) restate the backend's own split.
 */

export const CHART_INCOME = 'chart_income_timeline';
export const CHART_IMPACT = 'chart_event_impact';
export const CHART_LIFE_EVENTS = 'chart_life_events';

export interface CaseProjection {
  readonly charts: readonly ChartResult[];
  readonly risks: readonly RiskItem[];
  readonly progress: ProgressSnapshot | null;
}

const YEARLY_NET: MoneyUnit = {
  currency: 'CHF',
  unit: 'cent',
  period: 'year',
  basis: 'net_after_income_tax',
};

type Text = Readonly<Record<Language, string>>;

const TEXT = {
  today: { de: 'Heute', fr: "Aujourd'hui", it: 'Oggi', en: 'Today' },
  marriage: { de: 'Heirat', fr: 'Mariage', it: 'Matrimonio', en: 'Marriage' },
  child: { de: 'Geburt Kind', fr: "Naissance d'un enfant", it: 'Nascita figlio', en: 'Child born' },
  home: { de: 'Eigenheim (Ziel)', fr: 'Logement (objectif)', it: 'Casa propria (obiettivo)', en: 'Home (goal)' },
  retirement: { de: 'Pensionierung', fr: 'Retraite', it: 'Pensionamento', en: 'Retirement' },
  person: { de: 'Person', fr: 'Personne', it: 'Persona', en: 'Person' },
  disability: {
    de: 'Erwerbsunfähigkeit',
    fr: "Incapacité de gain",
    it: 'Incapacità di guadagno',
    en: 'Disability',
  },
  death: { de: 'Todesfall', fr: 'Décès', it: 'Decesso', en: 'Death' },
  retirementGap: {
    de: 'Vorsorgelücke im Alter',
    fr: 'Lacune de prévoyance à la retraite',
    it: 'Lacuna previdenziale in vecchiaia',
    en: 'Retirement gap',
  },
  gapExplanation: {
    de: 'Laut Berechnung fehlen pro Jahr {amount} gegenüber dem erfassten Bedarf.',
    fr: 'Selon le calcul, il manque {amount} par an par rapport au besoin saisi.',
    it: "Secondo il calcolo mancano {amount} all'anno rispetto al fabbisogno indicato.",
    en: 'The calculation shows {amount} per year missing against the stated need.',
  },
  noGap: {
    de: 'Laut Berechnung ist der erfasste Bedarf gedeckt.',
    fr: 'Selon le calcul, le besoin saisi est couvert.',
    it: 'Secondo il calcolo il fabbisogno indicato è coperto.',
    en: 'The calculation shows the stated need covered.',
  },
  unknownGap: {
    de: 'Für diese Lücke fehlen noch Angaben.',
    fr: 'Des informations manquent encore pour cette lacune.',
    it: 'Per questa lacuna mancano ancora dati.',
    en: 'Details are still missing for this gap.',
  },
  retirementUnfunded: {
    de: 'Ab {month} reichen Renten und Vermögen laut Zeitreihe nicht mehr für den Bedarf.',
    fr: 'Dès {month}, rentes et avoirs ne couvrent plus le besoin selon la projection.',
    it: 'Da {month} rendite e patrimonio non coprono più il fabbisogno secondo la proiezione.',
    en: 'From {month}, pensions and assets no longer cover the need in the projection.',
  },
} satisfies Record<string, Text>;

export function projectCase(
  dto: InsuranceCaseDto,
  context: AdvisorContext | null,
  language: Language,
  at = new Date().toISOString(),
): CaseProjection {
  const t = (text: Text) => text[language];
  const profile = dto.confirmedVersions.at(-1) ?? null;
  const current = dto.runs.filter((run) => run.status !== 'stale' && run.profileVersion === profile?.version);
  const baseline =
    current.find((run) => run.id === dto.activeRunId && run.scenario.kind === 'baseline') ??
    last(current, (run) => run.scenario.kind === 'baseline') ??
    null;
  const retirement = last(current, (run) => run.timeline !== null) ?? null;

  const charts: ChartResult[] = [];
  const events = lifeEvents(dto, t, at);
  if (events) charts.push(events);
  if (retirement) charts.push(incomeTimeline(retirement, dto.contextRevision, at));
  if (baseline) charts.push(eventImpact(baseline, retirement, profile?.draft ?? null, dto.contextRevision, at));

  return {
    charts,
    risks: baseline ? risks(baseline, retirement, t, language) : [],
    progress: context ? progress(dto, context, current.length > 0) : null,
  };
}

function last<T>(items: readonly T[], match: (item: T) => boolean): T | undefined {
  return [...items].reverse().find(match);
}

// --- Charts ------------------------------------------------------------------------------------

function refs(run: LifeAnalysis) {
  return { profileVersion: run.profileVersion, scenarioVersionId: run.scenarioVersionId, runId: run.id };
}

function status(value: string): ResultStatus {
  return value === 'unsupported' ? 'requires_review' : (value as ResultStatus);
}

function incomeTimeline(run: LifeAnalysis, revision: number, at: string): IncomeTimelineChart {
  const timeline = run.timeline!;
  const byYear = new Map<number, (typeof timeline.periods)[number][]>();
  for (const period of timeline.periods) {
    const year = Number(period.month.slice(0, 4));
    byYear.set(year, [...(byYear.get(year) ?? []), period]);
  }
  const years = [...byYear.keys()];
  // Annualized from the months of that year, so a partial first year is not shown as a drop.
  const annual = (pick: (p: (typeof timeline.periods)[number]) => number | null) =>
    years.map((year) => {
      const months = byYear.get(year)!;
      const values = months.map(pick);
      if (values.some((v) => v === null)) return null;
      return Math.round(((values as number[]).reduce((a, b) => a + b, 0) / months.length) * 12);
    });
  const persons = (key: 'employmentCents' | 'pillar1Cents' | 'pillar2Cents' | 'pillar3Cents') =>
    annual((p) =>
      p.persons.some((x) => x[key] === null) ? null : p.persons.reduce((sum, x) => sum + (x[key] ?? 0), 0),
    );
  const series = (values: (number | null)[]): MoneySeries => ({ values, status: timeline.status });
  return {
    chartId: CHART_INCOME,
    type: 'income_timeline',
    status: timeline.status,
    revision,
    updatedAt: at,
    reviewReasons: run.reviewReasons,
    ...refs(run),
    unit: YEARLY_NET,
    years,
    series: {
      employment: series(persons('employmentCents')),
      pillar1: series(persons('pillar1Cents')),
      pillar2: series(persons('pillar2Cents')),
      pillar3: series(persons('pillar3Cents')),
      // What the need exceeds the income by: drawn from savings or not funded at all.
      gap: series(
        annual((p) =>
          p.withdrawalCents === null || p.unfundedCents === null ? null : p.withdrawalCents + p.unfundedCents,
        ),
      ),
    },
    target: series(annual((p) => p.needCents)),
  };
}

const EVENTS = [
  ['disability', 'disability_illness'],
  ['death', 'death_illness'],
] as const;

function benefit(run: LifeAnalysis, pillar: '1' | '2', event: string, personId: string | null) {
  return (
    run.pillarPicture
      .find((p) => p.pillar === pillar)
      ?.annualPensions.find((a) => a.event === event && a.personId === personId)?.amountCents ?? null
  );
}

function eventImpact(
  baseline: LifeAnalysis,
  retirement: LifeAnalysis | null,
  draft: InsuranceCaseDto['draft'] | null,
  revision: number,
  at: string,
): EventImpactChart {
  const incomeBefore = baseline.local.metrics.find((m) => m.id === 'incomeAnnual')?.value ?? null;
  const scenarios: EventImpactScenario[] = [];
  for (const person of draft?.insurance?.persons ?? []) {
    for (const [event, providerEvent] of EVENTS) {
      const need = baseline.riskNeeds.find((r) => r.personId === person.personId && r.event === providerEvent);
      if (!need) continue;
      const pillar1 = benefit(baseline, '1', providerEvent, person.personId);
      const pillar2 = benefit(baseline, '2', providerEvent, person.personId);
      const pillar3 = need.privatePillar3IncomeCents;
      // The provider income holds the household's remaining earnings next to the benefits.
      const employment =
        need.providerIncomeCents === null || pillar1 === null || pillar2 === null
          ? null
          : Math.max(0, need.providerIncomeCents - pillar1 - pillar2);
      scenarios.push({
        event,
        personId: person.personId,
        status: status(need.status),
        incomeBefore,
        incomeAfter: { employment, pillar1, pillar2, pillar3 },
        needed: need.annualNeedCents,
        gap: need.annualGapCents,
      });
    }
  }
  const pension = retirement?.timeline?.periods.find((p) => p.persons.every((x) => x.phase === 'pension'));
  const first = draft?.insurance?.persons[0];
  if (pension && first) {
    const sum = (key: 'pillar1Cents' | 'pillar2Cents' | 'pillar3Cents') =>
      pension.persons.some((x) => x[key] === null) ? null : pension.persons.reduce((s, x) => s + (x[key] ?? 0), 0) * 12;
    scenarios.push({
      event: 'retirement',
      personId: first.personId,
      status: retirement!.timeline!.status,
      incomeBefore,
      incomeAfter: { employment: 0, pillar1: sum('pillar1Cents'), pillar2: sum('pillar2Cents'), pillar3: sum('pillar3Cents') },
      needed: pension.needCents === null ? null : pension.needCents * 12,
      gap:
        pension.withdrawalCents === null || pension.unfundedCents === null
          ? null
          : (pension.withdrawalCents + pension.unfundedCents) * 12,
    });
  }
  return {
    chartId: CHART_IMPACT,
    type: 'event_impact',
    status: status(baseline.local.statusByArea.pillars ?? 'estimated'),
    revision,
    updatedAt: at,
    reviewReasons: baseline.reviewReasons,
    ...refs(baseline),
    unit: YEARLY_NET,
    scenarios,
  };
}

function lifeEvents(dto: InsuranceCaseDto, t: (text: Text) => string, at: string): LifeEventsChart | null {
  const profile = dto.confirmedVersions.at(-1);
  const draft = profile?.draft ?? dto.draft;
  if (!draft.financial) return null;
  const now = Number(at.slice(0, 4));
  const certainty = (year: number): LifeEvent['certainty'] => (year <= now ? 'past' : 'planned');
  const events: LifeEvent[] = [{ eventId: 'event_today', kind: 'today', year: now, label: t(TEXT.today), certainty: 'confirmed' }];
  const insurance = draft.insurance;
  if (insurance?.relationship === 'married' && insurance.relationshipSinceYear) {
    events.push({ eventId: 'event_marriage', kind: 'marriage', year: insurance.relationshipSinceYear, label: t(TEXT.marriage), certainty: 'past' });
  }
  for (const child of insurance?.children ?? []) {
    events.push({ eventId: `event_${child.id}`, kind: 'child_birth', year: child.birthYear, label: t(TEXT.child), certainty: certainty(child.birthYear) });
  }
  const home = draft.goals.find((g) => g.kind === 'home' && g.targetMonth);
  if (home?.targetMonth) {
    const year = Number(home.targetMonth.slice(0, 4));
    events.push({ eventId: 'event_home', kind: 'home_purchase', year, label: t(TEXT.home), certainty: 'planned' });
  }
  draft.financial.persons.forEach((person, index) => {
    const age = insurance?.persons.find((p) => p.personId === person.id)?.desiredWorkStopAge;
    if (!age) return;
    events.push({
      eventId: `event_retirement_${person.id}`,
      kind: 'retirement',
      year: person.birthYear + age,
      label: `${t(TEXT.retirement)} ${t(TEXT.person)} ${index + 1}`,
      personId: person.id,
      certainty: 'planned',
    });
  });
  events.sort((a, b) => a.year - b.year);
  return {
    chartId: CHART_LIFE_EVENTS,
    type: 'life_events',
    status: profile ? 'valid' : 'needs_input',
    revision: dto.contextRevision,
    updatedAt: at,
    reviewReasons: [],
    profileVersion: profile?.version ?? 0,
    scenarioVersionId: 'profile',
    fromYear: events[0]!.year - 1,
    toYear: events.at(-1)!.year + 1,
    events,
  };
}

// --- Risks -------------------------------------------------------------------------------------

function severity(gap: number | null, need: number | null): RiskSeverity {
  if (!gap || !need) return 'low';
  return gap / need >= 0.25 ? 'high' : 'medium';
}

function risks(
  baseline: LifeAnalysis,
  retirement: LifeAnalysis | null,
  t: (text: Text) => string,
  language: Language,
): RiskItem[] {
  const chf = (cents: number) =>
    new Intl.NumberFormat(`${language}-CH`, { style: 'currency', currency: 'CHF', maximumFractionDigits: 0 }).format(cents / 100);
  const personIds = [...new Set(baseline.riskNeeds.map((r) => r.personId))];
  const items: RiskItem[] = [];
  for (const [index, personId] of personIds.entries()) {
    for (const [category, prefix] of [['disability', 'disability_'], ['death', 'death_']] as const) {
      const needs = baseline.riskNeeds.filter((r) => r.personId === personId && r.event.startsWith(prefix));
      if (!needs.length) continue;
      // Illness and accident are separate provider events; the larger gap is the one to cover.
      const worst = needs.reduce((a, b) => ((b.annualGapCents ?? -1) > (a.annualGapCents ?? -1) ? b : a));
      const gap = needs.some((n) => n.annualGapCents === null) ? null : worst.annualGapCents;
      items.push({
        ...refs(baseline),
        riskId: `risk_${category}_${personId}`,
        category,
        severity: severity(gap, worst.annualNeedCents),
        pillars: ['pillar1', 'pillar2', 'pillar3'],
        amount: gap === null ? null : { ...YEARLY_NET, amount: gap },
        status: gap === null ? 'needs_data' : gap > 0 ? 'identified' : 'addressed',
        resultStatus: status(worst.status),
        title: `${t(TEXT[category])} · ${t(TEXT.person)} ${index + 1}`,
        explanation:
          gap === null ? t(TEXT.unknownGap) : gap > 0 ? t(TEXT.gapExplanation).replace('{amount}', chf(gap)) : t(TEXT.noGap),
        relatedChartId: CHART_IMPACT,
      });
    }
  }
  const timeline = retirement?.timeline;
  if (retirement && timeline) {
    const month = timeline.firstUnfundedMonth;
    items.push({
      ...refs(retirement),
      riskId: 'risk_retirement',
      category: 'retirement',
      severity: month ? 'high' : 'low',
      pillars: ['pillar1', 'pillar2', 'pillar3'],
      amount: null,
      status: timeline.status === 'needs_input' ? 'needs_data' : month ? 'identified' : 'addressed',
      resultStatus: timeline.status,
      title: t(TEXT.retirementGap),
      explanation: month ? t(TEXT.retirementUnfunded).replace('{month}', month) : t(TEXT.noGap),
      relatedChartId: CHART_INCOME,
    });
  }
  return items;
}

// --- Progress ----------------------------------------------------------------------------------

const GROUPS: Readonly<Record<string, ProgressGroupId>> = {
  life_goals: 'goals',
  budget: 'household',
  capital: 'household',
  insurance_parameters: 'household',
  income: 'income',
  pillar_1: 'pillar1',
  pillar_2: 'pillar2',
  pillar_3: 'pillar3',
};

function progress(dto: InsuranceCaseDto, context: AdvisorContext, calculated: boolean): ProgressSnapshot {
  const merged = new Map<ProgressGroupId, boolean[]>();
  for (const group of context.progress.groups) {
    const id = GROUPS[group.id];
    if (id) merged.set(id, [...(merged.get(id) ?? []), group.complete]);
  }
  const groups: ProgressGroup[] = [...merged].map(([groupId, complete]) => ({
    groupId,
    status: complete.every(Boolean) ? 'done' : complete.some(Boolean) ? 'partial' : 'open',
  }));
  groups.push({ groupId: 'scenarios', status: calculated ? 'done' : 'open' });
  return {
    schemaVersion: '1.0',
    messageId: `progress_${dto.contextRevision}`,
    caseId: dto.id,
    correlationId: `case_${dto.id}`,
    profileVersion: context.profileVersion ?? 0,
    domain: 'data_capture',
    percent: context.progress.percent,
    groups,
    openGroups: groups.filter((g) => g.status === 'open' || g.status === 'partial').map((g) => g.groupId),
    reviewOpen: context.progress.reviewOpen,
  };
}
