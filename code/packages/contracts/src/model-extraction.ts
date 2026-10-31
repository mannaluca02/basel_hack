import { z } from 'zod';
import { Id } from './financial.js';
import { LocaleSchema } from './insurance.js';
const revision=z.number().int().positive(),hash=z.string().regex(/^[a-f0-9]{64}$/);
/** Separate notice for Earnie's synthetic OpenAI intake extraction; independent of calculator, profile and voice consent. */
export const MODEL_EXTRACTION_NOTICE_VERSION='extraction-synthetic-v1' as const;
export const ModelExtractionPayloadScopeSchema=z.enum(['invented_conversation_excerpt','pseudonymous_person_id','relevant_field_values_with_unit_and_income_basis','allowed_target_paths','related_clarifications']);
export const ModelExtractionExclusionSchema=z.enum(['full_case_context','revisions_hashes_and_permissions','credentials_and_tokens','raw_audio','health_data','real_customer_data']);
export const ModelExtractionNoticeSchema=z.object({version:z.literal(MODEL_EXTRACTION_NOTICE_VERSION),noticeHash:hash,enabled:z.boolean(),
  provider:z.literal('openai'),api:z.literal('responses'),purpose:z.literal('intake_field_extraction'),syntheticOnly:z.literal(true),separateConsentRequired:z.literal(true),
  payloadScope:z.array(ModelExtractionPayloadScopeSchema),excluded:z.array(ModelExtractionExclusionSchema),fullCaseTransferAuthorized:z.literal(false),
  resultIsProposalOnly:z.literal(true),calculatorTransferIsSeparate:z.literal(true),locale:LocaleSchema,text:z.string().min(1).max(4000)}).strict();
export const ModelExtractionConsentInputSchema=z.object({expectedCaseRevision:revision,noticeVersion:z.literal(MODEL_EXTRACTION_NOTICE_VERSION),noticeHash:hash,
  dataClassification:z.literal('synthetic'),allowSyntheticModelExtraction:z.literal(true)}).strict();
export const RevokeModelExtractionConsentSchema=z.object({expectedCaseRevision:revision}).strict();
export const ModelExtractionPermissionSchema=z.object({caseId:Id,caseRevision:revision,enabled:z.boolean(),noticeVersion:z.literal(MODEL_EXTRACTION_NOTICE_VERSION),noticeHash:hash,
  consent:z.object({noticeVersion:z.string().min(1).max(80),noticeHash:hash,locale:LocaleSchema,acceptedAt:z.iso.datetime()}).strict().nullable(),
  transferAllowed:z.boolean(),blockedReason:z.enum(['disabled','consent_missing','notice_changed','human_handover_active']).nullable()}).strict()
  .refine(p=>p.transferAllowed===(p.blockedReason===null),'Transfer permission and blocked reason disagree');
export type ModelExtractionNotice=z.infer<typeof ModelExtractionNoticeSchema>;
export type ModelExtractionConsent=NonNullable<z.infer<typeof ModelExtractionPermissionSchema>['consent']>;
export type ModelExtractionPermission=z.infer<typeof ModelExtractionPermissionSchema>;
