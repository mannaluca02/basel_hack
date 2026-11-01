import { Body, Controller, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z, ZodError } from 'zod';
import { DraftSchema, type VoiceObservation } from '@pax/contracts';
import { LIFE_RUNTIME, type LifeRuntime } from '../insurance/runtime.js';
import { LifeSessionGuard } from '../insurance/http.js';
import { WorkflowError, type Actor } from '../insurance/types.js';
import { loadDemoSnapshot } from '../demo/fixtures.js';
import { mapVoiceObservations } from './portfolio.js';
import { parseExactAnnualGrossIncome } from './exact-income.js';
import { INTAKE_SAMPLE_IDS, INTAKE_TEXT, modelObservations, scriptObservation } from './lab-intake.js';
import { setupDraft, setupFacts, type SetupFacts } from './lab-setup.js';
import type { ResponsesTransport } from '../erni-dialog/responses.js';
type JsonValue = Parameters<typeof JSON.stringify>[0];

const TurnSchema = z.discriminatedUnion('mode', [
  z.object({mode:z.literal('synthetic'),sample:z.enum(['income','correction','smalltalk',...INTAKE_SAMPLE_IDS]),messageId:z.string().min(1).max(100),personId:z.string().min(1).max(100)}).strict(),
  // Without personId only while the case has no person yet: the conversation then sets up the case frame.
  z.object({mode:z.literal('live'),voiceSessionId:z.uuid(),messageId:z.string().min(1).max(100),personId:z.string().min(1).max(100).optional()}).strict(),
]);
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

/** Customer-owned orchestrator. It never accepts a browser-authored agent actor or observations.
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
      if(b.mode==='live'&&b.personId===undefined)return await this.setupTurn(agent,id,c.id,live!,turn!,source,text,transport);
      const personId=b.personId!;
      let adapter='rules-v1',observations:VoiceObservation[]=[],modelFailed=false;
      if(authored)adapter='authored-script',observations=scriptObservation(b.sample,text,b.messageId,personId);
      else if(b.mode==='live'&&transport&&this.r.modelExtraction.permission(agent,id).transferAllowed) {
        adapter='model-v1';
        const task=this.r.engine.digitalTasks.begin(id);
        try {
          this.r.modelExtraction.assertTransferAllowed(agent,id);
          const turns=live!.turns.slice(0,live!.turns.indexOf(turn!)+1).map(t=>({role:t.speaker==='customer'?'user' as const:'assistant' as const,text:t.log.text}));
          observations=await modelObservations(transport,turns,b.messageId,personId,task.signal);
          this.r.modelExtraction.assertTransferAllowed(agent,id);
          if(task.signal.aborted)throw new WorkflowError('DIGITAL_TASK_CANCELLED');
        } catch(error) {
          // A flaky model never ends the conversation; consent, handover and cancellation still stop it.
          if(!(error instanceof WorkflowError&&['MODEL_TIMEOUT','MODEL_TRANSPORT_FAILED','INVALID_MODEL_OUTPUT'].includes(error.code)))throw error;
          modelFailed=true;observations=[];
        } finally {task.finish();}
        // Read the context only now, so a slow model cannot leave a stale revision or draft hash behind.
        ctx=read();
      } else {
        const income=parseExactAnnualGrossIncome(text);
        if(income)observations=[{fieldId:'annual_gross_income_chf',personId,sourceMessageId:b.messageId,quote:income.quote,value:income.value,precision:'exact',unit:'CHF',period:'year',basis:'gross'}];
      }
      // Dry run per observation: an unclear value is turn data (not a CaseAmbiguity, a batch without changes could not be replaced).
      const clarifications:{fieldId:string;quote:string;value:string|null;code:'AMBIGUOUS_VALUE'}[]=[],exact:VoiceObservation[]=[];
      for(const o of observations) {
        try {
          const dry=mapVoiceObservations(ctx.draft,[o],ctx.locale);
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
      return {mode:b.mode,source:{...source,text,speaker:'customer'},extraction:{adapter,externalModelCall:adapter==='model-v1',route:b.mode==='live'?'VoiceIntegrationService.propose':'ExtractionWorkflow.proposeBatch',request,clarifications,result}};
    } finally {await this.r.sessions.revoke(agent);}
  }

  /**
   * A live case without test data has no person yet. Until the conversation gave the person's age
   * and employment rate (model-v1, with the extraction consent), the turn only reports what is
   * missing; then it proposes the case frame for that one person (everything else unknown). The
   * customer's acceptance creates the person; from then on turns map the intake fields as usual.
   */
  private async setupTurn(agent:Actor,id:string,caseId:string,live:ReturnType<LifeRuntime['voice']['transcript']>,turn:typeof live.turns[number],
    source:{messageId:string;turnId:string;sourceRef:string},text:string,transport:ResponsesTransport|undefined) {
    const reply=(extra:Record<string,unknown>,result:unknown)=>({mode:'live' as const,source:{...source,text,speaker:'customer'},
      extraction:{adapter:'model-v1',externalModelCall:true,route:'setup',request:null,clarifications:[],result,...extra}});
    if(!transport||!this.r.modelExtraction.permission(agent,id).transferAllowed)
      return reply({externalModelCall:false},{proposalBatch:null,issues:[{code:'SETUP_NEEDS_MODEL',action:'screen_or_human_review'}],confirmationStillRequired:true});
    const task=this.r.engine.digitalTasks.begin(id);
    let facts:SetupFacts;
    try {
      this.r.modelExtraction.assertTransferAllowed(agent,id);
      const turns=live.turns.slice(0,live.turns.indexOf(turn)+1).map(t=>({role:t.speaker==='customer'?'user' as const:'assistant' as const,text:t.log.text}));
      facts=await setupFacts(transport,turns,task.signal);
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
    const proposalBatch=await this.r.extraction.proposeBatch(agent,id,{messageId:source.messageId,source,expectedCaseRevision:ctx.caseRevision,
      expectedProfileVersion:ctx.profileVersion,basisDraftHash:ctx.draftHash,changes,ambiguities:[],supersedesBatchIds});
    return reply({setup:{missing:[],quotes:facts.quotes}},{proposalBatch,issues:[],confirmationStillRequired:true});
  }

  private customer(actor:Actor,id:string) {
    this.r.sessions.assertActive(actor);
    if(actor.role!=='customer')throw new WorkflowError('FORBIDDEN',403);
    return this.r.engine.caseFor(actor,z.uuid().parse(id));
  }
}
