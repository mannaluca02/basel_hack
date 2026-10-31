import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CaseSnapshotSchema,GraphContextSchema } from '@pax/contracts';
import { calculateBudget,calculateCapital,calculateProgress,summarizePillars,simulateScenario,simulateCapital,annual } from '@pax/domain';
import { loadDemoSnapshot,DEMO_SCENARIOS } from '../apps/api/dist/demo/fixtures.js';

const fixture=await loadDemoSnapshot();const fresh=()=>structuredClone(fixture);
test('baseline budget keeps annual units and an explicit safety margin',()=> {
  const r=calculateBudget(fresh());assert.equal(r.incomeAnnual.value,13200000);assert.equal(r.expensesAnnual.value,8040000);
  assert.equal(r.cashflowAnnual.value,5160000);assert.equal(r.affordableContributionAnnual.value,4560000);
  assert.equal(r.status,'estimated');assert.equal(r.cashflowAnnual.unit,'cent');
});
test('monthly and annual income inputs give the same cashflow',()=> {
  const c=fresh();for(const p of c.persons){p.income.value/=12;p.income.period='month';}
  assert.equal(calculateBudget(c).cashflowAnnual.value,calculateBudget(fixture).cashflowAnnual.value);
});
test('a contribution already included in a containing expense is deducted once',()=> {
  const c=fresh();c.expenses.find(e=>e.id==='living').amount.value+=50000;
  c.expenses.find(e=>e.id==='provision').includedInExpenseId='living';
  assert.equal(calculateBudget(c).expensesAnnual.value,8040000);
});
test('tax already included in net-after-tax income is not deducted again',()=> {
  const c=fresh();c.expenses.find(e=>e.id==='tax').amount.value=60000;
  assert.equal(calculateBudget(c).cashflowAnnual.value,5160000);
});
test('tax included inside a bundled living cost is also excluded exactly once',()=> {
  const c=fresh();c.expenses.find(e=>e.id==='tax').amount.value=60000;c.expenses.find(e=>e.id==='tax').includedInExpenseId='living';
  c.expenses.find(e=>e.id==='living').amount.value+=60000;
  assert.equal(calculateBudget(c).expensesAnnual.value,8040000);
});
test('before-tax income deducts the explicit income-tax expense',()=> {
  const c=fresh();for(const p of c.persons)p.incomeBasis='net_before_income_tax';c.expenses.find(e=>e.id==='tax').amount.value=60000;
  assert.equal(calculateBudget(c).cashflowAnnual.value,4440000);
});
test('unknown expense and a missing expense category never become a green zero',()=> {
  const c=fresh();c.expenses.find(e=>e.id==='living').amount.value=null;
  assert.equal(calculateBudget(c).affordableContributionAnnual.value,null);
  c.expenses=c.expenses.filter(e=>e.id!=='debt');assert.equal(calculateBudget(c).status,'needs_input');
});
test('gross or mixed tax bases require clarification instead of invented net income',()=> {
  const c=fresh();c.persons[0].incomeBasis='gross';assert.equal(calculateBudget(c).incomeAnnual.value,null);
  c.persons[0].incomeBasis='net_before_income_tax';assert.equal(calculateBudget(c).cashflowAnnual.value,null);
});
test('an explicit zero is usable; a deficit remains visible',()=> {
  const c=fresh();c.expenses.find(e=>e.id==='living').amount.value=2000000;
  const r=calculateBudget(c);assert.ok(r.cashflowAnnual.value<0);assert.equal(r.affordableContributionAnnual.value,0);
  assert.equal(r.deficitAnnual.value,-r.cashflowAnnual.value);
});
test('expense breakdown exceeding its parent is not silently accepted',()=> {
  const c=fresh();c.expenses.find(e=>e.id==='provision').includedInExpenseId='debt';
  assert.equal(calculateBudget(c).status,'needs_input');
});
test('restricted pension capital and existing reservations stay out of free cash',()=> {
  const r=calculateCapital(fresh());assert.equal(r.freeCapital.value,9000000);
  assert.equal(r.assets.find(a=>a.id==='pillar3_account').excludedReason,'restricted');
});
test('capital cannot be fully committed to two goals',()=> {
  const c=fresh();c.assets[0].allocations.push({goalId:'home',amountCents:10000000});
  const r=calculateCapital(c);assert.equal(r.freeCapital.value,null);assert.ok(r.issues.some(i=>i.code==='CAPITAL_DOUBLE_ALLOCATED'));
});
test('future liquidity is not available now and unconfirmed absence of assets is unknown',()=> {
  const c=fresh();c.assets[0].availableFrom='2030-01-01';assert.equal(calculateCapital(c).freeCapital.value,0);
  c.assets=[];c.assetsConfirmed=false;assert.equal(calculateCapital(c).freeCapital.value,null);
});
test('family scenario preserves baseline and does not proportionally invent PK benefits',()=> {
  const c=fresh();const before=JSON.stringify(c);const r=simulateScenario(c,DEMO_SCENARIOS.family);
  assert.equal(JSON.stringify(c),before);assert.equal(calculateBudget(r.snapshot).cashflowAnnual.value,840000);
  assert.deepEqual(r.snapshot.provisions,c.provisions);assert.ok(r.issues.some(i=>i.code==='PENSION_FUND_EFFECT_OPEN'));
});
test('home scenario protects a reserve, reports the shortfall and removes its committed capital',()=> {
  const c=fresh();const r=simulateScenario(c,DEMO_SCENARIOS.home);
  assert.equal(r.home.fundingGap.value,15500000);assert.equal(r.home.protectedReserve.value,1500000);
  assert.equal(calculateCapital(r.snapshot).freeCapital.value,0);assert.equal(calculateCapital(c).freeCapital.value,9000000);
  assert.equal(calculateBudget(r.snapshot).cashflowAnnual.value,2040000);
});
test('finite zero-return capital consumption exposes the first unfunded month',()=> {
  const r=simulateCapital({initialCents:100000,monthlyContributionCents:0,monthlyWithdrawalCents:30000,annualReturnBps:0,months:5});
  assert.equal(r.firstUnfundedMonth,4);assert.equal(r.periods[3].withdrawnCents,10000);assert.equal(r.periods[3].unfundedWithdrawalCents,20000);
  assert.equal(r.finalCapital.value,0);assert.equal(r.guaranteed,false);
});
test('zero-return saving is finite and capital never masquerades as annual income',()=> {
  const r=simulateCapital({initialCents:100000,monthlyContributionCents:10000,monthlyWithdrawalCents:0,annualReturnBps:0,months:12});
  assert.equal(r.finalCapital.value,220000);assert.throws(()=>annual(fixture.assets[0].amount));
});
test('all three pillars stay visible and missing pillar data stays missing',()=> {
  const c=fresh();c.provisions=c.provisions.filter(p=>p.pillar!=='3');const r=summarizePillars(c);
  assert.equal(r.pillars.length,3);assert.equal(r.pillars[2].status,'needs_input');
});
test('data-capture progress is independent of benefit size and professional review',()=> {
  const c=fresh();const p=calculateProgress(c);for(const provision of c.provisions)provision.amount.value=0;
  assert.equal(calculateProgress(c).percent,p.percent);assert.equal(p.percent,100);assert.equal(p.reviewOpen,true);
  c.provisions=c.provisions.filter(p=>p.pillar!=='3');assert.ok(calculateProgress(c).percent<100);
});
test('runtime schemas reject future birth dates, duplicate persons, expense cycles and wrong units',()=> {
  const c=fresh();c.persons[0].birthYear=2030;assert.equal(CaseSnapshotSchema.safeParse(c).success,false);
  const d=fresh();d.persons[1].id=d.persons[0].id;assert.equal(CaseSnapshotSchema.safeParse(d).success,false);
  const e=fresh();e.expenses[0].includedInExpenseId=e.expenses[1].id;e.expenses[1].includedInExpenseId=e.expenses[0].id;
  assert.equal(CaseSnapshotSchema.safeParse(e).success,false);
  const f=fresh();f.persons[0].income.unit='CHF';assert.equal(CaseSnapshotSchema.safeParse(f).success,false);
});
test('GraphContext requires exact run and version identifiers and ordered periods',()=> {
  assert.equal(GraphContextSchema.safeParse({caseId:'c',profileVersion:1,scenarioVersionId:'s',runId:'r',graphId:'g',metricId:'m',periodStart:'2030-12',periodEnd:'2026-01'}).success,false);
});
