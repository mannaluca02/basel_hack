import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z, ZodError } from 'zod';
import { DraftSchema, type ProposalChangeInput, type VoiceObservation } from '@pax/contracts';
import { LIFE_RUNTIME, type LifeRuntime } from '../insurance/runtime.js';
import { LifeSessionGuard } from '../insurance/http.js';
import { WorkflowError, type Actor } from '../insurance/types.js';
import { loadDemoSnapshot } from '../demo/fixtures.js';
import { mapVoiceObservations } from './portfolio.js';
import { parseExactAnnualGrossIncome } from './exact-income.js';
import { INTAKE_SAMPLE_IDS, INTAKE_TEXT, intakeObservations, modelObservations, scriptObservation } from './lab-intake.js';
import { parseSetupFacts, setupDraft, setupFacts, type SetupFacts } from './lab-setup.js';
import { answerChanges, answerObservations, isAskedField, keyOfPath, openAsks, parseAnswers, pendingView, type Answer, type LocationLookup } from './lab-questions.js';
import { REPORT_TOOLS, liveDelegation, liveTargets, replaceable } from './lab-delegation.js';
import { languageNumber } from '../insurance/i18n.js';
import { at } from '../insurance/draft-proposals.js';
import type { ResponsesTransport } from '../erni-dialog/responses.js';
type JsonValue = Parameters<typeof JSON.stringify>[0];
const MODEL_ERRORS=['MODEL_TIMEOUT','MODEL_TRANSPORT_FAILED','INVALID_MODEL_OUTPUT'];
/** The open-question key of an intake field of the person speaking (lab-questions.ts). */
const intakeKey=(fieldId:string,personId:string)=>({annual_gross_income_chf:`insurance.persons.${personId}.grossAnnualIncomeCents`,civil_status:'insurance.relationship',
  has_pension_fund:`insurance.persons.${personId}.withPillar2`,pillar_3a_annual_contribution_chf:'insurance.existingAnnualPillar3aContributionCents',
  monthly_housing_cost_chf:'financial.expenses.housing',desired_retirement_age:`insurance.persons.${personId}.desiredWorkStopAge`} as Record<string,string>)[fieldId]??fieldId;

const TurnSchema = z.discriminatedUnion('mode', [
  z.object({mode:z.literal('synthetic'),sample:z.enum(['income','correction','smalltalk',...INTAKE_SAMPLE_IDS]),messageId:z.string().min(1).max(100),personId:z.string().min(1).max(100)}).strict(),
  // Without personId only while the case has no person yet: the conversation then sets up the case frame.
  // askedKey: the open question Paxi asked last (GET questions), so one statement fills that field and no other.
  // report: the tool calls of GPT-Live's background model for this turn (lab-delegation.ts), instead of a backend model call.
  z.object({mode:z.literal('live'),voiceSessionId:z.uuid(),messageId:z.string().min(1).max(100),personId:z.string().min(1).max(100).optional(),askedKey:z.string().min(1).max(200).optional(),
    report:z.object({calls:z.array(z.object({name:z.enum(REPORT_TOOLS),arguments:z.string().max(20000)}).strict()).max(6)}).strict().optional()}).strict(),
]);
type Report=NonNullable<Extract<z.infer<typeof TurnSchema>,{mode:'live'}>['report']>;
/** The arguments of every call of one tool in a report. */
const reported=(report:Report,name:typeof REPORT_TOOLS[number])=>report.calls.filter(call=>call.name===name).map(call=>call.arguments);
const samples = {
  de:{income:'Mein Bruttojahreseinkommen beträgt 119000 CHF.',correction:'Korrektur: Mein Bruttojahreseinkommen beträgt 118000 CHF.',smalltalk:'Guten Morgen!'},
  en:{income:'My annual gross income is 119000 CHF.',correction:'Correction: My annual gross income is 118000 CHF.',smalltalk:'Good morning!'},
  fr:{income:'Mon revenu annuel brut est de 119000 CHF.',correction:'Correction : mon revenu annuel brut est de 118000 CHF.',smalltalk:'Bonjour !'},
  it:{income:'Il mio reddito annuo lordo è 119000 CHF.',correction:'Correzione: il mio reddito annuo lordo è 118000 CHF.',smalltalk:'Buongiorno!'},
} as const;

/** An authored, unconfirmed baseline, using the same financial fixture as the rest of the demo. */
async function baseline() {
  const financial=await loadDemoSnapshot();
  return DraftSchema.parse({financial,goals:[
    {id:'goal_retirement',kind:'retirement',targetMonth:'2050-01',priority:1,targetCapitalCents:100000000},
  ],reviewFlags:[],insurance:{relationship:'married',relationshipSinceYear:2015,sharedChildren:0,taxLocationId:400100000,
    debts:[],children:[],debtsConfirmed:true,existingPrivateRiskBenefitsConfirmed:true,confession1:4,confession2:4,taxableFortuneCents:10000000,
    retirementNeedAnnualCents:9600000,annualReturnBps:0,retirementHorizonAge:88,annualSavingCents:600000,
    annualSavingIsAdditional:true,existingAnnualRetirementSavingCents:500000,existingAnnualPillar3aContributionCents:600000,
    investmentKnowledgeConfirmed:true,riskAppetite:'medium',riskCapitalStrategy:'preserve_assets_for_other_goals',
    persons:financial.persons.map((p,index)=>({personId:p.id,providerSex:index===0?1:2,grossAnnualIncomeCents:index===0?12000000:8000000,
      withPillar2:true,pillar2Risk:{disabilityAnnualCents:index===0?4000000:2400000,disabilityChildAnnualCents:800000,survivorAnnualCents:3000000,orphanAnnualCents:800000},
      retirementPensionAnnualCents:index===0?4000000:2400000,currentPillar2CapitalCents:10000000,desiredWorkStopAge:65,
      disabilityNeedAnnualCents:15000000,deathNeedAnnualCents:10000000,protectionTermMonths:240,existingDeathCapitalCents:0,
      deathOneOffCostsCents:1000000,debtPayoffCents:0,debtTreatment:'included_in_income_need',deathNeedExcludesRepaidDebtService:false,
      personalAffordableAnnualPremiumCents:index===0?400000:300000}))}});
}

/** Customer-owned orchestrator. It never accepts a browser-authored agent actor or observations; the
 * background model's tool calls the browser relays (report) are untrusted model output, validated
 * against the transcript stored here like the backend's own model output.
 * rules-v1 intentionally handles only an explicit annual gross CHF statement. No model inference.
 * All writes still run the normal sourced proposal/voice validation in the canonical runtime.
 */
@Controller('api/cases/:caseId/voice-lab')
@UseGuards(LifeSessionGuard)
export class VoiceLabController {
  constructor(@Inject(LIFE_RUNTIME) private readonly r:LifeRuntime) {}

  @Post('initialize')
  async initialize(@Req() req:{actor:Actor},@Param('caseId') id:string,@Body() input:unknown) {
    const body=z.object({expectedCaseRevision:z.number().int().nonnegative()}).strict().parse(input);
    const c=this.customer(req.actor,id);
    if(c.draft.financial||c.draft.insurance||c.draft.goals.length||c.draft.reviewFlags.length||
      [c.proposalBatches,c.confirmedVersions,c.proposals,c.ambiguities,c.runs,c.reviewTasks,
        c.recommendations,c.quotes,c.applications,c.policies,c.estimates,c.comparisons,c.toolRuns]
        .some(items=>items?.length))throw new WorkflowError('LAB_REQUIRES_EMPTY_CASE');
    // Reject a guessed future revision before loading the fixture; patchDraft rechecks at commit.
    if(c.caseRevision!==body.expectedCaseRevision)throw new WorkflowError('VERSION_CONFLICT');
    await this.r.engine.patchDraft(req.actor,id,{...await baseline(),expectedCaseRevision:body.expectedCaseRevision});
    return {initialized:true,syntheticOnly:true,confirmed:false};
  }

  @Post('turns')
  async turn(@Req() req:{actor:Actor},@Param('caseId') id:string,@Body() input:unknown) {
    const b=TurnSchema.parse(input),c=this.customer(req.actor,id);
    this.r.engine.assertDigitalActive(c);
    const live=b.mode==='live'?this.r.voice.transcript(req.actor,id,b.voiceSessionId):null;
    if(live&&(live.voiceSession.status!=='active'||live.voiceSession.expiresAt<=new Date().toISOString()||live.voiceSession.locale!==c.locale))throw new WorkflowError('VOICE_SESSION_NOT_ACTIVE');
    const turn=live?.turns.find(t=>t.log.messageId===b.messageId&&t.speaker==='customer');
    if(b.mode==='live'&&!turn)throw new WorkflowError('VOICE_SOURCE_NOT_FOUND',422);
    const text=b.mode==='synthetic'?({...samples[c.locale],...INTAKE_TEXT[c.locale]} as Record<string,string>)[b.sample]!:turn!.log.text;
    const authored=b.mode==='synthetic'&&INTAKE_SAMPLE_IDS.includes(b.sample);
    const grant=await this.r.sessions.agentToken(req.actor,id),agent=this.r.sessions.authenticate(grant.sessionToken);
    try {
      const read=()=>{
        const ctx=this.r.extraction.context(agent,id);
        // Even a rapid stop/resume must invalidate work begun before the handover.
        if(ctx.handover.revision!==c.handover.revision)throw new WorkflowError('DIGITAL_TASK_CANCELLED');
        if(ctx.locale!==c.locale)throw new WorkflowError('STALE_CONTEXT');
        if(b.personId===undefined?ctx.personIds.length>0:!ctx.personIds.includes(b.personId))throw new WorkflowError('PERSON_REFERENCE_MISMATCH',422);
        return ctx;
      };
      let ctx=read();
      const who=b.personId??'setup';
      const source={messageId:`lab_${b.messageId}`,turnId:turn?.log.turnId??b.messageId,sourceRef:b.mode==='synthetic'?`synthetic:voice-lab:${b.sample}:${who}`:`voice:${b.mode==='live'?b.voiceSessionId:''}:${b.messageId}:${who}`};
      const previous=ctx.proposalBatches.find(batch=>batch.messageId===source.messageId);
      if(previous){
        const expectedRef=b.mode==='synthetic'?source.sourceRef:`voice:${b.voiceSessionId}:${source.messageId}`;
        // A merged batch also carries person-less (global) changes; only person-bound ones can name another person.
        if(previous.source.sourceRef!==expectedRef||previous.changes.some(change=>change.personId!==undefined&&change.personId!==who))throw new WorkflowError('IDEMPOTENCY_CONFLICT');
        return {mode:b.mode,source:{...source,text,speaker:'customer'},extraction:{adapter:'rules-v1',externalModelCall:false,route:'canonical replay',request:null,result:{proposalBatch:previous,replayed:true,confirmationStillRequired:true}}};
      }
      const transport=b.mode==='live'?this.r.modelExtraction.options.transport:undefined;
      if(b.mode==='live'&&b.personId===undefined)return await this.setupTurn(agent,id,c.id,live!,turn!,source,text,transport,b.report);
      const personId=b.personId!;
      let adapter='rules-v1',observations:VoiceObservation[]=[],modelFailed=false,answers:Answer[]=[],delegated=false;
      if(authored)adapter='authored-script',observations=scriptObservation(b.sample,text,b.messageId,personId);
      else if(b.mode==='live'&&b.report&&this.r.modelExtraction.permission(agent,id).transferAllowed) {
        // GPT-Live's background model read the turn already; its calls are untrusted model output like our own.
        adapter='model-v1';delegated=true;
        const turns=live!.turns.slice(0,live!.turns.indexOf(turn!)+1).map(t=>({role:t.speaker==='customer'?'user' as const:'assistant' as const,text:t.log.text}));
        const targets=liveTargets(ctx.draft,ctx.proposalBatches,c.id,ctx.personIds);
        try {
          observations=reported(b.report,'submit_intake_observations').flatMap(args=>intakeObservations(args,turns,b.messageId,personId));
          answers=reported(b.report,'submit_answers').flatMap(args=>parseAnswers(args,turns,targets,b.askedKey));
        } catch(error) {
          if(!(error instanceof WorkflowError&&MODEL_ERRORS.includes(error.code)))throw error;
          modelFailed=true;observations=[];answers=[];
        }
      }
      else if(b.mode==='live'&&transport&&this.r.modelExtraction.permission(agent,id).transferAllowed) {
        adapter='model-v1';
        const task=this.r.engine.digitalTasks.begin(id);
        try {
          this.r.modelExtraction.assertTransferAllowed(agent,id);
          const turns=live!.turns.slice(0,live!.turns.indexOf(turn!)+1).map(t=>({role:t.speaker==='customer'?'user' as const:'assistant' as const,text:t.log.text}));
          // The open profile questions are read in the same round: everything the confirmation still
          // needs (the intake fields too, in case modelObservations missed one) and corrections.
          // Fields of a person not accepted yet wait for the next turn (paths must name a known person).
          const targets=liveTargets(ctx.draft,ctx.proposalBatches,c.id,ctx.personIds);
          [observations,answers]=await Promise.all([modelObservations(transport,turns,b.messageId,personId,task.signal),
            answerObservations(transport,turns,targets,task.signal,b.mode==='live'?b.askedKey:undefined).catch((error:unknown)=>{if(error instanceof WorkflowError&&MODEL_ERRORS.includes(error.code))return [];throw error;})]);
          this.r.modelExtraction.assertTransferAllowed(agent,id);
          if(task.signal.aborted)throw new WorkflowError('DIGITAL_TASK_CANCELLED');
        } catch(error) {
          // A flaky model never ends the conversation; consent, handover and cancellation still stop it.
          if(!(error instanceof WorkflowError&&MODEL_ERRORS.includes(error.code)))throw error;
          modelFailed=true;observations=[];answers=[];
        } finally {task.finish();}
        // Read the context only now, so a slow model cannot leave a stale revision or draft hash behind.
        ctx=read();
      } else {
        const income=parseExactAnnualGrossIncome(text);
        if(income)observations=[{fieldId:'annual_gross_income_chf',personId,sourceMessageId:b.messageId,quote:income.quote,value:income.value,precision:'exact',unit:'CHF',period:'year',basis:'gross'}];
      }
      // Dry run per observation: an unclear value is turn data (not a CaseAmbiguity, a batch without changes could not be replaced).
      const clarifications:{fieldId:string;quote:string;value:string|null;code:'AMBIGUOUS_VALUE'}[]=[],exact:VoiceObservation[]=[];
      // A case the conversation set up (live start): the intake extraction only fills what is still
      // empty. It sees eight fields only, so it took "20000 more saving" for the 3a; corrections of
      // answered fields go through answerObservations, which knows every field and needs the latest
      // sentence. With a persona (demo, Voice Lab) the intake extraction stays the correction path.
      const liveSetup=ctx.proposalBatches.some(batch=>batch.messageId.startsWith('setup_'));
      const view=adapter==='model-v1'&&liveSetup?pendingView(ctx.draft,replaceable(ctx.proposalBatches).flatMap(batch=>batch.changes),c.id):null;
      // 'unknown' is the placeholder of relationship and risk appetite, not an answer.
      const known=(path:string)=>{const value=at(view,path);return value!==null&&value!==undefined&&value!=='unknown';};
      for(const o of observations) {
        try {
          const dry=mapVoiceObservations(ctx.draft,[o],ctx.locale);
          if(view&&dry.changes.length&&dry.changes.every(change=>known(change.path)))continue;
          // Once the app names the question Paxi is on, the intake extraction fills that field only:
          // "dreitausend im Jahr" for the saving asked about is no 3a contribution.
          if(view&&b.mode==='live'&&b.askedKey&&!dry.changes.some(change=>isAskedField(keyOfPath(view,change.path),b.askedKey)))continue;
          if(dry.issues.some(issue=>issue.code==='AMBIGUOUS_VALUE'))clarifications.push({fieldId:o.fieldId,quote:o.quote,value:o.value===null?null:String(o.value),code:'AMBIGUOUS_VALUE'});
          else if(dry.changes.length)exact.push(o);
        } catch(error) {if(!(error instanceof WorkflowError))throw error;}
      }
      const mapped=mapVoiceObservations(ctx.draft,exact,ctx.locale);
      // One cumulative open batch: acceptBatch needs basisDraftHash === draft, so every turn replaces the open batch and keeps its changes.
      const open=mapped.changes.length?ctx.proposalBatches.filter(batch=>batch.status==='proposed'&&batch.changes.length>0&&!batch.ambiguityIds?.length):[];
      const supersedesBatchIds=open.map(batch=>batch.id);
      const live2=b.mode==='live'?this.r.voice.transcript(req.actor,id,b.voiceSessionId):null;
      const request={messageId:`lab_${b.messageId}`,expectedCaseRevision:ctx.caseRevision,expectedProfileVersion:ctx.profileVersion,basisDraftHash:ctx.draftHash,
        ...(live2?{transcriptRevision:live2.voiceSession.transcriptRevision}:{}),observations:exact,supersedesBatchIds};
      const issues=modelFailed?[{code:'MODEL_EXTRACTION_FAILED',action:'screen_or_human_review'}]:adapter==='rules-v1'&&!observations.length?[{code:'RULE_NOT_MATCHED',action:'screen_or_human_review'}]:[];
      let result:unknown;
      try {
        if(b.mode==='live'&&exact.length)result=await this.r.voice.propose(agent,id,b.voiceSessionId,request);
        else if(exact.length) {
          const {observations:_,...batchRequest}=request,paths=new Set(mapped.changes.map(change=>change.path));
          const carried=open.flatMap(batch=>batch.changes).filter(change=>!paths.has(change.path));
          const proposalBatch=await this.r.extraction.proposeBatch(agent,id,{...batchRequest,source,changes:[...carried,...mapped.changes],ambiguities:[]});
          result={proposalBatch,issues:mapped.issues,confirmationStillRequired:true};
        } else result={proposalBatch:null,issues,confirmationStillRequired:true};
      } catch(error) {
        // Only these two stay conversational; handover, cancellation, auth and capacity errors still stop the turn.
        const code=error instanceof ZodError?'DRAFT_INVALID':error instanceof WorkflowError&&error.code==='SUPERSESSION_REQUIRED'?'OPEN_REVIEW_REQUIRED':null;
        if(!code)throw error;
        result={proposalBatch:null,issues:[{code,action:'screen_or_human_review'}],confirmationStillRequired:true};
      }
      const answered=answers.length?await this.proposeAnswers(agent,id,c.id,b.messageId,source,answers,this.lookup(c.locale)):null;
      // What the open questions took from this sentence is no longer unclear ("ungefähr tausend
      // Franken" for the housing, saved per month): otherwise Paxi asks for it again.
      const taken=new Set(answered?.proposalBatch?answered.answered:[]);
      const stillUnclear=clarifications.filter(item=>!taken.has(intakeKey(item.fieldId,personId)));
      return {mode:b.mode,source:{...source,text,speaker:'customer'},extraction:{adapter,externalModelCall:adapter==='model-v1',...(delegated?{delegated}:{}),route:b.mode==='live'?'VoiceIntegrationService.propose':'ExtractionWorkflow.proposeBatch',request,clarifications:stillUnclear,result,
        ...(answered?{answers:answered}:{})}};
    } finally {await this.r.sessions.revoke(agent);}
  }

  /**
   * A live case without test data has no person yet. Until the conversation gave the person's age
   * and employment rate (model-v1, with the extraction consent), the turn only reports what is
   * missing; then it proposes the case frame for that one person (everything else unknown). The
   * customer's acceptance creates the person; from then on turns map the intake fields as usual.
   */
  private async setupTurn(agent:Actor,id:string,caseId:string,live:ReturnType<LifeRuntime['voice']['transcript']>,turn:typeof live.turns[number],
    source:{messageId:string;turnId:string;sourceRef:string},text:string,transport:ResponsesTransport|undefined,report?:Report) {
    const reply=(extra:Record<string,unknown>,result:unknown)=>({mode:'live' as const,source:{...source,text,speaker:'customer'},
      extraction:{adapter:'model-v1',externalModelCall:true,...(report?{delegated:true}:{}),route:'setup',request:null,clarifications:[],result,...extra}});
    if(!(transport||report)||!this.r.modelExtraction.permission(agent,id).transferAllowed)
      return reply({externalModelCall:false},{proposalBatch:null,issues:[{code:'SETUP_NEEDS_MODEL',action:'screen_or_human_review'}],confirmationStillRequired:true});
    const task=this.r.engine.digitalTasks.begin(id);
    let facts:SetupFacts;
    try {
      this.r.modelExtraction.assertTransferAllowed(agent,id);
      const turns=live.turns.slice(0,live.turns.indexOf(turn)+1).map(t=>({role:t.speaker==='customer'?'user' as const:'assistant' as const,text:t.log.text}));
      // The background model reports both facts from the whole conversation, as setupFacts reads them.
      const args=report?reported(report,'submit_setup_facts').at(-1):undefined;
      facts=report?args===undefined?{birthYear:null,employmentRateBps:null,quotes:[]}:parseSetupFacts(args,turns):await setupFacts(transport!,turns,task.signal);
      if(task.signal.aborted)throw new WorkflowError('DIGITAL_TASK_CANCELLED');
    } catch(error) {
      if(!(error instanceof WorkflowError&&['MODEL_TIMEOUT','MODEL_TRANSPORT_FAILED','INVALID_MODEL_OUTPUT'].includes(error.code)))throw error;
      return reply({},{proposalBatch:null,issues:[{code:'MODEL_EXTRACTION_FAILED',action:'screen_or_human_review'}],confirmationStillRequired:true});
    } finally {task.finish();}
    const missing=[...(facts.birthYear===null?['age']:[]),...(facts.employmentRateBps===null?['employment_rate_percent']:[])];
    if(missing.length)return reply({setup:{missing}},{proposalBatch:null,issues:[],confirmationStillRequired:true});
    const ctx=this.r.extraction.context(agent,id);
    if(ctx.personIds.length)throw new WorkflowError('STALE_CONTEXT');
    const c=this.r.engine.caseFor(agent,id,true);
    const frame=setupDraft(c.draft,caseId,facts.birthYear!,facts.employmentRateBps!,source.sourceRef);
    const changes=(['financial','insurance'] as const).filter(key=>c.draft[key]===null).map(key=>({path:key,value:frame[key] as unknown as JsonValue}));
    const supersedesBatchIds=ctx.proposalBatches.filter(batch=>batch.status==='proposed'&&batch.changes.some(change=>change.path==='financial'||change.path==='insurance')).map(batch=>batch.id);
    // Its own message id: once the person exists, the same turn is extracted again for the intake fields.
    const setupSource={...source,messageId:source.messageId.replace(/^lab_/,'setup_')};
    const proposalBatch=await this.r.extraction.proposeBatch(agent,id,{messageId:setupSource.messageId,source:setupSource,expectedCaseRevision:ctx.caseRevision,
      expectedProfileVersion:ctx.profileVersion,basisDraftHash:ctx.draftHash,changes,ambiguities:[],supersedesBatchIds});
    return reply({setup:{missing:[],quotes:facts.quotes}},{proposalBatch,issues:[],confirmationStillRequired:true});
  }

  /**
   * What the profile still needs before the live build can confirm and calculate it, in
   * conversation order, as Paxi asks it (accepted values plus open proposals count as known).
   */
  @Get('questions')
  questions(@Req() req:{actor:Actor},@Param('caseId') id:string) {
    const c=this.customer(req.actor,id);
    return {asks:openAsks(pendingView(c.draft,replaceable(c.proposalBatches).flatMap(batch=>batch.changes),c.id),c.locale)};
  }

  /**
   * GPT-Live's background model for the case as it is now (lab-delegation.ts): the browser sends it
   * with session.update after every turn, so the tools know the open fields and the question asked.
   */
  @Get('delegation')
  delegation(@Req() req:{actor:Actor},@Param('caseId') id:string,@Query('askedKey') askedKey:unknown) {
    const c=this.customer(req.actor,id);
    const asked=z.string().min(1).max(200).optional().parse(askedKey);
    return {delegation:liveDelegation(c.draft,c.proposalBatches,c.id,asked)};
  }

  /**
   * The answers to the open profile questions as their own batch (`ask_` + message id). It replaces
   * the open batch, the intake fields of this same turn included, and carries its changes, so
   * there is still one cumulative proposal to accept. A repeated turn proposes nothing new.
   */
  private async proposeAnswers(agent:Actor,id:string,caseId:string,messageId:string,source:{messageId:string;turnId:string;sourceRef:string},answers:Answer[],lookup:LocationLookup) {
    const ctx=this.r.extraction.context(agent,id),askId=`ask_${messageId}`;
    if(ctx.proposalBatches.some(batch=>batch.messageId===askId))return null;
    const open=replaceable(ctx.proposalBatches),carried=open.flatMap(batch=>batch.changes);
    const view=pendingView(ctx.draft,carried,caseId);
    // Additions append, so the carried ones stay; a value set again wins.
    // What the intake extraction read from this same turn stays (it checks period and basis itself).
    const intake=new Set(open.find(batch=>batch.messageId===`lab_${messageId}`)?.changes.map(change=>change.path)??[]);
    const merge=(answered:ProposalChangeInput[])=>{const changes=answered.filter(change=>!intake.has(change.path)),paths=new Set(changes.map(change=>change.path));
      return [...carried.filter(change=>change.path.endsWith('_add')||!paths.has(change.path)),...changes];};
    // A batch holds at most 50 changes: the first answers in conversation order go now, the rest
    // stays open and is read again next turn (the quotes are still in the conversation).
    let take=answers.length,merged:ProposalChangeInput[]=[];
    for(;take>0;take=Math.min(take-1,Math.floor(take*0.75))) {
      merged=merge(await answerChanges(view,answers.slice(0,take),source.sourceRef,lookup));
      if(merged.length<=50)break;
    }
    if(take===0||merged.length===carried.length)return {proposalBatch:null,answered:[],issues:[]};
    answers=answers.slice(0,take);
    try {
      const proposalBatch=await this.r.extraction.proposeBatch(agent,id,{messageId:askId,source:{...source,messageId:askId},expectedCaseRevision:ctx.caseRevision,
        expectedProfileVersion:ctx.profileVersion,basisDraftHash:ctx.draftHash,changes:merged,ambiguities:[],supersedesBatchIds:open.map(batch=>batch.id)});
      return {proposalBatch,answered:answers.map(a=>a.key),issues:[]};
    } catch(error) {
      const code=error instanceof ZodError?'DRAFT_INVALID':error instanceof WorkflowError&&['SUPERSESSION_REQUIRED','PATCH_TARGET_MISSING','PERSON_REFERENCE_MISMATCH'].includes(error.code)?'ANSWERS_NOT_PROPOSED':null;
      if(!code)throw error;
      return {proposalBatch:null,answered:answers.map(a=>a.key),issues:[{code,action:'screen_or_human_review'}]};
    }
  }

  /** A spoken municipality to the calculator's location id, only when exactly one location fits. */
  private lookup(locale:keyof typeof languageNumber):LocationLookup {
    return async search=>{
      const result=await this.r.engine.provider.execute('searchLocation',{Search:search,Language:languageNumber[locale]});
      const locations=(result.metadata.locations??[]) as {LocationID:number;ZipCode:string|number;City:string}[];
      const zip=/\b\d{4}\b/.exec(search)?.[0],name=search.replace(/\b\d{4}\b/,'').trim().toLocaleLowerCase();
      const fits=locations.filter(l=>(!zip||String(l.ZipCode)===zip)&&(!name||l.City.toLocaleLowerCase()===name));
      const ids=new Set((fits.length?fits:locations).map(l=>l.LocationID));
      return ids.size===1?[...ids][0]!:null;
    };
  }

  private customer(actor:Actor,id:string) {
    this.r.sessions.assertActive(actor);
    if(actor.role!=='customer')throw new WorkflowError('FORBIDDEN',403);
    return this.r.engine.caseFor(actor,z.uuid().parse(id));
  }
}
