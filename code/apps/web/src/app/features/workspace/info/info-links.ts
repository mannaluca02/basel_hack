import {
  ChartResult,
  ChartType,
  InfoCategory,
  InfoItem,
  RiskItem,
} from '../../../core/advisor/ui-models';

/** A basic explanation that is always in the Info tab, independent of the call. */
export interface GlossaryEntry {
  /** Prefixed, so it never collides with an `infoId` from the backend. */
  readonly infoId: string;
  readonly titleKey: string;
  readonly bodyKey: string;
}

// Translation keys, written out in full for the i18n check.

/** Neutral basics (FE-18): the three pillars, 3a and 3b, and the pension gap. No products. */
export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    infoId: 'glossary_three_pillars',
    titleKey: 'info.glossary.threePillars.title',
    bodyKey: 'info.glossary.threePillars.body',
  },
  {
    infoId: 'glossary_pillar1',
    titleKey: 'info.glossary.pillar1.title',
    bodyKey: 'info.glossary.pillar1.body',
  },
  {
    infoId: 'glossary_pillar2',
    titleKey: 'info.glossary.pillar2.title',
    bodyKey: 'info.glossary.pillar2.body',
  },
  {
    infoId: 'glossary_pillar3a',
    titleKey: 'info.glossary.pillar3a.title',
    bodyKey: 'info.glossary.pillar3a.body',
  },
  {
    infoId: 'glossary_pillar3b',
    titleKey: 'info.glossary.pillar3b.title',
    bodyKey: 'info.glossary.pillar3b.body',
  },
  {
    infoId: 'glossary_gap',
    titleKey: 'info.glossary.gap.title',
    bodyKey: 'info.glossary.gap.body',
  },
];

const GLOSSARY_IDS: ReadonlySet<string> = new Set(GLOSSARY.map((entry) => entry.infoId));

/** The basic explanation a chart links to when the call has pushed nothing for it. */
const CHART_GLOSSARY: Readonly<Partial<Record<ChartType, string>>> = {
  income_timeline: 'glossary_three_pillars',
  event_impact: 'glossary_gap',
  pillar3a_growth: 'glossary_pillar3a',
};

const CATEGORIES: ReadonlySet<InfoCategory> = new Set(['basics', 'term', 'assumption']);

/**
 * The info cards pushed during the call, newest first. Only the neutral categories pass: should
 * the backend ever send anything else (e.g. product content), it stays out of the Info tab.
 */
export function pushedInfo(items: readonly InfoItem[]): InfoItem[] {
  return (
    items
      .filter((item) => CATEGORIES.has(item.category))
      // Reversed first, so of two cards with the same time the later arrival comes first.
      .reverse()
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  );
}

/** The info card a risk points to, if the Info tab has it. */
export function infoForRisk(risk: RiskItem, pushed: readonly InfoItem[]): string | null {
  const id = risk.relatedInfoId;
  if (id && (GLOSSARY_IDS.has(id) || pushed.some((item) => item.infoId === id))) return id;
  return pushed.find((item) => item.relatedRiskId === risk.riskId)?.infoId ?? null;
}

/** The newest pushed card about a chart, or the basic explanation behind its type. */
export function infoForChart(chart: ChartResult, pushed: readonly InfoItem[]): string | null {
  return (
    pushed.find((item) => item.relatedChartId === chart.chartId)?.infoId ??
    CHART_GLOSSARY[chart.type] ??
    null
  );
}
