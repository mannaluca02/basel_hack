import {mkdir,writeFile} from 'node:fs/promises';
import {voiceFixture,incomeObservation} from '../tests/helpers/voice-fixture.mjs';
const f=await voiceFixture();
try{
 const originalNet=structuredClone(f.get().draft.financial.persons[0].income),additionalSaving=f.get().draft.insurance.annualSavingCents;
 const started=await f.start(),sid=started.voiceSession.id;
 await f.turn(sid,'Mein Bruttojahreseinkommen beträgt 119000 CHF.');
 const transcript=f.r.voice.transcript(f.agent,f.id,sid),mid=transcript.turns[0].log.messageId,ctx=f.r.extraction.context(f.agent,f.id);
 const input={messageId:'income_extraction',expectedCaseRevision:ctx.caseRevision,expectedProfileVersion:ctx.profileVersion,basisDraftHash:ctx.draftHash,transcriptRevision:transcript.voiceSession.transcriptRevision,observations:[incomeObservation(mid)]};
 const proposed=await f.r.voice.propose(f.agent,f.id,sid,input);
 const artifacts={'voice-session':started.voiceSession,'final-transcript':transcript,'extraction-request':input,'proposal-result':proposed,'portfolio':f.r.voice.catalog()};
 async function confirm(target,index){
  const q=await f.r.confirmations.create(f.customer,f.id,{expectedCaseRevision:f.get().caseRevision,target,channel:'voice',questionTurnId:`question_turn_${index}`,questionReplyId:`question_reply_${index}`});
  const binding={expectedCaseRevision:f.get().caseRevision,questionId:q.questionId,questionHash:q.questionHash,questionTurnId:q.questionTurnId,questionReplyId:q.questionReplyId};
  await f.r.voice.ingest(f.customer,f.id,sid,{speaker:'agent',log:{schemaVersion:'1.0',messageId:q.questionReplyId,caseId:f.id,correlationId:q.questionId,turnId:q.questionTurnId,source:'voice',locale:'de',text:q.questionText,transcriptStatus:'final',dataClassification:'synthetic'}});
  // This callback is simulated; the real client must display the review and wait for actual playback completion.
  await f.r.confirmations.presented(f.customer,f.id,q.id,{...binding,reviewDisplayed:true,profileAndAssumptionsDisplayed:target.kind==='confirm_profile',privacyNoticeDisplayed:target.kind==='confirm_profile',playback:{playbackId:`playback_${index}`,event:'ended'}});
  await f.turn(sid,'Ja.',{correlationId:q.questionId});const log=f.r.voice.transcript(f.agent,f.id,sid).turns.at(-1).log;
  const outcome=await f.r.confirmations.answer(f.customer,f.id,q.id,{...binding,channel:'voice',voiceLog:log});
  artifacts[`question-${index}`]=q;artifacts[`confirmation-${index}`]=outcome;return outcome;
 }
 const first=await confirm({kind:'accept_batch',batchId:proposed.proposalBatch.id},1),second=await confirm({kind:'confirm_profile'},2);
 const analysis=await f.r.engine.analyze(f.customer,f.id,{expectedCaseRevision:f.get().caseRevision,expectedProfileVersion:2,scenarioVersionId:'voice_income_119000',scenario:{kind:'baseline'}});
 const handover=await f.r.handover.command(f.customer,f.id,{action:'request',messageId:'demo_human_request',expectedCaseRevision:f.get().caseRevision,source:'voice'});
 const closed=f.r.voice.list(f.customer,f.id).sessions[0];
 const report={passed:first.profileVersion===1&&second.profileVersion===2&&analysis.run.profileVersion===2&&f.get().draft.insurance.persons[0].grossAnnualIncomeCents===11900000&&JSON.stringify(f.get().draft.financial.persons[0].income)===JSON.stringify(originalNet)&&f.get().draft.insurance.annualSavingCents===additionalSaving&&closed.closeReason==='human_handover',
  syntheticOnly:true,actualOpenAiCalls:0,actualElevenLabsCalls:0,actualMicrophone:false,automaticDialing:false,
  mappedAnnualGrossCents:f.get().draft.insurance.persons[0].grossAnnualIncomeCents,budgetNetUnchanged:JSON.stringify(f.get().draft.financial.persons[0].income)===JSON.stringify(originalNet),additionalSavingUnchanged:f.get().draft.insurance.annualSavingCents===additionalSaving,
  profileAfterPacketYes:first.profileVersion,profileAfterProfileYes:second.profileVersion,calculatedProfile:analysis.run.profileVersion,humanHandoverStopsVoice:closed.closeReason==='human_handover',portfolioFields:f.r.voice.catalog().length,
  nextTeamSteps:['Dario: Nest routes, immediate media stop, actual playback completion and prompt refresh on every context revision','Erni: produce sourced observations with explicit units, periods, person IDs; model transport remains in AI module','Luca: connect Angular API adapter and explicit synthetic voice consent']};
 artifacts['handover']=handover;artifacts['closed-session']=closed;artifacts['report']=report;
 if(process.argv.includes('--export')){const output=new URL('../fixtures/voice-integration/',import.meta.url);await mkdir(output,{recursive:true});for(const [name,value] of Object.entries(artifacts)){
  const content=JSON.stringify(value,null,2)+'\n';if(/"(?:ownerId|idempotency|confirmationRequests|sessionToken|csrfToken|sessionHash|sdp|token)"/.test(content))throw new Error('Private connection data in exported fixture');await writeFile(new URL(`${name}.v1.json`,output),content);
 }}
 console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
}finally{await f.close();}
