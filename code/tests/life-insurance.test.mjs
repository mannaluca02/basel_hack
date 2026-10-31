import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,readFile,writeFile,stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLifeRuntime } from '../apps/api/dist/insurance/runtime.js';
import { EncryptedCaseStore } from '../apps/api/dist/insurance/store.js';
import { lifeDraft,retirementScenario,SyntheticTestProvider } from './helpers/life-fixture.mjs';
import { deathCapitalNeed,retirementTimeline,intakeQuestions } from '@pax/domain';
import { buildProviderJobs,deriveRiskNeeds } from '../apps/api/dist/insurance/provider-mapper.js';
import { LifeAnalysisSchema,DraftSchema } from '@pax/contracts';

const credentials={customerAccessCode:'synthetic-customer-access-code-at-least-32',reviewerAccessCode:'synthetic-reviewer-access-code-at-least-32'};
async function fixture(t,options={}) {
  const directory=await mkdtemp(join(tmpdir(),'pax-life-test-'));const provider=options.provider??new SyntheticTestProvider();
  const r=await createLifeRuntime({dataDirectory:directory,provider,providerMode:'test',credentials});
  t.after(async()=>{await r.close();await rm(directory,{recursive:true,force:true});});
  const login=await r.sessions.login(credentials.customerAccessCode,'customer');const customer=r.sessions.authenticate(login.sessionToken);
  const staffLogin=await r.sessions.login(credentials.reviewerAccessCode,'staff');const staff=r.sessions.authenticate(staffLogin.sessionToken);
  let c=await r.engine.createCase(customer,{locale:options.locale??'de',timeBudgetMinutes:5,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'});
  if(options.intake!==false){c=await r.engine.patchDraft(customer,c.id,{...(await lifeDraft()),expectedCaseRevision:c.caseRevision});
    c=await r.engine.confirm(customer,c.id,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v2'});}
  const get=()=>r.engine.caseFor(customer,c.id);
  const analyze=async(scenario={kind:'baseline'},version='baseline_v1')=>r.engine.analyze(customer,c.id,{expectedCaseRevision:get().caseRevision,expectedProfileVersion:get().confirmedVersions.at(-1).version,scenarioVersionId:version,scenario});
  const approve=async run=>r.engine.reviewDecision(staff,c.id,{runId:run.id,decision:'approved_for_demo',acknowledgedReasonCodes:r.engine.caseFor(staff,c.id).reviewTasks.filter(t=>t.runId===run.id).at(-1).reasons,
    criteria:['data_sources_checked','need_and_units_checked','beneficiaries_checked','personal_affordability_checked','demo_only_understood']});
  return {r,provider,directory,customer,staff,login,c,get,analyze,approve};
}
const action=(f,key,extra={})=>({expectedCaseRevision:f.get().caseRevision,idempotencyKey:key,demoAcknowledged:true,informationDocumentsAcknowledged:true,...extra});

test('complete needs lead through actual adapter interfaces to an auditable insurance recommendation',async t=> {
  const f=await fixture(t);const {run}=await f.analyze();assert.equal(run.status,'current');assert.equal(run.riskNeeds.length,8);
  assert.ok(f.provider.calls.some(c=>c.operation==='risk'));assert.ok(f.provider.calls.some(c=>c.operation==='retirement'));
  const rec=await f.r.engine.recommendation(f.customer,f.c.id);assert.equal(rec.status,'human_review_required');assert.ok(rec.candidates.length>0);
  assert.ok(rec.candidates.every(c=>c.rule.runId===run.id&&c.rule.inputHash===run.inputHash&&c.premiumCents===null));
  assert.ok(rec.candidates.some(c=>c.productId==='pax_term_life'));
});
test('incomplete needs ask targeted questions and cannot produce a recommendation',async t=> {
  const f=await fixture(t,{intake:false,locale:'fr'});const q=f.r.engine.questions(f.customer,f.c.id);
  assert.equal(q.questions.length,1);assert.match(q.questions[0].text,/objectifs/);
  await assert.rejects(f.r.engine.recommendation(f.customer,f.c.id),e=>e.code==='STALE_CONTEXT');
  assert.equal(f.provider.calls.length,0);
});
test('unknown needs are not zero; insufficient intake cannot be confirmed',async t=> {
  const f=await fixture(t,{intake:false});const draft=await lifeDraft();draft.insurance.persons[0].deathNeedAnnualCents=null;
  const c=await f.r.engine.patchDraft(f.customer,f.c.id,{...draft,expectedCaseRevision:f.get().caseRevision});
  await assert.rejects(f.r.engine.confirm(f.customer,c.id,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v2'}),e=>e.code==='NEEDS_INPUT');
  assert.ok(f.r.engine.questions(f.customer,c.id).mandatoryFields.some(p=>p.endsWith('deathNeedAnnualCents')));
});
test('own-person affordability caps pension saving and existing 3a contributions consume the ceiling',async t=> {
  const f=await fixture(t);await f.analyze();const rec=await f.r.engine.recommendation(f.customer,f.c.id);
  const saving=rec.candidates.find(c=>c.productId==='pax_3a');assert.equal(saving.needAmountCents,125800);
  assert.ok(saving.needAmountCents<=f.get().draft.insurance.persons[0].personalAffordableAnnualPremiumCents);
});
test('a missing human review blocks quotes, and a customer cannot approve their own review',async t=> {
  const f=await fixture(t);const {run}=await f.analyze();const rec=await f.r.engine.recommendation(f.customer,f.c.id);
  await assert.rejects(f.r.journey.quote(f.customer,f.c.id,action(f,'quote',{recommendationId:rec.id,selectedCandidateIds:[rec.candidates[0].id]})),e=>e.code==='HUMAN_REVIEW_REQUIRED');
  await assert.rejects(f.r.engine.reviewDecision(f.customer,f.c.id,{runId:run.id}),e=>e.code==='FORBIDDEN');
  await assert.rejects(f.r.engine.reviewDecision(f.staff,f.c.id,{runId:run.id,decision:'approved_for_demo',acknowledgedReasonCodes:[],criteria:['demo_only_understood']}),e=>e.code==='REVIEW_CRITERIA_INCOMPLETE');
});
test('full saved demo journey requires separate submission, staff review and acceptance before policy',async t=> {
  const f=await fixture(t);const {run}=await f.analyze();const rec=await f.r.engine.recommendation(f.customer,f.c.id);await f.approve(run);
  const quote=await f.r.journey.quote(f.customer,f.c.id,action(f,'quote',{recommendationId:rec.id,selectedCandidateIds:[rec.candidates.find(c=>c.productId==='pax_term_life').id]}));
  assert.equal(quote.premiumCents,null);assert.equal(quote.legalEffect,'none');
  const docs=quote.documents.map(d=>d.id);
  const app=await f.r.journey.application(f.customer,f.c.id,action(f,'application',{quoteId:quote.id,acknowledgedDocumentIds:docs}));
  await assert.rejects(f.r.journey.issuePolicy(f.staff,f.c.id,action(f,'early',{applicationId:app.id})),e=>e.code==='APPLICATION_NOT_ACCEPTED');
  const submitAction=action(f,'submit',{applicationId:app.id,acknowledgedDocumentIds:docs});
  const submitted=await f.r.journey.submit(f.customer,f.c.id,submitAction);
  const duplicate=await f.r.journey.submit(f.customer,f.c.id,submitAction);assert.equal(duplicate.id,submitted.id);assert.equal(submitted.status,'submitted');
  assert.equal(f.get().applications.length,1);
  await f.r.journey.startReview(f.staff,f.c.id,action(f,'start_review',{applicationId:app.id}));
  const decision={expectedCaseRevision:f.get().caseRevision,applicationId:app.id,idempotencyKey:'accept',decision:'accepted_for_demo',
    demoChecks:{identity:'demo_only',health:'not_underwritten',aml:'not_cleared_for_real_business',information:true}};
  await f.r.journey.decide(f.staff,f.c.id,decision);
  const policy=await f.r.journey.issuePolicy(f.staff,f.c.id,action(f,'issue',{applicationId:app.id}));
  assert.equal(policy.coverageInForce,false);assert.match(policy.label,/DEMO/);
  assert.equal(f.r.journey.portal(f.customer,f.c.id).policies.length,1);
  const token=f.login.sessionToken;await f.r.close();
  const reopened=await createLifeRuntime({dataDirectory:f.directory,provider:f.provider,providerMode:'test',credentials});
  try {const owner=reopened.sessions.authenticate(token);assert.equal(reopened.journey.portal(owner,f.c.id).policies[0].id,policy.id);}finally{await reopened.close();}
});
test('quotes require explicit product selection and actual document acknowledgements',async t=> {
  const f=await fixture(t);const {run}=await f.analyze();const rec=await f.r.engine.recommendation(f.customer,f.c.id);await f.approve(run);
  await assert.rejects(f.r.journey.quote(f.customer,f.c.id,action(f,'no_selection',{recommendationId:rec.id})),e=>e.code==='EXPLICIT_PRODUCT_SELECTION_REQUIRED');
  const q=await f.r.journey.quote(f.customer,f.c.id,action(f,'selected',{recommendationId:rec.id,selectedCandidateIds:[rec.candidates[0].id]}));
  await assert.rejects(f.r.journey.application(f.customer,f.c.id,action(f,'no_docs',{quoteId:q.id})),e=>e.code==='INFORMATION_ACKNOWLEDGEMENT_REQUIRED');
});
test('a new financial draft invalidates analysis, recommendation, quote and speech context',async t=> {
  const f=await fixture(t);const {run}=await f.analyze();const rec=await f.r.engine.recommendation(f.customer,f.c.id);await f.approve(run);
  const q=await f.r.journey.quote(f.customer,f.c.id,action(f,'quote',{recommendationId:rec.id,selectedCandidateIds:[rec.candidates[0].id]}));
  const draft=structuredClone(f.get().draft);draft.financial.persons[0].income.value++;
  await f.r.engine.patchDraft(f.customer,f.c.id,{...draft,expectedCaseRevision:f.get().caseRevision});
  assert.equal(f.r.engine.advisorContext(f.customer,f.c.id).approvedFacts.length,0);
  await assert.rejects(f.r.journey.application(f.customer,f.c.id,action(f,'new_app',{quoteId:q.id})),e=>e.code==='STALE_CONTEXT');
});
test('reopening human review withdraws readiness without changing original risk figures',async t=> {
  const f=await fixture(t);const {run}=await f.analyze();await f.approve(run);const rec=await f.r.engine.recommendation(f.customer,f.c.id);
  await f.r.engine.requestReview(f.customer,f.c.id);assert.equal(f.r.engine.advisorContext(f.customer,f.c.id).reviewStatus,'open');
  await assert.rejects(f.r.journey.quote(f.customer,f.c.id,action(f,'blocked',{recommendationId:rec.id,selectedCandidateIds:[rec.candidates[0].id]})),e=>e.code==='HUMAN_REVIEW_REQUIRED');
  assert.deepEqual(f.get().runs[0].riskNeeds,run.riskNeeds);
});
test('case-scoped agent can propose but cannot confirm, see full case, approve or issue policy',async t=> {
  const f=await fixture(t);const grant=await f.r.sessions.agentToken(f.customer,f.c.id);const agent=f.r.sessions.authenticate(grant.sessionToken);
  assert.equal(f.r.engine.advisorContext(agent,f.c.id).caseId,f.c.id);
  assert.throws(()=>f.r.engine.caseFor(agent,f.c.id),e=>e.code==='NOT_FOUND');
  const p=await f.r.advisory.propose(agent,f.c.id,{messageId:'voice_1',path:'financial.persons.0.income.value',value:8300000,expectedProfileVersion:1});
  assert.equal(f.get().draft.financial.persons[0].income.value,8400000);
  await assert.rejects(f.r.engine.confirm(agent,f.c.id,{}),e=>e.code==='FORBIDDEN');
  await assert.rejects(f.r.engine.reviewDecision(agent,f.c.id,{}),e=>e.code==='FORBIDDEN');
  await assert.rejects(f.r.advisory.propose(agent,f.c.id,{messageId:'bad',path:'__proto__.role',value:true,expectedProfileVersion:1}),e=>e.code==='PATCH_PATH_FORBIDDEN');
  const accepted=await f.r.advisory.accept(f.customer,f.c.id,p.id,{expectedCaseRevision:f.get().caseRevision,accept:true});
  assert.equal(accepted.confirmationStillRequired,true);assert.equal(f.get().confirmedVersions[0].draft.financial.persons[0].income.value,8400000);
});
test('an unprivileged actor cannot claim a reviewer role or read another owner case',async t=> {
  const f=await fixture(t);assert.throws(()=>f.r.engine.list({...f.customer,role:'reviewer'}),e=>e.code==='FORBIDDEN');
  const otherLogin=await f.r.sessions.login(credentials.customerAccessCode,'other');const other=f.r.sessions.authenticate(otherLogin.sessionToken);
  assert.throws(()=>f.r.engine.caseFor(other,f.c.id),e=>e.code==='NOT_FOUND');
  assert.throws(()=>f.r.dossier.bundle(other,f.c.id),e=>e.code==='NOT_FOUND');
});
test('late analysis is stored as stale and cannot replace a newer financial profile',async t=> {
  let release;const barrier=new Promise(r=>release=r);let waiting;
  const entered=new Promise(r=>waiting=r);let first=true;
  const provider=new SyntheticTestProvider({wait:async op=>{if(op==='risk'&&first){first=false;waiting();await barrier;}}});
  const f=await fixture(t,{provider});const pending=f.analyze();await entered;
  const d=structuredClone(f.get().draft);d.financial.persons[0].income.value++;
  await f.r.engine.patchDraft(f.customer,f.c.id,{...d,expectedCaseRevision:f.get().caseRevision});release();
  const result=await pending;assert.equal(result.run.status,'stale');assert.equal(f.get().activeRunId,null);
});
test('tempo changes preserve financial validity and update context revision',async t=> {
  const f=await fixture(t);const {run}=await f.analyze();const before=f.r.engine.advisorContext(f.customer,f.c.id);
  await f.r.engine.preferences(f.customer,f.c.id,{timeBudgetMinutes:30});const after=f.r.engine.advisorContext(f.customer,f.c.id);
  assert.equal(after.runId,run.id);assert.equal(after.calculationInputHash,before.calculationInputHash);assert.ok(after.contextRevision>before.contextRevision);assert.equal(after.tempo,'detailed');
});
test('provider errors remain visible and never fall back to an unrelated archived answer',async t=> {
  const f=await fixture(t,{provider:new SyntheticTestProvider({failOperation:'risk'})});const {run}=await f.analyze();
  assert.equal(run.status,'provider_error');assert.ok(run.providerFailures.some(e=>e.operation==='risk'));
  await assert.rejects(f.r.engine.recommendation(f.customer,f.c.id),e=>e.code==='ANALYSIS_NOT_READY');
});
test('death capital respects finite term, existing capital and debt treatment',()=> {
  const data={annualGapCents:1200000,termMonths:24,annualReturnBps:0,existingDeathCapitalCents:500000,oneOffCostsCents:100000,debtPayoffCents:900000,debtTreatment:'included_in_income_need'};
  assert.equal(deathCapitalNeed(data).capitalNeedCents,2000000);
  assert.equal(deathCapitalNeed({...data,debtTreatment:'pay_off_separately'}).capitalNeedCents,2900000);
  assert.equal(deathCapitalNeed({...data,annualGapCents:null}).capitalNeedCents,null);
});
test('retirement separates both work exits, bridge periods, pension starts and finite capital',async()=> {
  const d=await lifeDraft();const r=retirementTimeline(d.financial,retirementScenario);
  assert.equal(r.periods[0].persons[0].employmentCents,0);assert.equal(r.periods[0].persons[0].pillar1Cents,0);
  assert.ok(r.phases.length>=4);assert.equal(r.guaranteed,false);
  assert.ok(r.periods.every(p=>p.capitalCents===null||p.capitalCents>=0));
  const plan={...retirementScenario,endMonth:'2055-12',monthlyNeedCents:5000000,monthlySavingCents:0};
  assert.ok(retirementTimeline(d.financial,plan).firstUnfundedMonth);
});
test('restricted savings cannot finance an early-retirement bridge before release',async()=> {
  const d=await lifeDraft();d.financial.assets=[];
  const scenario={...retirementScenario,startMonth:'2026-10',endMonth:'2027-12',savingLiquidity:'retirement_restricted',savingsReleaseMonth:'2027-12',releaseAssumptions:[],
    persons:retirementScenario.persons.map(p=>({...p,workEndsMonth:'2027-01',pensionStartsMonth:'2027-12',pillar1MonthlyCents:0,pillar2MonthlyCents:0,pillar3MonthlyCents:0}))};
  const r=retirementTimeline(d.financial,scenario);const bridge=r.periods.find(p=>p.month==='2027-01');
  assert.equal(bridge.capitalCents,0);assert.ok(bridge.restrictedSavingCapitalCents>0);assert.ok(bridge.unfundedCents>0);
});
test('missing capital or pension income remains unknown in retirement phases',async()=> {
  const d=await lifeDraft();d.financial.assets[0].amount.value=null;
  const r=retirementTimeline(d.financial,retirementScenario);assert.equal(r.status,'needs_input');assert.equal(r.periods[0].capitalCents,null);
});
test('draft estimate requires tax inputs instead of inventing a confession',async t=> {
  const f=await fixture(t);const d=structuredClone(f.get().draft);d.insurance.confession1=null;
  await f.r.engine.patchDraft(f.customer,f.c.id,{...d,expectedCaseRevision:f.get().caseRevision});
  const result=await f.r.estimates.calculate(f.customer,f.c.id,{expectedCaseRevision:f.get().caseRevision,noticeVersion:'lifemap-synthetic-v2',allowSyntheticCalculatorTransfer:true,operations:['incomeFortuneTax']});
  assert.equal(result.results.length,0);assert.equal(result.blocked[0].operation,'incomeFortuneTax');assert.equal(result.profileMutated,false);
});
test('customer and advisor summaries share exact snapshot, values and review status',async t=> {
  const f=await fixture(t);await f.analyze();const b=f.r.dossier.bundle(f.customer,f.c.id);
  assert.equal(b.customer.snapshotId,b.advisor.snapshotId);assert.deepEqual(b.customer.metrics,b.advisor.metrics);
  assert.deepEqual(b.customer.reviewTasks,b.advisor.reviewTasks);assert.match(f.r.dossier.html(f.customer,f.c.id,'customer'),/KEIN VERSICHERUNGSSCHUTZ/);
});
test('encrypted store contains no plaintext financial marker and detects tampering',async t=> {
  const f=await fixture(t);const d=structuredClone(f.get().draft);d.financial.persons[0].income.sourceRef='demo:unique-private-financial-marker-for-encryption-check';
  await f.r.engine.patchDraft(f.customer,f.c.id,{...d,expectedCaseRevision:f.get().caseRevision});
  const path=join(f.directory,'cases.enc');const text=await readFile(path,'utf8');assert.ok(!text.includes('unique-private-financial-marker'));
  assert.equal((await stat(join(f.directory,'store.key'))).mode&0o777,0o600);
  await f.r.close();const broken=JSON.parse(text);broken.ciphertext=(broken.ciphertext[0]==='A'?'B':'A')+broken.ciphertext.slice(1);await writeFile(path,JSON.stringify(broken));
  await assert.rejects(EncryptedCaseStore.open(f.directory),e=>e.code==='STORE_INTEGRITY_OR_KEY_FAILURE');
});
test('provider request mapping uses explicit enums and converts cents only at the boundary',async()=> {
  const d=await lifeDraft();const jobs=buildProviderJobs(d,d.financial,{kind:'baseline'},2026);const risk=jobs.find(j=>j.operation==='risk');
  assert.equal(risk.request.Relationship,2);assert.equal(risk.request.Person1.GrossIncome,120000);assert.equal(risk.request.Person2.Sex,2);
  assert.ok(!JSON.stringify(jobs).includes('LOGISMATA_BEARER_TOKEN'));
});
test('shared output schema validates the complete insurance and retirement response',async t=>{
  const f=await fixture(t);const {run}=await f.analyze(retirementScenario,'retirement_v1');
  assert.deepEqual(LifeAnalysisSchema.parse(run),run);assert.ok(run.timeline.periods.length>0);
});
test('free assets can meet death costs when the customer chooses self-funding',async t=>{
  const f=await fixture(t,{intake:false});const d=await lifeDraft();d.insurance.riskCapitalStrategy='use_free_assets_first';
  let c=await f.r.engine.patchDraft(f.customer,f.c.id,{...d,expectedCaseRevision:f.get().caseRevision});
  await f.r.engine.confirm(f.customer,f.c.id,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v2'});
  const {run}=await f.analyze();const death=run.riskNeeds.filter(r=>r.event.startsWith('death'));
  assert.ok(death.every(r=>r.deathCapitalCents===0&&r.liquidAssetsAppliedCents===1000000));
  const rec=await f.r.engine.recommendation(f.customer,f.c.id);assert.ok(!rec.candidates.some(c=>c.productId==='pax_term_life'));
});
test('declared need is not lowered when a provider reports a clamped target',async()=>{
  const d=await lifeDraft();const provider=new SyntheticTestProvider();const request=buildProviderJobs(d,d.financial,{kind:'baseline'},2026).find(j=>j.operation==='risk').request;
  const result=await provider.execute('risk',request);
  const reported=result.metrics.find(m=>m.id==='risk_1_need');reported.value=100;
  const needs=deriveRiskNeeds(d,d.financial,[result]);
  assert.equal(needs[0].annualNeedCents,15000000);assert.equal(needs[0].providerReportedNeedCents,100);
  assert.equal(needs[0].annualGapCents,Math.max(0,15000000-needs[0].providerIncomeCents));
});
test('scenario comparisons preserve source runs and provide only comparable money deltas',async t=>{
  const f=await fixture(t);const baseline=(await f.analyze()).run;
  const variant=(await f.analyze({kind:'family',personId:'person_demo_1',newEmploymentRateBps:6000,additionalMonthlyCostCents:80000,linearIncomeAssumptionConfirmed:true},'family_v1')).run;
  const calls=f.provider.calls.length;
  const comparison=await f.r.comparisons.create(f.customer,f.c.id,{baselineRunId:baseline.id,variantRunId:variant.id,expectedProfileVersion:1});
  const cash=comparison.metrics.find(m=>m.id==='cashflowAnnual');assert.ok(cash.delta<0);assert.equal(cash.period,'year');
  assert.equal(cash.delta,variant.local.metrics.find(m=>m.id===cash.id).value-baseline.local.metrics.find(m=>m.id===cash.id).value);
  assert.equal(f.provider.calls.length,calls);assert.equal(comparison.baselineInputHash,baseline.inputHash);
  assert.equal(f.r.engine.advisorContext(f.customer,f.c.id).scenarioComparisons[0].id,comparison.id);
  const d=structuredClone(f.get().draft);d.financial.persons[0].income.value++;
  await f.r.engine.patchDraft(f.customer,f.c.id,{...d,expectedCaseRevision:f.get().caseRevision});
  assert.equal(f.r.comparisons.get(f.customer,f.c.id,comparison.id).stale,true);
  await assert.rejects(f.r.comparisons.create(f.customer,f.c.id,{baselineRunId:baseline.id,variantRunId:variant.id,expectedProfileVersion:1}),e=>e.code==='STALE_CONTEXT');
});
test('capital release and a full annuity from that same pension asset cannot be counted together',async()=>{
  const d=await lifeDraft();const s=structuredClone(retirementScenario);s.persons[0].pillar3MonthlyCents=50000;
  assert.throws(()=>retirementTimeline(d.financial,s),/Capital and full annuity/);
});
test('child support duration is requested explicitly and sole custody enables child benefits',async()=>{
  const d=await lifeDraft();d.insurance.children=[{id:'child_demo',birthYear:2015,kind:'sole_custody',parentPersonIds:['person_demo_1'],supportUntilMonth:null,goalId:null}];
  assert.ok(intakeQuestions(d).includes('insurance.children.child_demo.supportUntilMonth'));
  d.insurance.children[0].supportUntilMonth='2038-08';
  const risk=buildProviderJobs(d,d.financial,{kind:'baseline'},2026).find(j=>j.operation==='risk');
  assert.equal(risk.request.WithChildren,true);assert.equal(risk.request.Person1.NumberOfChildren,1);
});
test('a proposal becomes stale when the draft changes even before a new confirmation',async t=>{
  const f=await fixture(t);const grant=await f.r.sessions.agentToken(f.customer,f.c.id);const agent=f.r.sessions.authenticate(grant.sessionToken);
  const p=await f.r.advisory.propose(agent,f.c.id,{messageId:'stale_test',path:'financial.persons.0.income.value',value:8300000,expectedProfileVersion:1});
  const d=structuredClone(f.get().draft);d.financial.persons[0].income.value=8500000;
  await f.r.engine.patchDraft(f.customer,f.c.id,{...d,expectedCaseRevision:f.get().caseRevision});
  await assert.rejects(f.r.advisory.accept(f.customer,f.c.id,p.id,{expectedCaseRevision:f.get().caseRevision,accept:true}),e=>e.code==='STALE_PROPOSAL');
});
test('NPS is stage-bound, deduplicated and exposed only as reviewer aggregates',async t=>{
  const f=await fixture(t);await f.r.insights.feedback(f.customer,f.c.id,{score:10,stage:'advice'});
  await assert.rejects(f.r.insights.feedback(f.customer,f.c.id,{score:10,stage:'advice'}),e=>e.code==='FEEDBACK_ALREADY_RECORDED');
  await assert.rejects(f.r.insights.feedback(f.customer,f.c.id,{score:10,stage:'portal'}),e=>e.code==='FEEDBACK_STAGE_NOT_REACHED');
  assert.throws(()=>f.r.insights.aggregate(f.customer),e=>e.code==='FORBIDDEN');
  const report=f.r.insights.aggregate(f.staff);assert.equal(report.nps.score,100);assert.equal(report.containsFinancialAmounts,false);
  assert.ok(!JSON.stringify(report).includes(f.c.id));
});
test('unparsed provider errors cannot inject payloads into persisted failures',async t=>{
  const p=new SyntheticTestProvider();const execute=p.execute.bind(p);p.execute=async(op,req)=>{if(op==='risk')throw {code:'unsafe/private/token/value'};return execute(op,req);};
  const f=await fixture(t,{provider:p});const {run}=await f.analyze();
  assert.equal(run.providerFailures.find(f=>f.operation==='risk').code,'PROVIDER_ERROR');
});
test('child recommendations identify the insured child separately from the funding adult',async t=>{
  const f=await fixture(t,{intake:false});const d=await lifeDraft();
  d.goals.push({id:'goal_child',kind:'child_protection',targetMonth:'2038-01',priority:3,targetCapitalCents:5000000});
  d.insurance.children=[{id:'child_demo',birthYear:2015,kind:'goal_only',parentPersonIds:['person_demo_1'],supportUntilMonth:null,goalId:'goal_child'}];
  let c=await f.r.engine.patchDraft(f.customer,f.c.id,{...d,expectedCaseRevision:f.get().caseRevision});
  await f.r.engine.confirm(f.customer,f.c.id,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v2'});
  await f.analyze();const rec=await f.r.engine.recommendation(f.customer,f.c.id);const child=rec.candidates.find(c=>c.productId==='pax_child');
  assert.equal(child.insuredChildId,'child_demo');assert.equal(child.personId,'person_demo_1');
});
test('financial owners and child parents must refer to actual household people',async()=>{
  const d=await lifeDraft();d.financial.assets[0].ownerPersonIds=['someone_else'];assert.equal(DraftSchema.safeParse(d).success,false);
  delete d.financial.assets[0].ownerPersonIds;
  d.insurance.children=[{id:'child_demo',birthYear:2015,kind:'goal_only',parentPersonIds:['someone_else'],supportUntilMonth:null,goalId:null}];
  assert.equal(DraftSchema.safeParse(d).success,false);
});
test('customer logout revokes its delegated agent sessions as well',async t=>{
  const f=await fixture(t);const grant=await f.r.sessions.agentToken(f.customer,f.c.id);const agent=f.r.sessions.authenticate(grant.sessionToken);
  assert.equal(f.r.engine.advisorContext(agent,f.c.id).caseId,f.c.id);
  await f.r.sessions.revoke(f.customer);
  assert.throws(()=>f.r.sessions.authenticate(grant.sessionToken),e=>e.code==='UNAUTHORIZED');
});
