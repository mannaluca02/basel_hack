import {randomBytes} from 'node:crypto';
import {emptyDatabase,WorkflowError,type Database} from '../../api/dist/insurance/types.js';
import {decodeDatabase,encodeDatabase} from '../../api/dist/insurance/store-codec.js';
import {nextCleanupAt} from '../../api/dist/insurance/runtime.js';
import type {CaseStore,BootstrapCredentials} from '../../api/dist/insurance/store.js';

type Transaction=Pick<DurableObjectTransaction,'get'|'put'|'delete'|'list'|'getAlarm'|'setAlarm'|'deleteAlarm'>;
type Storage=Pick<DurableObjectStorage,'transaction'>;
export type StoreSecrets={LIFEMAP_STORE_KEY?:string;PAX_CUSTOMER_ACCESS_CODE?:string;PAX_REVIEWER_ACCESS_CODE?:string};
export const CHUNK_SIZE=1_000_000;
const MANIFEST='store:manifest',CHUNKS='store:chunk:',CODES='store:credentials';
type Manifest={version:1;chunks:number};

export function storeKey(value:string|undefined):Buffer {
  if(!value||!/^[A-Za-z0-9+/]{43}=$/.test(value))throw new Error('LIFEMAP_STORE_KEY must be a base64-encoded 32-byte key');
  const key=Buffer.from(value,'base64');
  if(key.length!==32||key.toString('base64')!==value)throw new Error('LIFEMAP_STORE_KEY must be a base64-encoded 32-byte key');
  return key;
}
async function schedule(tx:Transaction,db:Database) {
  const next=nextCleanupAt(db);
  if(next===null){await tx.deleteAlarm();return;}
  const previous=await tx.getAlarm();
  await tx.setAlarm(previous!==null&&previous>Date.now()?Math.min(previous,next):next);
}
async function write(tx:Transaction,envelope:string,db:Database) {
  const count=Math.ceil(envelope.length/CHUNK_SIZE);
  const old=await tx.list({prefix:CHUNKS});
  for(let i=0;i<count;i++){const key=CHUNKS+i;await tx.put(key,envelope.slice(i*CHUNK_SIZE,(i+1)*CHUNK_SIZE));old.delete(key);}
  for(const key of old.keys())await tx.delete(key);
  await tx.put(MANIFEST,{version:1,chunks:count} satisfies Manifest);
  await schedule(tx,db);
}

/** One runtime owns this store. The queue serializes clone/encrypt/durable commit/state swap. */
export async function durableStore(storage:Storage,secrets:StoreSecrets):Promise<CaseStore & {arm():Promise<void>}> {
  const key=storeKey(secrets.LIFEMAP_STORE_KEY);
  let state=emptyDatabase(),closed=false,queue:Promise<unknown>=Promise.resolve();
  let credentials:BootstrapCredentials;
  try {
    const loaded=await storage.transaction(async tx=>{
      const manifest=await tx.get<Manifest>(MANIFEST);let db=emptyDatabase();
      if(manifest!==undefined){
        if(manifest.version!==1||!Number.isInteger(manifest.chunks)||manifest.chunks<1||manifest.chunks>32)throw new Error('Invalid manifest');
        const chunks:string[]=[];
        for(let i=0;i<manifest.chunks;i++){const chunk=await tx.get<string>(CHUNKS+i);if(typeof chunk!=='string'||chunk.length>CHUNK_SIZE)throw new Error('Missing chunk');chunks.push(chunk);}
        db=decodeDatabase(chunks.join(''),key);
      }
      const saved=await tx.get<string>(CODES);
      let codes:BootstrapCredentials;
      if(saved!==undefined){
        try{
          const parsed=JSON.parse(saved);
          if(!parsed||Object.keys(parsed).length!==2||typeof parsed.customerAccessCode!=='string'||parsed.customerAccessCode.length<32||typeof parsed.reviewerAccessCode!=='string'||parsed.reviewerAccessCode.length<32)throw new Error('Invalid credentials');
          codes=parsed;
        }catch{throw new WorkflowError('ACCESS_CODE_STORAGE_INVALID',500);}
      }else{
        codes={customerAccessCode:randomBytes(32).toString('base64url'),reviewerAccessCode:randomBytes(32).toString('base64url')};
        await tx.put(CODES,JSON.stringify(codes));
      }
      await schedule(tx,db);return {db,codes};
    });
    state=loaded.db;credentials=loaded.codes;
  }catch(error){if(error instanceof WorkflowError)throw error;throw new WorkflowError('STORE_INTEGRITY_OR_KEY_FAILURE',500);}
  // Overrides do not destroy the persisted fallback codes.
  credentials={customerAccessCode:secrets.PAX_CUSTOMER_ACCESS_CODE||credentials.customerAccessCode,reviewerAccessCode:secrets.PAX_REVIEWER_ACCESS_CODE||credentials.reviewerAccessCode};
  const assertOpen=()=>{if(closed)throw new WorkflowError('STORE_CLOSED',503);};
  return {
    directory:'durable-object:encrypted',
    arm(){
      const next=queue.then(()=>storage.transaction(tx=>schedule(tx,state)));
      queue=next.catch(()=>{});return next;
    },
    async credentials(){return structuredClone(credentials);},
    snapshot(){assertOpen();return structuredClone(state);},
    view(read){assertOpen();return structuredClone(read(state));},
    transaction(fn){
      const next=queue.then(async()=>{
        assertOpen();const copy=structuredClone(state),result=await fn(copy),envelope=encodeDatabase(copy,key);
        try{await storage.transaction(tx=>write(tx,envelope,copy));}
        catch(error){if(error instanceof WorkflowError)throw error;throw new WorkflowError('STORE_WRITE_FAILED',503);}
        state=copy;return structuredClone(result);
      });
      queue=next.catch(()=>{});return next;
    },
    async close(){await queue;closed=true;},
  };
}
