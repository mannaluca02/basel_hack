import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { ReplayProvider,LiveLogismataProvider,providerInputHash } from '../apps/api/dist/logismata/client.js';
import { normalizeResponse } from '../apps/api/dist/logismata/normalize.js';
import { Operations } from '../apps/api/dist/logismata/contracts.js';

const archiveDir=new URL('../../documentation/baselhack/references/api/examples/',import.meta.url);
const archive=async name=>JSON.parse(await readFile(new URL(`${name}.json`,archiveDir),'utf8'));
const risk=await archive('risiko-check');const pension=await archive('pensionierungs-check');
const limits={response:{Max3aSaving:7258,Max3aSavingWithoutP2:36288}};
const response=()=>Response.json(limits);
const options={token:'server-only-test-token',now:()=>new Date('2026-10-31T12:00:00Z')};

test('all 24 source examples remain identifiable synthetic archives, not live test calls',async()=> {
  const names=(await readdir(archiveDir)).filter(n=>n.endsWith('.json'));assert.equal(names.length,24);
  for(const name of names){const x=JSON.parse(await readFile(new URL(name,archiveDir),'utf8'));assert.match(x.dataset,/synthetic/);assert.ok(Object.hasOwn(x,'request'));assert.ok(Object.hasOwn(x,'response'));}
});
test('all implemented operations replay their exact archive with provenance',async()=> {
  const replay=await ReplayProvider.load();
  for(const op of Object.keys(Operations)) {
    const r=await replay.execute(op,replay.exampleRequest(op));assert.equal(r.provenance.mode,'replay');assert.equal(r.provenance.capturedAt,'2026-10-30');
    assert.ok(r.metrics.length>0||Object.keys(r.metadata).length>0);
  }
});
test('replay fails for changed financial inputs and accepts equivalent JSON key order',async()=> {
  const replay=await ReplayProvider.load();const req=replay.exampleRequest('retirement');req.Saving++;
  await assert.rejects(replay.execute('retirement',req),e=>e.code==='REPLAY_MISS');
  const original=replay.exampleRequest('retirement');const reordered=Object.fromEntries(Object.entries(original).reverse());
  assert.equal(providerInputHash('retirement',original),providerInputHash('retirement',reordered));
  assert.equal((await replay.execute('retirement',reordered)).status,'valid');
});
test('archived risk code 0 stays under review and missing need withholds gaps',()=> {
  const r=normalizeResponse('risk',risk.request,risk.response);assert.equal(r.status,'requires_review');
  assert.ok(r.metrics.filter(m=>m.id.endsWith('_gap')).every(m=>m.value===null));
  assert.ok(r.issues.some(i=>i.code==='RISK_NEED_UNKNOWN'));
});
test('risk with code 1 and explicitly consistent needs preserves provider totals including partner',()=> {
  const req=structuredClone(risk.request);req.Person1.NeedDisability=80000;req.Person1.NeedDeath=80000;
  const body=structuredClone(risk.response);
  for(const row of body.response.RiskScenarioSummaries){row.ErrorCode=1;row.IncomeNeed=80000;row.IncomeGap=Math.max(0,80000-row.IncomeTotal);row.IncomeSurplus=Math.max(0,row.IncomeTotal-80000);}
  body.response.RiskScenarioSummaries[0].IncomePartner=10000;body.response.RiskScenarioSummaries[0].IncomePillar2-=10000;
  const r=normalizeResponse('risk',req,body);assert.equal(r.status,'valid');
  assert.equal(r.metrics.find(m=>m.id==='risk_1_incomeTotal').value,6926800);
});
test('retirement code 1 is independently valid and does not inherit the risk-code exception',()=> {
  const r=normalizeResponse('retirement',pension.request,pension.response);assert.equal(r.status,'valid');
  assert.equal(r.metrics.find(m=>m.id==='IncomeTotal').value,9600000);
  assert.equal(r.metrics.find(m=>m.id==='AvailableFortune').period,'once');
});
test('missing risk scenarios cannot be presented as a complete valid calculation',()=> {
  const body=structuredClone(risk.response);body.response.RiskScenarioSummaries.pop();
  const r=normalizeResponse('risk',risk.request,body);assert.ok(r.issues.some(i=>i.code==='RISK_SCENARIOS_MISSING'));assert.equal(r.status,'requires_review');
});
test('a retirement response with a different need is held for review',()=> {
  const body=structuredClone(pension.response);body.response.IncomeNeed=50000;
  const r=normalizeResponse('retirement',pension.request,body);assert.equal(r.status,'requires_review');
  assert.ok(r.issues.some(i=>i.code==='PROVIDER_NEED_MISMATCH'));
});
test('live transport stays on the allowlisted server and keeps credentials out of returned results',async()=> {
  let calls=0;const p=new LiveLogismataProvider({...options,fetchImpl:async(url,init)=> {
    calls++;assert.equal(url,'https://baselhackathon2026.azurewebsites.net/viper/operation/standard/APICalc_getSaving3aLimits');
    assert.equal(init.headers.get('Authorization'),'Bearer server-only-test-token');assert.equal(init.redirect,'manual');return response();
  }});
  const r=await p.execute('saving3aLimits',{});assert.equal(calls,1);assert.equal(r.provenance.mode,'live');
  assert.ok(!JSON.stringify(r).includes(options.token));assert.ok(!JSON.stringify(p).includes(options.token));
});
test('unknown provider metadata fields are not forwarded to consumers',()=> {
  const r=normalizeResponse('ageLimits',{Sex:1,BirthYear:1985},{response:{BirthYear:1985,RegularPensionAge:65,MinimumAHVAge:63,MaximumAHVAge:70,debugToken:options.token}});
  assert.ok(!JSON.stringify(r).includes(options.token));assert.equal(r.metadata.ageLimits.RegularPensionAge,65);
});
test('unknown operation, invalid enums, future birth year and missing needs cause no outbound call',async()=> {
  let calls=0;const p=new LiveLogismataProvider({...options,fetchImpl:async()=>{calls++;return response();}});
  await assert.rejects(p.execute('https://example.com',{}),e=>e.code==='INVALID_INPUT');
  await assert.rejects(p.execute('ageLimits',{Sex:3,BirthYear:1985}),e=>e.code==='INVALID_INPUT');
  await assert.rejects(p.execute('ageLimits',{Sex:1,BirthYear:2030}),e=>e.code==='INVALID_INPUT');
  await assert.rejects(p.execute('risk',risk.request),e=>e.code==='INVALID_INPUT');assert.equal(calls,0);
});
for(const status of [401,403]) test(`${status} is not retried and does not reveal the provider error body`,async()=> {
  let calls=0;const p=new LiveLogismataProvider({...options,fetchImpl:async()=>{calls++;return Response.json({secret:options.token},{status});}});
  await assert.rejects(p.execute('saving3aLimits',{}),e=>e.code==='UNAUTHORIZED'&&!e.message.includes(options.token));assert.equal(calls,1);
});
test('a temporary 503 has one bounded retry',async()=> {
  let calls=0;const p=new LiveLogismataProvider({...options,fetchImpl:async()=>++calls===1?new Response('',{status:503}):response()});
  await p.execute('saving3aLimits',{});assert.equal(calls,2);
});
test('a long Retry-After is respected by refusing an immediate retry',async()=> {
  let calls=0;const p=new LiveLogismataProvider({...options,fetchImpl:async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'60'}});}});
  await assert.rejects(p.execute('saving3aLimits',{}),e=>e.code==='RATE_LIMITED');assert.equal(calls,1);
});
test('malformed JSON, wrong envelopes and oversize responses are rejected without retry',async()=> {
  for(const make of [()=>new Response('{bad',{headers:{'content-type':'application/json'}}),()=>Response.json({response:'unexpected'}),
    ()=>Response.json({errorcode:99,response:limits.response}),()=>new Response('x'.repeat(1000001),{headers:{'content-type':'application/json'}})]) {
    let calls=0;const p=new LiveLogismataProvider({...options,fetchImpl:async()=>{calls++;return make();}});
    await assert.rejects(p.execute('saving3aLimits',{}),e=>e.code==='INVALID_RESPONSE');assert.equal(calls,1);
  }
});
test('network exceptions are bounded and their original text is withheld',async()=> {
  let calls=0;const p=new LiveLogismataProvider({...options,fetchImpl:async()=>{calls++;throw new Error(options.token);}});
  await assert.rejects(p.execute('saving3aLimits',{}),e=>e.code==='UNAVAILABLE'&&!e.message.includes(options.token));assert.equal(calls,2);
});
test('timeouts are bounded to two attempts',async()=> {
  let calls=0;const p=new LiveLogismataProvider({...options,timeoutMs:10,fetchImpl:async(_url,init)=> {
    calls++;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>resolve(response()),1000);init.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('aborted'));},{once:true});});
  }});
  await assert.rejects(p.execute('saving3aLimits',{}),e=>e.code==='TIMEOUT');assert.equal(calls,2);
});
test('at most two provider calls run at once and queued cancellation does not consume a slot',async()=> {
  let active=0,max=0,calls=0;const p=new LiveLogismataProvider({...options,fetchImpl:async()=> {
    calls++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,15));active--;return response();
  }});
  const first=p.execute('saving3aLimits',{});const second=p.execute('saving3aLimits',{});const abort=new AbortController();
  const cancelled=p.execute('saving3aLimits',{},abort.signal);abort.abort();
  await assert.rejects(cancelled,e=>e.code==='CANCELLED');await Promise.all([first,second]);
  await Promise.all(Array.from({length:5},()=>p.execute('saving3aLimits',{})));
  assert.equal(max,2);assert.equal(calls,7);
});
