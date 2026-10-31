import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLifeRuntime} from '../apps/api/dist/insurance/runtime.js';
import {AdvisorContextUpdatedSchema} from '@pax/contracts';
import {SyntheticTestProvider} from '../tests/helpers/life-fixture.mjs';
const directory=await mkdtemp(join(tmpdir(),'pax-handover-demo-')),provider=new SyntheticTestProvider();
const credentials={customerAccessCode:'synthetic-handover-customer-key-32',reviewerAccessCode:'synthetic-handover-reviewer-key-32'};
let r;
try{
 r=await createLifeRuntime({dataDirectory:directory,provider,providerMode:'test',credentials});
 const customer=r.sessions.authenticate((await r.sessions.login(credentials.customerAccessCode,'local-handover')).sessionToken);
 const c=await r.engine.createCase(customer,{locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v1',dataClassification:'synthetic'});
 const agent=r.sessions.authenticate((await r.sessions.agentToken(customer,c.id)).sessionToken);
 const input={action:'request',messageId:'human_advisor_requested',expectedCaseRevision:c.caseRevision,source:'ui'};
 const requested=await r.handover.command(customer,c.id,input),context=r.engine.advisorContext(agent,c.id),extractor=r.extraction.context(agent,c.id);
 const state=r.engine.caseFor(customer,c.id),event=state.events.at(-1);
 const update=AdvisorContextUpdatedSchema.parse({schemaVersion:'1.0',messageId:event.id,caseId:c.id,correlationId:event.id,eventId:event.id,contextRevision:state.contextRevision,reason:event.reason,
  contextRef:`/api/cases/${c.id}/advisor/context`,handover:state.handover,interruptPolicy:'immediate'});
 const replay=await r.handover.command(customer,c.id,input);
 const resumed=await r.handover.command(customer,c.id,{action:'resume',messageId:'digital_advice_explicitly_resumed',expectedCaseRevision:replay.caseRevision,source:'ui'});
 const report={passed:requested.handover.wantsHumanAdvisor&&context.handover.stopDigitalConversation&&extractor.handover.leaveViewRequested&&!resumed.handover.wantsHumanAdvisor,
  syntheticOnly:true,phone:requested.contact.phone,contactKind:requested.contact.kind,automaticDialing:false,callPlaced:false,advisorAssigned:false,
  requestEvent:update.reason,interruptPolicy:update.interruptPolicy,questionsWhilePaused:context.nextQuestion,maySpeakAmountsWhilePaused:context.maySpeakAmounts,
  idempotentReplay:replay.command.replayed,explicitResume:resumed.command.action==='resume',calculatorCalls:provider.calls.length,openAiCalled:false};
 if(process.argv.includes('--export')){
  const output=new URL('../fixtures/human-handover/',import.meta.url);await mkdir(output,{recursive:true});
  for(const [name,value] of Object.entries({'handover-request':input,'handover-response':requested,'advisor-context':context,'extractor-context':extractor,'context-updated':update,'handover-resumed':resumed,'report':report})){
   const text=JSON.stringify(value,null,2)+'\n';if(/"(?:ownerId|idempotency|confirmationRequests|sessionToken|csrfToken|sessionHash)"/.test(text))throw new Error('Private field in fixture');await writeFile(new URL(`${name}.v1.json`,output),text);
  }
 }
 console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
}finally{await r?.close();await rm(directory,{recursive:true,force:true});}
