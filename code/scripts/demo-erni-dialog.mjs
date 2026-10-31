import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PRIVACY_NOTICE} from '@pax/contracts';
import {createLifeInsuranceApp} from '../apps/api/dist/insurance/app.js';
import {WorkflowError} from '../apps/api/dist/insurance/types.js';
import {DEMO_TURNS,ErniDialogModule,ErniDialogService} from '../apps/api/dist/erni-dialog/module.js';
import {PROCESSING_NOTICE,openAiResponsesTransport} from '../apps/api/dist/erni-dialog/responses.js';
import {lifeDraft,SyntheticTestProvider} from '../tests/helpers/life-fixture.mjs';

async function main(){
 const live=process.argv.includes('--openai');
 if(process.argv.slice(2).some(arg=>arg!=='--openai'))throw new Error('Unknown demo argument');
 if(live&&!process.env.OPENAI_API_KEY?.trim())throw new WorkflowError('MODEL_KEY_REQUIRED',503);
 const expected={path:'insurance.persons.0.grossAnnualIncomeCents',personId:'person_demo_1',value:11900000};
 const modelTransport=live?openAiResponsesTransport(process.env.OPENAI_API_KEY):async()=>({status:'completed',output:[{
  type:'function_call',name:'submit_intake_proposals',arguments:JSON.stringify({changes:[expected],ambiguities:[]}),
 }]});
 const directory=await mkdtemp(join(tmpdir(),'pax-erni-demo-'));
 const provider=new SyntheticTestProvider();
 const credentials={customerAccessCode:'synthetic-erni-demo-customer-key-32-chars',reviewerAccessCode:'synthetic-erni-demo-reviewer-key-32-chars'};
 let app,runtime,requests=0,model;
 try{
  ({app,runtime}=await createLifeInsuranceApp({dataDirectory:directory,provider,providerMode:'test',credentials},[
   ErniDialogModule.register({transport:async(request,signal)=>{requests++;model=request.model;return modelTransport(request,signal);}}),
  ]));
  await app.init();
  const customer=runtime.sessions.authenticate((await runtime.sessions.login(credentials.customerAccessCode,'erni-demo')).sessionToken);
  let c=await runtime.engine.createCase(customer,{locale:'de',timeBudgetMinutes:10,noticeVersion:PRIVACY_NOTICE.version,dataClassification:'synthetic'});
  c=await runtime.engine.patchDraft(customer,c.id,{...(await lifeDraft()),expectedCaseRevision:c.caseRevision});
  await runtime.engine.confirm(customer,c.id,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:PRIVACY_NOTICE.version});
  const actor=runtime.sessions.authenticate((await runtime.sessions.agentToken(customer,c.id)).sessionToken);
  const before=structuredClone(runtime.engine.caseFor(customer,c.id)),demo=DEMO_TURNS['annual-gross'];
  const input={demoTurnId:'annual-gross',processingNoticeVersion:PROCESSING_NOTICE.version,
   voiceLog:{schemaVersion:'1.0',messageId:'synthetic_erni_demo',caseId:c.id,correlationId:'synthetic_erni_demo',turnId:'synthetic_erni_turn',
    source:'text',locale:'de',text:demo.text,transcriptStatus:'final',dataClassification:'synthetic'},conversation:demo.conversation};
  if(live)console.log(JSON.stringify({processingNotice:PROCESSING_NOTICE,calculatorTransfer:false}));
  const dialog=app.get(ErniDialogService),result=await dialog.turn(actor,c.id,input);
  assert.ok(result.batch,'Expected one unconfirmed proposal batch');
  assert.deepEqual(result.batch.changes,[expected]);assert.deepEqual(result.batch.ambiguityIds,[]);assert.equal(result.batch.status,'proposed');
  const after=runtime.engine.caseFor(customer,c.id);
  assert.equal(after.proposalBatches.length,1);assert.deepEqual(after.draft,before.draft);assert.deepEqual(after.confirmedVersions,before.confirmedVersions);
  assert.deepEqual(await dialog.turn(actor,c.id,input),result);assert.equal(requests,1);
  assert.equal(provider.calls.length,0);
  console.log(JSON.stringify({passed:true,dataClassification:'synthetic',modelTransport:live?'openai':'simulated',model,openAiCalled:live,modelRequests:requests,
   proposalStatus:result.batch.status,changes:result.batch.changes,budgetNetUnchanged:true,draftUnchanged:true,confirmedProfileUnchanged:true,
   duplicateReused:true,calculatorCalled:false,voiceTested:false},null,2));
 }finally{
  try{if(app)await app.close();else await runtime?.close();}finally{await rm(directory,{recursive:true,force:true});}
 }
}
await main().catch(error=>{console.error(error instanceof WorkflowError?error.code:'ERNI_DEMO_FAILED');process.exitCode=1;});
