import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,chmod,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EncryptedCaseStore} from '../apps/api/dist/insurance/store.js';
import {createLifeRuntime,hasExpired,sweepExpired} from '../apps/api/dist/insurance/runtime.js';
import {emptyDatabase} from '../apps/api/dist/insurance/types.js';
import {openAiResponsesTransport} from '../apps/api/dist/erni-dialog/responses.js';
import {SyntheticTestProvider} from './helpers/life-fixture.mjs';

/** Encrypted local store, its lock and access codes; runtime retention; the OpenAI transport. */
async function directory(t) {
  const dir=await mkdtemp(join(tmpdir(),'pax-store-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  return dir;
}

test('a lock left by a process that no longer runs is taken over; a live one refuses',async t=>{
  const dir=await directory(t);
  // A PID that cannot exist on this machine.
  await writeFile(join(dir,'store.lock'),JSON.stringify({pid:2147483646,id:'old'}),{mode:0o600});
  const store=await EncryptedCaseStore.open(dir);
  const lock=JSON.parse(await readFile(join(dir,'store.lock'),'utf8'));
  assert.equal(lock.pid,process.pid,'the stale lock was replaced');
  await assert.rejects(EncryptedCaseStore.open(dir),e=>e.code==='STORE_ALREADY_OPEN','this process holds it');
  await store.close();
});

test('a lock file without a process id is refused instead of guessed',async t=>{
  const dir=await directory(t);
  await writeFile(join(dir,'store.lock'),JSON.stringify({pid:'nope'}),{mode:0o600});
  await assert.rejects(EncryptedCaseStore.open(dir),e=>e.code==='STORE_LOCK_INVALID');
});

test('access codes are created once, private, and refused when the file is readable by others',async t=>{
  const dir=await directory(t);
  const store=await EncryptedCaseStore.open(dir);
  t.after(()=>store.close());
  const first=await store.credentials();
  assert.ok(first.customerAccessCode.length>=32&&first.reviewerAccessCode.length>=32);
  assert.notEqual(first.customerAccessCode,first.reviewerAccessCode);
  assert.equal((await stat(join(dir,'access-codes.json'))).mode&0o777,0o600);
  assert.deepEqual(await store.credentials(),first,'the same codes on the next start');
  await chmod(join(dir,'access-codes.json'),0o644);
  await assert.rejects(store.credentials(),e=>e.code==='ACCESS_CODE_STORAGE_INVALID');
});

test('a runtime without given codes uses the stored ones, and a failed start releases the store',async t=>{
  const dir=await directory(t);
  const r=await createLifeRuntime({dataDirectory:dir,provider:new SyntheticTestProvider(),providerMode:'test'});
  const codes=JSON.parse(await readFile(join(dir,'access-codes.json'),'utf8'));
  const login=await r.sessions.login(codes.customerAccessCode,'runtime-test');
  assert.equal(r.sessions.authenticate(login.sessionToken).role,'customer');
  await r.close();
  assert.equal(r.closed,true);
  // Live mode without a calculator token cannot start; the lock is released for the next try.
  await assert.rejects(createLifeRuntime({dataDirectory:dir,providerMode:'live'}),/LOGISMATA_BEARER_TOKEN/);
  const again=await createLifeRuntime({dataDirectory:dir,provider:new SyntheticTestProvider(),providerMode:'test'});
  await again.close();
});

test('retention removes expired cases with their feedback, expired sessions and day-old audit entries',()=>{
  const now=new Date('2026-11-01T12:00:00.000Z');
  const db=emptyDatabase();
  db.cases={old:{expiresAt:'2026-11-01T11:00:00.000Z'},fresh:{expiresAt:'2026-11-02T12:00:00.000Z'}};
  db.sessions={gone:{expiresAt:'2026-11-01T11:59:59.000Z'},open:{expiresAt:'2026-11-01T13:00:00.000Z'}};
  db.feedback=[{caseId:'old',score:9},{caseId:'fresh',score:7}];
  db.audit=[{at:'2026-10-31T11:00:00.000Z'},{at:'2026-11-01T11:00:00.000Z'}];
  assert.equal(hasExpired(db,now),true);
  sweepExpired(db,now);
  assert.deepEqual(Object.keys(db.cases),['fresh']);
  assert.deepEqual(Object.keys(db.sessions),['open']);
  assert.deepEqual(db.feedback.map(f=>f.caseId),['fresh']);
  assert.deepEqual(db.audit.map(a=>a.at),['2026-11-01T11:00:00.000Z']);
  assert.equal(hasExpired(db,now),false,'nothing left to sweep');
});

test('the OpenAI transport needs a key, posts the request and turns failures into MODEL_TRANSPORT_FAILED',async t=>{
  assert.throws(()=>openAiResponsesTransport('  '),e=>e.code==='MODEL_KEY_REQUIRED');
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  const seen=[];
  globalThis.fetch=async(url,init)=>{seen.push({url,init});return new Response(JSON.stringify({status:'completed',output:[]}),{status:200});};
  const transport=openAiResponsesTransport('sk-test');
  assert.deepEqual(await transport({model:'m'},new AbortController().signal),{status:'completed',output:[]});
  assert.equal(seen[0].url,'https://api.openai.com/v1/responses');
  assert.equal(seen[0].init.headers.Authorization,'Bearer sk-test');
  assert.deepEqual(JSON.parse(seen[0].init.body),{model:'m'});
  globalThis.fetch=async()=>new Response('upstream detail',{status:500});
  await assert.rejects(transport({model:'m'}),e=>e.code==='MODEL_TRANSPORT_FAILED'&&!String(e.message).includes('upstream'));
});
