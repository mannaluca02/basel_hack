import type { InsuranceCaseState,CustomerConfirmation,ModelExtractionConsent,VoiceSession,StoredVoiceTurn,VoiceMappingIssue,VoiceObservation,SuitabilityCheck } from '@pax/contracts';
export type { SourceDecision,ProductCandidate,Recommendation,ReviewTask,DemoQuote,DemoApplication,DemoPolicy,
  CaseEvent,ScenarioComparison,AgentProposal,LifeRun,RiskNeed } from '@pax/contracts';

// Private storage/authorization fields extend the shared business state, never the HTTP DTO.
export type Actor = { id:string;role:'customer'|'reviewer'|'advisor';caseId?:string;sessionHash:string;expiresAt:string;csrfHash?:string };
export type AuditEvent = {id:string;at:string;actorId:string;action:string;caseId:string|null;profileVersion:number|null;outcome:string};
export type InsuranceCase = InsuranceCaseState & {
  ownerId:string;voiceSessions:StoredVoiceSession[];confirmationRequests:(CustomerConfirmation & {sessionHash:string})[];modelExtractionConsent:(ModelExtractionConsent & {acceptedBy:string})|null;
  /** Final turns of a separately running voice agent (Paxi), owner-readable only, never in the case DTO. */
  agentTurns:AgentVoiceTurn[];
  /** Suitability pre-checks of the customer; read through /suitability, never in the case DTO. */
  suitabilityChecks:SuitabilityCheck[];idempotency:Record<string,{fingerprint:string;result:unknown}>;
  /** Created by the live configuration's start: a full store replaces it first. Never in the DTO. */
  liveStart?:true;
};
export type Database = {
  version:1;sessions:Record<string,Actor>;cases:Record<string,InsuranceCase>;audit:AuditEvent[];
  feedback:{caseId:string;at:string;stage:string;score:number}[];
};
export const emptyDatabase = ():Database => ({version:1,sessions:{},cases:{},audit:[],feedback:[]});
export class WorkflowError extends Error {
  constructor(public readonly code:string,public readonly status=409,public readonly fields:string[]=[]){super(code);}
}

export type AgentVoiceTurn={messageId:string;conversationId:string;speaker:'customer'|'agent';text:string;at:string;receivedAt:string};
export type StoredVoiceSession=VoiceSession & {handoverRevision:number;sessionHash:string;messageId:string;requestHash:string;providerSessionId:string|null;
  turns:StoredVoiceTurn[];extractions:Record<string,{requestHash:string;proposalId:string|null;issues:VoiceMappingIssue[];mappingVersion:string;transcriptRevision:number;observations:VoiceObservation[]}>};
