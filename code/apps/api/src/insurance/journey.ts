import { randomUUID } from 'node:crypto';
import { JourneyActionSchema,DemoApplicationDecisionSchema } from '@pax/contracts';
import { sha256Json } from '../calculation/hash.js';
import { LifeInsuranceEngine } from './engine.js';
import { ProductDocuments } from './documents.js';
import { PAX_PRODUCTS } from './products.js';
import { assertSuitable } from './suitability.js';
import { WorkflowError,type Actor,type InsuranceCase,type DemoQuote,type DemoApplication,type DemoPolicy } from './types.js';
import { annual,usable } from '@pax/domain';

export class DemoJourneyService {
  constructor(readonly engine:LifeInsuranceEngine,readonly documents:ProductDocuments){}
  private customer(actor:Actor){this.engine.sessions.assertActive(actor);if(actor.role!=='customer')throw new WorkflowError('FORBIDDEN',403);}
  private current(c:InsuranceCase){const run=this.engine.activeRun(c);if(run.status!=='current'||!this.engine.approved(c,run))throw new WorkflowError('HUMAN_REVIEW_REQUIRED');return run;}
  private documentCheck(quote:DemoQuote,acknowledged:string[]|undefined) {
    const current=this.documents.metadata(quote.documents.map(d=>d.id));
    if(!current.every(d=>quote.documents.some(q=>q.id===d.id&&q.sha256===d.sha256)))throw new WorkflowError('DOCUMENT_VERSION_CHANGED');
    if(!quote.documents.every(d=>acknowledged?.includes(d.id)))throw new WorkflowError('INFORMATION_ACKNOWLEDGEMENT_REQUIRED',422);
  }
  private async action<T>(actor:Actor,id:string,name:string,body:ReturnType<typeof JourneyActionSchema.parse>,fn:(c:InsuranceCase)=>T) {
    const {expectedCaseRevision,...payload}=body;const fingerprint=sha256Json({action:name,payload});const key=`${name}:${body.idempotencyKey}`;
    return this.engine.edit(actor,id,undefined,(c,db)=>{
      this.current(c);const previous=c.idempotency[key];
      if(previous){if(previous.fingerprint!==fingerprint)throw new WorkflowError('IDEMPOTENCY_CONFLICT');return previous.result as T;}
      if(c.caseRevision!==expectedCaseRevision)throw new WorkflowError('VERSION_CONFLICT');
      if(Object.keys(c.idempotency).length>=200)throw new WorkflowError('COMMAND_CAPACITY',429);
      const before=sha256Json({quotes:c.quotes,applications:c.applications,policies:c.policies});
      const result=fn(c);c.idempotency[key]={fingerprint,result:structuredClone(result)};
      const changed=before!==sha256Json({quotes:c.quotes,applications:c.applications,policies:c.policies});
      if(changed){this.engine.touch(c,`demo_${name}`);this.engine.audit(db,actor,c,`demo_${name}`);}return result;
    });
  }
  async quote(actor:Actor,id:string,input:unknown) {
    this.customer(actor);const body=JourneyActionSchema.parse(input);
    return this.action(actor,id,'quote_created',body,c=>{
      const run=this.current(c);const rec=c.recommendations.find(r=>r.id===body.recommendationId);
      if(!rec||rec.runId!==run.id||rec.profileVersion!==run.profileVersion)throw new WorkflowError('STALE_RECOMMENDATION');
      if(!body.selectedCandidateIds?.length)throw new WorkflowError('EXPLICIT_PRODUCT_SELECTION_REQUIRED',422);
      const selected=rec.candidates.filter(p=>body.selectedCandidateIds!.includes(p.id));
      if(selected.length!==new Set(body.selectedCandidateIds).size)throw new WorkflowError('UNKNOWN_PRODUCT_SELECTION',422);
      const saving=selected.filter(p=>['pax_3a','pax_fondsstar','pax_lifestar'].includes(p.productId));
      if(saving.length>1)throw new WorkflowError('ALTERNATIVE_PRODUCTS_CANNOT_BE_STACKED',422);
      const profile=c.confirmedVersions.at(-1)!.draft;
      // Fund-linked and capitalization products need a suitable pre-check of the person (Pax form 0054).
      assertSuitable(c,run.profileVersion,selected,profile.insurance!.persons[0]!.personId);
      for(const p of selected)if(p.personId&&(profile.insurance!.persons.find(x=>x.personId===p.personId)?.personalAffordableAnnualPremiumCents??0)<=0)
        throw new WorkflowError('PERSONAL_AFFORDABILITY_NOT_ESTABLISHED',422);
      for(const p of selected)if(p.personId) {
        const person=profile.financial!.persons.find(x=>x.id===p.personId)!;
        const income=annual(person.income)??0;
        const ownFree=profile.financial!.assets.filter(a=>a.ownerPersonIds?.length===1&&a.ownerPersonIds[0]===p.personId&&a.liquidity==='free'&&a.availableFrom<=profile.financial!.valuationDate&&usable(a.amount))
          .reduce((sum,a)=>sum+Math.max(0,a.amount.value!-a.allocations.reduce((s,x)=>s+x.amountCents,0)),0);
        const capacity=profile.insurance!.persons.find(x=>x.personId===p.personId)!;
        if(income<=0&&ownFree<capacity.personalAffordableAnnualPremiumCents!*(capacity.protectionTermMonths!/12))
          throw new WorkflowError('PERSONAL_FUNDS_NOT_SUPPORTED_BY_OWN_RESOURCES',422);
        if(capacity.personalAffordableAnnualPremiumCents!>income&&ownFree===0)throw new WorkflowError('PERSONAL_FUNDS_NOT_SUPPORTED_BY_OWN_RESOURCES',422);
      }
      const budget=run.local.metrics.find(m=>m.id==='affordableContributionAnnual')?.value??0;
      if(budget<=0)throw new WorkflowError('HOUSEHOLD_AFFORDABILITY_NOT_ESTABLISHED',422);
      const docs=this.documents.metadata(selected.flatMap(p=>[...PAX_PRODUCTS.find(x=>x.id===p.productId)!.documents]));
      const q:DemoQuote={id:randomUUID(),recommendationId:rec.id,profileVersion:run.profileVersion,runId:run.id,createdAt:new Date().toISOString(),
        expiresAt:new Date(Date.now()+30*60_000).toISOString(),documents:docs.map(d=>({id:d.id,sha256:d.sha256})),
        configurations:selected,demo:true,legalEffect:'none',premiumCents:null,premiumStatus:'pax_tariff_api_unavailable'};
      c.quotes.push(q);return q;
    });
  }
  async application(actor:Actor,id:string,input:unknown) {
    this.customer(actor);const body=JourneyActionSchema.parse(input);
    return this.action(actor,id,'application_created',body,c=>{
      const run=this.current(c);const quote=c.quotes.find(q=>q.id===body.quoteId);
      if(!quote||quote.profileVersion!==run.profileVersion||quote.runId!==run.id)throw new WorkflowError('STALE_QUOTE');
      if(quote.expiresAt<=new Date().toISOString())throw new WorkflowError('QUOTE_EXPIRED');
      if(!body.informationDocumentsAcknowledged)throw new WorkflowError('INFORMATION_ACKNOWLEDGEMENT_REQUIRED',422);
      this.documentCheck(quote,body.acknowledgedDocumentIds);
      const existing=c.applications.find(a=>a.quoteId===quote.id&&a.status!=='declined');if(existing)return existing;
      const app:DemoApplication={id:randomUUID(),quoteId:quote.id,runId:run.id,profileVersion:run.profileVersion,createdAt:new Date().toISOString(),
        status:'draft',submittedAt:null,decisionBy:null,decisionAt:null,demo:true,coverageInForce:false};
      c.applications.push(app);return app;
    });
  }
  async submit(actor:Actor,id:string,input:unknown) {
    this.customer(actor);const body=JourneyActionSchema.parse(input);
    return this.action(actor,id,'application_submitted',body,c=>{
      const run=this.current(c);const app=c.applications.find(a=>a.id===body.applicationId);
      if(!app||app.profileVersion!==run.profileVersion||app.runId!==run.id)throw new WorkflowError('STALE_APPLICATION');
      if(!['draft','needs_information'].includes(app.status))throw new WorkflowError('INVALID_APPLICATION_TRANSITION');
      if(!body.informationDocumentsAcknowledged)throw new WorkflowError('INFORMATION_ACKNOWLEDGEMENT_REQUIRED',422);
      const quote=c.quotes.find(q=>q.id===app.quoteId)!;if(quote.expiresAt<=new Date().toISOString())throw new WorkflowError('QUOTE_EXPIRED');this.documentCheck(quote,body.acknowledgedDocumentIds);
      app.status='submitted';app.submittedAt=new Date().toISOString();return structuredClone(app);
    });
  }
  async startReview(actor:Actor,id:string,input:unknown) {
    if(actor.role!=='reviewer')throw new WorkflowError('FORBIDDEN',403);const body=JourneyActionSchema.parse(input);
    return this.action(actor,id,'application_review_started',body,c=>{
      const run=this.current(c);const app=c.applications.find(a=>a.id===body.applicationId);
      if(!app||app.runId!==run.id||app.status!=='submitted')throw new WorkflowError('INVALID_APPLICATION_TRANSITION');
      app.status='under_review';return structuredClone(app);
    });
  }
  async decide(actor:Actor,id:string,input:unknown) {
    if(actor.role!=='reviewer')throw new WorkflowError('FORBIDDEN',403);const body=DemoApplicationDecisionSchema.parse(input);
    const action={expectedCaseRevision:body.expectedCaseRevision,idempotencyKey:body.idempotencyKey,applicationId:body.applicationId,
      demoAcknowledged:true as const,informationDocumentsAcknowledged:true};
    // Decision and demo-checks are part of the fingerprint, including decline vs acceptance.
    return this.engine.edit(actor,id,undefined,(c,db)=>{
      const run=this.current(c);const key=`application_decision:${body.idempotencyKey}`;const fingerprint=sha256Json({...body,expectedCaseRevision:0});
      const previous=c.idempotency[key];if(previous){if(previous.fingerprint!==fingerprint)throw new WorkflowError('IDEMPOTENCY_CONFLICT');return previous.result as DemoApplication;}
      if(c.caseRevision!==action.expectedCaseRevision)throw new WorkflowError('VERSION_CONFLICT');
      const app=c.applications.find(a=>a.id===body.applicationId);
      if(!app||app.runId!==run.id||app.profileVersion!==run.profileVersion||app.status!=='under_review')throw new WorkflowError('INVALID_APPLICATION_TRANSITION');
      app.status=body.decision;app.decisionBy=actor.id;app.decisionAt=new Date().toISOString();
      c.idempotency[key]={fingerprint,result:structuredClone(app)};this.engine.touch(c,'demo_application_decided');this.engine.audit(db,actor,c,'demo_application_decided',body.decision);return app;
    });
  }
  async issuePolicy(actor:Actor,id:string,input:unknown) {
    if(actor.role!=='reviewer')throw new WorkflowError('FORBIDDEN',403);const body=JourneyActionSchema.parse(input);
    return this.action(actor,id,'policy_issued',body,c=>{
      const run=this.current(c);const app=c.applications.find(a=>a.id===body.applicationId);
      if(!app||app.runId!==run.id||app.profileVersion!==run.profileVersion||app.status!=='accepted_for_demo'||!app.decisionBy)throw new WorkflowError('APPLICATION_NOT_ACCEPTED');
      const existing=c.policies.find(p=>p.applicationId===app.id);if(existing)return existing;
      const quote=c.quotes.find(q=>q.id===app.quoteId)!;
      const policy:DemoPolicy={id:randomUUID(),applicationId:app.id,profileVersion:run.profileVersion,runId:run.id,issuedAt:new Date().toISOString(),
        demo:true,coverageInForce:false,legalEffect:'none',label:'DEMO – KEIN VERSICHERUNGSSCHUTZ',configuration:quote.configurations};
      c.policies.push(policy);return policy;
    });
  }
  portal(actor:Actor,id:string){
    const c=this.engine.caseFor(actor,id);if(actor.role==='advisor')throw new WorkflowError('FORBIDDEN',403);
    const current=c.confirmedVersions.at(-1)?.version??null;
    return {caseId:c.id,caseRevision:c.caseRevision,profileVersion:current,activeRunId:c.activeRunId,
      reviewTasks:c.reviewTasks.map(t=>({...t,current:t.profileVersion===current&&t.runId===c.activeRunId})),
      quotes:c.quotes.map(q=>({...q,stale:c.draftDirty||q.profileVersion!==current||q.runId!==c.activeRunId})),
      applications:c.applications.map(a=>({...a,stale:c.draftDirty||a.profileVersion!==current||a.runId!==c.activeRunId})),
      policies:c.policies.map(p=>({...p,adviceContextChanged:c.draftDirty||p.profileVersion!==current||p.runId!==c.activeRunId})),
      realInsuranceCoverage:false,paxContractIntegrationAvailable:false};
  }
}
