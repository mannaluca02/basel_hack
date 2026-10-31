import { randomUUID } from 'node:crypto';
import { CreateConfirmationInputSchema,CustomerConfirmationSchema,PresentConfirmationInputSchema,AnswerConfirmationInputSchema,
  CancelConfirmationInputSchema,ConfirmationOutcomeSchema,type ConfirmationTarget,type CustomerConfirmation } from '@pax/contracts';
import { LifeInsuranceEngine } from './engine.js';
import { ExtractionWorkflow } from './extraction.js';
import { WorkflowError,type Actor,type InsuranceCase } from './types.js';
import { sha256Json } from '../calculation/hash.js';
import { applyChanges } from './draft-proposals.js';
import { confirmationQuestion } from './confirmation-text.js';

type StoredRequest=InsuranceCase['confirmationRequests'][number];
const active=(r:StoredRequest)=>['awaiting_presentation','awaiting_answer'].includes(r.status);
export class CustomerConfirmations {
  constructor(readonly engine:LifeInsuranceEngine,readonly extraction:ExtractionWorkflow,private readonly now=()=>new Date()){}
  private customer(actor:Actor){this.engine.sessions.assertActive(actor);if(actor.role!=='customer')throw new WorkflowError('FORBIDDEN',403);}
  private public(r:StoredRequest):CustomerConfirmation {const {sessionHash,...dto}=r;return CustomerConfirmationSchema.parse(dto);}
  private request(actor:Actor,c:InsuranceCase,id:string){
    const r=c.confirmationRequests.find(r=>r.id===id);if(!r||r.sessionHash!==actor.sessionHash)throw new WorkflowError('NOT_FOUND',404);return r;
  }
  private assertUsable(actor:Actor,c:InsuranceCase,r:StoredRequest){
    if(r.sessionHash!==actor.sessionHash)throw new WorkflowError('NOT_FOUND',404);
    if(!active(r))throw new WorkflowError('CONFIRMATION_NOT_OPEN');
    if(r.expiresAt<=this.now().toISOString())throw new WorkflowError('CONFIRMATION_EXPIRED',410);
    if(c.caseRevision!==r.basisCaseRevision||sha256Json(c.draft)!==r.basisDraftHash||(c.confirmedVersions.at(-1)?.version??null)!==r.basisProfileVersion)throw new WorkflowError('STALE_CONFIRMATION');
    if(this.target(c,r.target).targetHash!==r.targetHash)throw new WorkflowError('STALE_CONFIRMATION');
  }
  private target(c:InsuranceCase,target:ConfirmationTarget){
    if(target.kind==='accept_batch'){
      const b=c.proposalBatches.find(b=>b.id===target.batchId);
      if(!b||b.status!=='proposed'||!b.changes.length)throw new WorkflowError('PROPOSAL_NOT_OPEN');
      if(b.basisDraftHash!==sha256Json(c.draft)||(c.confirmedVersions.at(-1)?.version??null)!==b.expectedProfileVersion)throw new WorkflowError('STALE_PROPOSAL');
      const draft=applyChanges(c.draft,b.changes,c.id,b.source.sourceRef);
      return {draft,changes:b.changes,targetHash:sha256Json({target,requestHash:b.requestHash,changes:b.changes})};
    }
    if(c.ambiguities.some(a=>a.status==='open'))throw new WorkflowError('UNRESOLVED_AMBIGUITIES',422);
    if(!c.draftDirty)throw new WorkflowError('PROFILE_ALREADY_CONFIRMED');
    return {draft:c.draft,changes:[],targetHash:sha256Json({target,draftHash:sha256Json(c.draft),noticeVersion:'lifemap-synthetic-v2'})};
  }
  async create(actor:Actor,id:string,input:unknown){
    this.customer(actor);const b=CreateConfirmationInputSchema.parse(input);
    return this.engine.edit(actor,id,b.expectedCaseRevision,(c,db)=>{
      if(c.confirmationRequests.length>=100)throw new WorkflowError('CONFIRMATION_CAPACITY',429);
      if(c.confirmationRequests.some(r=>r.questionTurnId===b.questionTurnId||r.questionReplyId===b.questionReplyId))throw new WorkflowError('CONFIRMATION_QUESTION_REUSED');
      const target=this.target(c,b.target);
      if(b.target.kind==='confirm_profile'){
        // Validate the same complete-profile rules without committing a profile before the customer's answer.
        const probe=structuredClone(db);this.engine.confirmInTransaction(actor,probe.cases[id]!,probe,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v2'});
      }
      const review={draft:target.draft,changes:target.changes,noticeVersion:'lifemap-synthetic-v2' as const,
        allowSyntheticCalculatorTransfer:b.target.kind==='confirm_profile',confirmProfileAndAssumptions:b.target.kind==='confirm_profile'};
      const questionText=confirmationQuestion(c,b.target,b.channel,target.changes);
      for(const old of c.confirmationRequests.filter(active)){old.status='invalidated';old.invalidationReason='new_question';}
      this.engine.touch(c,'confirmation_requested');
      const r:StoredRequest={schemaVersion:'1.0',id:randomUUID(),caseId:id,target:b.target,channel:b.channel,basisCaseRevision:c.caseRevision,
        basisProfileVersion:c.confirmedVersions.at(-1)?.version??null,basisDraftHash:sha256Json(c.draft),targetHash:target.targetHash,locale:c.locale,
        questionId:randomUUID(),questionTurnId:b.questionTurnId,questionReplyId:b.questionReplyId,questionHash:sha256Json({target:b.target,locale:c.locale,questionText,review}),questionText,review,
        createdAt:this.now().toISOString(),expiresAt:new Date(Math.min(this.now().getTime()+120_000,Date.parse(actor.expiresAt),Date.parse(c.expiresAt))).toISOString(),
        status:'awaiting_presentation',presentedAt:null,playbackId:null,answerMessageId:null,answeredAt:null,invalidationReason:null,sessionHash:actor.sessionHash};
      c.confirmationRequests.push(r);this.engine.audit(db,actor,c,'customer_confirmation_requested');return this.public(r);
    });
  }
  get(actor:Actor,id:string,requestId:string){
    this.customer(actor);const c=this.engine.caseFor(actor,id),r=this.request(actor,c,requestId);
    if(active(r)&&r.expiresAt<=this.now().toISOString()){r.status='invalidated';r.invalidationReason='expired';}
    return this.public(r);
  }
  current(actor:Actor,id:string){
    this.customer(actor);const c=this.engine.caseFor(actor,id),r=[...c.confirmationRequests].reverse().find(r=>r.sessionHash===actor.sessionHash);
    return {confirmation:r?this.get(actor,id,r.id):null};
  }
  private bind(r:StoredRequest,b:{questionId:string;questionHash:string;questionTurnId:string;questionReplyId:string}){
    if(r.questionId!==b.questionId||r.questionHash!==b.questionHash||r.questionTurnId!==b.questionTurnId||r.questionReplyId!==b.questionReplyId)throw new WorkflowError('CONFIRMATION_QUESTION_MISMATCH',422);
  }
  async presented(actor:Actor,id:string,requestId:string,input:unknown){
    this.customer(actor);const b=PresentConfirmationInputSchema.parse(input);
    return this.engine.edit(actor,id,b.expectedCaseRevision,(c,db)=>{
      const r=this.request(actor,c,requestId);this.assertUsable(actor,c,r);this.bind(r,b);
      if(r.status!=='awaiting_presentation')throw new WorkflowError('CONFIRMATION_ALREADY_PRESENTED');
      if((r.channel==='voice')!==!!b.playback)throw new WorkflowError('CONFIRMATION_PRESENTATION_INCOMPLETE',422);
      if(r.target.kind==='confirm_profile'&&(!b.profileAndAssumptionsDisplayed||!b.privacyNoticeDisplayed))throw new WorkflowError('CONFIRMATION_PRESENTATION_INCOMPLETE',422);
      r.presentedAt=this.now().toISOString();r.playbackId=b.playback?.playbackId??null;r.status='awaiting_answer';
      this.engine.audit(db,actor,c,'customer_confirmation_presented');return this.public(r);
    });
  }
  async answer(actor:Actor,id:string,requestId:string,input:unknown){
    this.customer(actor);const b=AnswerConfirmationInputSchema.parse(input);
    return this.engine.edit(actor,id,b.expectedCaseRevision,(c,db)=>{
      const r=this.request(actor,c,requestId);this.assertUsable(actor,c,r);this.bind(r,b);
      if(r.channel!==b.channel||r.status!=='awaiting_answer')throw new WorkflowError('CONFIRMATION_NOT_PRESENTED',422);
      let accept:boolean,messageId:string;
      if(b.channel==='voice'){
        const log=b.voiceLog;
        if(log.caseId!==id||log.correlationId!==r.questionId||log.source!=='voice'||log.locale!==r.locale||log.turnId===r.questionTurnId||log.expectedCaseRevision!==undefined&&log.expectedCaseRevision!==c.caseRevision)throw new WorkflowError('CONFIRMATION_ANSWER_MISMATCH',422);
        const value=log.text.trim().toLocaleLowerCase().replace(/[.!?]+$/u,'').trim();
        const words={de:['ja','nein'],fr:['oui','non'],it:['sì','no'],en:['yes','no']} as const;
        if(value===words[r.locale][0]||r.locale==='it'&&value==='si')accept=true;
        else if(value===words[r.locale][1])accept=false;
        else throw new WorkflowError('CONFIRMATION_ANSWER_UNCLEAR',422);
        messageId=log.messageId;
      }else{accept=b.decision==='accept';messageId=b.answerMessageId;}
      if(c.confirmationRequests.some(x=>x.answerMessageId===messageId))throw new WorkflowError('CONFIRMATION_ANSWER_REUSED');
      r.answerMessageId=messageId;r.answeredAt=this.now().toISOString();
      // Mark consumed BEFORE mutation: engine.touch invalidates all other outstanding requests.
      r.status=accept?'consumed':'cancelled';if(!accept)r.invalidationReason='cancelled_by_customer';
      if(accept){
        if(r.target.kind==='accept_batch')this.extraction.acceptBatchInTransaction(actor,c,db,r.target.batchId,{expectedCaseRevision:c.caseRevision,accept:true});
        else this.engine.confirmInTransaction(actor,c,db,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:r.review.noticeVersion});
      }else{
        if(r.target.kind==='accept_batch'){const batchId=r.target.batchId,batch=c.proposalBatches.find(b=>b.id===batchId);if(batch)batch.status='rejected';}
        this.engine.touch(c,'confirmation_declined');
      }
      this.engine.audit(db,actor,c,accept?'customer_confirmation_consumed':'customer_confirmation_declined');
      return ConfirmationOutcomeSchema.parse({confirmation:this.public(r),caseRevision:c.caseRevision,contextRevision:c.contextRevision,
        profileVersion:c.confirmedVersions.at(-1)?.version??null,accepted:accept,confirmationStillRequired:c.draftDirty});
    });
  }
  async cancel(actor:Actor,id:string,requestId:string,input:unknown){
    this.customer(actor);const b=CancelConfirmationInputSchema.parse(input);
    return this.engine.edit(actor,id,b.expectedCaseRevision,(c,db)=>{
      const r=this.request(actor,c,requestId);if(!active(r))throw new WorkflowError('CONFIRMATION_NOT_OPEN');
      r.status='cancelled';r.invalidationReason=b.reason;this.engine.touch(c,'confirmation_cancelled');this.engine.audit(db,actor,c,'customer_confirmation_cancelled');return this.public(r);
    });
  }
}
