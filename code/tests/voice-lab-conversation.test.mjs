import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PRIVACY_NOTICE} from '@pax/contracts';
import {createLifeInsuranceApp} from '../apps/api/dist/insurance/app.js';
import {SyntheticTestProvider} from './helpers/life-fixture.mjs';
import {FakeVoiceGateway,voiceCredentials} from './helpers/voice-fixture.mjs';

/** Authenticated public HTTP only. Only the external model transport is substituted. */
async function lab(t,{locale='de',transport,enabled=!!transport}={}) {
  const directory=await mkdtemp(join(tmpdir(),'pax-lab-conversation-'));
  const {app}=await createLifeInsuranceApp({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials:voiceCredentials,
    voice:{enabled:true,gateways:[new FakeVoiceGateway()]},modelExtraction:{enabled,...(transport?{transport}:{})}});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  await app.listen(0,'127.0.0.1');const base=await app.getUrl();let login;
  async function call(method,path,body){
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(login?{Cookie:`pax_session=${login.sessionToken}`,'X-CSRF-Token':login.csrfToken}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r.status,body:await r.json()};
  }
  login=(await call('POST','/api/sessions',{accessCode:voiceCredentials.customerAccessCode})).body;
  const c=(await call('POST','/api/cases',{locale,timeBudgetMinutes:30,noticeVersion:PRIVACY_NOTICE.version,dataClassification:'synthetic'})).body;
  const path=`/api/cases/${c.id}`;
  assert.equal((await call('POST',`${path}/voice-lab/initialize`,{expectedCaseRevision:c.caseRevision})).status,201);
  const current=async()=>(await call('GET',path)).body;
  return {call,path,current,caseId:c.id,base,
    synthetic:(sample,messageId=sample)=>call('POST',`${path}/voice-lab/turns`,{mode:'synthetic',sample,messageId,personId:'person_demo_1'}),
    async consent(){
      const notice=(await call('GET','/api/extraction/privacy')).body,latest=await current();
      const granted=await call('POST',`${path}/extraction/consent`,{expectedCaseRevision:latest.caseRevision,noticeVersion:notice.noticeVersion??notice.version,noticeHash:notice.noticeHash,
        dataClassification:'synthetic',allowSyntheticModelExtraction:true});
      assert.equal(granted.status,201,JSON.stringify(granted.body));
    },
    async session(){
      const latest=await current();
      const started=await call('POST',`${path}/voice/sessions`,{messageId:crypto.randomUUID(),expectedCaseRevision:latest.caseRevision,provider:'gpt-live',locale,
        dataClassification:'synthetic',noticeVersion:'voice-synthetic-v1',allowExternalVoiceProcessing:true,sdp:'v=synthetic-offer'});
      assert.equal(started.status,201,JSON.stringify(started.body));
      const sid=started.body.voiceSession.id;
      return {sid,
        async say(speaker,text){
          const messageId=crypto.randomUUID();
          const r=await call('POST',`${path}/voice/sessions/${sid}/turns`,{speaker,log:{schemaVersion:'1.0',messageId,caseId:c.id,correlationId:sid,turnId:messageId,
            source:'voice',locale,text,transcriptStatus:'final',dataClassification:'synthetic'}});
          assert.equal(r.status,201,JSON.stringify(r.body));return messageId;
        },
        extract:messageId=>call('POST',`${path}/voice-lab/turns`,{mode:'live',voiceSessionId:sid,messageId,personId:'person_demo_1'}),
      };
    },
  };
}

const open=c=>c.proposalBatches.filter(b=>b.status==='proposed');
const changes=batch=>Object.fromEntries(batch.changes.map(x=>[x.path,x.value]));
/** Fake Responses API: one queued tool call per model request. */
function fakeModel(...replies){
  const requests=[];
  const transport=async request=>{
    // Open profile questions (lab-questions.ts) are covered by live-questions.test.mjs.
    if(request.tools[0].name==='submit_answers')return {status:'completed',output:[{type:'function_call',name:'submit_answers',arguments:'{"answers":[]}'}]};
    requests.push(request);
    const reply=replies.shift();
    if(reply instanceof Error)throw reply;
    return {status:'completed',output:[{type:'function_call',name:'submit_intake_observations',arguments:JSON.stringify({observations:reply??[]})}]};
  };
  return {transport,requests};
}
const observation=(fieldId,quote,value,extra={})=>({fieldId,quote,value,precision:'exact',period:null,basis:null,...extra});

test('authored whole conversation walks every field, keeps one open cumulative batch and fills the draft only after acceptance',async t=>{
  const f=await lab(t),baseline=await f.current();
  const expected=[
    ['intake_income_unclear',{}],
    ['intake_income_clarified',{'insurance.persons.0.grossAnnualIncomeCents':10000000}],
    ['intake_employment',{'financial.persons.0.employmentRateBps':8000}],
    ['smalltalk',{}],
    ['intake_civil_status',{'insurance.relationship':'married'}],
    ['intake_pension_fund',{'insurance.persons.0.withPillar2':true}],
    ['intake_pillar_3a',{'insurance.existingAnnualPillar3aContributionCents':700000}],
    ['intake_housing',{'financial.expenses.0.amount.value':220000,'financial.expenses.0.amount.period':'month'}],
    ['intake_retirement_age',{'insurance.persons.0.desiredWorkStopAge':63}],
    ['intake_risk',{'insurance.riskAppetite':'low'}],
    ['intake_correction',{'insurance.persons.0.grossAnnualIncomeCents':10200000}],
  ];
  const clarification=await f.synthetic('intake_income_unclear');
  assert.equal(clarification.status,201,JSON.stringify(clarification.body));
  assert.equal(clarification.body.extraction.adapter,'authored-script');
  assert.equal(clarification.body.extraction.result.proposalBatch,null);
  assert.deepEqual(clarification.body.extraction.clarifications,[{fieldId:'annual_gross_income_chf',quote:clarification.body.source.text,value:'100000',code:'AMBIGUOUS_VALUE'}]);
  assert.match(clarification.body.source.text,/verdiene 100.000 Franken/);
  assert.equal(open(await f.current()).length,0,'an unclear statement must not create a proposal');

  const accumulated={};
  for(const [sample,change] of expected.slice(1)){
    const turn=await f.synthetic(sample);
    assert.equal(turn.status,201,`${sample}: ${JSON.stringify(turn.body)}`);
    Object.assign(accumulated,change);
    const pending=open(await f.current());
    assert.equal(pending.length,1,`${sample}: exactly one open batch`);
    assert.deepEqual(changes(pending[0]),accumulated,sample);
  }
  const state=await f.current();
  assert.deepEqual(state.draft,baseline.draft,'speech never changes the draft');
  assert.deepEqual(state.confirmedVersions,[]);

  const root=`${f.path}/customer-confirmations`;
  const asked=await f.call('POST',root,{expectedCaseRevision:state.caseRevision,target:{kind:'accept_batch',batchId:open(state)[0].id},channel:'screen',questionTurnId:crypto.randomUUID(),questionReplyId:crypto.randomUUID()});
  assert.equal(asked.status,201,JSON.stringify(asked.body));
  const q=asked.body,binding={expectedCaseRevision:q.basisCaseRevision,questionId:q.questionId,questionHash:q.questionHash,questionTurnId:q.questionTurnId,questionReplyId:q.questionReplyId};
  assert.equal((await f.call('POST',`${root}/${q.id}/presented`,{...binding,reviewDisplayed:true,profileAndAssumptionsDisplayed:false,privacyNoticeDisplayed:false})).status,201);
  const accepted=await f.call('POST',`${root}/${q.id}/answer`,{...binding,channel:'screen',decision:'accept',answerMessageId:crypto.randomUUID()});
  assert.equal(accepted.status,201,JSON.stringify(accepted.body));
  const after=await f.current();
  assert.equal(after.draft.insurance.persons[0].grossAnnualIncomeCents,10200000);
  assert.equal(after.draft.financial.persons[0].employmentRateBps,8000);
  assert.equal(after.draft.financial.expenses[0].amount.value,220000);
  assert.equal(after.draft.insurance.riskAppetite,'low');
  assert.deepEqual(after.confirmedVersions,[],'profile confirmation stays a separate action');
});

for(const locale of ['en','fr','it'])test(`${locale}: authored conversation runs with localized customer text`,async t=>{
  const f=await lab(t,{locale});
  const turn=await f.synthetic('intake_income_clarified');
  assert.equal(turn.status,201,JSON.stringify(turn.body));
  assert.equal(turn.body.extraction.result.proposalBatch.changes[0].value,10000000);
  assert.doesNotMatch(turn.body.source.text,/brutto pro Jahr/i);
});

test('replaying a multi-field turn with a person-less change stays idempotent',async t=>{
  const f=await lab(t);
  await f.synthetic('intake_income_clarified');
  const first=await f.synthetic('intake_civil_status');
  const again=await f.synthetic('intake_civil_status');
  assert.equal(again.status,201,JSON.stringify(again.body));
  assert.equal(again.body.extraction.result.proposalBatch.id,first.body.extraction.result.proposalBatch.id);
});

test('live: "Ich verdiene 100.000 Franken" shows as clarification, the answer becomes one proposal and later fields accumulate',async t=>{
  const model=fakeModel(
    [observation('annual_gross_income_chf','100.000 Franken','100000')],
    [observation('annual_gross_income_chf','brutto im Jahr','100000',{period:'year',basis:'gross'})],
    [observation('employment_rate_percent','Vollzeit','100'),observation('civil_status','verheiratet','married')],
  );
  const f=await lab(t,{transport:model.transport});await f.consent();
  const live=await f.session();
  await live.say('agent','Wie viel verdienst du im Jahr, brutto?');
  const first=await live.extract(await live.say('customer','Ich verdiene 100.000 Franken'));
  assert.equal(first.status,201,JSON.stringify(first.body));
  assert.equal(first.body.extraction.adapter,'model-v1');
  assert.equal(first.body.extraction.result.proposalBatch,null);
  assert.deepEqual(first.body.extraction.clarifications,[{fieldId:'annual_gross_income_chf',quote:'100.000 Franken',value:'100000',code:'AMBIGUOUS_VALUE'}]);
  assert.equal(open(await f.current()).length,0);

  await live.say('agent','Ist das brutto im Jahr?');
  const id=await live.say('customer','Ja, brutto im Jahr');
  const second=await live.extract(id);
  assert.equal(second.status,201,JSON.stringify(second.body));
  assert.equal(second.body.extraction.route,'VoiceIntegrationService.propose');
  assert.deepEqual(second.body.extraction.request.observations,[{fieldId:'annual_gross_income_chf',personId:'person_demo_1',sourceMessageId:id,
    quote:'brutto im Jahr',value:'100000',precision:'exact',unit:'CHF',period:'year',basis:'gross'}]);
  assert.equal(second.body.extraction.result.proposalBatch.changes[0].value,10000000);

  await live.say('agent','Arbeitest du Vollzeit?');
  const third=await live.extract(await live.say('customer','Ja, Vollzeit und ich bin verheiratet'));
  assert.equal(third.status,201,JSON.stringify(third.body));
  const pending=open(await f.current());
  assert.equal(pending.length,1);
  assert.deepEqual(changes(pending[0]),{'insurance.persons.0.grossAnnualIncomeCents':10000000,'financial.persons.0.employmentRateBps':10000,'insurance.relationship':'married'});

  const request=model.requests[1],payload=JSON.stringify(request);
  assert.equal(request.tools[0].name,'submit_intake_observations');
  assert.equal(request.store,false);
  assert.ok(payload.includes('Ja, brutto im Jahr')&&payload.includes('Ist das brutto im Jahr?'),'conversation context reaches the model');
  for(const secret of [f.caseId,'person_demo_1','person_demo_2','12000000','basisDraftHash','expectedCaseRevision'])assert.equal(payload.includes(secret),false,`must not leak ${secret}`);
});

test('live model output is untrusted: invented quotes, unknown fields and agent statements create no proposal',async t=>{
  const model=fakeModel(
    [observation('annual_gross_income_chf','Mein Bruttojahreseinkommen ist 500000','500000',{period:'year',basis:'gross'})],
    [observation('full_name','Guten','Peter')],
  );
  const f=await lab(t,{transport:model.transport});await f.consent();
  const live=await f.session();
  await live.say('agent','Zum Beispiel: Mein Bruttojahreseinkommen ist 500000 Franken.');
  const invented=await live.extract(await live.say('customer','Das war nur dein Beispiel'));
  assert.equal(invented.status,201,JSON.stringify(invented.body));
  assert.deepEqual(invented.body.extraction.request.observations,[]);
  assert.equal(invented.body.extraction.result.proposalBatch,null);
  const unknown=await live.extract(await live.say('customer','Guten Morgen'));
  assert.equal(unknown.status,201,JSON.stringify(unknown.body));
  assert.equal(unknown.body.extraction.result.proposalBatch,null);
  assert.equal(open(await f.current()).length,0);
});

test('a failing model never ends the conversation; the next turn still works',async t=>{
  const model=fakeModel(new Error('provider down'),[observation('desired_retirement_age','mit 63','63')]);
  const f=await lab(t,{transport:model.transport});await f.consent();
  const live=await f.session();
  const failed=await live.extract(await live.say('customer','Ich höre mit 62 auf'));
  assert.equal(failed.status,201,JSON.stringify(failed.body));
  assert.equal(failed.body.extraction.result.proposalBatch,null);
  assert.equal(failed.body.extraction.result.issues[0].code,'MODEL_EXTRACTION_FAILED');
  const next=await live.extract(await live.say('customer','Ich höre mit 63 auf'));
  assert.equal(next.status,201,JSON.stringify(next.body));
  assert.equal(next.body.extraction.result.proposalBatch.changes[0].value,63);
});

test('a replayed live turn with a stored proposal makes no second model call',async t=>{
  const model=fakeModel([observation('risk_appetite','eher vorsichtig','low')]);
  const f=await lab(t,{transport:model.transport});await f.consent();
  const live=await f.session(),id=await live.say('customer','Ich bin eher vorsichtig');
  await live.extract(id);
  const replay=await live.extract(id);
  assert.equal(replay.status,201,JSON.stringify(replay.body));
  assert.equal(replay.body.extraction.result.replayed,true);
  assert.equal(model.requests.length,1);
});

test('without separate model consent the transport stays silent and rules-v1 handles the turn',async t=>{
  const model=fakeModel();
  const f=await lab(t,{transport:model.transport});
  const live=await f.session();
  const natural=await live.extract(await live.say('customer','Ich verdiene 100.000 Franken'));
  assert.equal(natural.status,201,JSON.stringify(natural.body));
  assert.equal(natural.body.extraction.adapter,'rules-v1');
  assert.equal(natural.body.extraction.result.issues[0].code,'RULE_NOT_MATCHED');
  assert.equal(model.requests.length,0);
  const exact=await live.extract(await live.say('customer','Mein Bruttojahreseinkommen beträgt 119000 CHF.'));
  assert.equal(exact.body.extraction.result.proposalBatch.changes[0].value,11900000);
});

test('human handover blocks the model before any transfer',async t=>{
  const model=fakeModel();
  const f=await lab(t,{transport:model.transport});await f.consent();
  const live=await f.session(),id=await live.say('customer','Ich verdiene 100.000 Franken');
  const latest=await f.current();
  assert.equal((await f.call('POST',`${f.path}/handover`,{action:'request',messageId:crypto.randomUUID(),expectedCaseRevision:latest.caseRevision,source:'ui'})).status,201);
  assert.equal((await live.extract(id)).body.code,'HUMAN_HANDOVER_ACTIVE');
  assert.equal(model.requests.length,0);
});

async function modelLab(t,...replies){
  const model=fakeModel(...replies),f=await lab(t,{transport:model.transport});await f.consent();
  return {f,model,live:await f.session()};
}
const say=async(live,text)=>(await live.extract(await live.say('customer',text))).body.extraction;

test('real model number formats are normalised: separators, currency, percent; unparseable money becomes a clarification',async t=>{
  const {f,live}=await modelLab(t,
    [observation('annual_gross_income_chf','100.000','100.000',{period:'year',basis:'gross'})],
    [observation('annual_gross_income_chf','100,000','100,000',{period:'year',basis:'gross'})],
    [observation('annual_gross_income_chf','CHF 100’000','CHF 100’000',{period:'year',basis:'gross'})],
    [observation('employment_rate_percent','80%','80%')],
    [observation('monthly_housing_cost_chf','2.200','2.200',{period:'month'})],
    [observation('pillar_3a_annual_contribution_chf','viel Geld','viel Geld')],
  );
  for(const text of ['Brutto im Jahr 100.000 Franken','Brutto im Jahr 100,000 Franken','Brutto im Jahr CHF 100’000 Franken']){
    const x=await say(live,text);
    assert.deepEqual(x.clarifications,[],text);
    assert.equal(x.result.proposalBatch.changes.find(c=>c.path==='insurance.persons.0.grossAnnualIncomeCents').value,10000000,text);
  }
  assert.equal((await say(live,'Ich arbeite 80%')).result.proposalBatch.changes.find(c=>c.path==='financial.persons.0.employmentRateBps').value,8000);
  assert.equal((await say(live,'Miete 2.200 im Monat')).result.proposalBatch.changes.find(c=>c.path==='financial.expenses.0.amount.value').value,220000);
  const unclear=await say(live,'Die Säule 3a ist viel Geld');
  assert.deepEqual(unclear.clarifications,[{fieldId:'pillar_3a_annual_contribution_chf',quote:'viel Geld',value:'viel Geld',code:'AMBIGUOUS_VALUE'}]);
  assert.equal(open(await f.current()).length,1,'earlier fields stay in the one open batch');
});

test('a value that fails the draft schema creates no proposal and reports DRAFT_INVALID',async t=>{
  const {f,live}=await modelLab(t,[observation('desired_retirement_age','mit 5','5')]);
  const x=await say(live,'Ich höre mit 5 auf');
  assert.equal(x.result.proposalBatch,null);
  assert.equal(x.result.issues[0].code,'DRAFT_INVALID');
  assert.equal(open(await f.current()).length,0);
});

test('an open batch with ambiguities that overlaps a turn reports OPEN_REVIEW_REQUIRED instead of failing',async t=>{
  const {f,live}=await modelLab(t,[observation('annual_gross_income_chf','100.000','100000',{period:'year',basis:'gross'})]);
  const agentLogin=(await f.call('POST',`${f.path}/agent-access`,{})).body,bearer={Authorization:`Bearer ${agentLogin.sessionToken}`,'Content-Type':'application/json'};
  const ctx=await (await fetch(f.base+`${f.path}/advisor/extractor-context`,{headers:bearer})).json();
  const src={messageId:'amb',turnId:'amb_turn',sourceRef:'synthetic:amb'};
  const made=await fetch(f.base+`${f.path}/advisor/proposal-batches`,{method:'POST',headers:bearer,body:JSON.stringify({messageId:'amb',source:src,expectedCaseRevision:ctx.caseRevision,expectedProfileVersion:ctx.profileVersion,basisDraftHash:ctx.draftHash,
    changes:[{path:'insurance.persons.0.grossAnnualIncomeCents',personId:'person_demo_1',value:10100000}],ambiguities:[{path:'financial.persons.0.employmentRateBps',personId:'person_demo_1',question:'Wie viel Prozent?',source:src}]})});
  assert.equal(made.status,201,JSON.stringify(await made.clone().json()));
  const x=await say(live,'Brutto im Jahr 100.000 Franken');
  assert.equal(x.result.proposalBatch,null);
  assert.equal(x.result.issues[0].code,'OPEN_REVIEW_REQUIRED');
});
