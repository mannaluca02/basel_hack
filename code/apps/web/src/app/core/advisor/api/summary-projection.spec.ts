import type { AdvisorContext, InsuranceCaseDto, SummaryBundle as CaseSummaries } from '@pax/contracts';
import { describe, expect, it } from 'vitest';
import { projectCase } from './case-projection';
import mueller from './mueller-case.testing.json';
import { projectInfo, projectSummary, projectTranscript } from './summary-projection';

const dto = mueller.case as unknown as InsuranceCaseDto;
const context = mueller.context as unknown as AdvisorContext;
const summaries = mueller.summaries as unknown as CaseSummaries;
const risks = projectCase(dto, context, 'de', '2026-10-31T12:00:00.000Z').risks;

describe('projectSummary', () => {
  const summary = projectSummary(dto, context, summaries, risks, 'de')!;

  it('binds the sheet to the snapshot and run of the backend summary', () => {
    expect(summary).toMatchObject({
      snapshotId: summaries.snapshotId,
      profileVersion: 1,
      runRefs: [summaries.customer.runId],
      audiences: ['customer', 'advisor'],
    });
  });

  it('stays a draft while the expert review is open', () => {
    expect(summary.reviewOpen).toBe(true);
    expect(summary.status).toBe('draft');
    expect(summary.nextSteps.map((s) => s.id)).toEqual(['expert_review', 'recommendation']);
  });

  it('always lists all three pillars with the backend retirement pension', () => {
    expect(Object.keys(summary.pillars)).toEqual(['pillar1', 'pillar2', 'pillar3']);
    expect(summary.pillars.pillar2.retirementIncome).toMatchObject({ amount: 3_000_000, period: 'year' });
  });

  it('takes goals, key facts and the open gaps from the case', () => {
    expect(summary.goals.map((g) => g.text)).toEqual(['Familie bis 2026', 'Eigenheim bis 2031', 'Pensionierung bis 2049']);
    expect(summary.keyFacts[0]).toMatchObject({ factId: 'incomeAnnual', value: { amount: 8_000_000 } });
    expect(summary.gaps.map((g) => g.relatedRiskId)).toContain('risk_disability_person_demo_1');
  });

  it('keeps the product gate closed until the suitability check is done', () => {
    expect(summary.productGate).toEqual({
      needsCaptured: true,
      financesCaptured: true,
      allPillarsCaptured: true,
      suitabilityCheckDone: false,
    });
  });

  it('has no summary before the backend has an analysed snapshot', () => {
    expect(projectSummary(dto, context, null, risks, 'de')).toBeNull();
  });
});

describe('projectInfo', () => {
  it('shows the localized assumptions with the time of their run, so a reload is no news', () => {
    const info = projectInfo(dto, summaries, 'de');
    expect(info.length).toBe(summaries.customer.assumptions.length);
    expect(info[0]).toMatchObject({ category: 'assumption', title: 'Annahme der Berechnung' });
    expect(projectInfo(dto, summaries, 'de')).toEqual(info);
  });
});

describe('projectTranscript', () => {
  it('turns the recorded call history into final transcript lines', () => {
    expect(
      projectTranscript([
        { messageId: 'conv_a0', conversationId: 'conv', speaker: 'agent', text: 'Hoi', at: '2026-10-31T12:00:00.000Z' },
      ]),
    ).toEqual([
      { entryId: 'conv_a0', turnId: 'conv_a0', speaker: 'agent', text: 'Hoi', status: 'final', at: '2026-10-31T12:00:00.000Z' },
    ]);
  });
});
