import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts';
import {
  chart,
  impactChart,
  incomeChart,
  pillar3aChart,
} from '../../../core/advisor/store/case-testing';
import { EventImpactScenario } from '../../../core/advisor/ui-models';
import { ChartContext, ChartOption, ChartView, buildChartView } from './chart-options';

/** Keys, parameters and tokens pass through, so the assertions read what the builder chose. */
const ctx: ChartContext = {
  token: (name) => `resolved(${name})`,
  t: (key, params) => (params ? `${key}${JSON.stringify(params)}` : key),
  chf: (francs) => `CHF ${francs}`,
  short: (francs) => `${francs}`,
  animate: true,
};

type Series = BarSeriesOption | LineSeriesOption;

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
      expect(first.header).toBe('2030');
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

    it('names both columns, while long year axes may thin out their labels', () => {
      const labelsOf = (view: ChartView) =>
        (optionOf(view).xAxis as { axisLabel: { interval?: number } }).axisLabel;
      expect(labelsOf(buildChartView(impactChart(), ctx)).interval).toBe(0);
      expect(labelsOf(buildChartView(incomeChart(), ctx)).interval).toBeUndefined();
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
