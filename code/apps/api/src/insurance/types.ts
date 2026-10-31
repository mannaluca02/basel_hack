import type { AnalysisResult, InsuranceDraft, LifeScenario, GraphContext, Status } from '@pax/contracts';
import type { retirementTimeline } from '@pax/domain';
import type { NormalizedProviderResult } from '../logismata/normalize.js';

export type Actor = { id:string; role:'customer'|'reviewer'|'advisor'; caseId?:string; sessionHash:string; expiresAt:string;csrfHash?:string };
export type AuditEvent = {id:string;at:string;actorId:string;action:string;caseId:string|null;profileVersion:number|null;outcome:string};
export type SourceDecision = {ruleId:string;ruleVersion:string;runId:string;inputHash:string;reasonCodes:string[];sourceRefs:string[]};
export type RiskNeed = {
  personId:string;scenario:number;event:'disability_illness'|'disability_accident'|'death_illness'|'death_accident';
  annualNeedCents:number|null;providerReportedNeedCents:number|null;providerIncomeCents:number|null;privatePillar3IncomeCents:number|null;annualGapCents:number|null;
  deathCapitalCents:number|null;liquidAssetsAppliedCents:number|null;status:Status;sourceRefs:string[];
};
export type LifeRun = {
  id:string;modelVersion:string;profileVersion:number;scenarioVersionId:string;inputHash:string;createdAt:string;scenario:LifeScenario;
  status:'current'|'stale'|'provider_error'|'needs_input';local:AnalysisResult;
  providerResults:NormalizedProviderResult[];providerFailures:{operation:string;code:string}[];
  riskNeeds:RiskNeed[];timeline:ReturnType<typeof retirementTimeline>|null;
  reviewReasons:string[];assumptions:string[];
  pillarPicture:{pillar:'1'|'2'|'3';status:string;annualPensions:{event:string;personId:string|null;amountCents:number|null}[];
    capitalCents:number|null;annualContributionCents:number|null;capitalIsReferenceOnly:boolean;sourceRefs:string[]}[];
};
export type ProductCandidate = {
  id:string;productId:string;productName:string;personId:string|null;insuredChildId?:string;needAmountCents:number;
  needPeriod:'year'|'once';rule:SourceDecision;premiumCents:null;premiumStatus:'pax_tariff_api_unavailable';
  eligibility:'human_review_required'|'ready_for_demo';conditions:string[];
};
export type Recommendation = {id:string;runId:string;profileVersion:number;createdAt:string;
  status:'human_review_required'|'ready_for_demo'|'no_new_contract';candidates:ProductCandidate[];alternatives:string[];decision:SourceDecision};
export type ReviewTask = {id:string;runId:string;profileVersion:number;reasons:string[];
  status:'open'|'approved_for_demo'|'needs_information'|'declined';
  decision:null|{actorId:string;at:string;acknowledgedReasonCodes:string[];criteria:string[]}};
export type DemoQuote = {id:string;recommendationId:string;profileVersion:number;runId:string;createdAt:string;
  expiresAt:string;documents:{id:string;sha256:string}[];
  demo:true;legalEffect:'none';premiumCents:null;premiumStatus:'pax_tariff_api_unavailable';configurations:ProductCandidate[]};
export type DemoApplication = {id:string;quoteId:string;runId:string;profileVersion:number;createdAt:string;
  status:'draft'|'submitted'|'under_review'|'needs_information'|'accepted_for_demo'|'declined';
  submittedAt:string|null;decisionBy:string|null;decisionAt:string|null;demo:true;coverageInForce:false};
export type DemoPolicy = {id:string;applicationId:string;profileVersion:number;runId:string;issuedAt:string;
  demo:true;coverageInForce:false;legalEffect:'none';label:'DEMO – KEIN VERSICHERUNGSSCHUTZ';configuration:ProductCandidate[]};
export type CaseEvent = {id:string;contextRevision:number;reason:string;at:string};
export type ScenarioComparison={id:string;scope:'valuation_snapshot_local_metrics';valuationDate:string;futureTimelineCompared:false;profileVersion:number;baselineRunId:string;variantRunId:string;baselineInputHash:string;variantInputHash:string;
  metrics:{id:string;personId?:string;currency:'CHF';unit:'cent';period:'month'|'year'|'once';baselineValue:number|null;variantValue:number|null;delta:number|null;status:string}[]};
export type AgentProposal = {id:string;path:string;value:unknown;expectedProfileVersion:number|null;basisDraftHash:string;status:'proposed'|'accepted';messageId:string};
export type InsuranceCase = {
  id:string;ownerId:string;createdAt:string;updatedAt:string;expiresAt:string;locale:'de'|'fr'|'it'|'en';timeBudgetMinutes:number;
  caseRevision:number;contextRevision:number;draft:InsuranceDraft;draftDirty:boolean;
  confirmedVersions:{version:number;draft:InsuranceDraft;confirmedAt:string;confirmedBy:string;noticeVersion:string;calculatorTransferAllowed:true}[];
  latestAnalysisRequestId:string|null;activeRunId:string|null;runs:LifeRun[];reviewTasks:ReviewTask[];
  recommendations:Recommendation[];quotes:DemoQuote[];applications:DemoApplication[];policies:DemoPolicy[];
  graphContext:GraphContext|null;events:CaseEvent[];proposals:AgentProposal[];
  estimates:{id:string;draftHash:string;at:string;results:NormalizedProviderResult[]}[];
  comparisons:ScenarioComparison[];
  idempotency:Record<string,{fingerprint:string;result:unknown}>;
};
export type Database = {
  version:1;sessions:Record<string,Actor>;cases:Record<string,InsuranceCase>;audit:AuditEvent[];
  feedback:{caseId:string;at:string;stage:string;score:number}[];
};
export const emptyDatabase = ():Database => ({version:1,sessions:{},cases:{},audit:[],feedback:[]});
export class WorkflowError extends Error {
  constructor(public readonly code:string,public readonly status=409,public readonly fields:string[]=[]){super(code);}
}
