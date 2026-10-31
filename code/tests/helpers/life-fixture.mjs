import { readFile } from 'node:fs/promises';
import { DraftSchema } from '@pax/contracts';
import { loadDemoSnapshot } from '../../apps/api/dist/demo/fixtures.js';
import { normalizeResponse } from '../../apps/api/dist/logismata/normalize.js';
import { Operations } from '../../apps/api/dist/logismata/contracts.js';
import { providerInputHash } from '../../apps/api/dist/logismata/client.js';

export async function lifeDraft() {
  const financial=await loadDemoSnapshot();
  return DraftSchema.parse({financial,goals:[
    {id:'goal_family',kind:'family',targetMonth:'2028-01',priority:1,targetCapitalCents:null},
    {id:'goal_home',kind:'home',targetMonth:'2031-01',priority:2,targetCapitalCents:100000000},
    {id:'goal_retirement',kind:'retirement',targetMonth:'2050-01',priority:3,targetCapitalCents:100000000},
  ],reviewFlags:[],insurance:{relationship:'married',relationshipSinceYear:2015,sharedChildren:0,taxLocationId:400100000,
    debts:[],children:[],debtsConfirmed:true,existingPrivateRiskBenefitsConfirmed:true,confession1:4,confession2:4,taxableFortuneCents:10000000,
    retirementNeedAnnualCents:9600000,annualReturnBps:0,retirementHorizonAge:88,annualSavingCents:600000,
    annualSavingIsAdditional:true,existingAnnualRetirementSavingCents:500000,existingAnnualPillar3aContributionCents:600000,
    investmentKnowledgeConfirmed:true,riskAppetite:'medium',riskCapitalStrategy:'preserve_assets_for_other_goals',
    persons:financial.persons.map((p,index)=>({personId:p.id,providerSex:index===0?1:2,grossAnnualIncomeCents:index===0?12000000:8000000,
      withPillar2:true,pillar2Risk:{disabilityAnnualCents:index===0?4000000:2400000,disabilityChildAnnualCents:800000,survivorAnnualCents:3000000,orphanAnnualCents:800000},
      retirementPensionAnnualCents:index===0?4000000:2400000,currentPillar2CapitalCents:10000000,desiredWorkStopAge:65,
      disabilityNeedAnnualCents:15000000,deathNeedAnnualCents:10000000,protectionTermMonths:240,existingDeathCapitalCents:0,
      deathOneOffCostsCents:1000000,debtPayoffCents:0,debtTreatment:'included_in_income_need',deathNeedExcludesRepaidDebtService:false,
      personalAffordableAnnualPremiumCents:index===0?400000:300000}))}});
}
export const retirementScenario={kind:'retirement',goalId:'goal_retirement',startMonth:'2047-01',endMonth:'2055-12',
  incomeBasis:'net_after_income_tax',monthlyNeedCents:500000,monthlySavingCents:50000,annualReturnBps:0,
  savingLiquidity:'retirement_restricted',savingsReleaseMonth:'2050-01',
  releaseAssumptions:[{assetId:'pillar3_account',availableMonth:'2050-01'}],assumptionsConfirmed:true,priceBasis:'nominal',
  persons:[{personId:'person_demo_1',workEndsMonth:'2047-01',pensionStartsMonth:'2050-01',pillar1MonthlyCents:230000,pillar2MonthlyCents:300000,pillar3MonthlyCents:0},
    {personId:'person_demo_2',workEndsMonth:'2049-01',pensionStartsMonth:'2052-01',pillar1MonthlyCents:200000,pillar2MonthlyCents:150000,pillar3MonthlyCents:0}]};

export class SyntheticTestProvider {
  calls=[];
  constructor(options={}){this.options=options;}
  async execute(operation,request) {
    this.calls.push({operation,request:structuredClone(request)});
    if(this.options.wait)await this.options.wait(operation,request);
    if(this.options.failOperation===operation)throw {code:'UNAVAILABLE'};
    let response;
    if(operation==='saving3aLimits')response={Max3aSaving:7258,Max3aSavingWithoutP2:36288};
    else if(operation==='ageLimits')response={BirthYear:request.BirthYear,CurrentAge:2026-request.BirthYear,RegularPensionAge:65,MinimumAHVAge:63,MaximumAHVAge:70,
      MinimumPensionAge:58,MaximumPensionAge:70,MinimumSaving3aAge:18,MaximumSaving3aAge:65,AllowedForSaving3a:2026-request.BirthYear<65};
    else if(operation==='riskBase')response={Person1:request.Person1.Pillar2Pensions,...(request.Person2?{Person2:request.Person2.Pillar2Pensions}:{})};
    else if(operation==='retirementBase')response={Person1:{Pension:request.Person1.RetirementPillar2.Pension,CurrentCapital:100000},...(request.Person2?{Person2:{Pension:request.Person2.RetirementPillar2.Pension,CurrentCapital:100000}}:{})};
    else if(operation==='risk') {
      const people=[request.Person1,request.Person2].filter(Boolean);const rows=[];
      people.forEach((p,index)=>{for(let event=0;event<4;event++){
        const disability=event<2;const need=disability?p.NeedDisability:p.NeedDeath;
        const pillar1=disability?28000:18000;const pillar2=disability?p.Pillar2Pensions.Disability:p.Pillar2Pensions.Widow;
        const partner=people[1-index]?people[1-index].GrossIncome*.75:0;const total=pillar1+pillar2+partner;
        rows.push({Scenario:index*4+event+1,ErrorCode:this.options.riskCode??1,GrossIncome:p.GrossIncome,IncomeNeed:need,
          IncomeGap:Math.max(0,need-total),IncomeSurplus:Math.max(0,total-need),IncomeTotal:total,IncomePillar1:pillar1,IncomePillar2:pillar2,IncomePartner:partner,CapitalGap:0});
      }});response={RiskScenarioSummaries:rows};
    } else if(operation==='retirement') {
      const people=[request.Person1,request.Person2].filter(Boolean);const p1=people.length*25000;
      const p2=people.reduce((sum,p)=>sum+p.RetirementPillar2.Pension,0);const total=p1+p2;
      response={ErrorCode:1,GrossIncome:people.reduce((sum,p)=>sum+p.GrossIncome,0),IncomeNeed:request.NeedRetirement,
        IncomeGap:Math.max(0,request.NeedRetirement-total),IncomeTotal:total,IncomePillar1:p1,IncomePillar2:p2,IncomeWithdrawal:0,
        AvailableFortune:request.CurrentFortune+request.Saving*20,CapitalNeed:0,CapitalGap:0};
    } else if(operation==='income')response=request.Income*.8;
    else if(operation==='budgetProposal')response={Categories:[{Description:'Wohnen',Amount:30000,Details:[]}],SumExpenses:80000,IncomeNet:request.Income*.8,SavingQuote:20000};
    else if(operation==='saving')response={Deposits:request.InitialInvestment+request.PeriodicInvestment*request.Duration,Interest:0,
      GrossCapital:request.InitialInvestment+request.PeriodicInvestment*request.Duration,PeriodicInvestment:request.PeriodicInvestment,DurationYears:request.Duration,DurationMonths:0};
    else if(operation==='consumption')response={Withdrawal:request.Withdrawal,EndCapital:0,DurationYears:Math.max(0,Math.floor(request.StartCapital/Math.max(1,request.Withdrawal))),DurationMonths:0};
    else if(operation==='location')response={LocationID:400100000,ZipCode:4001,City:'Basel',Canton:'BS',Location:'Basel BS'};
    else if(operation==='searchLocation')response=[{LocationID:400100000,ZipCode:4001,City:'Basel',Canton:'BS',Location:'Basel BS'}];
    else {
      const file=new URL(`../../../documentation/baselhack/references/api/examples/${Operations[operation].archive}.json`,import.meta.url);
      response=JSON.parse(await readFile(file,'utf8')).response.response;
    }
    return {...normalizeResponse(operation,request,{response}),provenance:{mode:'replay',operationId:Operations[operation].id,
      inputHash:providerInputHash(operation,request),capturedAt:'2026-10-31',sourceRef:`test:synthetic-${operation}`}};
  }
}
