import {
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
