import {test} from 'node:test';
import assert from 'node:assert/strict';
import {liveAppOptions,livePort,startVoiceAgent} from '../apps/api/dist/live-options.js';

// What `npm start` (apps/api/src/main.ts) builds from the root .env.

test('the port is PORT or 3000 and must be a real TCP port',()=>{
  assert.equal(livePort({}),3000);
  assert.equal(livePort({PORT:'3001'}),3001);
  for(const PORT of ['0','65536','abc','30.5'])assert.throws(()=>livePort({PORT}),/Invalid PORT/,PORT);
});

test('without flags: live calculator, no demo start, voice and extraction off, no keys',()=>{
  const options=liveAppOptions({LOGISMATA_BEARER_TOKEN:'token'});
  assert.equal(options.providerMode,'live');
  assert.equal(options.token,'token');
  assert.equal(options.demoStart,false);
  assert.deepEqual(options.modelExtraction,{enabled:false});
  assert.deepEqual(options.voice,{enabled:false});
});

test('the live voice wires model-v1 when voice or extraction is on and a key exists',()=>{
  for(const flag of ['PAX_SYNTHETIC_VOICE_ENABLED','PAX_SYNTHETIC_EXTRACTION_ENABLED']) {
    const options=liveAppOptions({[flag]:'1',OPENAI_API_KEY:'sk-test'});
    assert.equal(options.modelExtraction.enabled,true,flag);
    assert.equal(typeof options.modelExtraction.transport,'function',flag);
  }
  // Without a key the extraction stays as the flag says, without a transport.
  assert.deepEqual(liveAppOptions({PAX_SYNTHETIC_VOICE_ENABLED:'1'}).modelExtraction,{enabled:false});
  assert.deepEqual(liveAppOptions({PAX_SYNTHETIC_EXTRACTION_ENABLED:'1'}).modelExtraction,{enabled:true});
});

test('voice providers and demo start come from their variables only',()=>{
  const options=liveAppOptions({PAX_DEMO_START:'1',PAX_SYNTHETIC_VOICE_ENABLED:'1',OPENAI_API_KEY:'sk-test',
    ELEVENLABS_API_KEY:'el-key',ELEVENLABS_AGENT_ID:'agent',LIVE_MODEL:'gpt-live-1',LIVE_VOICE:'juni'});
  assert.equal(options.demoStart,true);
  assert.deepEqual(options.voice,{enabled:true,openAiApiKey:'sk-test',elevenLabsApiKey:'el-key',elevenLabsAgentId:'agent',liveModel:'gpt-live-1',liveVoice:'juni'});
  assert.equal(liveAppOptions({PAX_DEMO_START:'true'}).demoStart,false,'only "1" switches it on');
});

test('Paxi starts only with PAX_VOICE_AGENT=1, on port 3100 unless set',async()=>{
  let loads=0;
  const module={startVoiceAgent:async()=>{loads++;}};
  assert.deepEqual(await startVoiceAgent({},async()=>module),{started:false});
  assert.deepEqual(await startVoiceAgent({PAX_VOICE_AGENT:'0'},async()=>module),{started:false});
  assert.equal(loads,0);
  const env={PAX_VOICE_AGENT:'1'};
  assert.deepEqual(await startVoiceAgent(env,async()=>module),{started:true});
  assert.equal(env.PAX_VOICE_AGENT_PORT,'3100');
  const custom={PAX_VOICE_AGENT:'1',PAX_VOICE_AGENT_PORT:'3999'};
  await startVoiceAgent(custom,async()=>module);
  assert.equal(custom.PAX_VOICE_AGENT_PORT,'3999');
});

test('a taken port or a missing install only costs Paxi, with a readable warning',async()=>{
  const busy=Object.assign(new Error('listen EADDRINUSE'),{code:'EADDRINUSE'});
  const taken=await startVoiceAgent({PAX_VOICE_AGENT:'1'},async()=>({startVoiceAgent:async()=>{throw busy;}}));
  assert.equal(taken.started,false);
  assert.match(taken.warning,/port 3100 is taken/);
  const missing=await startVoiceAgent({PAX_VOICE_AGENT:'1'},async()=>{throw new Error("Cannot find package 'express'");});
  assert.match(missing.warning,/Cannot find package 'express'.*npm install in code\/voice-agent/);
  const odd=await startVoiceAgent({PAX_VOICE_AGENT:'1'},async()=>{throw 'plain';});
  assert.match(odd.warning,/plain/);
});
