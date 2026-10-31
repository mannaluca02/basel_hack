import 'reflect-metadata';
import { mkdtemp,rm,readFile,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLifeInsuranceApp } from '../apps/api/dist/insurance/app.js';

const token=process.env.LOGISMATA_BEARER_TOKEN;
if(!token)throw new Error('LOGISMATA_BEARER_TOKEN is required; real customer data is not used.');
const directory=await mkdtemp(join(tmpdir(),'pax-life-live-journey-'));
const report={dataClassification:'synthetic',providerMode:'live',automatedReviewer:'test-only role simulation; no real Pax expert approval',
  capturedAt:new Date().toISOString(),stages:[],scenarioRuns:[],comparisons:[],operations:[],coverageInForce:false};
let app,runtime,base;
async function call(method,path,session,body) {
  const r=await fetch(base+path,{method,headers:{...(session?{Authorization:`Bearer ${session}`} : {}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await r.json();if(!r.ok)throw new Error(`${method} ${path}: ${r.status} ${data.code??'FAILED'}`);return data;
}
try {
  ({app,runtime}=await createLifeInsuranceApp({dataDirectory:directory,providerMode:'live',token}));await app.listen(0,'127.0.0.1');base=await app.getUrl();
  const codes=await runtime.store.credentials();
  const customer=await call('POST','/api/sessions',null,{accessCode:codes.customerAccessCode});
  const reviewer=await call('POST','/api/sessions',null,{accessCode:codes.reviewerAccessCode});
  let c=await call('POST','/api/cases',customer.sessionToken,{locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v1',dataClassification:'synthetic'});
  const path=`/api/cases/${c.id}`;
  const draft=JSON.parse(await readFile(new URL('../fixtures/insurance-household.json',import.meta.url),'utf8'));
  draft.financial.valuationDate=new Date().toISOString().slice(0,10);
  c=await call('PATCH',`${path}/draft`,customer.sessionToken,{...draft,expectedCaseRevision:c.caseRevision});
  c=await call('POST',`${path}/confirmations`,customer.sessionToken,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v1'});
  report.stages.push('profile_confirmed');
  const locations=await call('POST',`${path}/locations`,customer.sessionToken,{search:'Basel',allowSyntheticCalculatorTransfer:true});
  if(!locations.locations.length)throw new Error('Live location search returned no Basel location');
  report.operations.push('searchLocation');
  const estimates=await call('POST',`${path}/calculator-estimates`,customer.sessionToken,{expectedCaseRevision:c.caseRevision,
    noticeVersion:'lifemap-synthetic-v1',allowSyntheticCalculatorTransfer:true,
    operations:['income','budgetProposal','incomeFortuneTax','saving3a','capitalTax','purchaseP2'],
    saving3a:{years:20,initialCents:0,annualCents:100000},capitalTax:{paymentCents:25000000,paymentAge:65},
    purchaseP2:{investmentCents:500000,years:5,conversionBps:600}});
  report.estimateErrors=estimates.errors;report.estimateBlocked=estimates.blocked;
  report.operations.push(...estimates.results.filter(r=>r.provenance.mode==='live').map(r=>r.operation));
  const retirement={kind:'retirement',goalId:'goal_retirement',startMonth:'2047-01',endMonth:'2055-12',incomeBasis:'net_after_income_tax',
    monthlyNeedCents:500000,monthlySavingCents:50000,annualReturnBps:0,savingLiquidity:'retirement_restricted',savingsReleaseMonth:'2050-01',
    releaseAssumptions:[{assetId:'pillar3_account',availableMonth:'2050-01'}],assumptionsConfirmed:true,priceBasis:'nominal',
    persons:[{personId:'person_demo_1',workEndsMonth:'2047-01',pensionStartsMonth:'2050-01',pillar1MonthlyCents:230000,pillar2MonthlyCents:300000,pillar3MonthlyCents:0},
      {personId:'person_demo_2',workEndsMonth:'2049-01',pensionStartsMonth:'2052-01',pillar1MonthlyCents:200000,pillar2MonthlyCents:150000,pillar3MonthlyCents:0}]};
  const scenarios=[{kind:'baseline'},{kind:'family',personId:'person_demo_1',newEmploymentRateBps:6000,additionalMonthlyCostCents:80000,linearIncomeAssumptionConfirmed:true},
    {kind:'home',purchasePriceCents:100000000,equityRateBps:2000,purchaseCostsCents:3000000,reserveCents:1500000,annualInterestBps:500,annualMaintenanceBps:100,annualAmortizationCents:1000000,assumptionsConfirmed:true},retirement];
  let baseline;
  for(const scenario of scenarios) {
    c=await call('GET',path,customer.sessionToken);
    const response=await call('POST',`${path}/calculations`,customer.sessionToken,{expectedCaseRevision:c.caseRevision,expectedProfileVersion:1,scenarioVersionId:`live_${scenario.kind}_v1`,scenario});
    const run=response.run;report.operations.push(...run.providerResults.filter(r=>r.provenance.mode==='live').map(r=>r.operation));
    report.scenarioRuns.push({scenario:scenario.kind,status:run.status,providerFailures:run.providerFailures,
      providerStatuses:run.providerResults.map(r=>({operation:r.operation,status:r.status})),timelinePhases:run.timeline?.phases.length??0});
    if(run.status!=='current')throw new Error(`Live ${scenario.kind} could not be completed: ${JSON.stringify(run.providerFailures)}`);
    if(scenario.kind==='baseline')baseline=run;
    else {
      const comparison=await call('POST',`${path}/comparisons`,customer.sessionToken,{baselineRunId:baseline.id,variantRunId:run.id,expectedProfileVersion:1});
      report.comparisons.push({scenario:scenario.kind,metrics:comparison.metrics.length,cashflowDeltaCents:comparison.metrics.find(m=>m.id==='cashflowAnnual')?.delta??null});
    }
  }
  await call('POST',`${path}/active-analysis`,customer.sessionToken,{runId:baseline.id});
  const rec=await call('POST',`${path}/recommendations`,customer.sessionToken,{});
  if(!rec.candidates.length)throw new Error('No candidate for the explicit synthetic needs');
  c=await call('GET',path,customer.sessionToken);const task=c.reviewTasks.filter(t=>t.runId===baseline.id).at(-1);
  await call('POST',`${path}/review-decisions`,reviewer.sessionToken,{runId:baseline.id,decision:'approved_for_demo',acknowledgedReasonCodes:task.reasons,
    criteria:['data_sources_checked','need_and_units_checked','beneficiaries_checked','personal_affordability_checked','demo_only_understood']});
  report.stages.push('recommendation_explained','reviewer_role_gate_exercised');
  const action=async(key,extra={})=>{const c=await call('GET',path,customer.sessionToken);return {expectedCaseRevision:c.caseRevision,idempotencyKey:key,demoAcknowledged:true,informationDocumentsAcknowledged:true,...extra};};
  const selected=rec.candidates.find(p=>p.productId==='pax_3a')??rec.candidates.find(p=>p.productId==='pax_term_life')??rec.candidates[0];
  const quote=await call('POST',`${path}/demo-quotes`,customer.sessionToken,await action('quote',{recommendationId:rec.id,selectedCandidateIds:[selected.id]}));
  const docs=quote.documents.map(d=>d.id);
  const application=await call('POST',`${path}/demo-applications`,customer.sessionToken,await action('application',{quoteId:quote.id,acknowledgedDocumentIds:docs}));
  const submit=await action('submit',{applicationId:application.id,acknowledgedDocumentIds:docs});
  await call('POST',`${path}/demo-applications/submit`,customer.sessionToken,submit);
  await call('POST',`${path}/demo-applications/submit`,customer.sessionToken,submit);
  await call('POST',`${path}/demo-applications/start-review`,reviewer.sessionToken,await action('review',{applicationId:application.id}));
  c=await call('GET',path,customer.sessionToken);
  await call('POST',`${path}/demo-applications/decisions`,reviewer.sessionToken,{expectedCaseRevision:c.caseRevision,applicationId:application.id,idempotencyKey:'accept',decision:'accepted_for_demo',
    demoChecks:{identity:'demo_only',health:'not_underwritten',aml:'not_cleared_for_real_business',information:true}});
  const policy=await call('POST',`${path}/demo-policies`,reviewer.sessionToken,await action('issue',{applicationId:application.id}));
  if(policy.coverageInForce!==false)throw new Error('Demo issued real coverage unexpectedly');
  const bundle=await call('GET',`${path}/summaries`,customer.sessionToken);
  if(bundle.customer.snapshotId!==bundle.advisor.snapshotId)throw new Error('Summary snapshots differ');
  report.stages.push('demo_quote','demo_application','idempotent_submission','demo_acceptance','demo_policy','matching_summary_snapshots');
  await app.close();app=null;
  ({app,runtime}=await createLifeInsuranceApp({dataDirectory:directory,providerMode:'live',token}));await app.listen(0,'127.0.0.1');base=await app.getUrl();
  const portal=await call('GET',`${path}/portal`,customer.sessionToken);
  if(portal.policies.length!==1||portal.policies[0].id!==policy.id)throw new Error('Persisted policy could not be resumed');
  report.stages.push('portal_after_restart');report.operations=[...new Set(report.operations)].sort();
  report.status=report.estimateErrors.length||report.estimateBlocked.length?'partial':'passed';
  console.log(JSON.stringify(report,null,2));
  if(process.env.LIFEMAP_LIVE_REPORT)await writeFile(process.env.LIFEMAP_LIVE_REPORT,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  if(report.status!=='passed')process.exitCode=1;
}catch(error){report.status='failed';report.error=error.message;console.error(JSON.stringify(report,null,2));process.exitCode=1;}
finally{await app?.close();await rm(directory,{recursive:true,force:true});}
