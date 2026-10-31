import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PRIVACY_NOTICE} from '@pax/contracts';
import {createLifeRuntime} from '../apps/api/dist/insurance/runtime.js';
import {confirmationQuestion} from '../apps/api/dist/insurance/confirmation-text.js';
import {SyntheticTestProvider,lifeDraft} from './helpers/life-fixture.mjs';
import {credentials} from './helpers/demo-http.mjs';

/** Human review requests and decisions, profile consistency checks, spoken confirmation texts. */
async function runtime(t) {
  const directory=await mkdtemp(join(tmpdir(),'pax-review-'));
  const r=await createLifeRuntime({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials});
  t.after(async()=>{await r.close();await rm(directory,{recursive:true,force:true});});
  const as=async code=>r.sessions.authenticate((await r.sessions.login(code,`review-${code.slice(0,6)}-${Math.random()}`)).sessionToken);
  const customer=await as(credentials.customerAccessCode),reviewer=await as(credentials.reviewerAccessCode);
  const c=await r.engine.createCase(customer,{locale:'de',timeBudgetMinutes:30,noticeVersion:PRIVACY_NOTICE.version,dataClassification:'synthetic'});
  return {r,customer,reviewer,id:c.id,get:()=>r.engine.caseFor(customer,c.id)};
}
const criteria=['data_sources_checked','need_and_units_checked','beneficiaries_checked','personal_affordability_checked','demo_only_understood'];

test('a review requested before any analysis is an intake review: never approvable, decided once',async t=>{
  const f=await runtime(t);
  const task=await f.r.engine.requestReview(f.customer,f.id);
  assert.equal(task.runId,'intake');
  assert.deepEqual(task.reasons,['USER_REQUESTED']);
  // Asking again changes nothing but the event.
  const again=await f.r.engine.requestReview(f.customer,f.id);
  assert.equal(again.id,task.id);
  assert.deepEqual(again.reasons,['USER_REQUESTED']);

  await assert.rejects(f.r.engine.reviewDecision(f.reviewer,f.id,{runId:'intake',decision:'approved_for_demo',acknowledgedReasonCodes:['USER_REQUESTED'],criteria}),
    e=>e.code==='ANALYSIS_NOT_READY');
  const decided=await f.r.engine.reviewDecision(f.reviewer,f.id,{runId:'intake',decision:'needs_information',acknowledgedReasonCodes:['USER_REQUESTED'],criteria:['data_sources_checked']});
  assert.equal(decided.status,'needs_information');
  assert.equal(decided.decision.actorId,f.reviewer.id);
  await assert.rejects(f.r.engine.reviewDecision(f.reviewer,f.id,{runId:'intake',decision:'declined',acknowledgedReasonCodes:[],criteria:['data_sources_checked']}),
    e=>e.code==='REVIEW_NOT_OPEN');
});

test('only the reviewer decides, and only with every criterion and reason acknowledged',async t=>{
  const f=await runtime(t);
  let c=await f.r.engine.patchDraft(f.customer,f.id,{...(await lifeDraft()),expectedCaseRevision:f.get().caseRevision});
  c=await f.r.engine.confirm(f.customer,f.id,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:PRIVACY_NOTICE.version});
  const {run}=await f.r.engine.analyze(f.customer,f.id,{expectedCaseRevision:f.get().caseRevision,expectedProfileVersion:1,scenarioVersionId:'baseline_v1',scenario:{kind:'baseline'}});
  const task=f.get().reviewTasks.find(x=>x.runId===run.id);
  await assert.rejects(f.r.engine.reviewDecision(f.customer,f.id,{runId:run.id,decision:'approved_for_demo',acknowledgedReasonCodes:task.reasons,criteria}),e=>e.code==='FORBIDDEN');
  await assert.rejects(f.r.engine.reviewDecision(f.reviewer,f.id,{runId:run.id,decision:'approved_for_demo',acknowledgedReasonCodes:task.reasons,criteria:criteria.slice(1)}),
    e=>e.code==='REVIEW_CRITERIA_INCOMPLETE');
  if(task.reasons.length)await assert.rejects(f.r.engine.reviewDecision(f.reviewer,f.id,{runId:run.id,decision:'approved_for_demo',acknowledgedReasonCodes:[],criteria}),
    e=>e.code==='REVIEW_CRITERIA_INCOMPLETE');
  await assert.rejects(f.r.engine.reviewDecision(f.reviewer,f.id,{runId:crypto.randomUUID(),decision:'declined',acknowledgedReasonCodes:[],criteria:['data_sources_checked']}),
    e=>e.code==='STALE_CONTEXT');

  // A customer request on an open run review adds the reason once.
  await f.r.engine.requestReview(f.customer,f.id);
  await f.r.engine.requestReview(f.customer,f.id);
  const open=f.get().reviewTasks.find(x=>x.runId===run.id&&x.status==='open');
  assert.equal(open.reasons.filter(x=>x==='USER_REQUESTED').length,1);

  const approved=await f.r.engine.reviewDecision(f.reviewer,f.id,{runId:run.id,decision:'approved_for_demo',acknowledgedReasonCodes:open.reasons,criteria});
  assert.equal(approved.status,'approved_for_demo');
  assert.equal(f.r.engine.approved(f.get(),f.get().runs.find(x=>x.id===run.id)),true);
});

test('the profile is confirmed only when debts add up and belong to known persons',async t=>{
  const f=await runtime(t);
  const confirm=()=>f.r.engine.confirm(f.customer,f.id,{expectedCaseRevision:f.get().caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:PRIVACY_NOTICE.version});
  const draft=await lifeDraft();
  draft.insurance.debts=[{id:'debt_1',kind:'consumer',ownerPersonIds:[draft.financial.persons[0].id],balanceCents:1000000,annualServiceCents:120000}];
  await f.r.engine.patchDraft(f.customer,f.id,{...draft,expectedCaseRevision:f.get().caseRevision});
  await assert.rejects(confirm(),e=>e.code==='DEBT_SERVICE_MISMATCH','the budget must carry the debt service');

  draft.financial.expenses.push({id:'expense_debt',category:'debt',amount:{...draft.financial.expenses[0].amount,value:10000,sourceRef:'test:debt'}});
  draft.insurance.debts[0].ownerPersonIds=['person_unknown'];
  await f.r.engine.patchDraft(f.customer,f.id,{...draft,expectedCaseRevision:f.get().caseRevision}).catch(e=>assert.fail(`patch: ${e.code} ${e.fields}`));
  await assert.rejects(confirm(),e=>e.code==='UNKNOWN_DEBT_OWNER');
});

test('an impossible scenario is refused as invalid input before any calculator call',async t=>{
  const f=await runtime(t);
  await f.r.engine.patchDraft(f.customer,f.id,{...(await lifeDraft()),expectedCaseRevision:f.get().caseRevision});
  await f.r.engine.confirm(f.customer,f.id,{expectedCaseRevision:f.get().caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:PRIVACY_NOTICE.version});
  await assert.rejects(f.r.engine.analyze(f.customer,f.id,{expectedCaseRevision:f.get().caseRevision,expectedProfileVersion:1,scenarioVersionId:'family_bad',
    scenario:{kind:'family',personId:'person_unknown',newEmploymentRateBps:5000,additionalMonthlyCostCents:0,linearIncomeAssumptionConfirmed:true}}),
    e=>['SCENARIO_INPUT_INVALID','PERSON_REFERENCE_MISMATCH'].includes(e.code));
});

test('spoken confirmations name gross or net income per person; anything else goes to the screen',()=>{
  const c={locale:'de',draft:{financial:{persons:[{id:'p1',incomeBasis:'net_after_income_tax',income:{period:'month'}},{id:'p2',incomeBasis:'gross',income:{period:'year'}}]}}};
  const batch={kind:'accept_batch',batchId:'b'};
  const gross=confirmationQuestion(c,batch,'voice',[{path:'insurance.persons.0.grossAnnualIncomeCents',personId:'p1',value:11900000}]);
  assert.match(gross,/Person 1/);
  assert.match(gross,/119/);
  const net=confirmationQuestion(c,batch,'voice',[{path:'financial.persons.0.income.value',personId:'p1',value:800000}]);
  assert.match(net,/Person 1/);
  assert.match(net,/8/);
  for(const change of [
    {path:'financial.persons.1.income.value',personId:'p2',value:800000},
    {path:'insurance.riskAppetite',personId:'p1',value:5},
    {path:'insurance.persons.0.grossAnnualIncomeCents',personId:'unknown',value:1},
    {path:'insurance.persons.0.grossAnnualIncomeCents',personId:'p1',value:'text'},
  ])assert.throws(()=>confirmationQuestion(c,batch,'voice',[change]),e=>e.code==='VOICE_CONFIRMATION_REQUIRES_SCREEN',change.path);
  assert.notEqual(confirmationQuestion(c,batch,'screen',[]),gross,'the screen question is separate');
  assert.match(confirmationQuestion(c,{kind:'confirm_profile'},'voice',[]),/Gesamtprofil/);
  for(const locale of ['fr','it','en'])assert.ok(confirmationQuestion({...c,locale},{kind:'confirm_profile'},'voice',[]).length>20,locale);
});
