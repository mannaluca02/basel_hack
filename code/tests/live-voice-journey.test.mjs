import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLifeInsuranceApp} from '../apps/api/dist/insurance/app.js';
import {SyntheticTestProvider} from './helpers/life-fixture.mjs';
import {FakeVoiceGateway,voiceCredentials} from './helpers/voice-fixture.mjs';

/**
 * End to end, the way the web app's live voice (core/voice/live-voice.ts) drives the backend in
 * the demo start: public HTTP only, the same routes and bodies. Only OpenAI is substituted: the
 * GPT-Live gateway and the Responses transport of model-v1.
 */
async function demo(t,replies=[]) {
  const directory=await mkdtemp(join(tmpdir(),'pax-live-voice-'));
  const gateway=new FakeVoiceGateway(),requests=[];
  const transport=async request=>{
    requests.push(request);
    return {status:'completed',output:[{type:'function_call',name:'submit_intake_observations',arguments:JSON.stringify({observations:replies.shift()??[]})}]};
  };
  const {app}=await createLifeInsuranceApp({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials:voiceCredentials,
    demoStart:true,voice:{enabled:true,gateways:[gateway]},modelExtraction:{enabled:true,transport}});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  let cookie='',csrf='';
  async function call(method,path,body) {
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(method==='GET'?{}:{'X-CSRF-Token':csrf})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
    return {status:r.status,body:await r.json()};
  }
  const started=await call('POST','/api/demo/start',{locale:'de'});
  assert.equal(started.status,201,JSON.stringify(started.body));
  csrf=started.body.csrfToken;
  const path=`/api/cases/${started.body.caseId}`;
  return {call,path,gateway,requests,caseId:started.body.caseId,current:async()=>(await call('GET',path)).body};
}

const open=c=>c.proposalBatches.filter(b=>b.status==='proposed');
const income=(quote,chf)=>({fieldId:'annual_gross_income_chf',quote,value:String(chf),precision:'exact',period:'year',basis:'gross'});

/** Consent, then a voice session with the settings the app sends; returns turn helpers. */
async function startCall(f) {
  const notice=(await f.call('GET','/api/extraction/privacy?locale=de')).body;
  assert.equal(notice.enabled,true);
  let c=await f.current();
  const consent=await f.call('POST',`${f.path}/extraction/consent`,{expectedCaseRevision:c.caseRevision,noticeVersion:notice.version,noticeHash:notice.noticeHash,
    dataClassification:'synthetic',allowSyntheticModelExtraction:true});
  assert.equal(consent.status,201,JSON.stringify(consent.body));
  const settings=(await f.call('GET','/api/voice/settings')).body;
  c=await f.current();
  const session=await f.call('POST',`${f.path}/voice/sessions`,{messageId:`start_${crypto.randomUUID()}`,expectedCaseRevision:c.caseRevision,provider:'gpt-live',
    locale:c.locale,dataClassification:'synthetic',noticeVersion:'voice-synthetic-v1',allowExternalVoiceProcessing:true,sdp:'v=browser-offer',
    conversationSettings:{skillIds:settings.skills.map(s=>s.id),timeBudgetMinutes:10,priorities:[]}});
  assert.equal(session.status,201,JSON.stringify(session.body));
  const sid=session.body.voiceSession.id,personId=c.draft.financial.persons[0].id;
  const say=async(speaker,text)=>{
    const latest=await f.current(),messageId=`turn_${crypto.randomUUID()}`;
    const r=await f.call('POST',`${f.path}/voice/sessions/${sid}/turns`,{speaker,log:{schemaVersion:'1.0',messageId,caseId:latest.id,correlationId:sid,turnId:messageId,
      source:'voice',locale:latest.locale,text,transcriptStatus:'final',dataClassification:'synthetic'}});
    assert.equal(r.status,201,JSON.stringify(r.body));
    if(speaker!=='customer')return null;
    const x=await f.call('POST',`${f.path}/voice-lab/turns`,{mode:'live',voiceSessionId:sid,messageId,personId});
    assert.equal(x.status,201,JSON.stringify(x.body));
    return x.body;
  };
  return {sid,say,session:session.body};
}

test('demo start: what the customer says becomes a proposal, the Chat history, and after acceptance a recalculated profile',async t=>{
  const f=await demo(t,[[income('Ich verdiene 135000 Franken brutto im Jahr.',135000)]]);
  const before=await f.current();
  assert.equal(before.confirmedVersions.length,1,'the demo case starts confirmed and calculated');
  const runsBefore=before.runs.length;

  const privacy=(await f.call('GET','/api/voice/privacy?locale=de')).body;
  assert.equal(privacy.providers.find(p=>p.provider==='gpt-live').available,true,'the app shows its microphone button only then');
  const call=await startCall(f);
  assert.equal(call.session.connection.transport.sdp,'v=fake-provider-answer');
  assert.equal(f.gateway.opens.length,1);
  assert.match(f.gateway.opens[0].input.prompt,/Friendly conversation|friendly/i,'the selected skills reach the provider prompt');

  assert.equal(await call.say('agent','Hallo, ich bin Paxi. Erzählen Sie mir von Ihrer Arbeit?'),null);
  const heard=await call.say('customer','Ich verdiene 135000 Franken brutto im Jahr.');
  assert.equal(heard.extraction.adapter,'model-v1');
  assert.ok(heard.extraction.result.proposalBatch,'model-v1 proposes the sourced income');
  assert.equal(f.requests.length,1,'one model request per customer turn');

  const proposed=await f.current();
  assert.equal(open(proposed).length,1);
  assert.equal(open(proposed)[0].changes.find(c=>c.path.endsWith('grossAnnualIncomeCents')).value,13500000);
  assert.deepEqual(proposed.draft,before.draft,'speech alone never changes the draft');

  // The Chat tab: the app reads the sessions with turns, then each transcript.
  const sessions=(await f.call('GET',`${f.path}/voice/sessions`)).body.sessions;
  assert.deepEqual(sessions.map(s=>[s.id,s.turnCount]),[[call.sid,2]]);
  const transcript=(await f.call('GET',`${f.path}/voice/sessions/${call.sid}/transcript`)).body;
  assert.deepEqual(transcript.turns.map(t=>t.speaker),['agent','customer']);

  // The demo's acceptance card.
  const accepted=await f.call('POST',`${f.path}/demo-accept`,{});
  assert.equal(accepted.status,201,JSON.stringify(accepted.body));
  assert.equal(accepted.body.accepted.length,1);
  assert.equal(accepted.body.profileVersion,2);
  const after=await f.current();
  assert.equal(open(after).length,0);
  assert.equal(after.draftDirty,false);
  assert.equal(after.draft.insurance.persons[0].grossAnnualIncomeCents,13500000);
  assert.equal(after.runs.length,runsBefore+4,'the standard scenarios are recalculated');
  assert.ok(after.contextRevision>proposed.contextRevision,'the app reloads on the context event');

  const closed=await f.call('POST',`${f.path}/voice/sessions/${call.sid}/close`,{reason:'customer_closed'});
  assert.equal(closed.status,201,JSON.stringify(closed.body));
  assert.equal((await f.call('GET',`${f.path}/voice/sessions`)).body.sessions[0].status,'closed');
  assert.deepEqual(f.gateway.stops.length,1,'closing also stops the provider session');
});

test('the conversation keeps proposing after a confirmation, and acceptance without news changes nothing',async t=>{
  const f=await demo(t,[[income('Ich verdiene 120000 Franken brutto im Jahr.',120000)],[],[income('Korrektur: 118000 Franken brutto.',118000)]]);
  const call=await startCall(f);
  await call.say('customer','Ich verdiene 120000 Franken brutto im Jahr.');
  assert.equal((await f.call('POST',`${f.path}/demo-accept`,{})).body.profileVersion,2);

  const smalltalk=await call.say('customer','Schönes Wetter heute.');
  assert.equal(smalltalk.extraction.result.proposalBatch,null,'smalltalk proposes nothing');
  const unchanged=await f.call('POST',`${f.path}/demo-accept`,{});
  assert.deepEqual(unchanged.body.accepted,[]);
  assert.equal(unchanged.body.profileVersion,2,'no new profile version without an accepted change');

  const corrected=await call.say('customer','Korrektur: 118000 Franken brutto.');
  assert.ok(corrected.extraction.result.proposalBatch,'the session is still active after the confirmation');
  assert.equal((await f.call('POST',`${f.path}/demo-accept`,{})).body.profileVersion,3);
  assert.equal((await f.current()).draft.insurance.persons[0].grossAnnualIncomeCents,11800000);
});

test('a human handover ends the live conversation: no more turns, no more extraction',async t=>{
  const f=await demo(t,[[income('Ich verdiene 99000 Franken brutto im Jahr.',99000)]]);
  const call=await startCall(f);
  const c=await f.current();
  const handover=await f.call('POST',`${f.path}/handover`,{action:'request',messageId:`handover_${crypto.randomUUID()}`,expectedCaseRevision:c.caseRevision,source:'ui'});
  assert.equal(handover.status,201,JSON.stringify(handover.body));
  assert.equal(handover.body.handover.stopDigitalConversation,true);

  const latest=await f.current(),messageId=`turn_${crypto.randomUUID()}`;
  const turn=await f.call('POST',`${f.path}/voice/sessions/${call.sid}/turns`,{speaker:'customer',log:{schemaVersion:'1.0',messageId,caseId:latest.id,correlationId:call.sid,
    turnId:messageId,source:'voice',locale:latest.locale,text:'Ich verdiene 99000 Franken brutto im Jahr.',transcriptStatus:'final',dataClassification:'synthetic'}});
  assert.ok(turn.status>=400,'the stopped session refuses turns');
  assert.equal(f.requests.length,0,'nothing reaches the model');
  assert.equal(open(await f.current()).length,0);
});

test('demo-accept exists only in the demo start',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'pax-live-voice-nodemo-'));
  const {app}=await createLifeInsuranceApp({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials:voiceCredentials});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  const login=await (await fetch(`${base}/api/sessions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessCode:voiceCredentials.customerAccessCode})})).json();
  const r=await fetch(`${base}/api/cases/${crypto.randomUUID()}/demo-accept`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:`pax_session=${login.sessionToken}`,'X-CSRF-Token':login.csrfToken},body:'{}'});
  assert.equal(r.status,404);
});
