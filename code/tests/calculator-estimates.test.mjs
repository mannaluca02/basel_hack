import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PRIVACY_NOTICE} from '@pax/contracts';
import {createLifeRuntime} from '../apps/api/dist/insurance/runtime.js';
import {SyntheticTestProvider,lifeDraft} from './helpers/life-fixture.mjs';
import {credentials} from './helpers/demo-http.mjs';

/**
 * Calculator estimates on the unconfirmed draft (net income, budget, income/fortune tax, 3a
 * saving, capital tax, pension fund purchase): what each needs, what it sends to the calculator,
 * and how a refusal of the calculator is reported per operation instead of failing the rest.
 */
async function draftCase(t,{provider=new SyntheticTestProvider(),change=()=>{}}={}) {
  const directory=await mkdtemp(join(tmpdir(),'pax-estimates-'));
  const r=await createLifeRuntime({dataDirectory:directory,provider,providerMode:'test',credentials});
  t.after(async()=>{await r.close();await rm(directory,{recursive:true,force:true});});
  const login=await r.sessions.login(credentials.customerAccessCode,'estimates-test');
  const customer=r.sessions.authenticate(login.sessionToken);
  let c=await r.engine.createCase(customer,{locale:'de',timeBudgetMinutes:30,noticeVersion:PRIVACY_NOTICE.version,dataClassification:'synthetic'});
  const draft=await lifeDraft();change(draft);
  c=await r.engine.patchDraft(customer,c.id,{...draft,expectedCaseRevision:c.caseRevision});
  const estimate=body=>r.estimates.calculate(customer,c.id,{expectedCaseRevision:r.engine.caseFor(customer,c.id).caseRevision,
    noticeVersion:'lifemap-synthetic-v2',allowSyntheticCalculatorTransfer:true,...body});
  return {r,customer,id:c.id,provider,estimate};
}

const operations=['income','budgetProposal','incomeFortuneTax','saving3a','capitalTax','purchaseP2'];
const parameters={saving3a:{years:20,initialCents:1000000,annualCents:700000},capitalTax:{paymentCents:20000000,paymentAge:65},
  purchaseP2:{investmentCents:5000000,years:5,conversionBps:600}};

test('every operation runs with its parameters and sends the draft\'s own values',async t=>{
  const f=await draftCase(t);
  const result=await f.estimate({operations,...parameters});
  assert.deepEqual(result.blocked,[]);
  assert.deepEqual(result.errors,[]);
  const sent=Object.groupBy(f.provider.calls,c=>c.operation);
  const persons=(await lifeDraft()).insurance.persons;
  assert.equal(sent.income.length,persons.length,'net income per person');
  assert.equal(sent.income[0].request.Income,persons[0].grossAnnualIncomeCents/100);
  assert.equal(sent.saving3a[0].request.Duration,20);
  assert.equal(sent.saving3a[0].request.YearlyInvestment,7000);
  assert.equal(sent.capitalTax[0].request.CapitalPayment,200000);
  assert.equal(sent.capitalTax[0].request.PaymentAge,65);
  assert.equal(sent.capitalTax[0].request.Income,undefined,'capital tax has no income');
  assert.equal(sent.purchaseP2[0].request.Investment,50000);
  assert.equal(sent.purchaseP2[0].request.ConversionRate,6);
  const stored=f.r.engine.caseFor(f.customer,f.id).estimates.at(-1);
  assert.ok(stored,'the estimate is kept on the case');
});

test('operations without their parameters are blocked, naming what is missing',async t=>{
  const f=await draftCase(t);
  const result=await f.estimate({operations:['saving3a','capitalTax','purchaseP2']});
  assert.deepEqual(result.blocked.map(b=>b.operation),['saving3a','capitalTax','purchaseP2']);
  assert.ok(result.blocked.find(b=>b.operation==='saving3a').fields.includes('saving3a'));
  assert.equal(f.provider.calls.length,0,'nothing reaches the calculator');
});

test('missing tax location or taxable fortune blocks the tax estimates only',async t=>{
  const f=await draftCase(t,{change:d=>{d.insurance.taxLocationId=null;d.insurance.taxableFortuneCents=null;}});
  const result=await f.estimate({operations:['income','incomeFortuneTax','budgetProposal']});
  const blocked=Object.fromEntries(result.blocked.map(b=>[b.operation,b.fields]));
  assert.deepEqual(blocked.income,['insurance.taxLocationId']);
  assert.ok(blocked.incomeFortuneTax,'income and fortune tax needs the tax location');
});

test('without the 3a/purchase basics (sex, return) the dependent estimates are blocked',async t=>{
  const f=await draftCase(t,{change:d=>{d.insurance.persons[0].providerSex=null;d.insurance.annualReturnBps=null;}});
  const result=await f.estimate({operations:['saving3a','capitalTax','purchaseP2'],...parameters});
  assert.deepEqual(result.blocked.map(b=>b.operation).sort(),['capitalTax','purchaseP2','saving3a']);
});

test('a calculator refusal is reported per operation; the other estimates still arrive',async t=>{
  const f=await draftCase(t,{provider:new SyntheticTestProvider({failOperation:'budgetProposal'})});
  const result=await f.estimate({operations:['income','budgetProposal']});
  assert.deepEqual(result.errors,[{operation:'budgetProposal',code:'UNAVAILABLE'}]);
  assert.ok(result.results.some(x=>x.operation==='income'));
});

test('a refusal without a clean code becomes PROVIDER_ERROR, never the raw payload',async t=>{
  const provider=new SyntheticTestProvider();
  const execute=provider.execute.bind(provider);
  provider.execute=async(operation,request)=>{if(operation==='income')throw new Error('raw upstream text with secrets');return execute(operation,request);};
  const f=await draftCase(t,{provider});
  const result=await f.estimate({operations:['income']});
  assert.ok(result.errors.length>0);
  assert.ok(result.errors.every(e=>e.operation==='income'&&e.code==='PROVIDER_ERROR'),'one per person, all clean');
  assert.doesNotMatch(JSON.stringify(result),/secrets/);
});

test('estimates need the draft basics, the current revision and the customer',async t=>{
  const f=await draftCase(t,{change:d=>{d.insurance.relationship='unknown';d.insurance.sharedChildren=null;}});
  await assert.rejects(f.estimate({operations:['income']}),e=>e.code==='NEEDS_INPUT'&&e.fields.includes('insurance.relationship')&&e.fields.includes('insurance.sharedChildren'));
  await assert.rejects(f.r.estimates.calculate(f.customer,f.id,{expectedCaseRevision:999,noticeVersion:'lifemap-synthetic-v2',allowSyntheticCalculatorTransfer:true,operations:['income']}),e=>e.code==='VERSION_CONFLICT');
  const reviewerLogin=await f.r.sessions.login(credentials.reviewerAccessCode,'estimates-reviewer');
  const reviewer=f.r.sessions.authenticate(reviewerLogin.sessionToken);
  await assert.rejects(f.r.estimates.calculate(reviewer,f.id,{expectedCaseRevision:1,noticeVersion:'lifemap-synthetic-v2',allowSyntheticCalculatorTransfer:true,operations:['income']}),e=>e.code==='FORBIDDEN');
});
