import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// Run against an already-running local workerd. Session cookies never reach stdout or the repo.
const base=process.env.SPIKE_URL??'http://127.0.0.1:8797';
const temporary=mkdtempSync(join(tmpdir(),'nest-do-check-'));
const cookies=join(temporary,'cookies');
function request(path,args=[],status=200) {
  const raw=execFileSync('curl',['--silent','--show-error','--max-time','20','-b',cookies,'-c',cookies,...args,'-w','\n%{http_code}',`${base}${path}`],{encoding:'utf8'});
  const split=raw.lastIndexOf('\n');assert.equal(Number(raw.slice(split+1)),status,path);
  return JSON.parse(raw.slice(0,split));
}
try {
  assert.equal(request('/api/status').service,'pax-life-insurance-backend');
  console.log('GET /api/status: 200');
  assert.ok(request('/api/privacy').purpose);
  console.log('GET /api/privacy: 200');
  const args=['-H','Content-Type: application/json','-d','{}'];
  const first=request('/api/demo/start',args,201);
  assert.equal(first.role,'customer');assert.ok(first.csrfToken);
  console.log('POST /api/demo/start {} without access code: 201');
  const c=request(`/api/cases/${first.caseId}`);
  assert.equal(c.id,first.caseId);assert.ok(c.confirmedVersions.length);
  console.log('Authenticated case read: 200, confirmed persona retained');
  assert.equal(request('/api/demo/start',args,201).caseId,first.caseId);
  assert.equal(request(`/api/cases/${first.caseId}`).contextRevision,c.contextRevision);
  console.log('Repeated start/read: same case ID and context revision');
  const sse=spawnSync('curl',['--silent','--show-error','--no-buffer','--max-time','2','-i','-b',cookies,`${base}/api/cases/${first.caseId}/advisor/events`],{encoding:'utf8'});
  assert.equal(sse.status,28,'SSE must stay open until curl times out');
  assert.match(sse.stdout,/HTTP\/1\.1 200/);
  assert.match(sse.stdout,/Content-Type: text\/event-stream/i);
  assert.match(sse.stdout,/event: advisor.context.updated/);
  const event=JSON.parse(sse.stdout.split('\n').find(line=>line.startsWith('data: ')).slice(6));
  assert.equal(event.caseId,first.caseId);assert.equal(event.contextRevision,c.contextRevision);
  console.log('SSE: 200 text/event-stream; initial advisor.context.updated received; still open after 2s');
} finally {rmSync(temporary,{recursive:true,force:true});}
