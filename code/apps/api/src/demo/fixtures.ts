import { readFile } from 'node:fs/promises';
import { CaseSnapshotSchema, type CaseSnapshot, type Scenario } from '@pax/contracts';

export const DEMO_SCENARIOS={
  baseline:{kind:'baseline'},
  family:{kind:'family',personId:'person_demo_1',newEmploymentRateBps:6000,additionalMonthlyCostCents:80000,linearIncomeAssumptionConfirmed:true},
  home:{kind:'home',purchasePriceCents:100000000,equityRateBps:2000,purchaseCostsCents:3000000,reserveCents:1500000,
    annualInterestBps:500,annualMaintenanceBps:100,annualAmortizationCents:1000000,assumptionsConfirmed:true}
} as const satisfies Record<string,Scenario>;
export async function loadDemoSnapshot():Promise<CaseSnapshot> {
  const c=CaseSnapshotSchema.parse(JSON.parse(await readFile(new URL('../../../../fixtures/household.json',import.meta.url),'utf8')));
  if(c.dataClassification!=='synthetic') throw new Error('Demo fixture must be synthetic');return c;
}
