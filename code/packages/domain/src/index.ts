import { CaseSnapshotSchema, ScenarioSchema, money, type AmountField, type CaseSnapshot, type Issue,
  type Status, type ProgressSnapshot, type Scenario } from '@pax/contracts';

export const DOMAIN_MODEL_VERSION = 'lifemap-domain-0.1.0';
export const usable = (a:AmountField) => a.value !== null && a.confirmation === 'confirmed' && a.review !== 'rejected';
export function annual(a:AmountField):number|null {
  if (a.period === 'once') throw new RangeError('Capital is not an annual income');
  return usable(a) ? a.value! * (a.period === 'month' ? 12 : 1) : null;
}
const issue = (code:string,path:string,message:string):Issue => ({code,path,message});
const estimated = (a:AmountField) => a.origin === 'estimate' || a.origin === 'synthetic';
const requiredCategories = ['housing','living','provision','debt','reserve'] as const;
export function calculateBudget(input:CaseSnapshot) {
  const c=CaseSnapshotSchema.parse(input);const issues:Issue[]=[];
  const bases=new Set(c.persons.map(p=>p.incomeBasis));
  if (bases.has('gross')) issues.push(issue('NET_INCOME_REQUIRED','persons','Gross income is not disposable net income.'));
  if (bases.has('net_after_income_tax') && bases.has('net_before_income_tax'))
    issues.push(issue('MIXED_TAX_BASIS','persons','Tax attribution is required for mixed net income bases.'));
  for (const p of c.persons) if (annual(p.income)===null)
    issues.push(issue('UNCONFIRMED_INCOME',`persons.${p.id}.income`,'A confirmed known income is required.'));
  for (const category of requiredCategories) if (!c.expenses.some(e=>e.category===category))
    issues.push(issue('EXPENSE_CATEGORY_MISSING',`expenses.${category}`,'Confirm an amount or an explicit zero.'));
  const afterTax=bases.size===1 && bases.has('net_after_income_tax');
  if (!afterTax && !c.expenses.some(e=>e.category==='tax'))
    issues.push(issue('TAX_AMOUNT_REQUIRED','expenses.tax','Income tax is not yet accounted for.'));
  const byId=new Map(c.expenses.map(e=>[e.id,e]));
  const allValues=c.expenses.map(e=>e.amount);
  for (const e of c.expenses) if (annual(e.amount)===null)
    issues.push(issue('UNCONFIRMED_EXPENSE',`expenses.${e.id}`,'A confirmed expense amount is required.'));
  if (annual(c.safetyBuffer)===null) issues.push(issue('BUFFER_REQUIRED','safetyBuffer','Confirm a safety buffer, including zero.'));
  let expenseTotal=0;const excludedExpenseIds:string[]=[];
  for (const root of c.expenses.filter(e=>!e.includedInExpenseId)) {
    const rootValue=annual(root.amount);if (rootValue===null) continue;
    const descend=(id:string):typeof c.expenses => c.expenses.filter(e=>e.includedInExpenseId===id).flatMap(e=>[e,...descend(e.id)]);
    const descendants=descend(root.id);
    for (const parent of [root,...descendants]) {
      const direct=c.expenses.filter(e=>e.includedInExpenseId===parent.id);
      const known=direct.every(e=>annual(e.amount)!==null) && annual(parent.amount)!==null;
      if (known && direct.reduce((s,e)=>s+annual(e.amount)!,0)>annual(parent.amount)!)
        issues.push(issue('EXPENSE_BREAKDOWN_EXCEEDS_PARENT',`expenses.${parent.id}`,'Included details exceed their containing expense.'));
    }
    // Only top-most tax subtrees are removed; included details are never deducted twice.
    const topTaxes=[root,...descendants].filter(e=> {
      if (e.category!=='tax') return false;
      let parent=e.includedInExpenseId;
      while(parent) {const p=byId.get(parent)!;if(p.category==='tax') return false;parent=p.includedInExpenseId;}
      return true;
    });
    const removed=afterTax ? topTaxes.reduce((sum,e)=>sum+(annual(e.amount)??0),0) : 0;
    if (afterTax) excludedExpenseIds.push(...topTaxes.map(e=>e.id));
    expenseTotal+=rootValue-removed;
  }
  const incomeKnown=c.persons.every(p=>annual(p.income)!==null) && !bases.has('gross');
  const income=incomeKnown?c.persons.reduce((sum,p)=>sum+annual(p.income)!,0):null;
  const complete=issues.length===0;
  const expenses=complete?expenseTotal:null;
  const cashflow=complete && income!==null ? income-expenseTotal : null;
  const buffer=annual(c.safetyBuffer);
  const status:Status=!complete?'needs_input':[...c.persons.map(p=>p.income),...allValues,c.safetyBuffer].some(estimated)?'estimated':'valid';
  return {status,issues,excludedExpenseIds,
    incomeAnnual:money(income,'year'),expensesAnnual:money(expenses,'year'),cashflowAnnual:money(cashflow,'year'),
    safetyBufferAnnual:money(buffer,'year'),
    affordableContributionAnnual:money(cashflow===null||buffer===null?null:Math.max(0,cashflow-buffer),'year'),
    deficitAnnual:money(cashflow===null?null:Math.max(0,-cashflow),'year')};
}

export function calculateCapital(input:CaseSnapshot) {
  const c=CaseSnapshotSchema.parse(input);const issues:Issue[]=[];
  if (!c.assetsConfirmed) issues.push(issue('ASSETS_NOT_CONFIRMED','assets','Confirm assets or that there are none.'));
  const assets=c.assets.map(a=> {
    const value=usable(a.amount)?a.amount.value:null;
    const allocated=a.allocations.reduce((s,x)=>s+x.amountCents,0);
    if (value===null) issues.push(issue('CAPITAL_UNKNOWN',`assets.${a.id}`,'Capital is unknown or unconfirmed.'));
    if (value!==null && allocated>value) issues.push(issue('CAPITAL_DOUBLE_ALLOCATED',`assets.${a.id}.allocations`,'Allocations exceed this asset.'));
    const eligible=a.liquidity==='free' && a.availableFrom<=c.valuationDate;
    return {id:a.id,totalCents:value,allocatedCents:allocated,
      freeCents:!eligible?0:value===null||allocated>value?null:value-allocated,
      excludedReason:a.liquidity==='restricted'?'restricted':a.availableFrom>c.valuationDate?'not_available_yet':null};
  });
  const status:Status=issues.length?'needs_input':c.assets.some(a=>estimated(a.amount))?'estimated':'valid';
  return {status,issues,assets,freeCapital:money(issues.length?null:assets.reduce((sum,a)=>sum+a.freeCents!,0),'once')};
}

export function summarizePillars(input:CaseSnapshot) {
  const c=CaseSnapshotSchema.parse(input);const issues:Issue[]=[];
  const pillars=(['1','2','3'] as const).map(pillar=> {
    const entries=c.provisions.filter(p=>p.pillar===pillar);
    if (!entries.length) issues.push(issue('PILLAR_DATA_MISSING',`pillars.${pillar}`,'This pillar is not yet documented; zero must be explicit.'));
    const groups=[...new Set(entries.map(p=>`${p.personId}:${p.event}`))].map(key=> {
      const rows=entries.filter(p=>`${p.personId}:${p.event}`===key);const first=rows[0]!;
      const known=rows.every(p=>annual(p.amount)!==null);
      const status:Status=!known?'needs_input':rows.some(p=>estimated(p.amount))?'estimated':'valid';
      return {personId:first.personId,event:first.event,status,
        amountAnnual:money(known?rows.reduce((sum,p)=>sum+annual(p.amount)!,0):null,'year'),
        sourceRefs:rows.map(p=>p.amount.sourceRef)};
    });
    return {pillar,status:!entries.length||groups.some(g=>g.status==='needs_input')?'needs_input' as const:
      groups.some(g=>g.status==='estimated')?'estimated' as const:'valid' as const,groups};
  });
  return {status:pillars.some(p=>p.status==='needs_input')?'needs_input' as const:pillars.some(p=>p.status==='estimated')?'estimated' as const:'valid' as const,pillars,issues};
}

export function calculateProgress(c:CaseSnapshot):ProgressSnapshot {
  CaseSnapshotSchema.parse(c);const budget=calculateBudget(c);const capital=calculateCapital(c);
  const groups=[
    {id:'income',complete:c.persons.every(p=>usable(p.income)),missing:c.persons.filter(p=>!usable(p.income)).map(p=>`persons.${p.id}.income`)},
    {id:'budget',complete:budget.status!=='needs_input',missing:budget.issues.map(i=>i.path)},
    {id:'capital',complete:capital.status!=='needs_input',missing:capital.issues.map(i=>i.path)},
    ...(['1','2','3'] as const).map(pillar=> {
      const missing=c.persons.filter(person=>!c.provisions.some(p=>p.pillar===pillar && p.personId===person.id && usable(p.amount)))
        .map(p=>`pillars.${pillar}.${p.id}`);
      return {id:`pillar_${pillar}`,complete:missing.length===0,missing};
    })
  ];
  const amounts=[...c.persons.map(p=>p.income),...c.expenses.map(e=>e.amount),c.safetyBuffer,...c.assets.map(a=>a.amount),...c.provisions.map(p=>p.amount)];
  return {domain:'data_capture',percent:Math.round(100*groups.filter(g=>g.complete).length/groups.length),
    reviewOpen:amounts.some(a=>a.review!=='reviewed'),groups};
}

export function simulateScenario(input:CaseSnapshot,scenario:Scenario) {
  scenario=ScenarioSchema.parse(scenario);
  const c=CaseSnapshotSchema.parse(input);const copy=structuredClone(c);const issues:Issue[]=[];const assumptions:string[]=[];
  if (scenario.kind==='family') {
    const person=copy.persons.find(p=>p.id===scenario.personId);
    if (!person) throw new RangeError('Unknown scenario person');
    if (!person.employmentRateBps || !usable(person.income)) {
      issues.push(issue('INCOME_SCALING_UNSUPPORTED',`persons.${person.id}`,'Known income and a non-zero baseline employment rate are required.'));
    } else {
      const scaled=Math.round(person.income.value!*scenario.newEmploymentRateBps/person.employmentRateBps);
      if(!Number.isSafeInteger(scaled)||scaled>1e12) throw new RangeError('Income scaling exceeds supported range');
      person.income={...person.income,value:scaled,origin:'estimate',review:'unreviewed',sourceRef:'model:confirmed-linear-income-assumption'};
      person.employmentRateBps=scenario.newEmploymentRateBps;
      let id='scenario_childcare';while(copy.expenses.some(e=>e.id===id))id+='x';
      copy.expenses.push({id,category:'living',amount:{...c.safetyBuffer,value:scenario.additionalMonthlyCostCents,period:'month',origin:'estimate',confirmation:'confirmed',review:'unreviewed',sourceRef:'scenario:childcare-assumption'}});
      assumptions.push('Linear wage scaling is a confirmed illustration; taxes and pension-fund benefits are not scaled automatically.');
      issues.push(issue('PENSION_FUND_EFFECT_OPEN','provisions','Existing pension-fund benefits remain baseline facts, not verified scenario benefits.'));
    }
  }
  if (scenario.kind==='home') {
    if(copy.expenses.some(e=>e.category==='housing'&&e.includedInExpenseId)) {
      issues.push(issue('HOUSING_BUNDLE_UNSUPPORTED','expenses','Separate housing from its containing bundle before comparison.'));
      return {snapshot:copy,issues,assumptions,home:null};
    }
    const capital=calculateCapital(c);const available=capital.freeCapital.value;
    const equity=Math.round(scenario.purchasePriceCents*scenario.equityRateBps/10000);
    const required=equity+scenario.purchaseCostsCents+scenario.reserveCents;
    const mortgage=scenario.purchasePriceCents-equity;
    const housing=Math.round(mortgage*scenario.annualInterestBps/10000)+Math.round(scenario.purchasePriceCents*scenario.annualMaintenanceBps/10000)+scenario.annualAmortizationCents;
    if(available!==null) {
      // Protect the reserve first, then reserve the amount actually fundable for acquisition.
      let reserve=Math.min(available,scenario.reserveCents);
      let acquisition=Math.min(Math.max(0,available-reserve),equity+scenario.purchaseCostsCents);
      for(const asset of copy.assets) {
        if(asset.liquidity!=='free'||asset.availableFrom>copy.valuationDate||!usable(asset.amount)) continue;
        let free=asset.amount.value!-asset.allocations.reduce((s,a)=>s+a.amountCents,0);
        const reserved=Math.min(free,reserve);if(reserved>0)asset.allocations.push({goalId:'home_reserve',amountCents:reserved});
        reserve-=reserved;free-=reserved;
        const used=Math.min(free,acquisition);if(used>0)asset.allocations.push({goalId:'home_purchase',amountCents:used});acquisition-=used;
      }
      if(available<required) issues.push(issue('HOME_UNFUNDED','assets','Illustrative home costs assume a purchase that is not fully funded.'));
    }
    // Replaces all housing roots and their detail rows, avoiding rent plus mortgage double counting.
    const removed=new Set(copy.expenses.filter(e=>e.category==='housing').map(e=>e.id));
    let previous=-1;while(previous!==removed.size){previous=removed.size;for(const e of copy.expenses)if(e.includedInExpenseId&&removed.has(e.includedInExpenseId))removed.add(e.id);}
    copy.expenses=copy.expenses.filter(e=>!removed.has(e.id));
    let id='scenario_housing';while(copy.expenses.some(e=>e.id===id))id+='x';
    copy.expenses.push({id,category:'housing',amount:{...c.safetyBuffer,value:housing,period:'year',origin:'estimate',confirmation:'confirmed',review:'unreviewed',sourceRef:'scenario:home-cost-assumptions'}});
    assumptions.push('Equity, interest, maintenance and amortization are explicit illustrative assumptions, not a lending decision.');
    return {snapshot:copy,issues:[...issues,...capital.issues],assumptions,home:{
      requiredCapital:money(required,'once'),fundingGap:money(available===null?null:Math.max(0,required-available),'once'),
      remainingUnallocatedCapital:money(available===null?null:Math.max(0,available-required),'once'),
      protectedReserve:money(available===null?null:Math.min(available,scenario.reserveCents),'once'),
      annualHousingCost:money(housing,'year')
    }};
  }
  return {snapshot:copy,issues,assumptions,home:null};
}

export function simulateCapital(input:{initialCents:number;monthlyContributionCents:number;monthlyWithdrawalCents:number;annualReturnBps:number;months:number}) {
  const {initialCents,monthlyContributionCents,monthlyWithdrawalCents,annualReturnBps,months}=input;
  if (![initialCents,monthlyContributionCents,monthlyWithdrawalCents].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12) ||
    !Number.isInteger(months)||months<1||months>1200 || !Number.isInteger(annualReturnBps)||annualReturnBps< -5000||annualReturnBps>2000)
    throw new RangeError('Unsupported capital simulation input');
  const monthlyRate=(1+annualReturnBps/10000)**(1/12)-1;let capital=initialCents;
  const periods=[];
  for(let month=1;month<=months;month++) {
    const beforeWithdrawal=Math.round(capital*(1+monthlyRate))+monthlyContributionCents;
    if (!Number.isSafeInteger(beforeWithdrawal)) throw new RangeError('Capital overflow');
    const withdrawn=Math.min(monthlyWithdrawalCents,Math.max(0,beforeWithdrawal));capital=Math.max(0,beforeWithdrawal-withdrawn);
    periods.push({month,capitalCents:capital,withdrawnCents:withdrawn,unfundedWithdrawalCents:monthlyWithdrawalCents-withdrawn});
  }
  return {convention:'effective annual return, rounded to cents monthly, month-end contributions then withdrawals',
    guaranteed:false,periods,finalCapital:money(capital,'once'),
    firstUnfundedMonth:periods.find(p=>p.unfundedWithdrawalCents>0)?.month??null};
}
export * from './life-insurance.js';
