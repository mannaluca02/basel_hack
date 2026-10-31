import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { tap } from 'rxjs';

export interface TraceEntry {
  readonly id:number;
  readonly at:string;
  readonly direction:'send'|'receive'|'local';
  readonly route:string;
  readonly payload:string;
  readonly status?:number;
  readonly correlation:string;
}

/** Ephemeral diagnostics. Never retains headers, SDP, connection tokens, or access codes. */
@Injectable({providedIn:'root'})
export class LabTrace {
  readonly enabled=signal(false);
  readonly entries=signal<readonly TraceEntry[]>([]);
  private sequence=0;
  add(direction:TraceEntry['direction'],route:string,payload:unknown,status?:number,correlation=''):void {
    if(!this.enabled())return;
    const serialized=JSON.stringify(redact(payload),null,2) ?? 'null';
    const clipped=serialized.length>16000;
    const entry={id:++this.sequence,at:new Date().toISOString(),direction,route,payload:serialized.slice(0,16000)+(clipped?`\n[truncated serialized payload; originalLength=${serialized.length}; retainedLength=16000]`:''),status,correlation};
    this.entries.update(entries=>[...entries.slice(-79),entry]);
  }
  clear():void {this.entries.set([]);}
}

function redact(value:unknown,depth=0):unknown {
  if(depth>16)return {_traceTruncation:{kind:'depth',retainedDepth:16,originalType:Array.isArray(value)?'array':typeof value,
    ...(typeof value==='string'||Array.isArray(value)?{originalLength:value.length}:{})}};
  if(Array.isArray(value)) {
    const retained=value.slice(0,100).map(v=>redact(v,depth+1));
    if(value.length>100)retained.push({_traceTruncation:{kind:'array',originalLength:value.length,retainedLength:100}});
    return retained;
  }
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[
    key, /token|secret|password|accessCode|sdp|authorization|cookie|api.?key|^connection$/i.test(key)?'[redacted]':redact(v,depth+1),
  ]));
  return typeof value==='string'&&value.length>8000?
    {_traceTruncation:{kind:'string',originalLength:value.length,retainedLength:8000},preview:value.slice(0,8000)}:value;
}

export const labTraceInterceptor:HttpInterceptorFn=(req,next)=>{
  const trace=inject(LabTrace);
  if(!trace.enabled()||!req.url.includes('/api/'))return next(req);
  const correlation=crypto.randomUUID();
  const route=`${req.method} ${req.url.split('?')[0]}`;
  trace.add('send',route,req.body,undefined,correlation);
  return next(req).pipe(tap({
    next:event=>{if(event instanceof HttpResponse)trace.add('receive',route,event.body,event.status,correlation);},
    error:(error:unknown)=>trace.add('receive',route,error instanceof HttpErrorResponse?error.error:{code:'TRANSPORT'},error instanceof HttpErrorResponse?error.status:0,correlation),
  }));
};
