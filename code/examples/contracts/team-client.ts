import {
  ExtractorContextSchema,ProposalBatchInputSchema,ProposalBatchSchema,type ExtractorContext,type ProposalBatchInput,type ProposalBatch,
  CustomerConfirmationSchema,AnswerConfirmationInputSchema,ConfirmationOutcomeSchema,type CustomerConfirmation,
  InsuranceCaseDtoSchema,AdvisorContextSchema,AdvisorContextUpdatedSchema,ApiErrorSchema,
  VoiceLogSchema,AgentReplySchema,VoicePlaybackEventSchema,
  type InsuranceCaseDto,type AdvisorContext,type AdvisorContextUpdated,
  type VoiceLog,type AgentReply,type VoicePlaybackEvent,type WholeLifeProgress,
} from '@pax/contracts';

/** Luca: same-origin Angular proxy, HttpOnly cookie, no API/provider credential in the bundle. */
export async function readCase(caseId:string):Promise<InsuranceCaseDto> {
  const response=await fetch(`/api/cases/${encodeURIComponent(caseId)}`,{credentials:'include'});
  const data:unknown=await response.json();if(!response.ok)throw ApiErrorSchema.parse(data);
  return InsuranceCaseDtoSchema.parse(data);
}

/** Earnie: server-side only. The short-lived agent grant is restricted to this case. */
export async function readAgentContext(baseUrl:string,caseId:string,agentToken:string):Promise<AdvisorContext> {
  const response=await fetch(`${baseUrl}/api/cases/${encodeURIComponent(caseId)}/advisor/context`,{headers:{Authorization:`Bearer ${agentToken}`}});
  const data:unknown=await response.json();if(!response.ok)throw ApiErrorSchema.parse(data);
  return AdvisorContextSchema.parse(data);
}

/** Reconnect/SSE: validate the reference, then reload context before constructing the next reply. */
export function parseContextEvent(data:string):AdvisorContextUpdated{return AdvisorContextUpdatedSchema.parse(JSON.parse(data));}
export function parseVoiceLog(input:unknown):VoiceLog{return VoiceLogSchema.parse(input);}
export function parseReply(input:unknown):AgentReply{return AgentReplySchema.parse(input);}
export function parsePlayback(input:unknown):VoicePlaybackEvent{return VoicePlaybackEventSchema.parse(input);}

/** Lukas renders server-calculated progress; audio state arrives through real playback callbacks. */
export function avatarInputs(context:AdvisorContext,playback:VoicePlaybackEvent|null):{progress:WholeLifeProgress;speaking:boolean}{
  return {progress:context.progress,speaking:playback?.event==='started'};
}

/** Earnie: extraction reads an explicit, authorized projection; the full case remains inaccessible to an agent. */
export async function readExtractorContext(baseUrl:string,caseId:string,agentToken:string):Promise<ExtractorContext>{
  const response=await fetch(`${baseUrl}/api/cases/${encodeURIComponent(caseId)}/advisor/extractor-context`,{headers:{Authorization:`Bearer ${agentToken}`}});
  const data:unknown=await response.json();if(!response.ok)throw ApiErrorSchema.parse(data);return ExtractorContextSchema.parse(data);
}
export async function submitProposalBatch(baseUrl:string,caseId:string,agentToken:string,input:ProposalBatchInput):Promise<ProposalBatch>{
  const body=ProposalBatchInputSchema.parse(input);
  const response=await fetch(`${baseUrl}/api/cases/${encodeURIComponent(caseId)}/advisor/proposal-batches`,{method:'POST',headers:{Authorization:`Bearer ${agentToken}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data:unknown=await response.json();if(!response.ok)throw ApiErrorSchema.parse(data);return ProposalBatchSchema.parse(data);
}

/** Dario/Luca: confirmation writes use the CUSTOMER browser session and CSRF, never the agent grant. */
export async function customerConfirmationCommand(path:string,csrfToken:string,input:unknown):Promise<unknown>{
  if(!/^\/api\/cases\/[A-Za-z0-9_-]+\/customer-confirmations(?:\/[A-Za-z0-9_-]+\/(?:presented|answer|cancel))?$/.test(path))throw new Error('Unexpected confirmation route');
  const response=await fetch(path,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:JSON.stringify(input)});
  const data:unknown=await response.json();if(!response.ok)throw ApiErrorSchema.parse(data);return data;
}

/** The caller has received the exact current question and waited for its presentation acknowledgement. */
export async function answerSpokenConfirmation(question:CustomerConfirmation,voiceLog:VoiceLog,csrfToken:string){
  const body=AnswerConfirmationInputSchema.parse({channel:'voice',expectedCaseRevision:question.basisCaseRevision,
    questionId:question.questionId,questionHash:question.questionHash,questionTurnId:question.questionTurnId,questionReplyId:question.questionReplyId,voiceLog});
  const data=await customerConfirmationCommand(`/api/cases/${encodeURIComponent(question.caseId)}/customer-confirmations/${encodeURIComponent(question.id)}/answer`,csrfToken,body);
  return ConfirmationOutcomeSchema.parse(data);
}
export function parseCustomerConfirmation(input:unknown):CustomerConfirmation{return CustomerConfirmationSchema.parse(input);}
