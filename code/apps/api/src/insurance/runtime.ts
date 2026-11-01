import {VoiceIntegrationService} from '../voice/service.js';
import type {VoiceOptions} from '../voice/providers.js';
import { HumanHandoverService } from './human-handover.js';
import { fileURLToPath } from 'node:url';
import { EncryptedCaseStore,type CaseStore,type BootstrapCredentials } from './store.js';
import { SessionService } from './auth.js';
import { LifeInsuranceEngine } from './engine.js';
import { DemoJourneyService } from './journey.js';
import { DossierService } from './dossier.js';
import { CustomerConfirmations } from './customer-confirmations.js';
import { ExtractionWorkflow } from './extraction.js';
import { ModelExtractionConsents,type ModelExtractionOptions } from './model-extraction.js';
import { DraftEstimateService } from './estimates.js';
import { DemoJourney,type personaDraft } from './demo-journey.js';
import { SuitabilityService } from './suitability.js';
import { ProductDocuments } from './documents.js';
import { ScenarioComparisonService } from './comparison.js';
import { AdditionalCalculatorTools } from './tools.js';
import type { Database } from './types.js';
import { LiveLogismataProvider,ReplayProvider,type CalculationProvider } from '../logismata/client.js';

export const LIFE_RUNTIME=Symbol('LIFE_RUNTIME');
export type RuntimeOptions={personaDraft?:typeof personaDraft;store?:CaseStore;dataDirectory?:string;provider?:CalculationProvider;providerMode?:'live'|'replay'|'test';
  voice?:VoiceOptions;modelExtraction?:ModelExtractionOptions;token?:string;credentials?:BootstrapCredentials;documents?:ProductDocuments;
  internalTimers?:boolean;
  /** Opens POST /api/demo/start: a ready demo case without access code. Local demos only. */
  demoStart?:boolean};
const AUDIT_RETENTION_MS=86400_000;

/** Expired cases or sessions, or audit entries older than a day. */
export function hasExpired(db:Database,now:Date):boolean {
  const instant=now.toISOString();
  return Object.values(db.cases).some(c=>c.expiresAt<=instant)||Object.values(db.sessions).some(s=>s.expiresAt<=instant)||
    db.audit.some(a=>Date.parse(a.at)<=now.getTime()-AUDIT_RETENTION_MS);
}

/** Retention, once a minute: expired cases with their feedback, expired sessions, day-old audit entries. */
export function sweepExpired(db:Database,now:Date):void {
  const instant=now.toISOString();
  for(const [key,c] of Object.entries(db.cases))if(c.expiresAt<=instant)delete db.cases[key];
  for(const [key,s] of Object.entries(db.sessions))if(s.expiresAt<=instant)delete db.sessions[key];
  db.feedback=db.feedback.filter(f=>Object.hasOwn(db.cases,f.caseId));
  db.audit=db.audit.filter(a=>Date.parse(a.at)>now.getTime()-AUDIT_RETENTION_MS);
}

export async function createLifeRuntime(options:RuntimeOptions={}) {
  const mode=options.providerMode??'live';
  if(!options.provider&&mode==='live'&&!options.token)throw new Error('LOGISMATA_BEARER_TOKEN is required for live mode');
  const store=options.store??await EncryptedCaseStore.open(options.dataDirectory??fileURLToPath(new URL('../../../../.local/lifemap/',import.meta.url)));
  try {
    const credentials=options.credentials??await store.credentials();
    const sessions=new SessionService(store,credentials);
    const provider=options.provider??(mode==='live'?new LiveLogismataProvider({token:options.token!}):await ReplayProvider.load());
    const engine=new LifeInsuranceEngine(store,sessions,provider,mode);
    const documents=options.documents??await ProductDocuments.load();
    const journey=new DemoJourneyService(engine,documents),dossier=new DossierService(engine,journey),extraction=new ExtractionWorkflow(engine);
    const confirmations=new CustomerConfirmations(engine,extraction),modelExtraction=new ModelExtractionConsents(engine,options.modelExtraction);
    const voice=new VoiceIntegrationService(engine,extraction,options.voice);await voice.initialize();
    let closed=false;
    const sweepRetention=async()=>{
      if(closed)return;const now=new Date();
      if(store.view(db=>hasExpired(db,now)))await store.transaction(db=>sweepExpired(db,now));
    };
    const sweepVoice=()=>voice.sweep();
    const voiceCleanup=options.internalTimers===false?undefined:setInterval(()=>{void sweepVoice().catch(()=>{});},5000);voiceCleanup?.unref();
    const cleanup=options.internalTimers===false?undefined:setInterval(()=>{void sweepRetention().catch(()=>{});},60_000);cleanup?.unref();
    const estimates=new DraftEstimateService(engine);
    return {sweepRetention,sweepVoice,store,sessions,engine,documents,journey,dossier,extraction,modelExtraction,confirmations,voice,handover:new HumanHandoverService(engine,()=>voice.sweep()),estimates,suitability:new SuitabilityService(engine),demo:new DemoJourney(engine,estimates,extraction,options.demoStart?{sessions,credentials}:null,journey,options.personaDraft),
      comparisons:new ScenarioComparisonService(engine),tools:new AdditionalCalculatorTools(engine),providerMode:mode,get closed(){return closed;},async close(){if(!closed){closed=true;clearInterval(cleanup);clearInterval(voiceCleanup);engine.digitalTasks.close();await voice.shutdown();await store.close();}}};
  }catch(error){await store.close();throw error;}
}
export type LifeRuntime=Awaited<ReturnType<typeof createLifeRuntime>>;

/** No periodic wakeups after the last expiring record is removed. */
export function nextCleanupAt(db:Database,now=Date.now()):number|null {
  const deadlines=[
    ...Object.values(db.cases).map(c=>Date.parse(c.expiresAt)),
    ...Object.values(db.sessions).map(s=>Date.parse(s.expiresAt)),
    ...db.audit.map(a=>Date.parse(a.at)+AUDIT_RETENTION_MS),
  ];
  if(Object.values(db.cases).some(c=>c.voiceSessions.some(s=>s.status==='active'||s.status==='starting')))deadlines.push(now+5000);
  let next=Infinity;for(const deadline of deadlines)if(Number.isFinite(deadline))next=Math.min(next,deadline);
  return next===Infinity?null:Math.max(now+1,next);
}
