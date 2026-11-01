import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Controller,Get,Inject,UseGuards} from '@nestjs/common';
import {ExtractorContextSchema,InsuranceCaseDtoSchema,ProposalBatchInputSchema,ProposalBatchSchema,ProposalAcceptanceSchema} from '@pax/contracts';
import {createLifeRuntime,LIFE_RUNTIME} from '../apps/api/dist/insurance/runtime.js';
import {createLifeInsuranceApp} from '../apps/api/dist/insurance/app.js';
import {LifeSessionGuard} from '../apps/api/dist/insurance/http.js';
import {localizedCase} from '../apps/api/dist/insurance/i18n.js';
import {lifeDraft,SyntheticTestProvider} from './helpers/life-fixture.mjs';
const credentials={customerAccessCode:'extract-customer-key-at-least-32-chars',reviewerAccessCode:'extract-reviewer-key-at-least-32-chars'};
async function fixture(t,complete=true){
 const directory=await mkdtemp(join(tmpdir(),'pax-extraction-'));let r=await createLifeRuntime({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials});
 t.after(async()=>{await r.close();await rm(directory,{recursive:true,force:true});});
 const customer=r.sessions.authenticate((await r.sessions.login(credentials.customerAccessCode,'customer')).sessionToken);
 let c=await r.engine.createCase(customer,{locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'});
 const confirm=()=>r.engine.confirm(customer,c.id,{expectedCaseRevision:get().caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v2'});
 const get=()=>r.engine.caseFor(customer,c.id);
 if(complete){c=await r.engine.patchDraft(customer,c.id,{...(await lifeDraft()),expectedCaseRevision:c.caseRevision});await confirm();}
 const agent=r.sessions.authenticate((await r.sessions.agentToken(customer,c.id)).sessionToken);
 const ctx=()=>r.extraction.context(agent,c.id);
 const input=(messageId,changes,extra={})=>{const x=ctx();return {messageId,source:{messageId,turnId:`turn_${messageId}`,sourceRef:`synthetic:${messageId}`},expectedCaseRevision:x.caseRevision,expectedProfileVersion:x.profileVersion,basisDraftHash:x.draftHash,changes,...extra};};
 const change=(path,value)=>({path,value,...(path.includes('.persons.')?{personId:'person_demo_1'}:{})});
 const propose=(messageId,changes,extra)=>r.extraction.proposeBatch(agent,c.id,input(messageId,changes,extra));
 const accept=batch=>r.extraction.acceptBatch(customer,c.id,batch.id,{expectedCaseRevision:get().caseRevision,accept:true});
 return {get r(){return r;},get,ctx,input,change,propose,accept,confirm,customer,agent,id:c.id,directory,async restart(){await r.close();r=await createLifeRuntime({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials});}};
}
test('extractor projection exposes current field/person identities and versions, but no storage secrets or history',async t=>{
 const f=await fixture(t);const ctx=ExtractorContextSchema.parse(f.ctx());assert.equal(ctx.profileVersion,1);assert.equal(ctx.draft.financial.persons[0].id,ctx.personIds[0]);
 assert.equal(ctx.fields.find(x=>x.path==='financial.persons.0.income.value').confirmation,'confirmed');
 for(const key of ['ownerId','idempotency','sessionToken','confirmedVersions','runs'])assert.equal(Object.hasOwn(ctx,key),false);
 assert.equal(ctx.policy.noExternalAiTransferAuthorized,true);
 const other=f.r.sessions.authenticate((await f.r.sessions.login(credentials.customerAccessCode,'other')).sessionToken);
 assert.throws(()=>f.r.extraction.context(other,f.id),e=>e.code==='NOT_FOUND');
 assert.throws(()=>f.r.extraction.context(f.agent,'foreign'),e=>e.code==='NOT_FOUND');
 await f.r.sessions.revoke(f.customer);assert.throws(()=>f.ctx(),e=>e.code==='UNAUTHORIZED');
});
test('related changes are accepted once atomically, remain proposed, and confirm together as a new immutable profile',async t=>{
 const f=await fixture(t),before=structuredClone(f.get().confirmedVersions[0]);
 const batch=await f.propose('salary',[f.change('financial.persons.0.income.value',8300000),f.change('insurance.persons.0.grossAnnualIncomeCents',11900000)]);
 assert.equal(f.get().draft.financial.persons[0].income.value,8400000);const rev=f.get().caseRevision;
 const result=await f.accept(batch);assert.equal(result.caseRevision,rev+1);assert.equal(result.confirmationStillRequired,true);
 assert.equal(f.get().draft.financial.persons[0].income.confirmation,'proposed');assert.equal(f.get().draftDirty,true);
 assert.deepEqual(f.get().confirmedVersions[0],before);assert.equal(f.ctx().fields.find(x=>x.path==='insurance.persons.0.grossAnnualIncomeCents').confirmation,'proposed');
 await assert.rejects(f.r.engine.analyze(f.customer,f.id,{expectedProfileVersion:1,expectedCaseRevision:f.get().caseRevision,scenarioVersionId:'baseline',scenario:{kind:'baseline'}}),e=>e.code==='STALE_CONTEXT');
 await f.confirm();assert.equal(f.get().confirmedVersions.length,2);assert.equal(f.get().draft.financial.persons[0].income.confirmation,'confirmed');
 assert.equal(f.ctx().fields.find(x=>x.path==='insurance.persons.0.grossAnnualIncomeCents').confirmation,'confirmed');assert.deepEqual(f.get().confirmedVersions[0],before);
 InsuranceCaseDtoSchema.parse(localizedCase(f.get()));
});
test('invalid combined changes, forbidden targets, mismatched persons and stale bases never partially persist',async t=>{
 const f=await fixture(t),before=structuredClone(f.get());
 await assert.rejects(f.propose('invalid',[f.change('financial.persons.0.income.value',8200000),f.change('insurance.persons.0.protectionTermMonths',-1)]));
 assert.deepEqual(f.get(),before);
 for(const path of ['__proto__.role','financial.persons.0.id','financial.persons.0.income.confirmation','financial.persons.0.income.review','financial.persons.0.income.origin','ownerId']){
   await assert.rejects(f.propose('forbidden',[{path,value:'confirmed'}]),e=>e.code==='PATCH_PATH_FORBIDDEN');
 }
 await assert.rejects(f.propose('wrong_person',[{path:'financial.persons.0.income.value',value:1,personId:'person_demo_2'}]),e=>e.code==='PERSON_REFERENCE_MISMATCH');
 const stale=f.input('stale',[f.change('financial.persons.0.income.value',8200000)]);stale.basisDraftHash='a'.repeat(64);
 await assert.rejects(f.r.extraction.proposeBatch(f.agent,f.id,stale),e=>e.code==='STALE_PROPOSAL');assert.deepEqual(f.get(),before);
});
test('retries are idempotent, changed messages conflict and competing acceptances cannot overwrite',async t=>{
 const f=await fixture(t),input=f.input('retry',[f.change('financial.persons.0.income.value',8200000)]);
 const batch=await f.r.extraction.proposeBatch(f.agent,f.id,input),rev=f.get().caseRevision;
 assert.deepEqual(await f.r.extraction.proposeBatch(f.agent,f.id,input),batch);assert.equal(f.get().caseRevision,rev);
 await assert.rejects(f.r.extraction.proposeBatch(f.agent,f.id,{...input,changes:[f.change('financial.persons.0.income.value',8100000)]}),e=>e.code==='IDEMPOTENCY_CONFLICT');
 const result=await Promise.allSettled([f.accept(batch),f.accept(batch)]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(f.get().caseRevision,rev+1);assert.equal(f.get().draft.financial.persons[0].income.value,8200000);
});
test('corrections supersede complete open batches with reciprocal links and cannot rewrite accepted history',async t=>{
 const f=await fixture(t),changes=[f.change('financial.persons.0.income.value',8200000),f.change('insurance.persons.0.grossAnnualIncomeCents',11800000)];
 const old=await f.propose('old',changes);
 await assert.rejects(f.propose('missing_link',changes),e=>e.code==='SUPERSESSION_REQUIRED');
 await assert.rejects(f.propose('incomplete',[changes[0]],{supersedesBatchIds:[old.id]}),e=>e.code==='INCOMPLETE_SUPERSESSION');
 const next=await f.propose('correction',[f.change('financial.persons.0.income.value',8100000),changes[1]],{supersedesBatchIds:[old.id]});
 assert.equal(f.get().proposalBatches[0].status,'superseded');assert.equal(f.get().proposalBatches[0].replacedByBatchId,next.id);
 await assert.rejects(f.accept(old),e=>e.code==='PROPOSAL_NOT_OPEN');await f.accept(next);
 await assert.rejects(f.propose('cannot_replace',changes,{supersedesBatchIds:[next.id]}),e=>e.code==='PROPOSAL_NOT_OPEN');
 InsuranceCaseDtoSchema.parse(localizedCase(f.get()));
});
test('ambiguities have stable identities and provenance, persist, block confirmation and resolve with customer-accepted answers',async t=>{
 const f=await fixture(t),path='financial.persons.0.income.value';
 await f.propose('question',[],{ambiguities:[{path,personId:'person_demo_1',question:'Ist dieses Einkommen pro Monat oder Jahr?',source:{messageId:'question',turnId:'turn_question',sourceRef:'synthetic:question'}}]});
 const ambiguity=f.get().ambiguities[0];assert.equal(f.r.engine.advisorContext(f.agent,f.id).nextQuestion.text,ambiguity.question);await f.restart();assert.deepEqual(f.ctx().ambiguities[0],{...ambiguity,dialogueStatus:'needs_answer',answerBatchId:null});
 await assert.rejects(f.confirm(),e=>e.code==='UNRESOLVED_AMBIGUITIES');
 const batch=await f.propose('answer',[f.change(path,8100000)],{resolvesAmbiguityIds:[ambiguity.id]});
 assert.equal(f.get().ambiguities[0].status,'open');await f.accept(batch);assert.equal(f.get().ambiguities[0].status,'resolved');assert.equal(f.get().ambiguities[0].resolvedByBatchId,batch.id);
 await f.confirm();InsuranceCaseDtoSchema.parse(localizedCase(f.get()));
});
test('empty cases can initialize financial and insurance structures in one validated batch without granting confirmation',async t=>{
 const f=await fixture(t,false),draft=await lifeDraft();assert.equal(f.ctx().profileVersion,null);
 const batch=await f.propose('initialize',[{path:'financial',value:draft.financial},{path:'insurance',value:draft.insurance},{path:'goals_add',value:draft.goals[0]}]);
 await f.accept(batch);assert.equal(f.get().draft.financial.caseId,f.id);assert.equal(f.get().draft.financial.persons[0].income.confirmation,'proposed');
 await f.confirm();assert.equal(f.get().confirmedVersions.length,1);
 await assert.rejects(f.propose('replace_all',[{path:'financial',value:draft.financial}]),e=>e.code==='INITIALIZATION_ONLY');
});
test('draft edits invalidate whole batches before acceptance and invalid cross-reference DTOs are rejected',async t=>{
 const f=await fixture(t),batch=await f.propose('edit',[f.change('financial.persons.0.income.value',8100000)]);
 const draft=structuredClone(f.get().draft);draft.insurance.sharedChildren=1;
 await f.r.engine.patchDraft(f.customer,f.id,{...draft,expectedCaseRevision:f.get().caseRevision});
 await assert.rejects(f.accept(batch),e=>e.code==='STALE_PROPOSAL');assert.equal(f.get().proposalBatches[0].status,'proposed');
 const dto=localizedCase(f.get());dto.proposalBatches[0].status='superseded';dto.proposalBatches[0].replacedByBatchId='missing';
 assert.equal(InsuranceCaseDtoSchema.safeParse(dto).success,false);
});
test('HTTP extraction routes, OpenAPI and optional Nest feature modules share the existing authenticated runtime',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'pax-extraction-http-'));
 class FeatureController {constructor(runtime){this.runtime=runtime;} check(){return {sameRuntime:!!this.runtime.extraction};}}
 Controller('api/test-feature')(FeatureController);Inject(LIFE_RUNTIME)(FeatureController,undefined,0);UseGuards(LifeSessionGuard)(FeatureController);
 Get()(FeatureController.prototype,'check',Object.getOwnPropertyDescriptor(FeatureController.prototype,'check'));
 const {app,runtime}=await createLifeInsuranceApp({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials},[{module:class FeatureModule{},controllers:[FeatureController]}]);
 t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});await app.listen(0,'127.0.0.1');const base=await app.getUrl();
 const call=async(method,path,token,body)=>{const res=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};};
 const customer=(await call('POST','/api/sessions',null,{accessCode:credentials.customerAccessCode})).body;
 const c=(await call('POST','/api/cases',customer.sessionToken,{locale:'fr',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'})).body;
 const agent=(await call('POST',`/api/cases/${c.id}/agent-access`,customer.sessionToken,{})).body;
 assert.equal((await call('GET','/api/test-feature')).status,401);assert.equal((await call('GET','/api/test-feature',customer.sessionToken)).body.sameRuntime,true);
 const path=`/api/cases/${c.id}/advisor/extractor-context`;assert.equal((await call('GET',path)).status,401);
 const ctx=ExtractorContextSchema.parse((await call('GET',path,agent.sessionToken)).body);assert.equal(ctx.locale,'fr');
 const messageId='http_question',input={messageId,source:{messageId,turnId:'http_turn',sourceRef:'synthetic:http'},expectedCaseRevision:ctx.caseRevision,expectedProfileVersion:null,basisDraftHash:ctx.draftHash,changes:[],ambiguities:[{path:'financial',question:'Quel revenu ?',source:{messageId,turnId:'http_turn',sourceRef:'synthetic:http'}}]};
 const proposed=await call('POST',`/api/cases/${c.id}/advisor/proposal-batches`,agent.sessionToken,input);assert.equal(proposed.status,201);ProposalBatchSchema.parse(proposed.body);
 const openapi=(await call('GET','/api/openapi.json')).body;assert.ok(openapi.paths['/api/cases/{caseId}/advisor/extractor-context']);assert.ok(openapi.components.schemas.ExtractorContext);
 assert.equal(ProposalBatchInputSchema.safeParse({...input,changes:[{path:'insurance.relationship',value:'single'},{path:'insurance.relationship',value:'married'}]}).success,false);
});

test('open extraction ambiguities withhold spoken facts and block new advice calculations until resolved',async t=>{
 const f=await fixture(t);await f.r.engine.analyze(f.customer,f.id,{expectedProfileVersion:1,expectedCaseRevision:f.get().caseRevision,scenarioVersionId:'before_ambiguity',scenario:{kind:'baseline'}});
 assert.equal(f.r.engine.advisorContext(f.agent,f.id).maySpeakAmounts,true);
 await f.propose('uncertain',[],{ambiguities:[{path:'financial.persons.0.income.value',personId:'person_demo_1',question:'Welche Zahl stimmt?',source:{messageId:'uncertain',turnId:'turn_uncertain',sourceRef:'synthetic:uncertain'}}]});
 const context=f.r.engine.advisorContext(f.agent,f.id);assert.equal(context.maySpeakAmounts,false);assert.equal(context.runId,null);assert.equal(context.nextQuestion.text,'Welche Zahl stimmt?');
 await assert.rejects(f.r.engine.recommendation(f.customer,f.id),e=>e.code==='UNRESOLVED_AMBIGUITIES');
 await assert.rejects(f.r.engine.analyze(f.customer,f.id,{expectedProfileVersion:1,expectedCaseRevision:f.get().caseRevision,scenarioVersionId:'blocked',scenario:{kind:'baseline'}}),e=>e.code==='UNRESOLVED_AMBIGUITIES');
 await f.r.engine.preferences(f.customer,f.id,{locale:'fr'});assert.notEqual(f.r.engine.advisorContext(f.agent,f.id).nextQuestion.text,'Welche Zahl stimmt?');assert.equal(f.ctx().ambiguities[0].locale,'de');
});
test('committed extraction examples form one validated two-step confirmation journey without credentials',async()=>{
 const schemas={'extractor-context':ExtractorContextSchema,'proposal-batch-input':ProposalBatchInputSchema,'proposal-batch':ProposalBatchSchema,'proposal-acceptance':ProposalAcceptanceSchema,'context-before-confirmation':ExtractorContextSchema,'context-after-confirmation':ExtractorContextSchema};
 const docs={};for(const [name,schema] of Object.entries(schemas)){
  const text=await readFile(new URL(`../fixtures/extraction/${name}.v1.json`,import.meta.url),'utf8');assert.ok(!/"(?:ownerId|sessionToken|csrfToken|sessionHash|idempotency)"/.test(text));docs[name]=schema.parse(JSON.parse(text));
 }
 assert.equal(docs['proposal-batch-input'].basisDraftHash,docs['extractor-context'].draftHash);assert.equal(docs['proposal-batch'].basisDraftHash,docs['extractor-context'].draftHash);
 assert.equal(docs['context-before-confirmation'].draft.financial.persons[0].income.confirmation,'proposed');assert.equal(docs['context-after-confirmation'].draft.financial.persons[0].income.confirmation,'confirmed');
 assert.equal(docs['context-after-confirmation'].profileVersion,docs['extractor-context'].profileVersion+1);
});
test('pre-extension encrypted cases acquire empty workflow lists on restart without losing the confirmed profile',async t=>{
 const f=await fixture(t),before=structuredClone(f.get().confirmedVersions);
 await f.r.store.transaction(db=>{delete db.cases[f.id].proposalBatches;delete db.cases[f.id].ambiguities;});
 await f.restart();assert.deepEqual(f.get().proposalBatches,[]);assert.deepEqual(f.get().ambiguities,[]);assert.deepEqual(f.get().confirmedVersions,before);
 ExtractorContextSchema.parse(f.ctx());InsuranceCaseDtoSchema.parse(localizedCase(f.get()));
});
