import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {HumanHandoverSchema,HumanHandoverViewSchema,HumanHandoverCommandResponseSchema,InsuranceCaseDtoSchema,AdvisorContextUpdatedSchema} from '@pax/contracts';
import {createLifeRuntime} from '../apps/api/dist/insurance/runtime.js';
import {createLifeInsuranceApp} from '../apps/api/dist/insurance/app.js';
import {localizedCase} from '../apps/api/dist/insurance/i18n.js';
import {lifeDraft,SyntheticTestProvider} from './helpers/life-fixture.mjs';
const credentials={customerAccessCode:'handover-customer-key-at-least-32-chars',reviewerAccessCode:'handover-reviewer-key-at-least-32-chars'};
async function fixture(t,options={}){
 const directory=await mkdtemp(join(tmpdir(),'pax-human-handover-'));let r=await createLifeRuntime({dataDirectory:directory,provider:options.provider??new SyntheticTestProvider(),providerMode:'test',credentials});
 t.after(async()=>{await r.close();await rm(directory,{recursive:true,force:true});});
 const customer=r.sessions.authenticate((await r.sessions.login(credentials.customerAccessCode,'customer')).sessionToken);
 const reviewer=r.sessions.authenticate((await r.sessions.login(credentials.reviewerAccessCode,'reviewer')).sessionToken);
 let c=await r.engine.createCase(customer,{locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'});
 if(options.complete!==false){c=await r.engine.patchDraft(customer,c.id,{...(await lifeDraft()),expectedCaseRevision:c.caseRevision});c=await r.engine.confirm(customer,c.id,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v2'});}
 const agent=r.sessions.authenticate((await r.sessions.agentToken(customer,c.id)).sessionToken),get=()=>r.engine.caseFor(customer,c.id);
 let counter=0;const command=(action,extra={})=>r.handover.command(customer,c.id,{action,messageId:`handover_${++counter}`,source:'ui',expectedCaseRevision:get().caseRevision,...extra});
 return {get r(){return r;},customer,agent,reviewer,id:c.id,directory,get,command,async restart(){await r.close();r=await createLifeRuntime({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials});}};
}
test('the persisted switch is identical in case, advisor context, extractor context and authorized handover view',async t=>{
 const f=await fixture(t),before=structuredClone(f.get().confirmedVersions);
 assert.equal(f.get().handover.wantsHumanAdvisor,false);const result=HumanHandoverCommandResponseSchema.parse(await f.command('request',{source:'voice'}));
 for(const h of [localizedCase(f.get()).handover,f.r.engine.advisorContext(f.agent,f.id).handover,f.r.extraction.context(f.agent,f.id).handover,f.r.handover.read(f.reviewer,f.id).handover])assert.deepEqual(h,result.handover);
 assert.equal(result.handover.wantsHumanAdvisor,true);assert.equal(result.handover.leaveViewRequested,true);assert.equal(result.handover.stopDigitalConversation,true);assert.equal(result.handover.source,'voice');
 assert.deepEqual(f.get().confirmedVersions,before);assert.equal(result.contact.phone,'+41612776666');assert.equal(result.contact.kind,'public_general_contact');assert.equal(result.contact.automaticDialing,false);assert.equal(result.contact.advisorAssigned,false);
 assert.ok(f.get().reviewTasks.some(r=>r.reasons.includes('USER_REQUESTED_HUMAN_ADVISOR')));InsuranceCaseDtoSchema.parse(localizedCase(f.get()));
 const ctx=f.r.engine.advisorContext(f.agent,f.id);assert.equal(ctx.maySpeakAmounts,false);assert.equal(ctx.nextQuestion,null);assert.deepEqual(ctx.allowedActions,['read_context']);
 await f.restart();assert.deepEqual(f.get().handover,result.handover);HumanHandoverViewSchema.parse(f.r.handover.read(f.agent,f.id));
});
test('only the customer can change intent, with revision guards and replay-safe current-state responses',async t=>{
 const f=await fixture(t);const input={action:'request',messageId:'request_once',source:'ui',expectedCaseRevision:f.get().caseRevision};
 const first=await f.r.handover.command(f.customer,f.id,input),rev=f.get().caseRevision,requestId=first.handover.requestId;
 const again=await f.r.handover.command(f.customer,f.id,input);assert.equal(again.command.replayed,true);assert.equal(f.get().caseRevision,rev);assert.equal(f.get().handover.requestId,requestId);
 await assert.rejects(f.r.handover.command(f.customer,f.id,{...input,action:'resume'}),e=>e.code==='IDEMPOTENCY_CONFLICT');
 await assert.rejects(f.command('resume',{expectedCaseRevision:1}),e=>e.code==='VERSION_CONFLICT');
 const resumed=await f.command('resume');assert.equal(resumed.handover.stopDigitalConversation,false);
 const oldRetry=await f.r.handover.command(f.customer,f.id,input);assert.equal(oldRetry.command.replayed,true);assert.equal(oldRetry.handover.wantsHumanAdvisor,false);assert.equal(f.get().handover.wantsHumanAdvisor,false);
 for(const actor of [f.agent,f.reviewer])await assert.rejects(f.r.handover.command(actor,f.id,{...input,messageId:'unauthorized'}),e=>e.code==='FORBIDDEN');
 const other=f.r.sessions.authenticate((await f.r.sessions.login(credentials.customerAccessCode,'other')).sessionToken);await assert.rejects(f.r.handover.command(other,f.id,{...input,messageId:'other'}),e=>e.code==='NOT_FOUND');assert.throws(()=>f.r.handover.read(other,f.id),e=>e.code==='NOT_FOUND');
});
test('repeat requests do not duplicate reviews/events and resume never implies a booked call or completed expert review',async t=>{
 const f=await fixture(t,{complete:false});await f.command('request');const rev=f.get().caseRevision,tasks=f.get().reviewTasks.length;
 const result=await f.command('request');assert.equal(result.command.changed,false);assert.equal(f.get().caseRevision,rev);assert.equal(f.get().reviewTasks.length,tasks);
 await f.command('resume');assert.equal(f.get().reviewTasks[0].status,'open');assert.equal(f.get().handover.status,'digital');assert.ok(f.get().handover.resumedAt);
 await f.command('request');assert.equal(f.get().handover.revision,3);assert.equal(f.get().reviewTasks.length,tasks);
 const invalid={...f.get().handover,wantsHumanAdvisor:false};assert.equal(HumanHandoverSchema.safeParse(invalid).success,false);
});
test('handover invalidates pending spoken confirmations and blocks digital writes, calculations and agent proposals until explicit resume',async t=>{
 const f=await fixture(t),x=f.r.extraction.context(f.agent,f.id);
 const batch=await f.r.extraction.proposeBatch(f.agent,f.id,{messageId:'income_change',source:{messageId:'income_change',turnId:'income_turn',sourceRef:'synthetic:income'},expectedCaseRevision:x.caseRevision,expectedProfileVersion:1,basisDraftHash:x.draftHash,changes:[{path:'insurance.persons.0.grossAnnualIncomeCents',personId:'person_demo_1',value:11900000}]});
 const question=await f.r.confirmations.create(f.customer,f.id,{expectedCaseRevision:f.get().caseRevision,target:{kind:'accept_batch',batchId:batch.id},channel:'voice',questionTurnId:'confirm_turn',questionReplyId:'confirm_reply'});
 await f.command('request');assert.equal(f.r.confirmations.get(f.customer,f.id,question.id).status,'invalidated');
 const tests=[()=>f.r.engine.patchDraft(f.customer,f.id,{expectedCaseRevision:f.get().caseRevision}),()=>f.r.engine.confirm(f.customer,f.id,{expectedCaseRevision:f.get().caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v2'}),
 ()=>f.r.engine.analyze(f.customer,f.id,{expectedCaseRevision:f.get().caseRevision,expectedProfileVersion:1,scenarioVersionId:'paused',scenario:{kind:'baseline'}}),()=>f.r.estimates.calculate(f.customer,f.id,{}),()=>f.r.tools.execute(f.customer,f.id,{}),
 ()=>f.r.advisory.propose(f.agent,f.id,{messageId:'legacy_paused',path:'goals.0.priority',value:1,expectedProfileVersion:1}),()=>f.r.extraction.proposeBatch(f.agent,f.id,{})];
 for(const work of tests)await assert.rejects(work,e=>e.code==='HUMAN_HANDOVER_ACTIVE');
 await f.r.engine.preferences(f.customer,f.id,{locale:'fr'});assert.equal(f.r.handover.read(f.customer,f.id).handover.wantsHumanAdvisor,true);
 await f.command('resume');await f.r.extraction.acceptBatch(f.customer,f.id,batch.id,{expectedCaseRevision:f.get().caseRevision,accept:true});assert.equal(f.get().draft.insurance.persons[0].grossAnnualIncomeCents,11900000);
});
for(const kind of ['analysis','estimate','additional_tool'])test(`${kind}: active provider work receives an abort and cannot commit after rapid handover/resume`,async t=>{
 let release,entered;const barrier=new Promise(r=>release=r),started=new Promise(r=>entered=r);let observedSignal,calls=0;
 class WaitingProvider extends SyntheticTestProvider {async execute(op,request,signal){calls++;observedSignal=signal;entered();await barrier;return super.execute(op,request);}}
 const f=await fixture(t,{provider:new WaitingProvider()});
 const work=kind==='analysis'?f.r.engine.analyze(f.customer,f.id,{expectedCaseRevision:f.get().caseRevision,expectedProfileVersion:1,scenarioVersionId:'late',scenario:{kind:'baseline'}}):kind==='estimate'?f.r.estimates.calculate(f.customer,f.id,{expectedCaseRevision:f.get().caseRevision,noticeVersion:'lifemap-synthetic-v2',allowSyntheticCalculatorTransfer:true,operations:['budgetProposal']}):f.r.tools.execute(f.customer,f.id,{expectedCaseRevision:f.get().caseRevision,noticeVersion:'lifemap-synthetic-v2',allowSyntheticCalculatorTransfer:true,requestUnits:'CHF_CENTS',operation:'taxBaseInfo',request:{}});
 const rejected=assert.rejects(work,e=>e.code==='DIGITAL_TASK_CANCELLED');await started;await f.command('request');assert.equal(observedSignal.aborted,true);const count=calls;await f.command('resume');release();await rejected;
 assert.equal(calls,count);assert.equal(f.get().runs.length,0);assert.equal(f.get().estimates.length,0);assert.equal(f.get().toolRuns?.length??0,0);assert.equal(f.get().latestAnalysisRequestId,null);
});
test('older encrypted cases gain an idle switch without losing their profile or private commands',async t=>{
 const f=await fixture(t),profiles=structuredClone(f.get().confirmedVersions);await f.r.store.transaction(db=>{delete db.cases[f.id].handover;});await f.restart();assert.equal(f.get().handover.status,'digital');assert.deepEqual(f.get().confirmedVersions,profiles);InsuranceCaseDtoSchema.parse(localizedCase(f.get()));
});
test('HTTP/SSE broadcasts immediate stop to the scoped agent, survives reconnect and leaves deletion available',{timeout:10000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'pax-handover-http-'));const {app}=await createLifeInsuranceApp({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials});
 t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});await app.listen(0,'127.0.0.1');const base=await app.getUrl();
 const call=async(method,path,token,body,headers={})=>{const r=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 const customer=(await call('POST','/api/sessions',null,{accessCode:credentials.customerAccessCode})).body;
 let c=(await call('POST','/api/cases',customer.sessionToken,{locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'})).body;
 const agent=(await call('POST',`/api/cases/${c.id}/agent-access`,customer.sessionToken,{})).body;
 const command={action:'request',messageId:'http_handover',expectedCaseRevision:c.caseRevision,source:'ui'};
 assert.equal((await call('POST',`/api/cases/${c.id}/handover`,null,command,{Cookie:`pax_session=${customer.sessionToken}`})).status,403);
 const controller=new AbortController(),response=await fetch(base+`/api/cases/${c.id}/advisor/events`,{headers:{Authorization:`Bearer ${agent.sessionToken}`},signal:controller.signal});const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
 const next=async()=>{for(;;){const index=buffer.indexOf('\n\n');if(index>=0){const event=buffer.slice(0,index);buffer=buffer.slice(index+2);const data=event.split('\n').find(line=>line.startsWith('data:'));if(data)return AdvisorContextUpdatedSchema.parse(JSON.parse(data.slice(5).trim()));}const chunk=await reader.read();if(chunk.done)throw new Error('Unexpected SSE close');buffer+=decoder.decode(chunk.value,{stream:true});}};
 t.after(()=>controller.abort());await next();
 const switched=await call('POST',`/api/cases/${c.id}/handover`,customer.sessionToken,command);assert.equal(switched.status,201);const event=await next();assert.equal(event.reason,'human_handover_requested');assert.equal(event.interruptPolicy,'immediate');assert.equal(event.handover.stopDigitalConversation,true);
 assert.equal((await call('GET',`/api/cases/${c.id}/handover`,agent.sessionToken)).body.handover.wantsHumanAdvisor,true);
 const blocked=await call('POST',`/api/cases/${c.id}/locations`,customer.sessionToken,{search:'Basel',allowSyntheticCalculatorTransfer:true});assert.equal(blocked.status,409);assert.equal(blocked.body.code,'HUMAN_HANDOVER_ACTIVE');
 controller.abort();await reader.cancel().catch(()=>{});
 const reconnectAbort=new AbortController(),reconnect=await fetch(base+`/api/cases/${c.id}/advisor/events`,{headers:{Authorization:`Bearer ${agent.sessionToken}`},signal:reconnectAbort.signal});const initial=await reconnect.body.getReader().read();assert.ok(decoder.decode(initial.value).includes('"stopDigitalConversation":true'));reconnectAbort.abort();
 const resumed=await call('POST',`/api/cases/${c.id}/handover`,customer.sessionToken,{action:'resume',messageId:'http_resume',expectedCaseRevision:switched.body.caseRevision,source:'ui'});assert.equal(resumed.status,201);
 const resumedAbort=new AbortController(),resumedStream=await fetch(base+`/api/cases/${c.id}/advisor/events`,{headers:{Authorization:`Bearer ${agent.sessionToken}`},signal:resumedAbort.signal});const resumedChunk=decoder.decode((await resumedStream.body.getReader().read()).value);assert.ok(resumedChunk.includes('\"stopDigitalConversation\":false'));assert.ok(resumedChunk.includes('\"interruptPolicy\":\"immediate\"'));resumedAbort.abort();
 assert.equal((await call('DELETE',`/api/cases/${c.id}`,customer.sessionToken)).status,200);
});
test('cancelling a calculation outside handover clears its running marker without changing the confirmed profile',async t=>{
 let release,entered;const barrier=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 class WaitingProvider extends SyntheticTestProvider {async execute(op,request){entered();await barrier;return super.execute(op,request);}}
 const f=await fixture(t,{provider:new WaitingProvider()}),controller=new AbortController();
 const work=f.r.engine.analyze(f.customer,f.id,{expectedCaseRevision:f.get().caseRevision,expectedProfileVersion:1,scenarioVersionId:'caller_cancel',scenario:{kind:'baseline'}},controller.signal);
 const rejected=assert.rejects(work,e=>e.code==='DIGITAL_TASK_CANCELLED');await started;controller.abort();release();await rejected;
 assert.equal(f.get().latestAnalysisRequestId,null);assert.equal(f.get().runs.length,0);assert.equal(f.get().confirmedVersions.length,1);assert.equal(f.get().events.at(-1).reason,'analysis_cancelled');
});

test('the published handover examples share an exact stop signal and contain no session or command-cache data',async()=>{
 const {readFile}=await import('node:fs/promises');const schemas={
  'handover-response':HumanHandoverCommandResponseSchema,'handover-resumed':HumanHandoverCommandResponseSchema,'context-updated':AdvisorContextUpdatedSchema,
 };
 const docs={};for(const [name,schema] of Object.entries(schemas)){
  const text=await readFile(new URL(`../fixtures/human-handover/${name}.v1.json`,import.meta.url),'utf8');assert.ok(!/"(?:ownerId|sessionHash|sessionToken|csrfToken|idempotency|confirmationRequests)"/.test(text));docs[name]=schema.parse(JSON.parse(text));
 }
 assert.deepEqual(docs['handover-response'].handover,docs['context-updated'].handover);assert.equal(docs['context-updated'].interruptPolicy,'immediate');assert.equal(docs['handover-resumed'].handover.wantsHumanAdvisor,false);assert.equal(docs['handover-response'].contact.automaticDialing,false);
});
