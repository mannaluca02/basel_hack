import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

export const redact=text=>String(text).replace(/Bearer\s+\S+|(?:sk-|ek_)[A-Za-z0-9_-]+|(?:token|secret|password|authorization|cookie|csrf)[\w-]*["']?\s*[:=]\s*["']?[^\s,;"']+|[A-Za-z0-9_-]{32,}/gi,'[REDACTED]');
const pathOf=url=>{try{return new URL(url,'http://local').pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,id=>id.slice(0,8));}catch{return '/';}};
export function formatEvent(row,all=false){
  const lines=[],time=row.eventTimestamp?new Date(row.eventTimestamp).toISOString():row.timestamp?new Date(row.timestamp).toISOString():'local';
  const log=value=>{
    if(typeof value==='string'){try{value=JSON.parse(value);}catch{return;}}
    if(!value||typeof value!=='object')return;
    if(value.event==='api_error')lines.push(`${time} ${value.status} ${value.code} ${value.method} ${pathOf(value.path)}${value.case?` case=${value.case}`:''}${value.error?` ${value.error}: ${value.message}`:''}`);
    if(['do_boot_failed','alarm_failed'].includes(value.event))lines.push(`${time} ${value.event} ${value.error}: ${value.message}`);
  };
  log(row);
  for(const entry of row.logs??[])for(const message of entry.message??[])log(message);
  for(const error of row.exceptions??[])lines.push(`${time} exception ${error.name}: ${error.message}`);
  if(row.outcome&&row.outcome!=='ok')lines.push(`${time} outcome=${row.outcome}`);
  const request=row.event?.request,response=row.event?.response;
  if(all&&request)lines.push(`${time} ${request.method} ${pathOf(request.url)} ${response?.status??'-'}`);
  return lines.map(redact);
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),all=args.includes('--all'),stdin=args.includes('--stdin');
  let child;
  if(!stdin){
    const config=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
    const name=config.match(/"name"\s*:\s*"([^"]+)"/)?.[1];
    if(!name)throw new Error('Worker name missing from wrangler.jsonc');
    const wrangler=fileURLToPath(new URL('../../../node_modules/wrangler/bin/wrangler.js',import.meta.url));
    child=spawn(process.execPath,[wrangler,'tail',name,'--format','json',...args.filter(arg=>arg!=='--all')],{env:process.env,detached:true,stdio:['ignore','pipe','pipe']});
    for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{try{process.kill(-child.pid,signal);}catch{}});
    const errors=createInterface({input:child.stderr});errors.on('line',line=>console.error(redact(line)));
    child.on('exit',code=>{process.exitCode=code??0;});
  }
  let buffer='';
  const input=createInterface({input:stdin?process.stdin:child.stdout});
  input.on('line',line=>{
    // Wrangler tail emits pretty JSON; dev logs contain one JSON object after a console prefix.
    if(!buffer){const start=line.indexOf('{');if(start<0)return;buffer=line.slice(start);}else buffer+='\n'+line;
    try{const row=JSON.parse(buffer);buffer='';for(const line of formatEvent(row,all))console.log(line);}catch{if(buffer.length>2_000_000)buffer='';}
  });
}
