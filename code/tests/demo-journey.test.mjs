import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLifeInsuranceApp } from '../apps/api/dist/insurance/app.js';
import { personaDraft,standardScenarios } from '../apps/api/dist/insurance/demo-journey.js';
import { SyntheticTestProvider } from './helpers/life-fixture.mjs';

const credentials={customerAccessCode:'demo-customer-key-at-least-32-characters',reviewerAccessCode:'demo-reviewer-key-at-least-32-characters'};
let app,base,directory,customer;
async function request(method,path,token,body) {
  const response=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json()};
}
before(async()=>{
  directory=await mkdtemp(join(tmpdir(),'pax-demo-journey-'));
  ({app}=await createLifeInsuranceApp({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials}));
  await app.listen(0,'127.0.0.1');base=await app.getUrl();
  customer=(await request('POST','/api/sessions',null,{accessCode:credentials.customerAccessCode})).body;
});
after(async()=>{await app?.close();await rm(directory,{recursive:true,force:true});});

test('the Mueller persona keeps the stated Pax facts and marks every completion as an assumption',async()=>{
  const draft=await personaDraft('mueller');
  assert.deepEqual(draft.financial.persons.map(p=>[p.birthYear,p.employmentRateBps]),[[1984,10000],[1986,0]]);
  assert.equal(draft.insurance.persons[0].grossAnnualIncomeCents,10000000);
  assert.equal(draft.financial.assets.reduce((sum,a)=>sum+a.amount.value,0),2000000);
  assert.equal(draft.insurance.relationship,'married');
  assert.equal(draft.insurance.children.length,1);
  const refs=[...draft.financial.persons.map(p=>p.income),...draft.financial.expenses.map(e=>e.amount),...draft.financial.provisions.map(p=>p.amount)].map(a=>a.sourceRef);
  for(const ref of refs)assert.match(ref,/^(persona:pax-mueller|assumption:mueller):/);
});

test('standard scenarios come from the profile itself and end with the baseline',async()=>{
  const draft=await personaDraft('mueller');
  const scenarios=standardScenarios(draft,new Date('2026-10-31T12:00:00Z'));
  assert.deepEqual(scenarios.map(s=>s.scenario.kind),['family','home','retirement','baseline']);
  const retirement=scenarios.find(s=>s.scenario.kind==='retirement').scenario;
  assert.equal(retirement.startMonth,'2026-10');
  assert.deepEqual(retirement.persons.map(p=>p.pensionStartsMonth),['2049-01','2050-01']);
  assert.equal(retirement.persons[0].pillar2MonthlyCents,250000);
  assert.equal(retirement.monthlyNeedCents,600000);
});

test('a loaded persona stays a draft until the customer confirms, then the standard analyses run',async()=>{
  let c=(await request('POST','/api/cases',customer.sessionToken,{locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'})).body;
  const loaded=await request('POST',`/api/cases/${c.id}/demo-profile`,customer.sessionToken,{persona:'mueller',expectedCaseRevision:c.caseRevision});
  assert.equal(loaded.status,201);assert.equal(loaded.body.draftDirty,true);assert.equal(loaded.body.confirmedVersions.length,0);
  const early=await request('POST',`/api/cases/${c.id}/standard-analyses`,customer.sessionToken,{expectedProfileVersion:1});
  assert.equal(early.status,409);
  c=(await request('POST',`/api/cases/${c.id}/confirmations`,customer.sessionToken,{expectedCaseRevision:loaded.body.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v2'})).body;
  const result=await request('POST',`/api/cases/${c.id}/standard-analyses`,customer.sessionToken,{expectedProfileVersion:1});
  assert.equal(result.status,201,JSON.stringify(result.body));
  assert.deepEqual(result.body.runs.map(r=>r.scenarioVersionId),['standard_family_v1','standard_home_v1','standard_retirement_v1','standard_baseline_v1']);
  // Mueller pays no 3a yet: the estimate uses the legal maximum from the baseline run until 2049.
  assert.deepEqual(result.body.pillar3a,{status:'calculated',years:2049-new Date().getUTCFullYear(),initialCents:0,annualCents:725800});
  const after=(await request('GET',`/api/cases/${c.id}`,customer.sessionToken)).body;
  assert.equal(after.activeRunId,result.body.runs.at(-1).runId);
  assert.ok(after.estimates.at(-1).results.some(r=>r.operation==='saving3a'&&r.metrics.some(m=>m.id==='GrossCapital')));
  assert.ok(after.runs.find(r=>r.scenario.kind==='retirement').timeline.periods.length>12);
});

test('a separate voice agent proposes quoted observations as one unconfirmed package',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'pax-external-voice-'));
  const {app:voiceApp}=await createLifeInsuranceApp({dataDirectory:dir,provider:new SyntheticTestProvider(),providerMode:'test',credentials,voice:{enabled:true}});
  try{
    await voiceApp.listen(0,'127.0.0.1');const url=await voiceApp.getUrl();
    const call=async(method,path,token,body)=>{const r=await fetch(url+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};};
    const owner=(await call('POST','/api/sessions',null,{accessCode:credentials.customerAccessCode})).body;
    let c=(await call('POST','/api/cases',owner.sessionToken,{locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'})).body;
    c=(await call('POST',`/api/cases/${c.id}/demo-profile`,owner.sessionToken,{persona:'mueller',expectedCaseRevision:c.caseRevision})).body;
    const grant=(await call('POST',`/api/cases/${c.id}/agent-access`,owner.sessionToken,{})).body;
    const context=(await call('GET',`/api/cases/${c.id}/advisor/extractor-context`,grant.sessionToken)).body;
    const body={messageId:'paxi_obs_1',conversationId:'conv_1',expectedCaseRevision:context.caseRevision,expectedProfileVersion:context.profileVersion,basisDraftHash:context.draftHash,
      turns:[{messageId:'paxi_turn_1',turnId:'paxi_turn_1',text:'Ich verdiene 119000 Franken brutto im Jahr.'}],
      observations:[{fieldId:'annual_gross_income_chf',personId:'person_demo_1',sourceMessageId:'paxi_turn_1',quote:'119000',value:119000,precision:'exact',unit:'CHF',period:'year',basis:'gross'}]};
    const forged=await call('POST',`/api/cases/${c.id}/voice/agent-observations`,grant.sessionToken,{...body,observations:[{...body.observations[0],quote:'150000'}]});
    assert.equal(forged.status,422);
    const owned=await call('POST',`/api/cases/${c.id}/voice/agent-observations`,owner.sessionToken,body);
    assert.equal(owned.status,403);
    const result=await call('POST',`/api/cases/${c.id}/voice/agent-observations`,grant.sessionToken,body);
    assert.equal(result.status,201,JSON.stringify(result.body));
    assert.equal(result.body.proposalBatch.status,'proposed');
    assert.deepEqual(result.body.proposalBatch.changes,[{path:'insurance.persons.0.grossAnnualIncomeCents',value:11900000,personId:'person_demo_1'}]);
    assert.equal(result.body.proposalBatch.source.sourceRef,'voice-agent:conv_1:paxi_turn_1');
    const after=(await call('GET',`/api/cases/${c.id}`,owner.sessionToken)).body;
    assert.equal(after.draft.insurance.persons[0].grossAnnualIncomeCents,10000000);
  }finally{await voiceApp.close();await rm(dir,{recursive:true,force:true});}
});

test('the voice agent route stays closed while voice processing is off',async()=>{
  let c=(await request('POST','/api/cases',customer.sessionToken,{locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'})).body;
  const grant=(await request('POST',`/api/cases/${c.id}/agent-access`,customer.sessionToken,{})).body;
  const result=await request('POST',`/api/cases/${c.id}/voice/agent-observations`,grant.sessionToken,{});
  assert.equal(result.status,503);
});

test('the demo start is closed unless the server opts in',async()=>{
  const result=await request('POST','/api/demo/start',null,{});
  assert.equal(result.status,404);
});

test('the demo start hands out one calculated Mueller case without an access code',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'pax-demo-start-'));
  const {app:demoApp}=await createLifeInsuranceApp({dataDirectory:dir,provider:new SyntheticTestProvider(),providerMode:'test',credentials,demoStart:true});
  try{
    await demoApp.listen(0,'127.0.0.1');const url=await demoApp.getUrl();
    const start=async body=>{const r=await fetch(url+'/api/demo/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,cookie:r.headers.get('set-cookie'),body:await r.json()};};
    const first=await start({});
    assert.equal(first.status,201,JSON.stringify(first.body));
    assert.equal(first.body.sessionToken,undefined);
    assert.match(first.cookie,/^pax_session=[A-Za-z0-9_-]+; HttpOnly/);
    const cookie=first.cookie.split(';')[0];
    const c=await (await fetch(`${url}/api/cases/${first.body.caseId}`,{headers:{Cookie:cookie}})).json();
    assert.equal(c.confirmedVersions.length,1);
    assert.deepEqual(c.runs.map(r=>r.scenarioVersionId),['standard_family_v1','standard_home_v1','standard_retirement_v1','standard_baseline_v1']);
    assert.equal(c.recommendations.length,1);
    const again=await start({});
    assert.equal(again.body.caseId,first.body.caseId);
    const fresh=await start({fresh:true});
    assert.notEqual(fresh.body.caseId,first.body.caseId);
  }finally{await demoApp.close();await rm(dir,{recursive:true,force:true});}
});

test('a separate voice agent records the call history without touching the case revision',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'pax-agent-turns-'));
  const {app:voiceApp}=await createLifeInsuranceApp({dataDirectory:dir,provider:new SyntheticTestProvider(),providerMode:'test',credentials,voice:{enabled:true}});
  try{
    await voiceApp.listen(0,'127.0.0.1');const url=await voiceApp.getUrl();
    const call=async(method,path,token,body)=>{const r=await fetch(url+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};};
    const owner=(await call('POST','/api/sessions',null,{accessCode:credentials.customerAccessCode})).body;
    const reviewer=(await call('POST','/api/sessions',null,{accessCode:credentials.reviewerAccessCode})).body;
    const c=(await call('POST','/api/cases',owner.sessionToken,{locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'})).body;
    const grant=(await call('POST',`/api/cases/${c.id}/agent-access`,owner.sessionToken,{})).body;
    const at='2026-10-31T12:00:00.000Z';
    const turns=[{messageId:'conv_1_t0',speaker:'agent',text:'Hoi, ich bin Paxi.',at},{messageId:'conv_1_t1',speaker:'customer',text:'Ich verdiene',at}];
    const first=await call('POST',`/api/cases/${c.id}/voice/agent-turns`,grant.sessionToken,{conversationId:'conv_1',turns});
    assert.equal(first.status,201,JSON.stringify(first.body));assert.equal(first.body.recorded,2);
    assert.equal((await call('POST',`/api/cases/${c.id}/voice/agent-turns`,owner.sessionToken,{conversationId:'conv_1',turns})).status,403);
    const again=await call('POST',`/api/cases/${c.id}/voice/agent-turns`,grant.sessionToken,{conversationId:'conv_1',turns});
    assert.equal(again.body.recorded,0);
    const grown=await call('POST',`/api/cases/${c.id}/voice/agent-turns`,grant.sessionToken,{conversationId:'conv_1',turns:[{...turns[1],text:'Ich verdiene 105000 brutto.'}]});
    assert.deepEqual([grown.body.recorded,grown.body.total],[1,2]);
    const after=(await call('GET',`/api/cases/${c.id}`,owner.sessionToken)).body;
    assert.equal(after.caseRevision,c.caseRevision);assert.equal(after.agentTurns,undefined);
    assert.ok(after.contextRevision>c.contextRevision);
    const history=(await call('GET',`/api/cases/${c.id}/voice/agent-turns`,owner.sessionToken)).body;
    assert.deepEqual(history.turns.map(t=>[t.speaker,t.text]),[['agent','Hoi, ich bin Paxi.'],['customer','Ich verdiene 105000 brutto.']]);
    assert.equal((await call('GET',`/api/cases/${c.id}/voice/agent-turns`,reviewer.sessionToken)).status,403);
  }finally{await voiceApp.close();await rm(dir,{recursive:true,force:true});}
});

test('in the demo start the voice agent proposals are taken over, confirmed and recalculated in one step',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'pax-demo-accept-'));
  const {app:demoApp}=await createLifeInsuranceApp({dataDirectory:dir,provider:new SyntheticTestProvider(),providerMode:'test',credentials,demoStart:true,voice:{enabled:true}});
  try{
    await demoApp.listen(0,'127.0.0.1');const url=await demoApp.getUrl();
    const start=await fetch(url+'/api/demo/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const cookie=start.headers.get('set-cookie').split(';')[0];const {caseId,csrfToken}=await start.json();
    const call=async(method,path,body,auth={Cookie:cookie,'X-CSRF-Token':csrfToken})=>{const r=await fetch(url+path,{method,headers:{...auth,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};};
    const grant=(await call('POST',`/api/cases/${caseId}/agent-access`,{})).body;
    const agent={Authorization:`Bearer ${grant.sessionToken}`};
    const context=(await call('GET',`/api/cases/${caseId}/advisor/extractor-context`,undefined,agent)).body;
    const proposed=await call('POST',`/api/cases/${caseId}/voice/agent-observations`,{messageId:'obs_1',conversationId:'conv_1',
      expectedCaseRevision:context.caseRevision,expectedProfileVersion:context.profileVersion,basisDraftHash:context.draftHash,
      turns:[{messageId:'t1',turnId:'t1',text:'Ich verdiene 105000 brutto.'}],
      observations:[{fieldId:'annual_gross_income_chf',personId:'person_demo_1',sourceMessageId:'t1',quote:'105000',value:105000,precision:'exact',unit:'CHF',period:'year',basis:'gross'}]},agent);
    assert.equal(proposed.status,201,JSON.stringify(proposed.body));
    const result=await call('POST',`/api/cases/${caseId}/demo-accept`,{});
    assert.equal(result.status,201,JSON.stringify(result.body));
    assert.equal(result.body.accepted.length,1);assert.equal(result.body.profileVersion,2);assert.equal(result.body.runs.length,4);
    const c=(await call('GET',`/api/cases/${caseId}`)).body;
    assert.equal(c.confirmedVersions.at(-1).draft.insurance.persons[0].grossAnnualIncomeCents,10500000);
    assert.ok(c.runs.filter(r=>r.profileVersion===2).length===4);
    const nothing=await call('POST',`/api/cases/${caseId}/demo-accept`,{});
    assert.deepEqual([nothing.body.accepted,nothing.body.runs],[[],[]]);
  }finally{await demoApp.close();await rm(dir,{recursive:true,force:true});}
});

test('taking over proposals in one step only exists in the demo start',async()=>{
  const c=(await request('POST','/api/cases',customer.sessionToken,{locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'})).body;
  assert.equal((await request('POST',`/api/cases/${c.id}/demo-accept`,customer.sessionToken,{})).status,404);
});
