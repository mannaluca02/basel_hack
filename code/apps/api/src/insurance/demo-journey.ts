import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { DraftSchema,type InsuranceDraft,type LifeScenario } from '@pax/contracts';
import type { LifeInsuranceEngine } from './engine.js';
import type { DraftEstimateService } from './estimates.js';
import type { ExtractionWorkflow } from './extraction.js';
import type { SessionService } from './auth.js';
import type { BootstrapCredentials } from './store.js';
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
export const DemoStartSchema=z.object({locale:z.enum(['de','fr','it','en']).default('de'),fresh:z.boolean().default(false)}).strict();
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

type DemoSession={sessionToken:string;csrfToken:string;expiresAt:string;caseId:string};

export class DemoJourney {
  private current:Promise<DemoSession>|null=null;
  /** `demoStart` is null unless the server was started with the explicit demo flag. */
  constructor(private readonly engine:LifeInsuranceEngine,private readonly estimates:DraftEstimateService,
    private readonly extraction:ExtractionWorkflow,
    private readonly demoStart:{sessions:SessionService;credentials:BootstrapCredentials}|null=null){}

  get startEnabled(){return this.demoStart!==null;}

  /**
   * Demo start without an access code: one customer session with the Mueller persona, confirmed
   * and calculated. Every caller shares it while it is valid, so reloads do not pile up cases.
   */
  async start(input:unknown):Promise<DemoSession> {
    if(!this.demoStart)throw new WorkflowError('NOT_FOUND',404);
    const body=DemoStartSchema.parse(input??{});
    const reusable=this.current&&!body.fresh?await this.current.catch(()=>null):null;
    if(reusable&&this.valid(reusable))return reusable;
    this.current=this.prepare(body.locale);
    return this.current;
  }

  /**
   * 3a growth until the first retirement, as an explicit calculator estimate: with the profile's own
   * yearly 3a contribution, or the legal maximum from the baseline run if there is none yet. A failed
   * estimate leaves the analyses intact.
   */
  private async pillar3aEstimate(actor:Actor,caseId:string,draft:InsuranceDraft,baselineRunId:string|undefined) {
    const c=this.engine.caseFor(actor,caseId),baseline=c.runs.find(r=>r.id===baselineRunId);
    const financial=draft.financial,insurance=draft.insurance,first=insurance?.persons[0];
    const person=financial?.persons.find(p=>p.id===first?.personId);
    if(!financial||!insurance||!first||!person||first.desiredWorkStopAge===null)return {status:'skipped' as const,code:'NEEDS_INPUT'};
    const limits=baseline?.providerResults.find(r=>r.operation==='saving3aLimits')?.metrics;
    const maximum=limits?.find(m=>m.id===(first.withPillar2===false?'max3aWithoutP2':'max3aWithP2'))?.value??null;
    const annualCents=insurance.existingAnnualPillar3aContributionCents||maximum;
    const years=person.birthYear+first.desiredWorkStopAge-new Date().getUTCFullYear();
    if(!annualCents||years<1)return {status:'skipped' as const,code:'NEEDS_INPUT'};
    const initialCents=financial.assets.filter(a=>a.pillar==='3').reduce((sum,a)=>sum+(a.amount.value??0),0);
    try{
      await this.estimates.calculate(actor,caseId,{expectedCaseRevision:c.caseRevision,noticeVersion:'lifemap-synthetic-v2',
        allowSyntheticCalculatorTransfer:true,operations:['saving3a'],saving3a:{years,initialCents,annualCents}});
      return {status:'calculated' as const,years,initialCents,annualCents};
    }catch(error){if(!(error instanceof WorkflowError))throw error;return {status:'failed' as const,code:error.code};}
  }

  /**
   * Demo start only: takes over what the voice agent proposed in one step, like the demo start
   * confirms its persona. Accepts the open packages in order, confirms the profile and calculates
   * the standard scenarios again. A package that became stale is skipped and reported.
   */
  async acceptPending(actor:Actor,caseId:string) {
    if(!this.demoStart)throw new WorkflowError('NOT_FOUND',404);
    if(actor.role!=='customer')throw new WorkflowError('FORBIDDEN',403);
    const open=this.engine.caseFor(actor,caseId).proposalBatches.filter(b=>b.status==='proposed');
    const accepted:string[]=[],skipped:string[]=[];
    for(const batch of open) {
      const c=this.engine.caseFor(actor,caseId);
      if(c.proposalBatches.find(b=>b.id===batch.id)?.status!=='proposed')continue;
      try{await this.extraction.acceptBatch(actor,caseId,batch.id,{expectedCaseRevision:c.caseRevision,accept:true});accepted.push(batch.id);}
      catch(error){if(!(error instanceof WorkflowError))throw error;skipped.push(batch.id);}
    }
    let c=this.engine.caseFor(actor,caseId);
    if(!c.draftDirty)return {accepted,skipped,profileVersion:c.confirmedVersions.at(-1)?.version??null,runs:[]};
    await this.engine.confirm(actor,caseId,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,
      allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v2'});
    c=this.engine.caseFor(actor,caseId);
    const profileVersion=c.confirmedVersions.at(-1)!.version;
    const {runs}=await this.runStandardAnalyses(actor,caseId,{expectedProfileVersion:profileVersion});
    return {accepted,skipped,profileVersion,runs};
  }

  private valid(session:DemoSession){
    try{const actor=this.demoStart!.sessions.authenticate(session.sessionToken);this.engine.caseFor(actor,session.caseId);
      return Date.parse(session.expiresAt)>Date.now()+60_000;}
    catch{return false;}
  }

  private async prepare(locale:'de'|'fr'|'it'|'en'):Promise<DemoSession> {
    const {sessions,credentials}=this.demoStart!;
    const login=await sessions.login(credentials.customerAccessCode,'demo-start');
    const actor=sessions.authenticate(login.sessionToken);
    let c=await this.engine.createCase(actor,{locale,timeBudgetMinutes:30,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'});
    c=await this.loadPersona(actor,c.id,{persona:'mueller',expectedCaseRevision:c.caseRevision});
    await this.engine.confirm(actor,c.id,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v2'});
    await this.runStandardAnalyses(actor,c.id,{expectedProfileVersion:1});
    return {sessionToken:login.sessionToken,csrfToken:login.csrfToken,expiresAt:login.expiresAt,caseId:c.id};
  }

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
    const pillar3a=await this.pillar3aEstimate(actor,caseId,confirmed.draft,runs.at(-1)?.runId);
    let recommendation:unknown=null,recommendationError:string|null=null;
    try{recommendation=await this.engine.recommendation(actor,caseId);}
    catch(error){if(!(error instanceof WorkflowError))throw error;recommendationError=error.code;}
    return {runs,pillar3a,recommendation,recommendationError};
  }
}
