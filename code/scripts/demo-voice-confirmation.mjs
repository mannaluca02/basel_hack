import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLifeRuntime} from '../apps/api/dist/insurance/runtime.js';
import {lifeDraft,SyntheticTestProvider} from '../tests/helpers/life-fixture.mjs';
const directory=await mkdtemp(join(tmpdir(),'pax-voice-confirmation-'));
const credentials={customerAccessCode:'synthetic-voice-demo-customer-key-32',reviewerAccessCode:'synthetic-voice-demo-reviewer-key-32'};
let r;
try{
 r=await createLifeRuntime({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials});
 const customer=r.sessions.authenticate((await r.sessions.login(credentials.customerAccessCode,'voice-demo')).sessionToken);
 let c=await r.engine.createCase(customer,{locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v1',dataClassification:'synthetic'});
 c=await r.engine.patchDraft(customer,c.id,{...(await lifeDraft()),expectedCaseRevision:c.caseRevision});
 c=await r.engine.confirm(customer,c.id,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v1'});
 const originalNet=structuredClone(c.draft.financial.persons[0].income),agent=r.sessions.authenticate((await r.sessions.agentToken(customer,c.id)).sessionToken);
 const get=()=>r.engine.caseFor(customer,c.id),path='insurance.persons.0.grossAnnualIncomeCents';
 const propose=(messageId,changes,extra={})=>{const ctx=r.extraction.context(agent,c.id);return r.extraction.proposeBatch(agent,c.id,{messageId,source:{messageId,turnId:`turn_${messageId}`,sourceRef:`synthetic:${messageId}`},expectedCaseRevision:ctx.caseRevision,expectedProfileVersion:ctx.profileVersion,basisDraftHash:ctx.draftHash,changes,...extra});};
 await propose('annual_gross_question',[],{ambiguities:[{path,personId:'person_demo_1',question:'Wie hoch ist Ihr Bruttojahreseinkommen?',source:{messageId:'annual_gross_question',turnId:'turn_annual_gross_question',sourceRef:'synthetic:annual_gross'}}]});
 const ambiguityId=get().ambiguities[0].id;
 const batch=await propose('annual_gross_answer',[{path,personId:'person_demo_1',value:11900000}],{resolvesAmbiguityIds:[ambiguityId]});
 const context=r.engine.advisorContext(agent,c.id),extractor=r.extraction.context(agent,c.id);
 const create=(target,index)=>r.confirmations.create(customer,c.id,{expectedCaseRevision:get().caseRevision,target,channel:'voice',questionTurnId:`question_turn_${index}`,questionReplyId:`question_reply_${index}`});
 const binding=q=>({expectedCaseRevision:get().caseRevision,questionId:q.questionId,questionHash:q.questionHash,questionTurnId:q.questionTurnId,questionReplyId:q.questionReplyId});
 const present=q=>r.confirmations.presented(customer,c.id,q.id,{...binding(q),reviewDisplayed:true,profileAndAssumptionsDisplayed:q.target.kind==='confirm_profile',privacyNoticeDisplayed:q.target.kind==='confirm_profile',playback:{playbackId:`playback_${q.id}`,event:'ended'}});
 const answer=(q,index)=>({...binding(q),channel:'voice',voiceLog:{schemaVersion:'1.0',messageId:`voice_yes_${index}`,caseId:c.id,correlationId:q.questionId,turnId:`voice_answer_turn_${index}`,source:'voice',locale:'de',text:'Ja.',transcriptStatus:'final',dataClassification:'synthetic',expectedCaseRevision:get().caseRevision}});
 const batchQuestion=await create({kind:'accept_batch',batchId:batch.id},1);await present(batchQuestion);const batchAnswer=answer(batchQuestion,1),batchOutcome=await r.confirmations.answer(customer,c.id,batchQuestion.id,batchAnswer);
 const ambiguityAfterAcceptance=get().ambiguities[0].status;
 const profileQuestion=await create({kind:'confirm_profile'},2);await present(profileQuestion);const profileAnswer=answer(profileQuestion,2),profileOutcome=await r.confirmations.answer(customer,c.id,profileQuestion.id,profileAnswer);
 const {run}=await r.engine.analyze(customer,c.id,{expectedCaseRevision:get().caseRevision,expectedProfileVersion:2,scenarioVersionId:'voice_annual_gross',scenario:{kind:'baseline'}});
 const netUnchanged=JSON.stringify(get().draft.financial.persons[0].income)===JSON.stringify(originalNet);
 const report={passed:netUnchanged&&context.nextQuestion===null&&context.ambiguities[0].dialogueStatus==='awaiting_customer_acceptance'&&profileOutcome.profileVersion===2,
  syntheticOnly:true,openAiCalled:false,realSpeechRecognitionCalled:false,providerMode:'test',changedField:path,grossAnnualIncomeCents:get().draft.insurance.persons[0].grossAnnualIncomeCents,
  budgetNetUnchanged:netUnchanged,dialogueBeforeAcceptance:context.ambiguities[0].dialogueStatus,questionRepeated:context.nextQuestion!==null,
  ambiguityAfterAcceptance,profileAfterFirstYes:batchOutcome.profileVersion,profileAfterSecondYes:profileOutcome.profileVersion,calculatedProfile:run.profileVersion};
 if(process.argv.includes('--export')){
  const output=new URL('../fixtures/voice-confirmation/',import.meta.url);await mkdir(output,{recursive:true});
  for(const [name,value] of Object.entries({'dialogue-awaiting-acceptance':context,'extractor-awaiting-acceptance':extractor,'batch-confirmation':batchQuestion,'batch-answer':batchAnswer,'batch-outcome':batchOutcome,'profile-confirmation':profileQuestion,'profile-answer':profileAnswer,'profile-outcome':profileOutcome,'report':report})){
   const content=JSON.stringify(value,null,2)+'\n';if(/"(?:ownerId|idempotency|confirmationRequests|sessionToken|csrfToken|sessionHash)"/.test(content))throw new Error('Private field in example');await writeFile(new URL(`${name}.v1.json`,output),content);
  }
 }
 console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
}finally{await r?.close();await rm(directory,{recursive:true,force:true});}
