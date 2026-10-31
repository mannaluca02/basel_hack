import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoApp } from '../apps/api/dist/main.js';
import { AnalysisResultSchema } from '@pax/contracts';

let app,base;
before(async()=>{app=await createDemoApp();await app.listen(0,'127.0.0.1');base=await app.getUrl();});
after(async()=>{await app?.close();});
const post=body=>fetch(`${base}/api/demo/calculations`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
test('local Nest application identifies synthetic replay mode',async()=> {
  const r=await fetch(`${base}/api/demo/health`);assert.equal(r.status,200);assert.equal((await r.json()).dataMode,'synthetic-only');
});
for(const scenario of ['baseline','family','home']) test(`HTTP calculation returns a valid I04 for ${scenario}`,async()=> {
  const response=await post({fixtureId:'household',scenario});assert.equal(response.status,200);
  const r=AnalysisResultSchema.parse(await response.json());assert.equal(r.scenarioVersionId,`demo_${scenario}_v1`);
  assert.equal(r.dataClassification,'synthetic');assert.equal(response.headers.get('cache-control'),'no-store');
});
test('HTTP risk example exposes review status and archive provenance',async()=> {
  const response=await fetch(`${base}/api/demo/provider-examples/risk`);const body=await response.json();
  assert.equal(response.status,200);assert.equal(body.status,'requires_review');assert.equal(body.provenance.mode,'replay');
});
test('demo does not accept arbitrary profiles or expose real case endpoints',async()=> {
  const response=await post({fixtureId:'household',scenario:'baseline',snapshot:{private:'do-not-reflect'}});
  assert.equal(response.status,400);assert.ok(!(await response.text()).includes('do-not-reflect'));
  assert.equal((await fetch(`${base}/api/cases/customer`)).status,404);
});
test('malformed and oversized JSON errors do not echo the request body',async()=> {
  const bad=await fetch(`${base}/api/demo/calculations`,{method:'POST',headers:{'content-type':'application/json'},body:'{"secret":"do-not-reflect"'});
  assert.equal(bad.status,400);assert.ok(!(await bad.text()).includes('do-not-reflect'));
  const big=await post({padding:'x'.repeat(40000)});assert.equal(big.status,413);
});
test('only the configured local Angular origins receive CORS access',async()=> {
  const yes=await fetch(`${base}/api/demo/health`,{headers:{Origin:'http://localhost:4200'}});assert.equal(yes.headers.get('access-control-allow-origin'),'http://localhost:4200');
  const no=await fetch(`${base}/api/demo/health`,{headers:{Origin:'https://example.com'}});assert.equal(no.headers.get('access-control-allow-origin'),null);
});
