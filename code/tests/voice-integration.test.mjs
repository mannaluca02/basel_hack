import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {VoiceSessionSchema,VoiceSessionStartResponseSchema,VoiceTranscriptSchema,PortfolioFieldIdSchema,InsuranceCaseDtoSchema,PRIVACY_NOTICE} from '@pax/contracts';
import {localizedCase} from '../apps/api/dist/insurance/i18n.js';
import {mapVoiceObservations,portfolioCatalog,chfToCents} from '../apps/api/dist/voice/portfolio.js';
import {OpenAiLiveGateway,ElevenLabsGateway} from '../apps/api/dist/voice/providers.js';
import {createLifeInsuranceApp} from '../apps/api/dist/insurance/app.js';
import {lifeDraft,SyntheticTestProvider} from './helpers/life-fixture.mjs';
import {voiceFixture,FakeVoiceGateway,incomeObservation,voiceCredentials} from './helpers/voice-fixture.mjs';
const fixture=async(t,options)=>{const f=await voiceFixture(options);t.after(()=>f.close());return f;};
const code=expected=>e=>e.code===expected;
const source=(f,sid)=>f.r.voice.transcript(f.agent,f.id,sid).turns.at(-1).log.messageId;
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('all 37 portfolio fields have explicit handling; existing 3a and gross never overwrite additional saving or budget net',async()=>{
  const d=await lifeDraft(),before=structuredClone(d),catalog=portfolioCatalog();assert.equal(catalog.length,37);assert.deepEqual(catalog.map(f=>f.fieldId),PortfolioFieldIdSchema.options);
  for(const field of catalog){const o=incomeObservation('source',{fieldId:field.fieldId,precision:'unknown',value:null});const result=mapVoiceObservations(d,[o],'de');assert.equal(result.changes.length,0);assert.equal(result.issues.length,1);}
  const result=mapVoiceObservations(d,[incomeObservation('source'),incomeObservation('source',{fieldId:'pillar_3a_annual_contribution_chf',personId:undefined,value:"CHF 6'258.10",basis:'not_applicable'})],'de');
  assert.deepEqual(result.changes,[{path:'insurance.persons.0.grossAnnualIncomeCents',personId:'person_demo_1',value:11900000},{path:'insurance.existingAnnualPillar3aContributionCents',value:625810}]);assert.deepEqual(d,before);
  for(const [input,expected] of [['0.01',1],["119’000.50",11900050],[7258,725800]])assert.equal(chfToCents(input),expected);
  for(const invalid of [-1,'123.456','1,200','1e9',null,Infinity])assert.throws(()=>chfToCents(invalid));
});
test('person references survive reversed order; monthly/net and approximate incomes create follow-ups in all four languages',async()=>{
  const d=await lifeDraft();d.insurance.persons.reverse();const o=incomeObservation('source');assert.equal(mapVoiceObservations(d,[o],'en').changes[0].path,'insurance.persons.1.grossAnnualIncomeCents');
  assert.throws(()=>mapVoiceObservations(d,[{...o,personId:'foreign_person'}],'de'),code('PERSON_REFERENCE_MISMATCH'));
  for(const locale of ['de','fr','it','en'])for(const override of [{period:'month'},{basis:'net_after_income_tax'},{precision:'approximate'},{precision:'range',value:'110000-120000'}]){
   const result=mapVoiceObservations(d,[{...o,...override}],locale);assert.equal(result.changes.length,0);assert.equal(result.issues[0].code,'AMBIGUOUS_VALUE');assert.ok(result.questions[0].question.length>5);
  }
});
test('provider adapters use verified WebRTC endpoints, keep keys server-side and make no auto-create/retry calls',async()=>{
  const calls=[],fetcher=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.includes('elevenlabs')?{token:'ephemeral-token',conversation_id:'conversation123',secret:'must-strip'}:{session:{id:'live123',secret:'must-strip'},transport:{type:'webrtc',sdp:'v=answer'},key:'must-strip'}));};
  const gateway=new OpenAiLiveGateway('server-only-key','gpt-live-1','juni',fetcher),live=await gateway.open({sdp:'v=offer',locale:'de',prompt:'synthetic prompt'},new AbortController().signal);
  assert.equal(calls[0].url,'https://api.openai.com/v1/live/sessions');const payload=JSON.parse(calls[0].options.body);assert.equal(payload.session.store,false);assert.equal(payload.session.model,'gpt-live-1');assert.equal(payload.transport.type,'webrtc');assert.equal(calls[0].options.redirect,'manual');assert.equal(calls[0].options.headers.get('Authorization'),'Bearer server-only-key');assert.equal(JSON.stringify(live).includes('must-strip'),false);
  assert.equal(await gateway.stop('id/with slash'),'requested');assert.ok(calls[1].url.endsWith('/id%2Fwith%20slash/hangup'));
  const el=new ElevenLabsGateway('eleven-key','existing-agent',fetcher),token=await el.open({locale:'de',prompt:'synthetic'},new AbortController().signal);assert.equal(token.connection.token,'ephemeral-token');assert.equal(calls[2].url,'https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=existing-agent');assert.equal(await el.stop('conversation123'),'client_required');assert.equal(calls.length,3);
  let n=0;const fail=new OpenAiLiveGateway('secret',undefined,undefined,async()=>{n++;return new Response('sensitive upstream message',{status:429});});await assert.rejects(fail.open({sdp:'v=x',locale:'en',prompt:'demo'},new AbortController().signal),code('VOICE_PROVIDER_UNAVAILABLE'));assert.equal(n,1);
  const invalid=new OpenAiLiveGateway('secret',undefined,undefined,async()=>new Response('{}'));await assert.rejects(invalid.open({sdp:'v=x',locale:'en',prompt:'demo'},new AbortController().signal),code('VOICE_PROVIDER_RESPONSE_INVALID'));
});
test('voice is disabled by default and requires explicit notice, classification, locale and owner',async t=>{
  const f=await fixture(t,{enabled:false});await assert.rejects(f.start(),code('VOICE_PROVIDER_DISABLED'));assert.equal(f.gateway.opens.length,0);
  const g=await fixture(t);await assert.rejects(g.start({allowExternalVoiceProcessing:false}));await assert.rejects(g.start({dataClassification:'real'}));await assert.rejects(g.start({locale:'fr'}),code('VOICE_LOCALE_MISMATCH'));await assert.rejects(g.start({sdp:'bad-sdp'}),code('VOICE_SDP_REQUIRED'));assert.equal(g.gateway.opens.length,0);
  const other=g.r.sessions.authenticate((await g.r.sessions.login(voiceCredentials.customerAccessCode,'other')).sessionToken);assert.throws(()=>g.r.voice.list(other,g.id),code('NOT_FOUND'));
  const reviewer=g.r.sessions.authenticate((await g.r.sessions.login(voiceCredentials.reviewerAccessCode,'reviewer')).sessionToken);await assert.rejects(g.r.voice.start(g.agent,g.id,{}),code('FORBIDDEN'));assert.throws(()=>g.r.voice.list(reviewer,g.id));
  for(const locale of ['de','fr','it','en']){const privacy=g.r.voice.privacy(locale);assert.equal(privacy.locale,locale);assert.ok(privacy.text.length>80);assert.equal(privacy.fullCaseTransferAuthorized,false);}
});
test('session starts are idempotent, case-bound and never persist provider tokens, SDP or credentials in case DTO',async t=>{
  const f=await fixture(t),b={messageId:'start_once'},one=VoiceSessionStartResponseSchema.parse(await f.start(b));const sid=one.voiceSession.id;
  assert.equal((await f.start(b)).replayed,true);assert.equal(f.gateway.opens.length,1);assert.equal(f.gateway.opens[0].input.prompt.includes('120000'),false);
  await assert.rejects(f.start({...b,sdp:'v=different'}),code('IDEMPOTENCY_CONFLICT'));await assert.rejects(f.start(),code('VOICE_ALREADY_ACTIVE'));
  const dto=InsuranceCaseDtoSchema.parse(localizedCase(f.get()));assert.equal('voiceSessions'in dto,false);const stored=JSON.stringify(f.r.store.snapshot());assert.equal(stored.includes('v=fake-provider-answer'),false);assert.equal(stored.includes('v=fake-client-offer'),false);
  assert.equal((await readFile(join(f.directory,'cases.enc'))).includes(Buffer.from('fake-provider')),false);VoiceSessionSchema.parse(f.r.voice.list(f.agent,f.id).sessions[0]);
  await f.r.voice.close(f.customer,f.id,sid,{reason:'customer_closed'});await assert.rejects(f.start(b),code('VOICE_CONNECTION_NOT_REPLAYABLE'));
});
test('final turns are replay-safe, scoped and versioned without invalidating a pending customer yes',async t=>{
  const f=await fixture(t),sid=(await f.start()).voiceSession.id;await f.turn(sid,'Mein Jahresbrutto ist 119000 CHF.');const turn=f.r.voice.transcript(f.agent,f.id,sid).turns[0],revision=f.get().caseRevision;
  assert.equal((await f.r.voice.ingest(f.customer,f.id,sid,{speaker:turn.speaker,log:turn.log})).replayed,true);
  await assert.rejects(f.r.voice.ingest(f.customer,f.id,sid,{speaker:turn.speaker,log:{...turn.log,text:'changed'}}),code('IDEMPOTENCY_CONFLICT'));
  await assert.rejects(f.turn(sid,'partial',{transcriptStatus:'partial'}));await assert.rejects(f.turn(sid,'foreign',{caseId:crypto.randomUUID()}),code('VOICE_CASE_MISMATCH'));assert.equal(f.get().caseRevision,revision);
  VoiceTranscriptSchema.parse(f.r.voice.transcript(f.agent,f.id,sid));
});
test('source-bound extraction creates one atomic packet; corrections supersede and profile confirmation stays separate',async t=>{
  const f=await fixture(t),sid=(await f.start()).voiceSession.id,net=structuredClone(f.get().draft.financial.persons[0].income),saving=f.get().draft.insurance.annualSavingCents;
  await f.turn(sid,'Mein Jahresbrutto ist 119000 CHF; bestehende 3a sind 6258.10 CHF pro Jahr.');const mid=source(f,sid),observations=[incomeObservation(mid),incomeObservation(mid,{fieldId:'pillar_3a_annual_contribution_chf',personId:undefined,quote:'6258.10',value:'6258.10',basis:'not_applicable'})];
  const first=await f.extract(sid,observations,{messageId:'packet_one'});assert.equal(first.proposalBatch.status,'proposed');assert.equal(f.get().draft.insurance.persons[0].grossAnnualIncomeCents,12000000);
  const originalContext=f.r.extraction.context(f.agent,f.id);const replayInput={messageId:'packet_one',expectedCaseRevision:first.caseRevision-1,expectedProfileVersion:1,basisDraftHash:originalContext.draftHash,transcriptRevision:1,observations};assert.equal((await f.r.voice.propose(f.agent,f.id,sid,replayInput)).replayed,true);
  await f.turn(sid,'Korrektur: 118000 und 6258.10.');const corrected=[incomeObservation(source(f,sid),{quote:'118000',value:118000}),{...observations[1],sourceMessageId:source(f,sid)}];
  const second=await f.extract(sid,corrected,{supersedesBatchIds:[first.proposalBatch.id]});assert.equal(f.get().proposalBatches[0].status,'superseded');assert.equal(f.get().proposalBatches[0].replacedByBatchId,second.proposalBatch.id);
  await f.r.extraction.acceptBatch(f.customer,f.id,second.proposalBatch.id,{expectedCaseRevision:f.get().caseRevision,accept:true});assert.equal(f.get().draft.insurance.persons[0].grossAnnualIncomeCents,11800000);assert.equal(f.get().draft.insurance.existingAnnualPillar3aContributionCents,625810);assert.equal(f.get().draft.insurance.annualSavingCents,saving);assert.deepEqual(f.get().draft.financial.persons[0].income,net);assert.equal(f.get().confirmedVersions.at(-1).version,1);
  await f.r.engine.confirm(f.customer,f.id,{expectedCaseRevision:f.get().caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:PRIVACY_NOTICE.version});assert.equal(f.get().confirmedVersions.at(-1).version,2);
});
test('wrong sources, agent words, stale transcript and mixed-invalid packets cannot partially create proposals',async t=>{
  const f=await fixture(t),sid=(await f.start()).voiceSession.id;await f.turn(sid,'119000');const mid=source(f,sid),count=f.get().proposalBatches.length;
  await assert.rejects(f.extract(sid,[incomeObservation(mid,{quote:'invented quote'})]),code('VOICE_SOURCE_NOT_FOUND'));
  await assert.rejects(f.extract(sid,[incomeObservation(mid)],{transcriptRevision:2}),code('VERSION_CONFLICT'));
  const turn=f.r.voice.transcript(f.agent,f.id,sid).turns[0];await f.r.voice.ingest(f.customer,f.id,sid,{speaker:'agent',log:{...turn.log,messageId:'agent_invented'}});await assert.rejects(f.extract(sid,[incomeObservation('agent_invented')]),code('VOICE_SOURCE_NOT_FOUND'));
  await assert.rejects(f.extract(sid,[incomeObservation(mid),incomeObservation(mid,{fieldId:'sex',unit:'enum',value:'unsupported'})]),code('VOICE_ENUM_INVALID'));assert.equal(f.get().proposalBatches.length,count);
  await assert.rejects(f.r.voice.propose(f.customer,f.id,sid,{}),code('FORBIDDEN'));
});
test('approximate answers yield ambiguities; answered questions wait for customer acceptance instead of repeating',async t=>{
  const f=await fixture(t),sid=(await f.start()).voiceSession.id;await f.turn(sid,'Ungefähr 119000');const ambiguous=await f.extract(sid,[incomeObservation(source(f,sid),{precision:'approximate'})]);assert.equal(ambiguous.issues[0].code,'AMBIGUOUS_VALUE');const aid=f.get().ambiguities[0].id;
  await f.turn(sid,'Exakt 119000');const answer=await f.extract(sid,[incomeObservation(source(f,sid))],{resolvesAmbiguityIds:[aid]});const ctx=f.r.extraction.context(f.agent,f.id);assert.equal(ctx.ambiguities[0].dialogueStatus,'awaiting_customer_acceptance');assert.equal(f.r.engine.advisorContext(f.agent,f.id).nextQuestion,null);assert.equal(f.get().ambiguities[0].status,'open');
  await f.r.extraction.acceptBatch(f.customer,f.id,answer.proposalBatch.id,{expectedCaseRevision:f.get().caseRevision,accept:true});assert.equal(f.get().ambiguities[0].status,'resolved');
});
test('voice transcript yes preserves its bound confirmation; a different agent question invalidates it',async t=>{
  const f=await fixture(t),sid=(await f.start()).voiceSession.id;await f.turn(sid,'119000');const batch=(await f.extract(sid,[incomeObservation(source(f,sid))])).proposalBatch;
  const q=await f.r.confirmations.create(f.customer,f.id,{expectedCaseRevision:f.get().caseRevision,target:{kind:'accept_batch',batchId:batch.id},channel:'voice',questionTurnId:'qturn',questionReplyId:'qreply'});
  await f.turn(sid,'Ja.');assert.equal(f.r.confirmations.get(f.customer,f.id,q.id).status,'awaiting_presentation');
  const log={schemaVersion:'1.0',messageId:'qreply',caseId:f.id,correlationId:'qcorrelation',turnId:'qturn',source:'voice',locale:'de',text:q.questionText,transcriptStatus:'final',dataClassification:'synthetic'};await f.r.voice.ingest(f.customer,f.id,sid,{speaker:'agent',log});assert.equal(f.r.confirmations.get(f.customer,f.id,q.id).status,'awaiting_presentation');
  await f.r.voice.ingest(f.customer,f.id,sid,{speaker:'agent',log:{...log,messageId:'different_question'}});assert.equal(f.r.confirmations.get(f.customer,f.id,q.id).status,'invalidated');
});
test('human handover closes and stops voice atomically; switching voice never requests human advice',async t=>{
  const f=await fixture(t),first=(await f.start()).voiceSession.id,second=(await f.start({resumeFrom:first})).voiceSession.id;await settle();assert.equal(f.get().handover.wantsHumanAdvisor,false);assert.equal(f.r.voice.transcript(f.agent,f.id,first).voiceSession.closeReason,'voice_switch');assert.ok(f.gateway.stops.includes('fake-provider-1'));
  await f.r.handover.command(f.customer,f.id,{action:'request',messageId:'human_request',expectedCaseRevision:f.get().caseRevision,source:'voice'});assert.equal(f.r.voice.transcript(f.agent,f.id,second).voiceSession.closeReason,'human_handover');await settle();assert.ok(f.gateway.stops.includes('fake-provider-2'));await assert.rejects(f.turn(second,'119000'),code('HUMAN_HANDOVER_ACTIVE'));
  await f.r.handover.command(f.customer,f.id,{action:'resume',messageId:'human_resume',expectedCaseRevision:f.get().caseRevision,source:'ui'});assert.equal(f.r.voice.transcript(f.agent,f.id,second).voiceSession.status,'interrupted');
});
test('handover during provider creation aborts creation and closes a late provider connection',async t=>{
  let release,entered;const barrier=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);class Slow extends FakeVoiceGateway {async open(input,signal){entered();await barrier;return super.open(input,signal);}}
  const gateway=new Slow(),f=await fixture(t,{gateway}),work=f.start(),rejected=assert.rejects(work,code('DIGITAL_TASK_CANCELLED'));await started;await f.r.handover.command(f.customer,f.id,{action:'request',messageId:'stop_during_start',expectedCaseRevision:f.get().caseRevision,source:'ui'});release();await rejected;assert.equal(gateway.opens[0].signal.aborted,true);assert.deepEqual(gateway.stops,['fake-provider-1']);assert.equal(f.get().voiceSessions[0].closeReason,'human_handover');
});
test('logout, locale change, expiry and deletion close server handles without resuming digital advice',async t=>{
  for(const action of ['logout','locale','expiry','delete']){const f=await fixture(t),sid=(await f.start()).voiceSession.id;
   if(action==='logout')await f.r.sessions.revoke(f.customer);if(action==='locale')await f.r.engine.preferences(f.customer,f.id,{locale:'fr'});if(action==='expiry')await f.r.store.transaction(db=>{db.cases[f.id].voiceSessions[0].expiresAt='2020-01-01T00:00:00.000Z';});if(action==='delete')await f.r.store.transaction(db=>{delete db.cases[f.id];});
   await f.r.voice.sweep();await settle();assert.equal(f.gateway.stops.length,1);if(action!=='delete')assert.equal(f.r.store.snapshot().cases[f.id].voiceSessions[0].status,'interrupted');
  }
});
test('HTTP routes share Nest owner authentication, cookie CSRF, safe errors and OpenAPI contracts',async t=>{
  const f=await fixture(t),gateway=new FakeVoiceGateway(),{app,runtime}=await createLifeInsuranceApp({dataDirectory:join(f.directory,'http'),provider:new SyntheticTestProvider(),providerMode:'test',credentials:voiceCredentials,voice:{enabled:true,gateways:[gateway]}});t.after(()=>app.close());await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  const call=async(method,path,token,body,headers={})=>{const response=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};};
  const login=(await call('POST','/api/sessions',null,{accessCode:voiceCredentials.customerAccessCode})).body,c=(await call('POST','/api/cases',login.sessionToken,{locale:'de',timeBudgetMinutes:10,noticeVersion:PRIVACY_NOTICE.version,dataClassification:'synthetic'})).body;
  const path=`/api/cases/${c.id}/voice/sessions`,input={messageId:'http_start',expectedCaseRevision:c.caseRevision,provider:'gpt-live',locale:'de',dataClassification:'synthetic',noticeVersion:'voice-synthetic-v1',allowExternalVoiceProcessing:true,sdp:'v=offer'};
  assert.equal((await call('POST',path,null,input)).status,401);assert.equal((await call('POST',path,null,input,{Cookie:`pax_session=${login.sessionToken}`})).status,403);
  const response=await call('POST',path,null,input,{Cookie:`pax_session=${login.sessionToken}`,'X-CSRF-Token':login.csrfToken});assert.equal(response.status,201);VoiceSessionStartResponseSchema.parse(response.body);
  assert.equal(portfolioCatalog().length,37);const spec=(await call('GET','/api/openapi.json')).body;assert.deepEqual(spec.paths['/api/voice/privacy'].get.security,[]);assert.ok(spec.paths['/api/cases/{caseId}/voice/sessions'].post.security.length);assert.ok(spec.components.schemas.VoiceTranscript);
  const privacy=(await call('GET','/api/privacy?locale=fr')).body;assert.equal(privacy.externalAiTransfer,true);assert.ok(privacy.display.recipients.includes('OpenAI'));
  await call('DELETE','/api/sessions/current',login.sessionToken);await settle();assert.equal(runtime.store.snapshot().cases[c.id].voiceSessions[0].closeReason,'session_revoked');assert.equal(gateway.stops.length,1);
});

test('restart interrupts unfinished persisted sessions, closes remote handles and removes handshake replay',async t=>{
  const f=await fixture(t),sid=(await f.start({messageId:'restart_start'})).voiceSession.id;await f.turn(sid,'119000');
  // initialize() is the recovery path used after the encrypted store is reopened following an unclean exit.
  await f.r.voice.initialize();await settle();const session=f.r.voice.transcript(f.agent,f.id,sid).voiceSession;assert.equal(session.closeReason,'server_restart');assert.equal(session.status,'interrupted');assert.equal(f.gateway.stops.length,1);await assert.rejects(f.start({messageId:'restart_start'}),code('VOICE_CONNECTION_NOT_REPLAYABLE'));assert.equal(f.r.voice.transcript(f.agent,f.id,sid).turns.length,1);
});
test('with resumeAfterRestart (Workers) an established call survives a restart and is still hung up at the provider later',async t=>{
  const f=await fixture(t,{resumeAfterRestart:true}),sid=(await f.start({messageId:'resume_start'})).voiceSession.id;await f.turn(sid,'119000');
  await f.r.voice.initialize();await settle();const session=f.r.voice.transcript(f.agent,f.id,sid).voiceSession;
  assert.equal(session.status,'active');assert.equal(session.closeReason,null);assert.equal(f.gateway.stops.length,0);
  await f.turn(sid,'120000');assert.equal(f.r.voice.transcript(f.agent,f.id,sid).turns.length,2);
  // The kept handle still hangs up at the provider once the session ends.
  await f.r.voice.close(f.customer,f.id,sid,{reason:'customer_closed'});await settle();assert.equal(f.gateway.stops.length,1);
});
test('failed provider starts leave an auditable failed session and cannot be blindly retried',async t=>{
  class Fails extends FakeVoiceGateway {async open(){throw new Error('private upstream key must never escape');}}
  const f=await fixture(t,{gateway:new Fails()});await assert.rejects(f.start({messageId:'failure_start'}),e=>e.code==='VOICE_PROVIDER_UNAVAILABLE'&&!e.message.includes('private'));const session=f.r.voice.list(f.customer,f.id).sessions[0];assert.equal(session.status,'failed');assert.equal(session.closeReason,'provider_failed');await assert.rejects(f.start({messageId:'failure_start'}),code('VOICE_CONNECTION_NOT_REPLAYABLE'));assert.equal(f.r.store.snapshot().cases[f.id].voiceSessions.length,1);
});
test('all direct fields yield validated proposals; a missing housing row remains an explicit structured follow-up',async()=>{
  const d=await lifeDraft(),base=incomeObservation('source'),items=[
  {fieldId:'birth_date',value:'1985-04-12',unit:'text',period:null,basis:'not_applicable'},
  {fieldId:'sex',value:'female',unit:'enum',period:null,basis:'not_applicable'},
  {fieldId:'civil_status',value:'married',unit:'enum',period:null,basis:'not_applicable',personId:undefined},
  {fieldId:'relationship_since_year',value:2015,unit:'year',period:null,basis:'not_applicable',personId:undefined},
  {fieldId:'partner_birth_year',personId:'person_demo_2',value:1987,unit:'year',period:null,basis:'not_applicable'},
  {fieldId:'partner_annual_gross_income_chf',personId:'person_demo_2',value:81000},
  {fieldId:'employment_rate_percent',value:80,unit:'percent',period:null,basis:'not_applicable'},
  {fieldId:'annual_gross_income_chf',value:119000},
  {fieldId:'has_pension_fund',value:true,unit:'boolean',period:null,basis:'not_applicable'},
  {fieldId:'pillar_3a_annual_contribution_chf',value:6258,personId:undefined,basis:'not_applicable'},
  {fieldId:'monthly_housing_cost_chf',value:2000,personId:undefined,basis:'not_applicable',period:'month'},
  {fieldId:'desired_retirement_age',value:64,unit:'year',period:null,basis:'not_applicable'},
  {fieldId:'risk_appetite',value:'medium',personId:undefined,unit:'enum',period:null,basis:'not_applicable'}
  ];
  for(const override of items){const result=mapVoiceObservations(d,[{...base,...override}],'de');assert.ok(result.changes.length>0,override.fieldId);assert.equal(result.issues.length,0,override.fieldId);}
  const empty=structuredClone(d);empty.financial.expenses=empty.financial.expenses.filter(e=>e.category!=='housing');assert.equal(mapVoiceObservations(empty,[{...base,...items[10]}],'de').issues[0].code,'TARGET_MISSING');
});

test('a language switch rejects cached connection replay before the periodic cleanup; fractional work rates retain precision',async t=>{
  const f=await fixture(t);await f.start({messageId:'locale_cached'});await f.r.engine.preferences(f.customer,f.id,{locale:'fr'});await assert.rejects(f.start({messageId:'locale_cached',locale:'de'}),code('VOICE_SESSION_NOT_ACTIVE'));assert.equal(f.gateway.opens.length,1);
  const result=mapVoiceObservations(await lifeDraft(),[incomeObservation('source',{fieldId:'employment_rate_percent',unit:'percent',period:null,basis:'not_applicable',value:80.5})],'it');assert.equal(result.changes[0].value,8050);
});

for(const action of ['close','logout','delete'])test(`${action} aborts a pending voice connection and cleans up late provider success`,async t=>{
  let release,entered,signal;const barrier=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);class Slow extends FakeVoiceGateway {async open(input,s){signal=s;entered();await barrier;return super.open(input,s);}}
  const gateway=new Slow(),f=await fixture(t,{gateway}),work=f.start(),rejected=assert.rejects(work,code('DIGITAL_TASK_CANCELLED'));await started;
  const sid=f.r.store.snapshot().cases[f.id].voiceSessions[0].id;
  if(action==='close')await f.r.voice.close(f.customer,f.id,sid,{reason:'customer_closed'});
  if(action==='logout')await f.r.sessions.revoke(f.customer);
  if(action==='delete')await f.r.store.transaction(db=>{delete db.cases[f.id];});
  await f.r.voice.sweep();assert.equal(signal.aborted,true);release();await rejected;assert.deepEqual(gateway.stops,['fake-provider-1']);
});
