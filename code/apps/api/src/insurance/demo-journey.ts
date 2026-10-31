import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { DraftSchema,type InsuranceDraft,type LifeScenario } from '@pax/contracts';
import type { LifeInsuranceEngine } from './engine.js';
import { WorkflowError,type Actor } from './types.js';

/**
 * Glue for a live demo: load a synthetic persona as an unconfirmed draft and, once the customer
 * confirmed it, run the standard set of scenarios. Both go through the regular engine methods, so
 * every gate (customer role, revisions, confirmation, handover stop) still applies.
 */
export const DEMO_PERSONAS={
  mueller:'../../../../fixtures/personas/mueller.json',
} as const;
export type DemoPersonaId=keyof typeof DEMO_PERSONAS;

export const LoadPersonaSchema=z.object({persona:z.enum(Object.keys(DEMO_PERSONAS) as [DemoPersonaId]),expectedCaseRevision:z.number().int().positive()}).strict();
export const StandardAnalysesSchema=z.object({expectedProfileVersion:z.number().int().positive()}).strict();

export async function personaDraft(id:DemoPersonaId,today=new Date()):Promise<InsuranceDraft> {
  const doc=JSON.parse(await readFile(new URL(DEMO_PERSONAS[id],import.meta.url),'utf8')) as {draft:unknown};
  const draft=DraftSchema.parse(doc.draft);
  if(draft.financial?.dataClassification!=='synthetic')throw new Error('Demo persona must be synthetic');
  draft.financial.valuationDate=today.toISOString().slice(0,10);
  for(const asset of draft.financial.assets)if(asset.availableFrom<draft.financial.valuationDate)asset.availableFrom=draft.financial.valuationDate;
  return draft;
}

const month=(year:number,m=1)=>`${year}-${String(m).padStart(2,'0')}`;
const addYears=(value:string,years:number)=>month(Number(value.slice(0,4))+years,Number(value.slice(5)));

/**
 * The scenarios a confirmed profile supports, derived only from its own values. Assumptions that the
 * profile does not hold (Pensum change, home financing terms) are fixed, named demo parameters and
 * travel with the run as `scenarioVersionId`.
 */
export function standardScenarios(draft:InsuranceDraft,today=new Date()):{scenarioVersionId:string;scenario:LifeScenario}[] {
  const financial=draft.financial,insurance=draft.insurance;
  if(!financial||!insurance)throw new WorkflowError('STANDARD_ANALYSES_NEED_PROFILE',422);
  const out:{scenarioVersionId:string;scenario:LifeScenario}[]=[];
  const earner=[...financial.persons].sort((a,b)=>b.employmentRateBps-a.employmentRateBps)[0];
  if(earner&&earner.employmentRateBps>0)out.push({scenarioVersionId:'standard_family_v1',scenario:{kind:'family',personId:earner.id,
    newEmploymentRateBps:Math.max(0,earner.employmentRateBps-2000),additionalMonthlyCostCents:80000,linearIncomeAssumptionConfirmed:true}});
  const home=draft.goals.find(g=>g.kind==='home'&&g.targetCapitalCents);
  if(home?.targetCapitalCents)out.push({scenarioVersionId:'standard_home_v1',scenario:{kind:'home',purchasePriceCents:home.targetCapitalCents,
    equityRateBps:2000,purchaseCostsCents:Math.round(home.targetCapitalCents*0.03),reserveCents:1500000,annualInterestBps:500,annualMaintenanceBps:100,
    annualAmortizationCents:Math.round(home.targetCapitalCents*0.01),assumptionsConfirmed:true}});
  const goal=draft.goals.find(g=>g.kind==='retirement');
  const provision=(personId:string,pillar:'1'|'2'|'3')=>{
    const p=financial.provisions.find(x=>x.personId===personId&&x.pillar===pillar&&x.event==='retirement');
    return p&&p.amount.value!==null?Math.round(p.amount.value/12):null;
  };
  const persons=insurance.persons.flatMap(p=>{
    const person=financial.persons.find(x=>x.id===p.personId);
    if(!person||p.desiredWorkStopAge===null)return [];
    const stop=month(person.birthYear+p.desiredWorkStopAge);
    return [{personId:p.personId,workEndsMonth:stop,pensionStartsMonth:stop,pillar1MonthlyCents:provision(p.personId,'1'),
      pillar2MonthlyCents:provision(p.personId,'2'),pillar3MonthlyCents:provision(p.personId,'3')}];
  });
  if(goal&&persons.length&&insurance.retirementNeedAnnualCents!==null){
    const now=month(today.getUTCFullYear(),today.getUTCMonth()+1);
    const firstPension=persons.map(p=>p.pensionStartsMonth).sort()[0]!;
    const lastPension=persons.map(p=>p.pensionStartsMonth).sort().at(-1)!;
    out.push({scenarioVersionId:'standard_retirement_v1',scenario:{kind:'retirement',goalId:goal.id,startMonth:now,
      endMonth:[addYears(lastPension,10),addYears(now,99)].sort()[0]!,incomeBasis:'net_after_income_tax',
      monthlyNeedCents:Math.round(insurance.retirementNeedAnnualCents/12),monthlySavingCents:Math.round((insurance.annualSavingCents??0)/12),
      savingLiquidity:'retirement_restricted',savingsReleaseMonth:firstPension,annualReturnBps:insurance.annualReturnBps??0,
      releaseAssumptions:financial.assets.filter(a=>a.pillar==='3').map(a=>({assetId:a.id,availableMonth:firstPension})),
      persons,assumptionsConfirmed:true,priceBasis:'nominal'}});
  }
  // Baseline last: the newest run becomes the active analysis the recommendation refers to.
  out.push({scenarioVersionId:'standard_baseline_v1',scenario:{kind:'baseline'}});
  return out;
}

export class DemoJourney {
  constructor(private readonly engine:LifeInsuranceEngine){}

  async loadPersona(actor:Actor,caseId:string,input:unknown) {
    const body=LoadPersonaSchema.parse(input);
    if(actor.role!=='customer')throw new WorkflowError('FORBIDDEN',403);
    const draft=await personaDraft(body.persona);
    return this.engine.patchDraft(actor,caseId,{...draft,expectedCaseRevision:body.expectedCaseRevision});
  }

  /** Runs every standard scenario in turn, then derives the recommendation from the baseline. */
  async runStandardAnalyses(actor:Actor,caseId:string,input:unknown) {
    const body=StandardAnalysesSchema.parse(input);
    const confirmed=this.engine.caseFor(actor,caseId).confirmedVersions.at(-1);
    if(!confirmed||confirmed.version!==body.expectedProfileVersion)throw new WorkflowError('STALE_CONTEXT');
    const runs:{scenarioVersionId:string;runId:string;status:string}[]=[];
    for(const {scenarioVersionId,scenario} of standardScenarios(confirmed.draft)) {
      const c=this.engine.caseFor(actor,caseId);
      const {run}=await this.engine.analyze(actor,caseId,{expectedCaseRevision:c.caseRevision,expectedProfileVersion:body.expectedProfileVersion,scenarioVersionId,scenario}) as {run:{id:string;status:string}};
      runs.push({scenarioVersionId,runId:run.id,status:run.status});
    }
    let recommendation:unknown=null,recommendationError:string|null=null;
    try{recommendation=await this.engine.recommendation(actor,caseId);}
    catch(error){if(!(error instanceof WorkflowError))throw error;recommendationError=error.code;}
    return {runs,recommendation,recommendationError};
  }
}
