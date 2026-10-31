import { randomUUID } from 'node:crypto';
import { HumanHandoverCommandSchema,HumanHandoverViewSchema,HumanHandoverCommandResponseSchema,PAX_HUMAN_ADVISOR_CONTACT } from '@pax/contracts';
import { LifeInsuranceEngine } from './engine.js';
import { WorkflowError,type Actor,type InsuranceCase } from './types.js';
import { sha256Json } from '../calculation/hash.js';
export class HumanHandoverService {
  constructor(readonly engine:LifeInsuranceEngine,readonly afterChange:()=>Promise<void>=async()=>{}){}
  private view(c:InsuranceCase){return HumanHandoverViewSchema.parse({caseId:c.id,caseRevision:c.caseRevision,contextRevision:c.contextRevision,handover:c.handover,contact:PAX_HUMAN_ADVISOR_CONTACT});}
  read(actor:Actor,id:string){return this.view(this.engine.caseFor(actor,id,true));}
  async command(actor:Actor,id:string,input:unknown){
    this.engine.sessions.assertActive(actor);if(actor.role!=='customer')throw new WorkflowError('FORBIDDEN',403);
    const b=HumanHandoverCommandSchema.parse(input),key=`handover:${b.messageId}`,fingerprint=sha256Json({action:b.action,source:b.source});
    const result=await this.engine.edit(actor,id,undefined,(c,db)=>{
      const previous=c.idempotency[key];
      if(previous){if(previous.fingerprint!==fingerprint)throw new WorkflowError('IDEMPOTENCY_CONFLICT');
        return HumanHandoverCommandResponseSchema.parse({...this.view(c),command:{messageId:b.messageId,action:b.action,replayed:true,changed:false}});}
      if(c.caseRevision!==b.expectedCaseRevision)throw new WorkflowError('VERSION_CONFLICT');
      if(Object.keys(c.idempotency).length>=200)throw new WorkflowError('COMMAND_CAPACITY',429);
      const requested=b.action==='request',changed=c.handover.wantsHumanAdvisor!==requested;
      if(changed){
        const instant=new Date().toISOString();
        c.handover=requested?{status:'requested',revision:c.handover.revision+1,wantsHumanAdvisor:true,leaveViewRequested:true,stopDigitalConversation:true,
          requestId:randomUUID(),requestedAt:instant,resumedAt:null,source:b.source}:{...c.handover,status:'digital',revision:c.handover.revision+1,wantsHumanAdvisor:false,leaveViewRequested:false,stopDigitalConversation:false,resumedAt:instant};
        // A late calculation may never reactivate the digital flow, even if the customer quickly resumes.
        c.latestAnalysisRequestId=null;c.graphContext=null;
        if(requested){
          for(const s of c.voiceSessions)if(s.status==='active'||s.status==='starting'){s.status='interrupted';s.endedAt=instant;s.closeReason='human_handover';}
          const run=c.runs.find(r=>r.id===c.activeRunId),runId=run?.id??'intake';
          for(const rec of c.recommendations.filter(r=>r.runId===runId&&r.candidates.length)){rec.status='human_review_required';for(const p of rec.candidates)p.eligibility='human_review_required';}
          const review=c.reviewTasks.find(t=>t.runId===runId&&t.status==='open');
          if(review){if(!review.reasons.includes('USER_REQUESTED_HUMAN_ADVISOR'))review.reasons.push('USER_REQUESTED_HUMAN_ADVISOR');}
          else c.reviewTasks.push({id:randomUUID(),runId,profileVersion:c.confirmedVersions.at(-1)?.version??0,reasons:['USER_REQUESTED_HUMAN_ADVISOR'],status:'open',decision:null});
        }
        this.engine.touch(c,requested?'human_handover_requested':'digital_advice_resumed');
        this.engine.audit(db,actor,c,requested?'human_handover_requested':'digital_advice_resumed');
      }
      c.idempotency[key]={fingerprint,result:{action:b.action,handoverRevision:c.handover.revision}};
      return HumanHandoverCommandResponseSchema.parse({...this.view(c),command:{messageId:b.messageId,action:b.action,replayed:false,changed}});
    },{allowDuringHandover:true});
    if(result.handover.stopDigitalConversation)this.engine.digitalTasks.cancel(id);
    await this.afterChange();
    return result;
  }
}
