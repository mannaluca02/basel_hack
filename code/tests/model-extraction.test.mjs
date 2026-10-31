import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ModelExtractionNoticeSchema,ModelExtractionPermissionSchema,InsuranceCaseDtoSchema} from '@pax/contracts';
import {createLifeRuntime} from '../apps/api/dist/insurance/runtime.js';
import {createLifeInsuranceApp} from '../apps/api/dist/insurance/app.js';
import {localizedCase} from '../apps/api/dist/insurance/i18n.js';
import {lifeDraft,SyntheticTestProvider} from './helpers/life-fixture.mjs';

const credentials={customerAccessCode:'synthetic-extraction-customer-key-32-chars',reviewerAccessCode:'synthetic-extraction-reviewer-key-32-chars'};
const code=expected=>e=>e.code===expected;
async function fixture(t,{enabled=true}={}){
 const directory=await mkdtemp(join(tmpdir(),'pax-model-extraction-'));
 const r=await createLifeRuntime({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials,modelExtraction:{enabled}});
 t.after(async()=>{await r.close();await rm(directory,{recursive:true,force:true});});
 const customer=r.sessions.authenticate((await r.sessions.login(credentials.customerAccessCode,'extraction-test')).sessionToken);
 let c=await r.engine.createCase(customer,{locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v1',dataClassification:'synthetic'});
 c=await r.engine.patchDraft(customer,c.id,{...(await lifeDraft()),expectedCaseRevision:c.caseRevision});
 const agent=r.sessions.authenticate((await r.sessions.agentToken(customer,c.id)).sessionToken),get=()=>r.engine.caseFor(customer,c.id);
 const notice=r.modelExtraction.notice('de');
 const consent=(extra={})=>r.modelExtraction.consent(customer,c.id,{expectedCaseRevision:get().caseRevision,noticeVersion:notice.version,noticeHash:notice.noticeHash,dataClassification:'synthetic',allowSyntheticModelExtraction:true,...extra});
 return {r,customer,agent,id:c.id,get,notice,consent};
}

test('model extraction is disabled by default and the public notice never claims an external AI transfer then',async t=>{
 const f=await fixture(t,{enabled:false});assert.equal(f.notice.enabled,false);
 await assert.rejects(f.consent(),code('MODEL_EXTRACTION_DISABLED'));assert.throws(()=>f.r.modelExtraction.assertTransferAllowed(f.agent,f.id),code('MODEL_EXTRACTION_DISABLED'));
 const p=ModelExtractionPermissionSchema.parse(f.r.modelExtraction.permission(f.customer,f.id));assert.equal(p.transferAllowed,false);assert.equal(p.blockedReason,'disabled');
});
test('notice names OpenAI, the invented minimal projection and its limits consistently in all four languages',async t=>{
 const f=await fixture(t);const hashes=new Set();
 for(const locale of ['de','fr','it','en']){const n=ModelExtractionNoticeSchema.parse(f.r.modelExtraction.notice(locale));hashes.add(n.noticeHash);
  assert.equal(n.locale,locale);assert.ok(n.text.includes('OpenAI'));assert.ok(n.text.includes('Logismata'));assert.ok(n.text.length>300);
  assert.equal(n.fullCaseTransferAuthorized,false);assert.equal(n.resultIsProposalOnly,true);assert.deepEqual(n.payloadScope,['invented_conversation_excerpt','pseudonymous_person_id','relevant_field_values_with_unit_and_income_basis','allowed_target_paths','related_clarifications']);}
 assert.equal(hashes.size,1);
 // The full extractor context keeps its policy; only Earnie's minimal projection is covered by this notice.
 assert.equal(f.r.extraction.context(f.agent,f.id).policy.noExternalAiTransferAuthorized,true);
});
test('only the customer grants consent for the current notice hash; the agent gate follows it and the case DTO stays clean',async t=>{
 const f=await fixture(t);assert.throws(()=>f.r.modelExtraction.assertTransferAllowed(f.agent,f.id),code('MODEL_EXTRACTION_CONSENT_REQUIRED'));
 await assert.rejects(f.r.modelExtraction.consent(f.agent,f.id,{}),code('FORBIDDEN'));
 await assert.rejects(f.consent({noticeHash:'0'.repeat(64)}),code('MODEL_EXTRACTION_NOTICE_CHANGED'));
 await assert.rejects(f.consent({allowSyntheticModelExtraction:false}));await assert.rejects(f.consent({dataClassification:'real'}));
 await assert.rejects(f.consent({expectedCaseRevision:f.get().caseRevision+1}),code('VERSION_CONFLICT'));
 const before=f.get().caseRevision,p=ModelExtractionPermissionSchema.parse(await f.consent());
 assert.equal(p.transferAllowed,true);assert.equal(p.consent.noticeHash,f.notice.noticeHash);assert.equal(f.get().caseRevision,before+1);
 assert.equal(f.r.modelExtraction.assertTransferAllowed(f.agent,f.id).transferAllowed,true);
 assert.throws(()=>f.r.modelExtraction.assertTransferAllowed(f.customer,f.id),code('FORBIDDEN'));
 const dto=InsuranceCaseDtoSchema.parse(localizedCase(f.get()));assert.equal('modelExtractionConsent'in dto,false);
 const reviewer=f.r.sessions.authenticate((await f.r.sessions.login(credentials.reviewerAccessCode,'reviewer')).sessionToken);assert.throws(()=>f.r.modelExtraction.permission(reviewer,f.id),code('FORBIDDEN'));
});
test('a stored consent for older notice content no longer authorizes transfer',async t=>{
 const f=await fixture(t);await f.consent();
 await f.r.store.transaction(db=>{db.cases[f.id].modelExtractionConsent.noticeHash='1'.repeat(64);});
 const p=f.r.modelExtraction.permission(f.customer,f.id);assert.equal(p.blockedReason,'notice_changed');assert.equal(p.transferAllowed,false);
 assert.throws(()=>f.r.modelExtraction.assertTransferAllowed(f.agent,f.id),code('MODEL_EXTRACTION_CONSENT_REQUIRED'));
 await f.consent();assert.equal(f.r.modelExtraction.permission(f.agent,f.id).transferAllowed,true);
});
test('human handover stops the model gate; the customer can still revoke during handover',async t=>{
 const f=await fixture(t);await f.consent();
 await f.r.handover.command(f.customer,f.id,{action:'request',messageId:'handover_extraction',source:'ui',expectedCaseRevision:f.get().caseRevision});
 assert.throws(()=>f.r.modelExtraction.assertTransferAllowed(f.agent,f.id),code('HUMAN_HANDOVER_ACTIVE'));
 assert.equal(f.r.modelExtraction.permission(f.customer,f.id).blockedReason,'human_handover_active');
 await assert.rejects(f.consent(),code('HUMAN_HANDOVER_ACTIVE'));
 const revoked=await f.r.modelExtraction.revoke(f.customer,f.id,{expectedCaseRevision:f.get().caseRevision});assert.equal(revoked.consent,null);assert.equal(revoked.blockedReason,'consent_missing');
 const revision=f.get().caseRevision;await f.r.modelExtraction.revoke(f.customer,f.id,{expectedCaseRevision:revision});assert.equal(f.get().caseRevision,revision);
});
test('HTTP privacy notice lists the extraction recipient only when enabled and consent uses the protected case route',async t=>{
 for(const enabled of [false,true]){
  const directory=await mkdtemp(join(tmpdir(),'pax-model-extraction-http-'));
  const {app}=await createLifeInsuranceApp({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials,modelExtraction:{enabled}});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  const call=async(method,path,token,body)=>{const res=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};};
  for(const locale of ['de','fr','it','en']){const p=(await call('GET',`/api/privacy?locale=${locale}`)).body;
   assert.equal(p.externalAiTransfer,enabled);assert.equal(p.optionalModelExtraction.enabled,enabled);assert.equal(p.display.recipients.includes(p.optionalModelExtraction.text),enabled);
   assert.equal(p.recipients.some(r=>r.includes('intake extraction')),enabled);}
  const notice=(await call('GET','/api/extraction/privacy?locale=fr')).body;assert.equal(notice.locale,'fr');
  const token=(await call('POST','/api/sessions',null,{accessCode:credentials.customerAccessCode})).body.sessionToken;
  const c=(await call('POST','/api/cases',token,{locale:'de',timeBudgetMinutes:5,noticeVersion:'lifemap-synthetic-v1',dataClassification:'synthetic'})).body;
  const granted=await call('POST',`/api/cases/${c.id}/extraction/consent`,token,{expectedCaseRevision:c.caseRevision,noticeVersion:notice.version,noticeHash:notice.noticeHash,dataClassification:'synthetic',allowSyntheticModelExtraction:true});
  if(!enabled){assert.equal(granted.status,503);assert.equal(granted.body.code,'MODEL_EXTRACTION_DISABLED');continue;}
  assert.equal(granted.status,201);assert.equal(granted.body.transferAllowed,true);
  assert.equal((await call('GET',`/api/cases/${c.id}/extraction/consent`,token)).body.transferAllowed,true);
  const revoked=await call('POST',`/api/cases/${c.id}/extraction/consent/revoke`,token,{expectedCaseRevision:granted.body.caseRevision});assert.equal(revoked.body.blockedReason,'consent_missing');
 }
});
