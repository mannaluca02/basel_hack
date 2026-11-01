import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {OpenAiLiveGateway} from '../apps/api/dist/voice/providers.js';
import {EMOTION_CHOICES,EMOTION_TRIGGERS} from '../apps/api/dist/voice/emotions.js';

// FE-29: Paxi's reply emotions in the app's live voice come from GPT-Live Decisions triggers.
const session=()=>new Response(JSON.stringify({session:{id:'sess_1'},transport:{type:'webrtc',sdp:'v=answer'}}),{status:200});
const open=gateway=>gateway.open({sdp:'v=offer',locale:'de',prompt:'synthetic'},new AbortController().signal);

test('a live session asks GPT-Live to classify both transcript directions with the nine emotions',async()=>{
  const calls=[];
  await open(new OpenAiLiveGateway('key',undefined,undefined,async(url,init)=>{calls.push(JSON.parse(init.body));return session();}));
  assert.equal(calls.length,1);
  const triggers=calls[0].session.triggers;
  assert.deepEqual(triggers.map(t=>[t.type,t.event_type,t.decisions.questions[0].name]),[
    ['decisions','session.input_transcript.delta','reply_emotion'],
    ['decisions','session.output_transcript.delta','emotion'],
  ]);
  assert.deepEqual(triggers[0].decisions.questions[0].choices.map(c=>c.value),EMOTION_CHOICES.map(c=>c.value));
});

test('a project that may not use Decisions still gets the voice, without emotions',async()=>{
  const calls=[];
  const live=await open(new OpenAiLiveGateway('key',undefined,undefined,async(url,init)=>{
    const body=JSON.parse(init.body);calls.push(body);
    return body.session.triggers?new Response(JSON.stringify({error:{message:'Decisions triggers are not enabled for this project'}}),{status:403}):session();
  }));
  assert.equal(calls.length,2);
  assert.equal(calls[1].session.triggers,undefined);
  assert.equal(live.providerSessionId,'sess_1');
});

test('other refusals are not retried and leak nothing',async()=>{
  let calls=0;
  await assert.rejects(open(new OpenAiLiveGateway('key',undefined,undefined,async()=>{calls++;return new Response('rate limited, secret detail',{status:429});})),
    e=>e.code==='VOICE_PROVIDER_UNAVAILABLE'&&!String(e.message).includes('secret'));
  assert.equal(calls,1);
  let failing=0;
  await assert.rejects(open(new OpenAiLiveGateway('key',undefined,undefined,async()=>{failing++;return new Response('decision service down',{status:503});})),e=>e.code==='VOICE_PROVIDER_UNAVAILABLE');
  assert.equal(failing,1,'a server error is never retried without triggers');
});

test('the backend\'s emotions are exactly the avatar\'s and the web app\'s',async()=>{
  const values=EMOTION_CHOICES.map(c=>c.value);
  const avatar=await readFile(new URL('../avatar-prototype/pax-avatar.d.ts',import.meta.url),'utf8');
  for(const value of values)assert.match(avatar,new RegExp(`"${value}"`),value);
  const web=await readFile(new URL('../apps/web/src/app/core/voice/emotions.ts',import.meta.url),'utf8');
  assert.deepEqual([...web.matchAll(/^  '([a-z_]+)',$/gm)].map(m=>m[1]),values);
  assert.equal(EMOTION_TRIGGERS.length,2);
});
