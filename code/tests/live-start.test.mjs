import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FakeVoiceGateway} from './helpers/voice-fixture.mjs';
import {client,demoApp} from './helpers/demo-http.mjs';

/**
 * The live configuration end to end over HTTP: a start without test data (an empty case), a
 * conversation that first sets up the person (age, employment rate), the customer's acceptance,
 * then the intake fields on that person. Only OpenAI is replaced.
 */
function fakeModel(setup,intake) {
  const requests=[];
  const transport=async request=>{
    requests.push(request);
    const name=request.tools[0].name;
    // The open profile questions (lab-questions.ts) are not part of these tests: no answers.
    const args=name==='submit_setup_facts'?setup.shift()??{age:{value:null,quote:''},employment_rate_percent:{value:null,quote:''}}:name==='submit_answers'?{answers:[]}:{observations:intake.shift()??[]};
    return {status:'completed',output:[{type:'function_call',name,arguments:JSON.stringify(args)}]};
  };
  return {transport,requests};
}


test('a live start is an empty case of its own, without the Mueller persona',async t=>{
  const f=await demoApp(t,{voice:{enabled:true,gateways:[new FakeVoiceGateway()]}});
  const persona=await f.current();
  assert.ok(persona.draft.financial,'the demo start keeps its persona');
  const live=await f.customer.call('POST','/api/demo/start',{locale:'de',empty:true});
  assert.equal(live.status,201,JSON.stringify(live.body));
  assert.notEqual(live.body.caseId,persona.id);
  f.customer.csrf=live.body.csrfToken;
  const empty=(await f.customer.call('GET',`/api/cases/${live.body.caseId}`)).body;
  assert.equal(empty.draft.financial,null);
  assert.equal(empty.draft.insurance,null);
  assert.deepEqual(empty.runs,[]);
  assert.deepEqual(empty.confirmedVersions,[]);
  const again=await f.customer.call('POST','/api/demo/start',{locale:'de',empty:true});
  assert.notEqual(again.body.caseId,live.body.caseId,'every live start is new');
});

test('the conversation sets up the person, then captures the intake fields on her',async t=>{
  const model=fakeModel(
    [{age:{value:null,quote:''},employment_rate_percent:{value:null,quote:''}},
     {age:{value:'34',quote:'ich bin 34'},employment_rate_percent:{value:'80',quote:'arbeite 80 Prozent'}}],
    [[{fieldId:'annual_gross_income_chf',quote:'95000 Franken brutto im Jahr',value:'95000',precision:'exact',period:'year',basis:'gross'}]]);
  const f=await demoApp(t,{demoStart:true,voice:{enabled:true,gateways:[new FakeVoiceGateway()]},modelExtraction:{enabled:true,transport:model.transport}});
  const started=await f.customer.call('POST','/api/demo/start',{locale:'de',empty:true});
  f.customer.csrf=started.body.csrfToken;
  const path=`/api/cases/${started.body.caseId}`;
  const current=async()=>(await f.customer.call('GET',path)).body;

  const notice=(await f.customer.call('GET','/api/extraction/privacy?locale=de')).body;
  let c=await current();
  assert.equal((await f.customer.call('POST',`${path}/extraction/consent`,{expectedCaseRevision:c.caseRevision,noticeVersion:notice.version,
    noticeHash:notice.noticeHash,dataClassification:'synthetic',allowSyntheticModelExtraction:true})).status,201);
  c=await current();
  const session=await f.customer.call('POST',`${path}/voice/sessions`,{messageId:'live_start',expectedCaseRevision:c.caseRevision,provider:'gpt-live',
    locale:'de',dataClassification:'synthetic',noticeVersion:'voice-synthetic-v1',allowExternalVoiceProcessing:true,sdp:'v=offer'});
  assert.equal(session.status,201,JSON.stringify(session.body));
  const sid=session.body.voiceSession.id;
  const say=async(text,personId)=>{
    const latest=await current(),messageId=`turn_${crypto.randomUUID()}`;
    await f.customer.call('POST',`${path}/voice/sessions/${sid}/turns`,{speaker:'customer',log:{schemaVersion:'1.0',messageId,caseId:latest.id,correlationId:sid,turnId:messageId,
      source:'voice',locale:'de',text,transcriptStatus:'final',dataClassification:'synthetic'}});
    const r=await f.customer.call('POST',`${path}/voice-lab/turns`,{mode:'live',voiceSessionId:sid,messageId,...(personId?{personId}:{})});
    assert.equal(r.status,201,JSON.stringify(r.body));
    return r.body.extraction;
  };

  // Not enough yet: the turn names what is missing and proposes nothing.
  const first=await say('Hallo, ich möchte über meine Vorsorge reden.');
  assert.equal(first.route,'setup');
  assert.deepEqual(first.setup.missing,['age','employment_rate_percent']);
  assert.equal(first.result.proposalBatch,null);

  // Age and employment rate: the case frame for one person, as a proposal.
  const second=await say('Ich bin 34 und ich arbeite 80 Prozent.');
  assert.deepEqual(second.setup.missing,[]);
  const batch=second.result.proposalBatch;
  assert.deepEqual(batch.changes.map(x=>x.path).sort(),['financial','insurance']);
  const frame=batch.changes.find(x=>x.path==='financial').value;
  assert.equal(frame.persons[0].birthYear,new Date().getUTCFullYear()-34);
  assert.equal(frame.persons[0].employmentRateBps,8000);
  assert.equal(frame.persons[0].income.value,null,'nothing invented');
  assert.equal((await current()).draft.financial,null,'speech alone changes nothing');

  // The customer's acceptance creates the person; the profile is not complete yet.
  const accepted=await f.customer.call('POST',`${path}/demo-accept`,{});
  assert.equal(accepted.status,201,JSON.stringify(accepted.body));
  assert.equal(accepted.body.accepted.length,1);
  assert.equal(accepted.body.profileVersion,null);
  assert.ok(accepted.body.missing.length>0,'names what the calculation still needs');
  c=await current();
  assert.equal(c.draft.financial.persons[0].id,'person_1');

  // From now on the intake fields land on that person.
  const income=await say('Ich verdiene 95000 Franken brutto im Jahr.','person_1');
  assert.equal(income.adapter,'model-v1');
  assert.ok(income.result.proposalBatch);
  await f.customer.call('POST',`${path}/demo-accept`,{});
  assert.equal((await current()).draft.insurance.persons[0].grossAnnualIncomeCents,9500000);

  // The Chat tab gets the whole conversation.
  const transcript=(await f.customer.call('GET',`${path}/voice/sessions/${sid}/transcript`)).body;
  assert.equal(transcript.turns.length,3);
  // Without personId once a person exists: refused.
  const refused=await f.customer.call('POST',`${path}/voice-lab/turns`,{mode:'live',voiceSessionId:sid,messageId:transcript.turns[2].log.messageId});
  assert.equal(refused.body.code,'PERSON_REFERENCE_MISMATCH');
});

test('without the extraction consent the setup asks for the screen instead of guessing',async t=>{
  const model=fakeModel([],[]);
  const f=await demoApp(t,{demoStart:true,voice:{enabled:true,gateways:[new FakeVoiceGateway()]},modelExtraction:{enabled:true,transport:model.transport}});
  const started=await f.customer.call('POST','/api/demo/start',{locale:'de',empty:true});
  f.customer.csrf=started.body.csrfToken;
  const path=`/api/cases/${started.body.caseId}`;
  const c=(await f.customer.call('GET',path)).body;
  const session=(await f.customer.call('POST',`${path}/voice/sessions`,{messageId:'no_consent',expectedCaseRevision:c.caseRevision,provider:'gpt-live',
    locale:'de',dataClassification:'synthetic',noticeVersion:'voice-synthetic-v1',allowExternalVoiceProcessing:true,sdp:'v=offer'})).body;
  const sid=session.voiceSession.id,messageId='turn_1';
  await f.customer.call('POST',`${path}/voice/sessions/${sid}/turns`,{speaker:'customer',log:{schemaVersion:'1.0',messageId,caseId:c.id,correlationId:sid,turnId:messageId,
    source:'voice',locale:'de',text:'Ich bin 40.',transcriptStatus:'final',dataClassification:'synthetic'}});
  const r=await f.customer.call('POST',`${path}/voice-lab/turns`,{mode:'live',voiceSessionId:sid,messageId});
  assert.deepEqual(r.body.extraction.result.issues.map(i=>i.code),['SETUP_NEEDS_MODEL']);
  assert.equal(model.requests.length,0,'nothing reaches the model');
});

test('a sentence spoken before the person existed is extracted again for the intake fields',async t=>{
  const model=fakeModel([{age:{value:'34',quote:'ich bin 34'},employment_rate_percent:{value:'80',quote:'arbeite 80 Prozent'}}],
    [[{fieldId:'annual_gross_income_chf',quote:'verdiene 95000 brutto im Jahr',value:'95000',precision:'exact',period:'year',basis:'gross'}]]);
  const f=await demoApp(t,{demoStart:true,voice:{enabled:true,gateways:[new FakeVoiceGateway()]},modelExtraction:{enabled:true,transport:model.transport}});
  const started=await f.customer.call('POST','/api/demo/start',{locale:'de',empty:true});
  f.customer.csrf=started.body.csrfToken;
  const path=`/api/cases/${started.body.caseId}`,current=async()=>(await f.customer.call('GET',path)).body;
  const notice=(await f.customer.call('GET','/api/extraction/privacy?locale=de')).body;
  let c=await current();
  await f.customer.call('POST',`${path}/extraction/consent`,{expectedCaseRevision:c.caseRevision,noticeVersion:notice.version,noticeHash:notice.noticeHash,dataClassification:'synthetic',allowSyntheticModelExtraction:true});
  c=await current();
  const sid=(await f.customer.call('POST',`${path}/voice/sessions`,{messageId:'replay',expectedCaseRevision:c.caseRevision,provider:'gpt-live',locale:'de',
    dataClassification:'synthetic',noticeVersion:'voice-synthetic-v1',allowExternalVoiceProcessing:true,sdp:'v=offer'})).body.voiceSession.id;
  const messageId='turn_all_in_one';
  await f.customer.call('POST',`${path}/voice/sessions/${sid}/turns`,{speaker:'customer',log:{schemaVersion:'1.0',messageId,caseId:c.id,correlationId:sid,turnId:messageId,
    source:'voice',locale:'de',text:'Also ich bin 34, ich arbeite 80 Prozent und verdiene 95000 brutto im Jahr.',transcriptStatus:'final',dataClassification:'synthetic'}});
  const setup=await f.customer.call('POST',`${path}/voice-lab/turns`,{mode:'live',voiceSessionId:sid,messageId});
  assert.ok(setup.body.extraction.result.proposalBatch,'the person');
  await f.customer.call('POST',`${path}/demo-accept`,{});
  // The same turn again, now for the person: the income is not lost.
  const again=await f.customer.call('POST',`${path}/voice-lab/turns`,{mode:'live',voiceSessionId:sid,messageId,personId:'person_1'});
  assert.equal(again.status,201,JSON.stringify(again.body));
  assert.equal(again.body.extraction.adapter,'model-v1');
  await f.customer.call('POST',`${path}/demo-accept`,{});
  assert.equal((await current()).draft.insurance.persons[0].grossAnnualIncomeCents,9500000);
});

test('a full store makes room for a new live start: new tabs and restarts never lock it',async t=>{
  const f=await demoApp(t,{voice:{enabled:true,gateways:[new FakeVoiceGateway()]}});
  const tabs=[];
  for(let i=0;i<30;i++){
    const tab=client(f.base),r=await tab.call('POST','/api/demo/start',{locale:'de',empty:true});
    assert.equal(r.status,201,`start ${i}: ${JSON.stringify(r.body)}`);
    tab.csrf=r.body.csrfToken;tabs.push({tab,caseId:r.body.caseId});
  }
  const cases=await f.runtime.store.view(db=>Object.keys(db.cases));
  assert.ok(cases.length<=25);
  assert.ok(cases.includes(tabs.at(-1).caseId),'the newest case stays');
  assert.ok(cases.includes(f.path.split('/').at(-1)),'the persona case is no live start and stays');
  assert.ok(!cases.includes(tabs[0].caseId),'the oldest live start went first');
  // Its tab is signed out, so it starts again instead of talking to a case that is gone.
  assert.equal((await tabs[0].tab.call('GET',`/api/cases/${tabs[0].caseId}`)).status,401);
});

test('a full store of cases with content still refuses a new one',async t=>{
  const f=await demoApp(t,{voice:{enabled:true,gateways:[new FakeVoiceGateway()]}});
  const persona=f.path.split('/').at(-1);
  await f.runtime.store.transaction(db=>{for(let i=0;i<24;i++){const id=crypto.randomUUID();db.cases[id]={...structuredClone(db.cases[persona]),id};}});
  const r=await client(f.base).call('POST','/api/demo/start',{locale:'de',empty:true});
  assert.equal(r.status,429);
  assert.equal(r.body.code,'CASE_CAPACITY');
});

test('checked after every answer: a confirmed profile without analyses (the calculator failed) is calculated at the next one',async t=>{
  const f=await demoApp(t,{voice:{enabled:true,gateways:[new FakeVoiceGateway()]}});
  const id=f.path.split('/').at(-1);
  // The persona case is confirmed; drop what the analyses produced, as if the calculator had failed.
  await f.runtime.store.transaction(db=>{const c=db.cases[id];Object.assign(c,{runs:[],activeRunId:null,latestAnalysisRequestId:null,graphContext:null,reviewTasks:[],recommendations:[],quotes:[],applications:[],policies:[],comparisons:[],estimates:[],toolRuns:[]});});
  assert.equal((await f.current()).runs.length,0);
  const retried=await f.customer.call('POST',`${f.path}/demo-accept`,{});
  assert.equal(retried.status,201,JSON.stringify(retried.body));
  assert.ok(retried.body.runs.length>0,'calculated now');
  // Nothing new: the next check runs nothing again.
  const again=await f.customer.call('POST',`${f.path}/demo-accept`,{});
  assert.deepEqual(again.body.runs,[]);
  assert.equal((await f.current()).runs.length,retried.body.runs.length);
});
