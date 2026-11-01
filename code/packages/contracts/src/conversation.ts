import { z } from 'zod';
import { Id } from './financial.js';
import { LocaleSchema } from './insurance.js';

const envelope={schemaVersion:z.literal('1.0'),messageId:Id,caseId:Id,correlationId:Id,turnId:Id};
/** One final, synthetic transcript turn, as the voice sessions store it. */
export const VoiceLogSchema=z.object({...envelope,source:z.enum(['voice','text']),locale:LocaleSchema,text:z.string().min(1).max(8000),
  transcriptStatus:z.literal('final'),dataClassification:z.literal('synthetic'),expectedCaseRevision:z.number().int().positive().optional()}).strict();
export type VoiceLog=z.infer<typeof VoiceLogSchema>;
