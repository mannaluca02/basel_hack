import {test} from 'node:test';
import assert from 'node:assert/strict';
import {credentials,demoApp} from './helpers/demo-http.mjs';

/**
 * The selected chart point (AI-04): the customer picks an exact run, person, metric and period in
 * a chart; the backend checks it against the run and hands the advisor only those facts. Also
 * the switch between saved analyses, which the charts' scenario choice uses.
 */
const graph=(c,run,extra)=>({caseId:c.id,profileVersion:run.profileVersion,scenarioVersionId:run.scenarioVersionId,runId:run.id,
  periodStart:run.local.periodStart,periodEnd:run.local.periodEnd,...extra});
const active=c=>c.runs.find(r=>r.id===c.activeRunId);

test('a household, capital or pillar metric of the active analysis becomes the advisor\'s selected facts',async t=>{
  const f=await demoApp(t);
  let c=await f.current();const run=active(c);
  const income=await f.customer.call('POST',`${f.path}/graph-context`,graph(c,run,{graphId:'household_budget',metricId:'incomeAnnual'}));
  assert.equal(income.status,201,JSON.stringify(income.body));
  assert.equal(income.body.metric.id,'incomeAnnual');
  assert.equal(income.body.runId,run.id);
  assert.equal(income.body.inputHash,run.inputHash);
  assert.deepEqual(income.body.series,[]);

  const context=(await f.customer.call('GET',`${f.path}/advisor/context`)).body;
  assert.equal(context.graphContext.metricId,'incomeAnnual');
  assert.match(context.contextId,/^[a-f0-9]{64}$/);
  assert.equal(context.selectedGraphFacts.metric.id,'incomeAnnual');
  assert.ok(context.contextRevision>c.contextRevision,'the selection is a context change');

  c=await f.current();
  const capital=await f.customer.call('POST',`${f.path}/graph-context`,graph(c,run,{graphId:'capital_overview',metricId:'freeCapital'}));
  assert.equal(capital.status,201,JSON.stringify(capital.body));
  const pillarMetric=run.local.metrics.find(m=>m.id.startsWith('pillar_')&&m.value!==null);
  const pillar=await f.customer.call('POST',`${f.path}/graph-context`,graph(c,run,{graphId:'pillar_overview',metricId:pillarMetric.id,personId:pillarMetric.personId}));
  assert.equal(pillar.status,201,JSON.stringify(pillar.body));
  assert.equal(pillar.body.metric.personId,pillarMetric.personId);
});

test('a selection that does not match the run, the chart or its period is refused',async t=>{
  const f=await demoApp(t);
  const c=await f.current(),run=active(c);
  const refuse=async(extra,code)=>{
    const r=await f.customer.call('POST',`${f.path}/graph-context`,graph(c,run,extra));
    assert.equal(r.body.code,code,JSON.stringify(extra));
  };
  await refuse({graphId:'capital_overview',metricId:'incomeAnnual'},'METRIC_UNAVAILABLE');
  await refuse({graphId:'household_budget',metricId:'no_such_metric'},'METRIC_UNAVAILABLE');
  await refuse({graphId:'household_budget',metricId:'incomeAnnual',runId:c.runs.find(r=>r.id!==run.id).id},'STALE_CONTEXT');
  await refuse({graphId:'household_budget',metricId:'incomeAnnual',profileVersion:run.profileVersion+1},'STALE_CONTEXT');
  await refuse({graphId:'household_budget',metricId:'incomeAnnual',periodStart:'2000-01'},'STALE_CONTEXT');
  await refuse({graphId:'household_budget',metricId:'incomeAnnual',periodEnd:'2199-12'},'STALE_CONTEXT');
  await refuse({graphId:'retirement_timeline',metricId:'retirement_income'},'STALE_CONTEXT');
  const backwards=await f.customer.call('POST',`${f.path}/graph-context`,graph(c,run,{graphId:'household_budget',metricId:'incomeAnnual',periodStart:run.local.periodEnd,periodEnd:run.local.periodStart}));
  assert.equal(backwards.status,400,'end before start');
});

test('risk gaps are spoken only after the Pax review approved the analysis',async t=>{
  const f=await demoApp(t);
  let c=await f.current();const run=active(c);
  const need=run.riskNeeds.find(r=>r.annualGapCents!==null);
  const metricId=`risk_${need.scenario}_gap`;
  const selected=await f.customer.call('POST',`${f.path}/graph-context`,graph(c,run,{graphId:'risk_coverage',metricId,personId:need.personId}));
  assert.equal(selected.status,201,JSON.stringify(selected.body));
  assert.equal(selected.body.metric.value,need.annualGapCents);

  let context=(await f.customer.call('GET',`${f.path}/advisor/context`)).body;
  assert.equal(context.maySpeakSelectedAmounts,false,'an unreviewed risk gap stays silent');
  assert.ok(!context.approvedFacts.some(x=>x.metricId===metricId));
  assert.equal(context.reviewStatus,'open');

  await f.customer.call('POST',`${f.path}/demo-review`,{});
  context=(await f.customer.call('GET',`${f.path}/advisor/context`)).body;
  assert.equal(context.reviewStatus,'approved_for_demo');
  assert.equal(context.maySpeakSelectedAmounts,true);
  assert.ok(context.approvedFacts.some(x=>x.metricId===metricId&&x.humanReviewedForDemo));

  c=await f.current();
  const wrongChart=await f.customer.call('POST',`${f.path}/graph-context`,graph(c,run,{graphId:'household_budget',metricId,personId:need.personId}));
  assert.equal(wrongChart.body.code,'METRIC_UNAVAILABLE');
});

test('the retirement timeline: monthly series per range, summarised for the advisor beyond two years',async t=>{
  const f=await demoApp(t);
  let c=await f.current();
  const retirement=c.runs.find(r=>r.scenarioVersionId==='standard_retirement_v1');
  const switched=await f.customer.call('POST',`${f.path}/active-analysis`,{runId:retirement.id});
  assert.equal(switched.status,201,JSON.stringify(switched.body));
  assert.equal(switched.body.run.id,retirement.id);
  c=await f.current();
  assert.equal(c.activeRunId,retirement.id);

  const months=retirement.timeline.periods;
  const timeline=(extra)=>({caseId:c.id,profileVersion:retirement.profileVersion,scenarioVersionId:retirement.scenarioVersionId,runId:retirement.id,
    graphId:'retirement_timeline',periodStart:months[0].month,periodEnd:months[0].month,...extra});

  // One month: one value.
  const one=await f.customer.call('POST',`${f.path}/graph-context`,timeline({metricId:'retirement_income'}));
  assert.equal(one.status,201,JSON.stringify(one.body));
  assert.equal(one.body.series.length,1);
  assert.equal(one.body.metric.value,one.body.series[0].value);
  assert.equal(one.body.metric.period,'month');

  // Every household metric of the timeline.
  for(const metricId of ['retirement_need','retirement_withdrawal','retirement_capital','retirement_gap']) {
    c=await f.current();
    const r=await f.customer.call('POST',`${f.path}/graph-context`,timeline({metricId,periodEnd:months[2].month}));
    assert.equal(r.status,201,`${metricId}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.series.length,3);
    assert.equal(r.body.metric.period,'range','a range is never relabelled as one month');
    assert.equal(r.body.series[0].period,metricId==='retirement_capital'?'once':'month');
  }

  // Income of one person; household metrics are not personal.
  const person=months[0].persons[0].personId;
  c=await f.current();
  const personal=await f.customer.call('POST',`${f.path}/graph-context`,timeline({metricId:'retirement_income',personId:person}));
  assert.equal(personal.status,201,JSON.stringify(personal.body));
  assert.equal((await f.customer.call('POST',`${f.path}/graph-context`,timeline({metricId:'retirement_need',personId:person}))).body.code,'HOUSEHOLD_METRIC_NOT_PERSONAL');
  assert.equal((await f.customer.call('POST',`${f.path}/graph-context`,timeline({metricId:'retirement_income',personId:'person_unknown'}))).body.code,'METRIC_UNAVAILABLE');
  assert.equal((await f.customer.call('POST',`${f.path}/graph-context`,timeline({metricId:'retirement_other'}))).body.code,'METRIC_UNAVAILABLE');
  assert.equal((await f.customer.call('POST',`${f.path}/graph-context`,timeline({metricId:'retirement_income',periodEnd:'2199-12'}))).body.code,'STALE_CONTEXT');

  // More than 24 months: the advisor gets a summary instead of hundreds of points.
  c=await f.current();
  const long=await f.customer.call('POST',`${f.path}/graph-context`,timeline({metricId:'retirement_income',periodEnd:months[30].month}));
  assert.equal(long.status,201,JSON.stringify(long.body));
  assert.equal(long.body.series.length,31);
  const context=(await f.customer.call('GET',`${f.path}/advisor/context`)).body;
  assert.deepEqual(context.selectedGraphFacts.series,[]);
  assert.equal(context.selectedGraphFacts.rangeSummary.points,31);
  assert.equal(context.selectedGraphFacts.rangeSummary.first.month,months[0].month);
  assert.equal(context.selectedGraphFacts.rangeSummary.last.month,months[30].month);
});

test('only a current analysis of the confirmed profile can become active',async t=>{
  const f=await demoApp(t);
  assert.equal((await f.customer.call('POST',`${f.path}/active-analysis`,{runId:crypto.randomUUID()})).body.code,'STALE_CONTEXT');
  assert.equal((await f.customer.call('POST',`${f.path}/active-analysis`,{runId:'not-a-uuid'})).status,400);
  assert.equal((await f.reviewer.signIn(credentials.reviewerAccessCode)).role,'reviewer');
  const c=await f.current();
  const reviewerSwitch=await f.reviewer.call('POST',`${f.path}/active-analysis`,{runId:c.runs[0].id});
  assert.equal(reviewerSwitch.status,403,'only the customer chooses');
});
