import type { MoneyMetric,Status,Issue } from '@pax/contracts';
import { money } from '@pax/contracts';
import { z } from 'zod';
import { ProviderEnvelope,RiskResponse,RetirementResponse,LimitsResponse,AgeResponse,BaseResponse,type Operation } from './contracts.js';

export type ProviderMetric=MoneyMetric & {id:string;status:Status;scenario?:number};
export type NormalizedProviderResult={operation:Operation;status:Status;metrics:ProviderMetric[];issues:Issue[];metadata:Record<string,unknown>;
  provenance:{mode:'replay'|'live';operationId:string;inputHash:string;capturedAt:string;sourceRef:string}};
export type Normalization=Omit<NormalizedProviderResult,'provenance'>;
const cents=(n:number)=> {const v=Math.round(n*100);if(!Number.isSafeInteger(v))throw new RangeError('Provider money overflow');return v;};
const record=(x:unknown)=>x as Record<string,unknown>;

export function normalizeResponse(operation:Operation,request:unknown,envelope:unknown):Normalization {
  const raw=ProviderEnvelope.parse(envelope).response;const req=record(request);
  const metrics:ProviderMetric[]=[];const issues:Issue[]=[];const metadata:Record<string,unknown>={};
  const add=(id:string,value:number|null,period:MoneyMetric['period'],status:Status,scenario?:number)=>
    metrics.push({id,...money(value===null?null:cents(value),period),status,...(scenario?{scenario}:{})});
  const problem=(code:string,path:string,message:string)=>issues.push({code,path,message});
  let status:Status='valid';
  if(operation==='taxBaseInfo') {
    const data=z.object({TaxBaseVersion:z.string().min(1).max(100),TaxBaseDate:z.string().min(1).max(100)}).parse(raw);
    metadata.taxBaseVersion=data.TaxBaseVersion;metadata.taxBaseDate=data.TaxBaseDate;
  } else if(operation==='estateGainFields') {
    const keys=['Confession','Revenues','FirstCost','BuildingInvest','HasBuilding','SelfInhabitated','SelfInhabYears','HasDiscount'];
    const data=z.record(z.string(),z.unknown()).parse(raw);
    metadata.additionalFields=Object.fromEntries(keys.map(k=>[k,z.boolean().parse(data[k])]));
  } else if(['inheritanceAll','inheritanceGroup','inheritanceBeneficiary'].includes(operation)) {
    const row=z.object({Group:z.number().int(),Beneficiary:z.number().int(),InheritanceTaxes:z.number().finite().nonnegative(),
      InheritanceExemption:z.number().finite().nonnegative(),InheritanceDeduction:z.number().finite().nonnegative(),
      DonationTaxes:z.number().finite().nonnegative(),DonationExemption:z.number().finite().nonnegative(),DonationDeduction:z.number().finite().nonnegative()});
    const rows=operation==='inheritanceBeneficiary'?[row.parse(raw)]:z.array(row).min(1).max(100).parse(raw);
    if(new Set(rows.map(r=>r.Beneficiary)).size!==rows.length||rows.some(r=>operation==='inheritanceGroup'&&r.Group!==req.Group||operation==='inheritanceBeneficiary'&&r.Beneficiary!==req.Beneficiary))throw new Error('Unexpected beneficiary');
    status='requires_review';metadata.beneficiaries=rows.map(r=>({group:r.Group,beneficiary:r.Beneficiary}));
    for(const r of rows)for(const key of ['InheritanceTaxes','InheritanceExemption','InheritanceDeduction','DonationTaxes','DonationExemption','DonationDeduction'] as const)
      add(`beneficiary_${r.Beneficiary}_${key}`,r[key],'once',status);
    problem('INHERITANCE_TAX_REVIEW','inheritance','Tax eligibility and treatment of insurance proceeds need separate confirmation; beneficiary alternatives are not additive.');
  } else if(operation==='estateGainTax'||operation==='corporateEntityTax') {
    const fields=operation==='estateGainTax'?['FederalTax','StateTax','CommunityTax','ChurchTax','TotalTaxes']:
      ['ProfitSimpleTaxState','ProfitSimpleTaxCommunity','ProfitCommunityTax','ProfitChurchTax','ProfitStateTax','ProfitFederalTax','TotalProfitTaxes','CapitalSimpleTaxState','CapitalSimpleTaxCommunity','CapitalCommunityTax','CapitalChurchTax','CapitalStateTax','TotalCapitalTaxes','MinimalTaxesCanton','TotalTaxes'];
    const data=z.record(z.string(),z.unknown()).parse(raw);status='requires_review';
    for(const key of fields)add(key,z.number().finite().nonnegative().max(1e10).parse(data[key]),operation==='estateGainTax'?'once':'year',status);
    problem('ADDITIONAL_TAX_REVIEW',operation,'An isolated tax estimate does not establish tax liability or change insurance needs.');
  } else if(operation==='saving3aLimits') {
    const data=LimitsResponse.parse(raw);
    add('max3aWithP2',data.Max3aSaving,'year','valid');add('max3aWithoutP2',data.Max3aSavingWithoutP2,'year','valid');
    metadata.eligibilityNotEstablished=true;
  } else if(operation==='ageLimits') {
    const data=AgeResponse.parse(raw);
    if(data.BirthYear!==req.BirthYear || data.MinimumAHVAge>data.MaximumAHVAge) throw new Error('Invalid age metadata');
    const ageLimits:Record<string,number|boolean>={BirthYear:data.BirthYear,RegularPensionAge:data.RegularPensionAge,
      MinimumAHVAge:data.MinimumAHVAge,MaximumAHVAge:data.MaximumAHVAge};
    for(const key of ['CurrentAge','MinimumPensionAge','MaximumPensionAge','MaximumSaving3aAge','MinimumSaving3aAge'])
      if(data[key]!==undefined)ageLimits[key]=z.number().int().min(0).max(150).parse(data[key]);
    if(data.AllowedForSaving3a!==undefined)ageLimits.AllowedForSaving3a=z.boolean().parse(data.AllowedForSaving3a);
    metadata.ageLimits=ageLimits;
  } else if(operation==='risk') {
    const data=RiskResponse.parse(raw);const statuses:Status[]=[];
    for(const row of data.RiskScenarioSummaries) {
      if(!req[row.Scenario<=4?'Person1':'Person2']) throw new Error('Unexpected risk person');
      const person=record(req[row.Scenario<=4?'Person1':'Person2']??{});
      const disability=(row.Scenario-1)%4<2;
      const needKey=disability?'NeedDisability':'NeedDeath';const percentKey=disability?'NeedInPcDisability':'NeedInPcDeath';
      const need=person[needKey];const percent=person[percentKey];
      const known=typeof need==='number' && (percent!==true||typeof person.GrossIncome==='number');
      let rowStatus:Status=row.ErrorCode===1?'valid':'requires_review';
      if(row.ErrorCode!==1) problem('RISK_PROVIDER_CODE_REVIEW',`risk.${row.Scenario}`,`Provider result code ${row.ErrorCode} requires domain review.`);
      if(!known) {
        if(rowStatus==='valid') rowStatus='needs_input';
        problem('RISK_NEED_UNKNOWN',`risk.${row.Scenario}.${needKey}`,'Missing need is not zero need; gap and surplus are withheld.');
      } else {
        const requested=percent===true ? (person.GrossIncome as number)*(need as number)/100 : need as number;
        if(Math.abs(row.IncomeNeed-requested)>1) {rowStatus='requires_review';problem('PROVIDER_NEED_MISMATCH',`risk.${row.Scenario}`,'Returned need differs from requested need.');}
        if(Math.abs(row.IncomeGap-Math.max(0,row.IncomeNeed-row.IncomeTotal))>1 ||
          Math.abs(row.IncomeSurplus-Math.max(0,row.IncomeTotal-row.IncomeNeed))>1) {
          rowStatus='requires_review';problem('PROVIDER_GAP_MISMATCH',`risk.${row.Scenario}`,'Returned gap/surplus is inconsistent.');
        }
      }
      statuses.push(rowStatus);
      add(`risk_${row.Scenario}_need`,known?row.IncomeNeed:null,'year',rowStatus,row.Scenario);
      add(`risk_${row.Scenario}_gap`,known?row.IncomeGap:null,'year',rowStatus,row.Scenario);
      add(`risk_${row.Scenario}_surplus`,known?row.IncomeSurplus:null,'year',rowStatus,row.Scenario);
      // IncomeTotal already includes the partner; never add IncomePartner again.
      add(`risk_${row.Scenario}_incomeTotal`,row.IncomeTotal,'year',rowStatus,row.Scenario);
      add(`risk_${row.Scenario}_pillar1`,row.IncomePillar1,'year',rowStatus,row.Scenario);
      add(`risk_${row.Scenario}_pillar2`,row.IncomePillar2,'year',rowStatus,row.Scenario);
    }
    const expected=req.Person2?8:4;
    if(data.RiskScenarioSummaries.length!==expected) {
      statuses.push('requires_review');problem('RISK_SCENARIOS_MISSING','risk','Not all requested person/event combinations were returned.');
    }
    status=statuses.includes('requires_review')?'requires_review':statuses.includes('needs_input')?'needs_input':'valid';
    metadata.scenarioCodes='1-4 Person1, 5-8 Person2: disability illness/accident, death illness/accident';
  } else if(operation==='retirement') {
    const data=RetirementResponse.parse(raw);const people=[req.Person1,req.Person2].filter(Boolean).map(record);
    const known=typeof req.NeedRetirement==='number' &&
      (req.NeedInPcRetirement!==true||people.every(p=>typeof p.GrossIncome==='number'));
    status=data.ErrorCode===1?'valid':'requires_review';
    if(data.ErrorCode!==1) problem('RETIREMENT_PROVIDER_CODE_REVIEW','retirement',`Provider result code ${data.ErrorCode} requires review.`);
    if(!known) {status=status==='valid'?'needs_input':status;problem('RETIREMENT_NEED_UNKNOWN','NeedRetirement','Missing retirement need is not zero.');}
    if(known && req.NeedInPcRetirement===true && people.length>1) {
      status='requires_review';problem('HOUSEHOLD_NEED_MAPPING_OPEN','NeedRetirement','Two-person percentage-need semantics need domain confirmation.');
    } else if(known) {
      const requested=req.NeedInPcRetirement===true ? Number(people[0]?.GrossIncome)*Number(req.NeedRetirement)/100:Number(req.NeedRetirement);
      if(Math.abs(data.IncomeNeed-requested)>1) {status='requires_review';problem('PROVIDER_NEED_MISMATCH','NeedRetirement','Returned retirement need differs from requested need.');}
    }
    if(known && (Math.abs(data.IncomeGap-Math.max(0,data.IncomeNeed-data.IncomeTotal))>1 ||
      Math.abs(data.IncomeTotal-data.IncomePillar1-data.IncomePillar2-data.IncomeWithdrawal)>1)) {
      status='requires_review';problem('RETIREMENT_TOTAL_MISMATCH','retirement','Income components or gap require review.');
    }
    for(const key of ['IncomeNeed','IncomeGap','IncomeTotal','IncomePillar1','IncomePillar2','IncomeWithdrawal'] as const)
      add(key,!known&&['IncomeNeed','IncomeGap'].includes(key)?null:data[key],'year',status);
    for(const key of ['AvailableFortune','CapitalNeed','CapitalGap'] as const)
      add(key,!known&&key!=='AvailableFortune'?null:data[key],'once',status);
    metadata.returnAndCapitalAssumptionsUnverified=true;
  } else if(['incomeFortuneTax','saving3a','capitalTax','purchaseP2'].includes(operation)) {
    const data=z.record(z.string(),z.unknown()).parse(raw);status='estimated';
    const keys:Record<string,{annual:string[];capital:string[]}>={
      incomeFortuneTax:{annual:['CommunityTax','ChurchTax','StateTax','FederalTax','FortuneTax','PollTax','TotalTaxes'],capital:[]},
      saving3a:{annual:['YearlyTaxBefore','YearlyTaxAfter','YearlyTaxSavings'],capital:['OverallTaxSavings','Deposits','GrossCapital','CapitalTax','NetCapital']},
      capitalTax:{annual:[],capital:['CapitalTaxes','NetCapital']},
      purchaseP2:{annual:['AdditionalPension'],capital:['TaxSavings','NetInvestment','AdditionalCapital']},
    };
    for(const [period,names] of [['year',keys[operation]!.annual],['once',keys[operation]!.capital]] as const)
      for(const name of names)add(name,z.number().finite().min(-1e10).max(1e10).parse(data[name]),period,status);
    metadata.taxAndEligibilityAssumptionsRequireReview=true;
  } else if(operation==='income') {
    const amount=z.number().finite().nonnegative().max(1e10).parse(raw);
    status='estimated';
    if(Number(req.Income)===0&&amount!==0){status='requires_review';problem('INCOME_FLOOR_APPLIED','Income','A zero income was transformed into a non-zero estimate.');}
    if(req.IncomeType===1&&req.CalculateIncomeType===3&&amount>Number(req.Income)) {
      status='requires_review';problem('INCOME_CONVERSION_FLOOR_OR_BASIS_REVIEW','Income','Net estimate exceeds the supplied gross income.');
    }
    add('convertedIncome',amount,'year',status);metadata.incomeType=req.CalculateIncomeType;
    metadata.incomeTaxNotDeducted=true;
  } else if(operation==='budgetProposal') {
    const category=z.object({Description:z.string().max(200),Amount:z.number().finite().nonnegative().max(1e10),Details:z.array(z.unknown()).max(100)});
    const data=z.object({Categories:z.array(category).max(80),SumExpenses:z.number().finite().nonnegative(),IncomeNet:z.number().finite().nonnegative(),SavingQuote:z.number().finite()}).parse(raw);
    // Archive's monthly flag is ambiguous: only explicit annual requests can be used as annual suggestions.
    status=req.BudgetMonthly===false?'estimated':'requires_review';
    if(req.BudgetMonthly!==false)problem('BUDGET_PERIOD_UNVERIFIED','BudgetMonthly','Monthly/annual units require confirmation for this provider response.');
    if(req.BudgetMonthly===false){add('proposedExpenses',data.SumExpenses,'year',status);add('proposedNetIncome',data.IncomeNet,'year',status);}
    metadata.categorySuggestions=data.Categories.map(c=>({label:c.Description,valueCents:cents(c.Amount),period:req.BudgetMonthly===false?'year':'unverified'}));
    metadata.requiresCustomerConfirmation=true;
  } else if(operation==='saving') {
    const data=z.object({Deposits:z.number().finite().nonnegative(),Interest:z.number().finite(),GrossCapital:z.number().finite().nonnegative(),
      PeriodicInvestment:z.number().finite().nonnegative(),DurationYears:z.number().int().nonnegative(),DurationMonths:z.number().int().nonnegative()}).parse(raw);
    status='estimated';add('deposits',data.Deposits,'once',status);add('projectedCapital',data.GrossCapital,'once',status);
    add('periodicInvestment',data.PeriodicInvestment,req.InvestmentMonthly===true?'month':'year',status);
    metadata.durationMonths=data.DurationYears*12+data.DurationMonths;metadata.guaranteed=false;
  } else if(operation==='consumption') {
    const data=z.object({Withdrawal:z.number().finite().nonnegative(),EndCapital:z.number().finite().nonnegative(),DurationYears:z.number().int().nonnegative(),DurationMonths:z.number().int().nonnegative()}).parse(raw);
    status='estimated';add('withdrawal',data.Withdrawal,req.WithdrawalMonthly===true?'month':'year',status);add('endCapital',data.EndCapital,'once',status);
    metadata.durationMonths=data.DurationYears*12+data.DurationMonths;metadata.guaranteed=false;
  } else if(operation==='searchLocation'||operation==='searchLocationGeo'||operation==='location') {
    const location=z.object({LocationID:z.number().int().positive(),ZipCode:z.union([z.string(),z.number()]),City:z.string(),Canton:z.string(),Location:z.string().optional()});
    const locations=operation!=='location'?z.array(location).max(200).parse(raw):[location.parse(raw)];
    metadata.locations=locations;
  } else {
    const data=BaseResponse.parse(raw);status='estimated';
    for(const [person,values] of Object.entries(data)) for(const [key,value] of Object.entries(values??{}))
      add(`${person}_${key}`,value,['CurrentCapital','CoverageCapital'].includes(key)?'once':'year','estimated');
    metadata.baselineEstimateNotPensionCertificate=true;
  }
  return {operation,status,metrics,issues,metadata};
}
