import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts';
import {
  chart,
  impactChart,
  incomeChart,
  pillar3aChart,
} from '../../../core/advisor/store/case-testing';
import { EventImpactScenario, MoneySeries } from '../../../core/advisor/ui-models';
import { ChartContext, ChartOption, ChartView, buildChartView, wrapWords } from './chart-options';

/** Keys, parameters and tokens pass through, so the assertions read what the builder chose. */
const ctx: ChartContext = {
  token: (name) => `resolved(${name})`,
  t: (key, params) => (params ? `${key}${JSON.stringify(params)}` : key),
  chf: (francs) => `CHF ${francs}`,
  short: (francs) => `${francs}`,
  animate: true,
};

type Series = BarSeriesOption | LineSeriesOption;

const valid = (values: readonly (number | null)[]): MoneySeries => ({ values, status: 'valid' });

function optionOf(view: ChartView): ChartOption & { series: Series[] } {
  if (!view.option) throw new Error('expected an ECharts option');
  return view.option as ChartOption & { series: Series[] };
}

function tableOf(view: ChartView) {
  if (!view.table) throw new Error('expected a data table');
  return view.table;
}

const byId = (view: ChartView, id: string) => optionOf(view).series.find((s) => s.id === id);
const noteOf = (view: ChartView, label: string) =>
  view.legend.find((item) => item.label === label)?.note;

const retirement: EventImpactScenario = {
  event: 'retirement',
  personId: 'person_test',
  status: 'estimated',
  incomeBefore: 1_000_000,
  incomeAfter: { employment: 0, pillar1: 300_000, pillar2: 250_000, pillar3: 50_000 },
  needed: 800_000,
  gap: 200_000,
};

describe('buildChartView', () => {
  describe('income timeline', () => {
    const view = buildChartView(incomeChart(), ctx);

    it('always draws and lists all three pillars, even when a value is unknown', () => {
      expect(optionOf(view).series.map((s) => s.id)).toEqual([
        'employment',
        'pillar1',
        'pillar2',
        'pillar3',
        'gap',
        'target',
      ]);
      expect(view.legend.map((item) => item.label)).toEqual(
        expect.arrayContaining([
          'graphics.series.pillar1',
          'graphics.series.pillar2',
          'graphics.series.pillar3',
        ]),
      );
    });

    it('only converts Rappen to francs and keeps unknown values as gaps, never as 0', () => {
      expect(byId(view, 'pillar1')?.data).toEqual([0, 30_000]);
      expect(byId(view, 'pillar2')?.data).toEqual([0, null]);
      expect(byId(view, 'target')?.data).toEqual([null, 80_000]);
    });

    it('shows unknown as text in the table and a real zero as CHF 0', () => {
      const [first, last] = tableOf(view).rows;
      const pillar2 = tableOf(view).columns.indexOf('graphics.series.pillar2') - 1;
      expect(first.header).toBe('2030 · graphics.milestone.today');
      expect(first.cells[pillar2]).toBe('CHF 0');
      expect(last.cells[pillar2]).toBe('graphics.unknown');
    });

    it('names in the legend which series lack input or differ from the card status', () => {
      expect(noteOf(view, 'graphics.series.pillar2')).toBe('graphics.status.needs_input');
      expect(noteOf(view, 'graphics.series.pillar1')).toBe('graphics.status.estimated');
      expect(noteOf(view, 'graphics.series.pillar3')).toBeUndefined();
    });

    it('does not repeat an estimate the card status already states', () => {
      const estimated = buildChartView(incomeChart({ status: 'estimated' }), ctx);
      expect(noteOf(estimated, 'graphics.series.pillar1')).toBeUndefined();
      expect(noteOf(estimated, 'graphics.series.pillar2')).toBe('graphics.status.needs_input');
    });

    it('hatches the gap, so it reads as missing income rather than a source', () => {
      const gap = byId(view, 'gap') as BarSeriesOption;
      expect(gap.itemStyle?.decal).toMatchObject({ color: 'resolved(--bg-default)' });
      expect(view.legend.find((item) => item.label === 'graphics.series.gap')?.mark).toBe(
        'hatched',
      );
    });

    it('draws the target as a plain dashed line without point markers', () => {
      const target = byId(view, 'target') as LineSeriesOption;
      expect(target.showSymbol).toBe(false);
      expect(target.lineStyle?.type).toBe('dashed');
    });

    it('names the unit with period and basis', () => {
      expect(view.unit).toBe('graphics.unit.year · graphics.basis.gross');
    });

    describe('reduced to its milestones (FE-31)', () => {
      // 41 years, one bar per milestone; amounts are the year itself, so a bar shows its source.
      const years = Array.from({ length: 41 }, (_, i) => 2026 + i);
      const amounts = years.map((year) => year * 100);
      const long = incomeChart({
        years,
        series: {
          employment: valid(amounts),
          pillar1: valid(amounts),
          pillar2: valid(amounts),
          pillar3: valid(amounts),
          gap: valid(amounts),
        },
        target: valid(amounts),
        milestones: [
          { year: 2026, kind: 'today' },
          { year: 2050, kind: 'last_working' },
          { year: 2052, kind: 'first_pension' },
          { year: 2062, kind: 'pension_plus_10' },
          { year: 2066, kind: 'end' },
        ],
      });
      const reduced = buildChartView(long, ctx);
      const axis = () => (optionOf(reduced).xAxis as { data: string[]; axisLabel: object });

      it('draws at most five bars, named by meaning and year, each one readable', () => {
        expect(axis().data).toEqual([
          'graphics.milestone.today\n2026',
          'graphics.milestone.last_working\n2050',
          'graphics.milestone.first_pension\n2052',
          'graphics.milestone.pension_plus_10\n2062',
          'graphics.milestone.end\n2066',
        ]);
        expect(axis().axisLabel).toMatchObject({ interval: 0, hideOverlap: false });
      });

      it('wraps long labels at spaces, so five fit side by side on a phone', () => {
        expect(wrapWords('Before retiring')).toBe('Before\nretiring');
        expect(wrapWords('End of plan')).toBe('End of\nplan');
        expect(wrapWords('+10 Jahre')).toBe('+10\nJahre');
        expect(wrapWords('Aujourd’hui')).toBe('Aujourd’hui');
      });

      it('only picks backend values, every part and the target at the same years', () => {
        const picked = [2026, 2050, 2052, 2062, 2066];
        for (const id of ['employment', 'pillar1', 'pillar2', 'pillar3', 'gap', 'target']) {
          expect(byId(reduced, id)?.data).toEqual(picked);
        }
      });

      it('keeps every year in the table and names the milestone rows', () => {
        const rows = tableOf(reduced).rows;
        expect(rows).toHaveLength(41);
        expect(rows[0]!.header).toBe('2026 · graphics.milestone.today');
        expect(rows[1]!.header).toBe('2027');
        expect(rows[26]!.header).toBe('2052 · graphics.milestone.first_pension');
      });

      it('falls back to the first and the last year without milestones, never to every year', () => {
        const bare = buildChartView({ ...long, milestones: [] }, ctx);
        expect((optionOf(bare).xAxis as { data: string[] }).data).toEqual(['2026', '2066']);
        expect(byId(bare, 'pillar2')?.data).toEqual([2026, 2066]);
      });
    });

    it('keeps series ids across revisions, so an update merges into the drawn chart', () => {
      const next = buildChartView(
        incomeChart({
          revision: 2,
          series: {
            ...incomeChart().series,
            pillar2: { values: [0, 3_600_000], status: 'estimated' },
          },
        }),
        ctx,
      );
      expect(optionOf(next).series.map((s) => s.id)).toEqual(
        optionOf(view).series.map((s) => s.id),
      );
      expect(byId(next, 'pillar2')?.data).toEqual([0, 36_000]);
    });
  });

  describe('event impact', () => {
    it('shows one scenario as before next to after, the gap as sent on top', () => {
      const view = buildChartView(impactChart(), ctx);
      expect((optionOf(view).xAxis as { data: string[] }).data).toEqual([
        'graphics.impact.before',
        'graphics.impact.after',
      ]);
      expect(byId(view, 'before')?.data).toEqual([10_000, null]);
      expect(byId(view, 'pillar1')?.data).toEqual([null, 2_000]);
      expect(byId(view, 'gap')?.data).toEqual([null, 500]);
      expect(view.scenarios).toEqual(['graphics.event.disability']);
    });

    it('draws the needed income as a labelled reference line inside the plot', () => {
      const view = buildChartView(impactChart(), ctx);
      const needed = byId(view, 'needed') as LineSeriesOption;
      expect(needed.markLine?.data).toEqual([{ yAxis: 9_500 }]);
      const label = needed.markLine?.label?.formatter as () => string;
      expect(label()).toBe('graphics.neededLine{"amount":"CHF 9500"}');
      // The invisible series carries the value, so the axis includes it with rounded ticks.
      expect(needed.data).toEqual([9_500, 9_500]);
      expect(needed.lineStyle?.opacity).toBe(0);
      expect((optionOf(view).yAxis as { max?: unknown }).max).toBeUndefined();
    });

    it('names both columns', () => {
      const labelsOf = (view: ChartView) =>
        (optionOf(view).xAxis as { axisLabel: { interval?: number } }).axisLabel;
      expect(labelsOf(buildChartView(impactChart(), ctx)).interval).toBe(0);
    });

    it('switches to the chosen scenario and clamps a choice that no longer exists', () => {
      const twoScenarios = impactChart({
        scenarios: [...impactChart().scenarios, retirement],
      });
      const second = buildChartView(twoScenarios, ctx, { scenario: 1 });
      expect(second.scenario).toBe(1);
      expect(byId(second, 'before')?.data).toEqual([10_000, null]);
      expect(byId(second, 'gap')?.data).toEqual([null, 2_000]);

      expect(buildChartView(twoScenarios, ctx, { scenario: 7 }).scenario).toBe(1);
      expect(buildChartView(twoScenarios, ctx, { scenario: -1 }).scenario).toBe(0);
    });

    it('numbers repeated events so every scenario stays distinguishable', () => {
      const [disability] = impactChart().scenarios;
      const view = buildChartView(
        impactChart({ scenarios: [disability, { ...disability, personId: 'person_other' }] }),
        ctx,
      );
      expect(view.scenarios).toEqual(['graphics.event.disability', 'graphics.event.disability 2']);
    });

    it('keeps every scenario in the table, whichever is shown', () => {
      const view = buildChartView(
        impactChart({ scenarios: [...impactChart().scenarios, retirement] }),
        ctx,
        { scenario: 1 },
      );
      expect(tableOf(view).rows[0]).toEqual({
        header: 'graphics.event.disability',
        cells: [
          'CHF 10000',
          'CHF 4000',
          'CHF 2000',
          'CHF 3000',
          'CHF 0',
          'CHF 9500',
          'CHF 500',
          'graphics.status.estimated',
        ],
      });
      expect(tableOf(view).rows).toHaveLength(2);
    });
  });

  describe('selected life event', () => {
    const event = { year: 2030, label: 'Eigenheim' };

    it('marks its year as a band in the charts that have it on their axis', () => {
      const view = buildChartView(incomeChart(), ctx, { scenario: 0, event });
      const bar = 'graphics.milestone.today\n2030';
      expect(optionOf(view).series[0]!.markArea?.data).toEqual([[{ xAxis: bar }, { xAxis: bar }]]);
      expect(view.legend.at(-1)).toEqual({
        label: 'graphics.selectedEvent{"label":"Eigenheim","year":"2030"}',
        token: '--border-focusring',
        mark: 'bar',
      });
    });

    it('guesses no position for a year the chart did not sample', () => {
      const view = buildChartView(incomeChart(), ctx, { scenario: 0, event: { ...event, year: 2031 } });
      expect(optionOf(view).series[0]!.markArea).toBeUndefined();
      expect(view.legend.map((item) => item.label)).not.toContain(
        'graphics.selectedEvent{"label":"Eigenheim","year":"2031"}',
      );
    });

    it('marks no bar for a year the income chart has but does not draw', () => {
      const chart = incomeChart({
        years: [2030, 2045, 2060],
        series: {
          employment: valid([1, 2, 3]),
          pillar1: valid([1, 2, 3]),
          pillar2: valid([1, 2, 3]),
          pillar3: valid([1, 2, 3]),
          gap: valid([1, 2, 3]),
        },
        target: valid([1, 2, 3]),
      });
      const view = buildChartView(chart, ctx, { scenario: 0, event: { ...event, year: 2045 } });
      expect(optionOf(view).series[0]!.markArea).toBeUndefined();
    });

    it('keeps plain years as categories in the 3a chart', () => {
      const view = buildChartView(pillar3aChart(), ctx, {
        scenario: 0,
        event: { ...event, year: pillar3aChart().years[0]! },
      });
      const year = String(pillar3aChart().years[0]);
      expect(optionOf(view).series[0]!.markArea?.data).toEqual([[{ xAxis: year }, { xAxis: year }]]);
    });
  });

  describe('pillar 3a growth', () => {
    it('draws with contributions solid and without dashed', () => {
      const view = buildChartView(pillar3aChart(), ctx);
      expect(view.legend.map((item) => item.mark)).toEqual(['line', 'dashed']);
      expect(view.unit).toBe('graphics.unit.once · graphics.basis.capital');
    });

    it('marks the payout year when the backend sends one', () => {
      const view = buildChartView(pillar3aChart({ payoutYear: 2040 }), ctx);
      const withContributions = byId(view, 'withContributions') as LineSeriesOption;
      expect(withContributions.markLine?.data).toEqual([{ xAxis: '2040' }]);
      expect(view.legend.at(-1)).toEqual({
        label: 'graphics.payout{"year":"2040"}',
        token: '--text-muted',
        mark: 'vline',
      });
    });

    it('states the tax saving next to the chart when the backend sends one', () => {
      const taxSaving = { currency: 'CHF', unit: 'cent', period: 'year', basis: 'net_after_income_tax', amount: 172_800 } as const;
      expect(buildChartView(pillar3aChart({ taxSaving }), ctx).annotation).toBe(
        'graphics.taxSaving{"amount":"CHF 1728","period":"graphics.unit.year"}',
      );
      expect(buildChartView(pillar3aChart(), ctx).annotation).toBeNull();
      expect(buildChartView(incomeChart(), ctx).annotation).toBeNull();
    });

    it('leaves the marker out without a payout year, or when that year is not sampled', () => {
      for (const payoutYear of [undefined, 2045]) {
        const view = buildChartView(pillar3aChart({ payoutYear }), ctx);
        const withContributions = byId(view, 'withContributions') as LineSeriesOption;
        expect(withContributions.markLine?.data).toEqual([]);
        expect(view.legend.map((item) => item.mark)).not.toContain('vline');
      }
    });
  });

  it('lists life events as a vertical timeline by year, with the same data as a table', () => {
    const view = buildChartView(
      chart({
        events: [
          {
            eventId: 'e2',
            kind: 'retirement',
            year: 2056,
            label: 'Retirement',
            certainty: 'planned',
          },
          { eventId: 'e0', kind: 'today', year: 2026, label: 'Today', certainty: 'confirmed' },
          { eventId: 'e1', kind: 'marriage', year: 2019, label: 'Marriage', certainty: 'past' },
        ],
      }),
      ctx,
    );
    expect(view.option).toBeNull();
    expect(view.unit).toBeNull();
    expect(tableOf(view).columns).toEqual([
      'graphics.table.year',
      'graphics.table.event',
      'graphics.table.certainty',
    ]);
    expect(tableOf(view).rows).toEqual([
      { header: '2019', cells: ['Marriage', 'graphics.certainty.past'] },
      { header: '2026', cells: ['Today', 'graphics.certainty.confirmed'] },
      { header: '2056', cells: ['Retirement', 'graphics.certainty.planned'] },
    ]);
    expect(tableOf(view).text).toBe(true);
    expect(tableOf(buildChartView(incomeChart(), ctx)).text).toBeUndefined();
    expect(view.timeline?.map((e) => [e.year, e.label, e.certaintyLabel, e.today])).toEqual([
      ['2019', 'Marriage', 'graphics.certainty.past', false],
      ['2026', 'Today', 'graphics.certainty.confirmed', true],
      ['2056', 'Retirement', 'graphics.certainty.planned', false],
    ]);
    expect(view.legend.map((item) => item.mark)).toEqual(['dot', 'dot', 'ring']);
  });

  it('takes colours from the design tokens and turns ECharts motion off on request', () => {
    const view = buildChartView(incomeChart(), { ...ctx, animate: false });
    const pillar2 = byId(view, 'pillar2') as BarSeriesOption;
    expect(pillar2.itemStyle?.color).toBe('resolved(--chart-1)');
    expect(view.legend.find((item) => item.label === 'graphics.series.pillar2')?.token).toBe(
      '--chart-1',
    );
    expect(optionOf(view)['animation']).toBe(false);
    // The chart tokens are the same in both themes; the reference line follows the text colour.
    expect(view.legend.find((item) => item.label === 'graphics.series.target')?.token).toBe(
      '--text-default',
    );
  });
});
