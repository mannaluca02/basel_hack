import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT } from '../../../src/app/core/config/app-environment';
import { CUSTOMER_SESSION_KEY } from '../../../src/app/core/advisor/api/customer-api';
import { provideI18nTesting } from '../../../src/app/core/i18n/i18n-testing';
import { VoiceLabApi } from './voice-lab-api';
import { LabTrace, labTraceInterceptor } from './lab-trace';

it('routes a finalized turn with the owner CSRF cookie contract, shows actual failed payloads and redacts connection secrets', async () => {
  sessionStorage.setItem(CUSTOMER_SESSION_KEY,JSON.stringify({caseId:'case_1',csrfToken:'private-csrf'}));
  TestBed.configureTestingModule({providers:[provideHttpClient(withInterceptors([labTraceInterceptor])),provideHttpClientTesting(),provideI18nTesting(),
    {provide:APP_ENVIRONMENT,useValue:{apiBaseUrl:'/api',dataSource:'api'}}]});
  const api=TestBed.inject(VoiceLabApi),http=TestBed.inject(HttpTestingController),trace=TestBed.inject(LabTrace);
  trace.enabled.set(true);
  const work=api.post('voice/sessions/session_1/turns',{speaker:'customer',log:{text:'My annual gross income is 119000 CHF.'},sdp:'v=secret'});
  const rejected=expect(work).rejects.toMatchObject({status:409});
  const req=http.expectOne('/api/cases/case_1/voice/sessions/session_1/turns');
  expect(req.request.headers.get('X-CSRF-Token')).toBe('private-csrf');
  req.flush({code:'VOICE_SESSION_NOT_ACTIVE',token:'private-provider-token'},{status:409,statusText:'Conflict'});
  await rejected;
  const rendered=JSON.stringify(trace.entries());
  expect(rendered).toContain('VOICE_SESSION_NOT_ACTIVE');
  expect(rendered).toContain('119000');
  expect(rendered).not.toContain('private-');expect(rendered).not.toContain('v=secret');
  expect(trace.entries().map(entry=>entry.direction)).toEqual(['send','receive']);
  http.verify();sessionStorage.clear();
});

it('bounds in-memory traces and redacts nested connection data before retaining payloads',()=>{
  const trace=new LabTrace();trace.enabled.set(true);
  for(let i=0;i<90;i++)trace.add('local','diagnostic',{i,connection:{token:'never-retain',transport:{sdp:'never-retain'}},items:[{apiKey:'never-retain'}],text:'x'.repeat(100000)});
  expect(trace.entries()).toHaveLength(80);
  expect(trace.entries()[0].payload).toContain('"i": 10');
  expect(JSON.stringify(trace.entries())).not.toContain('never-retain');
  expect(trace.entries().every(entry=>entry.payload.length<17000)).toBe(true);
});

it('labels string and array truncation with original lengths even when the final payload fits under 16k',()=>{
  const trace=new LabTrace();trace.enabled.set(true);
  trace.add('receive','small lossy response',{text:'x'.repeat(8001),items:Array.from({length:101},(_,index)=>index)});
  const payload=JSON.parse(trace.entries()[0].payload);
  expect(payload.text._traceTruncation).toEqual({kind:'string',originalLength:8001,retainedLength:8000});
  expect(payload.text.preview).toHaveLength(8000);
  expect(payload.items.at(-1)._traceTruncation).toEqual({kind:'array',originalLength:101,retainedLength:100});
  expect(payload.items[99]).toBe(99);
});

it('labels final serialization and depth limits rather than displaying them as complete payloads',()=>{
  const trace=new LabTrace();trace.enabled.set(true);
  trace.add('receive','oversized',{first:'x'.repeat(10000),second:'y'.repeat(10000)});
  expect(trace.entries()[0].payload).toMatch(/\[truncated serialized payload; originalLength=\d+; retainedLength=16000\]$/);
  let nested:unknown='leaf';
  for(let i=0;i<20;i++)nested={nested};
  trace.add('receive','deep',nested);
  expect(trace.entries()[1].payload).toContain('"kind": "depth"');
  expect(trace.entries()[1].payload).toContain('"retainedDepth": 16');
});
