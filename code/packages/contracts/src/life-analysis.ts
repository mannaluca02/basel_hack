import { z } from 'zod';
import { AnalysisResultSchema,Id,Month,StatusSchema,IssueSchema } from './financial.js';
import { LifeScenarioSchema } from './insurance.js';

const amount=z.number().int().safe().nonnegative();
const optionalAmount=amount.nullable();
export const ProviderResultSchema=z.object({
  operation:z.enum(['saving3aLimits','ageLimits','riskBase','risk','retirementBase','retirement','income','budgetProposal',
    'saving','consumption','searchLocation','location','incomeFortuneTax','saving3a','capitalTax','purchaseP2']),
  status:StatusSchema,
  metrics:z.array(z.object({id:z.string().max(160),value:z.number().int().safe().nullable(),currency:z.literal('CHF'),unit:z.literal('cent'),
    period:z.enum(['month','year','once']),status:StatusSchema,scenario:z.number().int().min(1).max(8).optional()}).strict()).max(200),
  issues:z.array(IssueSchema).max(100),metadata:z.record(z.string(),z.json()),
  provenance:z.object({mode:z.enum(['live','replay']),operationId:Id,inputHash:z.string().regex(/^[a-f0-9]{64}$/),capturedAt:z.string().max(50),sourceRef:z.string().max(250)}).strict(),
}).strict();
const timelinePerson=z.object({personId:Id,employmentCents:optionalAmount,pillar1Cents:optionalAmount,pillar2Cents:optionalAmount,
  pillar3Cents:optionalAmount,phase:z.enum(['working','bridge','pension'])}).strict();
export const RetirementTimelineSchema=z.object({
  status:z.enum(['estimated','needs_input']),priceBasis:z.literal('nominal'),guaranteed:z.literal(false),
  periods:z.array(z.object({month:Month,persons:z.array(timelinePerson).min(1).max(2),knownIncomeCents:amount,incomeCents:optionalAmount,
    needCents:optionalAmount,withdrawalCents:optionalAmount,unfundedCents:optionalAmount,capitalCents:optionalAmount,
    knownCapitalCents:amount,contributionCents:amount,unfundedContributionCents:amount,restrictedSavingCapitalCents:amount,
    status:z.enum(['estimated','needs_input'])}).strict()).max(1200),
  phases:z.array(z.object({fromMonth:Month,persons:z.array(z.object({personId:Id,phase:z.enum(['working','bridge','pension'])}).strict())}).strict()),
  issues:z.array(IssueSchema),firstUnfundedMonth:Month.nullable(),assumptions:z.array(z.string()),
}).strict();
export const RiskNeedSchema=z.object({
  personId:Id,scenario:z.number().int().min(1).max(8),event:z.enum(['disability_illness','disability_accident','death_illness','death_accident']),
  annualNeedCents:optionalAmount,providerReportedNeedCents:optionalAmount,providerIncomeCents:optionalAmount,
  privatePillar3IncomeCents:optionalAmount,annualGapCents:optionalAmount,deathCapitalCents:optionalAmount,liquidAssetsAppliedCents:optionalAmount,
  status:StatusSchema,sourceRefs:z.array(z.string()),
}).strict();
export const LifeAnalysisSchema=z.object({
  id:Id,modelVersion:z.string(),profileVersion:z.number().int().positive(),scenarioVersionId:Id,inputHash:z.string().regex(/^[a-f0-9]{64}$/),
  createdAt:z.iso.datetime(),scenario:LifeScenarioSchema,status:z.enum(['current','stale','provider_error','needs_input']),
  local:AnalysisResultSchema,providerResults:z.array(ProviderResultSchema).max(50),
  providerFailures:z.array(z.object({operation:z.string().max(80),code:z.string().regex(/^[A-Z0-9_]{2,100}$/)}).strict()).max(50),
  riskNeeds:z.array(RiskNeedSchema).max(8),timeline:RetirementTimelineSchema.nullable(),
  reviewReasons:z.array(z.string().regex(/^[A-Z0-9_]{1,100}$/)).max(100),assumptions:z.array(z.string()),
  pillarPicture:z.array(z.object({pillar:z.enum(['1','2','3']),status:StatusSchema,
    annualPensions:z.array(z.object({event:z.string(),personId:Id.nullable(),amountCents:optionalAmount}).strict()),
    capitalCents:optionalAmount,annualContributionCents:optionalAmount,capitalIsReferenceOnly:z.literal(true),sourceRefs:z.array(z.string()),
  }).strict()).length(3),
}).strict();
export type LifeAnalysis=z.infer<typeof LifeAnalysisSchema>;
