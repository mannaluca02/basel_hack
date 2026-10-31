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
export const RequestSchemas={
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
