import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLifeInsuranceApp} from '../apps/api/dist/insurance/app.js';
import {SyntheticTestProvider} from './helpers/life-fixture.mjs';

const credentials={customerAccessCode:'demo-customer-key-at-least-32-characters',reviewerAccessCode:'demo-reviewer-key-at-least-32-characters'};

/**
 * End to end, the way the web app's journey (features/journey) drives the backend in the demo
 * start: recommendation, simulated Pax review, quote, application, submission, simulated
 * acceptance, demo policy in the portal; dossier and documents alongside.
 */
async function demo(t,options={demoStart:true}) {
  const directory=await mkdtemp(join(tmpdir(),'pax-contract-journey-'));
  const {app}=await createLifeInsuranceApp({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials,...options});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  let cookie='',csrf='';
  async function call(method,path,body,raw=false) {
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(method==='GET'?{}:{'X-CSRF-Token':csrf})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
    return {status:r.status,headers:r.headers,body:raw?await r.text():await r.json()};
  }
  const signIn=async()=>{const s=await call('POST','/api/sessions',{accessCode:credentials.customerAccessCode});csrf=s.body.csrfToken;return s;};
  if(!options.demoStart)return {call,signIn};
  const started=await call('POST','/api/demo/start',{locale:'de'});
  assert.equal(started.status,201,JSON.stringify(started.body));
  csrf=started.body.csrfToken;
  const path=`/api/cases/${started.body.caseId}`;
  return {call,path,current:async()=>(await call('GET',path)).body};
}

const action=(c,extra)=>({expectedCaseRevision:c.caseRevision,idempotencyKey:crypto.randomUUID(),demoAcknowledged:true,informationDocumentsAcknowledged:false,...extra});

test('demo start: from the recommendation through quote and application to the demo policy in the portal',async t=>{
  const f=await demo(t);
  let summary=(await f.call('GET',`${f.path}/summaries`)).body.customer;
  let recommendation=summary.recommendations.find(r=>r.runId===summary.runId);
  assert.equal(recommendation.status,'human_review_required','a Pax specialist reviews the advice first');

  // No quote before the review.
  let c=await f.current();
  const early=await f.call('POST',`${f.path}/demo-quotes`,action(c,{recommendationId:recommendation.id,selectedCandidateIds:[recommendation.candidates[0].id]}));
  assert.equal(early.body.code,'HUMAN_REVIEW_REQUIRED');

  const advice=await f.call('POST',`${f.path}/demo-review`,{});
  assert.equal(advice.status,201,JSON.stringify(advice.body));
  assert.deepEqual(advice.body,{adviceApproved:true,applicationsAccepted:[],policiesIssued:[],simulated:true});
  summary=(await f.call('GET',`${f.path}/summaries`)).body.customer;
  recommendation=summary.recommendations.find(r=>r.runId===summary.runId);
  assert.equal(recommendation.status,'ready_for_demo');
  assert.ok(recommendation.candidates.every(x=>x.eligibility==='ready_for_demo'));
  assert.ok(recommendation.candidates.every(x=>x.explanation),'every candidate explains why');

  c=await f.current();
  const quote=await f.call('POST',`${f.path}/demo-quotes`,action(c,{recommendationId:recommendation.id,selectedCandidateIds:recommendation.candidates.map(x=>x.id)}));
  assert.equal(quote.status,201,JSON.stringify(quote.body));
  assert.equal(quote.body.premiumCents,null,'no tariff: no premium is invented');
  assert.ok(quote.body.documents.length>0);

  c=await f.current();
  const unread=await f.call('POST',`${f.path}/demo-applications`,action(c,{quoteId:quote.body.id,informationDocumentsAcknowledged:true,acknowledgedDocumentIds:[]}));
  assert.equal(unread.body.code,'INFORMATION_ACKNOWLEDGEMENT_REQUIRED','every product document must be acknowledged');
  const documentIds=quote.body.documents.map(d=>d.id);
  const application=await f.call('POST',`${f.path}/demo-applications`,action(c,{quoteId:quote.body.id,informationDocumentsAcknowledged:true,acknowledgedDocumentIds:documentIds}));
  assert.equal(application.status,201,JSON.stringify(application.body));
  assert.equal(application.body.status,'draft');

  c=await f.current();
  const submitted=await f.call('POST',`${f.path}/demo-applications/submit`,action(c,{applicationId:application.body.id,informationDocumentsAcknowledged:true,acknowledgedDocumentIds:documentIds}));
  assert.equal(submitted.status,201,JSON.stringify(submitted.body));
  assert.equal(submitted.body.status,'submitted');

  const decision=await f.call('POST',`${f.path}/demo-review`,{});
  assert.equal(decision.status,201,JSON.stringify(decision.body));
  assert.deepEqual(decision.body.applicationsAccepted,[application.body.id]);
  assert.equal(decision.body.policiesIssued.length,1);
  assert.equal(decision.body.adviceApproved,false,'the advice was already approved');

  const portal=(await f.call('GET',`${f.path}/portal`)).body;
  assert.equal(portal.applications[0].status,'accepted_for_demo');
  assert.ok(portal.applications[0].statusLabel);
  assert.equal(portal.policies.length,1);
  assert.equal(portal.policies[0].coverageInForce,false);
  assert.equal(portal.realInsuranceCoverage,false);
  assert.deepEqual(portal.complianceSteps.map(s=>s.id),['identification','aml_check','health_declaration','signature']);

  const again=await f.call('POST',`${f.path}/demo-review`,{});
  assert.deepEqual(again.body,{adviceApproved:false,applicationsAccepted:[],policiesIssued:[],simulated:true},'nothing pending changes nothing');

  // Documentation for the customer: the dossier and the acknowledged product documents.
  const dossier=await f.call('GET',`${f.path}/dossier?audience=customer&format=html`,undefined,true);
  assert.equal(dossier.status,200);
  assert.match(dossier.headers.get('content-type'),/text\/html/);
  const document=await f.call('GET',`${f.path}/documents/${documentIds[0]}`,undefined,true);
  assert.equal(document.status,200);
  assert.match(document.headers.get('content-type'),/application\/pdf/);
  assert.match(document.headers.get('x-document-sha256'),/^[a-f0-9]{64}$/);
});

test('the simulated review exists only in the demo start',async t=>{
  const f=await demo(t,{demoStart:false});
  const session=await f.signIn();
  assert.equal(session.status,201);
  assert.equal((await f.call('POST',`/api/cases/${crypto.randomUUID()}/demo-review`,{})).status,404);
});
