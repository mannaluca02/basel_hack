import { z } from 'zod';
import { Id,Month,StatusSchema,GraphContextSchema,ProgressSchema } from './financial.js';
import { LocaleSchema } from './insurance.js';
import { ScenarioComparisonSchema } from './insurance-case.js';

const revision=z.number().int().positive();
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const FollowUpQuestionSchema=z.object({path:z.string().max(250),mandatory:z.literal(true),text:z.string().max(4000)}).strict();
export const QuestionsResponseSchema=z.object({profileVersion:revision.nullable(),caseRevision:revision,contextRevision:revision,
  mandatoryFields:z.array(z.string().max(250)),questions:z.array(FollowUpQuestionSchema).max(3),pace:z.enum(['compact','detailed'])}).strict();
export const WholeLifeProgressSchema=ProgressSchema.extend({scope:z.literal('whole_life_intake'),
  groups:z.array(z.object({id:Id,complete:z.boolean(),missing:z.array(z.string()),label:z.string().max(4000)}).strict())}).strict();
export const ApprovedFactSchema=z.object({metricId:z.string().max(160),value:z.number().int().safe(),currency:z.literal('CHF'),unit:z.literal('cent'),
  period:z.enum(['month','year','once']),status:StatusSchema,runId:Id,profileVersion:revision,scenarioVersionId:Id,
  humanReviewedForDemo:z.boolean(),label:z.string().max(4000),statusLabel:z.string().max(4000)}).strict();
const graphPoint=z.object({month:Month,value:z.number().int().safe().nullable(),unit:z.literal('cent'),currency:z.literal('CHF'),
  period:z.enum(['month','once']),status:StatusSchema}).strict();
export const SelectedGraphFactsSchema=z.object({metric:z.object({id:z.string().max(160),value:z.number().int().safe().nullable(),unit:z.literal('cent'),currency:z.literal('CHF'),
  period:z.enum(['month','year','once','range']),status:StatusSchema,personId:Id.optional(),sourceRefs:z.array(z.string()).optional()}).strict(),
  series:z.array(graphPoint).max(24),sourceRefs:z.array(z.string()),
  rangeSummary:z.object({points:z.number().int().min(25).max(1200),first:graphPoint,last:graphPoint,
    minimumKnown:z.number().int().safe().nullable(),maximumKnown:z.number().int().safe().nullable(),unknownPoints:z.number().int().nonnegative()}).strict().optional()}).strict();
export const AdvisorContextSchema=z.object({caseId:Id,caseRevision:revision,contextRevision:revision,profileVersion:revision.nullable(),
  runId:Id.nullable(),scenarioVersionId:Id.nullable(),calculationInputHash:hash.nullable(),locale:LocaleSchema,tempo:z.enum(['compact','detailed']),
  graphContext:GraphContextSchema.nullable(),contextId:hash.nullable(),selectedGraphFacts:SelectedGraphFactsSchema.nullable(),
  maySpeakSelectedAmounts:z.boolean(),calculationStatus:z.enum(['current','stale','provider_error','needs_input','running']),
  approvedFacts:z.array(ApprovedFactSchema).max(1000),nextQuestion:FollowUpQuestionSchema.nullable(),missingFields:z.array(z.string()),
  scenarioComparisons:z.array(ScenarioComparisonSchema).max(1),reviewStatus:z.enum(['approved_for_demo','open','not_started']),maySpeakAmounts:z.boolean(),
  progress:WholeLifeProgressSchema,allowedActions:z.array(z.enum(['read_context','propose_patch','update_draft','confirm_profile','calculate','request_human','record_review'])).max(10),
  policy:z.object({noRawHealthData:z.literal(true),noProviderTokens:z.literal(true),noExternalAiTransferAuthorized:z.literal(true),productFirstSelling:z.literal(false)}).strict(),
}).strict();
export const AdvisorContextUpdatedSchema=z.object({schemaVersion:z.literal('1.0'),messageId:Id,caseId:Id,correlationId:Id,eventId:Id,
  contextRevision:revision,reason:z.string().max(100),contextRef:z.string().regex(/^\/api\/cases\/[A-Za-z0-9_-]+\/advisor\/context$/),
  interruptPolicy:z.enum(['refresh_before_next_turn','if_current_answer_invalid'])}).strict()
  .refine(e=>e.contextRef===`/api/cases/${e.caseId}/advisor/context`,'Event context belongs to a different case');
export const ApiErrorSchema=z.object({code:z.string().regex(/^[A-Z0-9_]{1,100}$/),fields:z.array(z.string()).optional(),locale:LocaleSchema,message:z.string().max(4000)}).strict();
export const SessionResponseSchema=z.object({sessionToken:z.string().regex(/^[A-Za-z0-9_-]{40,100}$/),csrfToken:z.string().regex(/^[A-Za-z0-9_-]{40,100}$/),expiresAt:z.iso.datetime(),role:z.enum(['customer','reviewer']),actorId:Id}).strict();
export const AgentAccessResponseSchema=z.object({sessionToken:z.string().regex(/^[A-Za-z0-9_-]{40,100}$/),role:z.literal('advisor'),caseId:Id,expiresAt:z.iso.datetime()}).strict();
export type AdvisorContext=z.infer<typeof AdvisorContextSchema>;
export type AdvisorContextUpdated=z.infer<typeof AdvisorContextUpdatedSchema>;
export type WholeLifeProgress=z.infer<typeof WholeLifeProgressSchema>;
export type QuestionsResponse=z.infer<typeof QuestionsResponseSchema>;
export type ApiError=z.infer<typeof ApiErrorSchema>;
export type SessionResponse=z.infer<typeof SessionResponseSchema>;
export type AgentAccessResponse=z.infer<typeof AgentAccessResponseSchema>;
