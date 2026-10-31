import { z } from 'zod';
import { Id } from './financial.js';
import { DraftSchema,LocaleSchema } from './insurance.js';
import { ProposalChangeInputSchema } from './proposal-workflow.js';
import { VoiceLogSchema } from './conversation.js';
const revision=z.number().int().positive();
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const ConfirmationTargetSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('accept_batch'),batchId:Id}).strict(),
  z.object({kind:z.literal('confirm_profile')}).strict(),
]);
export const CreateConfirmationInputSchema=z.object({expectedCaseRevision:revision,target:ConfirmationTargetSchema,
  channel:z.enum(['voice','screen']),questionTurnId:Id,questionReplyId:Id}).strict();
export const CustomerConfirmationSchema=z.object({schemaVersion:z.literal('1.0'),id:Id,caseId:Id,target:ConfirmationTargetSchema,
  channel:z.enum(['voice','screen']),basisCaseRevision:revision,basisProfileVersion:revision.nullable(),basisDraftHash:hash,targetHash:hash,
  locale:LocaleSchema,questionId:Id,questionTurnId:Id,questionReplyId:Id,questionHash:hash,questionText:z.string().min(1).max(16000),
  review:z.object({draft:DraftSchema,changes:z.array(ProposalChangeInputSchema).max(50),noticeVersion:z.literal('lifemap-synthetic-v1'),
    allowSyntheticCalculatorTransfer:z.boolean(),confirmProfileAndAssumptions:z.boolean()}).strict(),
  createdAt:z.iso.datetime(),expiresAt:z.iso.datetime(),status:z.enum(['awaiting_presentation','awaiting_answer','consumed','cancelled','invalidated']),
  presentedAt:z.iso.datetime().nullable(),playbackId:Id.nullable(),answerMessageId:Id.nullable(),answeredAt:z.iso.datetime().nullable(),
  invalidationReason:z.enum(['case_changed','expired','new_question','cancelled_by_customer']).nullable(),
}).strict().superRefine((r,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:'custom',message});
  if(r.review.draft.financial&&r.review.draft.financial.caseId!==r.caseId)fail('Review belongs to a different case');
  const profile=r.target.kind==='confirm_profile';
  if(r.review.confirmProfileAndAssumptions!==profile||r.review.allowSyntheticCalculatorTransfer!==profile)fail('Consent scope differs from target');
  if(profile?r.review.changes.length>0:r.review.changes.length===0)fail('Review changes differ from target');
  if(['awaiting_answer','consumed'].includes(r.status)&&(!r.presentedAt||r.channel==='voice'&&!r.playbackId))fail('Question has not been completely presented');
  if(r.status==='consumed'&&(!r.answerMessageId||!r.answeredAt))fail('Consumed question lacks answer reference');
  if(r.status==='awaiting_presentation'&&(r.presentedAt!==null||r.playbackId!==null))fail('Unpresented question contains playback acknowledgement');
});
const binding={questionId:Id,questionHash:hash,questionTurnId:Id,questionReplyId:Id};
export const PresentConfirmationInputSchema=z.object({...binding,expectedCaseRevision:revision,reviewDisplayed:z.literal(true),
  profileAndAssumptionsDisplayed:z.boolean(),privacyNoticeDisplayed:z.boolean(),
  playback:z.object({playbackId:Id,event:z.literal('ended')}).strict().optional()}).strict();
export const AnswerConfirmationInputSchema=z.discriminatedUnion('channel',[
  z.object({...binding,channel:z.literal('voice'),expectedCaseRevision:revision,voiceLog:VoiceLogSchema}).strict(),
  z.object({...binding,channel:z.literal('screen'),expectedCaseRevision:revision,decision:z.enum(['accept','reject']),answerMessageId:Id}).strict(),
]);
export const CancelConfirmationInputSchema=z.object({expectedCaseRevision:revision,reason:z.enum(['new_question','cancelled_by_customer'])}).strict();
export const CurrentCustomerConfirmationSchema=z.object({confirmation:CustomerConfirmationSchema.nullable()}).strict();
export const ConfirmationOutcomeSchema=z.object({confirmation:CustomerConfirmationSchema,caseRevision:revision,contextRevision:revision,
  profileVersion:revision.nullable(),accepted:z.boolean(),confirmationStillRequired:z.boolean()}).strict();
export type CustomerConfirmation=z.infer<typeof CustomerConfirmationSchema>;
export type ConfirmationTarget=z.infer<typeof ConfirmationTargetSchema>;
