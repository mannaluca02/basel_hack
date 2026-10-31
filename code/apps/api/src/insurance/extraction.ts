import { randomUUID } from 'node:crypto';
import { ExtractorContextSchema,ProposalBatchInputSchema,AcceptProposalInputSchema,ResolveAmbiguityInputSchema,AmbiguityResolutionSchema,ProposalAcceptanceSchema,
  type ProposalBatch } from '@pax/contracts';
import { ambiguityDialogue } from './ambiguity-dialogue.js';
import { LifeInsuranceEngine } from './engine.js';
import { WorkflowError,type Actor,type InsuranceCase,type Database } from './types.js';
import { sha256Json } from '../calculation/hash.js';
import { applyChanges,at,personFor,writablePaths,permitted } from './draft-proposals.js';

const profile=(c:InsuranceCase)=>c.confirmedVersions.at(-1)?.version??null;
export class ExtractionWorkflow {
  constructor(readonly engine:LifeInsuranceEngine){}
  context(actor:Actor,id:string){
    if(actor.role!=='advisor'&&actor.role!=='customer')throw new WorkflowError('FORBIDDEN',403);
    const c=this.engine.caseFor(actor,id,true),confirmed=c.confirmedVersions.at(-1)?.draft,paths=writablePaths(c.draft);
    return ExtractorContextSchema.parse({schemaVersion:'1.0',caseId:id,caseRevision:c.caseRevision,contextRevision:c.contextRevision,profileVersion:profile(c),
      draftHash:sha256Json(c.draft),draftDirty:c.draftDirty,locale:c.locale,dataClassification:'synthetic',personIds:c.draft.financial?.persons.map(p=>p.id)??[],draft:c.draft,
      fields:paths.filter(path=>!path.endsWith('_add')&&path!=='financial'&&path!=='insurance').map(path=>{
        const personId=personFor(c.draft,path),value=at(c.draft,path),old=confirmed?at(confirmed,path):undefined;
        const money=path.match(/^(.*)\.(value|period)$/),container=money?at(c.draft,money[1]!):null;
        const proposed=container&&typeof container==='object'&&'confirmation'in container&&container.confirmation==='proposed';
        return {path,...(personId?{personId}:{}),value,confirmation:value!==null&&old!==undefined&&sha256Json(value)===sha256Json(old)&&!proposed?'confirmed':'proposed'};
      }),proposals:c.proposals,proposalBatches:c.proposalBatches??[],ambiguities:ambiguityDialogue(c),writablePaths:paths,
      policy:{noRawHealthData:true,noProviderTokens:true,noExternalAiTransferAuthorized:true,customerConfirmationRequired:true}});
  }
  private assertAgent(actor:Actor,id:string){
    this.engine.sessions.assertActive(actor);if(actor.role!=='advisor')throw new WorkflowError('FORBIDDEN',403);this.engine.caseFor(actor,id,true);
  }
  async proposeBatch(actor:Actor,id:string,input:unknown){
    this.assertAgent(actor,id);const b=ProposalBatchInputSchema.parse(input),requestHash=sha256Json(b);
    return this.engine.store.transaction(db=>{
      this.engine.sessions.assertActive(actor,db);const c=db.cases[id];
      if(!c||c.ownerId!==actor.id||actor.caseId!==id)throw new WorkflowError('NOT_FOUND',404);
      if(c.expiresAt<=new Date().toISOString())throw new WorkflowError('CASE_EXPIRED',410);
      const previous=c.proposalBatches.find(p=>p.messageId===b.messageId);
      if(previous){if(previous.requestHash!==requestHash)throw new WorkflowError('IDEMPOTENCY_CONFLICT');return previous;}
      if(c.caseRevision!==b.expectedCaseRevision)throw new WorkflowError('VERSION_CONFLICT');
      if(profile(c)!==b.expectedProfileVersion)throw new WorkflowError('STALE_CONTEXT');
      if(sha256Json(c.draft)!==b.basisDraftHash)throw new WorkflowError('STALE_PROPOSAL');
      if(c.proposalBatches.length>=100||c.ambiguities.length+b.ambiguities.length>100)throw new WorkflowError('PROPOSAL_CAPACITY',429);
      const targets=b.changes.map(x=>x.path);
      if(targets.some((p,i)=>targets.some((q,j)=>i!==j&&(p.startsWith(q+'.')||q.startsWith(p+'.')))))throw new WorkflowError('OVERLAPPING_PATCH_PATHS',422);
      // Validate the combined candidate without mutating the live draft; it will be validated again at acceptance.
      applyChanges(c.draft,b.changes,id,b.source.sourceRef);
      for(const a of b.ambiguities){
        if(!permitted(a.path)||a.path.endsWith('_add')||at(c.draft,a.path)===undefined)throw new WorkflowError('PATCH_TARGET_MISSING',422,[a.path]);
        const personId=personFor(c.draft,a.path);if(personId!==a.personId)throw new WorkflowError('PERSON_REFERENCE_MISMATCH',422,[a.path]);
      }
      for(const ambiguityId of b.resolvesAmbiguityIds){const a=c.ambiguities.find(a=>a.id===ambiguityId);if(!a||a.status!=='open'||!targets.includes(a.path)||a.personId!==b.changes.find(x=>x.path===a.path)?.personId)throw new WorkflowError('AMBIGUITY_RESOLUTION_INVALID',422);}
      const replaced=b.supersedesBatchIds.map(oldId=>{const old=c.proposalBatches.find(p=>p.id===oldId);
        if(!old||old.status!=='proposed')throw new WorkflowError('PROPOSAL_NOT_OPEN');
        if(!old.changes.length||old.changes.some(x=>!targets.includes(x.path)))throw new WorkflowError('INCOMPLETE_SUPERSESSION',422);
        return old;});
      const legacy=b.supersedesProposalIds.map(oldId=>{const old=c.proposals.find(p=>p.id===oldId);
        if(!old||old.status!=='proposed')throw new WorkflowError('PROPOSAL_NOT_OPEN');
        if(!targets.includes(old.path))throw new WorkflowError('INCOMPLETE_SUPERSESSION',422);return old;});
      if(c.proposals.some(p=>p.status==='proposed'&&!b.supersedesProposalIds.includes(p.id)&&targets.includes(p.path)))throw new WorkflowError('SUPERSESSION_REQUIRED');
      const pending=c.proposalBatches.filter(p=>p.status==='proposed'&&!b.supersedesBatchIds.includes(p.id));
      if(pending.some(p=>p.changes.some(x=>targets.includes(x.path))))throw new WorkflowError('SUPERSESSION_REQUIRED',409);
      const timestamp=new Date().toISOString(),batchId=randomUUID();
      const ambiguities=b.ambiguities.map(a=>({...a,id:randomUUID(),locale:c.locale,createdAt:timestamp,status:'open' as const,resolvedAt:null,resolvedByBatchId:null,resolutionSourceRef:null}));
      const batch:ProposalBatch={id:batchId,messageId:b.messageId,source:b.source,createdAt:timestamp,requestHash,expectedProfileVersion:b.expectedProfileVersion,
        basisDraftHash:b.basisDraftHash,changes:b.changes,status:'proposed',supersedesBatchIds:b.supersedesBatchIds,supersedesProposalIds:b.supersedesProposalIds,replacedByBatchId:null,
        ambiguityIds:ambiguities.map(a=>a.id),resolvesAmbiguityIds:b.resolvesAmbiguityIds,acceptedAt:null};
      for(const old of legacy){old.status='superseded';old.replacedByBatchId=batchId;}
      for(const old of replaced){old.status='superseded';old.replacedByBatchId=batchId;}
      c.proposalBatches.push(batch);c.ambiguities.push(...ambiguities);
      this.engine.touch(c,b.ambiguities.length?'agent_ambiguities_available':'agent_proposal_batch_available');this.engine.audit(db,actor,c,'agent_proposal_batch_created');return batch;
    });
  }
  async acceptBatch(actor:Actor,id:string,batchId:string,input:unknown){
    if(actor.role!=='customer')throw new WorkflowError('FORBIDDEN',403);const b=AcceptProposalInputSchema.parse(input);
    return this.engine.edit(actor,id,b.expectedCaseRevision,(c,db)=>{
      return this.acceptBatchInTransaction(actor,c,db,batchId,b);
    });
  }
  /** Internal composition point: caller must hold the existing store transaction. */
  acceptBatchInTransaction(actor:Actor,c:InsuranceCase,db:Database,batchId:string,input:unknown){
    this.engine.sessions.assertActive(actor,db);this.engine.caseFor(actor,c.id);
    if(actor.role!=='customer'||actor.id!==c.ownerId)throw new WorkflowError('FORBIDDEN',403);
    const b=AcceptProposalInputSchema.parse(input);if(b.expectedCaseRevision!==c.caseRevision)throw new WorkflowError('VERSION_CONFLICT');
    const batch=c.proposalBatches.find(p=>p.id===batchId);if(!batch||batch.status!=='proposed')throw new WorkflowError('PROPOSAL_NOT_OPEN');
    if(profile(c)!==batch.expectedProfileVersion)throw new WorkflowError('STALE_CONTEXT');
    if(sha256Json(c.draft)!==batch.basisDraftHash)throw new WorkflowError('STALE_PROPOSAL');
    if(!batch.changes.length)throw new WorkflowError('NO_CHANGES_TO_ACCEPT',422);
    const draft=applyChanges(c.draft,batch.changes,c.id,batch.source.sourceRef);
    for(const ambiguityId of batch.resolvesAmbiguityIds){const a=c.ambiguities.find(a=>a.id===ambiguityId);if(!a||a.status!=='open')throw new WorkflowError('AMBIGUITY_RESOLUTION_INVALID',422);}
    c.draft=draft;c.draftDirty=true;c.activeRunId=null;c.latestAnalysisRequestId=null;c.graphContext=null;
    batch.status='accepted';batch.acceptedAt=new Date().toISOString();
    for(const a of c.ambiguities.filter(a=>batch.resolvesAmbiguityIds.includes(a.id))){a.status='resolved';a.resolvedAt=batch.acceptedAt;a.resolvedByBatchId=batch.id;a.resolutionSourceRef=batch.source.sourceRef;}
    this.engine.touch(c,'draft_changed');this.engine.audit(db,actor,c,'agent_proposal_batch_accepted');
    return ProposalAcceptanceSchema.parse({caseRevision:c.caseRevision,contextRevision:c.contextRevision,confirmationStillRequired:true,draft:c.draft});
  }
  async resolveAmbiguity(actor:Actor,id:string,ambiguityId:string,input:unknown){
    if(actor.role!=='customer')throw new WorkflowError('FORBIDDEN',403);const b=ResolveAmbiguityInputSchema.parse(input);
    return this.engine.edit(actor,id,b.expectedCaseRevision,(c,db)=>{
      const a=c.ambiguities.find(a=>a.id===ambiguityId);if(!a||a.status!=='open')throw new WorkflowError('AMBIGUITY_NOT_OPEN');
      a.status='resolved';a.resolvedAt=new Date().toISOString();a.resolutionSourceRef=b.resolutionSourceRef;
      this.engine.touch(c,'ambiguity_resolved');this.engine.audit(db,actor,c,'ambiguity_resolved');
      return AmbiguityResolutionSchema.parse({caseRevision:c.caseRevision,contextRevision:c.contextRevision,ambiguity:a});
    });
  }
}
