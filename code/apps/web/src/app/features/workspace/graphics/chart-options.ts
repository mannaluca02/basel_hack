import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts';
import type {
  GridComponentOption,
  MarkLineComponentOption,
  TooltipComponentOption,
} from 'echarts/components';
import type { ComposeOption } from 'echarts/core';
import {
  MoneyBasis,
  MoneyPeriod,
  MoneyUnit,
  Pillar,
  ResultStatus,
} from '../../../core/advisor/contracts';
import {
  ChartResult,
  ChartType,
  EventImpactChart,
  ImpactEventKind,
  IncomeTimelineChart,
  LifeEvent,
  LifeEventsChart,
  Pillar3aGrowthChart,
} from '../../../core/advisor/ui-models';

/**
 * Pure builders from a chart result to what a card shows: the ECharts option (or, for the
 * life-event timeline, plain entries), the text legend and the data table. Pure, so the specs run
 * without a DOM or ECharts.
 *
 * Rule 3: amounts arrive in Rappen and are only converted to francs and formatted here. No sum,
 * gap or other figure is derived; a gap is drawn only where the backend sends one.
 */

export type ChartOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | MarkLineComponentOption
>;

export type CssToken = `--${string}`;

/** Everything a builder needs besides the chart. The card binds it to tokens, i18n and locale. */
export interface ChartContext {
  /** Resolved value of a design token; ECharts cannot read `var()`. */
  readonly token: (name: CssToken) => string;
  readonly t: (key: string, params?: Readonly<Record<string, string | number>>) => string;
  /** Francs, full precision for tooltip, table and labels: `CHF 1'234`. */
  readonly chf: (francs: number) => string;
  /** Francs as a short number for axis labels; the card's unit line names the currency. */
  readonly short: (francs: number) => string;
  /** False under `prefers-reduced-motion`. */
  readonly animate: boolean;
}

/** What the reader chose inside the card. */
export interface ViewChoice {
  /** Index of the shown scenario of an event-impact chart; out-of-range values are clamped. */
  readonly scenario: number;
}

export type LegendMark = 'bar' | 'hatched' | 'line' | 'dashed' | 'vline' | 'dot' | 'ring';

export interface LegendItem {
  readonly label: string;
  /** Colour token of the series, also used for the HTML swatch. */
  readonly token: CssToken;
  readonly mark: LegendMark;
  /** Status of the series when the card status does not already say it, e.g. "needs input". */
  readonly note?: string;
}

export interface ChartTableRow {
  readonly header: string;
  readonly cells: readonly string[];
}

export interface ChartTable {
  /** First entry heads the row header column. */
  readonly columns: readonly string[];
  readonly rows: readonly ChartTableRow[];
  /** Text tables read from the left; amounts default to the right, so the digits line up. */
  readonly text?: boolean;
}

/** One row of the life-event timeline. */
export interface TimelineEntry {
  readonly id: string;
  readonly year: string;
  readonly label: string;
  readonly certainty: LifeEvent['certainty'];
  readonly certaintyLabel: string;
  readonly token: CssToken;
  readonly today: boolean;
}

export interface ChartView {
  /** `null` when the chart is plain HTML instead of ECharts (`timeline`). */
  readonly option: ChartOption | null;
  readonly timeline: readonly TimelineEntry[] | null;
  /** Labels for the scenario switch of an event-impact chart, else `null`. */
  readonly scenarios: readonly string[] | null;
  /** The scenario shown, after clamping. */
  readonly scenario: number;
  readonly legend: readonly LegendItem[];
  /** The same data as a table; every chart type offers one. */
  readonly table: ChartTable;
  /** e.g. "CHF per year · gross"; `null` for charts without amounts. */
  readonly unit: string | null;
  /** A backend figure that belongs to the chart but not on an axis, e.g. the 3a tax saving. */
  readonly annotation: string | null;
}

// Translation keys, written out in full for the i18n check.

export const TITLE_KEYS: Readonly<Record<ChartType, string>> = {
  income_timeline: 'graphics.chart.income_timeline',
  event_impact: 'graphics.chart.event_impact',
  pillar3a_growth: 'graphics.chart.pillar3a_growth',
  life_events: 'graphics.chart.life_events',
};

export const STATUS_KEYS: Readonly<Record<ResultStatus, string>> = {
  valid: 'graphics.status.valid',
  estimated: 'graphics.status.estimated',
  requires_review: 'graphics.status.requires_review',
  needs_input: 'graphics.status.needs_input',
  provider_error: 'graphics.status.provider_error',
  stale: 'graphics.status.stale',
};

const PERIOD_KEYS: Readonly<Record<MoneyPeriod, string>> = {
  month: 'graphics.unit.month',
  year: 'graphics.unit.year',
  once: 'graphics.unit.once',
};

const BASIS_KEYS: Readonly<Record<MoneyBasis, string>> = {
  gross: 'graphics.basis.gross',
  net_before_income_tax: 'graphics.basis.net_before_income_tax',
  net_after_income_tax: 'graphics.basis.net_after_income_tax',
  capital: 'graphics.basis.capital',
};

type IncomePart = 'employment' | Pillar | 'gap';
const INCOME_PARTS: readonly IncomePart[] = ['employment', 'pillar1', 'pillar2', 'pillar3', 'gap'];
const AFTER_PARTS: readonly ('employment' | Pillar)[] = [
  'employment',
  'pillar1',
  'pillar2',
  'pillar3',
];

const SERIES_KEYS = {
  employment: 'graphics.series.employment',
  pillar1: 'graphics.series.pillar1',
  pillar2: 'graphics.series.pillar2',
  pillar3: 'graphics.series.pillar3',
  gap: 'graphics.series.gap',
  target: 'graphics.series.target',
  before: 'graphics.series.before',
  needed: 'graphics.series.needed',
  withContributions: 'graphics.series.withContributions',
  withoutContributions: 'graphics.series.withoutContributions',
} as const;

type SeriesKey = keyof typeof SERIES_KEYS;

// --chart-2 (Pax purple) is avoided: the chart tokens do not change with the theme, and purple
// almost disappears on the dark background. Reference lines take the text colour instead.
const SERIES_TOKENS: Readonly<Record<SeriesKey, CssToken>> = {
  employment: '--chart-8',
  pillar1: '--chart-5',
  pillar2: '--chart-1',
  pillar3: '--chart-3',
  gap: '--chart-6',
  target: '--text-default',
  before: '--chart-7',
  needed: '--text-default',
  withContributions: '--chart-1',
  withoutContributions: '--chart-5',
};

const EVENT_KEYS: Readonly<Record<ImpactEventKind, string>> = {
  disability: 'graphics.event.disability',
  death: 'graphics.event.death',
  retirement: 'graphics.event.retirement',
};

const CERTAINTIES: readonly LifeEvent['certainty'][] = ['past', 'confirmed', 'planned'];

const CERTAINTY_KEYS: Readonly<Record<LifeEvent['certainty'], string>> = {
  past: 'graphics.certainty.past',
  confirmed: 'graphics.certainty.confirmed',
  planned: 'graphics.certainty.planned',
};

const CERTAINTY_TOKENS: Readonly<Record<LifeEvent['certainty'], CssToken>> = {
  past: '--chart-7',
  confirmed: '--chart-1',
  planned: '--chart-4',
};

/** The shape repeats the certainty, so it never relies on colour alone. */
const CERTAINTY_MARKS: Readonly<Record<LifeEvent['certainty'], LegendMark>> = {
  past: 'dot',
  confirmed: 'dot',
  planned: 'ring',
};

const PAYOUT_TOKEN: CssToken = '--text-muted';

export function buildChartView(
  chart: ChartResult,
  ctx: ChartContext,
  choice: ViewChoice = { scenario: 0 },
): ChartView {
  switch (chart.type) {
    case 'income_timeline':
      return incomeTimeline(chart, ctx);
    case 'event_impact':
      return eventImpact(chart, ctx, choice);
    case 'pillar3a_growth':
      return pillar3aGrowth(chart, ctx);
    case 'life_events':
      return lifeEvents(chart, ctx);
  }
}

// --- per type ----------------------------------------------------------------------------------

/** Stacked income per pillar over the years, the backend's gap hatched on top, target as a line. */
function incomeTimeline(chart: IncomeTimelineChart, ctx: ChartContext): ChartView {
  const years = chart.years.map(String);
  const bars: BarSeriesOption[] = INCOME_PARTS.map((part) => ({
    ...(part === 'gap' ? gapBar(ctx) : bar(part, ctx)),
    stack: 'income',
    data: chart.series[part].values.map(francs),
  }));
  const target: LineSeriesOption = {
    ...line('target', ctx, 'dashed'),
    data: chart.target.values.map(francs),
  };
  return {
    ...noExtras,
    option: { ...frame(ctx, years), series: [...bars, target] },
    legend: [
      ...INCOME_PARTS.map((part) =>
        legendItem(part, part === 'gap' ? 'hatched' : 'bar', ctx, chart.series[part].status, chart),
      ),
      legendItem('target', 'dashed', ctx, chart.target.status, chart),
    ],
    table: {
      columns: [
        ctx.t('graphics.table.year'),
        ...INCOME_PARTS.map((part) => ctx.t(SERIES_KEYS[part])),
        ctx.t(SERIES_KEYS.target),
      ],
      rows: years.map((year, i) => ({
        header: year,
        cells: [...INCOME_PARTS.map((part) => chart.series[part]), chart.target].map((series) =>
          amount(series.values[i] ?? null, ctx),
        ),
      })),
    },
    unit: unitLabel(chart.unit, ctx),
  };
}

/**
 * One scenario at a time: income before the event next to income after it (stacked per source,
 * the backend's gap hatched on top), the needed income as a reference line across both. The
 * table keeps every scenario.
 */
function eventImpact(chart: EventImpactChart, ctx: ChartContext, choice: ViewChoice): ChartView {
  const labels = scenarioLabels(chart, ctx);
  const index = Math.min(Math.max(0, choice.scenario), Math.max(0, chart.scenarios.length - 1));
  const shown = chart.scenarios[index];
  const pick = (value: (s: NonNullable<typeof shown>) => number | null) =>
    shown ? francs(value(shown)) : null;
  const needed = pick((s) => s.needed);
  const neededColor = ctx.token(SERIES_TOKENS.needed);

  const before: BarSeriesOption = {
    ...bar('before', ctx),
    stack: 'income',
    data: [pick((s) => s.incomeBefore), null],
  };
  const after: BarSeriesOption[] = AFTER_PARTS.map((part) => ({
    ...bar(part, ctx),
    stack: 'income',
    data: [null, pick((s) => s.incomeAfter[part])],
  }));
  const gap: BarSeriesOption = {
    ...gapBar(ctx),
    stack: 'income',
    data: [null, pick((s) => s.gap)],
  };
  // The needed income as an invisible series: it stretches the y axis to include the value (with
  // ECharts' rounded ticks) and appears in the tooltip; the markLine draws the visible line.
  const neededLine: LineSeriesOption = {
    id: 'needed',
    name: ctx.t(SERIES_KEYS.needed),
    type: 'line',
    data: [needed, needed],
    showSymbol: false,
    lineStyle: { opacity: 0 },
    emphasis: { disabled: true },
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: { color: neededColor, type: 'dashed', width: 2 },
      label: {
        position: 'insideEndTop',
        color: neededColor,
        // Readable where the line crosses a bar, e.g. when income after the event is higher.
        backgroundColor: ctx.token('--bg-default'),
        padding: [2, 4],
        borderRadius: 4,
        formatter: () =>
          needed === null ? '' : ctx.t('graphics.neededLine', { amount: ctx.chf(needed) }),
      },
      data: needed === null ? [] : [{ yAxis: needed }],
    },
  };

  const categories = [ctx.t('graphics.impact.before'), ctx.t('graphics.impact.after')];
  return {
    ...noExtras,
    option: {
      ...frame(ctx, categories, { everyLabel: true }),
      series: [
        ...[before, ...after, gap].map((series) => ({ ...series, barMaxWidth: 72 })),
        neededLine,
      ],
    },
    scenarios: labels,
    scenario: index,
    legend: [
      legendItem('before', 'bar', ctx),
      ...AFTER_PARTS.map((part) => legendItem(part, 'bar', ctx)),
      legendItem('gap', 'hatched', ctx),
      legendItem('needed', 'dashed', ctx),
    ],
    table: {
      columns: [
        ctx.t('graphics.table.scenario'),
        ctx.t(SERIES_KEYS.before),
        ...AFTER_PARTS.map((part) => ctx.t(SERIES_KEYS[part])),
        ctx.t(SERIES_KEYS.needed),
        ctx.t(SERIES_KEYS.gap),
        ctx.t('graphics.table.status'),
      ],
      rows: chart.scenarios.map((s, i) => ({
        header: labels[i],
        cells: [
          amount(s.incomeBefore, ctx),
          ...AFTER_PARTS.map((part) => amount(s.incomeAfter[part], ctx)),
          amount(s.needed, ctx),
          amount(s.gap, ctx),
          ctx.t(STATUS_KEYS[s.status]),
        ],
      })),
    },
    unit: unitLabel(chart.unit, ctx),
  };
}

/** 3a capital over the years, with and without contributions; payout marked when known. */
function pillar3aGrowth(chart: Pillar3aGrowthChart, ctx: ChartContext): ChartView {
  const years = chart.years.map(String);
  const parts = ['withContributions', 'withoutContributions'] as const;
  const marks = { withContributions: 'line', withoutContributions: 'dashed' } as const;
  // On a category axis the marker needs a sampled year; without one it is left out.
  const payout =
    chart.payoutYear !== undefined && years.includes(String(chart.payoutYear))
      ? String(chart.payoutYear)
      : null;
  const payoutColor = ctx.token(PAYOUT_TOKEN);
  const series: LineSeriesOption[] = parts.map((part) => ({
    ...line(part, ctx, marks[part]),
    data: chart.series[part].values.map(francs),
  }));
  series[0] = {
    ...series[0],
    markLine: {
      silent: true,
      symbol: 'none',
      label: { show: false },
      lineStyle: { color: payoutColor, type: 'dashed', width: 1 },
      data: payout === null ? [] : [{ xAxis: payout }],
    },
  };
  return {
    ...noExtras,
    option: { ...frame(ctx, years, { everyLabel: true }), series },
    legend: [
      ...parts.map((part) => legendItem(part, marks[part], ctx, chart.series[part].status, chart)),
      ...(payout === null
        ? []
        : [
            {
              label: ctx.t('graphics.payout', { year: payout }),
              token: PAYOUT_TOKEN,
              mark: 'vline' as const,
            },
          ]),
    ],
    table: {
      columns: [ctx.t('graphics.table.year'), ...parts.map((part) => ctx.t(SERIES_KEYS[part]))],
      rows: years.map((year, i) => ({
        header: year,
        cells: parts.map((part) => amount(chart.series[part].values[i] ?? null, ctx)),
      })),
    },
    unit: unitLabel(chart.unit, ctx),
    annotation:
      chart.taxSaving === null
        ? null
        : ctx.t('graphics.taxSaving', {
            amount: ctx.chf(chart.taxSaving.amount / 100),
            period: ctx.t(PERIOD_KEYS[chart.taxSaving.period]),
          }),
  };
}

/**
 * Life events as a vertical timeline, oldest first. Vertical, because on a phone a horizontal
 * year axis has no room for more than a few labels; a list grows with every event instead.
 */
function lifeEvents(chart: LifeEventsChart, ctx: ChartContext): ChartView {
  const timeline = [...chart.events]
    .sort((a, b) => a.year - b.year)
    .map<TimelineEntry>((e) => ({
      id: e.eventId,
      year: String(e.year),
      label: e.label,
      certainty: e.certainty,
      certaintyLabel: ctx.t(CERTAINTY_KEYS[e.certainty]),
      token: CERTAINTY_TOKENS[e.certainty],
      today: e.kind === 'today',
    }));
  return {
    ...noExtras,
    option: null,
    timeline,
    legend: CERTAINTIES.map((certainty) => ({
      label: ctx.t(CERTAINTY_KEYS[certainty]),
      token: CERTAINTY_TOKENS[certainty],
      mark: CERTAINTY_MARKS[certainty],
    })),
    table: {
      columns: [
        ctx.t('graphics.table.year'),
        ctx.t('graphics.table.event'),
        ctx.t('graphics.table.certainty'),
      ],
      rows: timeline.map((entry) => ({
        header: entry.year,
        cells: [entry.label, entry.certaintyLabel],
      })),
      text: true,
    },
    unit: null,
  };
}

// --- shared parts ------------------------------------------------------------------------------

const noExtras = { timeline: null, scenarios: null, scenario: 0, annotation: null } as const;

/** Rappen to francs, for display only. `null` stays unknown; ECharts leaves a gap for it. */
function francs(rappen: number | null): number | null {
  return rappen === null ? null : rappen / 100;
}

function amount(rappen: number | null, ctx: ChartContext): string {
  return rappen === null ? ctx.t('graphics.unknown') : ctx.chf(rappen / 100);
}

function unitLabel(unit: MoneyUnit, ctx: ChartContext): string {
  return `${ctx.t(PERIOD_KEYS[unit.period])} · ${ctx.t(BASIS_KEYS[unit.basis])}`;
}

/** Event names; a repeated event (e.g. disability of each partner) gets a running number. */
function scenarioLabels(chart: EventImpactChart, ctx: ChartContext): string[] {
  const seen = new Map<ImpactEventKind, number>();
  return chart.scenarios.map((s) => {
    const count = (seen.get(s.event) ?? 0) + 1;
    seen.set(s.event, count);
    const label = ctx.t(EVENT_KEYS[s.event]);
    return count === 1 ? label : `${label} ${count}`;
  });
}

function motion(ctx: ChartContext): ChartOption {
  return { animation: ctx.animate, animationDuration: 500, animationDurationUpdate: 600 };
}

/**
 * Category x axis and money y axis, themed from the tokens. `everyLabel` keeps ECharts from
 * dropping category labels: for a few categories that must all be named (before/after, the 3a
 * years). Long year axes keep the automatic thinning, or their labels would run into each other.
 */
function frame(ctx: ChartContext, categories: readonly string[], { everyLabel = false } = {}) {
  const muted = ctx.token('--text-muted');
  return {
    ...motion(ctx),
    textStyle: { fontFamily: ctx.token('--font-family') },
    grid: { left: 8, right: 8, top: 20, bottom: 8 },
    tooltip: {
      confine: true,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: ctx.token('--bg-default'),
      borderColor: ctx.token('--border-soft'),
      textStyle: { color: ctx.token('--text-default') },
      valueFormatter: (value: unknown) =>
        typeof value === 'number' ? ctx.chf(value) : ctx.t('graphics.unknown'),
    },
    xAxis: {
      type: 'category',
      data: [...categories],
      axisLabel: { color: muted, ...(everyLabel ? { interval: 0, hideOverlap: false } : {}) },
      axisLine: { lineStyle: { color: muted } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: muted, formatter: (value: number) => ctx.short(value) },
      splitLine: { lineStyle: { color: ctx.token('--border-soft') } },
    },
  } satisfies ChartOption;
}

/** Stable `id` per series, so an update merges into the drawn series and ECharts animates it. */
function bar(part: SeriesKey, ctx: ChartContext): BarSeriesOption {
  return {
    id: part,
    name: ctx.t(SERIES_KEYS[part]),
    type: 'bar',
    barMaxWidth: 28,
    itemStyle: { color: ctx.token(SERIES_TOKENS[part]) },
  };
}

/** The gap is missing income, not a source: hatched in the card's background colour. */
function gapBar(ctx: ChartContext): BarSeriesOption {
  const base = bar('gap', ctx);
  return {
    ...base,
    itemStyle: {
      ...base.itemStyle,
      decal: {
        color: ctx.token('--bg-default'),
        dashArrayX: [1, 0],
        dashArrayY: [2, 4],
        rotation: -Math.PI / 4,
      },
    },
  };
}

function line(part: SeriesKey, ctx: ChartContext, mark: 'line' | 'dashed'): LineSeriesOption {
  const color = ctx.token(SERIES_TOKENS[part]);
  return {
    id: part,
    name: ctx.t(SERIES_KEYS[part]),
    type: 'line',
    showSymbol: false,
    itemStyle: { color },
    lineStyle: { color, width: 2, type: mark === 'dashed' ? 'dashed' : 'solid' },
  };
}

/**
 * The card already shows the chart's status. A series repeats it only when it says more: another
 * status than the card, or a problem such as missing input.
 */
function legendItem(
  part: SeriesKey,
  mark: LegendMark,
  ctx: ChartContext,
  status: ResultStatus = 'valid',
  chart?: { readonly status: ResultStatus },
): LegendItem {
  const redundant = status === 'valid' || (status === 'estimated' && chart?.status === 'estimated');
  return {
    label: ctx.t(SERIES_KEYS[part]),
    token: SERIES_TOKENS[part],
    mark,
    ...(redundant ? {} : { note: ctx.t(STATUS_KEYS[status]) }),
  };
}
