import { z } from 'zod';

const chf=z.number().finite().nonnegative().max(10_000_000_000);
const year=z.number().int().min(1900).max(2100);
const pensions=z.object({CoverageCapital:chf.optional(),Disability:chf,DisabilityChildren:chf,Widow:chf,Orphan:chf}).strict();
const riskPerson=z.object({Sex:z.union([z.literal(1),z.literal(2)]),BirthYear:year,WithBVG:z.boolean(),
  GrossIncome:chf.optional(),NumberOfChildren:z.number().int().min(0).max(30).optional(),Pillar2Pensions:pensions.optional(),
  NeedInPcDisability:z.boolean().optional(),NeedDisability:chf.optional(),NeedInPcDeath:z.boolean().optional(),NeedDeath:chf.optional()}).strict();
const retirementPerson=z.object({Sex:z.union([z.literal(1),z.literal(2)]),BirthYear:year,WithBVG:z.boolean(),GrossIncome:chf.optional(),
  DesiredRetirementAge:z.number().int().min(18).max(100).optional(),
  RetirementPillar2:z.object({Pension:chf,CurrentCapital:chf.optional()}).strict().optional()}).strict();
const common={Relationship:z.number().int().min(1).max(4),RelationshipSinceYear:year,NumberOfChildren:z.number().int().min(0).max(30).optional()};
const confession=z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4),z.literal(9)]);
const taxCommon={IncomeType:z.number().int().min(1).max(3),Income:chf,TaxLocationID:z.number().int().positive(),Relationship:z.number().int().min(1).max(4),
  Confession1:confession,Confession2:confession.optional(),NumberOfChildren:z.number().int().min(0).max(30),BirthYear:year};
export const RequestSchemas={
  taxBaseInfo:z.object({}).strict(),
  searchLocationGeo:z.object({Latitude:z.number().finite().min(-90).max(90),Longitude:z.number().finite().min(-180).max(180),RadiusKm:z.number().positive().max(10000),Language:z.number().int().min(1).max(4).optional()}).strict(),
  estateGainFields:z.object({TaxLocationID:z.number().int().positive()}).strict(),
  estateGainTax:z.object({TaxLocationID:z.number().int().positive(),Relationship:common.Relationship,Confession1:confession,Confession2:confession.optional(),
    ConfessionPart1:z.number().int().min(0).max(100).optional(),TaxableGain:z.number().finite().min(-1e10).max(1e10).optional(),
    OwnerYears:z.number().int().min(0).max(300).optional(),OwnerMonths:z.number().int().min(0).max(11).optional(),
    Revenues:chf.optional(),FirstCosts:chf.optional(),BuildingInvest:chf.optional(),HasBuilding:z.boolean().optional(),SelfInhabited:z.boolean().optional(),SelfInhabYears:z.number().int().min(0).max(300).optional(),HasDiscount:z.boolean().optional()}).strict(),
  inheritanceAll:z.object({TaxLocationID:z.number().int().positive(),Amount:chf}).strict(),
  inheritanceGroup:z.object({TaxLocationID:z.number().int().positive(),Amount:chf,Group:z.union([z.literal(100),z.literal(200),z.literal(300),z.literal(400),z.literal(500),z.literal(600),z.literal(700),z.literal(800)])}).strict(),
  inheritanceBeneficiary:z.object({TaxLocationID:z.number().int().positive(),Amount:chf,Beneficiary:z.number().int().refine(n=>[101,201,202,203,301,302,303,304,305,306,307,308,401,402,403,501,502,503,504,601,602,701,702,703,704,705,706,707,801,802,803,804,805,806,807,808,809,810,811].includes(n))}).strict(),
  corporateEntityTax:z.object({TaxLocationID:z.number().int().positive(),ProfitBeforeTaxes:z.boolean(),
    TaxableProfitConf:chf,TaxableProfitCanton:chf,TaxableCapital:chf,ShareCapital:chf,NetProfitParticipationConf:chf,
    NetProfitParticipationCanton:chf,InnovationsDeduction:chf,NotionalInterestDeduction:chf,TotalAssets:chf,TotalBeneficiaryParticipation:chf}).strict(),
  incomeFortuneTax:z.object({...taxCommon,Fortune:chf.optional()}).strict(),
  saving3a:z.object({...taxCommon,Sex:z.union([z.literal(1),z.literal(2)]),Duration:z.number().int().min(1).max(100),
    InitialInvestment:chf,YearlyInvestment:chf,InterestRate:z.number().min(-50).max(20)}).strict(),
  capitalTax:z.object({CapitalPayment:chf,PaymentAge:z.number().int().min(18).max(100),TaxLocationID:z.number().int().positive(),
    Relationship:z.number().int().min(1).max(4),Confession1:confession,Confession2:confession.optional(),NumberOfChildren:z.number().int().min(0).max(30),
    Sex:z.union([z.literal(1),z.literal(2)]),BirthYear:year}).strict(),
  purchaseP2:z.object({...taxCommon,Sex:z.union([z.literal(1),z.literal(2)]),Investment:chf,PaymentDuration:z.number().int().min(1).max(50),
    InterestRate:z.number().min(-50).max(20),ConversionRate:z.number().min(0).max(20).optional()}).strict(),
  income:z.object({TaxLocationID:z.number().int().positive(),Relationship:z.number().int().min(1).max(4),NumberOfChildren:z.number().int().min(0).max(30),
    BirthYear:year,Income:chf,IncomeType:z.number().int().min(1).max(3),CalculateIncomeType:z.number().int().min(1).max(3)}).strict(),
  budgetProposal:z.object({BudgetMonthly:z.boolean(),IncomeType:z.number().int().min(1).max(3),Income:chf,Relationship:z.number().int().min(1).max(4),
    NumberOfChildren:z.number().int().min(0).max(30),UseEffectiveTax:z.boolean(),Language:z.number().int().min(1).max(4)}).strict(),
  saving:z.object({SavingGoal:z.number().int().min(1).max(3),Duration:z.number().int().min(1).max(100),InitialInvestment:chf,
    InvestmentMonthly:z.boolean(),PeriodicInvestment:chf,InterestRate:z.number().min(-50).max(20),EndCapital:chf.optional()}).strict(),
  consumption:z.object({ConsumptionGoal:z.number().int().min(1).max(3),StartCapital:chf,InterestRate:z.number().min(-50).max(20),
    WithdrawalMonthly:z.boolean(),Withdrawal:chf,Duration:z.number().int().min(1).max(100),EndCapital:chf}).strict(),
  searchLocation:z.object({Search:z.string().min(2).max(80),Language:z.number().int().min(1).max(4)}).strict(),
  location:z.object({TaxLocationID:z.number().int().positive()}).strict(),
  saving3aLimits:z.object({}).strict(),
  ageLimits:z.object({Sex:z.union([z.literal(1),z.literal(2)]),BirthYear:year}).strict(),
  riskBase:z.object({...common,Person1:riskPerson,Person2:riskPerson.optional()}).strict(),
  risk:z.object({...common,Person1:riskPerson,Person2:riskPerson.optional(),WithChildren:z.boolean().optional()}).strict(),
  retirementBase:z.object({...common,Person1:retirementPerson,Person2:retirementPerson.optional()}).strict(),
  retirement:z.object({...common,Person1:retirementPerson,Person2:retirementPerson.optional(),CurrentFortune:chf.optional(),
    InterestRate:z.number().min(-50).max(20).optional(),Saving:chf.optional(),NeedInPcRetirement:z.boolean().optional(),
    NeedRetirement:chf.optional(),LiveSpan:z.number().int().min(18).max(120).optional()}).strict()
};
export type Operation=keyof typeof RequestSchemas;
export const Operations:Record<Operation,{id:string;archive:string}>={
  taxBaseInfo:{id:'APICalc_getTaxBaseInfo',archive:'steuerstand'},
  searchLocationGeo:{id:'APICalc_searchLocationGeo',archive:'standort-suche-geo'},
  estateGainFields:{id:'APICalc_getAdditionalEstateGainFields',archive:'grundstueckgewinn-zusatzfelder'},
  estateGainTax:{id:'APICalc_calculateEstateGainTax',archive:'grundstueckgewinnsteuer'},
  inheritanceAll:{id:'APICalc_calculateAllInheritanceDonationTaxes',archive:'erbschaftssteuer-uebersicht'},
  inheritanceGroup:{id:'APICalc_calculateGroupInheritanceDonationTaxes',archive:'erbschaftssteuer-gruppe'},
  inheritanceBeneficiary:{id:'APICalc_calculateBeneficiaryInheritanceDonationTax',archive:'erbschaftssteuer-beguenstigter'},
  corporateEntityTax:{id:'APICalc_calculateCorporateEntityTax',archive:'unternehmenssteuer'},
  incomeFortuneTax:{id:'APICalc_calculateIncomeFortuneTax',archive:'einkommens-vermoegenssteuer'},
  saving3a:{id:'APICalc_calculateSaving3a',archive:'saeule-3a'},
  capitalTax:{id:'APICalc_calculateCapitalTax',archive:'kapitalleistungssteuer'},
  purchaseP2:{id:'APICalc_calculatePurchaseP2',archive:'pk-einkauf'},
  income:{id:'APICalc_calculateIncome',archive:'einkommen-umrechnen'},
  budgetProposal:{id:'APICalc_calculateBudgetProposal',archive:'budget'},
  saving:{id:'APICalc_calculateSaving',archive:'sparen'},
  consumption:{id:'APICalc_calculateConsumption',archive:'entnahme'},
  searchLocation:{id:'APICalc_searchLocation',archive:'standort-suche'},
  location:{id:'APICalc_getLocation',archive:'standort'},
  saving3aLimits:{id:'APICalc_getSaving3aLimits',archive:'3a-limiten'},
  ageLimits:{id:'APICalc_getAgeLimits',archive:'altersgrenzen'},
  riskBase:{id:'APICalc_calculateRiskBase',archive:'risiko-grunddaten'},
  risk:{id:'APICalc_calculateRisk',archive:'risiko-check'},
  retirementBase:{id:'APICalc_calculateRetirementBase',archive:'pensionierung-grunddaten'},
  retirement:{id:'APICalc_calculateRetirement',archive:'pensionierungs-check'}
};
export const ProviderEnvelope=z.object({response:z.unknown()}).passthrough().refine(r=>r.errorcode===undefined||r.errorcode===0,'Provider error envelope');
export const RiskRow=z.object({Scenario:z.number().int().min(1).max(8),ErrorCode:z.number().int(),
  GrossIncome:chf,IncomeNeed:chf,IncomeGap:chf,IncomeSurplus:chf,IncomeTotal:chf,
  IncomePillar1:chf,IncomePillar2:chf,IncomePartner:chf,CapitalGap:chf}).passthrough();
export const RiskResponse=z.object({RiskScenarioSummaries:z.array(RiskRow).min(1).max(8)})
  .refine(r=>new Set(r.RiskScenarioSummaries.map(x=>x.Scenario)).size===r.RiskScenarioSummaries.length,'Duplicate scenario');
export const RetirementResponse=z.object({ErrorCode:z.number().int(),GrossIncome:chf,IncomeNeed:chf,IncomeGap:chf,
  IncomeTotal:chf,IncomePillar1:chf,IncomePillar2:chf,IncomeWithdrawal:chf,AvailableFortune:chf,CapitalNeed:chf,CapitalGap:chf}).passthrough();
export const LimitsResponse=z.object({Max3aSaving:chf,Max3aSavingWithoutP2:chf}).passthrough();
export const AgeResponse=z.object({BirthYear:year,RegularPensionAge:z.number().int().min(18).max(100),
  MinimumAHVAge:z.number().int().min(18).max(100),MaximumAHVAge:z.number().int().min(18).max(100)}).passthrough();
export const BaseResponse=z.object({Person1:z.record(z.string(),chf),Person2:z.record(z.string(),chf).optional()}).strict();
