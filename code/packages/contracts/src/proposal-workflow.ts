import { HumanHandoverSchema,DEFAULT_HUMAN_HANDOVER,HumanAdvisorContactSchema,PAX_HUMAN_ADVISOR_CONTACT } from './human-handover.js';
import { z } from 'zod';
import { Id } from './financial.js';
import { DraftSchema,LocaleSchema } from './insurance.js';

const revision=z.number().int().positive();
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const ProposalSourceSchema=z.object({messageId:Id,turnId:Id,sourceRef:z.string().min(1).max(240)}).strict();
export const ProposalChangeInputSchema=z.object({path:z.string().min(1).max(200),value:z.json(),personId:Id.optional()}).strict();
export const AmbiguityInputSchema=z.object({path:z.string().min(1).max(200),personId:Id.optional(),question:z.string().min(1).max(1000),source:ProposalSourceSchema}).strict();
export const CaseAmbiguitySchema=AmbiguityInputSchema.extend({id:Id,locale:LocaleSchema,createdAt:z.iso.datetime(),status:z.enum(['open','resolved']),
  resolvedAt:z.iso.datetime().nullable(),resolvedByBatchId:Id.nullable(),resolutionSourceRef:z.string().min(1).max(240).nullable()}).strict();
export const AmbiguityDialogueSchema=CaseAmbiguitySchema.extend({dialogueStatus:z.enum(['needs_answer','awaiting_customer_acceptance','resolved']),answerBatchId:Id.nullable()}).strict();
export const ProposalBatchInputSchema=z.object({messageId:Id,source:ProposalSourceSchema,expectedCaseRevision:revision,
  expectedProfileVersion:revision.nullable(),basisDraftHash:hash,changes:z.array(ProposalChangeInputSchema).max(50),
  ambiguities:z.array(AmbiguityInputSchema).max(20).default([]),supersedesBatchIds:z.array(Id).max(20).default([]),supersedesProposalIds:z.array(Id).max(20).default([]),
  resolvesAmbiguityIds:z.array(Id).max(20).default([])}).strict().superRefine((b,ctx)=>{
    if(!b.changes.length&&!b.ambiguities.length)ctx.addIssue({code:'custom',path:['changes'],message:'Changes or ambiguities are required'});
    if(b.messageId!==b.source.messageId)ctx.addIssue({code:'custom',path:['source'],message:'Message identity mismatch'});
    for(const key of ['supersedesBatchIds','supersedesProposalIds','resolvesAmbiguityIds'] as const)if(new Set(b[key]).size!==b[key].length)ctx.addIssue({code:'custom',path:[key],message:'Duplicate identity'});
    // An addition (`goals_add`, …) appends one item each, so several may share the path.
    const set=b.changes.filter(c=>!c.path.endsWith('_add'));
    if(new Set(set.map(c=>c.path)).size!==set.length)ctx.addIssue({code:'custom',path:['changes'],message:'Duplicate target path'});
  });
export const ProposalBatchSchema=z.object({id:Id,messageId:Id,source:ProposalSourceSchema,createdAt:z.iso.datetime(),requestHash:hash,
  expectedProfileVersion:revision.nullable(),basisDraftHash:hash,changes:z.array(ProposalChangeInputSchema).max(50),
  status:z.enum(['proposed','accepted','superseded','rejected']),supersedesBatchIds:z.array(Id).max(20),supersedesProposalIds:z.array(Id).max(20),replacedByBatchId:Id.nullable(),
  ambiguityIds:z.array(Id).max(20),resolvesAmbiguityIds:z.array(Id).max(20),acceptedAt:z.iso.datetime().nullable()}).strict();
export const ResolveAmbiguityInputSchema=z.object({expectedCaseRevision:revision,resolutionSourceRef:z.string().min(1).max(240),resolved:z.literal(true)}).strict();
export const AmbiguityResolutionSchema=z.object({caseRevision:revision,contextRevision:revision,ambiguity:CaseAmbiguitySchema}).strict();
export const ProposalAcceptanceSchema=z.object({caseRevision:revision,contextRevision:revision,confirmationStillRequired:z.literal(true),draft:DraftSchema}).strict();
export const ExtractorContextBaseSchema=z.object({handover:HumanHandoverSchema.default(()=>structuredClone(DEFAULT_HUMAN_HANDOVER)),humanAdvisorContact:HumanAdvisorContactSchema.default(()=>structuredClone(PAX_HUMAN_ADVISOR_CONTACT)),schemaVersion:z.literal('1.0'),caseId:Id,caseRevision:revision,contextRevision:revision,
  profileVersion:revision.nullable(),draftHash:hash,draftDirty:z.boolean(),locale:LocaleSchema,dataClassification:z.literal('synthetic'),
  personIds:z.array(Id).max(2),draft:DraftSchema,
  fields:z.array(z.object({path:z.string().max(200),personId:Id.optional(),value:z.json(),confirmation:z.enum(['proposed','confirmed'])}).strict()).max(3000),
  proposalBatches:z.array(ProposalBatchSchema).max(100),ambiguities:z.array(AmbiguityDialogueSchema).max(100),
  writablePaths:z.array(z.string().max(200)).max(3000),
  policy:z.object({noRawHealthData:z.literal(true),noProviderTokens:z.literal(true),noExternalAiTransferAuthorized:z.literal(true),customerConfirmationRequired:z.literal(true)}).strict(),
}).strict();
export type ProposalBatch=z.infer<typeof ProposalBatchSchema>;
export type ProposalChangeInput=z.infer<typeof ProposalChangeInputSchema>;
export type CaseAmbiguity=z.infer<typeof CaseAmbiguitySchema>;
