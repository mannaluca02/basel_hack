import type { AdvisorContext, InsuranceCaseDto } from '@pax/contracts';
import { describe, expect, it } from 'vitest';
import type { EventImpactChart, IncomeTimelineChart, LifeEventsChart } from '../ui-models';
import { CHART_IMPACT, CHART_INCOME, CHART_LIFE_EVENTS, projectCase } from './case-projection';
// Backend output for the Mueller persona after the standard analyses (synthetic calculator),
// trimmed to the baseline and retirement runs and one month per year.
import mueller from './mueller-case.testing.json';

const dto = mueller.case as unknown as InsuranceCaseDto;
const context = mueller.context as unknown as AdvisorContext;
const AT = '2026-10-31T12:00:00.000Z';

describe('projectCase', () => {
  const projection = projectCase(dto, context, 'de', AT);
  const chart = <T>(id: string) => projection.charts.find((c) => c.chartId === id) as T;

  it('shows life events, the income timeline and the event impact of the current runs', () => {
    expect(projection.charts.map((c) => c.chartId)).toEqual([
      CHART_LIFE_EVENTS,
      CHART_INCOME,
      CHART_IMPACT,
    ]);
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
  });
});
