import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CalculationService,createAnalysisRequest } from '../apps/api/dist/calculation/calculation.service.js';
import { loadDemoSnapshot,DEMO_SCENARIOS } from '../apps/api/dist/demo/fixtures.js';
import { calculationInputHash } from '../apps/api/dist/calculation/hash.js';
import { AnalysisResultSchema } from '@pax/contracts';

const service=new CalculationService();const c=await loadDemoSnapshot();
test('I03 produces a runtime-valid I04 with sources, units and independent readiness',()=> {
  const r=service.analyze(createAnalysisRequest(c));assert.ok(AnalysisResultSchema.safeParse(r).success);
  assert.equal(r.dataClassification,'synthetic');assert.equal(r.progress.domain,'data_capture');assert.equal(r.progress.reviewOpen,true);
  assert.ok(r.metrics.every(m=>m.sourceRefs.length>0));assert.equal(r.metrics.find(m=>m.id==='pillar3Capital').value,5000000);
});
test('a modified financial input cannot reuse the old hash',()=> {
  const request=createAnalysisRequest(c);request.snapshot.persons[0].income.value+=100;
  assert.throws(()=>service.analyze(request),e=>e.code==='INPUT_HASH_MISMATCH');
});
test('case revision alone preserves the financial hash; a new income invalidates it',()=> {
  const d=structuredClone(c);d.caseRevision++;
  assert.equal(calculationInputHash(c,{kind:'baseline'},'s',['budget']),calculationInputHash(d,{kind:'baseline'},'s',['budget']));
  d.persons[0].income.value++;assert.notEqual(calculationInputHash(c,{kind:'baseline'},'s',['budget']),calculationInputHash(d,{kind:'baseline'},'s',['budget']));
});
test('only requested areas are returned',()=> {
  const r=service.analyze(createAnalysisRequest(c,{kind:'baseline'},'s',['capital']));
  assert.deepEqual(Object.keys(r.statusByArea),['capital']);assert.ok(r.metrics.every(m=>m.period==='once'));
});
test('a capital-only home analysis also omits its annual housing-cost metric',()=> {
  const r=service.analyze(createAnalysisRequest(c,DEMO_SCENARIOS.home,'home_v1',['capital']));
  assert.ok(r.metrics.every(m=>m.period==='once'));assert.ok(!r.metrics.some(m=>m.id==='home_annualHousingCost'));
});
test('graph facts reject stale runs, person/metric mismatches and changed financial state',()=> {
  const request=createAnalysisRequest(c);const result=service.analyze(request);
  const context={caseId:c.caseId,profileVersion:c.profileVersion,scenarioVersionId:result.scenarioVersionId,runId:result.runId,
    graphId:'household_budget',metricId:'cashflowAnnual',periodStart:result.periodStart,periodEnd:result.periodEnd};
  assert.equal(service.graphFacts(context,result,request).metric.value,5160000);
  assert.throws(()=>service.graphFacts({...context,runId:'old'},result,request),e=>e.code==='STALE_CONTEXT');
  assert.throws(()=>service.graphFacts({...context,personId:'person_demo_1'},result,request),e=>e.code==='METRIC_UNAVAILABLE');
  const changed=structuredClone(c);changed.persons[0].income.value+=100;
  assert.throws(()=>service.graphFacts(context,result,createAnalysisRequest(changed)),e=>e.code==='STALE_CONTEXT');
});
test('family baseline pension values are marked as requiring review in the new scenario',()=> {
  const r=service.analyze(createAnalysisRequest(c,DEMO_SCENARIOS.family,'family_v1'));
  assert.equal(r.statusByArea.pillars,'requires_review');assert.ok(r.metrics.filter(m=>m.id.startsWith('pillar_')).every(m=>m.status==='requires_review'));
});
test('home allocation ledger remains auditable and cannot be reused as free capital',()=> {
  const r=service.analyze(createAnalysisRequest(c,DEMO_SCENARIOS.home,'home_v1'));
  const cash=r.capitalBreakdown.find(a=>a.assetId==='cash');assert.equal(cash.freeCents,0);
  assert.equal(cash.allocations.reduce((sum,a)=>sum+a.amountCents,0),cash.totalCents);
  assert.equal(cash.allocations.find(a=>a.goalId==='home_reserve').amountCents,1500000);
});
test('a bundled housing expense blocks the scenario instead of counting rent twice',()=> {
  const d=structuredClone(c);d.expenses.find(e=>e.id==='housing').includedInExpenseId='living';
  const r=service.analyze(createAnalysisRequest(d,DEMO_SCENARIOS.home,'home_v1'));
  assert.equal(r.statusByArea.budget,'needs_input');assert.equal(r.metrics.find(m=>m.id==='cashflowAnnual').value,null);
});
