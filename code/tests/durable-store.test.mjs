import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createDecipheriv} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {encodeDatabase,decodeDatabase} from '../apps/api/dist/insurance/store-codec.js';
import {emptyDatabase} from '../apps/api/dist/insurance/types.js';
import {ProductDocuments} from '../apps/api/dist/insurance/documents.js';
import {createLifeRuntime,nextCleanupAt} from '../apps/api/dist/insurance/runtime.js';

// Compile only the Worker store for Node; Cloudflare storage is injected below.
const source=(await readFile(new URL('../apps/worker/src/durable-store.ts',import.meta.url),'utf8'))
  .replaceAll('../../api/dist/',new URL('../apps/api/dist/',import.meta.url).href);
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText;
const {durableStore,storeKey,CHUNK_SIZE}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const key=randomBytes(32),secrets={LIFEMAP_STORE_KEY:key.toString('base64')};
class Storage {
  data=new Map();alarm=null;failAt=Infinity;
  async transaction(fn){
    const data=structuredClone(this.data);let alarm=this.alarm,writes=0;
    const check=()=>{if(++writes===this.failAt)throw new Error('disk full');};
    const result=await fn({
      get:async k=>structuredClone(data.get(k)),
      put:async(k,v)=>{check();assert.ok(Buffer.byteLength(JSON.stringify(v))+k.length<2_000_000);data.set(k,structuredClone(v));},
      delete:async k=>{check();return data.delete(k);},
      list:async({prefix})=>new Map([...data].filter(([k])=>k.startsWith(prefix))),
      getAlarm:async()=>alarm,setAlarm:async n=>{check();alarm=n;},deleteAlarm:async()=>{check();alarm=null;},
    });
    this.data=data;this.alarm=alarm;return result;
  }
}
test('codec keeps v1 AES-GCM format, authenticates AAD/key/data, and migrates defaults',()=>{
  const db=emptyDatabase();db.cases.legacy={id:'legacy'};
  const encoded=encodeDatabase(db,key),e=JSON.parse(encoded);
  assert.equal(e.version,1);assert.ok(!encoded.includes('legacy'));
  const d=createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'base64'));
  d.setAAD(Buffer.from('pax-lifemap-synthetic-store-v1'));d.setAuthTag(Buffer.from(e.tag,'base64'));
  assert.deepEqual(JSON.parse(Buffer.concat([d.update(Buffer.from(e.ciphertext,'base64')),d.final()]).toString()),db);
  const loaded=decodeDatabase(encoded,key);
  assert.deepEqual(loaded.cases.legacy.voiceSessions,[]);assert.ok(loaded.cases.legacy.handover);
  assert.throws(()=>decodeDatabase(encoded,randomBytes(32)));
  e.tag=Buffer.alloc(16).toString('base64');assert.throws(()=>decodeDatabase(JSON.stringify(e),key));
  assert.throws(()=>decodeDatabase('x'.repeat(32_000_001),key),/Store too large/);
  db.feedback=['x'.repeat(20_000_000)];
  assert.throws(()=>encodeDatabase(db,key),/STORE_CAPACITY/);
});
test('key is mandatory canonical base64, with no secret in errors',()=>{
  for(const invalid of [undefined,'',key.toString('hex'),randomBytes(31).toString('base64'),'!'.repeat(44)])assert.throws(()=>storeKey(invalid),/^Error: LIFEMAP_STORE_KEY must be/);
  assert.deepEqual(storeKey(secrets.LIFEMAP_STORE_KEY),key);
});
test('chunks survive reopening; shrinking cleans stale chunks and credentials persist',async()=>{
  const storage=new Storage(),store=await durableStore(storage,secrets),codes=await store.credentials();
  await store.transaction(db=>{db.feedback=['sensitive marker '+ 'x'.repeat(CHUNK_SIZE*2)];});
  assert.ok(storage.data.get('store:manifest').chunks>=3);
  assert.ok(!JSON.stringify([...storage.data]).includes('sensitive marker'));
  const reopened=await durableStore(storage,secrets);
  assert.deepEqual(reopened.snapshot(),store.snapshot());assert.deepEqual(await reopened.credentials(),codes);
  const overrides=await durableStore(storage,{...secrets,PAX_CUSTOMER_ACCESS_CODE:'override'});
  assert.equal((await overrides.credentials()).customerAccessCode,'override');
  assert.equal((await overrides.credentials()).reviewerAccessCode,codes.reviewerAccessCode);
  const full=structuredClone(storage.data);
  storage.failAt=2;
  await assert.rejects(store.transaction(db=>{db.feedback=[];}),/STORE_WRITE_FAILED/);
  assert.deepEqual(storage.data,full);assert.ok(store.snapshot().feedback.length);
  storage.failAt=Infinity;
  await store.transaction(db=>{db.feedback=[];});
  assert.equal([...storage.data.keys()].filter(k=>k.startsWith('store:chunk:')).length,1);
  await assert.rejects(durableStore(storage,{LIFEMAP_STORE_KEY:randomBytes(32).toString('base64')}),/STORE_INTEGRITY_OR_KEY_FAILURE/);
});
test('failed durable writes roll back all chunks, manifest, alarm and memory; queue recovers',async()=>{
  const storage=new Storage(),store=await durableStore(storage,secrets);
  await store.transaction(db=>{db.feedback=['original'];});
  const before=structuredClone(storage.data),state=store.snapshot();
  // Fail during second chunk, manifest, then alarm update.
  for(const failure of [2,4,5]){
    storage.failAt=failure;
    await assert.rejects(store.transaction(db=>{db.feedback=['x'.repeat(CHUNK_SIZE*2)];}),/STORE_WRITE_FAILED/);
    assert.deepEqual(storage.data,before);assert.deepEqual(store.snapshot(),state);
  }
  storage.failAt=Infinity;
  await assert.rejects(store.transaction(db=>{db.feedback=[];throw new Error('callback');}),/callback/);
  await Promise.all([store.transaction(async db=>{await new Promise(r=>setTimeout(r,5));db.feedback.push('one');}),store.transaction(db=>db.feedback.push('two'))]);
  assert.deepEqual(store.snapshot().feedback,['original','one','two']);
  const clone=store.snapshot();clone.feedback.length=0;assert.equal(store.view(db=>db.feedback).length,3);
  await store.close();assert.throws(()=>store.snapshot(),/STORE_CLOSED/);await assert.rejects(store.transaction(()=>{}),/STORE_CLOSED/);
});
test('capacity and missing chunks fail without replacing state',async()=>{
  const storage=new Storage(),store=await durableStore(storage,secrets);
  await assert.rejects(store.transaction(db=>{db.feedback=['x'.repeat(20_000_000)];}),/STORE_CAPACITY/);
  assert.deepEqual(store.snapshot(),emptyDatabase());
  await store.transaction(()=>{});storage.data.delete('store:chunk:0');
  await assert.rejects(durableStore(storage,secrets),/STORE_INTEGRITY_OR_KEY_FAILURE/);
});
test('alarms follow expiration/audit/voice deadlines, and empty state stops alarms',async()=>{
  const db=emptyDatabase(),now=Date.now();
  assert.equal(nextCleanupAt(db,now),null);
  db.audit=[{at:new Date(now).toISOString()}];assert.equal(nextCleanupAt(db,now),now+86400_000);
  db.cases.c={expiresAt:new Date(now+120_000).toISOString(),voiceSessions:[]};
  assert.equal(nextCleanupAt(db,now),now+120_000);
  db.cases.c.voiceSessions=[{status:'active'}];assert.equal(nextCleanupAt(db,now),now+5000);
  db.cases.c.expiresAt=new Date(now-1).toISOString();assert.equal(nextCleanupAt(db,now),now+1);
  const storage=new Storage(),store=await durableStore(storage,secrets);
  await store.transaction(db=>{db.audit=[{at:new Date().toISOString()}];});assert.ok(storage.alarm>Date.now());
  await store.transaction(db=>{db.audit=[];});assert.equal(storage.alarm,null);
});

test('disabled runtime timers expose retention and voice sweeps; old records and alarms are removed',async()=>{
  const storage=new Storage(),store=await durableStore(storage,secrets);
  const runtime=await createLifeRuntime({store,internalTimers:false,providerMode:'test',provider:{async execute(){throw new Error('unused');}},documents:ProductDocuments.empty()});
  try{
    await store.transaction(db=>{
      db.sessions.expired={expiresAt:new Date(Date.now()-1).toISOString()};
      db.audit=[{at:new Date(Date.now()-86400_001).toISOString()}];
    });
    await runtime.sweepVoice();await runtime.sweepRetention();await store.arm();
    assert.deepEqual(store.snapshot(),emptyDatabase());assert.equal(storage.alarm,null);
  }finally{await runtime.close();}
});
test('invalid persisted credentials use the existing access-code error',async()=>{
  const storage=new Storage();await durableStore(storage,secrets);
  storage.data.set('store:credentials','not json');
  await assert.rejects(durableStore(storage,secrets),/ACCESS_CODE_STORAGE_INVALID/);
});
