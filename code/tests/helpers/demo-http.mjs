import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {createLifeInsuranceApp} from '../../apps/api/dist/insurance/app.js';
import {SyntheticTestProvider} from './life-fixture.mjs';

export const credentials={customerAccessCode:'demo-customer-key-at-least-32-characters',reviewerAccessCode:'demo-reviewer-key-at-least-32-characters'};

/** A cookie session against the running test app, like a browser tab. */
export function client(base) {
  let cookie='',csrf='';
  async function call(method,path,body,{raw=false,headers={}}={}) {
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(method==='GET'?{}:{'X-CSRF-Token':csrf}),...headers},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
    const text=await r.text();let parsed=text;
    if(!raw){try{parsed=JSON.parse(text);}catch{/* not JSON */}}
    return {status:r.status,headers:r.headers,body:parsed};
  }
  return {call,
    set csrf(value){csrf=value;},
    async signIn(accessCode){const s=await call('POST','/api/sessions',{accessCode});assert.equal(s.status,201,JSON.stringify(s.body));csrf=s.body.csrfToken;return s.body;}};
}

/**
 * The backend over HTTP with the synthetic test calculator: by default in the demo start, with
 * the calculated Mueller case of a customer and a reviewer session alongside.
 */
export async function demoApp(t,options={}) {
  const directory=await mkdtemp(join(tmpdir(),'pax-demo-http-'));
  const {app,runtime}=await createLifeInsuranceApp({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials,demoStart:true,...options});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  await app.listen(0,'127.0.0.1');
  const base=await app.getUrl();
  const customer=client(base),reviewer=client(base);
  let path=null;
  if(options.demoStart!==false) {
    const started=await customer.call('POST','/api/demo/start',{locale:options.locale??'de'});
    assert.equal(started.status,201,JSON.stringify(started.body));
    customer.csrf=started.body.csrfToken;
    path=`/api/cases/${started.body.caseId}`;
  }
  return {base,runtime,customer,reviewer,path,
    current:async()=>(await customer.call('GET',path)).body,
    revision:async()=>(await customer.call('GET',path)).body.caseRevision};
}
