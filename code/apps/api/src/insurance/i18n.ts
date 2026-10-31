import type { InsuranceCase,LifeRun,Recommendation } from './types.js';
import { Messages,Locales,t,type Locale,type MessageKey,intlLocale } from './messages.js';
import { InsuranceCaseDtoSchema,CASE_DTO_VERSION,type InsuranceCaseDto } from '@pax/contracts';

export { t,languageNumber,intlLocale,type Locale } from './messages.js';
export const localeOf=(value:unknown):Locale=>{
  if(typeof value!=='string')return 'de';
  for(const item of value.split(',')){const base=item.trim().split(';')[0]!.split('-')[0]!.toLowerCase();if(Locales.includes(base as Locale))return base as Locale;}
  return 'de';
};
const translated=(locale:Locale,key:string,fallback:MessageKey)=>t(locale,Object.hasOwn(Messages,key)?key as MessageKey:fallback);
export const catalog=(locale:Locale)=>({locale,fallbackUsed:false,messages:Object.fromEntries(Object.entries(Messages).map(([key,values])=>[key,values[locale]])),
  legalDocuments:{sourceLanguage:'de',automaticallyTranslated:false,message:t(locale,'common.documents')}});
export const questionText=(locale:Locale,path:string)=>{
  let field=path.split('.').at(-1)!;
  if(path.startsWith('insurance.children_for_goal'))field='children';
  else if(path.includes('.pillar2Risk.'))field='pillar2Risk';
  return translated(locale,`question.${field}`,'common.question');
};
export const statusText=(locale:Locale,status:string)=>translated(locale,`status.${status}`,'common.review');
export const metricText=(locale:Locale,id:string)=>{
  if(id.startsWith('pillar_')){
    const pillar=translated(locale,`pillar.${id.split('_')[1]}`,'metric.pillar');
    const event=['disability_illness','disability_accident','death_illness','death_accident','retirement'].find(e=>id.startsWith(`pillar_${id.split('_')[1]}_${e}_`));
    return pillar+(event?' · '+translated(locale,event==='retirement'?'goal.retirement':`event.${event}`,'common.review'):'');
  }
  if(/^risk_\d+_gap$/.test(id))return t(locale,'metric.risk_gap');
  return translated(locale,`metric.${id}`,'common.figure');
};
export const reviewText=(locale:Locale,code:string)=>{
  const key=/INHERITANCE|TAX_REVIEW/.test(code)?'tax':/HOME|MORTGAGE|HOUSING/.test(code)?'home':
    /CAPITAL|ASSET|ALLOCATION/.test(code)?'capital':/SAVING|CONTRIBUTION/.test(code)?'saving':
    /PENSION|PILLAR/.test(code)?'pension':/INCOME|EXPENSE|BUDGET|BUFFER|TAX_BASIS/.test(code)?'income':
    /PROVIDER|RISK_SCENARIOS|RISK_NEED/.test(code)?'provider':null;
  return key?translated(locale,`review.${key}`,'common.review'):t(locale,'common.review');
};
/** What a real contract additionally needs; the demo shows these steps instead of skipping them. */
export const complianceSteps=(locale:Locale)=>(['identification','aml_check','health_declaration','signature'] as const).map(id=>({
  id,status:'required_in_real_integration' as const,label:t(locale,`compliance.${id}.label`),explanation:t(locale,`compliance.${id}.explanation`)}));
export const errorText=(locale:Locale,code:string)=>t(locale,
  code==='VOICE_PROVIDER_DISABLED'?'voice.error.disabled':code==='VOICE_SESSION_NOT_ACTIVE'?'voice.error.inactive':
  code==='VOICE_CONNECTION_NOT_REPLAYABLE'?'voice.error.connectionExpired':['VOICE_ALREADY_ACTIVE','VOICE_START_IN_PROGRESS'].includes(code)?'voice.error.alreadyActive':code==='VOICE_SOURCE_NOT_FOUND'?'voice.error.source':
  code==='MODEL_EXTRACTION_DISABLED'?'extraction.error.disabled':['MODEL_EXTRACTION_CONSENT_REQUIRED','MODEL_EXTRACTION_NOTICE_CHANGED'].includes(code)?'extraction.error.consent':
  code==='SUITABILITY_CHECK_REQUIRED'?'error.suitabilityRequired':code==='SUITABILITY_ADVISED_AGAINST'?'error.suitabilityAdvisedAgainst':
  code==='HUMAN_HANDOVER_ACTIVE'?'error.handoverActive':code==='DIGITAL_TASK_CANCELLED'?'error.digitalCancelled':
  code==='UNAUTHORIZED'?'error.unauthorized':/FORBIDDEN|CSRF|ORIGIN/.test(code)?'error.forbidden':
  /NOT_FOUND/.test(code)?'error.notFound':/STALE|VERSION_CONFLICT/.test(code)?'error.stale':
  /UNAVAILABLE|TIMEOUT|INTERNAL|BUSY|RATE_LIMIT/.test(code)?'error.unavailable':
  /REVIEW/.test(code)?'common.review':'error.invalid');
export const moneyText=(locale:Locale,value:number|null)=>value===null?t(locale,'common.unknown'):
  new Intl.NumberFormat(intlLocale[locale],{style:'currency',currency:'CHF'}).format(value/100);
export const productText=(locale:Locale,productId:string)=>translated(locale,`product.${productId}`,'common.figure');
export const presentRecommendation=(r:Recommendation,locale:Locale)=>({...r,locale,statusLabel:statusText(locale,r.status),
  candidates:r.candidates.map(c=>({...c,productName:productText(locale,c.productId),
    conditions:[t(locale,'common.noPremium'),t(locale,'common.condition')],
    explanation:translated(locale,`rule.${c.rule.ruleId}`,'common.review'),
    reasonDetails:c.rule.reasonCodes.map(code=>({code,text:reviewText(locale,code)}))})),
  alternatives:[t(locale,'common.noContract'),t(locale,'common.adjust')],
  disclaimer:t(locale,'common.disclaimer'),documentsLanguageNotice:t(locale,'common.documents')});
export const presentRun=(run:LifeRun,locale:Locale)=>({locale,
  statusLabel:statusText(locale,run.status),
  metrics:run.local.metrics.map(m=>({id:m.id,...(m.personId?{personId:m.personId}:{}),label:metricText(locale,m.id),
    valueCents:m.value,formatted:moneyText(locale,m.value),period:m.period,periodLabel:translated(locale,`period.${m.period}`,'common.period'),status:m.status,statusLabel:statusText(locale,m.status)})),
  assumptions:['synthetic','separate','snapshot','rounding',...(run.scenario.kind==='family'?['family']:[]),
    ...(run.scenario.kind==='home'?['home']:[]),...(run.timeline?['phases','pensions','allocations','existingSaving','release','predisplay']:[])].map(key=>translated(locale,`assumption.${key}`,'common.review')),
  reviewReasons:run.reviewReasons.map(code=>({code,text:reviewText(locale,code)})),
  issues:[...run.local.issues,...run.providerResults.flatMap(p=>p.issues),...(run.timeline?.issues??[])].map(i=>({code:i.code,path:i.path,message:reviewText(locale,i.code)})),
  legalDocumentsNotice:t(locale,'common.documents'),demoLabel:t(locale,'common.demo')});
export const progressText=(locale:Locale,groups:{id:string}[])=>groups.map(g=>({...g,label:g.id==='life_goals'?t(locale,'progress.goals'):
  g.id==='insurance_parameters'?t(locale,'progress.insurance'):g.id.startsWith('pillar_')?translated(locale,`pillar.${g.id.split('_')[1]}`,'metric.pillar'):translated(locale,`progress.${g.id}`,'progress.financial')}));
export function presentJourney<T>(data:T,locale:Locale):T&{locale:Locale;displayLabel:string;documentsLanguageNotice:string} {
  const walk=(value:unknown):unknown=>{
    if(Array.isArray(value))return value.map(walk);if(!value||typeof value!=='object')return value;
    const r=Object.fromEntries(Object.entries(value).map(([key,v])=>[key,walk(v)]));
    if(typeof r.productId==='string'){r.productName=productText(locale,r.productId);if(r.conditions)r.conditions=[t(locale,'common.noPremium'),t(locale,'common.condition')];}
    if(typeof r.status==='string')r.statusLabel=statusText(locale,r.status);
    if(r.coverageInForce===false||r.demo===true)r.displayLabel=t(locale,'common.demo');return r;
  };
  return {...walk(data) as T,locale,displayLabel:t(locale,'common.demo'),documentsLanguageNotice:t(locale,'common.documents')};
}
export const localizedCase=(c:InsuranceCase):InsuranceCaseDto=>{
  const {ownerId,idempotency,confirmationRequests,voiceSessions,agentTurns,suitabilityChecks,modelExtractionConsent,...business}=c;
  return InsuranceCaseDtoSchema.parse({...business,schemaVersion:CASE_DTO_VERSION,toolRuns:c.toolRuns??[],presentation:{locale:c.locale,
    activeRun:c.activeRunId?presentRun(c.runs.find(r=>r.id===c.activeRunId)!,c.locale):null,
    recommendations:c.recommendations.map(r=>presentRecommendation(r,c.locale)),
    portal:presentJourney({quotes:c.quotes,applications:c.applications,policies:c.policies},c.locale)}});
};
