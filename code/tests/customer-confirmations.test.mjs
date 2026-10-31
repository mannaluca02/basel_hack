import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CustomerConfirmationSchema,AnswerConfirmationInputSchema,ConfirmationOutcomeSchema,InsuranceCaseDtoSchema} from '@pax/contracts';
import {createLifeRuntime} from '../apps/api/dist/insurance/runtime.js';
import {createLifeInsuranceApp} from '../apps/api/dist/insurance/app.js';
import {CustomerConfirmations} from '../apps/api/dist/insurance/customer-confirmations.js';
import {localizedCase} from '../apps/api/dist/insurance/i18n.js';
import {lifeDraft,SyntheticTestProvider} from './helpers/life-fixture.mjs';
const credentials={customerAccessCode:'voice-customer-at-least-32-characters',reviewerAccessCode:'voice-reviewer-at-least-32-characters'};
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'pax-customer-confirm-'));let r=await createLifeRuntime({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials});
 t.after(async()=>{await r.close();await rm(directory,{recursive:true,force:true});});
 const customer=r.sessions.authenticate((await r.sessions.login(credentials.customerAccessCode,'customer')).sessionToken);
 let c=await r.engine.createCase(customer,{locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'});
 c=await r.engine.patchDraft(customer,c.id,{...(await lifeDraft()),expectedCaseRevision:c.caseRevision});
 await r.engine.confirm(customer,c.id,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v2'});
 const agent=r.sessions.authenticate((await r.sessions.agentToken(customer,c.id)).sessionToken);let counter=0;
 const get=()=>r.engine.caseFor(customer,c.id);
 const propose=async(changes,extra={})=>{const x=r.extraction.context(agent,c.id),messageId=`extract_${++counter}`;return r.extraction.proposeBatch(agent,c.id,{messageId,source:{messageId,turnId:`turn_${messageId}`,sourceRef:`synthetic:${messageId}`},expectedCaseRevision:x.caseRevision,expectedProfileVersion:x.profileVersion,basisDraftHash:x.draftHash,changes,...extra});};
 const change=(value=11900000)=>({path:'insurance.persons.0.grossAnnualIncomeCents',personId:'person_demo_1',value});
 const binding=q=>({expectedCaseRevision:get().caseRevision,questionId:q.questionId,questionHash:q.questionHash,questionTurnId:q.questionTurnId,questionReplyId:q.questionReplyId});
 const create=(target,channel='voice')=>r.confirmations.create(customer,c.id,{expectedCaseRevision:get().caseRevision,target,channel,questionTurnId:`question_turn_${++counter}`,questionReplyId:`question_reply_${counter}`});
 const present=q=>r.confirmations.presented(customer,c.id,q.id,{...binding(q),reviewDisplayed:true,profileAndAssumptionsDisplayed:q.target.kind==='confirm_profile',privacyNoticeDisplayed:q.target.kind==='confirm_profile',...(q.channel==='voice'?{playback:{playbackId:`playback_${q.id}`,event:'ended'}}:{})});
 const answer=(q,text='ja',messageId=`answer_${++counter}`)=>({...binding(q),channel:'voice',voiceLog:{schemaVersion:'1.0',messageId,caseId:c.id,correlationId:q.questionId,turnId:`answer_turn_${counter}`,source:'voice',locale:q.locale,text,transcriptStatus:'final',dataClassification:'synthetic',expectedCaseRevision:get().caseRevision}});
 const respond=(q,text,messageId)=>r.confirmations.answer(customer,c.id,q.id,answer(q,text,messageId));
 return {get r(){return r;},customer,agent,id:c.id,directory,get,propose,change,create,present,binding,answer,respond,async restart(){await r.close();r=await createLifeRuntime({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials});}};
}
test('spoken yes accepts annual gross only; a second question and second answer are required to confirm the whole profile',async t=>{
 const f=await fixture(t),before=structuredClone(f.get().confirmedVersions[0]),net=structuredClone(f.get().draft.financial.persons[0].income);
 const batch=await f.propose([f.change()]),q=CustomerConfirmationSchema.parse(await f.create({kind:'accept_batch',batchId:batch.id}));
 assert.match(q.questionText,/Bruttojahreseinkommen/);assert.match(q.questionText,/pro Jahr/);assert.equal(q.review.changes.length,1);assert.equal(q.status,'awaiting_presentation');assert.equal(CustomerConfirmationSchema.safeParse({...q,caseId:'foreign_case'}).success,false);
 await f.present(q);const accepted=ConfirmationOutcomeSchema.parse(await f.respond(q));assert.equal(accepted.accepted,true);assert.equal(accepted.confirmationStillRequired,true);
 assert.equal(f.get().draft.insurance.persons[0].grossAnnualIncomeCents,11900000);assert.deepEqual(f.get().draft.financial.persons[0].income,net);assert.equal(f.get().confirmedVersions.length,1);
 assert.deepEqual(f.get().confirmedVersions[0],before);await assert.rejects(f.respond(q),e=>e.code==='VERSION_CONFLICT'||e.code==='CONFIRMATION_NOT_OPEN');
 const profile=await f.create({kind:'confirm_profile'});assert.match(profile.questionText,/Gesamtprofil/);assert.equal(profile.review.allowSyntheticCalculatorTransfer,true);await f.present(profile);
 const confirmed=await f.respond(profile);assert.equal(confirmed.profileVersion,2);assert.equal(confirmed.confirmationStillRequired,false);assert.deepEqual(f.get().confirmedVersions[0],before);
 InsuranceCaseDtoSchema.parse(localizedCase(f.get()));
});
test('answers before complete presentation, unbound questions and unrelated voice logs never authorize a change',async t=>{
 const f=await fixture(t),batch=await f.propose([f.change()]),q=await f.create({kind:'accept_batch',batchId:batch.id});
 await assert.rejects(f.respond(q),e=>e.code==='CONFIRMATION_NOT_PRESENTED');
 await assert.rejects(f.r.confirmations.presented(f.customer,f.id,q.id,{...f.binding(q),reviewDisplayed:true,profileAndAssumptionsDisplayed:false,privacyNoticeDisplayed:false}),e=>e.code==='CONFIRMATION_PRESENTATION_INCOMPLETE');
 await f.present(q);
 for(const patch of [{questionId:'wrong'},{questionHash:'a'.repeat(64)},{questionReplyId:'wrong'},{questionTurnId:'wrong'}])await assert.rejects(f.r.confirmations.answer(f.customer,f.id,q.id,{...f.answer(q),...patch}),e=>e.code==='CONFIRMATION_QUESTION_MISMATCH');
 const input=f.answer(q);input.voiceLog.correlationId='unrelated_question';await assert.rejects(f.r.confirmations.answer(f.customer,f.id,q.id,input),e=>e.code==='CONFIRMATION_ANSWER_MISMATCH');
 assert.equal(f.get().draft.insurance.persons[0].grossAnnualIncomeCents,12000000);
});
test('whole-profile confirmation requires displayed profile, assumptions and notice; no partial/ambiguous utterance is accepted',async t=>{
 const f=await fixture(t),batch=await f.propose([f.change()]);await f.r.extraction.acceptBatch(f.customer,f.id,batch.id,{expectedCaseRevision:f.get().caseRevision,accept:true});
 const q=await f.create({kind:'confirm_profile'});
 await assert.rejects(f.r.confirmations.presented(f.customer,f.id,q.id,{...f.binding(q),reviewDisplayed:true,profileAndAssumptionsDisplayed:true,privacyNoticeDisplayed:false,playback:{playbackId:'playback',event:'ended'}}),e=>e.code==='CONFIRMATION_PRESENTATION_INCOMPLETE');
 await f.present(q);await assert.rejects(f.respond(q,'ja, aber das Einkommen stimmt noch nicht'),e=>e.code==='CONFIRMATION_ANSWER_UNCLEAR');
 const input=f.answer(q);input.voiceLog.transcriptStatus='partial';assert.equal(AnswerConfirmationInputSchema.safeParse(input).success,false);
 assert.equal(f.get().confirmedVersions.length,1);assert.equal(f.r.confirmations.get(f.customer,f.id,q.id).status,'awaiting_answer');
});
test('declining a question changes neither draft nor confirmed profile and consumes its pending authority',async t=>{
 const f=await fixture(t),batch=await f.propose([f.change()]),q=await f.create({kind:'accept_batch',batchId:batch.id});await f.present(q);
 const result=await f.respond(q,'nein');assert.equal(result.accepted,false);assert.equal(result.confirmation.status,'cancelled');assert.equal(f.get().proposalBatches[0].status,'rejected');assert.equal(f.get().draft.insurance.persons[0].grossAnnualIncomeCents,12000000);
 await assert.rejects(f.respond(q),e=>e.code==='CONFIRMATION_NOT_OPEN');
});
test('agent/reviewer and other customer sessions cannot create, read, present, answer or cancel customer confirmations',async t=>{
 const f=await fixture(t),batch=await f.propose([f.change()]),q=await f.create({kind:'accept_batch',batchId:batch.id});
 const reviewer=f.r.sessions.authenticate((await f.r.sessions.login(credentials.reviewerAccessCode,'reviewer')).sessionToken),other=f.r.sessions.authenticate((await f.r.sessions.login(credentials.customerAccessCode,'other')).sessionToken);
 for(const actor of [f.agent,reviewer,other]){
  await assert.rejects(f.r.confirmations.create(actor,f.id,{expectedCaseRevision:f.get().caseRevision,target:q.target,channel:'voice',questionTurnId:'another_turn',questionReplyId:'another_reply'}));
  assert.throws(()=>f.r.confirmations.get(actor,f.id,q.id));await assert.rejects(f.r.confirmations.presented(actor,f.id,q.id,{...f.binding(q),reviewDisplayed:true,profileAndAssumptionsDisplayed:false,privacyNoticeDisplayed:false,playback:{playbackId:'playback',event:'ended'}}));
  await assert.rejects(f.r.confirmations.answer(actor,f.id,q.id,f.answer(q)));await assert.rejects(f.r.confirmations.cancel(actor,f.id,q.id,{expectedCaseRevision:f.get().caseRevision,reason:'new_question'}));
 }
 for(const doc of [localizedCase(f.get()),f.r.extraction.context(f.agent,f.id),f.r.engine.advisorContext(f.agent,f.id),q])assert.equal(Object.hasOwn(doc,'confirmationRequests'),false);
 assert.equal(Object.hasOwn(q,'sessionHash'),false);assert.equal(InsuranceCaseDtoSchema.safeParse({...localizedCase(f.get()),confirmationRequests:[]}).success,false);
});
test('any case change, new confirmation question, or explicit conversation interruption invalidates the previous question',async t=>{
 const f=await fixture(t),batch=await f.propose([f.change()]),q=await f.create({kind:'accept_batch',batchId:batch.id});await f.present(q);
 await f.r.engine.preferences(f.customer,f.id,{locale:'fr'});assert.equal(f.r.confirmations.get(f.customer,f.id,q.id).status,'invalidated');await assert.rejects(f.respond(q,'oui'),e=>e.code==='CONFIRMATION_NOT_OPEN');
 const q2=await f.create({kind:'accept_batch',batchId:batch.id}),q3=await f.create({kind:'accept_batch',batchId:batch.id});
 assert.equal(f.r.confirmations.get(f.customer,f.id,q2.id).invalidationReason,'new_question');
 await f.r.confirmations.cancel(f.customer,f.id,q3.id,{expectedCaseRevision:f.get().caseRevision,reason:'new_question'});assert.equal(f.r.confirmations.get(f.customer,f.id,q3.id).status,'cancelled');
});
test('expiry and session revocation prevent execution, including after an encrypted restart',async t=>{
 const f=await fixture(t),batch=await f.propose([f.change()]);let instant=Date.now();f.r.confirmations=new CustomerConfirmations(f.r.engine,f.r.extraction,()=>new Date(instant));
 const q=await f.create({kind:'accept_batch',batchId:batch.id});await f.present(q);instant+=120001;
 assert.equal(f.r.confirmations.get(f.customer,f.id,q.id).invalidationReason,'expired');await assert.rejects(f.respond(q),e=>e.code==='CONFIRMATION_EXPIRED');
 await f.restart();const restored=f.r.confirmations.get(f.customer,f.id,q.id);assert.equal(restored.id,q.id);assert.equal(restored.presentedAt,q.presentedAt??f.get().confirmationRequests[0].presentedAt);
 await f.r.sessions.revoke(f.customer);assert.throws(()=>f.r.confirmations.get(f.customer,f.id,q.id),e=>e.code==='UNAUTHORIZED');
});
test('one answer message cannot authorize both package acceptance and profile confirmation; concurrent answers commit once',async t=>{
 const f=await fixture(t),batch=await f.propose([f.change()]),q=await f.create({kind:'accept_batch',batchId:batch.id});await f.present(q);
 const input=f.answer(q,'ja','one_spoken_answer');const results=await Promise.allSettled([f.r.confirmations.answer(f.customer,f.id,q.id,input),f.r.confirmations.answer(f.customer,f.id,q.id,input)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 const profile=await f.create({kind:'confirm_profile'});await f.present(profile);await assert.rejects(f.respond(profile,'ja','one_spoken_answer'),e=>e.code==='CONFIRMATION_ANSWER_REUSED');assert.equal(f.get().confirmedVersions.length,1);
});
test('bound screen confirmation supports structured changes that are not yet safe to render as voice',async t=>{
 const f=await fixture(t),batch=await f.propose([{path:'goals.0.priority',value:2}]);await assert.rejects(f.create({kind:'accept_batch',batchId:batch.id}),e=>e.code==='VOICE_CONFIRMATION_REQUIRES_SCREEN');
 const q=await f.create({kind:'accept_batch',batchId:batch.id},'screen');await f.present(q);
 const result=await f.r.confirmations.answer(f.customer,f.id,q.id,{...f.binding(q),channel:'screen',decision:'accept',answerMessageId:'screen_answer'});assert.equal(result.accepted,true);assert.equal(f.get().draft.goals[0].priority,2);
});
for(const [locale,yes,label] of [['de','ja','Bruttojahreseinkommen'],['fr','oui','Revenu annuel brut'],['it','sì','Reddito annuo lordo'],['en','yes','Annual gross income']]){
 test(`${locale}: server question preserves annual gross meaning and the explicit answer works`,async t=>{
  const f=await fixture(t);await f.r.engine.preferences(f.customer,f.id,{locale});const batch=await f.propose([f.change()]),q=await f.create({kind:'accept_batch',batchId:batch.id});assert.ok(q.questionText.includes(label));assert.equal(q.locale,locale);await f.present(q);assert.equal((await f.respond(q,yes)).accepted,true);
 });
}
test('an answered clarification waits for valid package acceptance without repeating the question, then resolves only on customer action',async t=>{
 const f=await fixture(t),path=f.change().path;
 await f.propose([],{ambiguities:[{path,personId:'person_demo_1',question:'Wie hoch ist das Bruttojahreseinkommen?',source:{messageId:'question_income',turnId:'question_income_turn',sourceRef:'synthetic:income'}}]});
 const id=f.get().ambiguities[0].id;let ctx=f.r.engine.advisorContext(f.agent,f.id);assert.equal(ctx.ambiguities[0].dialogueStatus,'needs_answer');assert.equal(ctx.nextQuestion.text,'Wie hoch ist das Bruttojahreseinkommen?');
 const batch=await f.propose([f.change()],{resolvesAmbiguityIds:[id]});ctx=f.r.engine.advisorContext(f.agent,f.id);assert.equal(ctx.ambiguities[0].status,'open');assert.equal(ctx.ambiguities[0].dialogueStatus,'awaiting_customer_acceptance');assert.equal(ctx.ambiguities[0].answerBatchId,batch.id);assert.deepEqual(ctx.pendingAcceptanceBatchIds,[batch.id]);assert.equal(ctx.nextQuestion,null);
 await assert.rejects(f.r.confirmations.create(f.customer,f.id,{expectedCaseRevision:f.get().caseRevision,target:{kind:'confirm_profile'},channel:'voice',questionTurnId:'premature_profile',questionReplyId:'premature_profile_reply'}),e=>e.code==='UNRESOLVED_AMBIGUITIES');
 const q=await f.create({kind:'accept_batch',batchId:batch.id});await f.present(q);await f.respond(q);assert.equal(f.get().ambiguities[0].status,'resolved');assert.equal(f.get().confirmedVersions.length,1);assert.equal(f.r.engine.advisorContext(f.agent,f.id).ambiguities[0].dialogueStatus,'resolved');
});
test('stale or superseded answer packages are re-evaluated and proposed net values do not cause a repeated income question',async t=>{
 const f=await fixture(t),path='financial.persons.0.income.value',change={path,personId:'person_demo_1',value:8300000};
 await f.propose([],{ambiguities:[{path,personId:'person_demo_1',question:'Welches Netto gilt?',source:{messageId:'net_question',turnId:'net_question_turn',sourceRef:'synthetic:net'}}]});
 const id=f.get().ambiguities[0].id,old=await f.propose([change],{resolvesAmbiguityIds:[id]});assert.equal(f.r.engine.questions(f.agent,f.id).questions.length,0);
 const next=await f.propose([{...change,value:8200000}],{supersedesBatchIds:[old.id],resolvesAmbiguityIds:[id]});assert.equal(f.r.extraction.context(f.agent,f.id).ambiguities[0].answerBatchId,next.id);
 const draft=structuredClone(f.get().draft);draft.insurance.annualReturnBps=100;await f.r.engine.patchDraft(f.customer,f.id,{...draft,expectedCaseRevision:f.get().caseRevision});assert.equal(f.r.engine.advisorContext(f.agent,f.id).ambiguities[0].dialogueStatus,'needs_answer');
 const fresh=await f.propose([change],{supersedesBatchIds:[next.id],resolvesAmbiguityIds:[id]});await f.r.extraction.acceptBatch(f.customer,f.id,fresh.id,{expectedCaseRevision:f.get().caseRevision,accept:true});assert.equal(f.get().draft.financial.persons[0].income.confirmation,'proposed');assert.equal(f.r.engine.questions(f.agent,f.id).questions.length,0);
});
test('the confirmation HTTP routes enforce cookie CSRF and expose shared request/response contracts',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'pax-confirm-http-'));const {app}=await createLifeInsuranceApp({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials});
 t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});await app.listen(0,'127.0.0.1');const base=await app.getUrl();
 const call=async(method,path,body,headers={})=>{const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};};
 const login=(await call('POST','/api/sessions',{accessCode:credentials.customerAccessCode})).body,auth={Authorization:`Bearer ${login.sessionToken}`};
 let c=(await call('POST','/api/cases',{locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'},auth)).body;
 c=(await call('PATCH',`/api/cases/${c.id}/draft`,{...(await lifeDraft()),expectedCaseRevision:c.caseRevision},auth)).body;
 const path=`/api/cases/${c.id}/customer-confirmations`,body={expectedCaseRevision:c.caseRevision,target:{kind:'confirm_profile'},channel:'screen',questionTurnId:'http_profile_turn',questionReplyId:'http_profile_reply'};
 assert.equal((await call('POST',path,body,{Cookie:`pax_session=${login.sessionToken}`})).status,403);
 const q=(await call('POST',path,body,{Cookie:`pax_session=${login.sessionToken}`,'X-CSRF-Token':login.csrfToken})).body;CustomerConfirmationSchema.parse(q);
 assert.equal((await call('GET',`${path}/current`,null,auth)).body.confirmation.id,q.id);assert.equal((await call('GET',`${path}/${q.id}`)).status,401);
 const binding={expectedCaseRevision:q.basisCaseRevision,questionId:q.questionId,questionHash:q.questionHash,questionTurnId:q.questionTurnId,questionReplyId:q.questionReplyId};
 assert.equal((await call('POST',`${path}/${q.id}/presented`,{...binding,reviewDisplayed:true,profileAndAssumptionsDisplayed:true,privacyNoticeDisplayed:true},auth)).status,201);
 const result=await call('POST',`${path}/${q.id}/answer`,{...binding,channel:'screen',decision:'accept',answerMessageId:'http_screen_answer'},auth);assert.equal(result.status,201);assert.equal(result.body.profileVersion,1);
 const spec=(await call('GET','/api/openapi.json')).body;assert.ok(spec.components.schemas.CustomerConfirmation);assert.ok(spec.paths['/api/cases/{caseId}/customer-confirmations/{confirmationId}/answer']);
});
test('the exported voice examples bind two distinct questions and answers to one gross-income-only journey',async()=>{
 const {readFile}=await import('node:fs/promises');
 const names=['dialogue-awaiting-acceptance','extractor-awaiting-acceptance','batch-confirmation','batch-answer','batch-outcome','profile-confirmation','profile-answer','profile-outcome','report'];
 const docs={};for(const name of names){const text=await readFile(new URL(`../fixtures/voice-confirmation/${name}.v1.json`,import.meta.url),'utf8');assert.ok(!/"(?:confirmationRequests|sessionHash|sessionToken|csrfToken|ownerId|idempotency)"/.test(text));docs[name]=JSON.parse(text);}
 for(const name of ['batch-confirmation','profile-confirmation'])CustomerConfirmationSchema.parse(docs[name]);
 for(const name of ['batch-answer','profile-answer'])AnswerConfirmationInputSchema.parse(docs[name]);
 for(const name of ['batch-outcome','profile-outcome'])ConfirmationOutcomeSchema.parse(docs[name]);
 assert.equal(docs['batch-answer'].voiceLog.correlationId,docs['batch-confirmation'].questionId);assert.equal(docs['profile-answer'].voiceLog.correlationId,docs['profile-confirmation'].questionId);
 assert.notEqual(docs['batch-answer'].voiceLog.messageId,docs['profile-answer'].voiceLog.messageId);assert.equal(docs['batch-outcome'].profileVersion,1);assert.equal(docs['profile-outcome'].profileVersion,2);
 assert.equal(docs['dialogue-awaiting-acceptance'].nextQuestion,null);assert.equal(docs.report.budgetNetUnchanged,true);assert.equal(docs.report.openAiCalled,false);assert.equal(docs.report.realSpeechRecognitionCalled,false);
});
