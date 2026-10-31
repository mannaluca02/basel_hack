import { z } from 'zod';
import { Id } from './financial.js';
import { LocaleSchema } from './insurance.js';
import { VoiceLogSchema } from './conversation.js';
import { ProposalBatchSchema } from './proposal-workflow.js';
const revision = z.number().int().positive(), hash = z.string().regex(/^[a-f0-9]{64}$/);
export const VOICE_NOTICE_VERSION = 'voice-synthetic-v1' as const;
export const VoiceProviderSchema = z.enum(['gpt-live', 'elevenlabs']);
export const PortfolioFieldIdSchema = z.enum(['full_name', 'birth_date', 'postal_code', 'sex', 'smoker', 'civil_status', 'relationship_since_year', 'partner_birth_year', 'partner_annual_gross_income_chf', 'children_count', 'children_birth_years', 'expecting_child', 'employment_type', 'occupation', 'employment_rate_percent', 'annual_gross_income_chf', 'first_working_year_switzerland', 'has_pension_fund', 'has_pillar_3a', 'pillar_3a_annual_contribution_chf', 'existing_life_insurance', 'free_assets_chf', 'housing', 'monthly_housing_cost_chf', 'debts_chf', 'goals', 'desired_retirement_age', 'home_purchase_year', 'risk_appetite', 'net_income_band', 'net_worth_band', 'annual_saving_capacity_band', 'one_time_investment_band', 'investment_goal', 'investment_horizon', 'securities_experience', 'reaction_to_30_percent_loss']);
export const CreateVoiceSessionSchema = z.object({ messageId: Id, expectedCaseRevision: revision, provider: VoiceProviderSchema, locale: LocaleSchema,
    dataClassification: z.literal('synthetic'), noticeVersion: z.literal(VOICE_NOTICE_VERSION), allowExternalVoiceProcessing: z.literal(true),
    sdp: z.string().min(4).max(100000).optional(), resumeFrom: Id.optional() }).strict();
export const VoiceSessionSchema = z.object({ schemaVersion: z.literal('1.0'), id: Id, caseId: Id, provider: VoiceProviderSchema, locale: LocaleSchema,
    status: z.enum(['starting', 'active', 'closed', 'interrupted', 'failed']), createdAt: z.iso.datetime(), expiresAt: z.iso.datetime(), endedAt: z.iso.datetime().nullable(),
    closeReason: z.enum(['customer_closed', 'voice_switch', 'inactive', 'human_handover', 'session_revoked', 'expired', 'server_restart', 'provider_failed', 'shutdown']).nullable(),
    transcriptRevision: z.number().int().nonnegative(), turnCount: z.number().int().nonnegative(), resumeFrom: Id.nullable(),
    noticeVersion: z.literal(VOICE_NOTICE_VERSION), dataClassification: z.literal('synthetic'), externalVoiceProcessingAccepted: z.literal(true),
    remoteStop: z.enum(['not_requested', 'requested', 'failed', 'client_required']), fullContextTransferAuthorized: z.literal(false) }).strict();
export const VoiceConnectionSchema = z.discriminatedUnion('provider', [
    z.object({ provider: z.literal('gpt-live'), session: z.object({ id: z.string().min(1).max(200) }).strict(), transport: z.object({ type: z.literal('webrtc'), sdp: z.string().min(1).max(150000) }).strict() }).strict(),
    z.object({ provider: z.literal('elevenlabs'), token: z.string().min(1).max(16000), conversationId: z.string().min(1).max(200), agentId: z.string().min(1).max(200) }).strict(),
]);
export const VoiceSessionStartResponseSchema = z.object({ voiceSession: VoiceSessionSchema, connection: VoiceConnectionSchema, prompt: z.string().max(16000), replayed: z.boolean() }).strict();
export const VoiceTurnInputSchema = z.object({ speaker: z.enum(['customer', 'agent']), log: VoiceLogSchema }).strict();
export const StoredVoiceTurnSchema = VoiceTurnInputSchema.extend({ receivedAt: z.iso.datetime() }).strict();
export const VoiceTranscriptSchema = z.object({ caseId: Id, voiceSession: VoiceSessionSchema, turns: z.array(StoredVoiceTurnSchema).max(250) }).strict();
export const CloseVoiceSessionSchema = z.object({ reason: z.enum(['customer_closed', 'voice_switch', 'inactive']) }).strict();
export const VoiceObservationSchema = z.object({ fieldId: PortfolioFieldIdSchema, personId: Id.optional(), sourceMessageId: Id, quote: z.string().min(1).max(500),
    value: z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]), precision: z.enum(['exact', 'approximate', 'range', 'unknown']),
    unit: z.enum(['CHF', 'percent', 'year', 'boolean', 'enum', 'text']), period: z.enum(['month', 'year', 'once']).nullable(),
    basis: z.enum(['gross', 'net_after_income_tax', 'net_before_income_tax', 'not_applicable']).nullable() }).strict();
export const VoiceExtractionInputSchema = z.object({ messageId: Id, expectedCaseRevision: revision, expectedProfileVersion: revision.nullable(), basisDraftHash: hash,
    transcriptRevision: z.number().int().positive(), observations: z.array(VoiceObservationSchema).min(1).max(50),
    supersedesBatchIds: z.array(Id).max(20).default([]), supersedesProposalIds: z.array(Id).max(20).default([]), resolvesAmbiguityIds: z.array(Id).max(20).default([]) }).strict();
export const VoiceMappingIssueSchema = z.object({ fieldId: PortfolioFieldIdSchema, code: z.enum(['NOT_COLLECTED_FOR_DEMO', 'HUMAN_REVIEW_REQUIRED', 'LOOKUP_REQUIRED', 'STRUCTURED_INPUT_REQUIRED', 'TARGET_MISSING', 'AMBIGUOUS_VALUE']), requiresFollowUp: z.literal(true) }).strict();
export const VoiceExtractionResponseSchema = z.object({ caseId: Id, voiceSessionId: Id, caseRevision: revision, contextRevision: revision,
    mappingVersion: z.literal('voice-portfolio-v1'), proposalBatch: ProposalBatchSchema.nullable(), issues: z.array(VoiceMappingIssueSchema).max(50), confirmationStillRequired: z.literal(true), replayed: z.boolean() }).strict();
export type VoiceSession = z.infer<typeof VoiceSessionSchema>;
export type VoiceProvider = z.infer<typeof VoiceProviderSchema>;
export type VoiceConnection = z.infer<typeof VoiceConnectionSchema>;
export type VoiceObservation = z.infer<typeof VoiceObservationSchema>;
export type PortfolioFieldId = z.infer<typeof PortfolioFieldIdSchema>;
export type StoredVoiceTurn = z.infer<typeof StoredVoiceTurnSchema>;
export type VoiceMappingIssue = z.infer<typeof VoiceMappingIssueSchema>;
export type CreateVoiceSession = z.infer<typeof CreateVoiceSessionSchema>;
export type VoiceSessionStartResponse = z.infer<typeof VoiceSessionStartResponseSchema>;
export type VoiceTurnInput = z.infer<typeof VoiceTurnInputSchema>;
export type VoiceTranscript = z.infer<typeof VoiceTranscriptSchema>;
export type CloseVoiceSession = z.infer<typeof CloseVoiceSessionSchema>;
export type VoiceExtractionInput = z.infer<typeof VoiceExtractionInputSchema>;
export type VoiceExtractionResponse = z.infer<typeof VoiceExtractionResponseSchema>;
