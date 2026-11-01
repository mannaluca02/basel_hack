import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const manifest=JSON.parse(readFileSync(new URL('../generated/documents.json',import.meta.url)));
const varsFile=new URL('../.dev.vars',import.meta.url);
const vars=existsSync(varsFile)?readFileSync(varsFile,'utf8'):'';
const hasSecret=name=>Boolean(process.env[name]||new RegExp('^'+name+'=.+','m').test(vars));

// Run against an already-running Worker. Session cookies never reach stdout or the repo.
const base=process.env.WORKER_URL??process.env.SPIKE_URL??'http://127.0.0.1:8797';
const temporary=mkdtempSync(join(tmpdir(),'nest-do-check-'));
const cookies=join(temporary,'cookies');
function request(path,args=[],status=200) {
  const raw=execFileSync('curl',['--silent','--show-error','--max-time','20','-b',cookies,'-c',cookies,...args,'-w','\n%{http_code}',`${base}${path}`],{encoding:'utf8'});
  const split=raw.lastIndexOf('\n');assert.equal(Number(raw.slice(split+1)),status,path);
  return JSON.parse(raw.slice(0,split));
}
try {
  const page=await fetch(base);
  assert.equal(page.status,200);
  const html=await page.text();
  assert.match(html,/<app-root/);
  assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>/i,'CSP requires external scripts');
  assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal(page.headers.get('permissions-policy'),'microphone=(self)');
  assert.equal(page.headers.get('cache-control'),'no-cache');
  const deep=await fetch(`${base}/client/deep/route`);
  assert.equal(deep.status,200);assert.equal(await deep.text(),html);
  const assets=[...html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g)].map(match=>match[1]);
  assert.ok(assets.some(path=>/[-.][A-Z0-9]{8}\.js$/i.test(path)));
  assert.ok(assets.some(path=>path.endsWith('.css')));
  for(const path of assets) {
    const asset=await fetch(new URL(path,base));assert.equal(asset.status,200);
    assert.ok(!asset.headers.get('content-type')?.includes('text/html'));
  }
  for(const path of ['/_products','/_products/missing.pdf',...Object.values(manifest).map(item=>item.path)]) {
    assert.equal((await fetch(`${base}${path}`)).status,404,path);
  }
  const sw=await (await fetch(`${base}/ngsw.json`)).json();
  assert.equal(sw.dataGroups.length,0);
  assert.ok(sw.navigationUrls.some(rule=>!rule.positive&&new RegExp(rule.regex).test('/api/cases/id/advisor/events')));
  assert.ok(Object.keys(sw.hashTable).every(path=>!path.startsWith('/api/')&&!path.startsWith('/_products/')));
  console.log('SPA: HTML/security headers, deep route, hashed JS/CSS, private PDFs and service-worker exclusions passed');
  assert.equal(request('/api/status').providerMode,'live');
  console.log('GET /api/status: 200, providerMode live');
  const privacy=request('/api/privacy');assert.ok(privacy.purpose);
  assert.ok(privacy.recipients.some(r=>r.includes('voice')));assert.ok(privacy.recipients.some(r=>r.includes('extraction')));
  assert.ok(request('/api/voice/settings').skills.length);
  console.log('GET /api/privacy: 200');
  const args=['-H','Content-Type: application/json','-d','{}'];
  const first=request('/api/demo/start',args,201);
  assert.equal(first.role,'customer');assert.ok(first.csrfToken);
  console.log('POST /api/demo/start {} without access code: 201');
  const c=request(`/api/cases/${first.caseId}`);
  assert.equal(c.id,first.caseId);assert.ok(c.confirmedVersions.length);
  console.log('Authenticated case read: 200, confirmed persona retained');
  for(const [id,item] of Object.entries(manifest)) {
    const bytes=execFileSync('curl',['--silent','--show-error','--fail','-b',cookies,`${base}/api/cases/${first.caseId}/documents/${id}`],{maxBuffer:20*1024*1024});
    assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
  }
  console.log('Authenticated PDF downloads: all 12 SHA-256 hashes match');
  request('/api/demo/start',[...args,'-H','Origin: https://evil.invalid'],403);
  request('/api/demo/start',[...args,'-H',`Origin: ${base}`],201);
  console.log('Origin checks: same origin accepted, foreign origin rejected');
  if(hasSecret('LOGISMATA_BEARER_TOKEN')) {
    assert.ok(c.runs.some(run=>run.providerResults?.some(result=>result.status==='valid'&&result.provenance?.mode==='live')), 'Expected successful live calculation');
    console.log('Real Logismata calculation: passed');
  } else console.log('SKIP real Logismata success: LOGISMATA_BEARER_TOKEN missing');
  if(!hasSecret('OPENAI_API_KEY')) {
    const result=request(`/api/cases/${first.caseId}/voice/sessions`,['-H','Content-Type: application/json','-H',`X-CSRF-Token: ${first.csrfToken}`,'-d',JSON.stringify({messageId:randomUUID(),expectedCaseRevision:c.caseRevision,provider:'gpt-live',locale:'de',dataClassification:'synthetic',noticeVersion:'voice-synthetic-v1',allowExternalVoiceProcessing:true,sdp:'v=0\r\n'})],503);
    assert.equal(result.code,'VOICE_PROVIDER_DISABLED');
    console.log('Voice setup: disabled only because OPENAI_API_KEY missing; SKIP external session');
  } else if(process.env.VOICE_SDP_FILE) {
    const result=request(`/api/cases/${first.caseId}/voice/sessions`,['-H','Content-Type: application/json','-H',`X-CSRF-Token: ${first.csrfToken}`,'-d',JSON.stringify({messageId:randomUUID(),expectedCaseRevision:c.caseRevision,provider:'gpt-live',locale:'de',dataClassification:'synthetic',noticeVersion:'voice-synthetic-v1',allowExternalVoiceProcessing:true,sdp:readFileSync(process.env.VOICE_SDP_FILE,'utf8')})],201);
    assert.ok(result.connection);console.log('Live voice session setup: passed');
  } else console.log('SKIP external voice session: set VOICE_SDP_FILE to a fresh browser WebRTC offer');
  assert.equal(request('/api/demo/start',args,201).caseId,first.caseId);
  const current=request(`/api/cases/${first.caseId}`);
  if(!process.env.VOICE_SDP_FILE)assert.equal(current.contextRevision,c.contextRevision);
  console.log('Repeated start/read: same case ID and context revision');
  const sse=spawnSync('curl',['--silent','--show-error','--no-buffer','--max-time','2','-i','-b',cookies,`${base}/api/cases/${first.caseId}/advisor/events`],{encoding:'utf8'});
  assert.equal(sse.status,28,'SSE must stay open until curl times out');
  assert.match(sse.stdout,/HTTP\/(?:1\.1|2|3) 200/);
  assert.match(sse.stdout,/Content-Type: text\/event-stream/i);
  assert.match(sse.stdout,/event: advisor.context.updated/);
  const event=JSON.parse(sse.stdout.split('\n').find(line=>line.startsWith('data: ')).slice(6));
  assert.equal(event.caseId,first.caseId);assert.equal(event.contextRevision,current.contextRevision);
  console.log('SSE: 200 text/event-stream; initial advisor.context.updated received; still open after 2s');
} finally {rmSync(temporary,{recursive:true,force:true});}
