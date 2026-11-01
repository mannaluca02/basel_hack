import { HumanHandoverSchema,DEFAULT_HUMAN_HANDOVER,HumanAdvisorContactSchema,PAX_HUMAN_ADVISOR_CONTACT } from './human-handover.js';
import { z } from 'zod';
import { Id,Cents,Month,DateOnly,StatusSchema,IssueSchema,GraphContextSchema } from './financial.js';
import { DraftSchema,GoalSchema,LocaleSchema } from './insurance.js';
import { ProposalBatchSchema,CaseAmbiguitySchema,ExtractorContextBaseSchema } from './proposal-workflow.js';
import { LifeAnalysisSchema,ProviderResultSchema } from './life-analysis.js';

export const CASE_DTO_VERSION='1.0' as const;
const revision=z.number().int().positive();
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const timestamp=z.iso.datetime();
const signed=z.number().int().safe();
const text=z.string().max(4000);
const reasons=z.array(z.string().regex(/^[A-Z0-9_]{1,100}$/)).max(100);
export const SourceDecisionSchema=z.object({ruleId:Id,ruleVersion:z.string().max(120),runId:Id,inputHash:hash,
  reasonCodes:reasons,sourceRefs:z.array(z.string().max(2000)).max(200)}).strict();
export const ProductCandidateSchema=z.object({id:Id,productId:Id,productName:text,personId:Id.nullable(),insuredChildId:Id.optional(),
  needAmountCents:signed.nonnegative(),needPeriod:z.enum(['year','once']),rule:SourceDecisionSchema,
  premiumCents:z.null(),premiumStatus:z.literal('pax_tariff_api_unavailable'),
  eligibility:z.enum(['human_review_required','ready_for_demo']),conditions:z.array(text).max(30)}).strict();
export const RecommendationSchema=z.object({id:Id,runId:Id,profileVersion:revision,createdAt:timestamp,
  status:z.enum(['human_review_required','ready_for_demo','no_new_contract']),candidates:z.array(ProductCandidateSchema).max(30),
  alternatives:z.array(text).max(20),decision:SourceDecisionSchema}).strict();
export const ReviewTaskSchema=z.object({id:Id,runId:Id,profileVersion:z.number().int().nonnegative(),reasons,
  status:z.enum(['open','approved_for_demo','needs_information','declined']),
  decision:z.object({actorId:Id,at:timestamp,acknowledgedReasonCodes:reasons,criteria:z.array(z.string().max(100)).max(5)}).strict().nullable()}).strict();
export const DemoQuoteSchema=z.object({id:Id,recommendationId:Id,profileVersion:revision,runId:Id,createdAt:timestamp,expiresAt:timestamp,
  documents:z.array(z.object({id:Id,sha256:hash}).strict()).max(20),configurations:z.array(ProductCandidateSchema).min(1).max(10),
  demo:z.literal(true),legalEffect:z.literal('none'),premiumCents:z.null(),premiumStatus:z.literal('pax_tariff_api_unavailable')}).strict();
export const DemoApplicationSchema=z.object({id:Id,quoteId:Id,runId:Id,profileVersion:revision,createdAt:timestamp,
  status:z.enum(['draft','submitted','under_review','needs_information','accepted_for_demo','declined']),submittedAt:timestamp.nullable(),
  decisionBy:Id.nullable(),decisionAt:timestamp.nullable(),demo:z.literal(true),coverageInForce:z.literal(false)}).strict();
export const DemoPolicySchema=z.object({id:Id,applicationId:Id,profileVersion:revision,runId:Id,issuedAt:timestamp,
  demo:z.literal(true),coverageInForce:z.literal(false),legalEffect:z.literal('none'),label:z.literal('DEMO – KEIN VERSICHERUNGSSCHUTZ'),
  configuration:z.array(ProductCandidateSchema).min(1).max(10)}).strict();
export const CaseEventSchema=z.object({id:Id,contextRevision:revision,reason:z.string().min(1).max(100),at:timestamp,voiceSessionId:Id.optional()}).strict();
export const ScenarioComparisonSchema=z.object({id:Id,scope:z.literal('valuation_snapshot_local_metrics'),valuationDate:DateOnly,
  futureTimelineCompared:z.literal(false),profileVersion:revision,baselineRunId:Id,variantRunId:Id,baselineInputHash:hash,variantInputHash:hash,
  metrics:z.array(z.object({id:z.string().max(160),personId:Id.optional(),currency:z.literal('CHF'),unit:z.literal('cent'),period:z.enum(['month','year','once']),
    baselineValue:signed.nullable(),variantValue:signed.nullable(),delta:signed.nullable(),status:StatusSchema}).strict()).max(500)}).strict();
export const AdvisorProposalInputSchema=z.object({messageId:z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),path:z.string().max(200),
  value:z.union([z.number().finite(),z.boolean(),z.null(),GoalSchema,z.string().max(80)]),expectedProfileVersion:revision.nullable()}).strict();
export const AgentProposalSchema=AdvisorProposalInputSchema.extend({id:Id,basisDraftHash:hash,status:z.enum(['proposed','accepted','superseded']),replacedByBatchId:Id.nullable().optional()}).strict();
export const AcceptProposalInputSchema=z.object({expectedCaseRevision:revision,accept:z.literal(true)}).strict();
export const CasePreferencesSchema=z.object({timeBudgetMinutes:z.number().int().min(3).max(120).optional(),locale:LocaleSchema.optional()}).strict()
  .refine(b=>b.locale!==undefined||b.timeBudgetMinutes!==undefined,'At least one preference is required');
export const ConfirmedProfileSchema=z.object({version:revision,draft:DraftSchema,confirmedAt:timestamp,confirmedBy:Id,
  noticeVersion:z.enum(['lifemap-synthetic-v1','lifemap-synthetic-v2']),calculatorTransferAllowed:z.literal(true)}).strict();
export const CalculatorEstimateSchema=z.object({id:Id,draftHash:hash,at:timestamp,results:z.array(ProviderResultSchema).max(50)}).strict();
export const CalculatorToolRunSchema=z.object({id:Id,createdAt:timestamp,operation:ProviderResultSchema.shape.operation,requestUnits:z.literal('CHF_CENTS'),
  request:z.record(z.string(),z.json()),result:ProviderResultSchema,scope:z.literal('isolated_calculator_estimate'),profileMutated:z.literal(false),
  financialInputHashChanged:z.literal(false),inputHash:hash,locale:LocaleSchema}).strict();

/** Business state only. Ownership, session credentials and command caches remain server-side. */
export const InsuranceCaseStateSchema=z.object({
  handover:HumanHandoverSchema.default(()=>structuredClone(DEFAULT_HUMAN_HANDOVER)),
  id:Id,createdAt:timestamp,updatedAt:timestamp,expiresAt:timestamp,locale:LocaleSchema,timeBudgetMinutes:z.number().int().min(3).max(120),
  caseRevision:revision,contextRevision:revision,draft:DraftSchema,draftDirty:z.boolean(),
  confirmedVersions:z.array(ConfirmedProfileSchema).max(20),latestAnalysisRequestId:Id.nullable(),activeRunId:Id.nullable(),
  runs:z.array(LifeAnalysisSchema).max(20),reviewTasks:z.array(ReviewTaskSchema),recommendations:z.array(RecommendationSchema).max(20),
  quotes:z.array(DemoQuoteSchema).max(200),applications:z.array(DemoApplicationSchema).max(200),policies:z.array(DemoPolicySchema).max(200),
  graphContext:GraphContextSchema.nullable(),events:z.array(CaseEventSchema).max(100),proposals:z.array(AgentProposalSchema).max(100),
  proposalBatches:z.array(ProposalBatchSchema).max(100).default([]),ambiguities:z.array(CaseAmbiguitySchema).max(100).default([]),
  estimates:z.array(CalculatorEstimateSchema).max(10),comparisons:z.array(ScenarioComparisonSchema).max(50),
  toolRuns:z.array(CalculatorToolRunSchema).max(40).optional(),
}).strict();

export const ReasonTextSchema=z.object({code:z.string().max(100),text}).strict();
export const ProductCandidatePresentationSchema=ProductCandidateSchema.extend({explanation:text,reasonDetails:z.array(ReasonTextSchema).max(100)}).strict();
export const RecommendationPresentationSchema=RecommendationSchema.extend({locale:LocaleSchema,statusLabel:text,
  candidates:z.array(ProductCandidatePresentationSchema).max(30),disclaimer:text,documentsLanguageNotice:text}).strict();
export const RunPresentationSchema=z.object({locale:LocaleSchema,statusLabel:text,
  metrics:z.array(z.object({id:z.string().max(160),personId:Id.optional(),label:text,valueCents:signed.nullable(),formatted:text,
    period:z.enum(['month','year','once']),periodLabel:text,status:StatusSchema,statusLabel:text}).strict()).max(1000),
  assumptions:z.array(text).max(100),reviewReasons:z.array(ReasonTextSchema).max(100),issues:z.array(IssueSchema).max(2000),
  legalDocumentsNotice:text,demoLabel:text}).strict();
const presentationQuote=DemoQuoteSchema.extend({displayLabel:text}).strict();
const presentationApplication=DemoApplicationSchema.extend({displayLabel:text,statusLabel:text}).strict();
const presentationPolicy=DemoPolicySchema.extend({displayLabel:text}).strict();
export const CasePresentationSchema=z.object({locale:LocaleSchema,activeRun:RunPresentationSchema.nullable(),
  recommendations:z.array(RecommendationPresentationSchema).max(20),
  portal:z.object({quotes:z.array(presentationQuote).max(200),applications:z.array(presentationApplication).max(200),policies:z.array(presentationPolicy).max(200),
    locale:LocaleSchema,displayLabel:text,documentsLanguageNotice:text}).strict()}).strict();

export const InsuranceCaseDtoSchema=InsuranceCaseStateSchema.extend({schemaVersion:z.literal(CASE_DTO_VERSION),toolRuns:z.array(CalculatorToolRunSchema).max(40),presentation:CasePresentationSchema}).strict()
  .superRefine((c,ctx)=>{
    const fail=(path:string,message:string)=>ctx.addIssue({code:'custom',path:[path],message});
    for(const key of ['confirmedVersions','runs','reviewTasks','recommendations','quotes','applications','policies','events','proposals','proposalBatches','ambiguities','estimates','comparisons','toolRuns'] as const){
      const items=c[key]??[];const ids=items.map(x=>'id'in x?x.id:x.version);
      if(new Set(ids).size!==ids.length)fail(key,'Duplicate identity');
    }
    const versions=new Map(c.confirmedVersions.map(v=>[v.version,v])),runs=new Map(c.runs.map(r=>[r.id,r]));
    const batches=new Map(c.proposalBatches.map(b=>[b.id,b]));
    for(const b of c.proposalBatches){
      if(b.status==='superseded'&&(!b.replacedByBatchId||!batches.get(b.replacedByBatchId)?.supersedesBatchIds.includes(b.id)))fail('proposalBatches','Missing supersession link');
      if(b.status!=='superseded'&&b.replacedByBatchId!==null)fail('proposalBatches','Unexpected replacement link');
      if((b.status==='accepted')!==(b.acceptedAt!==null))fail('proposalBatches','Acceptance timestamp mismatch');
      if(b.ambiguityIds.some(id=>!c.ambiguities.some(a=>a.id===id)))fail('proposalBatches','Unknown ambiguity');
      for(const id of b.supersedesBatchIds)if(batches.get(id)?.replacedByBatchId!==b.id)fail('proposalBatches','Invalid superseded batch');
      for(const id of b.supersedesProposalIds)if(!c.proposals.some(p=>p.id===id&&p.status==='superseded'&&p.replacedByBatchId===b.id))fail('proposalBatches','Invalid superseded proposal');
    }
    for(const a of c.ambiguities){
      if(a.status==='open'&&(a.resolvedAt!==null||a.resolvedByBatchId!==null||a.resolutionSourceRef!==null))fail('ambiguities','Open ambiguity has resolution');
      if(a.status==='resolved'&&(!a.resolvedAt||!a.resolutionSourceRef))fail('ambiguities','Resolved ambiguity lacks source');
      if(a.resolvedByBatchId&&!(batches.get(a.resolvedByBatchId)?.status==='accepted'&&batches.get(a.resolvedByBatchId)?.resolvesAmbiguityIds.includes(a.id)))fail('ambiguities','Invalid resolution batch');
    }

    if(c.draft.financial&&c.draft.financial.caseId!==c.id)fail('draft','Foreign financial case');
    for(const [index,v] of c.confirmedVersions.entries())if(v.version!==index+1||!v.draft.financial||v.draft.financial.caseId!==c.id||v.draft.financial.profileVersion!==v.version)fail('confirmedVersions','Invalid confirmed profile reference');
    for(const r of c.runs)if(!versions.has(r.profileVersion)||r.local.caseId!==c.id||r.local.runId!==r.id||r.local.profileVersion!==r.profileVersion||r.local.scenarioVersionId!==r.scenarioVersionId)fail('runs','Invalid run reference');
    if(c.activeRunId){const r=runs.get(c.activeRunId);if(c.draftDirty||!r||r.status==='stale'||r.profileVersion!==c.confirmedVersions.at(-1)?.version)fail('activeRunId','Invalid active run');}
    for(const rec of c.recommendations){const run=runs.get(rec.runId);if(!run||run.profileVersion!==rec.profileVersion||rec.decision.runId!==run.id||rec.decision.inputHash!==run.inputHash)fail('recommendations','Invalid recommendation reference');
      for(const p of rec.candidates)if(p.rule.runId!==rec.runId||p.rule.inputHash!==run?.inputHash)fail('recommendations','Invalid product provenance');}
    for(const task of c.reviewTasks)if(task.runId==='intake'?task.profileVersion!==0&& !versions.has(task.profileVersion):runs.get(task.runId)?.profileVersion!==task.profileVersion)fail('reviewTasks','Invalid review reference');
    for(const q of c.quotes){const r=c.recommendations.find(r=>r.id===q.recommendationId);if(!r||r.runId!==q.runId||r.profileVersion!==q.profileVersion)fail('quotes','Invalid quote reference');}
    for(const a of c.applications){const q=c.quotes.find(q=>q.id===a.quoteId);if(!q||q.runId!==a.runId||q.profileVersion!==a.profileVersion)fail('applications','Invalid application reference');}
    for(const p of c.policies){const a=c.applications.find(a=>a.id===p.applicationId);if(!a||a.runId!==p.runId||a.profileVersion!==p.profileVersion||a.status!=='accepted_for_demo')fail('policies','Invalid demo policy reference');}
    for(const x of c.comparisons)if(runs.get(x.baselineRunId)?.inputHash!==x.baselineInputHash||runs.get(x.variantRunId)?.inputHash!==x.variantInputHash||runs.get(x.baselineRunId)?.profileVersion!==x.profileVersion||runs.get(x.variantRunId)?.profileVersion!==x.profileVersion)fail('comparisons','Invalid comparison reference');
    if(c.graphContext&&(c.graphContext.caseId!==c.id||c.graphContext.runId!==c.activeRunId||c.graphContext.profileVersion!==c.confirmedVersions.at(-1)?.version||c.graphContext.scenarioVersionId!==runs.get(c.graphContext.runId)?.scenarioVersionId))fail('graphContext','Invalid graph reference');
    if(c.presentation.locale!==c.locale||c.presentation.portal.locale!==c.locale||c.presentation.activeRun?.locale!==undefined&&c.presentation.activeRun.locale!==c.locale)fail('presentation','Presentation locale mismatch');
  });
export type InsuranceCaseDto=z.infer<typeof InsuranceCaseDtoSchema>;
export type InsuranceCase=InsuranceCaseDto;
export type InsuranceCaseState=z.infer<typeof InsuranceCaseStateSchema>;
export type SourceDecision=z.infer<typeof SourceDecisionSchema>;
export type ProductCandidate=z.infer<typeof ProductCandidateSchema>;
export type Recommendation=z.infer<typeof RecommendationSchema>;
export type ReviewTask=z.infer<typeof ReviewTaskSchema>;
export type DemoQuote=z.infer<typeof DemoQuoteSchema>;
export type DemoApplication=z.infer<typeof DemoApplicationSchema>;
export type DemoPolicy=z.infer<typeof DemoPolicySchema>;
export type CaseEvent=z.infer<typeof CaseEventSchema>;
export type ScenarioComparison=z.infer<typeof ScenarioComparisonSchema>;
export type AgentProposal=z.infer<typeof AgentProposalSchema>;
export type LifeRun=z.infer<typeof LifeAnalysisSchema>;
export type RiskNeed=z.infer<typeof import('./life-analysis.js').RiskNeedSchema>;
export type CalculatorToolRun=z.infer<typeof CalculatorToolRunSchema>;
export const LifeAnalysisResponseSchema=z.object({caseRevision:revision,contextRevision:revision,run:LifeAnalysisSchema,presentation:RunPresentationSchema}).strict();

export const ExtractorContextSchema=ExtractorContextBaseSchema.extend({proposals:z.array(AgentProposalSchema).max(100)}).strict();
export type ExtractorContext=z.infer<typeof ExtractorContextSchema>;
