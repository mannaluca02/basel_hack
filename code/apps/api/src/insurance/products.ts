import { randomUUID } from 'node:crypto';
import type { InsuranceDraft } from '@pax/contracts';
import type { LifeRun,ProductCandidate,Recommendation } from './types.js';

export const PRODUCT_RULE_VERSION='pax-life-needs-2026-10-31-v1';
export const DOCUMENTS={
  term_terms:'technical-terms/term-life.pdf',term_brochure:'brochures/term-life.pdf',
  disability_terms:'technical-terms/disability.pdf',disability_brochure:'brochures/disability.pdf',
  pax3a_kid:'key-information/pax-3a.pdf',fondsstar_kid:'key-information/fondsstar.pdf',
  fondsstar_terms:'technical-terms/fondsstar.pdf',lifestar_kid:'key-information/lifestar.pdf',
  child_terms:'technical-terms/child-insurance-firststep.pdf',child_brochure:'brochures/child-insurance.pdf',
  payout_kid:'key-information/payout-plan.pdf',payout_terms:'technical-terms/payout-plan.pdf',
} as const;
export const PAX_PRODUCTS=[
  {id:'pax_term_life',name:'Pax Todesfallversicherung',kind:'survivor_protection',sourceUrl:'https://www.pax.ch/de/private-vorsorge/produkte/pax-todesfallversicherung',documents:['term_terms','term_brochure'],summary:'Life cover for the financial consequences of death; amount, term and beneficiaries require configuration.'},
  {id:'pax_disability',name:'Pax Erwerbsunfähigkeitsversicherung',kind:'income_protection',sourceUrl:'https://www.pax.ch/de/private-vorsorge/produkte/pax-erwerbsunfaehigkeitsversicherung',documents:['disability_terms','disability_brochure'],summary:'Income protection supplementing state and occupational benefits; conditions and waiting periods require review.'},
  {id:'pax_3a',name:'Pax 3a',kind:'retirement_saving',sourceUrl:'https://www.pax.ch/de/private-vorsorge/produkte/pax-3a',documents:['pax3a_kid'],summary:'Private pension saving with insurance components; contribution eligibility and suitability require verification.'},
  {id:'pax_fondsstar',name:'Pax FondsStar',kind:'retirement_saving',sourceUrl:'https://www.pax.ch/de/private-vorsorge/produkte/pax-fondsstar',documents:['fondsstar_kid','fondsstar_terms'],summary:'Fund-linked life insurance; costs, risk tolerance and selected cover need an individual assessment.'},
  {id:'pax_lifestar',name:'Pax LifeStar',kind:'retirement_saving',sourceUrl:'https://www.pax.ch/de/private-vorsorge/produkte/pax-lifeStar',documents:['lifestar_kid'],summary:'Private provision combining saving and insurance; the exact configuration requires advice.'},
  {id:'pax_child',name:'Pax Kinderversicherung',kind:'child_protection',sourceUrl:'https://www.pax.ch/de/private-vorsorge/produkte/pax-kinderversicherung',documents:['child_terms','child_brochure'],summary:'A child-focused savings and protection solution; insured persons and benefits require assessment.'},
  {id:'pax_payout',name:'Pax Auszahlungsplan',kind:'retirement_income',sourceUrl:'https://www.pax.ch/de/private-vorsorge/produkte/pax-auszahlungsplan',documents:['payout_kid','payout_terms'],summary:'A configured payout of invested capital; duration and guarantee/fund mix require advice.'},
] as const;

export function recommendLifeSolutions(draft:InsuranceDraft,run:LifeRun,reviewApproved:boolean):Recommendation {
  const candidates:ProductCandidate[]=[];const intake=draft.insurance!;const sources=run.providerResults.map(r=>r.provenance.sourceRef);
  const add=(productId:string,personId:string|null,amount:number,period:'year'|'once',ruleId:string,reasons:string[])=> {
    if(amount<=0)return;const product=PAX_PRODUCTS.find(p=>p.id===productId)!;
    candidates.push({id:randomUUID(),productId,productName:product.name,personId,needAmountCents:amount,needPeriod:period,
      premiumCents:null,premiumStatus:'pax_tariff_api_unavailable',eligibility:reviewApproved?'ready_for_demo':'human_review_required',
      conditions:['No real premium or underwriting decision is available.','Product documents, age/term, beneficiary, exclusions and personal affordability require review.'],
      rule:{ruleId,ruleVersion:PRODUCT_RULE_VERSION,runId:run.id,inputHash:run.inputHash,reasonCodes:reasons,
        sourceRefs:[...sources,product.sourceUrl,...product.documents.map(id=>`pax-document:${id}`)]}});
  };
  for(const person of draft.financial!.persons) {
    const rows=run.riskNeeds.filter(r=>r.personId===person.id);
    // Illness/accident are alternatives, so take the maximum relevant shortfall, never their sum.
    const disability=rows.filter(r=>r.event.startsWith('disability'));
    const age=run.providerResults.find(r=>r.operation==='ageLimits'&&r.metadata.personId===person.id)?.metadata.ageLimits as Record<string,number|boolean>|undefined;
    const belowPension=age&&typeof age.CurrentAge==='number'&&typeof age.RegularPensionAge==='number'&&age.CurrentAge<age.RegularPensionAge;
    if(belowPension&&disability.length&&disability.every(r=>r.annualGapCents!==null))
      add('pax_disability',person.id,Math.max(...disability.map(r=>r.annualGapCents!)),'year','disability_gap_v1',['CONFIRMED_ANNUAL_NEED','THREE_PILLAR_COORDINATION','CAUSES_NOT_SUMMED']);
    const death=rows.filter(r=>r.event.startsWith('death'));
    if(death.length&&death.every(r=>r.deathCapitalCents!==null))
      add('pax_term_life',person.id,Math.max(...death.map(r=>r.deathCapitalCents!)),'once','survivor_capital_v1',['FINITE_PROTECTION_TERM','DEBT_TREATMENT_EXPLICIT','EXISTING_DEATH_CAPITAL_DEDUCTED','LIQUID_ASSET_STRATEGY_CONFIRMED']);
  }
  const retirement=run.providerResults.find(r=>r.operation==='retirement');
  const pensionGap=retirement?.metrics.find(m=>m.id==='IncomeGap')?.value??null;
  const capital=retirement?.metrics.find(m=>m.id==='AvailableFortune')?.value??null;
  const retirementGoal=draft.goals.find(g=>g.kind==='retirement');
  const capitalGap=retirementGoal?.targetCapitalCents!==null&&retirementGoal?.targetCapitalCents!==undefined&&capital!==null?
    Math.max(0,retirementGoal.targetCapitalCents-capital):0;
  const budget=run.local.metrics.find(m=>m.id==='affordableContributionAnnual')?.value??null;
  const first=intake.persons[0]!;
  if((pensionGap!==null&&pensionGap>0)||capitalGap>0) {
    if(budget!==null&&budget>0) {
      const limits=run.providerResults.find(r=>r.operation==='saving3aLimits');
      const maximum=limits?.metrics.find(m=>m.id=== (first.withPillar2?'max3aWithP2':'max3aWithoutP2'))?.value??0;
      const saving=Math.min(budget,intake.annualSavingCents!,Math.max(0,maximum-intake.existingAnnualPillar3aContributionCents!),first.personalAffordableAnnualPremiumCents??0);
      const age=run.providerResults.find(r=>r.operation==='ageLimits'&&r.metadata.personId===first.personId)?.metadata.ageLimits as Record<string,number|boolean>|undefined;
      // Without occupational cover the percentage-of-income limit still needs expert verification.
      if(first.withPillar2&&age?.AllowedForSaving3a===true&&saving>0)add('pax_3a',first.personId,saving,'year','retirement_saving_gap_v1',['RETIREMENT_GAP_DOCUMENTED','ANNUAL_BUDGET_CHECKED','PROVIDER_3A_CEILING_NOT_EXCEEDED']);
      if(intake.investmentKnowledgeConfirmed&&intake.riskAppetite!=='unknown')
        add('pax_fondsstar',first.personId,Math.min(budget,intake.annualSavingCents!,first.personalAffordableAnnualPremiumCents??0),'year','fund_linked_alternative_v1',['CAPITAL_GOAL_GAP','INVESTMENT_PROFILE_CAPTURED','ALTERNATIVE_NOT_ADDITIONAL_COMMITMENT']);
    }
    if(run.timeline&&run.timeline.periods.some(p=>(p.withdrawalCents??0)>0))
      add('pax_payout',null,run.local.metrics.find(m=>m.id==='freeCapital')?.value??0,'once','retirement_drawdown_v1',['FINITE_DRAWDOWN_MODEL','CAPITAL_EXHAUSTION_VISIBLE']);
  }
  for(const goal of draft.goals.filter(g=>g.kind==='child_protection')) {
    const children=intake.children.filter(c=>c.goalId===goal.id&&c.kind!=='expected'&&Number(draft.financial!.valuationDate.slice(0,4))-c.birthYear<30);
    if((goal.targetCapitalCents??0)>0&&budget!==null&&budget>0&&children.length===1) {
      add('pax_child',first.personId,goal.targetCapitalCents!,'once','child_goal_v1',['CHILD_PROTECTION_GOAL_CAPTURED','HUMAN_INSURED_PERSON_CHECK_REQUIRED']);
      const candidate=candidates.at(-1);if(candidate?.productId==='pax_child')candidate.insuredChildId=children[0]!.id;
    }
  }
  return {id:randomUUID(),runId:run.id,profileVersion:run.profileVersion,createdAt:new Date().toISOString(),
    status:!candidates.length?'no_new_contract':reviewApproved?'ready_for_demo':'human_review_required',candidates,
    alternatives:['Keep existing cover and make no additional contract.','Adjust the goal, protect liquidity or obtain human advice before committing.'],
    decision:{ruleId:'needs_before_products_v1',ruleVersion:PRODUCT_RULE_VERSION,runId:run.id,inputHash:run.inputHash,
      reasonCodes:candidates.length?['LIFE_SITUATION_CONFIRMED','CALCULATED_NEED_REFERENCED']:['NO_SUITABLE_ADDITIONAL_COMMITMENT_IDENTIFIED'],sourceRefs:sources}};
}
