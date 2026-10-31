import { z } from 'zod';
import { CreateInsuranceCaseSchema,DraftPatchSchema,ConfirmProfileSchema,RunAnalysisSchema,ReviewDecisionSchema,
  JourneyActionSchema,DemoApplicationDecisionSchema,GraphContextSchema,LifeAnalysisSchema,GoalSchema } from '@pax/contracts';
import { EstimateRequestSchema } from './estimates.js';

const endpoints:[string,string,string,z.ZodType|undefined][]=[
  ['get','/api/privacy','Read processing notice',undefined],['get','/api/status','Read runtime capabilities',undefined],
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
  ['post','/api/cases/{caseId}/advisor/proposals','Agent proposes a whitelisted draft change',z.object({messageId:z.string().max(80),path:z.string().max(200),value:z.union([z.number().finite(),z.boolean(),z.null(),GoalSchema,z.string().max(80)]),expectedProfileVersion:z.number().int().positive().nullable()})],
  ['post','/api/cases/{caseId}/advisor/proposals/{proposalId}/accept','Customer accepts a proposal; profile confirmation is still separate',z.object({expectedCaseRevision:z.number().int().positive(),accept:z.literal(true)})],
  ['get','/api/cases/{caseId}/advisor/events','Subscribe to versioned SSE context events',undefined],
  ['patch','/api/cases/{caseId}/preferences','Change conversation duration without recalculation; locale is chosen at case creation',z.object({timeBudgetMinutes:z.number().int().min(3).max(120)})],
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
  const lifeAnalysis=reference('LifeAnalysis',LifeAnalysisSchema);
  for(const [method,path,summary,schema] of endpoints) {
    const publicRoute=['/api/privacy','/api/status','/api/sessions','/api/openapi.json'].includes(path);
    const parameters=[...path.matchAll(/\{(\w+)\}/g)].map(m=>({in:'path',name:m[1],required:true,schema:{type:'string'}}));
    const operation={summary,security:publicRoute?[]:[{bearerAuth:[]},{cookieAuth:[]}],parameters,
      ...(schema?{requestBody:{required:true,content:{'application/json':{schema:reference(`${method}_${path.replace(/[^a-zA-Z0-9]/g,'_')}`,schema)}}}}:{}),
      responses:{[method==='post'?'201':'200']:{description:'Success',...(path.endsWith('/calculations')?{content:{'application/json':{schema:{type:'object',properties:{run:lifeAnalysis},required:['run']}}}}:{})},400:{description:'Invalid input'},401:{description:'Session required'},403:{description:'Role/CSRF forbidden'},404:{description:'Not found or unauthorized case'},409:{description:'Version, review or journey conflict'},422:{description:'Missing/unsupported domain data'}}};
    paths[path]??={};paths[path][method]=operation;
  }
  return {openapi:'3.1.0',info:{title:'Pax LifeMap life-insurance backend',version:'0.2.0',description:'Synthetic-data PoC with real calculators and explicitly non-binding contract artifacts. Runtime Zod/domain validation adds invariants beyond JSON Schema. Cookie authentication requires X-CSRF-Token for writes. Reviewer approval/start-review/decisions/policy issuance require a separately authenticated reviewer. An agent is restricted to its granted case and context/events/proposals.'},
    servers:[{url:'http://127.0.0.1:3000'}],components:{schemas,securitySchemes:{bearerAuth:{type:'http',scheme:'bearer'},cookieAuth:{type:'apiKey',in:'cookie',name:'pax_session'}}},paths};
}
