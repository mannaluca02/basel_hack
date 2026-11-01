import type { AdvisorContext, InsuranceCaseDto } from '@pax/contracts';
import { describe, expect, it } from 'vitest';
import type { EventImpactChart, IncomeTimelineChart, LifeEventsChart, Pillar3aGrowthChart } from '../ui-models';
import {
  CHART_IMPACT,
  CHART_INCOME,
  CHART_LIFE_EVENTS,
  CHART_PILLAR3A,
  incomeMilestones,
  projectCase,
} from './case-projection';
// Backend output for the Mueller persona after the standard analyses (synthetic calculator),
// trimmed to the baseline and retirement runs, one month per year and the 3a estimate.
import mueller from './mueller-case.testing.json';

const dto = mueller.case as unknown as InsuranceCaseDto;
const context = mueller.context as unknown as AdvisorContext;
const AT = '2026-10-31T12:00:00.000Z';

describe('projectCase', () => {
  const projection = projectCase(dto, context, 'de', AT);
  const chart = <T>(id: string) => projection.charts.find((c) => c.chartId === id) as T;

  it('shows life events, the income timeline, the event impact and the 3a growth', () => {
    expect(projection.charts.map((c) => c.chartId)).toEqual([
      CHART_LIFE_EVENTS,
      CHART_INCOME,
      CHART_IMPACT,
      CHART_PILLAR3A,
    ]);
  });

  it('takes the 3a growth from the calculator estimate until the first retirement', () => {
    const growth = chart<Pillar3aGrowthChart>(CHART_PILLAR3A);
    expect(growth.years).toEqual([2026, 2049]);
    expect(growth.payoutYear).toBe(2049);
    expect(growth.series.withoutContributions.values).toEqual([0, 0]);
    const gross = dto.estimates[0]!.results[0]!.metrics.find((m) => m.id === 'GrossCapital')!.value;
    expect(growth.series.withContributions.values).toEqual([0, gross]);
  });

  it('keeps revision and time of a chart when the same data is loaded again', () => {
    const later = projectCase({ ...dto, contextRevision: dto.contextRevision + 5 }, context, 'de', AT);
    expect(later.charts).toEqual(projection.charts);
  });

  it('turns the monthly retirement timeline into yearly household amounts', () => {
    const income = chart<IncomeTimelineChart>(CHART_INCOME);
    expect(income.years[0]).toBe(2026);
    // Today: one full-time salary of CHF 80'000 net, no pensions yet.
    expect(income.series.employment.values[0]).toBe(8_000_004);
    expect(income.series.pillar1.values[0]).toBe(0);
    // Every pillar is present, also when it stays zero.
    expect(Object.keys(income.series).sort()).toEqual(
      ['employment', 'gap', 'pillar1', 'pillar2', 'pillar3'].sort(),
    );
    const late = income.years.indexOf(2055);
    expect(income.series.employment.values[late]).toBe(0);
    expect(income.series.pillar2.values[late]).toBe(3_000_000);
    expect(income.unit).toMatchObject({ period: 'year', basis: 'net_after_income_tax' });
    expect(income.runId).toBe(dto.runs.find((r) => r.timeline)!.id);
  });

  it('picks the bars from the phases: today, last full working year, first full pension year, end', () => {
    const income = chart<IncomeTimelineChart>(CHART_INCOME);
    // 2049 is mixed (one partner retired), and 2060 lies past the end of the timeline.
    expect(income.milestones).toEqual([
      { year: 2026, kind: 'today' },
      { year: 2048, kind: 'last_working' },
      { year: 2050, kind: 'first_pension' },
      { year: 2059, kind: 'end' },
    ]);
    // Every year stays in the chart for the table and the audit trail.
    expect(income.years).toHaveLength(34);
  });

  it('takes need, benefits and gap per person and event from the baseline run', () => {
    const impact = chart<EventImpactChart>(CHART_IMPACT);
    const disability = impact.scenarios.find(
      (s) => s.event === 'disability' && s.personId === 'person_demo_1',
    )!;
    expect(disability).toMatchObject({ needed: 8_000_000, gap: 2_200_000, incomeBefore: 8_000_000 });
    expect(impact.scenarios.map((s) => s.event)).toContain('retirement');
  });

  it('places marriage, the baby, the home goal and both retirements on the timeline', () => {
    const events = chart<LifeEventsChart>(CHART_LIFE_EVENTS).events;
    expect(events.map((e) => [e.kind, e.year])).toEqual([
      ['marriage', 2018],
      ['today', 2026],
      ['child_birth', 2026],
      ['home_purchase', 2031],
      ['retirement', 2049],
      ['retirement', 2050],
    ]);
  });

  it('lists a gap as an identified risk and a covered need as addressed', () => {
    const disability = projection.risks.find((r) => r.riskId === 'risk_disability_person_demo_1')!;
    expect(disability).toMatchObject({ status: 'identified', amount: { amount: 2_200_000 } });
    expect(disability.explanation).toContain("22'000");
    const partner = projection.risks.find((r) => r.riskId === 'risk_disability_person_demo_2')!;
    expect(partner.status).toBe('addressed');
  });

  it('reports data capture progress with the scenarios as done once calculated', () => {
    expect(projection.progress).toMatchObject({ percent: 100, domain: 'data_capture' });
    expect(projection.progress!.groups).toContainEqual({ groupId: 'scenarios', status: 'done' });
  });

  it('shows nothing calculated for a case without a confirmed profile', () => {
    const empty = projectCase(
      { ...dto, confirmedVersions: [], runs: [], activeRunId: null },
      null,
      'en',
      AT,
    );
    expect(empty.risks).toEqual([]);
    expect(empty.charts.map((c) => c.chartId)).toEqual([CHART_LIFE_EVENTS]);
    expect(projectCase({ ...dto, estimates: [] }, context, 'de', AT).charts.map((c) => c.chartId)).not.toContain(CHART_PILLAR3A);
  });
});

describe('incomeMilestones', () => {
  type Phase = 'working' | 'bridge' | 'pension';
  /** One period per month from `from` to `to`; `phases(month)` gives each person's phase. */
  const periods = (from: string, to: string, phases: (month: string) => Phase[]) => {
    const out: { month: string; persons: { phase: Phase }[] }[] = [];
    let [year, month] = from.split('-').map(Number) as [number, number];
    for (;;) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      out.push({ month: key, persons: phases(key).map((phase) => ({ phase })) });
      if (key === to) return out;
      [year, month] = month === 12 ? [year + 1, 1] : [year, month + 1];
    }
  };
  const single = (pensionFrom: string, workUntil = pensionFrom) => (month: string): Phase[] => [
    month < workUntil ? 'working' : month < pensionFrom ? 'bridge' : 'pension',
  ];

  it('shows five bars for a long timeline and skips the mixed year of the retirement', () => {
    expect(incomeMilestones(periods('2026-11', '2070-12', single('2051-07')))).toEqual([
      { year: 2026, kind: 'today' },
      { year: 2050, kind: 'last_working' },
      { year: 2052, kind: 'first_pension' },
      { year: 2062, kind: 'pension_plus_10' },
      { year: 2070, kind: 'end' },
    ]);
  });

  it('keeps a year once when today is also the last working year', () => {
    expect(incomeMilestones(periods('2026-10', '2045-12', single('2027-01')))).toEqual([
      { year: 2026, kind: 'today' },
      { year: 2027, kind: 'first_pension' },
      { year: 2037, kind: 'pension_plus_10' },
      { year: 2045, kind: 'end' },
    ]);
  });

  it('shows no working bar when the retirement falls into the current year', () => {
    expect(incomeMilestones(periods('2026-03', '2040-12', single('2026-09'))).map((m) => m.kind)).toEqual([
      'today',
      'first_pension',
      'pension_plus_10',
      'end',
    ]);
  });

  it('never counts the bridge between work and pension as a pension year', () => {
    const early = incomeMilestones(periods('2026-01', '2075-12', single('2052-01', '2050-01')));
    expect(early.find((m) => m.kind === 'last_working')?.year).toBe(2049);
    expect(early.find((m) => m.kind === 'first_pension')?.year).toBe(2052);
  });

  it('waits until both partners draw a pension', () => {
    const couple = (month: string): Phase[] => [
      month < '2049-01' ? 'working' : 'pension',
      month < '2050-04' ? 'working' : 'pension',
    ];
    const bars = incomeMilestones(periods('2026-10', '2070-12', couple));
    expect(bars.find((m) => m.kind === 'last_working')?.year).toBe(2048);
    expect(bars.find((m) => m.kind === 'first_pension')?.year).toBe(2051);
  });

  it('leaves the pension bars out when the timeline ends before a full pension year', () => {
    expect(incomeMilestones(periods('2026-10', '2040-06', single('2040-03')))).toEqual([
      { year: 2026, kind: 'today' },
      { year: 2039, kind: 'last_working' },
      { year: 2040, kind: 'end' },
    ]);
  });

  it('draws ten years after the pension only before the end of the timeline', () => {
    const bars = incomeMilestones(periods('2026-01', '2061-12', single('2051-01')));
    expect(bars.map((m) => m.kind)).toEqual(['today', 'last_working', 'first_pension', 'end']);
    expect(bars.at(-1)?.year).toBe(2061);
  });

  it('has nothing to pick without periods', () => {
    expect(incomeMilestones([])).toEqual([]);
  });
});
