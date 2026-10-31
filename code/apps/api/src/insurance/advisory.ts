import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DraftSchema,GoalSchema,AdvisorProposalInputSchema,AcceptProposalInputSchema } from '@pax/contracts';
import { LifeInsuranceEngine } from './engine.js';
import { WorkflowError,type Actor } from './types.js';
import { sha256Json } from '../calculation/hash.js';

const ProposalSchema=AdvisorProposalInputSchema;
const AcceptSchema=AcceptProposalInputSchema;
const permitted=(path:string)=>path==='goals_add'||/^goals\.\d+\.targetMonth$/.test(path)||/^financial\.persons\.\d+\.income\.value$/.test(path)||
  /^financial\.expenses\.\d+\.amount\.value$/.test(path)||
  /^insurance\.persons\.\d+\.(grossAnnualIncomeCents|deathNeedAnnualCents|disabilityNeedAnnualCents|personalAffordableAnnualPremiumCents|protectionTermMonths)$/.test(path)||
  /^goals\.\d+\.targetCapitalCents$/.test(path);

export class AdvisoryTools {
  constructor(readonly engine:LifeInsuranceEngine){}
  async propose(actor:Actor,id:string,input:unknown) {
    this.engine.sessions.assertActive(actor);if(actor.role!=='advisor')throw new WorkflowError('FORBIDDEN',403);
    this.engine.caseFor(actor,id,true);const p=ProposalSchema.parse(input);if(!permitted(p.path))throw new WorkflowError('PATCH_PATH_FORBIDDEN',422);
    return this.engine.store.transaction(db=>{
      this.engine.sessions.assertActive(actor,db);const c=db.cases[id]!;
      if(c.ownerId!==actor.id||actor.caseId!==id)throw new WorkflowError('NOT_FOUND',404);
      if((c.confirmedVersions.at(-1)?.version??null)!==p.expectedProfileVersion)throw new WorkflowError('STALE_CONTEXT');
      const previous=c.proposals.find(x=>x.messageId===p.messageId);
      if(previous){if(previous.path!==p.path||sha256Json(previous.value)!==sha256Json(p.value))throw new WorkflowError('IDEMPOTENCY_CONFLICT');return previous;}
      if(c.proposals.length>=100)throw new WorkflowError('PROPOSAL_CAPACITY',429);
      const proposal={id:randomUUID(),path:p.path,value:p.value,expectedProfileVersion:p.expectedProfileVersion,basisDraftHash:sha256Json(c.draft),status:'proposed' as const,messageId:p.messageId};
      c.proposals.push(proposal);this.engine.touch(c,'agent_proposal_available');this.engine.audit(db,actor,c,'agent_proposal_created');return proposal;
    });
  }
  async accept(actor:Actor,id:string,proposalId:string,input:unknown) {
    if(actor.role!=='customer')throw new WorkflowError('FORBIDDEN',403);const body=AcceptSchema.parse(input);
    return this.engine.edit(actor,id,body.expectedCaseRevision,(c,db)=>{
      const p=c.proposals.find(x=>x.id===proposalId);if(!p||p.status!=='proposed')throw new WorkflowError('PROPOSAL_NOT_OPEN');
      if((c.confirmedVersions.at(-1)?.version??null)!==p.expectedProfileVersion)throw new WorkflowError('STALE_CONTEXT');
      if(sha256Json(c.draft)!==p.basisDraftHash)throw new WorkflowError('STALE_PROPOSAL');
      if(p.path==='goals_add') {
        c.draft=DraftSchema.parse({...c.draft,goals:[...c.draft.goals,GoalSchema.parse(p.value)]});p.status='accepted';
        c.draftDirty=true;c.activeRunId=null;c.latestAnalysisRequestId=null;c.graphContext=null;
        this.engine.touch(c,'draft_changed');this.engine.audit(db,actor,c,'agent_goal_accepted');
        return {caseRevision:c.caseRevision,contextRevision:c.contextRevision,confirmationStillRequired:true,draft:c.draft};
      }
      const copy=structuredClone(c.draft);const keys=p.path.split('.');let node:unknown=copy;
      for(const key of keys.slice(0,-1)) {
        if(typeof node!=='object'||node===null||!Object.hasOwn(node,key))throw new WorkflowError('PATCH_TARGET_MISSING',422);
        node=(node as Record<string,unknown>)[key];
      }
      if(typeof node!=='object'||node===null||!Object.hasOwn(node,keys.at(-1)!))throw new WorkflowError('PATCH_TARGET_MISSING',422);
      (node as Record<string,unknown>)[keys.at(-1)!]=p.value;c.draft=DraftSchema.parse(copy);p.status='accepted';
      c.draftDirty=true;c.activeRunId=null;c.latestAnalysisRequestId=null;c.graphContext=null;
      this.engine.touch(c,'draft_changed');this.engine.audit(db,actor,c,'agent_proposal_accepted');
      return {caseRevision:c.caseRevision,contextRevision:c.contextRevision,confirmationStillRequired:true,draft:c.draft};
    });
  }
}
