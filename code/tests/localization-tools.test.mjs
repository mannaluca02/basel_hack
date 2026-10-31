import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLifeInsuranceApp} from '../apps/api/dist/insurance/app.js';
import {lifeDraft,SyntheticTestProvider} from './helpers/life-fixture.mjs';
import {Operations} from '../apps/api/dist/logismata/contracts.js';
import {normalizeResponse} from '../apps/api/dist/logismata/normalize.js';
import {AdditionalMoneyFields,AdditionalOperations} from '../apps/api/dist/insurance/tools.js';

const credentials={customerAccessCode:'localization-customer-access-at-least-32',reviewerAccessCode:'localization-reviewer-access-at-least-32'};
let app,runtime,base,directory,token;
const provider=new SyntheticTestProvider();
async function call(method,path,body,headers={},auth=token){
  const r=await fetch(base+path,{method,headers:{...(auth?{Authorization:`Bearer ${auth}`} : {}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:r.status,body:r.headers.get('content-type')?.includes('application/json')?await r.json():await r.text(),headers:r.headers};
}
before(async()=>{
  directory=await mkdtemp(join(tmpdir(),'pax-i18n-tools-'));({app,runtime}=await createLifeInsuranceApp({dataDirectory:directory,provider,providerMode:'test',credentials}));
  await app.listen(0,'127.0.0.1');base=await app.getUrl();token=(await call('POST','/api/sessions',{accessCode:credentials.customerAccessCode},{},null)).body.sessionToken;
});
after(async()=>{await app?.close();await rm(directory,{recursive:true,force:true});});
async function newCase(locale='de',complete=false){
  let response=await call('POST','/api/cases',{locale,timeBudgetMinutes:5,noticeVersion:'lifemap-synthetic-v1',dataClassification:'synthetic'});assert.equal(response.status,201);let c=response.body;
  if(complete){c=(await call('PATCH',`/api/cases/${c.id}/draft`,{...(await lifeDraft()),expectedCaseRevision:c.caseRevision})).body;
    c=(await call('POST',`/api/cases/${c.id}/confirmations`,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v1'})).body;}
  return c;
}
async function analyze(c){const result=await call('POST',`/api/cases/${c.id}/calculations`,{expectedCaseRevision:c.caseRevision,expectedProfileVersion:1,scenarioVersionId:'locale_baseline',scenario:{kind:'baseline'}});assert.equal(result.status,201);return result.body;}
const archive=async op=>JSON.parse(await readFile(new URL(`../../documentation/baselhack/references/api/examples/${Operations[op].archive}.json`,import.meta.url),'utf8'));
async function toolInput(op,c){const request=structuredClone((await archive(op)).request);delete request.Language;
  for(const name of AdditionalMoneyFields[op])if(typeof request[name]==='number')request[name]=Math.round(request[name]*100);
  return {operation:op,request,requestUnits:'CHF_CENTS',expectedCaseRevision:c.caseRevision,noticeVersion:'lifemap-synthetic-v1',allowSyntheticCalculatorTransfer:true};}

test('translation catalogs cover identical customer keys in all four languages with no fallback',async()=>{
  const catalogs=[];
  for(const locale of ['de','fr','it','en']){
    const r=await call('GET',`/api/translations?locale=${locale}`,undefined,{},null);assert.equal(r.status,200);
    assert.equal(r.body.locale,locale);assert.equal(r.body.fallbackUsed,false);assert.equal(r.body.legalDocuments.automaticallyTranslated,false);
    assert.ok(Object.keys(r.body.messages).length>=180);assert.ok(Object.values(r.body.messages).every(x=>typeof x==='string'&&x.trim().length));catalogs.push(r.body);
  }
  for(const c of catalogs)assert.deepEqual(Object.keys(c.messages),Object.keys(catalogs[0].messages));
  assert.match(catalogs[1].messages['common.demo'],/AUCUNE COUVERTURE/);
  assert.match(catalogs[2].messages['common.demo'],/NESSUNA COPERTURA/);
  assert.match(catalogs[3].messages['common.demo'],/NO INSURANCE COVER/);
});
test('processing notice and safe error messages respect locale before authentication',async()=>{
  for(const locale of ['de','fr','it','en']){
    const privacy=await call('GET','/api/privacy',undefined,{'Accept-Language':locale+'-CH'},null);assert.equal(privacy.body.locale,locale);assert.ok(privacy.body.display.storage);
    const error=await call('GET','/api/cases',undefined,{'Accept-Language':locale+'-CH'},null);assert.equal(error.status,401);assert.equal(error.body.code,'UNAUTHORIZED');assert.equal(error.body.locale,locale);assert.equal(error.headers.get('content-language'),locale);
    assert.notEqual(error.body.message,'UNAUTHORIZED');
  }
  assert.equal((await call('GET','/api/translations?locale=es',undefined,{},null)).status,400);
});
for(const [locale,language] of [['de',1],['fr',2],['it',3],['en',4]]){
  test(`${locale}: follow-ups, budget request, recommendation and both dossier views are localized`,async()=>{
    let c=await newCase(locale);const questions=await call('GET',`/api/cases/${c.id}/questions`);
    const translations=(await call('GET',`/api/translations?locale=${locale}`,undefined,{},null)).body.messages;
    assert.equal(questions.body.questions[0].text,translations['question.goals']);
    c=(await call('PATCH',`/api/cases/${c.id}/draft`,{...(await lifeDraft()),expectedCaseRevision:c.caseRevision})).body;
    c=(await call('POST',`/api/cases/${c.id}/confirmations`,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v1'})).body;
    const start=provider.calls.length;const analysis=await analyze(c);assert.equal(analysis.presentation.locale,locale);
    assert.equal(provider.calls.slice(start).find(c=>c.operation==='budgetProposal').request.Language,language);
    const rec=await call('POST',`/api/cases/${c.id}/recommendations`,{});assert.equal(rec.body.locale,locale);
    assert.ok(rec.body.candidates.every(c=>c.conditions[0]===translations['common.noPremium']&&c.explanation.length>20));
    for(const audience of ['customer','advisor']){
      const result=await call('GET',`/api/cases/${c.id}/dossier?format=html&audience=${audience}`);
      assert.equal(result.status,200);assert.match(result.body,new RegExp(`<html lang="${locale}">`));assert.ok(result.body.includes(translations['common.demo']));
      assert.ok(result.body.includes(translations['common.assumptions']));assert.ok(!result.body.includes('Flows are annualized snapshot'));
    }
    const summary=(await call('GET',`/api/cases/${c.id}/summaries`)).body;
    assert.equal(summary.customer.snapshotId,summary.advisor.snapshotId);assert.equal(summary.customer.locale,locale);
    assert.deepEqual(summary.customer.metrics,analysis.run.local.metrics);
  });
}
test('switching language retains run, profile, input hash and candidate identities',async()=>{
  const c=await newCase('de',true);const analysis=await analyze(c);const rec=(await call('POST',`/api/cases/${c.id}/recommendations`,{})).body;
  const beforeCalls=provider.calls.length;
  for(const locale of ['fr','it','en','de']){
    const change=await call('PATCH',`/api/cases/${c.id}/preferences`,{locale});assert.equal(change.status,200);
    const context=(await call('GET',`/api/cases/${c.id}/advisor/context`)).body;
    assert.equal(context.locale,locale);assert.equal(context.runId,analysis.run.id);assert.equal(context.profileVersion,1);assert.equal(context.calculationInputHash,analysis.run.inputHash);
    const localized=(await call('POST',`/api/cases/${c.id}/recommendations`,{})).body;
    assert.equal(localized.id,rec.id);assert.deepEqual(localized.candidates.map(c=>[c.id,c.needAmountCents,c.premiumCents]),rec.candidates.map(c=>[c.id,c.needAmountCents,c.premiumCents]));
  }
  assert.equal(provider.calls.length,beforeCalls);
});
test('all 24 declared provider operations have one exact archived reference',async()=>{
  assert.equal(Object.keys(Operations).length,24);assert.equal(new Set(Object.values(Operations).map(o=>o.archive)).size,24);
  const source=JSON.parse(await readFile(new URL('../../documentation/baselhack/references/api/openapi/schema-index.json',import.meta.url),'utf8'));
  assert.deepEqual(Object.values(Operations).map(o=>o.id).sort(),source.operations.map(o=>o.operationId).sort());
});
test('all eight extra calculators are protected opt-in estimates and leave the financial run unchanged',async()=>{
  let c=await newCase('fr',true);const analysis=await analyze(c);const path=`/api/cases/${c.id}/calculator-tools`;
  const list=await call('GET',path);assert.equal(list.body.length,8);
  for(const op of AdditionalOperations){
    c=(await call('GET',`/api/cases/${c.id}`)).body;const input=await toolInput(op,c);
    const r=await call('POST',path,input);assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.operation,op);assert.equal(r.body.scope,'isolated_calculator_estimate');assert.equal(r.body.profileMutated,false);
    if(op==='inheritanceAll'){
      const sent=provider.calls.findLast(c=>c.operation===op);assert.equal(sent.request.Amount,100000);
      assert.ok(r.body.result.metrics.every(m=>m.period==='once'));assert.equal(r.body.result.status,'requires_review');
    }
    if(op==='searchLocationGeo')assert.equal(provider.calls.findLast(c=>c.operation===op).request.Language,2);
  }
  const current=(await call('GET',`/api/cases/${c.id}`)).body;assert.equal(current.toolRuns.length,8);assert.equal(current.activeRunId,analysis.run.id);
  assert.equal(current.runs.find(r=>r.id===analysis.run.id).inputHash,analysis.run.inputHash);assert.deepEqual(current.runs[0].local.metrics,analysis.run.local.metrics);
});
test('extra tools reject missing consent, wrong units, fractional cents and unknown operations before provider calls',async()=>{
  const c=await newCase();const body=await toolInput('inheritanceAll',c),path=`/api/cases/${c.id}/calculator-tools`;const before=provider.calls.length;
  for(const bad of [{...body,allowSyntheticCalculatorTransfer:false},{...body,requestUnits:'CHF'},{...body,request:{...body.request,Amount:0.5}},{...body,operation:'https://example.com'}])assert.equal((await call('POST',path,bad)).status,400);
  const other=(await call('POST','/api/sessions',{accessCode:credentials.customerAccessCode},{},null)).body.sessionToken;
  assert.equal((await call('POST',path,body,{},other)).status,404);assert.equal(provider.calls.length,before);
});
test('inheritance results keep beneficiary alternatives separate and reject mismatched beneficiaries',async()=>{
  const a=await archive('inheritanceGroup');const bad=structuredClone(a.response);bad.response[0].Group=800;
  assert.throws(()=>normalizeResponse('inheritanceGroup',a.request,bad),/Unexpected beneficiary/);
  const good=normalizeResponse('inheritanceGroup',a.request,a.response);
  assert.equal(good.metrics.find(m=>m.id==='beneficiary_305_InheritanceTaxes').value,2205000);
  assert.ok(!good.metrics.some(m=>m.id==='totalInheritanceTaxes'));
});
