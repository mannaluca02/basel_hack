import { z } from 'zod';
import { CaseSnapshotSchema, Cents, Id, Month, ScenarioSchema } from './financial.js';

export const LocaleSchema = z.enum(['de', 'fr', 'it', 'en']);
export const GoalSchema = z.object({
  id: Id,
  kind: z.enum(['family', 'home', 'retirement', 'child_protection', 'income_protection', 'survivor_protection']),
  targetMonth: Month.nullable(), priority: z.number().int().min(1).max(5),
  targetCapitalCents: Cents.nullable(),
}).strict();
const PensionBenefitsSchema = z.object({
  disabilityAnnualCents: Cents.nullable(), disabilityChildAnnualCents: Cents.nullable(),
  survivorAnnualCents: Cents.nullable(), orphanAnnualCents: Cents.nullable(),
}).strict();
export const InsurancePersonSchema = z.object({
  personId: Id, providerSex: z.union([z.literal(1), z.literal(2)]).nullable(),
  grossAnnualIncomeCents: Cents.nullable(), withPillar2: z.boolean().nullable(),
  pillar2Risk: PensionBenefitsSchema,
  retirementPensionAnnualCents: Cents.nullable(), currentPillar2CapitalCents: Cents.nullable(),
  desiredWorkStopAge: z.number().int().min(18).max(100).nullable(),
  disabilityNeedAnnualCents: Cents.nullable(), deathNeedAnnualCents: Cents.nullable(),
  protectionTermMonths: z.number().int().min(1).max(600).nullable(),
  existingDeathCapitalCents: Cents.nullable(),
  deathOneOffCostsCents: Cents.nullable(), debtPayoffCents: Cents.nullable(),
  debtTreatment: z.enum(['included_in_income_need', 'pay_off_separately']).nullable(),
  deathNeedExcludesRepaidDebtService: z.boolean(),
  personalAffordableAnnualPremiumCents: Cents.nullable(),
}).strict();
export const ReviewFlagSchema = z.enum([
  'user_requested', 'complex_beneficiaries', 'cross_border', 'self_employed',
  'medical_review_needed', 'investment_knowledge_missing', 'high_impact',
]);
export const InsuranceIntakeSchema = z.object({
  relationship: z.enum(['unknown', 'single', 'married', 'cohabiting', 'registered_partnership']),
  relationshipSinceYear: z.number().int().min(1900).max(2100).nullable(),
  sharedChildren: z.number().int().min(0).max(30).nullable(),
  taxLocationId: z.number().int().positive().nullable(),
  persons: z.array(InsurancePersonSchema).max(2),
  children:z.array(z.object({id:Id,birthYear:z.number().int().min(1900).max(2100),
    kind:z.enum(['shared','sole_custody','goal_only','expected']),parentPersonIds:z.array(Id).max(2),
    supportUntilMonth:Month.nullable(),goalId:Id.nullable()}).strict()).max(30),
  debts: z.array(z.object({id:Id,ownerPersonIds:z.array(Id).min(1).max(2),balanceCents:Cents.nullable(),
    annualServiceCents:Cents.nullable(),kind:z.enum(['mortgage','consumer','education','other'])}).strict()).max(30),
  debtsConfirmed:z.boolean(), existingPrivateRiskBenefitsConfirmed:z.boolean(),
  confession1:z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4),z.literal(9)]).nullable(),
  confession2:z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4),z.literal(9)]).nullable(),
  taxableFortuneCents:Cents.nullable(),
  retirementNeedAnnualCents: Cents.nullable(), annualReturnBps: z.number().int().min(-5000).max(2000).nullable(),
  retirementHorizonAge: z.number().int().min(50).max(120).nullable(),
  annualSavingCents: Cents.nullable(), investmentKnowledgeConfirmed: z.boolean(),
  annualSavingIsAdditional:z.literal(true), existingAnnualRetirementSavingCents:Cents.nullable(),
  existingAnnualPillar3aContributionCents:Cents.nullable(),
  riskAppetite: z.enum(['unknown', 'low', 'medium', 'high']),
  riskCapitalStrategy:z.enum(['use_free_assets_first','preserve_assets_for_other_goals']).nullable(),
}).strict().superRefine((x,ctx)=>{
  if(new Set(x.persons.map(p=>p.personId)).size!==x.persons.length)ctx.addIssue({code:'custom',path:['persons'],message:'Duplicate insured persons'});
  if(new Set(x.debts.map(p=>p.id)).size!==x.debts.length)ctx.addIssue({code:'custom',path:['debts'],message:'Duplicate debt IDs'});
  if(new Set(x.children.map(p=>p.id)).size!==x.children.length)ctx.addIssue({code:'custom',path:['children'],message:'Duplicate child IDs'});
  for(const debt of x.debts)if(new Set(debt.ownerPersonIds).size!==debt.ownerPersonIds.length)ctx.addIssue({code:'custom',path:['debts'],message:'Duplicate debt owners'});
});
const DraftBaseSchema = z.object({
  financial: CaseSnapshotSchema.nullable(), insurance: InsuranceIntakeSchema.nullable(),
  goals: z.array(GoalSchema).max(20), reviewFlags: z.array(ReviewFlagSchema).max(8),
}).strict();
export const DraftSchema = DraftBaseSchema.superRefine((d, ctx) => {
  if (new Set(d.goals.map(g => g.id)).size !== d.goals.length)
    ctx.addIssue({code: 'custom', path: ['goals'], message: 'Duplicate goal IDs'});
  if (!d.financial || !d.insurance) return;
  const persons = new Set(d.financial.persons.map(p => p.id));
  for (const p of d.insurance.persons) if (!persons.has(p.personId))
    ctx.addIssue({code: 'custom', path: ['insurance', 'persons'], message: 'Unknown financial person'});
  for(const asset of d.financial.assets)if(asset.ownerPersonIds?.some(id=>!persons.has(id)))
    ctx.addIssue({code:'custom',path:['financial','assets'],message:'Unknown asset owner'});
  for(const child of d.insurance.children) {
    if(child.parentPersonIds.some(id=>!persons.has(id))||new Set(child.parentPersonIds).size!==child.parentPersonIds.length)
      ctx.addIssue({code:'custom',path:['insurance','children'],message:'Unknown or duplicate child parent'});
    if(child.goalId!==null&&!d.goals.some(g=>g.id===child.goalId))
      ctx.addIssue({code:'custom',path:['insurance','children'],message:'Unknown child goal'});
  }
});
export type InsuranceDraft = z.infer<typeof DraftSchema>;
export type InsuranceIntake = z.infer<typeof InsuranceIntakeSchema>;
export const DraftPatchSchema = DraftBaseSchema.partial().extend({expectedCaseRevision: z.number().int().positive()}).strict();
export const ConfirmProfileSchema = z.object({
  expectedCaseRevision: z.number().int().positive(), confirmProfileAndAssumptions: z.literal(true),
  allowSyntheticCalculatorTransfer: z.literal(true), noticeVersion: z.literal('lifemap-synthetic-v2'),
}).strict();
export const CreateInsuranceCaseSchema = z.object({
  locale: LocaleSchema, timeBudgetMinutes: z.number().int().min(3).max(120),
  noticeVersion: z.literal('lifemap-synthetic-v2'), dataClassification: z.literal('synthetic'),
}).strict();
export const RetirementScenarioSchema = z.object({
  kind: z.literal('retirement'), goalId: Id, startMonth: Month, endMonth: Month,
  incomeBasis:z.literal('net_after_income_tax'),
  monthlyNeedCents: Cents.nullable(), monthlySavingCents: Cents,
  savingLiquidity:z.enum(['free','retirement_restricted']),savingsReleaseMonth:Month.nullable(),
  annualReturnBps: z.number().int().min(-5000).max(2000),
  releaseAssumptions: z.array(z.object({assetId: Id, availableMonth: Month}).strict()).max(40),
  persons: z.array(z.object({
    personId: Id, workEndsMonth: Month, pensionStartsMonth: Month,
    pillar1MonthlyCents: Cents.nullable(), pillar2MonthlyCents: Cents.nullable(), pillar3MonthlyCents: Cents.nullable(),
  }).strict()).min(1).max(2), assumptionsConfirmed: z.literal(true), priceBasis: z.literal('nominal'),
}).strict().superRefine((s, ctx) => {
  const count = (m: string) => Number(m.slice(0,4))*12 + Number(m.slice(5));
  if (s.endMonth < s.startMonth || count(s.endMonth)-count(s.startMonth) > 1199)
    ctx.addIssue({code:'custom',path:['endMonth'],message:'Timeline must be 1–1200 months'});
  if (new Set(s.persons.map(p=>p.personId)).size !== s.persons.length)
    ctx.addIssue({code:'custom',path:['persons'],message:'Duplicate retirement person'});
  if (new Set(s.releaseAssumptions.map(p=>p.assetId)).size !== s.releaseAssumptions.length)
    ctx.addIssue({code:'custom',path:['releaseAssumptions'],message:'Duplicate asset release'});
  for(const p of s.persons) if (p.workEndsMonth > p.pensionStartsMonth)
    ctx.addIssue({code:'custom',path:['persons'],message:'This model requires work exit before or at pension start'});
  if(s.savingLiquidity==='retirement_restricted'&&s.savingsReleaseMonth===null)
    ctx.addIssue({code:'custom',path:['savingsReleaseMonth'],message:'Restricted savings need an explicit release assumption'});
});
export type RetirementScenario = z.infer<typeof RetirementScenarioSchema>;
export const LifeScenarioSchema = z.union([ScenarioSchema, RetirementScenarioSchema]);
export type LifeScenario = z.infer<typeof LifeScenarioSchema>;
export const RunAnalysisSchema = z.object({
  expectedProfileVersion: z.number().int().positive(), scenarioVersionId: Id,
  scenario: LifeScenarioSchema, expectedCaseRevision: z.number().int().positive(),
}).strict();
export const ReviewDecisionSchema = z.object({
  runId: Id, decision: z.enum(['approved_for_demo', 'needs_information', 'declined']),
  acknowledgedReasonCodes: z.array(z.string().regex(/^[A-Z0-9_]{1,100}$/)).max(100),
  criteria: z.array(z.enum(['data_sources_checked','need_and_units_checked','beneficiaries_checked',
    'personal_affordability_checked','demo_only_understood'])).min(1).max(5),
}).strict();
export const JourneyActionSchema = z.object({
  expectedCaseRevision: z.number().int().positive(), idempotencyKey: Id,
  selectedCandidateIds:z.array(Id).min(1).max(10).optional(),
  acknowledgedDocumentIds:z.array(Id).max(20).optional(),
  recommendationId: Id.optional(), quoteId: Id.optional(), applicationId: Id.optional(),
  demoAcknowledged: z.literal(true), informationDocumentsAcknowledged: z.boolean(),
}).strict();
export const DemoApplicationDecisionSchema = z.object({
  expectedCaseRevision: z.number().int().positive(), applicationId: Id,
  idempotencyKey: Id, decision: z.enum(['accepted_for_demo','needs_information','declined']),
  demoChecks: z.object({identity:z.literal('demo_only'),health:z.literal('not_underwritten'),
    aml:z.literal('not_cleared_for_real_business'),information:z.literal(true)}).strict(),
}).strict();

export const EMPTY_INSURANCE: InsuranceIntake = {
  relationship:'unknown',relationshipSinceYear:null,sharedChildren:null,taxLocationId:null,persons:[],children:[],
  retirementNeedAnnualCents:null,annualReturnBps:null,retirementHorizonAge:null,annualSavingCents:null,
  investmentKnowledgeConfirmed:false,riskAppetite:'unknown',riskCapitalStrategy:null,
  annualSavingIsAdditional:true,existingAnnualRetirementSavingCents:null,existingAnnualPillar3aContributionCents:null,
  debts:[],debtsConfirmed:false,existingPrivateRiskBenefitsConfirmed:false,
  confession1:null,confession2:null,taxableFortuneCents:null,
};
export const PRIVACY_NOTICE = {
  version:'lifemap-synthetic-v2', dataMode:'synthetic_only',
  controller:'BaselHack prototype team; production controller and contacts require Pax release',
  purpose:'Self-service life-insurance needs and scenario demonstration using invented data',
  recipients:['Local encrypted prototype backend','Authorized Logismata hackathon calculator in live mode'],
  externalAiTransfer:false, rawHealthDataAccepted:false,
  retention:'Local demo data retained until deleted by its owner or the configured expiry; no statutory retention claim',
  productionUse:'Real customer processing, signatures, underwriting, AML and policy issuance require separate Pax-approved integrations and release',
} as const;
export type PrivacyNoticeResponse = Omit<typeof PRIVACY_NOTICE, 'externalAiTransfer' | 'recipients'> & {
  externalAiTransfer: boolean;
  recipients: readonly string[];
  locale: z.infer<typeof LocaleSchema>;
  display: Record<'title'|'purpose'|'recipients'|'storage'|'release', string>;
};
