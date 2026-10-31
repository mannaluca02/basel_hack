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
  const after=(await request('GET',`/api/cases/${c.id}`,customer.sessionToken)).body;
  assert.equal(after.activeRunId,result.body.runs.at(-1).runId);
  assert.ok(after.runs.find(r=>r.scenario.kind==='retirement').timeline.periods.length>12);
});
