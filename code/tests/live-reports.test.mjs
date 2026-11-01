import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FakeVoiceGateway} from './helpers/voice-fixture.mjs';
import {demoApp} from './helpers/demo-http.mjs';
import {OpenAiLiveGateway} from '../apps/api/dist/voice/providers.js';
import {REPORT_POLICY,liveDelegation} from '../apps/api/dist/voice/lab-delegation.js';

/**
 * GPT-Live's background model takes the notes (lab-delegation.ts): the session gets GPT-6 Luna with
 * the three extractions as tools, the browser sends their calls with the customer turn, and the
 * backend validates them like its own model output, without a model call of its own.
 */
class DelegatingGateway extends FakeVoiceGateway {
  async open(input,signal){return {...await super.open(input,signal),delegated:!!input.delegation};}
}
const call=(name,args)=>({name,arguments:typeof args==='string'?args:JSON.stringify(args)});

async function liveCase(t,voice={}) {
  const requests=[],gateway=new DelegatingGateway();
  const transport=async request=>{requests.push(request);return {status:'completed',output:[]};};
  const f=await demoApp(t,{demoStart:true,voice:{enabled:true,gateways:[gateway],reports:true,...voice},modelExtraction:{enabled:true,transport}});
  const started=await f.customer.call('POST','/api/demo/start',{locale:'de',empty:true});
  f.customer.csrf=started.body.csrfToken;
  const path=`/api/cases/${started.body.caseId}`,current=async()=>(await f.customer.call('GET',path)).body;
  const notice=(await f.customer.call('GET','/api/extraction/privacy?locale=de')).body;
  let c=await current();
  await f.customer.call('POST',`${path}/extraction/consent`,{expectedCaseRevision:c.caseRevision,noticeVersion:notice.version,noticeHash:notice.noticeHash,dataClassification:'synthetic',allowSyntheticModelExtraction:true});
  c=await current();
  const session=await f.customer.call('POST',`${path}/voice/sessions`,{messageId:'reports',expectedCaseRevision:c.caseRevision,provider:'gpt-live',locale:'de',
    dataClassification:'synthetic',noticeVersion:'voice-synthetic-v1',allowExternalVoiceProcessing:true,sdp:'v=offer'});
  assert.equal(session.status,201,JSON.stringify(session.body));
  const sid=session.body.voiceSession.id;
  const say=async(text,calls,personId,extra={})=>{
    const messageId=`turn_${crypto.randomUUID()}`;
    await f.customer.call('POST',`${path}/voice/sessions/${sid}/turns`,{speaker:'customer',log:{schemaVersion:'1.0',messageId,caseId:c.id,correlationId:sid,turnId:messageId,
      source:'voice',locale:'de',text,transcriptStatus:'final',dataClassification:'synthetic'}});
    const r=await f.customer.call('POST',`${path}/voice-lab/turns`,{mode:'live',voiceSessionId:sid,messageId,...(personId?{personId}:{}),...(calls?{report:{calls}}:{}),...extra});
    assert.equal(r.status,201,JSON.stringify(r.body));
    return r.body.extraction;
  };
  return {f,path,current,session:session.body,sid,gateway,requests,say};
}

test('the session hands turns to GPT-6 Luna with the setup and intake tools, and tells Paxi when',async t=>{
  const {session,gateway}=await liveCase(t);
  assert.equal(session.reports,true);
  const {delegation}=gateway.opens[0].input;
  assert.equal(delegation.policy,REPORT_POLICY);
  assert.equal(delegation.session.type,'responses');
  const responses=delegation.session.responses;
  assert.deepEqual([responses.model,responses.service_tier,responses.reasoning.effort],['gpt-6-luna','fast','medium']);
  assert.equal(responses.parallel_tool_calls,true);
  assert.deepEqual(responses.tools.map(tool=>tool.name),['submit_setup_facts','submit_intake_observations'],'no person yet');
  for(const tool of responses.tools)assert.doesNotMatch(tool.description,/Use only submit_/,'the background model calls every tool');
});

test('the background model\'s calls fill the case like the backend\'s own extraction, without a model call',async t=>{
  const {f,path,current,say,requests}=await liveCase(t);
  const setup=await say('Ich bin 34 und ich arbeite 80 Prozent.',[call('submit_setup_facts',{age:{value:'34',quote:'ich bin 34'},employment_rate_percent:{value:'80',quote:'arbeite 80 Prozent'}})]);
  assert.equal(setup.route,'setup');
  assert.equal(setup.delegated,true);
  assert.ok(setup.result.proposalBatch,'the person');
  await f.customer.call('POST',`${path}/demo-accept`,{});

  // With the person, the tools are the intake fields and the open profile questions.
  const {delegation}=(await f.customer.call('GET',`${path}/voice-lab/delegation?askedKey=insurance.relationship`)).body;
  const tools=delegation.responses.tools;
  assert.deepEqual(tools.map(tool=>tool.name),['submit_intake_observations','submit_answers']);
  const ids=tools[1].parameters.properties.answers.items.properties.id.enum;
  assert.ok(ids.includes('insurance.relationship'),ids.join());
  assert.match(tools[1].description,/"id":"insurance\.relationship"[^}]*"asked":true/);

  const income=await say('Ich verdiene 95000 Franken brutto im Jahr und bin verheiratet.',[
    call('submit_intake_observations',{observations:[{fieldId:'annual_gross_income_chf',quote:'95000 Franken brutto im Jahr',value:'95000',precision:'exact',period:'year',basis:'gross'}]}),
    call('submit_answers',{answers:[{id:'insurance.relationship',value:'married',period:null,quote:'bin verheiratet'}]})],'person_1');
  assert.equal(income.adapter,'model-v1');
  assert.equal(income.delegated,true);
  assert.ok(income.result.proposalBatch);
  assert.deepEqual(income.answers.answered,['insurance.relationship']);
  await f.customer.call('POST',`${path}/demo-accept`,{});
  const c=await current();
  assert.equal(c.draft.insurance.persons[0].grossAnnualIncomeCents,9500000);
  assert.equal(c.draft.insurance.relationship,'married');
  assert.equal(requests.length,0,'the backend called no model');
});

test('reported values are untrusted: unsaid quotes are dropped, broken calls cost the turn, not the call',async t=>{
  const {f,path,current,sid,say,requests}=await liveCase(t);
  await say('Ich bin 34 und ich arbeite 80 Prozent.',[call('submit_setup_facts',{age:{value:'34',quote:'ich bin 34'},employment_rate_percent:{value:'80',quote:'arbeite 80 Prozent'}})]);
  await f.customer.call('POST',`${path}/demo-accept`,{});

  const invented=await say('Das Wetter ist schön.',[call('submit_intake_observations',{observations:[{fieldId:'annual_gross_income_chf',quote:'120000 brutto im Jahr',value:'120000',precision:'exact',period:'year',basis:'gross'}]})],'person_1');
  assert.equal(invented.result.proposalBatch,null,'a value the person never said');
  const broken=await say('Ich verdiene 95000 brutto im Jahr.',[call('submit_intake_observations','{not json')],'person_1');
  assert.deepEqual(broken.result.issues.map(issue=>issue.code),['MODEL_EXTRACTION_FAILED']);
  // No report (GPT-Live did not hand the turn over): nothing extracted, and still no model call.
  const quiet=await say('Ich verdiene 95000 brutto im Jahr.',[],'person_1');
  assert.equal(quiet.result.proposalBatch,null);
  assert.equal((await current()).draft.insurance.persons[0].grossAnnualIncomeCents,null);
  assert.equal(requests.length,0);
  // A tool the background model does not have is refused outright.
  const unknown=await f.customer.call('POST',`${path}/voice-lab/turns`,{mode:'live',voiceSessionId:sid,messageId:'x',personId:'person_1',report:{calls:[{name:'set_language',arguments:'{}'}]}});
  assert.equal(unknown.status,400);
});

test('without reports the session has no background model and the backend reads the turn itself',async t=>{
  const {session,gateway,say,requests}=await liveCase(t,{reports:false});
  assert.equal(session.reports,false);
  assert.equal(gateway.opens[0].input.delegation,undefined);
  await say('Ich bin 34 und ich arbeite 80 Prozent.');
  assert.equal(requests.length,1,'the backend\'s own setup extraction');
});

const opened=()=>new Response(JSON.stringify({session:{id:'sess_1'},transport:{type:'webrtc',sdp:'v=answer'}}),{status:200});
const delegation={session:liveDelegation({financial:null,insurance:null,goals:[],reviewFlags:[]},[],'case'),policy:REPORT_POLICY};

test('GPT-Live gets the background model and Paxi the policy; a refused delegation keeps the voice and the emotions',async()=>{
  const calls=[];
  const live=await new OpenAiLiveGateway('key',undefined,undefined,async(url,init)=>{calls.push(JSON.parse(init.body));return opened();})
    .open({sdp:'v=offer',locale:'de',prompt:'Paxi.',delegation},new AbortController().signal);
  assert.equal(live.delegated,true);
  assert.deepEqual(calls[0].session.delegation,delegation.session);
  assert.equal(calls[0].session.instructions,`Paxi.${REPORT_POLICY}`);

  const retried=[];
  const fallback=await new OpenAiLiveGateway('key',undefined,undefined,async(url,init)=>{
    const body=JSON.parse(init.body);retried.push(body);
    return body.session.delegation?new Response(JSON.stringify({error:{message:'Responses delegation is not enabled for this project'}}),{status:403}):opened();
  }).open({sdp:'v=offer',locale:'de',prompt:'Paxi.',delegation},new AbortController().signal);
  assert.equal(retried.length,2);
  assert.equal(fallback.delegated,false);
  assert.equal(retried[1].session.delegation,undefined);
  assert.equal(retried[1].session.instructions,'Paxi.','no policy without the helper');
  assert.equal(retried[1].session.triggers.length,2,'the emotions stay');
});
