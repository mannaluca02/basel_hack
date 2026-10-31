import { CaseSnapshotSchema, DraftSchema, RetirementScenarioSchema,
  type InsuranceDraft, type CaseSnapshot, type RetirementScenario, type Issue } from '@pax/contracts';
import { annual, calculateCapital, calculateBudget, usable } from './index.js';

const problem = (code:string,path:string,message:string):Issue => ({code,path,message});
export function intakeQuestions(input:InsuranceDraft) {
  const draft = DraftSchema.parse(input);
  const fields:string[] = [];
  if (!draft.goals.length) fields.push('goals');
  if (!draft.financial) fields.push('financial');
  if (!draft.insurance) fields.push('insurance');
  if (!draft.financial || !draft.insurance) return fields;
  const c=draft.financial;const i=draft.insurance;
  if(i.relationship==='unknown') fields.push('insurance.relationship');
  if(i.riskCapitalStrategy===null)fields.push('insurance.riskCapitalStrategy');
  if(['married','cohabiting','registered_partnership'].includes(i.relationship)&&c.persons.length!==2)fields.push('financial.partner');
  if(!i.debtsConfirmed)fields.push('insurance.debtsConfirmed');
  if(!i.existingPrivateRiskBenefitsConfirmed)fields.push('insurance.existingPrivateRiskBenefitsConfirmed');
  if(i.sharedChildren!==null&&i.children.filter(c=>c.kind==='shared').length!==i.sharedChildren)fields.push('insurance.children');
  for(const child of i.children) {
    if(child.supportUntilMonth===null&&(child.kind==='shared'||child.kind==='sole_custody'))fields.push(`insurance.children.${child.id}.supportUntilMonth`);
    if(child.kind!=='expected'&&child.birthYear>Number(c.valuationDate.slice(0,4)))fields.push(`insurance.children.${child.id}.birthYear`);
  }
  for(const goal of draft.goals.filter(g=>g.kind==='child_protection'))if(!i.children.some(c=>c.goalId===goal.id))fields.push(`insurance.children_for_goal.${goal.id}`);
  for(const debt of i.debts) {
    if(debt.balanceCents===null)fields.push(`insurance.debts.${debt.id}.balanceCents`);
    if(debt.annualServiceCents===null)fields.push(`insurance.debts.${debt.id}.annualServiceCents`);
  }
  for(const key of ['relationshipSinceYear','sharedChildren','retirementNeedAnnualCents','annualReturnBps','retirementHorizonAge','annualSavingCents','existingAnnualRetirementSavingCents','existingAnnualPillar3aContributionCents'] as const)
    if(i[key]===null)fields.push(`insurance.${key}`);
  for(const person of c.persons) {
    const p=i.persons.find(p=>p.personId===person.id);
    if(!p){fields.push(`insurance.persons.${person.id}`);continue;}
    for(const key of ['providerSex','grossAnnualIncomeCents','withPillar2','retirementPensionAnnualCents','desiredWorkStopAge',
      'disabilityNeedAnnualCents','deathNeedAnnualCents','protectionTermMonths','existingDeathCapitalCents','deathOneOffCostsCents','debtPayoffCents','debtTreatment','personalAffordableAnnualPremiumCents'] as const)
      if(p[key]===null)fields.push(`insurance.persons.${person.id}.${key}`);
    for(const [key,value] of Object.entries(p.pillar2Risk))if(value===null)fields.push(`insurance.persons.${person.id}.pillar2Risk.${key}`);
    if(p.debtTreatment==='pay_off_separately'&&!p.deathNeedExcludesRepaidDebtService)
      fields.push(`insurance.persons.${person.id}.deathNeedExcludesRepaidDebtService`);
    if(annual(person.income)===null)fields.push(`financial.persons.${person.id}.income`);
  }
  if(i.annualSavingCents!==null&&i.annualSavingCents>0&&i.taxLocationId===null)
    fields.push('insurance.taxLocationId');
  return fields;
}

/** A finite, disclosed capitalisation of a known recurring shortfall, not a Pax tariff. */
export function deathCapitalNeed(input:{annualGapCents:number|null;termMonths:number|null;annualReturnBps:number;
  existingDeathCapitalCents:number|null;oneOffCostsCents:number|null;debtPayoffCents:number|null;
  debtTreatment:'included_in_income_need'|'pay_off_separately'|null}) {
  const {annualGapCents,termMonths,existingDeathCapitalCents,oneOffCostsCents,debtPayoffCents,debtTreatment}=input;
  if([annualGapCents,termMonths,existingDeathCapitalCents,oneOffCostsCents,debtPayoffCents,debtTreatment].some(v=>v===null))
    return {status:'needs_input' as const,capitalNeedCents:null,periods:[] as {month:number;gapCents:number;presentValueCents:number}[],assumption:'Explicit need, term and debt treatment required'};
  if(!Number.isInteger(termMonths)||termMonths!<1||termMonths!>600||input.annualReturnBps< -5000||input.annualReturnBps>2000)
    throw new RangeError('Unsupported protection term or return');
  for(const n of [annualGapCents!,existingDeathCapitalCents!,oneOffCostsCents!,debtPayoffCents!])
    if(!Number.isSafeInteger(n)||n<0||n>1e12)throw new RangeError('Invalid death-capital input');
  const r=(1+input.annualReturnBps/10000)**(1/12)-1;
  const periods=Array.from({length:termMonths!},(_,index)=>({month:index+1,gapCents:Math.round(annualGapCents!/12),
    presentValueCents:Math.round((annualGapCents!/12)/(1+r)**(index+1))}));
  const amount=periods.reduce((s,p)=>s+p.presentValueCents,0)+oneOffCostsCents!+
    (debtTreatment==='pay_off_separately'?debtPayoffCents!:0)-existingDeathCapitalCents!;
  if(!Number.isSafeInteger(amount))throw new RangeError('Death capital overflow');
  return {status:'estimated' as const,capitalNeedCents:Math.max(0,amount),periods,
    assumption:'Month-end discounted income shortfall plus explicit one-off/debt amounts less event-specific existing death capital; no tariff or underwriting decision'};
}

const monthNumber=(m:string)=>Number(m.slice(0,4))*12+Number(m.slice(5))-1;
const monthString=(n:number)=>`${Math.floor(n/12).toString().padStart(4,'0')}-${(n%12+1).toString().padStart(2,'0')}`;
type RetirementPeriod = {
  month:string;persons:{personId:string;employmentCents:number|null;pillar1Cents:number|null;pillar2Cents:number|null;pillar3Cents:number|null;phase:'working'|'bridge'|'pension'}[];
  knownIncomeCents:number;incomeCents:number|null;needCents:number|null;withdrawalCents:number|null;
  unfundedCents:number|null;capitalCents:number|null;knownCapitalCents:number;contributionCents:number;unfundedContributionCents:number;
  restrictedSavingCapitalCents:number;
  status:'estimated'|'needs_input';
};
export function retirementTimeline(financial:CaseSnapshot,input:RetirementScenario) {
  const c=CaseSnapshotSchema.parse(financial);const s=RetirementScenarioSchema.parse(input);const issues:Issue[]=[];
  if(c.persons.some(p=>p.incomeBasis!=='net_after_income_tax'))throw new RangeError('Retirement timeline requires aligned net-after-tax income');
  if(s.startMonth<c.valuationDate.slice(0,7))throw new RangeError('Cannot project before valuation month');
  if(s.persons.length!==c.persons.length || s.persons.some(p=>!c.persons.some(x=>x.id===p.personId)))
    throw new RangeError('Retirement plan must cover each financial person once');
  for(const release of s.releaseAssumptions)if(!c.assets.some(a=>a.id===release.assetId))throw new RangeError('Unknown release asset');
  const releases=new Map(s.releaseAssumptions.map(x=>[x.assetId,x.availableMonth]));
  for(const release of s.releaseAssumptions) {
    const asset=c.assets.find(a=>a.id===release.assetId)!;
    if(asset.pillar==='2'||asset.pillar==='3') {
      const relevant=s.persons.filter(p=>!asset.ownerPersonIds||asset.ownerPersonIds.includes(p.personId));
      if(relevant.some(p=>(asset.pillar==='2'?p.pillar2MonthlyCents:p.pillar3MonthlyCents)!>0))
        throw new RangeError('Capital and full annuity from the same pension asset cannot be counted together without a supported split');
    }
  }
  if(releases.size)issues.push(problem('CONDITIONAL_PENSION_CAPITAL_RELEASE','assets','Pension-capital release is an explicit illustration requiring professional confirmation.'));
  const remainingAssets=new Map(c.assets.map(a=>[a.id,a]));
  let capital=0;let capitalKnown=true;let restrictedSavingCapital=0;const periods:RetirementPeriod[]=[];const rate=(1+s.annualReturnBps/10000)**(1/12)-1;
  const preRetirementBudget=calculateBudget(c);
  if(preRetirementBudget.expensesAnnual.value===null)throw new RangeError('Working-phase expenses are required');
  const first=monthNumber(c.valuationDate.slice(0,7)),last=monthNumber(s.endMonth),displayStart=monthNumber(s.startMonth);
  if(last-first>1199)throw new RangeError('Full projection from valuation exceeds 1200 months');
  for(let index=first;index<=last;index++) {
    const month=monthString(index);let capitalInput=0;
    for(const [id,asset] of remainingAssets) {
      const release=releases.get(id);
      if((asset.liquidity==='restricted'&&!release)||asset.availableFrom.slice(0,7)>month||(release&&release>month))continue;
      if(!usable(asset.amount)){capitalKnown=false;issues.push(problem('CAPITAL_UNKNOWN',`assets.${id}`,'Capital source is unconfirmed.'));remainingAssets.delete(id);continue;}
      const allocatedElsewhere=asset.allocations.filter(a=>a.goalId!==s.goalId).reduce((sum,a)=>sum+a.amountCents,0);
      if(allocatedElsewhere>asset.amount.value!)throw new RangeError('Retirement asset is overallocated');
      capitalInput+=asset.amount.value!-allocatedElsewhere;remainingAssets.delete(id);
    }
    capital+=capitalInput;
    const persons:RetirementPeriod['persons']=s.persons.map(plan=> {
      const p=c.persons.find(p=>p.id===plan.personId)!;
      const working=month<plan.workEndsMonth;const pension=month>=plan.pensionStartsMonth;
      return {personId:p.id,employmentCents:working?(annual(p.income)===null?null:Math.round(annual(p.income)!/12)):0,
        pillar1Cents:pension?plan.pillar1MonthlyCents:0,pillar2Cents:pension?plan.pillar2MonthlyCents:0,
        pillar3Cents:pension?plan.pillar3MonthlyCents:0,phase:working?'working':pension?'pension':'bridge'};
    });
    const incomeKnown=persons.every(p=>[p.employmentCents,p.pillar1Cents,p.pillar2Cents,p.pillar3Cents].every(v=>v!==null));
    const knownIncome=persons.reduce((sum,p)=>sum+(p.employmentCents??0)+(p.pillar1Cents??0)+(p.pillar2Cents??0)+(p.pillar3Cents??0),0);
    const working=persons.some(p=>p.phase==='working');
    const allWorking=persons.every(p=>p.phase==='working');
    const applicableNeed=allWorking?Math.round(preRetirementBudget.expensesAnnual.value/12):s.monthlyNeedCents;
    const complete=incomeKnown&&applicableNeed!==null;
    // Contributions are explicitly planned, not automatically financed from an unknown surplus.
    const plannedContribution=working?s.monthlySavingCents:0;
    const affordable=complete?Math.max(0,knownIncome-applicableNeed!):0;
    const contribution=Math.min(plannedContribution,affordable);
    if(plannedContribution>contribution&&!issues.some(i=>i.code==='SAVING_NOT_FUNDED'))issues.push(problem('SAVING_NOT_FUNDED','monthlySavingCents','Savings exceed the known monthly surplus and are capped to funded contributions.'));
    restrictedSavingCapital=Math.round(restrictedSavingCapital*(1+rate));
    capital=Math.round(capital*(1+rate));
    if(s.savingLiquidity==='retirement_restricted'&&month<s.savingsReleaseMonth!)restrictedSavingCapital+=contribution;
    else{capital+=contribution+restrictedSavingCapital;restrictedSavingCapital=0;}
    const need=complete&&capitalKnown?Math.max(0,applicableNeed!-knownIncome):null;
    const withdrawal=need===null?0:Math.min(need,capital);capital-=withdrawal;
    if(!Number.isSafeInteger(capital)||capital<0||!Number.isSafeInteger(restrictedSavingCapital)||restrictedSavingCapital<0)throw new RangeError('Capital projection overflow');
    if(index>=displayStart)periods.push({month,persons,knownIncomeCents:knownIncome,incomeCents:incomeKnown?knownIncome:null,
      needCents:applicableNeed,withdrawalCents:need===null?null:withdrawal,
      unfundedCents:need===null?null:need-withdrawal,capitalCents:capitalKnown?capital:null,knownCapitalCents:capital,contributionCents:contribution,unfundedContributionCents:plannedContribution-contribution,
      restrictedSavingCapitalCents:restrictedSavingCapital,status:complete&&capitalKnown?'estimated' as const:'needs_input' as const});
  }
  if(periods.some(p=>p.status==='needs_input'))issues.push(problem('RETIREMENT_PHASE_INPUT_MISSING','retirement','A phase has an unknown need or income source.'));
  if(c.persons.some(p=>p.incomeBasis!=='net_after_income_tax'))issues.push(problem('RETIREMENT_TAX_BASIS_REVIEW','persons','Income/pension tax bases must be aligned before a final comparison.'));
  const phases=periods.filter((p,index)=>index===0||p.persons.map(x=>x.phase).join()!==periods[index-1]!.persons.map(x=>x.phase).join())
    .map(p=>({fromMonth:p.month,persons:p.persons.map(x=>({personId:x.personId,phase:x.phase}))}));
  return {status:periods.some(p=>p.status==='needs_input')?'needs_input' as const:'estimated' as const,
    priceBasis:s.priceBasis,periods,phases,issues,guaranteed:false as const,
    firstUnfundedMonth:periods.find(p=>(p.unfundedCents??0)>0)?.month??null,
    assumptions:['Monthly end-of-period illustration; work exit and pension start are separate.',
      'Pension amounts are supplied assumptions, not inferred benefit entitlements.',
      'Other-goal asset allocations are excluded; no automatic pension-fund scaling.',
      'This additional-savings liquidity illustration does not automatically reinvest existing private premiums. Their benefit projection is supplied separately; do not add this timeline to the provider fortune projection.',
      'Existing restricted asset amounts are released at their entered nominal amount; pre-release growth and ongoing premiums are not invented.',
      'Pre-display months are projected from valuation with explicit savings/return assumptions.']};
}
