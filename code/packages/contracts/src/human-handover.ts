import { z } from 'zod';
import { Id,DateOnly } from './financial.js';
export const DEFAULT_HUMAN_HANDOVER={status:'digital' as const,revision:0,wantsHumanAdvisor:false,leaveViewRequested:false,stopDigitalConversation:false,
  requestId:null,requestedAt:null,resumedAt:null,source:null};
export const HumanHandoverSchema=z.object({status:z.enum(['digital','requested']),revision:z.number().int().nonnegative(),wantsHumanAdvisor:z.boolean(),
  leaveViewRequested:z.boolean(),stopDigitalConversation:z.boolean(),requestId:Id.nullable(),requestedAt:z.iso.datetime().nullable(),
  resumedAt:z.iso.datetime().nullable(),source:z.enum(['ui','voice']).nullable()}).strict().superRefine((h,ctx)=>{
  const active=h.status==='requested';
  if([h.wantsHumanAdvisor,h.leaveViewRequested,h.stopDigitalConversation].some(flag=>flag!==active))ctx.addIssue({code:'custom',message:'Handover flags differ from status'});
  if(active&&(!h.requestId||!h.requestedAt||!h.source||h.resumedAt!==null))ctx.addIssue({code:'custom',message:'Requested handover lacks provenance'});
  if(h.revision===0&&(active||h.requestId!==null||h.requestedAt!==null||h.resumedAt!==null||h.source!==null))ctx.addIssue({code:'custom',message:'Invalid initial handover'});
});
export const HumanAdvisorContactSchema=z.object({organization:z.literal('Pax'),kind:z.literal('public_general_contact'),phone:z.string().regex(/^\+[1-9]\d{7,14}$/),
  displayPhone:z.string().max(40),sourceUrl:z.url(),verifiedAt:DateOnly,automaticDialing:z.literal(false),advisorAssigned:z.literal(false)}).strict();
export const PAX_HUMAN_ADVISOR_CONTACT=HumanAdvisorContactSchema.parse({organization:'Pax',kind:'public_general_contact',phone:'+41612776666',
  displayPhone:'+41 61 277 66 66',sourceUrl:'https://www.pax.ch/de/kontakt-und-services',verifiedAt:'2026-10-31',automaticDialing:false,advisorAssigned:false});
export const HumanHandoverCommandSchema=z.object({action:z.enum(['request','resume']),messageId:Id,expectedCaseRevision:z.number().int().positive(),source:z.enum(['ui','voice']).default('ui')}).strict();
export const HumanHandoverViewSchema=z.object({caseId:Id,caseRevision:z.number().int().positive(),contextRevision:z.number().int().positive(),
  handover:HumanHandoverSchema,contact:HumanAdvisorContactSchema}).strict();
export const HumanHandoverCommandResponseSchema=HumanHandoverViewSchema.extend({command:z.object({messageId:Id,action:z.enum(['request','resume']),replayed:z.boolean(),changed:z.boolean()}).strict()}).strict();
export type HumanHandover=z.infer<typeof HumanHandoverSchema>;
export type HumanHandoverView=z.infer<typeof HumanHandoverViewSchema>;
