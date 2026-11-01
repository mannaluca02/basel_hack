import {z} from 'zod';
import {Id} from './financial.js';

/**
 * Digital pre-check modelled on the Pax form "Angemessenheitsprüfung für qualifizierte
 * Lebensversicherungen" (0054/PMPV/03.2026). It is not the legally binding check: the form may only
 * be used unchanged, and a released digital equivalent has to be agreed with Pax. Until then the
 * pre-check blocks unsuitable selections and leaves the binding check to a Pax advisor.
 */
export const SUITABILITY_FORM_VERSION='0054/PMPV/03.2026';
/** Products whose saving process carries a loss risk (fund-linked or capitalization). */
export const QUALIFIED_PRODUCT_IDS=['pax_fondsstar','pax_lifestar','pax_payout'] as const;

export const NetIncomeBandSchema=z.enum(['under_75k','75k_150k','150k_250k','over_250k']);
export const AssetBandSchema=z.enum(['under_10k','10k_50k','50k_150k','150k_300k','over_300k']);
export const SavingCapacityBandSchema=z.enum(['under_1k','1k_3k','3k_7k','over_7k']);
export const InvestmentGoalSchema=z.enum(['low_risk','moderate_risk','high_risk']);
export const InvestmentHorizonSchema=z.enum(['under_10_years','10_to_15_years','over_15_years']);
export const SecuritiesExperienceSchema=z.enum(['none','knowledge_only','experience','extensive']);
export const LossReactionSchema=z.enum(['sell_all','sell_part','hold','buy_more']);
export const InvestmentStrategySchema=z.enum(['conservative','balanced','dynamic']);

const cents=z.number().int().safe().nonnegative();
export const SuitabilityAnswersSchema=z.object({
  /** A: what the person wants to pay; at least one of both. Own values only, no partner values. */
  annualPremiumCents:cents.nullable(),singleInvestmentCents:cents.nullable(),
  netIncome:NetIncomeBandSchema,netWorth:AssetBandSchema,annualSavingCapacity:SavingCapacityBandSchema,singleInvestmentCapacity:AssetBandSchema,
  /** B and C: the scored investment profile. */
  investmentGoal:InvestmentGoalSchema,horizon:InvestmentHorizonSchema,securitiesExperience:SecuritiesExperienceSchema,lossReaction:LossReactionSchema,
  /** D: guaranteed part in percent of the premium or investment, 0 without guarantee. */
  guaranteedPercent:z.number().int().min(0).max(100),
  selectedStrategy:InvestmentStrategySchema,
}).strict().refine(a=>a.annualPremiumCents!==null||a.singleInvestmentCents!==null,{message:'Premium or single investment required',path:['annualPremiumCents']});

export const SuitabilityCheckInputSchema=z.object({
  expectedCaseRevision:z.number().int().positive(),productId:z.enum(QUALIFIED_PRODUCT_IDS),personId:Id,
  answers:SuitabilityAnswersSchema,answersConfirmedByCustomer:z.literal(true),
}).strict();

export const SuitabilityReasonSchema=z.enum(['NOT_AFFORDABLE','STRATEGY_DOES_NOT_MATCH_PROFILE','HORIZON_TOO_SHORT']);
export const SuitabilityCheckSchema=z.object({
  id:Id,createdAt:z.iso.datetime(),formVersion:z.literal(SUITABILITY_FORM_VERSION),binding:z.literal(false),
  productId:z.enum(QUALIFIED_PRODUCT_IDS),personId:Id,profileVersion:z.number().int().positive(),answers:SuitabilityAnswersSchema,
  points:z.object({goal:z.number().int(),horizon:z.number().int(),experience:z.number().int(),lossReaction:z.number().int(),
    total:z.number().int(),afterGuarantee:z.number()}).strict(),
  profileStrategy:InvestmentStrategySchema,affordable:z.boolean(),strategyMatches:z.boolean(),
  result:z.enum(['suitable','advised_against']),reasons:z.array(SuitabilityReasonSchema),
  /** The binding check and signature stay with a Pax advisor. */
  humanConfirmationRequired:z.literal(true),
}).strict();
export const SuitabilityViewSchema=z.object({caseId:Id,formVersion:z.literal(SUITABILITY_FORM_VERSION),binding:z.literal(false),
  qualifiedProductIds:z.array(z.enum(QUALIFIED_PRODUCT_IDS)),checks:z.array(SuitabilityCheckSchema)}).strict();

/** Steps a real contract needs that this demo does not perform; shown instead of being skipped. */
export const ComplianceStepSchema=z.object({
  id:z.enum(['identification','aml_check','health_declaration','signature']),
  status:z.literal('required_in_real_integration'),label:z.string().max(4000),explanation:z.string().max(4000),
}).strict();

export type SuitabilityAnswers=z.infer<typeof SuitabilityAnswersSchema>;
export type SuitabilityCheck=z.infer<typeof SuitabilityCheckSchema>;
export type SuitabilityView=z.infer<typeof SuitabilityViewSchema>;
export type InvestmentStrategy=z.infer<typeof InvestmentStrategySchema>;
