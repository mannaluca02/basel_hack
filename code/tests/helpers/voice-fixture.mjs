import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PRIVACY_NOTICE} from '@pax/contracts';
import {createLifeRuntime} from '../../apps/api/dist/insurance/runtime.js';
import {lifeDraft,SyntheticTestProvider} from './life-fixture.mjs';
export const voiceCredentials={customerAccessCode:'synthetic-voice-customer-key-32-characters',reviewerAccessCode:'synthetic-voice-reviewer-key-32-characters'};
export class FakeVoiceGateway {
 id='gpt-live';opens=[];stops=[];
 async open(input,signal){this.opens.push({input,signal});return {providerSessionId:`fake-provider-${this.opens.length}`,connection:{provider:'gpt-live',session:{id:`fake-provider-${this.opens.length}`},transport:{type:'webrtc',sdp:'v=fake-provider-answer'}}};}
 async stop(id){this.stops.push(id);return 'requested';}
}
export async function voiceFixture(options={}){
 const directory=await mkdtemp(join(tmpdir(),'pax-voice-integration-')),gateway=options.gateway??new FakeVoiceGateway();let r;
 const create=()=>createLifeRuntime({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials:voiceCredentials,voice:{enabled:options.enabled??true,gateways:[gateway],resumeAfterRestart:options.resumeAfterRestart}});
 try{
  r=await create();const login=await r.sessions.login(voiceCredentials.customerAccessCode,'voice-test'),customer=r.sessions.authenticate(login.sessionToken);
   let c=await r.engine.createCase(customer,{locale:options.locale??'de',timeBudgetMinutes:10,noticeVersion:PRIVACY_NOTICE.version,dataClassification:'synthetic'});
  c=await r.engine.patchDraft(customer,c.id,{...(await lifeDraft()),expectedCaseRevision:c.caseRevision});
   c=await r.engine.confirm(customer,c.id,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:PRIVACY_NOTICE.version});
  const agentLogin=await r.sessions.agentToken(customer,c.id),agent=r.sessions.authenticate(agentLogin.sessionToken),get=()=>r.engine.caseFor(customer,c.id);let sequence=0;
  return {get r(){return r;},directory,gateway,customer,agent,login,agentLogin,id:c.id,get,
   start:(extra={})=>r.voice.start(customer,c.id,{messageId:`start_${++sequence}`,expectedCaseRevision:get().caseRevision,provider:'gpt-live',locale:get().locale,dataClassification:'synthetic',noticeVersion:'voice-synthetic-v1',allowExternalVoiceProcessing:true,sdp:'v=fake-client-offer',...extra}),
   turn:(sid,text,extra={})=>r.voice.ingest(customer,c.id,sid,{speaker:'customer',log:{schemaVersion:'1.0',messageId:`message_${++sequence}`,caseId:c.id,correlationId:`correlation_${sequence}`,turnId:`turn_${sequence}`,source:'voice',locale:get().locale,text,transcriptStatus:'final',dataClassification:'synthetic',...extra}}),
   extract:(sid,observations,extra={})=>{const x=r.extraction.context(agent,c.id),v=r.voice.transcript(agent,c.id,sid);return r.voice.propose(agent,c.id,sid,{messageId:`extract_${++sequence}`,expectedCaseRevision:x.caseRevision,expectedProfileVersion:x.profileVersion,basisDraftHash:x.draftHash,transcriptRevision:v.voiceSession.transcriptRevision,observations,...extra});},
   async close(){await r.close();await rm(directory,{recursive:true,force:true});}
  };
 }catch(error){await r?.close();await rm(directory,{recursive:true,force:true});throw error;}
}
export const incomeObservation=(sourceMessageId,extra={})=>Object.fromEntries(Object.entries({fieldId:'annual_gross_income_chf',personId:'person_demo_1',sourceMessageId,quote:'119000',value:119000,precision:'exact',unit:'CHF',period:'year',basis:'gross',...extra}).filter(([,value])=>value!==undefined));
