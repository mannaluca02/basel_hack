import { readFile } from 'node:fs/promises';
import { Operations,RequestSchemas,type Operation } from './contracts.js';
import { normalizeResponse,type NormalizedProviderResult } from './normalize.js';
import { sha256Json } from '../calculation/hash.js';

const BASE_URL='https://baselhackathon2026.azurewebsites.net/viper';
export class ProviderFailure extends Error {
  constructor(public readonly code:'INVALID_INPUT'|'REPLAY_MISS'|'UNAUTHORIZED'|'RATE_LIMITED'|'TIMEOUT'|'UNAVAILABLE'|'INVALID_RESPONSE'|'BUSY'|'CANCELLED') {
    super(`Logismata: ${code}`);
  }
}
export function providerInputHash(operation:Operation,request:unknown) {return sha256Json({operationId:Operations[operation].id,request});}
function validateRequest(operation:Operation,request:unknown) {
  if(!Object.hasOwn(Operations,operation)) throw new ProviderFailure('INVALID_INPUT');
  const r=RequestSchemas[operation].safeParse(request);
  if(!r.success) throw new ProviderFailure('INVALID_INPUT');
  return r.data;
}
export interface CalculationProvider {
  execute(operation:Operation,request:unknown,signal?:AbortSignal):Promise<NormalizedProviderResult>;
}

export class ReplayProvider implements CalculationProvider {
  private constructor(private readonly archive:Map<Operation,{request:unknown;response:unknown;capture_date:string}>) {}
  static async load(directory:URL=new URL('../../../../../documentation/baselhack/references/api/examples/',import.meta.url)) {
    const archive=new Map<Operation,{request:unknown;response:unknown;capture_date:string}>();
    for(const [operation,description] of Object.entries(Operations)) {
      const raw=JSON.parse(await readFile(new URL(`${description.archive}.json`,directory),'utf8'));
      if(raw.http_status!==200 || !String(raw.dataset).startsWith('synthetic') ||
        raw.endpoint!==`${BASE_URL}/operation/standard/${description.id}`)
        throw new Error('Invalid synthetic provider archive');
      validateRequest(operation as Operation,raw.request);archive.set(operation as Operation,raw);
    }
    return new ReplayProvider(archive);
  }
  exampleRequest(operation:Operation):unknown {
    if(!Object.hasOwn(Operations,operation)) throw new ProviderFailure('INVALID_INPUT');
    return structuredClone(this.archive.get(operation)!.request);
  }
  async execute(operation:Operation,input:unknown,signal?:AbortSignal):Promise<NormalizedProviderResult> {
    if(signal?.aborted) throw new ProviderFailure('CANCELLED');
    const request=validateRequest(operation,input);const example=this.archive.get(operation)!;
    const inputHash=providerInputHash(operation,request);
    if(inputHash!==providerInputHash(operation,example.request)) throw new ProviderFailure('REPLAY_MISS');
    try {
      return {...normalizeResponse(operation,request,example.response),provenance:{mode:'replay',operationId:Operations[operation].id,
        inputHash,capturedAt:example.capture_date,sourceRef:`archive:api/examples/${Operations[operation].archive}.json`}};
    } catch {throw new ProviderFailure('INVALID_RESPONSE');}
  }
}

export type LiveOptions={token:string;fetchImpl?:typeof fetch;timeoutMs?:number;now?:()=>Date};
/** Server-only adapter. The integrating case service must authorize and confirm inputs before calling it. */
export class LiveLogismataProvider implements CalculationProvider {
  #token:string;private readonly transport:typeof fetch;private readonly timeout:number;
  private readonly now:()=>Date;private active=0;
  private readonly queue:{resolve:()=>void;reject:(e:ProviderFailure)=>void;signal?:AbortSignal;onAbort:()=>void}[]=[];
  constructor(options:LiveOptions) {
    if(!options.token.trim() || /[\r\n]/.test(options.token)) throw new ProviderFailure('UNAUTHORIZED');
    this.#token=options.token;this.transport=options.fetchImpl??fetch;this.timeout=options.timeoutMs??5000;this.now=options.now??(()=>new Date());
    if(!Number.isInteger(this.timeout)||this.timeout<10||this.timeout>5000) throw new RangeError('Timeout must be 10–5000 ms');
  }
  private async acquire(signal?:AbortSignal) {
    if(signal?.aborted) throw new ProviderFailure('CANCELLED');
    if(this.active<2){this.active++;return;}
    if(this.queue.length>=16) throw new ProviderFailure('BUSY');
    await new Promise<void>((resolve,reject)=> {
      const item={resolve,reject,...(signal?{signal}:{}),onAbort:()=>{}};
      item.onAbort=()=>{const i=this.queue.indexOf(item);if(i>=0)this.queue.splice(i,1);reject(new ProviderFailure('CANCELLED'));};
      signal?.addEventListener('abort',item.onAbort,{once:true});this.queue.push(item);
    });
  }
  private release() {
    const next=this.queue.shift();
    if(next){next.signal?.removeEventListener('abort',next.onAbort);next.resolve();}else this.active--;
  }
  private async boundedJson(response:Response):Promise<unknown> {
    if(!response.headers.get('content-type')?.includes('application/json') || !response.body)
      throw new ProviderFailure('INVALID_RESPONSE');
    const reader=response.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;
    try {
      while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
        if(bytes>1_000_000){await reader.cancel();throw new ProviderFailure('INVALID_RESPONSE');}chunks.push(value);}
      try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch {throw new ProviderFailure('INVALID_RESPONSE');}
    } finally {reader.releaseLock();}
  }
  async execute(operation:Operation,input:unknown,signal?:AbortSignal):Promise<NormalizedProviderResult> {
    const request=validateRequest(operation,input);const r=request as Record<string,unknown>;
    const thisYear=this.now().getUTCFullYear();
    for(const person of [r,r.Person1,r.Person2].filter(p=>p&&typeof p==='object') as Record<string,unknown>[])
      if(typeof person.BirthYear==='number'&&person.BirthYear>thisYear) throw new ProviderFailure('INVALID_INPUT');
    if(operation==='risk') for(const p of [r.Person1,r.Person2].filter(Boolean) as Record<string,unknown>[])
      if(typeof p.NeedDisability!=='number'||typeof p.NeedDeath!=='number'||
        ((p.NeedInPcDisability===true||p.NeedInPcDeath===true)&&typeof p.GrossIncome!=='number')) throw new ProviderFailure('INVALID_INPUT');
    if(operation==='retirement' && typeof r.NeedRetirement!=='number') throw new ProviderFailure('INVALID_INPUT');
    if(operation==='retirement' && r.NeedInPcRetirement===true &&
      [r.Person1,r.Person2].filter(Boolean).some(p=>typeof (p as Record<string,unknown>).GrossIncome!=='number'))
      throw new ProviderFailure('INVALID_INPUT');
    await this.acquire(signal);
    try {
      if(signal?.aborted) throw new ProviderFailure('CANCELLED');
      for(let attempt=0;attempt<2;attempt++) {
        const timeout=AbortSignal.timeout(this.timeout);const combined=signal?AbortSignal.any([timeout,signal]):timeout;
        try {
          const response=await this.transport(`${BASE_URL}/operation/standard/${Operations[operation].id}`,{
            method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal:combined,
            headers:{Authorization:`Bearer ${this.#token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(request)});
          if(response.status===401||response.status===403) {await response.body?.cancel().catch(()=>{});throw new ProviderFailure('UNAUTHORIZED');}
          if(response.status===429 || response.status>=500) {
            const header=response.headers.get('retry-after');
            const delay=header===null?100:/^\d+(\.\d+)?$/.test(header)?Number(header)*1000:Date.parse(header)-this.now().getTime();
            const retryable=attempt===0 && Number.isFinite(delay) && delay>=0 && delay<=1000;
            if(retryable){await response.body?.cancel();await new Promise(resolve=>setTimeout(resolve,delay));continue;}
            await response.body?.cancel().catch(()=>{});throw new ProviderFailure(response.status===429?'RATE_LIMITED':'UNAVAILABLE');
          }
          if(!response.ok) {await response.body?.cancel().catch(()=>{});throw new ProviderFailure('UNAVAILABLE');}
          const data=await this.boundedJson(response);
          let result;
          try {result=normalizeResponse(operation,request,data);}catch {throw new ProviderFailure('INVALID_RESPONSE');}
          return {...result,provenance:{mode:'live',operationId:Operations[operation].id,inputHash:providerInputHash(operation,request),
            capturedAt:this.now().toISOString(),sourceRef:`logismata:${Operations[operation].id}`}};
        } catch(error) {
          if(signal?.aborted) throw new ProviderFailure('CANCELLED');
          if(error instanceof ProviderFailure) throw error;
          if(attempt===0) continue;
          throw new ProviderFailure(timeout.aborted?'TIMEOUT':'UNAVAILABLE');
        }
      }
      throw new ProviderFailure('UNAVAILABLE');
    } finally {this.release();}
  }
}
