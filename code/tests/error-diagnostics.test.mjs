import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SafeLifeErrorFilter} from '../apps/api/dist/insurance/http.js';
import {WorkflowError} from '../apps/api/dist/insurance/types.js';
import {z} from 'zod';
import {formatEvent} from '../apps/worker/scripts/diagnose.mjs';

test('error filter is quiet by default and logs safe structured diagnostics when enabled',()=>{
  const warnings=[],errors=[],warn=console.warn,error=console.error;
  console.warn=line=>warnings.push(JSON.parse(line));console.error=line=>errors.push(JSON.parse(line));
  try{
    const req={method:'POST',url:'/api/cases/12345678-1234-1234-1234-123456789abc/voice?token=SECRET',headers:{cookie:'SECRET'},body:{name:'Customer'},actor:{sessionHash:'private-hash'}};
    const res={setHeader(){},status(){return this;},json(){}};
    const host={switchToHttp:()=>({getRequest:()=>req,getResponse:()=>res})};
    const conflict=new WorkflowError('CSRF_INVALID',403,['profile.name']);
    new SafeLifeErrorFilter().catch(conflict,host);assert.equal(warnings.length,0);
    new SafeLifeErrorFilter(true).catch(conflict,host);
    assert.deepEqual(warnings[0],{event:'api_error',method:'POST',path:'/api/cases/12345678/voice',status:403,code:'CSRF_INVALID',fields:['profile.name'],case:'12345678',session:createHash('sha256').update('private-hash').digest('hex').slice(0,8)});
    const parsed=z.object({age:z.number()}).safeParse({age:'Customer'});
    new SafeLifeErrorFilter(true).catch(parsed.error,host);assert.deepEqual(warnings[1].fields,['age']);
    new SafeLifeErrorFilter(true).catch(new Error('token=SECRET broken'),host);
    assert.equal(errors[0].error,'Error');assert.equal(errors[0].message,'[REDACTED] broken');assert.equal(errors[0].stack.length,3);
    assert.ok(!JSON.stringify([...warnings,...errors]).includes('SECRET'));
  }finally{console.warn=warn;console.error=error;}
});

test('diagnose formats local and tail logs and redacts credentials',()=>{
  const log={event:'api_error',status:409,code:'STALE_CONTEXT',method:'POST',path:'/api/cases/12345678/voice',case:'12345678'};
  assert.deepEqual(formatEvent(log),['local 409 STALE_CONTEXT POST /api/cases/12345678/voice case=12345678']);
  assert.equal(formatEvent({logs:[{message:[JSON.stringify(log)]}]}).length,1);
  assert.deepEqual(formatEvent({exceptions:[{name:'Error',message:'Bearer abc123'}],outcome:'exception'}),['local exception Error: [REDACTED]','local outcome=exception']);
  const row={event:{request:{method:'GET',url:'https://x/api/status?token=secret'},response:{status:200}},outcome:'ok'};
  assert.deepEqual(formatEvent(row),[]);assert.deepEqual(formatEvent(row,true),['local GET /api/status 200']);
});
