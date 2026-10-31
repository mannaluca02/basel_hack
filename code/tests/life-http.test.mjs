import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLifeInsuranceApp } from '../apps/api/dist/insurance/app.js';
import { lifeDraft,SyntheticTestProvider } from './helpers/life-fixture.mjs';

const credentials={customerAccessCode:'http-customer-key-at-least-32-characters',reviewerAccessCode:'http-reviewer-key-at-least-32-characters'};
let app,runtime,base,directory,customer,reviewer;
async function request(method,path,token,body,headers={}) {
  const response=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,headers:response.headers,body:await response.json()};
}
before(async()=>{
  directory=await mkdtemp(join(tmpdir(),'pax-life-http-'));({app,runtime}=await createLifeInsuranceApp({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials}));
  await app.listen(0,'127.0.0.1');base=await app.getUrl();
  customer=(await request('POST','/api/sessions',null,{accessCode:credentials.customerAccessCode})).body;
  reviewer=(await request('POST','/api/sessions',null,{accessCode:credentials.reviewerAccessCode})).body;
});
after(async()=>{await app?.close();await rm(directory,{recursive:true,force:true});});
async function newCase(locale='de') {
  const response=await request('POST','/api/cases',customer.sessionToken,{locale,timeBudgetMinutes:5,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'});
  assert.equal(response.status,201);return response.body;
}
async function confirmedCase() {
  let c=await newCase();c=(await request('PATCH',`/api/cases/${c.id}/draft`,customer.sessionToken,{...(await lifeDraft()),expectedCaseRevision:c.caseRevision})).body;
  const result=await request('POST',`/api/cases/${c.id}/confirmations`,customer.sessionToken,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v2'});
  assert.equal(result.status,201);return result.body;
}
test('public processing notice precedes data capture and reports live capabilities without credentials',async()=>{
  const p=await request('GET','/api/privacy');assert.equal(p.body.dataMode,'synthetic_only');
  assert.equal(p.body.version,'lifemap-synthetic-v2');assert.equal(p.body.externalAiTransfer,false);
  for(const locale of ['de','fr','it','en']){
    const {recipients}=(await request('GET',`/api/privacy?locale=${locale}`)).body.display;
    assert.doesNotMatch(recipients,/OpenAI/);assert.match(recipients,/Logismata/);
    assert.doesNotMatch(recipients,/keine externen KI-Modelle aufgerufen|Aucun modèle d’IA externe n’est appelé|Non sono chiamati modelli di IA esterni|No external AI models are called/);
  }
  const status=await request('GET','/api/status');assert.equal(status.body.realCoverageCanBeActivated,false);assert.equal(status.body.operations.length,24);
  assert.ok(!JSON.stringify(status.body).includes('accessCode'));
});
test('case creation requires the current base processing notice',async()=>{
  const stale=await request('POST','/api/cases',customer.sessionToken,{locale:'de',timeBudgetMinutes:5,noticeVersion:'lifemap-synthetic-v1',dataClassification:'synthetic'});
  assert.equal(stale.status,400);
});
test('case routes require authentication and do not accept a customer role override',async()=>{
  assert.equal((await request('GET','/api/cases')).status,401);
  const c=await newCase();const result=await request('PATCH',`/api/cases/${c.id}/draft`,customer.sessionToken,{expectedCaseRevision:c.caseRevision,role:'reviewer'});
  assert.equal(result.status,400);
});
test('HTTP cookie session survives page reload but unsafe requests require the CSRF token',async()=>{
  const login=await request('POST','/api/sessions',null,{accessCode:credentials.customerAccessCode});
  const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
  const headers={Cookie:cookie.split(';')[0],Origin:'http://localhost:4200'};
  const body={locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'};
  assert.equal((await request('POST','/api/cases',null,body,headers)).status,403);
  const okay=await request('POST','/api/cases',null,body,{...headers,'X-CSRF-Token':login.body.csrfToken});assert.equal(okay.status,201);
  assert.equal((await request('GET',`/api/cases/${okay.body.id}`,null,undefined,headers)).status,200);
});
test('customers cannot access another customer case or its PDF documents',async()=>{
  const c=await newCase();const other=(await request('POST','/api/sessions',null,{accessCode:credentials.customerAccessCode})).body;
  assert.equal((await request('GET',`/api/cases/${c.id}`,other.sessionToken)).status,404);
  const response=await fetch(`${base}/api/cases/${c.id}/documents/term_terms`,{headers:{Authorization:`Bearer ${other.sessionToken}`}});assert.equal(response.status,404);
});
test('real customer mode and raw health fields are rejected by the runtime boundary',async()=>{
  const mode=await request('POST','/api/cases',customer.sessionToken,{locale:'de',timeBudgetMinutes:5,noticeVersion:'lifemap-synthetic-v2',dataClassification:'customer'});assert.equal(mode.status,400);
  const c=await newCase();const health=await request('PATCH',`/api/cases/${c.id}/draft`,customer.sessionToken,{expectedCaseRevision:c.caseRevision,medicalHistory:'do-not-reflect-private-health'});
  assert.equal(health.status,400);assert.ok(!JSON.stringify(health.body).includes('do-not-reflect-private-health'));
});
test('HTTP end-to-end flow reaches a persisted, explicitly non-binding demo policy',async()=>{
  let c=await confirmedCase();const path=`/api/cases/${c.id}`;
  const analysis=await request('POST',`${path}/calculations`,customer.sessionToken,{expectedCaseRevision:c.caseRevision,expectedProfileVersion:1,scenarioVersionId:'baseline_v1',scenario:{kind:'baseline'}});
  assert.equal(analysis.status,201);assert.equal(analysis.body.run.status,'current');
  const rec=await request('POST',`${path}/recommendations`,customer.sessionToken,{});assert.equal(rec.status,201);
  c=(await request('GET',path,customer.sessionToken)).body;
  const task=c.reviewTasks.at(-1);
  const approve=await request('POST',`${path}/review-decisions`,reviewer.sessionToken,{runId:analysis.body.run.id,decision:'approved_for_demo',acknowledgedReasonCodes:task.reasons,
    criteria:['data_sources_checked','need_and_units_checked','beneficiaries_checked','personal_affordability_checked','demo_only_understood']});assert.equal(approve.status,201);
  const action=async(key,extra={})=>{const c=(await request('GET',path,customer.sessionToken)).body;return {expectedCaseRevision:c.caseRevision,idempotencyKey:key,demoAcknowledged:true,informationDocumentsAcknowledged:true,...extra};};
  const q=await request('POST',`${path}/demo-quotes`,customer.sessionToken,await action('q',{recommendationId:rec.body.id,selectedCandidateIds:[rec.body.candidates[0].id]}));assert.equal(q.status,201);
  const docs=q.body.documents.map(d=>d.id);
  const app=await request('POST',`${path}/demo-applications`,customer.sessionToken,await action('app',{quoteId:q.body.id,acknowledgedDocumentIds:docs}));assert.equal(app.status,201);
  const submit=await request('POST',`${path}/demo-applications/submit`,customer.sessionToken,await action('submit',{applicationId:app.body.id,acknowledgedDocumentIds:docs}));assert.equal(submit.body.status,'submitted');
  const start=await request('POST',`${path}/demo-applications/start-review`,reviewer.sessionToken,await action('review',{applicationId:app.body.id}));assert.equal(start.body.status,'under_review');
  c=(await request('GET',path,customer.sessionToken)).body;
  const decision=await request('POST',`${path}/demo-applications/decisions`,reviewer.sessionToken,{expectedCaseRevision:c.caseRevision,applicationId:app.body.id,idempotencyKey:'decision',decision:'accepted_for_demo',
    demoChecks:{identity:'demo_only',health:'not_underwritten',aml:'not_cleared_for_real_business',information:true}});assert.equal(decision.body.status,'accepted_for_demo');
  const policy=await request('POST',`${path}/demo-policies`,reviewer.sessionToken,await action('policy',{applicationId:app.body.id}));assert.equal(policy.status,201);assert.equal(policy.body.coverageInForce,false);
  const portal=await request('GET',`${path}/portal`,customer.sessionToken);assert.equal(portal.body.policies[0].id,policy.body.id);
  const dossier=await request('GET',`${path}/summaries`,customer.sessionToken);assert.equal(dossier.body.customer.snapshotId,dossier.body.advisor.snapshotId);
  const pdf=await fetch(`${base}${path}/documents/term_terms`,{headers:{Authorization:`Bearer ${customer.sessionToken}`}});assert.equal(pdf.headers.get('content-type'),'application/pdf');assert.match(pdf.headers.get('x-document-sha256'),/^[a-f0-9]{64}$/);
});
test('SSE supplies context references, updates after tempo changes, and closes on revocation',async()=>{
  const session=(await request('POST','/api/sessions',null,{accessCode:credentials.customerAccessCode})).body;
  const c=(await request('POST','/api/cases',session.sessionToken,{locale:'de',timeBudgetMinutes:5,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'})).body;
  const controller=new AbortController();
  const stream=await fetch(`${base}/api/cases/${c.id}/advisor/events`,{headers:{Authorization:`Bearer ${session.sessionToken}`},signal:controller.signal});assert.equal(stream.status,200);
  const reader=stream.body.getReader();const first=new TextDecoder().decode((await reader.read()).value);assert.match(first,/advisor.context.updated/);assert.ok(!first.includes('grossAnnualIncome'));
  await request('PATCH',`/api/cases/${c.id}/preferences`,session.sessionToken,{timeBudgetMinutes:20});
  let message='';for(let i=0;i<6&&!message.includes('conversation_preference_changed');i++)message+=new TextDecoder().decode((await reader.read()).value);
  assert.match(message,/refresh_before_next_turn/);
  assert.equal((await request('DELETE','/api/sessions/current',session.sessionToken)).status,200);
  const timeout=setTimeout(()=>controller.abort(),2000);
  try {assert.equal((await reader.read()).done,true);}finally{clearTimeout(timeout);controller.abort();await reader.cancel().catch(()=>{});}
});
test('OpenAPI exposes runtime request schemas and private financial data stays protected',async()=>{
  const spec=await request('GET','/api/openapi.json');assert.equal(spec.status,200);assert.equal(spec.body.openapi,'3.1.0');
  const resolve=ref=>ref.slice(2).split('/').reduce((o,k)=>o[k.replace(/~1/g,'/').replace(/~0/g,'~')],spec.body);
  const requestSchema=spec.body.paths['/api/cases/{caseId}/calculations'].post.requestBody.content['application/json'].schema;
  assert.ok(resolve(requestSchema.$ref).properties.scenario);
  const walk=value=>{if(!value||typeof value!=='object')return;if(value.$ref?.startsWith('#/'))assert.ok(resolve(value.$ref),value.$ref);for(const child of Object.values(value))walk(child);};
  walk(spec.body);
  assert.equal((await request('GET','/api/insights',customer.sessionToken)).status,403);
});
test('malformed payloads, oversized bodies and disallowed origins return controlled errors',async()=>{
  const bad=await fetch(`${base}/api/sessions`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"accessCode":"do-not-echo"'});assert.equal(bad.status,400);assert.ok(!(await bad.text()).includes('do-not-echo'));
  const large=await request('POST','/api/sessions',null,{accessCode:'x'.repeat(250000)});assert.equal(large.status,413);
  const origin=await request('POST','/api/sessions',null,{accessCode:credentials.customerAccessCode},{Origin:'https://example.com'});assert.equal(origin.status,403);
});
