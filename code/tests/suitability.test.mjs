import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLifeInsuranceApp } from '../apps/api/dist/insurance/app.js';
import { evaluateSuitability,strategyFor } from '../apps/api/dist/insurance/suitability.js';
import { lifeDraft,SyntheticTestProvider } from './helpers/life-fixture.mjs';

const credentials={customerAccessCode:'suit-customer-key-at-least-32-characters',reviewerAccessCode:'suit-reviewer-key-at-least-32-characters'};
let app,base,directory,customer,reviewer;
async function request(method,path,token,body) {
  const response=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json()};
}
before(async()=>{
  directory=await mkdtemp(join(tmpdir(),'pax-suitability-'));
  ({app}=await createLifeInsuranceApp({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials}));
  await app.listen(0,'127.0.0.1');base=await app.getUrl();
  customer=(await request('POST','/api/sessions',null,{accessCode:credentials.customerAccessCode})).body;
  reviewer=(await request('POST','/api/sessions',null,{accessCode:credentials.reviewerAccessCode})).body;
});
after(async()=>{await app?.close();await rm(directory,{recursive:true,force:true});});

// A cautious saver without securities experience: 0 + 30 + 0 + 0 = 30 points, conservative.
const cautious={annualPremiumCents:200000,singleInvestmentCents:null,netIncome:'75k_150k',netWorth:'10k_50k',annualSavingCapacity:'1k_3k',
  singleInvestmentCapacity:'under_10k',investmentGoal:'low_risk',horizon:'over_15_years',securitiesExperience:'none',lossReaction:'sell_all',
  guaranteedPercent:0,selectedStrategy:'conservative'};

test('points and strategy bands follow the Pax form',()=>{
  assert.deepEqual([44,45,84,85].map(strategyFor),['conservative','balanced','balanced','dynamic']);
  const result=evaluateSuitability(cautious);
  assert.deepEqual(result.points,{goal:0,horizon:30,experience:0,lossReaction:0,total:30,afterGuarantee:30});
  assert.equal(result.result,'suitable');
});

test('a guaranteed part moves the profile up as in section D',()=>{
  // 30 × (100 % − 50 %) + 120 × 50 % = 75 points: balanced.
  const result=evaluateSuitability({...cautious,guaranteedPercent:50,selectedStrategy:'balanced'});
  assert.equal(result.points.afterGuarantee,75);assert.equal(result.profileStrategy,'balanced');assert.equal(result.result,'suitable');
});

test('a premium above what the person can save, another strategy or a short horizon are advised against',()=>{
  assert.deepEqual(evaluateSuitability({...cautious,annualPremiumCents:500000}).reasons,['NOT_AFFORDABLE']);
  assert.deepEqual(evaluateSuitability({...cautious,selectedStrategy:'dynamic'}).reasons,['STRATEGY_DOES_NOT_MATCH_PROFILE']);
  assert.ok(evaluateSuitability({...cautious,horizon:'under_10_years'}).reasons.includes('HORIZON_TOO_SHORT'));
  assert.equal(evaluateSuitability({...cautious,singleInvestmentCents:2000000,annualPremiumCents:null}).result,'advised_against');
});

test('FondsStar can only be quoted after a suitable pre-check of that person',async()=>{
  let c=(await request('POST','/api/cases',customer.sessionToken,{locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'})).body;
  c=(await request('PATCH',`/api/cases/${c.id}/draft`,customer.sessionToken,{...(await lifeDraft()),expectedCaseRevision:c.caseRevision})).body;
  c=(await request('POST',`/api/cases/${c.id}/confirmations`,customer.sessionToken,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v2'})).body;
  const analyses=(await request('POST',`/api/cases/${c.id}/standard-analyses`,customer.sessionToken,{expectedProfileVersion:1})).body;
  c=(await request('GET',`/api/cases/${c.id}`,customer.sessionToken)).body;
  const task=c.reviewTasks.filter(t=>t.runId===c.activeRunId).at(-1);
  const approved=await request('POST',`/api/cases/${c.id}/review-decisions`,reviewer.sessionToken,{runId:c.activeRunId,decision:'approved_for_demo',
    acknowledgedReasonCodes:task.reasons,criteria:['data_sources_checked','need_and_units_checked','beneficiaries_checked','personal_affordability_checked','demo_only_understood']});
  assert.equal(approved.status,201,JSON.stringify(approved.body));
  const rec=(await request('POST',`/api/cases/${c.id}/recommendations`,customer.sessionToken,{})).body;
  const fondsstar=rec.candidates.find(x=>x.productId==='pax_fondsstar');
  assert.ok(fondsstar,'FondsStar is recommended for this profile');
  assert.ok(fondsstar.rule.reasonCodes.includes('SUITABILITY_CHECK_REQUIRED'));
  assert.ok(analyses.recommendation.candidates.some(x=>x.productId==='pax_fondsstar'));

  const quote=async key=>{
    const current=(await request('GET',`/api/cases/${c.id}`,customer.sessionToken)).body;
    return request('POST',`/api/cases/${c.id}/demo-quotes`,customer.sessionToken,{expectedCaseRevision:current.caseRevision,idempotencyKey:key,
      demoAcknowledged:true,informationDocumentsAcknowledged:true,recommendationId:rec.id,selectedCandidateIds:[fondsstar.id]});
  };
  const check=async answers=>{
    const current=(await request('GET',`/api/cases/${c.id}`,customer.sessionToken)).body;
    return request('POST',`/api/cases/${c.id}/suitability`,customer.sessionToken,{expectedCaseRevision:current.caseRevision,
      productId:'pax_fondsstar',personId:fondsstar.personId,answers,answersConfirmedByCustomer:true});
  };

  const missing=await quote('without-check');
  assert.equal(missing.status,422);assert.equal(missing.body.code,'SUITABILITY_CHECK_REQUIRED');
  assert.match(missing.body.message,/Angemessenheitsprüfung/);

  const against=await check({...cautious,selectedStrategy:'dynamic'});
  assert.equal(against.status,201,JSON.stringify(against.body));
  assert.deepEqual([against.body.result,against.body.binding,against.body.humanConfirmationRequired],['advised_against',false,true]);
  const blocked=await quote('advised-against');
  assert.equal(blocked.body.code,'SUITABILITY_ADVISED_AGAINST');assert.deepEqual(blocked.body.fields,['STRATEGY_DOES_NOT_MATCH_PROFILE']);

  assert.equal((await check(cautious)).body.result,'suitable');
  const quoted=await quote('suitable');
  assert.equal(quoted.status,201,JSON.stringify(quoted.body));

  const view=(await request('GET',`/api/cases/${c.id}/suitability`,customer.sessionToken)).body;
  assert.deepEqual(view.checks.map(x=>x.result),['advised_against','suitable']);
  assert.equal(view.formVersion,'0054/PMPV/03.2026');
  const dto=(await request('GET',`/api/cases/${c.id}`,customer.sessionToken)).body;
  assert.equal(dto.suitabilityChecks,undefined);
});

test('the portal shows identification, AML, health questions and signature as steps of a real contract',async()=>{
  const c=(await request('POST','/api/cases',customer.sessionToken,{locale:'fr',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'})).body;
  const portal=(await request('GET',`/api/cases/${c.id}/portal`,customer.sessionToken)).body;
  assert.deepEqual(portal.complianceSteps.map(s=>[s.id,s.status]),[['identification','required_in_real_integration'],['aml_check','required_in_real_integration'],
    ['health_declaration','required_in_real_integration'],['signature','required_in_real_integration']]);
  assert.equal(portal.complianceSteps[1].label,'Contrôle anti-blanchiment');
});
