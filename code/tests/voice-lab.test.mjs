import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PRIVACY_NOTICE} from '@pax/contracts';
import {createLifeInsuranceApp} from '../apps/api/dist/insurance/app.js';
import {SyntheticTestProvider} from './helpers/life-fixture.mjs';
import {voiceCredentials,FakeVoiceGateway} from './helpers/voice-fixture.mjs';
import {lifeDraft} from './helpers/life-fixture.mjs';

test('authenticated synthetic dialogue routes real proposals to the canonical case; corrections replace pending values without confirming',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'pax-lab-'));
  const {app}=await createLifeInsuranceApp({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials:voiceCredentials});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  async function call(method,path,body,login){
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(login?{Cookie:`pax_session=${login.sessionToken}`,'X-CSRF-Token':login.csrfToken}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
  }
  const login=(await call('POST','/api/sessions',{accessCode:voiceCredentials.customerAccessCode})).body;
  const created=(await call('POST','/api/cases',{locale:'de',timeBudgetMinutes:30,noticeVersion:PRIVACY_NOTICE.version,dataClassification:'synthetic'},login)).body;
  const path=`/api/cases/${created.id}/voice-lab`;
  assert.equal((await call('POST',path+'/initialize',{expectedCaseRevision:created.caseRevision},login)).status,201);
  const turn={mode:'synthetic',sample:'income',messageId:'lab_income',personId:'person_demo_1'};
  assert.equal((await call('POST',path+'/turns',turn)).status,401);
  const first=await call('POST',path+'/turns',turn,login);
  assert.equal(first.status,201,JSON.stringify(first.body));assert.equal(first.body.extraction.adapter,'rules-v1');
  assert.equal(first.body.extraction.result.proposalBatch.changes[0].value,11900000);
  const replay=await call('POST',path+'/turns',turn,login);
  assert.equal(replay.body.extraction.result.proposalBatch.id,first.body.extraction.result.proposalBatch.id);
  const correction=await call('POST',path+'/turns',{...turn,sample:'correction',messageId:'lab_correction'},login);
  assert.equal(correction.status,201);
  const current=(await call('GET',`/api/cases/${created.id}`,undefined,login)).body;
  assert.equal(current.draft.insurance.persons[0].grossAnnualIncomeCents,12000000);
  assert.equal(current.confirmedVersions.length,0);
  assert.equal(current.proposalBatches[0].status,'superseded');
  assert.equal(current.proposalBatches[1].changes[0].value,11800000);
  async function confirm(target){
    const latest=(await call('GET',`/api/cases/${created.id}`,undefined,login)).body;
    const root=`/api/cases/${created.id}/customer-confirmations`;
    const response=await call('POST',root,{expectedCaseRevision:latest.caseRevision,target,channel:'screen',questionTurnId:crypto.randomUUID(),questionReplyId:crypto.randomUUID()},login);
    assert.equal(response.status,201,JSON.stringify(response.body));
    const q=response.body,binding={expectedCaseRevision:q.basisCaseRevision,questionId:q.questionId,questionHash:q.questionHash,questionTurnId:q.questionTurnId,questionReplyId:q.questionReplyId};
    const presented=await call('POST',`${root}/${q.id}/presented`,{...binding,reviewDisplayed:true,profileAndAssumptionsDisplayed:target.kind==='confirm_profile',privacyNoticeDisplayed:target.kind==='confirm_profile'},login);
    assert.equal(presented.status,201,JSON.stringify(presented.body));
    const outcome=await call('POST',`${root}/${q.id}/answer`,{...binding,channel:'screen',decision:'accept',answerMessageId:crypto.randomUUID()},login);
    assert.equal(outcome.status,201,JSON.stringify(outcome.body));
  }
  await confirm({kind:'accept_batch',batchId:current.proposalBatches[1].id});
  const accepted=(await call('GET',`/api/cases/${created.id}`,undefined,login)).body;
  assert.equal(accepted.draft.insurance.persons[0].grossAnnualIncomeCents,11800000);
  assert.equal(accepted.confirmedVersions.length,0);
  assert.deepEqual(accepted.draft.financial.persons[0].income,current.draft.financial.persons[0].income);
  await confirm({kind:'confirm_profile'});
  const confirmed=(await call('GET',`/api/cases/${created.id}`,undefined,login)).body;
  assert.equal(confirmed.confirmedVersions.at(-1).version,1);
  assert.equal(confirmed.draftDirty,false);
  const other=(await call('POST','/api/sessions',{accessCode:voiceCredentials.customerAccessCode})).body;
  assert.equal((await call('POST',path+'/turns',turn,other)).status,404);
  assert.equal((await call('POST',path+'/initialize',{expectedCaseRevision:current.caseRevision},login)).status,409);
});

test('live orchestrator consumes only an owned persisted customer transcript, preserves source binding and surfaces unsupported statements',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'pax-live-lab-'));
  const {app,runtime}=await createLifeInsuranceApp({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials:voiceCredentials,voice:{enabled:true,gateways:[new FakeVoiceGateway()]}});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  const login=await runtime.sessions.login(voiceCredentials.customerAccessCode,'lab-test'),actor=runtime.sessions.authenticate(login.sessionToken);
  let c=await runtime.engine.createCase(actor,{locale:'en',timeBudgetMinutes:30,noticeVersion:PRIVACY_NOTICE.version,dataClassification:'synthetic'});
  c=await runtime.engine.patchDraft(actor,c.id,{...await lifeDraft(),expectedCaseRevision:c.caseRevision});
  const start=await runtime.voice.start(actor,c.id,{messageId:'live-start',expectedCaseRevision:c.caseRevision,provider:'gpt-live',locale:'en',dataClassification:'synthetic',noticeVersion:'voice-synthetic-v1',allowExternalVoiceProcessing:true,sdp:'v=offer'}),sid=start.voiceSession.id;
  async function route(body,csrf=true){
    const r=await fetch(`${base}/api/cases/${c.id}/voice-lab/turns`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:`pax_session=${login.sessionToken}`,...(csrf?{'X-CSRF-Token':login.csrfToken}:{})},body:JSON.stringify(body)});
    return {status:r.status,body:await r.json()};
  }
  const input={mode:'live',voiceSessionId:sid,messageId:'income-source',personId:'person_demo_1'};
  assert.equal((await route(input,false)).status,403);
  assert.equal((await route(input)).body.code,'VOICE_SOURCE_NOT_FOUND');
  const log={schemaVersion:'1.0',messageId:'agent-example',caseId:c.id,correlationId:sid,turnId:'turn-1',source:'voice',locale:'en',text:'My annual gross income is 119000 CHF.',transcriptStatus:'final',dataClassification:'synthetic'};
  await runtime.voice.ingest(actor,c.id,sid,{speaker:'agent',log});
  assert.equal((await route({...input,messageId:'agent-example'})).body.code,'VOICE_SOURCE_NOT_FOUND');
  await runtime.voice.ingest(actor,c.id,sid,{speaker:'customer',log:{...log,messageId:'income-source'}});
  assert.equal((await route({...input,personId:'foreign-person'})).body.code,'PERSON_REFERENCE_MISMATCH');
  const result=await route(input);assert.equal(result.status,201,JSON.stringify(result.body));
  assert.equal(result.body.extraction.route,'VoiceIntegrationService.propose');
  assert.equal(result.body.extraction.request.observations[0].sourceMessageId,'income-source');
  assert.equal(result.body.extraction.result.proposalBatch.changes[0].value,11900000);
  assert.equal((await route(input)).body.extraction.result.replayed,true);
  assert.equal((await route({...input,personId:'person_demo_2'})).body.code,'IDEMPOTENCY_CONFLICT');
  await runtime.voice.ingest(actor,c.id,sid,{speaker:'customer',log:{...log,messageId:'approximate',text:'My annual gross income is about 119000 CHF.'}});
  const unsupported=await route({...input,messageId:'approximate'});
  assert.equal(unsupported.body.extraction.result.proposalBatch,null);
  assert.equal(unsupported.body.extraction.result.issues[0].code,'RULE_NOT_MATCHED');
  assert.equal(runtime.engine.caseFor(actor,c.id).proposalBatches.length,1);
  await runtime.handover.command(actor,c.id,{action:'request',messageId:'stop-lab',expectedCaseRevision:runtime.engine.caseFor(actor,c.id).caseRevision,source:'ui'});
  assert.equal((await route({...input,messageId:'approximate'})).body.code,'HUMAN_HANDOVER_ACTIVE');
});

test('demo preparation rejects goals-only and review-flag-only drafts without changing authored state',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'pax-lab-preserve-'));
  const {app}=await createLifeInsuranceApp({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials:voiceCredentials});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  async function call(method,path,body,login){
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(login?{Cookie:`pax_session=${login.sessionToken}`,'X-CSRF-Token':login.csrfToken}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
  }
  const login=(await call('POST','/api/sessions',{accessCode:voiceCredentials.customerAccessCode})).body;
  for(const patch of [
    {goals:[{id:'authored_retirement',kind:'retirement',targetMonth:'2050-01',priority:1,targetCapitalCents:1000000}]},
    {reviewFlags:['user_requested']},
  ]){
    const c=(await call('POST','/api/cases',{locale:'de',timeBudgetMinutes:30,noticeVersion:PRIVACY_NOTICE.version,dataClassification:'synthetic'},login)).body;
    const authored=await call('PATCH',`/api/cases/${c.id}/draft`,{...patch,expectedCaseRevision:c.caseRevision},login);
    assert.equal(authored.status,200,JSON.stringify(authored.body));
    const attempted=await call('POST',`/api/cases/${c.id}/voice-lab/initialize`,{expectedCaseRevision:authored.body.caseRevision},login);
    assert.equal(attempted.status,409,JSON.stringify(attempted.body));
    assert.equal(attempted.body.code,'LAB_REQUIRES_EMPTY_CASE');
    const after=(await call('GET',`/api/cases/${c.id}`,undefined,login)).body;
    assert.deepEqual(after.draft,authored.body.draft);
    assert.equal(after.caseRevision,authored.body.caseRevision);
    assert.deepEqual(after.confirmedVersions,[]);
  }
});
