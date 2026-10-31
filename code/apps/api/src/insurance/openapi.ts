import { z } from 'zod';
import { CreateVoiceSessionSchema,VoiceSessionStartResponseSchema,VoiceSessionSchema,VoiceTranscriptSchema,VoiceTurnInputSchema,VoiceExtractionInputSchema,VoiceExtractionResponseSchema,CloseVoiceSessionSchema,
  CreateInsuranceCaseSchema,DraftPatchSchema,ConfirmProfileSchema,RunAnalysisSchema,ReviewDecisionSchema,
  JourneyActionSchema,DemoApplicationDecisionSchema,GraphContextSchema,LifeAnalysisResponseSchema,
  InsuranceCaseDtoSchema,AdvisorContextSchema,QuestionsResponseSchema,AdvisorContextUpdatedSchema,
  RecommendationPresentationSchema,CasePreferencesSchema,AdvisorProposalInputSchema,AcceptProposalInputSchema,
  ExtractorContextSchema,ProposalBatchInputSchema,ProposalBatchSchema,ProposalAcceptanceSchema,ResolveAmbiguityInputSchema,AmbiguityResolutionSchema,
  CreateConfirmationInputSchema,CustomerConfirmationSchema,PresentConfirmationInputSchema,AnswerConfirmationInputSchema,CancelConfirmationInputSchema,ConfirmationOutcomeSchema,CurrentCustomerConfirmationSchema,
  HumanHandoverCommandSchema,HumanHandoverViewSchema,HumanHandoverCommandResponseSchema,
  SessionResponseSchema,AgentAccessResponseSchema,ApiErrorSchema,SummaryBundleSchema,PortalDtoSchema } from '@pax/contracts';
import { EstimateRequestSchema } from './estimates.js';
import { AdditionalToolRequestSchema } from './tools.js';

const endpoints:[string,string,string,z.ZodType|undefined][]=[
  ['get','/api/voice/providers','Read configured voice availability; no provider call',undefined],
  ['get','/api/voice/privacy','Read separate synthetic voice processing notice in DE/FR/IT/EN',undefined],
  ['get','/api/voice/portfolio','Read explicit handling of all 37 voice intake fields',undefined],
  ['get','/api/cases/{caseId}/voice/sessions','Read own case voice session metadata',undefined],
  ['post','/api/cases/{caseId}/voice/sessions','Customer opens consented voice session; short-lived connection replay only',CreateVoiceSessionSchema],
  ['get','/api/cases/{caseId}/voice/sessions/{voiceSessionId}/transcript','Read encrypted finalized transcript; scoped agent or owner only',undefined],
  ['post','/api/cases/{caseId}/voice/sessions/{voiceSessionId}/turns','Customer client records a finalized customer/agent turn; never confirms facts',VoiceTurnInputSchema],
  ['post','/api/cases/{caseId}/voice/sessions/{voiceSessionId}/extraction','Scoped agent maps sourced observations into one atomic proposal batch or explicit follow-ups',VoiceExtractionInputSchema],
  ['post','/api/cases/{caseId}/voice/sessions/{voiceSessionId}/close','Customer closes voice only; human handover remains a separate command',CloseVoiceSessionSchema],
  ['get','/api/privacy','Read processing notice',undefined],['get','/api/status','Read runtime capabilities',undefined],
  ['get','/api/translations','Read complete DE/FR/IT/EN customer presentation catalog; locale query or Accept-Language',undefined],
  ['get','/api/openapi.json','Read API specification',undefined],
  ['post','/api/sessions','Open a customer or reviewer session',z.object({accessCode:z.string().min(1).max(200)})],
  ['delete','/api/sessions/current','Revoke current session and close its event streams',undefined],
  ['get','/api/cases','List authorized cases',undefined],['post','/api/cases','Create synthetic life-insurance case',CreateInsuranceCaseSchema],
  ['get','/api/cases/{caseId}','Read own case',undefined],['patch','/api/cases/{caseId}/draft','Update unconfirmed draft',DraftPatchSchema],
  ['post','/api/cases/{caseId}/confirmations','Confirm profile and calculator transfer',ConfirmProfileSchema],
  ['get','/api/cases/{caseId}/questions','Get mandatory needs-first follow-ups',undefined],
  ['post','/api/cases/{caseId}/calculations','Run real life-insurance calculations and scenarios',RunAnalysisSchema],
  ['post','/api/cases/{caseId}/active-analysis','Select saved analysis without recomputing',z.object({runId:z.string().uuid()})],
  ['post','/api/cases/{caseId}/comparisons','Compare compatible stored runs without provider calls',z.object({baselineRunId:z.string().uuid(),variantRunId:z.string().uuid(),expectedProfileVersion:z.number().int().positive()})],
  ['get','/api/cases/{caseId}/comparisons/{comparisonId}','Read source-bound comparison and stale flag',undefined],
  ['post','/api/cases/{caseId}/locations','Search calculator location with explicit synthetic-transfer permission',z.object({search:z.string().min(2).max(60),allowSyntheticCalculatorTransfer:z.literal(true)})],
  ['post','/api/cases/{caseId}/calculator-estimates','Request explicit, uncommitted calculator estimates',EstimateRequestSchema],
  ['get','/api/cases/{caseId}/calculator-tools','List the eight additional opt-in calculators and monetary input fields',undefined],
  ['post','/api/cases/{caseId}/calculator-tools','Execute one isolated additional calculator; monetary request fields are integer CHF cents',AdditionalToolRequestSchema],
  ['post','/api/cases/{caseId}/recommendations','Derive needs-based product-family candidates',z.object({})],
  ['post','/api/cases/{caseId}/reviews','Request human review',z.object({})],
  ['post','/api/cases/{caseId}/review-decisions','Record reviewer-only advice decision',ReviewDecisionSchema],
  ['post','/api/cases/{caseId}/demo-quotes','Create explicitly selected demo configuration',JourneyActionSchema],
  ['post','/api/cases/{caseId}/demo-applications','Create demo application with document acknowledgements',JourneyActionSchema],
  ['post','/api/cases/{caseId}/demo-applications/submit','Idempotently submit demo application',JourneyActionSchema],
  ['post','/api/cases/{caseId}/demo-applications/start-review','Reviewer starts application review',JourneyActionSchema],
  ['post','/api/cases/{caseId}/demo-applications/decisions','Reviewer-only demo underwriting decision',DemoApplicationDecisionSchema],
  ['post','/api/cases/{caseId}/demo-policies','Issue non-binding demo artifact after acceptance',JourneyActionSchema],
  ['get','/api/cases/{caseId}/portal','Read persisted application and demo policy',undefined],
  ['get','/api/cases/{caseId}/summaries','Read customer/advisor projections of one snapshot',undefined],
  ['get','/api/cases/{caseId}/dossier','Export JSON or escaped print HTML',undefined],
  ['get','/api/cases/{caseId}/advisor/context','Read minimal current conversational context',undefined],
  ['post','/api/cases/{caseId}/agent-access','Create case-scoped 15-minute agent token; keep server-side',z.object({})],
  ['post','/api/cases/{caseId}/customer-confirmations','Customer requests a single-use, session-bound question for exactly one draft/profile action',CreateConfirmationInputSchema],
  ['get','/api/cases/{caseId}/customer-confirmations/current','Read most recent confirmation for this customer session',undefined],
  ['get','/api/cases/{caseId}/customer-confirmations/{confirmationId}','Read customer confirmation without private session binding',undefined],
  ['post','/api/cases/{caseId}/customer-confirmations/{confirmationId}/presented','Customer UI attests review display and completed voice playback',PresentConfirmationInputSchema],
  ['post','/api/cases/{caseId}/customer-confirmations/{confirmationId}/answer','Consume a final, bound voice/screen answer in the same transaction as its one authorized action',AnswerConfirmationInputSchema],
  ['post','/api/cases/{caseId}/customer-confirmations/{confirmationId}/cancel','Customer cancels an unanswered question, including on a new conversation question',CancelConfirmationInputSchema],
  ['get','/api/cases/{caseId}/handover','Read persisted human-advisor intent, stop flag and contact data; does not dial or book',undefined],
  ['post','/api/cases/{caseId}/handover','Customer requests human advice or explicitly resumes digital advice; revision guarded and idempotent',HumanHandoverCommandSchema],
  ['get','/api/cases/{caseId}/advisor/extractor-context','Read authorized current extraction state; no history, credentials or external-AI permission',undefined],
  ['post','/api/cases/{caseId}/advisor/proposal-batches','Propose a source-bound atomic change set and ambiguities; agent only',ProposalBatchInputSchema],
  ['post','/api/cases/{caseId}/advisor/proposal-batches/{batchId}/accept','Customer accepts all changes into draft; profile confirmation still required',AcceptProposalInputSchema],
  ['post','/api/cases/{caseId}/ambiguities/{ambiguityId}/resolve','Customer resolves an ambiguity without changing profile values',ResolveAmbiguityInputSchema],
  ['post','/api/cases/{caseId}/advisor/proposals','Agent proposes a whitelisted draft change',AdvisorProposalInputSchema],
  ['post','/api/cases/{caseId}/advisor/proposals/{proposalId}/accept','Customer accepts a proposal; profile confirmation is still separate',AcceptProposalInputSchema],
  ['get','/api/cases/{caseId}/advisor/events','Subscribe to versioned SSE context events',undefined],
  ['patch','/api/cases/{caseId}/preferences','Change locale and/or duration without invalidating financial runs; at least one field required',CasePreferencesSchema],
  ['post','/api/cases/{caseId}/graph-context','Select exact run/person/metric/period',GraphContextSchema],
  ['get','/api/cases/{caseId}/documents/{documentId}','Download authorized allowlisted Pax document',undefined],
  ['get','/api/cases/{caseId}/products','Read educational catalog; not a personal recommendation',undefined],
  ['get','/api/cases/{caseId}/audit','Read own authorized technical audit records',undefined],
  ['post','/api/cases/{caseId}/feedback','Submit one NPS score per reached stage',z.object({score:z.number().int().min(0).max(10),stage:z.enum(['advice','recommendation','portal'])})],
  ['get','/api/insights','Reviewer-only aggregate funnel signals and NPS',undefined],
  ['delete','/api/cases/{caseId}','Delete own demo case, linked feedback and agent sessions',undefined],
];
export function lifeOpenApi() {
  const paths:Record<string,Record<string,unknown>>={};
  const schemas:Record<string,unknown>={};
  const reference=(name:string,schema:z.ZodType)=>{
    const json=z.toJSONSchema(schema,{unrepresentable:'any'});const base=`#/components/schemas/${name}`;
    const rewrite=(value:unknown):void=>{if(!value||typeof value!=='object')return;
      if('$ref' in value&&typeof value.$ref==='string'&&value.$ref.startsWith('#'))value.$ref=base+value.$ref.slice(1);
      for(const child of Object.values(value))rewrite(child);};
    rewrite(json);schemas[name]=json;return {$ref:base};
  };
  const voiceStart=reference('VoiceSessionStart',VoiceSessionStartResponseSchema),voiceSession=reference('VoiceSession',VoiceSessionSchema),voiceTranscript=reference('VoiceTranscript',VoiceTranscriptSchema),voiceExtraction=reference('VoiceExtraction',VoiceExtractionResponseSchema);
  const caseDto=reference('InsuranceCaseDto',InsuranceCaseDtoSchema);
  const analysis=reference('LifeAnalysisResponse',LifeAnalysisResponseSchema),context=reference('AdvisorContext',AdvisorContextSchema);
  const extractor=reference('ExtractorContext',ExtractorContextSchema),batch=reference('ProposalBatch',ProposalBatchSchema),acceptance=reference('ProposalAcceptance',ProposalAcceptanceSchema),resolution=reference('AmbiguityResolution',AmbiguityResolutionSchema);
  const confirmation=reference('CustomerConfirmation',CustomerConfirmationSchema),currentConfirmation=reference('CurrentCustomerConfirmation',CurrentCustomerConfirmationSchema),outcome=reference('ConfirmationOutcome',ConfirmationOutcomeSchema);
  const handover=reference('HumanHandoverView',HumanHandoverViewSchema),handoverCommand=reference('HumanHandoverCommandResponse',HumanHandoverCommandResponseSchema);
  const questions=reference('QuestionsResponse',QuestionsResponseSchema),recommendation=reference('RecommendationPresentation',RecommendationPresentationSchema);
  const event=reference('AdvisorContextUpdated',AdvisorContextUpdatedSchema),error=reference('ApiError',ApiErrorSchema);
  const session=reference('SessionResponse',SessionResponseSchema),agentAccess=reference('AgentAccessResponse',AgentAccessResponseSchema);
  const summary=reference('SummaryBundle',SummaryBundleSchema),portal=reference('PortalDto',PortalDtoSchema);
  for(const [method,path,summary,schema] of endpoints) {
    const publicRoute=path.startsWith('/api/voice/')||['/api/privacy','/api/status','/api/sessions','/api/openapi.json','/api/translations'].includes(path);
    const parameters=[...path.matchAll(/\{(\w+)\}/g)].map(m=>({in:'path',name:m[1],required:true,schema:{type:'string'}}));
    const languageParameters=['/api/translations','/api/privacy','/api/voice/privacy'].includes(path)?[{in:'query',name:'locale',required:false,schema:{type:'string',enum:['de','fr','it','en']}}]:[];
    const responseSchema=path.includes('/voice/sessions')?(path.endsWith('/transcript')?voiceTranscript:path.endsWith('/extraction')?voiceExtraction:path.endsWith('/close')?voiceSession:path.endsWith('/turns')?{type:'object',properties:{voiceSession,replayed:{type:'boolean'}},required:['voiceSession','replayed'],additionalProperties:false}:method==='post'?voiceStart:{type:'object',properties:{caseId:{type:'string'},sessions:{type:'array',items:voiceSession}},required:['caseId','sessions'],additionalProperties:false}):(path==='/api/cases'&&method==='post')||path==='/api/cases/{caseId}'&&method==='get'||path.endsWith('/draft')||path.endsWith('/confirmations')?caseDto:
      path.endsWith('/handover')?method==='post'?handoverCommand:handover:
      path.endsWith('/customer-confirmations/current')?currentConfirmation:path.endsWith('/answer')&&path.includes('/customer-confirmations/')?outcome:path.includes('/customer-confirmations')?confirmation:
      path.endsWith('/advisor/extractor-context')?extractor:path.endsWith('/advisor/proposal-batches')?batch:path.endsWith('/accept')?acceptance:path.endsWith('/resolve')?resolution:
      path.endsWith('/calculations')?analysis:path.endsWith('/advisor/context')?context:path.endsWith('/questions')?questions:
      path.endsWith('/recommendations')?recommendation:path.endsWith('/agent-access')?agentAccess:path==='/api/sessions'?session:
      path.endsWith('/summaries')?summary:path.endsWith('/portal')?portal:undefined;
    const errors=Object.fromEntries([[400,'Invalid input'],[401,'Session required'],[403,'Role/CSRF forbidden'],[404,'Not found or unauthorized case'],[409,'Version, review or journey conflict'],[422,'Missing/unsupported domain data']].map(([code,description])=>[code,{description,content:{'application/json':{schema:error}}}]));
    const operation={summary,security:publicRoute?[]:[{bearerAuth:[]},{cookieAuth:[]}],parameters:[...parameters,...languageParameters],
      ...(schema?{requestBody:{required:true,content:{'application/json':{schema:reference(`${method}_${path.replace(/[^a-zA-Z0-9]/g,'_')}`,schema)}}}}:{}),
      ...(path.endsWith('/advisor/events')?{'x-sse-event-name':'advisor.context.updated','x-sse-data-schema':event}:{}),
      responses:{[method==='post'?'201':'200']:{description:'Success',...(responseSchema?{content:{'application/json':{schema:responseSchema}}}:{})},...errors}};
    paths[path]??={};paths[path][method]=operation;
  }
  return {openapi:'3.1.0',info:{title:'Pax LifeMap life-insurance backend',version:'0.2.0',description:'Synthetic-data PoC with real calculators and explicitly non-binding contract artifacts. Runtime Zod/domain validation adds invariants beyond JSON Schema. Cookie authentication requires X-CSRF-Token for writes. Reviewer approval/start-review/decisions/policy issuance require a separately authenticated reviewer. An agent is restricted to its granted case and context/events/proposals.'},
    servers:[{url:'http://127.0.0.1:3000'}],components:{schemas,securitySchemes:{bearerAuth:{type:'http',scheme:'bearer'},cookieAuth:{type:'apiKey',in:'cookie',name:'pax_session'}}},paths};
}
