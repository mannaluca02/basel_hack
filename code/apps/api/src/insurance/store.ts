import { randomBytes,createCipheriv,createDecipheriv } from 'node:crypto';
import { mkdir,readFile,writeFile,rename,unlink,open,lstat,chmod } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { DEFAULT_HUMAN_HANDOVER } from '@pax/contracts';
import { z } from 'zod';
import { emptyDatabase,type Database,WorkflowError } from './types.js';

const AAD=Buffer.from('pax-lifemap-synthetic-store-v1');
const Envelope=z.object({version:z.literal(1),iv:z.string(),tag:z.string(),ciphertext:z.string()}).strict();
const Root=z.object({version:z.literal(1),sessions:z.record(z.string(),z.unknown()),cases:z.record(z.string(),z.unknown()),audit:z.array(z.unknown()),feedback:z.array(z.unknown())}).strict();
export type BootstrapCredentials={customerAccessCode:string;reviewerAccessCode:string};

export class EncryptedCaseStore {
  private state:Database;private queue:Promise<unknown>=Promise.resolve();private closed=false;
  private constructor(readonly directory:string,private readonly key:Buffer,state:Database,private readonly lockId:string) {this.state=state;}
  static async open(directory:string) {
    const dir=resolve(directory);await mkdir(dir,{recursive:true,mode:0o700});
    if((await lstat(dir)).isSymbolicLink())throw new WorkflowError('UNSAFE_STORAGE_PATH',500);
    await chmod(dir,0o700);const lockId=randomBytes(16).toString('hex');
    const lockPath=join(dir,'store.lock');
    try{await writeFile(lockPath,JSON.stringify({pid:process.pid,id:lockId}),{flag:'wx',mode:0o600});}
    catch(error){
      if((error as NodeJS.ErrnoException).code!=='EEXIST')throw new WorkflowError('STORE_UNAVAILABLE',500);
      const old=JSON.parse(await readFile(lockPath,'utf8'));let alive=true;
      if(!Number.isInteger(old.pid))throw new WorkflowError('STORE_LOCK_INVALID',500);
      try{process.kill(old.pid,0);}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')alive=false;}
      if(alive)throw new WorkflowError('STORE_ALREADY_OPEN',503);
      await unlink(lockPath);await writeFile(lockPath,JSON.stringify({pid:process.pid,id:lockId}),{flag:'wx',mode:0o600});
    }
    try {
      let ciphertext:string|null=null;try{ciphertext=await readFile(join(dir,'cases.enc'),'utf8');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      let key:Buffer;
      try{const stat=await lstat(join(dir,'store.key'));if(stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw new Error('Unsafe key');key=await readFile(join(dir,'store.key'));}
      catch(e){
        if((e as NodeJS.ErrnoException).code!=='ENOENT'||ciphertext!==null)throw new Error('Store key unavailable');
        key=randomBytes(32);await writeFile(join(dir,'store.key'),key,{flag:'wx',mode:0o600});
      }
      if(key.length!==32)throw new Error('Invalid key');
      let state=emptyDatabase();
      if(ciphertext!==null) {
        if(Buffer.byteLength(ciphertext)>32_000_000)throw new Error('Store too large');
        const e=Envelope.parse(JSON.parse(ciphertext));const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'base64'));
        decipher.setAAD(AAD);decipher.setAuthTag(Buffer.from(e.tag,'base64'));
        const decoded=Buffer.concat([decipher.update(Buffer.from(e.ciphertext,'base64')),decipher.final()]);
        state=Root.parse(JSON.parse(decoded.toString('utf8'))) as Database;
        for(const c of Object.values(state.cases)){c.proposalBatches??=[];c.ambiguities??=[];c.confirmationRequests??=[];c.handover??=structuredClone(DEFAULT_HUMAN_HANDOVER);}
      }
      return new EncryptedCaseStore(dir,key,state,lockId);
    } catch {await unlink(lockPath).catch(()=>{});throw new WorkflowError('STORE_INTEGRITY_OR_KEY_FAILURE',500);}
  }
  async credentials():Promise<BootstrapCredentials> {
    const path=join(this.directory,'access-codes.json');
    try {
      const stat=await lstat(path);if(stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw new Error('Unsafe access-code file');
      return z.object({customerAccessCode:z.string().min(32),reviewerAccessCode:z.string().min(32)}).strict().parse(JSON.parse(await readFile(path,'utf8')));
    }catch(e){
      if((e as NodeJS.ErrnoException).code!=='ENOENT')throw new WorkflowError('ACCESS_CODE_STORAGE_INVALID',500);
      const codes={customerAccessCode:randomBytes(32).toString('base64url'),reviewerAccessCode:randomBytes(32).toString('base64url')};
      await writeFile(path,JSON.stringify(codes),{flag:'wx',mode:0o600});return codes;
    }
  }
  snapshot():Database {if(this.closed)throw new WorkflowError('STORE_CLOSED',503);return structuredClone(this.state);}
  view<T>(read:(db:Readonly<Database>)=>T):T {if(this.closed)throw new WorkflowError('STORE_CLOSED',503);return structuredClone(read(this.state));}
  async transaction<T>(fn:(db:Database)=>T|Promise<T>):Promise<T> {
    const next=this.queue.then(async()=>{
      if(this.closed)throw new WorkflowError('STORE_CLOSED',503);
      const copy=structuredClone(this.state);const result=await fn(copy);const plain=Buffer.from(JSON.stringify(copy));
      if(plain.length>20_000_000)throw new WorkflowError('STORE_CAPACITY',413);
      const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(AAD);
      const data=Buffer.concat([cipher.update(plain),cipher.final()]);
      const envelope=JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:data.toString('base64')});
      const temporary=join(this.directory,`write-${randomBytes(8).toString('hex')}.tmp`);
      try {
        const file=await open(temporary,'wx',0o600);try{await file.writeFile(envelope);await file.sync();}finally{await file.close();}
        await rename(temporary,join(this.directory,'cases.enc'));this.state=copy;return structuredClone(result);
      }catch(e){await unlink(temporary).catch(()=>{});if(e instanceof WorkflowError)throw e;throw new WorkflowError('STORE_WRITE_FAILED',503);}
    });
    this.queue=next.catch(()=>{});return next;
  }
  async close(){await this.queue;this.closed=true;const p=join(this.directory,'store.lock');
    try{if(JSON.parse(await readFile(p,'utf8')).id===this.lockId)await unlink(p);}catch{/* already released */}}
}
