import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  InsuranceCaseDtoSchema,AdvisorContextSchema,AdvisorContextUpdatedSchema,VoiceLogSchema,
  DemoPolicySchema,SummaryBundleSchema,
} from '@pax/contracts';
import {createLifeRuntime} from '../apps/api/dist/insurance/runtime.js';
import {localizedCase} from '../apps/api/dist/insurance/i18n.js';
import {lifeDraft,SyntheticTestProvider} from './helpers/life-fixture.mjs';

const credentials={customerAccessCode:'shared-case-customer-key-at-least-32',reviewerAccessCode:'shared-case-reviewer-key-at-least-32'};
async function fixture(t,complete=true){
 const directory=await mkdtemp(join(tmpdir(),'pax-shared-contract-'));const r=await createLifeRuntime({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials});
 t.after(async()=>{await r.close();await rm(directory,{recursive:true,force:true});});
 const login=await r.sessions.login(credentials.customerAccessCode,'customer'),customer=r.sessions.authenticate(login.sessionToken);
 const staff=r.sessions.authenticate((await r.sessions.login(credentials.reviewerAccessCode,'staff')).sessionToken);
 let c=await r.engine.createCase(customer,{locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'});
 if(complete){c=await r.engine.patchDraft(customer,c.id,{...(await lifeDraft()),expectedCaseRevision:c.caseRevision});
   c=await r.engine.confirm(customer,c.id,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v2'});}
 const get=()=>r.engine.caseFor(customer,c.id);
 const calculate=()=>r.engine.analyze(customer,c.id,{expectedCaseRevision:get().caseRevision,expectedProfileVersion:1,scenarioVersionId:'shared_baseline',scenario:{kind:'baseline'}});
 return {r,directory,login,customer,staff,c,get,calculate};
}
test('the shared full-case DTO validates empty, confirmed and calculated states and excludes private storage',async t=>{
 const f=await fixture(t,false);let dto=localizedCase(f.get());assert.equal(dto.schemaVersion,'1.0');assert.equal(dto.draft.financial,null);assert.deepEqual(dto.toolRuns,[]);
 assert.ok(!Object.hasOwn(dto,'ownerId'));assert.ok(!Object.hasOwn(dto,'idempotency'));assert.equal(InsuranceCaseDtoSchema.safeParse({...dto,ownerId:'forged'}).success,false);
 let c=await f.r.engine.patchDraft(f.customer,f.c.id,{...(await lifeDraft()),expectedCaseRevision:f.get().caseRevision});
 c=await f.r.engine.confirm(f.customer,f.c.id,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v2'});
 const result=await f.calculate();dto=localizedCase(f.get());assert.equal(dto.activeRunId,result.run.id);assert.deepEqual(InsuranceCaseDtoSchema.parse(dto),dto);
 assert.equal(InsuranceCaseDtoSchema.safeParse({...dto,schemaVersion:'2.0'}).success,false);
});
test('the shared DTO rejects cross-case runs, missing active runs and contradictory profile references',async t=>{
 const f=await fixture(t);await f.calculate();const dto=localizedCase(f.get());
 for(const mutate of [d=>d.activeRunId='missing',d=>d.runs[0].local.caseId='foreign',d=>d.confirmedVersions[0].version=2,d=>d.presentation.locale='fr']){
   const broken=structuredClone(dto);mutate(broken);assert.equal(InsuranceCaseDtoSchema.safeParse(broken).success,false);
 }
});
test('recommendations, demo application and policy use the same shared types through every milestone',async t=>{
 const f=await fixture(t);const {run}=await f.calculate();const rec=await f.r.engine.recommendation(f.customer,f.c.id);
 await f.r.engine.reviewDecision(f.staff,f.c.id,{runId:run.id,decision:'approved_for_demo',acknowledgedReasonCodes:f.get().reviewTasks.at(-1).reasons,
   criteria:['data_sources_checked','need_and_units_checked','beneficiaries_checked','personal_affordability_checked','demo_only_understood']});
 const action=(key,extra={})=>({expectedCaseRevision:f.get().caseRevision,idempotencyKey:key,demoAcknowledged:true,informationDocumentsAcknowledged:true,...extra});
 const quote=await f.r.journey.quote(f.customer,f.c.id,action('quote',{recommendationId:rec.id,selectedCandidateIds:[rec.candidates[0].id]}));
 InsuranceCaseDtoSchema.parse(localizedCase(f.get()));const docs=quote.documents.map(d=>d.id);
 const application=await f.r.journey.application(f.customer,f.c.id,action('application',{quoteId:quote.id,acknowledgedDocumentIds:docs}));
 await f.r.journey.submit(f.customer,f.c.id,action('submit',{applicationId:application.id,acknowledgedDocumentIds:docs}));
 await f.r.journey.startReview(f.staff,f.c.id,action('start',{applicationId:application.id}));
 await f.r.journey.decide(f.staff,f.c.id,{expectedCaseRevision:f.get().caseRevision,applicationId:application.id,idempotencyKey:'decision',decision:'accepted_for_demo',demoChecks:{identity:'demo_only',health:'not_underwritten',aml:'not_cleared_for_real_business',information:true}});
 await f.r.journey.issuePolicy(f.staff,f.c.id,action('policy',{applicationId:application.id}));
 for(const locale of ['de','fr','it','en']){
   await f.r.engine.preferences(f.customer,f.c.id,{locale});const dto=InsuranceCaseDtoSchema.parse(localizedCase(f.get()));
   assert.equal(dto.presentation.locale,locale);assert.equal(dto.policies[0].coverageInForce,false);assert.equal(dto.quotes[0].premiumCents,null);
   assert.equal(DemoPolicySchema.safeParse({...dto.policies[0],coverageInForce:true}).success,false);
 }
});
test('agents receive a typed minimal context and cannot fetch the full-case aggregate',async t=>{
 const f=await fixture(t);await f.calculate();const grant=await f.r.sessions.agentToken(f.customer,f.c.id),agent=f.r.sessions.authenticate(grant.sessionToken);
 const context=AdvisorContextSchema.parse(f.r.engine.advisorContext(agent,f.c.id));assert.equal(context.caseId,f.c.id);assert.equal(context.progress.scope,'whole_life_intake');
 for(const key of ['draft','confirmedVersions','sessionHash','idempotency','ownerId'])assert.ok(!Object.hasOwn(context,key));
 assert.throws(()=>f.r.engine.caseFor(agent,f.c.id),e=>e.code==='NOT_FOUND');
 assert.equal(AdvisorContextSchema.safeParse({...context,sessionToken:grant.sessionToken}).success,false);
 assert.deepEqual(f.r.engine.advisorContext(f.staff,f.c.id).allowedActions,['read_context','record_review']);
});
test('the shared summary contract rejects differing customer and advisor financial values',async t=>{
 const f=await fixture(t);await f.calculate();const summary=SummaryBundleSchema.parse(f.r.dossier.bundle(f.customer,f.c.id));
 assert.equal(summary.schemaVersion,'1.0');const broken=structuredClone(summary);broken.advisor.metrics[0].value++;
 assert.equal(SummaryBundleSchema.safeParse(broken).success,false);
});
test('simultaneous shared-case edits use revisions and never silently overwrite each other',async t=>{
 const f=await fixture(t);const rev=f.get().caseRevision;const d1=structuredClone(f.get().draft),d2=structuredClone(d1);
 d1.financial.persons[0].income.value+=100;d2.financial.persons[0].income.value+=200;
 const results=await Promise.allSettled([f.r.engine.patchDraft(f.customer,f.c.id,{...d1,expectedCaseRevision:rev}),f.r.engine.patchDraft(f.customer,f.c.id,{...d2,expectedCaseRevision:rev})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'VERSION_CONFLICT');
 assert.equal(f.get().caseRevision,rev+1);InsuranceCaseDtoSchema.parse(localizedCase(f.get()));
});
const head={schemaVersion:'1.0',messageId:'message_1',caseId:'case_1',correlationId:'correlation_1',turnId:'turn_1'};
test('VoiceLog requires a final, explicitly synthetic transcript and does not accept raw audio',()=>{
 const log={...head,source:'voice',locale:'de',text:'Mein Einkommen hat sich geändert.',transcriptStatus:'final',dataClassification:'synthetic',expectedCaseRevision:1};
 assert.equal(VoiceLogSchema.parse(log).locale,'de');assert.equal(VoiceLogSchema.safeParse({...log,transcriptStatus:'partial'}).success,false);
 assert.equal(VoiceLogSchema.safeParse({...log,rawAudio:'bytes'}).success,false);
});
test('SSE events are bound to their exact case',()=>{
 const event={schemaVersion:'1.0',messageId:'event_1',caseId:'case_1',correlationId:'event_1',eventId:'event_1',contextRevision:2,reason:'analysis_ready',contextRef:'/api/cases/case_1/advisor/context',interruptPolicy:'if_current_answer_invalid'};
 AdvisorContextUpdatedSchema.parse(event);assert.equal(AdvisorContextUpdatedSchema.safeParse({...event,contextRef:'/api/cases/foreign/advisor/context'}).success,false);
});
