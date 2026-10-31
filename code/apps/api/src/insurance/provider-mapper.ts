import type { CaseSnapshot, InsuranceDraft, LifeScenario } from '@pax/contracts';
import { annual, calculateCapital, intakeQuestions, usable, deathCapitalNeed } from '@pax/domain';
import type { Operation } from '../logismata/contracts.js';
import type { NormalizedProviderResult } from '../logismata/normalize.js';
import type { RiskNeed } from './types.js';
import { WorkflowError } from './types.js';
import { languageNumber,type Locale } from './i18n.js';

const relationship={single:1,married:2,cohabiting:3,registered_partnership:4,unknown:0};
const chf=(cents:number)=>cents/100;
export type ProviderJob={operation:Operation;request:unknown;personId?:string};
export function buildProviderJobs(draft:InsuranceDraft,financial:CaseSnapshot,scenario:LifeScenario,providerYear=Number(financial.valuationDate.slice(0,4)),locale:Locale='de'):ProviderJob[] {
  const missing=intakeQuestions(draft);if(missing.length)throw new WorkflowError('NEEDS_INPUT',422,missing);
  const intake=draft.insurance!;const original=draft.financial!;
  if(Number(financial.valuationDate.slice(0,4))!==providerYear)throw new WorkflowError('LIVE_VALUATION_YEAR_UNSUPPORTED',422,['financial.valuationDate']);
  const common={Relationship:relationship[intake.relationship],RelationshipSinceYear:intake.relationshipSinceYear!,NumberOfChildren:intake.sharedChildren!};
  const persons=financial.persons.map(person=> {
    const p=intake.persons.find(p=>p.personId===person.id)!;
    const before=original.persons.find(p=>p.id===person.id)!;
    const ratio=scenario.kind==='family'&&scenario.personId===person.id?person.employmentRateBps/before.employmentRateBps:1;
    const addedNeed=scenario.kind==='family'?scenario.additionalMonthlyCostCents*12:0;
    const phase=scenario.kind==='retirement'?scenario.persons.find(p=>p.personId===person.id):null;
    const stopAge=phase?Number(phase.workEndsMonth.slice(0,4))-person.birthYear:p.desiredWorkStopAge!;
    return {personId:person.id,age:{Sex:p.providerSex!,BirthYear:person.birthYear},
      risk:{Sex:p.providerSex!,BirthYear:person.birthYear,GrossIncome:chf(Math.round(p.grossAnnualIncomeCents!*ratio)),
        WithBVG:p.withPillar2!,NumberOfChildren:intake.children.filter(c=>c.kind==='sole_custody'&&c.parentPersonIds.includes(person.id)).length,
        Pillar2Pensions:{Disability:chf(p.pillar2Risk.disabilityAnnualCents!),
          DisabilityChildren:chf(p.pillar2Risk.disabilityChildAnnualCents!),Widow:chf(p.pillar2Risk.survivorAnnualCents!),Orphan:chf(p.pillar2Risk.orphanAnnualCents!)},
        NeedInPcDisability:false,NeedDisability:chf(p.disabilityNeedAnnualCents!+addedNeed),
        NeedInPcDeath:false,NeedDeath:chf(p.deathNeedAnnualCents!+addedNeed)},
      retirement:{Sex:p.providerSex!,BirthYear:person.birthYear,GrossIncome:chf(Math.round(p.grossAnnualIncomeCents!*ratio)),WithBVG:p.withPillar2!,
        DesiredRetirementAge:stopAge,RetirementPillar2:{Pension:chf(p.retirementPensionAnnualCents!),
          ...(p.currentPillar2CapitalCents===null?{}:{CurrentCapital:chf(p.currentPillar2CapitalCents)})}}};
  });
  const first=persons[0]!;const second=persons[1];const capital=calculateCapital(financial);
  if(capital.freeCapital.value===null)throw new WorkflowError('NEEDS_INPUT',422,capital.issues.map(i=>i.path));
  const jobs:ProviderJob[]=[{operation:'saving3aLimits',request:{}},...persons.map(p=>({operation:'ageLimits' as const,request:p.age,personId:p.personId})),
    {operation:'riskBase',request:{...common,Person1:first.risk,...(second?{Person2:second.risk}:{})}},
    {operation:'risk',request:{...common,Person1:first.risk,...(second?{Person2:second.risk}:{}),WithChildren:intake.children.some(c=>c.kind==='shared'||c.kind==='sole_custody')}},
    {operation:'retirementBase',request:{...common,Person1:first.retirement,...(second?{Person2:second.retirement}:{})}},
    {operation:'retirement',request:{...common,Person1:first.retirement,...(second?{Person2:second.retirement}:{}),
      CurrentFortune:chf(capital.freeCapital.value),InterestRate:intake.annualReturnBps!/100,Saving:chf(intake.annualSavingCents!+intake.existingAnnualRetirementSavingCents!),
      NeedInPcRetirement:false,NeedRetirement:chf(intake.retirementNeedAnnualCents!),LiveSpan:intake.retirementHorizonAge!}}];
  const gross=persons.reduce((sum,p)=>sum+p.risk.GrossIncome,0);
  jobs.push({operation:'budgetProposal',request:{BudgetMonthly:false,IncomeType:1,Income:gross,Relationship:common.Relationship,
    NumberOfChildren:intake.children.filter(c=>c.kind==='shared'||c.kind==='sole_custody').length,UseEffectiveTax:false,Language:languageNumber[locale]}});
  if(intake.taxLocationId!==null) {
    jobs.push({operation:'location',request:{TaxLocationID:intake.taxLocationId}});
    for(const p of persons)jobs.push({operation:'income',personId:p.personId,request:{TaxLocationID:intake.taxLocationId,
      Relationship:common.Relationship,NumberOfChildren:common.NumberOfChildren,BirthYear:p.age.BirthYear,Income:p.risk.GrossIncome,IncomeType:1,CalculateIncomeType:3}});
  }
  const duration=first.retirement.DesiredRetirementAge-(Number(financial.valuationDate.slice(0,4))-first.age.BirthYear);
  if(duration>0&&intake.annualSavingCents!>0)jobs.push({operation:'saving',request:{SavingGoal:1,Duration:Math.min(100,duration),InitialInvestment:chf(capital.freeCapital.value),
    InvestmentMonthly:false,PeriodicInvestment:chf(intake.annualSavingCents!),InterestRate:intake.annualReturnBps!/100}});
  if(capital.freeCapital.value>0&&intake.retirementNeedAnnualCents!>0)jobs.push({operation:'consumption',request:{ConsumptionGoal:2,StartCapital:chf(capital.freeCapital.value),
    InterestRate:intake.annualReturnBps!/100,WithdrawalMonthly:false,Withdrawal:chf(intake.retirementNeedAnnualCents!),
    Duration:Math.max(1,Math.min(100,intake.retirementHorizonAge!-first.retirement.DesiredRetirementAge)),EndCapital:0}});
  return jobs;
}

export function deriveRiskNeeds(draft:InsuranceDraft,financial:CaseSnapshot,results:NormalizedProviderResult[],lifeScenario:LifeScenario={kind:'baseline'}):RiskNeed[] {
  const risk=results.find(r=>r.operation==='risk');if(!risk)return [];
  const events=['disability_illness','disability_accident','death_illness','death_accident'] as const;
  return Array.from(new Set(risk.metrics.map(m=>m.scenario).filter((s):s is number=>s!==undefined))).map(scenario=> {
    const person=financial.persons[Math.floor((scenario-1)/4)]!;const event=events[(scenario-1)%4]!;
    const p=draft.insurance!.persons.find(p=>p.personId===person.id)!;
    const metric=(suffix:string)=>risk.metrics.find(m=>m.id===`risk_${scenario}_${suffix}`)?.value??null;
    const privateRows=financial.provisions.filter(p=>p.personId===person.id&&p.pillar==='3'&&p.event===event);
    const privateIncome=privateRows.every(p=>usable(p.amount))?privateRows.reduce((sum,p)=>sum+annual(p.amount)!,0):null;
    const declared=event.startsWith('disability')?p.disabilityNeedAnnualCents:p.deathNeedAnnualCents;
    const need=declared===null?null:declared+(lifeScenario.kind==='family'?lifeScenario.additionalMonthlyCostCents*12:0);
    const providerNeed=metric('need'),income=metric('incomeTotal');
    const gap=need===null||income===null||privateIncome===null?null:Math.max(0,need-income-privateIncome);
    const death=event.startsWith('death');
    const capital=death?deathCapitalNeed({annualGapCents:gap,termMonths:p.protectionTermMonths,annualReturnBps:draft.insurance!.annualReturnBps!,
      existingDeathCapitalCents:p.existingDeathCapitalCents,oneOffCostsCents:p.deathOneOffCostsCents,
      debtPayoffCents:p.debtPayoffCents,debtTreatment:p.debtTreatment}):null;
    const free=calculateCapital(financial).freeCapital.value;
    const applied=death&&capital?.capitalNeedCents!==null&&capital?.capitalNeedCents!==undefined?
      draft.insurance!.riskCapitalStrategy==='use_free_assets_first'?(free===null?null:Math.min(free,capital.capitalNeedCents)):0:null;
    const deathNeed=capital?.capitalNeedCents===null||capital?.capitalNeedCents===undefined||applied===null?null:capital.capitalNeedCents-applied;
    return {personId:person.id,scenario,event,annualNeedCents:need,providerReportedNeedCents:providerNeed,providerIncomeCents:income,privatePillar3IncomeCents:privateIncome,
      annualGapCents:gap,deathCapitalCents:deathNeed,liquidAssetsAppliedCents:applied,status:gap===null?'needs_input':risk.status,
      sourceRefs:[risk.provenance.sourceRef,...privateRows.map(p=>p.amount.sourceRef),'rule:finite-protection-capital-v1']};
  });
}
