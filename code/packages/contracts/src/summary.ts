import {z} from 'zod';
import {Id,AnalysisResultSchema,CaseSnapshotSchema,StatusSchema} from './financial.js';
import {GoalSchema,LocaleSchema} from './insurance.js';
import {LifeAnalysisSchema,ProviderResultSchema} from './life-analysis.js';
import {ComplianceStepSchema} from './suitability.js';
import {CASE_DTO_VERSION,DemoQuoteSchema,DemoApplicationSchema,DemoPolicySchema,ReviewTaskSchema,
  RecommendationPresentationSchema,RunPresentationSchema,ScenarioComparisonSchema,SourceDecisionSchema} from './insurance-case.js';

const text=z.string().max(4000),hash=z.string().regex(/^[a-f0-9]{64}$/),version=z.number().int().positive();
export const PortalDtoSchema=z.object({schemaVersion:z.literal(CASE_DTO_VERSION),caseId:Id,caseRevision:version,profileVersion:version.nullable(),activeRunId:Id.nullable(),
  reviewTasks:z.array(ReviewTaskSchema.extend({current:z.boolean(),statusLabel:text}).strict()),
  quotes:z.array(DemoQuoteSchema.extend({stale:z.boolean(),displayLabel:text}).strict()),
  applications:z.array(DemoApplicationSchema.extend({stale:z.boolean(),displayLabel:text,statusLabel:text}).strict()),
  policies:z.array(DemoPolicySchema.extend({adviceContextChanged:z.boolean(),displayLabel:text}).strict()),
  /** Identification, AML, health declaration and signature: required for a real contract, not performed in this demo. */
  complianceSteps:z.array(ComplianceStepSchema).length(4),
  realInsuranceCoverage:z.literal(false),paxContractIntegrationAvailable:z.literal(false),locale:LocaleSchema,displayLabel:text,documentsLanguageNotice:text}).strict();
export const CustomerSummarySchema=z.object({schemaVersion:z.literal(CASE_DTO_VERSION),snapshotId:hash,caseId:Id,profileVersion:version.nullable(),runId:Id.nullable(),calculationInputHash:hash.nullable(),
  draftPending:z.boolean(),goals:z.array(GoalSchema),financial:CaseSnapshotSchema.nullable(),metrics:AnalysisResultSchema.shape.metrics,
  capitalAllocations:AnalysisResultSchema.shape.capitalBreakdown,riskNeeds:LifeAnalysisSchema.shape.riskNeeds,timeline:LifeAnalysisSchema.shape.timeline,
  pillarPicture:LifeAnalysisSchema.shape.pillarPicture.or(z.tuple([])),assumptions:z.array(text),reviewReasons:z.array(z.string()),reviewTasks:PortalDtoSchema.shape.reviewTasks,
  recommendations:z.array(RecommendationPresentationSchema),comparisons:z.array(ScenarioComparisonSchema),portal:PortalDtoSchema,
  coverageInForce:z.literal(false),demo:z.literal(true),locale:LocaleSchema,presentation:RunPresentationSchema.nullable()}).strict();
export const AdvisorSummarySchema=CustomerSummarySchema.extend({
  providerProvenance:z.array(z.object({operation:ProviderResultSchema.shape.operation,status:StatusSchema,provenance:ProviderResultSchema.shape.provenance,issues:ProviderResultSchema.shape.issues}).strict()),
  openQuestions:z.array(z.string()),decisions:z.array(SourceDecisionSchema)}).strict();
export const SummaryBundleSchema=z.object({schemaVersion:z.literal(CASE_DTO_VERSION),snapshotId:hash,customer:CustomerSummarySchema,advisor:AdvisorSummarySchema}).strict()
  .superRefine((bundle,ctx)=>{
    if(bundle.snapshotId!==bundle.customer.snapshotId||bundle.snapshotId!==bundle.advisor.snapshotId)
      ctx.addIssue({code:'custom',path:['snapshotId'],message:'Summary snapshot mismatch'});
    for(const key of ['caseId','profileVersion','runId','calculationInputHash','financial','goals','metrics','capitalAllocations','riskNeeds','timeline','pillarPicture','reviewTasks','portal'] as const)
      if(JSON.stringify(bundle.customer[key])!==JSON.stringify(bundle.advisor[key]))ctx.addIssue({code:'custom',path:['advisor',key],message:'Customer/advisor business values differ'});
  });
export type PortalDto=z.infer<typeof PortalDtoSchema>;
export type CustomerSummary=z.infer<typeof CustomerSummarySchema>;
export type SummaryBundle=z.infer<typeof SummaryBundleSchema>;
