import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const cwd=fileURLToPath(new URL('..',import.meta.url)),temporary=await mkdtemp(join(tmpdir(),'lifemap-persistence-'));
const port=Number(process.env.PERSISTENCE_PORT??18897),base=`http://127.0.0.1:${port}`;
let child,exited;
async function start(){
  child=spawn(process.execPath,['../../node_modules/wrangler/bin/wrangler.js','dev','--local','--port',String(port),'--inspector-port','0','--persist-to',temporary],{cwd,stdio:'ignore',detached:true});
  exited=new Promise(resolve=>child.once('exit',resolve));
  for(let i=0;i<300;i++){
    if(child.exitCode!==null)throw new Error('Wrangler exited; check local setup/build separately');
    try{if((await fetch(base+'/api/status')).ok)return;}catch{}
    await delay(100);
  }
  throw new Error('Worker did not become ready');
}
async function stop(){
  if(!child)return;
  const pid=child.pid;child=undefined;let timer;
  try{process.kill(-pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}
  try{
    await Promise.race([exited,new Promise(resolve=>{
      timer=setTimeout(()=>{try{process.kill(-pid,'SIGKILL');}catch{}resolve();},5000);
    })]);
  }finally{clearTimeout(timer);}
}
async function files(dir){
  const entries=await readdir(dir,{withFileTypes:true});
  return (await Promise.all(entries.map(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]))).flat();
}
try{
  await start();
  execFileSync(process.execPath,['scripts/check.mjs'],{cwd,env:{...process.env,WORKER_URL:base},stdio:'inherit'});
  const response=await fetch(base+'/api/demo/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(response.status,201);
  const cookie=response.headers.get('set-cookie').split(';')[0],first=await response.json();
  const get=async()=>{const r=await fetch(base+'/api/cases/'+first.caseId,{headers:{Cookie:cookie}});assert.equal(r.status,200);return r.json();};
  const before=await get();
  console.log('Created demo and authenticated case: 201 / 200');
  await stop();await start();
  const after=await get();assert.equal(after.id,before.id);assert.equal(after.contextRevision,before.contextRevision);
  console.log('Full local Worker restart: same cookie, case ID and context revision: PASS');
  await stop();
  const databases=(await files(temporary)).filter(f=>f.endsWith('.sqlite'));
  assert.ok(databases.length);
  // Inspect logical KV values after SQLite has closed, never print data or credentials.
  const result=JSON.parse(execFileSync('python3',['-c',`
import sqlite3,json,sys
chunks=[]
for path in sys.argv[1:]:
  db=sqlite3.connect(path)
  if not db.execute("select 1 from sqlite_master where name='_cf_KV'").fetchone(): continue
  for key,value in db.execute('select key,value from _cf_KV'):
    if key.startswith('store:chunk:'):
      chunks.append(bytes(value))
blob=b''.join(chunks)
print(json.dumps({'chunks':len(chunks),'envelope':b'ciphertext' in blob and b'iv' in blob and b'tag' in blob,'plaintext':b'confirmedVersions' in blob}))
`,...databases],{encoding:'utf8'}));
  assert.ok(result.chunks>0);assert.equal(result.envelope,true);assert.equal(result.plaintext,false);
  // Also ensure the case identifier is not present in DO SQLite files, including journals (dev HTTP traces are separate).
  for(const file of (await files(temporary)).filter(f=>f.includes('/v3/do/')))assert.equal((await readFile(file)).includes(Buffer.from(first.caseId)),false);
  console.log('SQLite KV inspection: encrypted AES-GCM envelope chunks; no plaintext case ID or case JSON: PASS');
}finally{await stop();await rm(temporary,{recursive:true,force:true});}
