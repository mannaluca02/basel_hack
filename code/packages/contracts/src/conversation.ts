import { z } from 'zod';
import { Id,GraphContextSchema } from './financial.js';
import { LocaleSchema } from './insurance.js';

const envelope={schemaVersion:z.literal('1.0'),messageId:Id,caseId:Id,correlationId:Id,turnId:Id};
const hash=z.string().regex(/^[a-f0-9]{64}$/);
/** Cross-team message schemas. Their voice/LLM transports belong to Dario, Earnie and Lukas. */
export const VoiceLogSchema=z.object({...envelope,source:z.enum(['voice','text']),locale:LocaleSchema,text:z.string().min(1).max(8000),
  transcriptStatus:z.literal('final'),dataClassification:z.literal('synthetic'),expectedCaseRevision:z.number().int().positive().optional()}).strict();
export const AgentReplySchema=z.object({...envelope,replyId:Id,contextRevision:z.number().int().positive(),
  kind:z.enum(['question','patch_proposal','explanation','summary_notice','error']),locale:LocaleSchema,text:z.string().min(1).max(12000),
  requiresConfirmation:z.boolean(),containsFinancialAmounts:z.boolean(),contextId:hash.nullable(),
  runId:Id.nullable(),profileVersion:z.number().int().positive().nullable(),scenarioVersionId:Id.nullable(),calculationInputHash:hash.nullable(),
  factRefs:z.array(z.object({metricId:z.string().max(160),runId:Id,profileVersion:z.number().int().positive(),scenarioVersionId:Id,sourceRefs:z.array(z.string()).min(1).max(100)}).strict()).max(100),
}).strict().superRefine((r,ctx)=>{
  if(r.kind==='patch_proposal'&&!r.requiresConfirmation)ctx.addIssue({code:'custom',path:['requiresConfirmation'],message:'A proposal requires customer confirmation'});
  if(r.containsFinancialAmounts&&(!r.runId||!r.profileVersion||!r.scenarioVersionId||!r.calculationInputHash||!r.factRefs.length))
    ctx.addIssue({code:'custom',path:['factRefs'],message:'Financial statements require current source references'});
  for(const f of r.factRefs)if(f.runId!==r.runId||f.profileVersion!==r.profileVersion||f.scenarioVersionId!==r.scenarioVersionId)
    ctx.addIssue({code:'custom',path:['factRefs'],message:'Reply source reference mismatch'});
});
export const VoicePlaybackEventSchema=z.object({...envelope,replyId:Id,playbackId:Id,event:z.enum(['started','ended','cancelled','error']),occurredAt:z.iso.datetime()}).strict();
export const GraphExplanationRequestSchema=z.object({...envelope,contextId:hash,graphContext:GraphContextSchema,question:z.string().min(1).max(2000)}).strict()
  .refine(r=>r.caseId===r.graphContext.caseId,'Graph belongs to a different case');
export type VoiceLog=z.infer<typeof VoiceLogSchema>;
export type AgentReply=z.infer<typeof AgentReplySchema>;
export type VoicePlaybackEvent=z.infer<typeof VoicePlaybackEventSchema>;
export type GraphExplanationRequest=z.infer<typeof GraphExplanationRequestSchema>;
