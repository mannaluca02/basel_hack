import { DigitalTasks } from './digital-tasks.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CreateInsuranceCaseSchema,DraftSchema,DraftPatchSchema,ConfirmProfileSchema,
  DEFAULT_HUMAN_HANDOVER,PAX_HUMAN_ADVISOR_CONTACT,RunAnalysisSchema,GraphContextSchema,ReviewDecisionSchema,LifeAnalysisSchema,CasePreferencesSchema,AdvisorContextSchema,QuestionsResponseSchema,LifeAnalysisResponseSchema, type InsuranceDraft } from '@pax/contracts';
import { calculateBudget,calculateCapital,intakeQuestions,retirementTimeline,simulateScenario,calculateProgress } from '@pax/domain';
import { CalculationService,createAnalysisRequest } from '../calculation/calculation.service.js';
import { sha256Json } from '../calculation/hash.js';
import type { CalculationProvider } from '../logismata/client.js';
import type { NormalizedProviderResult } from '../logismata/normalize.js';
import { buildProviderJobs,deriveRiskNeeds } from './provider-mapper.js';
import { recommendLifeSolutions } from './products.js';
import { ambiguityDialogue,pendingAcceptanceIds,waitingForAnswer } from './ambiguity-dialogue.js';
import { selectedGraphFacts } from './graph.js';
import { pillarPicture } from './pillars.js';
import { questionText,presentRecommendation,presentRun,progressText,metricText,statusText } from './i18n.js';
import { EncryptedCaseStore } from './store.js';
import { SessionService } from './auth.js';
import { WorkflowError,type Actor,type InsuranceCase,type Database,type LifeRun,type CaseEvent } from './types.js';

export const LIFE_MODEL_VERSION='lifemap-life-insurance-0.2.0';
const now=()=>new Date().toISOString();
const currentVersion=(c:InsuranceCase)=>c.confirmedVersions.at(-1);


export class LifeInsuranceEngine {
  readonly digitalTasks=new DigitalTasks();
  assertDigitalActive(c:InsuranceCase){if(c.handover.stopDigitalConversation)throw new WorkflowError('HUMAN_HANDOVER_ACTIVE');}
  async runDigital<T>(actor:Actor,id:string,work:(signal:AbortSignal)=>Promise<T>,external?:AbortSignal):Promise<T>{
    this.role(actor,'customer');this.assertDigitalActive(this.caseFor(actor,id));const task=this.digitalTasks.begin(id,external);
    try{task.signal.throwIfAborted();const result=await work(task.signal);task.signal.throwIfAborted();return result;}catch(error){if(task.signal.aborted)throw new WorkflowError('DIGITAL_TASK_CANCELLED');throw error;}finally{task.finish();}
  }
  constructor(readonly store:EncryptedCaseStore,readonly sessions:SessionService,readonly provider:CalculationProvider,
    readonly providerMode:'live'|'replay'|'test',private readonly calculation=new CalculationService()){}
  private authorize(actor:Actor,c:InsuranceCase,allowAdvisor=false) {
    this.sessions.assertActive(actor);
    const allowed=(actor.role==='customer'&&actor.id===c.ownerId)||
      (allowAdvisor&&actor.role==='advisor'&&actor.id===c.ownerId&&actor.caseId===c.id)||
      (actor.role==='reviewer'&&c.reviewTasks.length>0);
    if(!allowed)throw new WorkflowError('NOT_FOUND',404);
    if(c.expiresAt<=now())throw new WorkflowError('CASE_EXPIRED',410);
  }
  private role(actor:Actor,role:Actor['role']){this.sessions.assertActive(actor);if(actor.role!==role)throw new WorkflowError('FORBIDDEN',403);}
  caseFor(actor:Actor,id:string,allowAdvisor=false):InsuranceCase {
    const c=this.store.view(db=>Object.hasOwn(db.cases,id)?db.cases[id]:undefined);if(!c)throw new WorkflowError('NOT_FOUND',404);this.authorize(actor,c,allowAdvisor);return c;
  }
  touch(c:InsuranceCase,reason:string):CaseEvent {
    c.caseRevision++;c.contextRevision++;c.updatedAt=now();
    for(const request of c.confirmationRequests??[])if(['awaiting_presentation','awaiting_answer'].includes(request.status)){request.status='invalidated';request.invalidationReason='case_changed';}
    const event={id:randomUUID(),contextRevision:c.contextRevision,reason,at:c.updatedAt};
    c.events.push(event);c.events=c.events.slice(-100);return event;
  }
  audit(db:Database,actor:Actor,c:InsuranceCase|null,action:string,outcome='ok') {
    db.audit.push({id:randomUUID(),at:now(),actorId:actor.id,action,caseId:c?.id??null,profileVersion:c?currentVersion(c)?.version??null:null,outcome});
    db.audit=db.audit.slice(-2000);
  }
  async edit<T>(actor:Actor,id:string,expected:number|undefined,fn:(c:InsuranceCase,db:Database)=>T,options:{allowDuringHandover?:boolean}={}):Promise<T> {
    return this.store.transaction(db=>{
      this.sessions.assertActive(actor,db);
      const c=Object.hasOwn(db.cases,id)?db.cases[id]:undefined;if(!c)throw new WorkflowError('NOT_FOUND',404);this.authorize(actor,c);
      if(actor.role==='customer'&&!options.allowDuringHandover)this.assertDigitalActive(c);
      if(expected!==undefined&&c.caseRevision!==expected)throw new WorkflowError('VERSION_CONFLICT');
      return fn(c,db);
    });
  }
  activeRun(c:InsuranceCase):LifeRun {
    if(c.ambiguities.some(a=>a.status==='open'))throw new WorkflowError('UNRESOLVED_AMBIGUITIES',422);
    const run=c.runs.find(r=>r.id===c.activeRunId);
    if(c.draftDirty||!run||run.profileVersion!==currentVersion(c)?.version||run.status==='stale')throw new WorkflowError('STALE_CONTEXT');
    return run;
  }
  approved(c:InsuranceCase,run:LifeRun) {
    return c.reviewTasks.filter(t=>t.runId===run.id&&t.profileVersion===run.profileVersion).at(-1)?.status==='approved_for_demo';
  }
  async createCase(actor:Actor,input:unknown) {
    this.role(actor,'customer');const body=CreateInsuranceCaseSchema.parse(input);
    return this.store.transaction(db=>{
      this.sessions.assertActive(actor,db);
      for(const [key,c] of Object.entries(db.cases))if(c.expiresAt<=now())delete db.cases[key];
      db.feedback=db.feedback.filter(f=>Object.hasOwn(db.cases,f.caseId));
      if(Object.keys(db.cases).length>=25)throw new WorkflowError('CASE_CAPACITY',429);
      const c:InsuranceCase={id:randomUUID(),ownerId:actor.id,createdAt:now(),updatedAt:now(),expiresAt:new Date(Date.now()+86400_000).toISOString(),
        locale:body.locale,timeBudgetMinutes:body.timeBudgetMinutes,caseRevision:1,contextRevision:1,
        draft:{financial:null,insurance:null,goals:[],reviewFlags:[]},draftDirty:true,confirmedVersions:[],latestAnalysisRequestId:null,activeRunId:null,
        runs:[],reviewTasks:[],recommendations:[],quotes:[],applications:[],policies:[],graphContext:null,events:[],handover:structuredClone(DEFAULT_HUMAN_HANDOVER),voiceSessions:[],agentTurns:[],suitabilityChecks:[],confirmationRequests:[],modelExtractionConsent:null,proposals:[],proposalBatches:[],ambiguities:[],estimates:[],comparisons:[],idempotency:{}};
      db.cases[c.id]=c;this.audit(db,actor,c,'case_created');return c;
    });
  }
  list(actor:Actor) {
    this.sessions.assertActive(actor);
    if(actor.role==='advisor')throw new WorkflowError('FORBIDDEN',403);
    return this.store.view(db=>Object.values(db.cases).filter(c=>c.expiresAt>now()&&(actor.role==='customer'?c.ownerId===actor.id:c.reviewTasks.length>0))
      .map(c=>({id:c.id,caseRevision:c.caseRevision,profileVersion:currentVersion(c)?.version??null,locale:c.locale,updatedAt:c.updatedAt,openReviews:c.reviewTasks.filter(t=>t.status==='open').length})));
  }
  async patchDraft(actor:Actor,id:string,input:unknown) {
    this.role(actor,'customer');const body=DraftPatchSchema.parse(input);const {expectedCaseRevision,...patch}=body;
    return this.edit(actor,id,expectedCaseRevision,(c,db)=>{
      const draft=DraftSchema.parse({...c.draft,...patch});
      if(draft.financial) {
        if(draft.financial.dataClassification!=='synthetic')throw new WorkflowError('REAL_CUSTOMER_PROCESSING_NOT_RELEASED',422);
        draft.financial.caseId=c.id;
        const fields=[...draft.financial.persons.map(p=>p.income),...draft.financial.expenses.map(e=>e.amount),draft.financial.safetyBuffer,
          ...draft.financial.assets.map(a=>a.amount),...draft.financial.provisions.map(p=>p.amount)];
        if(fields.some(f=>f.review==='reviewed'||f.origin==='api'))throw new WorkflowError('CLIENT_CANNOT_ATTEST_PROVIDER_OR_STAFF_REVIEW',422);
      }
      c.draft=draft;c.draftDirty=true;c.activeRunId=null;c.latestAnalysisRequestId=null;c.graphContext=null;this.touch(c,'draft_changed');this.audit(db,actor,c,'draft_changed');return c;
    });
  }
  questions(actor:Actor,id:string) {
    const c=this.caseFor(actor,id,true),dialogue=ambiguityDialogue(c),ambiguities=dialogue.filter(a=>a.dialogueStatus==='needs_answer');
    const questionDraft=DraftSchema.parse(c.draft),financial=questionDraft.financial;
    if(financial)for(const field of [...financial.persons.map(p=>p.income),...financial.expenses.map(e=>e.amount),financial.safetyBuffer,...financial.assets.map(a=>a.amount),...financial.provisions.map(p=>p.amount)])if(field.value!==null)field.confirmation='confirmed';
    const fields=[...new Set([...c.ambiguities.filter(a=>a.status==='open').map(a=>a.path),...intakeQuestions(questionDraft)])];
    const askable=fields.filter(path=>waitingForAnswer(c,path,dialogue));
    return QuestionsResponseSchema.parse({profileVersion:currentVersion(c)?.version??null,caseRevision:c.caseRevision,contextRevision:c.contextRevision,
      mandatoryFields:fields,pendingAcceptanceBatchIds:pendingAcceptanceIds(dialogue),questions:(c.handover.stopDigitalConversation?[]:askable).slice(0,c.timeBudgetMinutes<=10?1:3).map(path=>({path,mandatory:true,
        text:ambiguities.find(a=>a.path===path&&a.locale===c.locale)?.question??questionText(c.locale,path)})),
      pace:c.timeBudgetMinutes<=10?'compact':'detailed'});
  }
  async confirm(actor:Actor,id:string,input:unknown) {
    this.role(actor,'customer');const body=ConfirmProfileSchema.parse(input);
    return this.edit(actor,id,body.expectedCaseRevision,(c,db)=>{
      return this.confirmInTransaction(actor,c,db,body);
    });
  }
  /** Internal composition point: caller must hold the existing store transaction. */
  confirmInTransaction(actor:Actor,c:InsuranceCase,db:Database,input:unknown) {
    this.sessions.assertActive(actor,db);this.authorize(actor,c);this.role(actor,'customer');this.assertDigitalActive(c);
    const body=ConfirmProfileSchema.parse(input);if(body.expectedCaseRevision!==c.caseRevision)throw new WorkflowError('VERSION_CONFLICT');
    if(c.ambiguities?.some(a=>a.status==='open'))throw new WorkflowError('UNRESOLVED_AMBIGUITIES',422,c.ambiguities.filter(a=>a.status==='open').map(a=>a.path));
    const draft=DraftSchema.parse(c.draft);
    const f=draft.financial;
    if(f)for(const field of [...f.persons.map(p=>p.income),...f.expenses.map(e=>e.amount),f.safetyBuffer,...f.assets.map(a=>a.amount),...f.provisions.map(p=>p.amount)])if(field.value!==null)field.confirmation='confirmed';
    const missing=intakeQuestions(draft);if(missing.length)throw new WorkflowError('NEEDS_INPUT',422,missing);
    if(!c.draftDirty&&currentVersion(c))return c;
    if(c.confirmedVersions.length>=20)throw new WorkflowError('PROFILE_VERSION_CAPACITY',429);
    const financial=draft.financial!;
    const budget=calculateBudget(financial),capital=calculateCapital(financial);
    if(budget.status==='needs_input'||capital.status==='needs_input')throw new WorkflowError('NEEDS_INPUT',422,[...budget.issues,...capital.issues].map(i=>i.path));
    const intake=draft.insurance!;
    const actualDebt=intake.debts.reduce((sum,d)=>sum+d.annualServiceCents!,0);
    const declaredDebt=financial.expenses.filter(e=>e.category==='debt').reduce((sum,e)=>sum+(e.amount.value??0)*(e.amount.period==='month'?12:1),0);
    if(actualDebt!==declaredDebt)throw new WorkflowError('DEBT_SERVICE_MISMATCH',422,['insurance.debts','financial.expenses.debt']);
    for(const debt of intake.debts)if(debt.ownerPersonIds.some(owner=>!financial.persons.some(p=>p.id===owner)))throw new WorkflowError('UNKNOWN_DEBT_OWNER',422);
    const version=(currentVersion(c)?.version??0)+1;financial.profileVersion=version;financial.caseRevision=c.caseRevision+1;financial.caseId=c.id;
    c.confirmedVersions.push({version,draft:structuredClone(draft),confirmedAt:now(),confirmedBy:actor.id,noticeVersion:body.noticeVersion,calculatorTransferAllowed:true});
    c.draft=draft;c.draftDirty=false;c.activeRunId=null;c.latestAnalysisRequestId=null;c.graphContext=null;
    this.touch(c,'confirmed_profile_changed');this.audit(db,actor,c,'profile_confirmed');return c;
  }
  async analyze(actor:Actor,id:string,input:unknown,signal?:AbortSignal) {
    let startedId:string|undefined;
    try{return await this.runDigital(actor,id,linked=>this.analyzeDigital(actor,id,input,linked,requestId=>{startedId=requestId;}),signal);}
    catch(error){
      if(error instanceof WorkflowError&&error.code==='DIGITAL_TASK_CANCELLED'&&startedId)await this.edit(actor,id,undefined,(c,db)=>{
        if(c.latestAnalysisRequestId===startedId){c.latestAnalysisRequestId=null;this.touch(c,'analysis_cancelled');this.audit(db,actor,c,'analysis_cancelled');}
      },{allowDuringHandover:true}).catch(()=>{});
      throw error;
    }
  }
  private async analyzeDigital(actor:Actor,id:string,input:unknown,signal:AbortSignal,onStarted:(requestId:string)=>void) {
    this.role(actor,'customer');const body=RunAnalysisSchema.parse(input);
    const initial=this.caseFor(actor,id);if(initial.ambiguities.some(a=>a.status==='open'))throw new WorkflowError('UNRESOLVED_AMBIGUITIES',422);const initialVersion=currentVersion(initial);
    if(initial.runs.length>=20)throw new WorkflowError('RUN_CAPACITY',429);
    if(!initialVersion||initial.draftDirty||initialVersion.version!==body.expectedProfileVersion)throw new WorkflowError('STALE_CONTEXT');
    const localScenario=body.scenario.kind==='retirement'?{kind:'baseline' as const}:body.scenario;
    let local:ReturnType<CalculationService['analyze']>;
    let scenarioFinancial:NonNullable<InsuranceDraft['financial']>;
    let timeline:ReturnType<typeof retirementTimeline>|null=null;
    try {
      local=this.calculation.analyze(createAnalysisRequest(initialVersion.draft.financial!,localScenario,body.scenarioVersionId));
      scenarioFinancial=simulateScenario(initialVersion.draft.financial!,localScenario).snapshot;
      if(body.scenario.kind==='retirement')timeline=retirementTimeline(initialVersion.draft.financial!,body.scenario);
    }catch{throw new WorkflowError('SCENARIO_INPUT_INVALID',422);}
    const started=await this.edit(actor,id,body.expectedCaseRevision,(c,db)=>{
      if(c.ambiguities.some(a=>a.status==='open'))throw new WorkflowError('UNRESOLVED_AMBIGUITIES',422);
      const version=currentVersion(c);if(!version||c.draftDirty||version.version!==body.expectedProfileVersion)throw new WorkflowError('STALE_CONTEXT');
      if(body.scenario.kind==='retirement') {
        const goalId=body.scenario.goalId;if(!version.draft.goals.some(g=>g.id===goalId&&g.kind==='retirement'))throw new WorkflowError('RETIREMENT_GOAL_REQUIRED',422);
      }
      c.latestAnalysisRequestId=randomUUID();c.activeRunId=null;c.graphContext=null;this.touch(c,'analysis_started');this.audit(db,actor,c,'analysis_started');
      return {requestId:c.latestAnalysisRequestId,version:structuredClone(version),caseRevision:c.caseRevision};
    });
    onStarted(started.requestId);
    const draft=started.version.draft;const financial=draft.financial!;
    const providerResults:NormalizedProviderResult[]=[];const failures:{operation:string;code:string}[]=[];
    try {
      const jobs=buildProviderJobs(draft,scenarioFinancial,body.scenario,this.providerMode==='live'?new Date().getUTCFullYear():Number(financial.valuationDate.slice(0,4)),initial.locale);
      for(const slice of Array.from({length:Math.ceil(jobs.length/2)},(_,i)=>jobs.slice(i*2,i*2+2))) {
        signal.throwIfAborted();
        await Promise.all(slice.map(async job=>{
          try {const result=await this.provider.execute(job.operation,job.request,signal);
            if(job.personId)result.metadata={...result.metadata,personId:job.personId};providerResults.push(result);
          }catch(e){const code=typeof e==='object'&&e!==null&&'code' in e?String(e.code):'';
            failures.push({operation:job.operation,code:/^[A-Z0-9_]{2,100}$/.test(code)?code:'PROVIDER_ERROR'});}
        }));
      }
    }catch(e){failures.push({operation:'scenario_or_mapping',code:e instanceof WorkflowError?e.code:'NEEDS_INPUT'});}
    signal.throwIfAborted();
    const reviewReasons=new Set<string>(['LIFE_INSURANCE_DEMO_REVIEW_REQUIRED']);
    for(const flag of draft.reviewFlags)reviewReasons.add(flag.toUpperCase());
    for(const r of providerResults)for(const i of r.issues)reviewReasons.add(i.code);
    for(const i of local.issues)if(i.code!=='TAX_ALREADY_INCLUDED')reviewReasons.add(i.code);
    for(const i of timeline?.issues??[])reviewReasons.add(i.code);
    if(body.scenario.kind==='family')reviewReasons.add('PENSION_FUND_SCENARIO_EFFECT_OPEN');
    if(body.scenario.kind==='home')reviewReasons.add('HYPOTHETICAL_MORTGAGE_AND_BENEFICIARIES_REVIEW');
    if(body.scenario.kind==='retirement')reviewReasons.add('PENSION_FUND_EARLY_RETIREMENT_AND_BIRTH_MONTH_REVIEW');
    if(body.scenario.kind==='retirement'&&(draft.insurance!.existingAnnualRetirementSavingCents??0)>0)
      reviewReasons.add('EXISTING_PRIVATE_SAVING_BENEFIT_PROJECTION_REVIEW');
    if(draft.insurance!.persons.some(p=>p.personalAffordableAnnualPremiumCents===null))reviewReasons.add('PERSONAL_AFFORDABILITY_UNKNOWN');
    if(!draft.insurance!.investmentKnowledgeConfirmed)reviewReasons.add('INVESTMENT_KNOWLEDGE_INCOMPLETE');
    if(financial.assets.some(a=>a.liquidity==='restricted'&&a.pillar==='3'))reviewReasons.add('PENSION_CAPITAL_RELEASE_NOT_ASSUMED');
    let riskNeeds:ReturnType<typeof deriveRiskNeeds>=[];
    try{riskNeeds=deriveRiskNeeds(draft,scenarioFinancial,providerResults,body.scenario);}catch{failures.push({operation:'risk_capital_model',code:'NEEDS_INPUT'});reviewReasons.add('PROTECTION_CAPITAL_ASSUMPTIONS_OUT_OF_RANGE');}
    const inputHash=sha256Json({modelVersion:LIFE_MODEL_VERSION,draft,scenario:body.scenario,scenarioVersionId:body.scenarioVersionId});
    const run:LifeRun={id:local.runId,modelVersion:LIFE_MODEL_VERSION,profileVersion:started.version.version,scenarioVersionId:body.scenarioVersionId,inputHash,createdAt:now(),
      scenario:body.scenario,status:failures.length?'provider_error':riskNeeds.some(r=>r.annualGapCents===null)||timeline?.status==='needs_input'?'needs_input':'current',
      local,providerResults,providerFailures:failures,riskNeeds,timeline,pillarPicture:pillarPicture(draft,providerResults),reviewReasons:[...reviewReasons].sort(),
      assumptions:['Synthetic data only; actual calculator calls do not constitute insurance acceptance.',
        'Provider benefits, private pillar-3 benefits and current capital remain distinct.',...local.assumptions,...(timeline?.assumptions??[])]};
    if(timeline)for(const p of body.scenario.kind==='retirement'?body.scenario.persons:[]) {
      const age=providerResults.find(r=>r.operation==='ageLimits'&&r.metadata.personId===p.personId)?.metadata.ageLimits as Record<string,number>|undefined;
      const person=financial.persons.find(x=>x.id===p.personId)!;
      if(age&&p.pillar1MonthlyCents!==null&&p.pillar1MonthlyCents>0&&Number(p.pensionStartsMonth.slice(0,4))-person.birthYear<age.MinimumAHVAge!) {
        run.status='needs_input';run.reviewReasons.push('PILLAR1_START_BEFORE_PROVIDER_MINIMUM');
      }
    }
    return this.edit(actor,id,undefined,(c,db)=>{
      if(c.draftDirty||currentVersion(c)?.version!==run.profileVersion||c.latestAnalysisRequestId!==started.requestId)run.status='stale';
      LifeAnalysisSchema.parse(run);
      if(c.runs.length>=20)throw new WorkflowError('RUN_CAPACITY',429);c.runs.push(run);
      if(run.status!=='stale') {
        c.activeRunId=run.id;c.latestAnalysisRequestId=null;c.graphContext=null;
        c.reviewTasks.push({id:randomUUID(),runId:run.id,profileVersion:run.profileVersion,reasons:run.reviewReasons,status:'open',decision:null});
        this.touch(c,'analysis_ready');
      }
      this.audit(db,actor,c,'analysis_finished',run.status);return LifeAnalysisResponseSchema.parse({caseRevision:c.caseRevision,contextRevision:c.contextRevision,run,presentation:presentRun(run,c.locale)});
    });
  }
  async recommendation(actor:Actor,id:string) {
    this.role(actor,'customer');return this.edit(actor,id,undefined,(c,db)=>{
      const run=this.activeRun(c);if(run.status!=='current')throw new WorkflowError('ANALYSIS_NOT_READY',422);
      if(run.providerResults.some(r=>['needs_input','provider_error','unsupported','stale'].includes(r.status)))throw new WorkflowError('ANALYSIS_NOT_READY',422);
      const previous=c.recommendations.find(r=>r.runId===run.id);if(previous)return presentRecommendation(previous,c.locale);
      const rec=recommendLifeSolutions(currentVersion(c)!.draft,run,this.approved(c,run));c.recommendations.push(rec);
      this.touch(c,'recommendation_available');this.audit(db,actor,c,'recommendation_created');return presentRecommendation(rec,c.locale);
    });
  }
  async reviewDecision(actor:Actor,id:string,input:unknown) {
    this.role(actor,'reviewer');const body=ReviewDecisionSchema.parse(input);
    return this.edit(actor,id,undefined,(c,db)=>{
      if(body.runId==='intake') {
        if(body.decision==='approved_for_demo')throw new WorkflowError('ANALYSIS_NOT_READY',422);
        const task=c.reviewTasks.find(t=>t.runId==='intake'&&t.status==='open');if(!task)throw new WorkflowError('REVIEW_NOT_OPEN');
        task.status=body.decision;task.decision={actorId:actor.id,at:now(),acknowledgedReasonCodes:body.acknowledgedReasonCodes,criteria:body.criteria};
        this.touch(c,'review_state_changed');this.audit(db,actor,c,'intake_review_decided',body.decision);return task;
      }
      const run=this.activeRun(c);if(run.id!==body.runId)throw new WorkflowError('STALE_CONTEXT');
      if(run.status!=='current')throw new WorkflowError('ANALYSIS_NOT_READY',422);
      const task=c.reviewTasks.find(t=>t.runId===run.id&&t.status==='open');if(!task)throw new WorkflowError('REVIEW_NOT_OPEN');
      if(body.decision==='approved_for_demo') {
        const required=['data_sources_checked','need_and_units_checked','beneficiaries_checked','personal_affordability_checked','demo_only_understood'];
        if(!required.every(x=>body.criteria.includes(x as typeof body.criteria[number]))||!task.reasons.every(r=>body.acknowledgedReasonCodes.includes(r)))
          throw new WorkflowError('REVIEW_CRITERIA_INCOMPLETE',422);
      }
      task.status=body.decision;task.decision={actorId:actor.id,at:now(),acknowledgedReasonCodes:body.acknowledgedReasonCodes,criteria:body.criteria};
      for(const rec of c.recommendations.filter(r=>r.runId===run.id&&r.candidates.length)) {
        rec.status=body.decision==='approved_for_demo'?'ready_for_demo':'human_review_required';
        for(const candidate of rec.candidates)candidate.eligibility=body.decision==='approved_for_demo'?'ready_for_demo':'human_review_required';
      }
      this.touch(c,'review_state_changed');this.audit(db,actor,c,'review_decided',body.decision);return task;
    });
  }
  async requestReview(actor:Actor,id:string){
    this.role(actor,'customer');return this.edit(actor,id,undefined,(c,db)=>{
      const run=c.runs.find(r=>r.id===c.activeRunId);const existing=c.reviewTasks.find(t=>t.runId===(run?.id??'intake')&&t.status==='open');
      if(existing){if(!existing.reasons.includes('USER_REQUESTED'))existing.reasons.push('USER_REQUESTED');this.touch(c,'review_state_changed');return existing;}
      const task={id:randomUUID(),runId:run?.id??'intake',profileVersion:currentVersion(c)?.version??0,reasons:[...new Set([...(run?.reviewReasons??[]),'USER_REQUESTED'])],status:'open' as const,decision:null};
      for(const rec of c.recommendations.filter(r=>r.runId===run?.id&&r.candidates.length)){rec.status='human_review_required';for(const p of rec.candidates)p.eligibility='human_review_required';}
      c.reviewTasks.push(task);this.touch(c,'review_state_changed');this.audit(db,actor,c,'human_review_requested');return task;
    },{allowDuringHandover:true});
  }
  async preferences(actor:Actor,id:string,input:unknown) {
    this.role(actor,'customer');const body=CasePreferencesSchema.parse(input);
    return this.edit(actor,id,undefined,(c,db)=>{if(body.timeBudgetMinutes!==undefined)c.timeBudgetMinutes=body.timeBudgetMinutes;if(body.locale)c.locale=body.locale;
      this.touch(c,'conversation_preference_changed');this.audit(db,actor,c,'preferences_changed');return {caseRevision:c.caseRevision,contextRevision:c.contextRevision,locale:c.locale};},{allowDuringHandover:true});
  }
  async selectAnalysis(actor:Actor,id:string,input:unknown) {
    this.role(actor,'customer');const body=z.object({runId:z.string().uuid()}).strict().parse(input);
    return this.edit(actor,id,undefined,(c,db)=>{
      const run=c.runs.find(r=>r.id===body.runId);
      if(!run||run.status!=='current'||c.draftDirty||run.profileVersion!==currentVersion(c)?.version)throw new WorkflowError('STALE_CONTEXT');
      c.activeRunId=run.id;c.latestAnalysisRequestId=null;c.graphContext=null;this.touch(c,'analysis_selected');this.audit(db,actor,c,'analysis_selected');
      return {caseRevision:c.caseRevision,contextRevision:c.contextRevision,run};
    });
  }
  async selectGraph(actor:Actor,id:string,input:unknown) {
    this.role(actor,'customer');const graph=GraphContextSchema.parse(input);
    return this.edit(actor,id,undefined,(c,db)=>{
      const run=this.activeRun(c);if(graph.caseId!==c.id||graph.runId!==run.id||graph.profileVersion!==run.profileVersion||graph.scenarioVersionId!==run.scenarioVersionId)
        throw new WorkflowError('STALE_CONTEXT');
      if(graph.graphId==='retirement_timeline') {
        if(!run.timeline||graph.periodStart<run.timeline.periods[0]!.month||graph.periodEnd>run.timeline.periods.at(-1)!.month)throw new WorkflowError('STALE_CONTEXT');
      }else if(graph.periodStart<run.local.periodStart||graph.periodEnd>run.local.periodEnd)throw new WorkflowError('STALE_CONTEXT');
      const facts=selectedGraphFacts(run,graph);
      c.graphContext=graph;this.touch(c,'graph_context_changed');this.audit(db,actor,c,'graph_context_changed');return {graph,...facts,runId:run.id,inputHash:run.inputHash};
    });
  }
  advisorContext(actor:Actor,id:string) {
    const c=this.caseFor(actor,id,true);const run=!c.handover.stopDigitalConversation&&!c.draftDirty&&!c.ambiguities.some(a=>a.status==='open')?c.runs.find(r=>r.id===c.activeRunId&&r.status!=='stale'):null;
    const questions=this.questions(actor,id);const approved=run?this.approved(c,run):false;
    const facts=run?.local.metrics.filter(m=>m.value!==null&&['valid','estimated'].includes(m.status)).map(m=>({metricId:m.id,value:m.value,
      currency:m.currency,unit:m.unit,period:m.period,status:m.status,runId:run.id,profileVersion:run.profileVersion,scenarioVersionId:run.scenarioVersionId,humanReviewedForDemo:approved}))??[];
    if(run&&approved)for(const r of run.riskNeeds)if(r.annualGapCents!==null)facts.push({metricId:`risk_${r.scenario}_gap`,value:r.annualGapCents,
      currency:'CHF',unit:'cent',period:'year',status:r.status,runId:run.id,profileVersion:run.profileVersion,scenarioVersionId:run.scenarioVersionId,humanReviewedForDemo:true});
    const selected=run&&c.graphContext?selectedGraphFacts(run,c.graphContext):null;
    const values=selected?.series.map(p=>p.value).filter((v):v is number=>v!==null)??[];
    const projected=selected&&selected.series.length>24?{...selected,series:[],rangeSummary:{points:selected.series.length,
      first:selected.series[0],last:selected.series.at(-1),minimumKnown:values.length?Math.min(...values):null,
      maximumKnown:values.length?Math.max(...values):null,unknownPoints:selected.series.length-values.length}}:selected;
    return AdvisorContextSchema.parse({handover:c.handover,humanAdvisorContact:PAX_HUMAN_ADVISOR_CONTACT,caseId:c.id,caseRevision:c.caseRevision,contextRevision:c.contextRevision,profileVersion:currentVersion(c)?.version??null,
      runId:run?.id??null,scenarioVersionId:run?.scenarioVersionId??null,calculationInputHash:run?.inputHash??null,
      locale:c.locale,tempo:c.timeBudgetMinutes<=10?'compact':'detailed',graphContext:run?c.graphContext:null,
      contextId:run&&c.graphContext?sha256Json(c.graphContext):null,
      selectedGraphFacts:projected,
      maySpeakSelectedAmounts:!!run&&run.status==='current'&&!!c.graphContext&&
        (!!selected&&(['valid','estimated'].includes(selected.metric.status)||approved))&&
        (c.graphContext.graphId!=='risk_coverage'||approved),
      calculationStatus:run?.status??(c.latestAnalysisRequestId&&!c.draftDirty?'running':'needs_input'),
      ambiguities:ambiguityDialogue(c),pendingAcceptanceBatchIds:questions.pendingAcceptanceBatchIds,
      approvedFacts:facts.map(f=>({...f,label:metricText(c.locale,f.metricId),statusLabel:statusText(c.locale,f.status)})),nextQuestion:questions.questions[0]??null,missingFields:questions.mandatoryFields,
      scenarioComparisons:run?c.comparisons.filter(x=>x.variantRunId===run.id).slice(-1):[],
      reviewStatus:approved?'approved_for_demo':run?'open':'not_started',maySpeakAmounts:facts.length>0,
      progress:{...this.progress(c),groups:progressText(c.locale,this.progress(c).groups)},
      allowedActions:actor.role==='reviewer'?['read_context','record_review']:c.handover.stopDigitalConversation?actor.role==='advisor'?['read_context']:['resume_digital']:actor.role==='advisor'?['read_context','propose_patch']:['update_draft','confirm_profile','calculate','request_human'],
      policy:{noRawHealthData:true,noProviderTokens:true,noExternalAiTransferAuthorized:true,productFirstSelling:false}});
  }
  progress(c:InsuranceCase) {
    const financial=c.draft.financial;const run=!c.draftDirty?c.runs.find(r=>r.id===c.activeRunId):undefined;
    const groups=financial?calculateProgress(financial).groups:[{id:'financial',complete:false,missing:['financial']}];
    if(run)for(const group of groups)if(group.id==='pillar_1'||group.id==='pillar_2') {
      const p=run.pillarPicture.find(p=>`pillar_${p.pillar}`===group.id);
      if(p&&p.annualPensions.length){group.complete=true;group.missing=[];}
    }
    const missing=intakeQuestions(c.draft);
    groups.push({id:'life_goals',complete:c.draft.goals.length>0,missing:c.draft.goals.length?[]:['goals']},
      {id:'insurance_parameters',complete:missing.length===0,missing});
    return {domain:'data_capture',scope:'whole_life_intake',percent:Math.round(100*groups.filter(g=>g.complete).length/groups.length),
      reviewOpen:!run||!this.approved(c,run),groups};
  }
}
