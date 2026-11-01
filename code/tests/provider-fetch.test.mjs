import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {providerFetch} from '../apps/api/dist/provider-fetch.js';
import {OpenAiLiveGateway,ElevenLabsGateway} from '../apps/api/dist/voice/providers.js';
import {LiveLogismataProvider} from '../apps/api/dist/logismata/client.js';
import {openAiResponsesTransport} from '../apps/api/dist/erni-dialog/responses.js';

test('provider fetch strips cookies, omits credentials and preserves authorization and cancellation',async()=>{
  const signal=AbortSignal.timeout(1000);
  await providerFetch(async(url,init)=>{
    assert.equal(url,'https://example.com/');assert.equal(init.redirect,'manual');assert.equal(init.credentials,'omit');
    assert.equal(init.headers.has('cookie'),false);assert.equal(init.headers.get('authorization'),'Bearer test');assert.equal(init.signal,signal);
    return new Response('ok');
  },'https://example.com/',{signal,headers:{Cookie:'private',Authorization:'Bearer test'}});
});
test('all 3xx responses are cancelled and refused without reading their bodies',async()=>{
  for(let status=300;status<400;status++){
    let cancelled=false;
    await assert.rejects(providerFetch(async()=>new Response(status===304?null:new ReadableStream({cancel(){cancelled=true;}}),{status}),
      'https://example.com/',{}),/Provider redirect refused/);
    assert.equal(cancelled,status!==304);
  }
});
test('real Node fetch never follows redirects and aborts both headers and response bodies',async t=>{
  let followed=0;
  const server=createServer((req,res)=>{
    if(req.url==='/redirect'){res.writeHead(302,{Location:'/target'});res.end();}
    else if(req.url==='/target'){followed++;res.end('secret');}
    else if(req.url==='/body'){res.writeHead(200);res.write('partial');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  await assert.rejects(providerFetch(fetch,`${base}/redirect`,{}),/Provider redirect refused/);assert.equal(followed,0);
  await assert.rejects(providerFetch(fetch,`${base}/headers`,{signal:AbortSignal.timeout(50)}),e=>e.name==='TimeoutError');
  const response=await providerFetch(fetch,`${base}/body`,{signal:AbortSignal.timeout(50)});
  await assert.rejects(response.text(),e=>e.name==='AbortError'||e.name==='TimeoutError');
  const signal=AbortSignal.abort();await assert.rejects(providerFetch(fetch,base,{signal}),e=>e.name==='AbortError');
});
test('all provider callers map redirects to their existing safe failures',async t=>{
  const redirect=async()=>new Response('decision triggers',{status:307,headers:{Location:'https://example.com/'}});
  const live=new OpenAiLiveGateway('key',undefined,undefined,redirect);
  await assert.rejects(live.open({sdp:'v=0',locale:'de',prompt:''},new AbortController().signal),e=>e.code==='VOICE_PROVIDER_UNAVAILABLE');
  await assert.rejects(live.stop('id'),e=>e.code==='VOICE_PROVIDER_CLOSE_FAILED');
  await assert.rejects(new ElevenLabsGateway('key','id',redirect).open({locale:'de',prompt:''},new AbortController().signal),e=>e.code==='VOICE_PROVIDER_UNAVAILABLE');
  await assert.rejects(new LiveLogismataProvider({token:'key',fetchImpl:redirect}).execute('saving3aLimits',{}),e=>e.code==='UNAVAILABLE');
  t.mock.method(globalThis,'fetch',redirect);
  await assert.rejects(openAiResponsesTransport('key')({},new AbortController().signal),/Provider redirect refused/);
});
