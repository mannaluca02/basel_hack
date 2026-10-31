import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLifeInsuranceApp} from '../../../api/dist/insurance/app.js';
import {openAiResponsesTransport} from '../../../api/dist/erni-dialog/responses.js';

// Dedicated ephemeral synthetic cases, separate from the normal local case database.
const directory=await mkdtemp(join(tmpdir(),'pax-voice-lab-'));
const port=Number(process.env.PORT??3030);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
const {app}=await createLifeInsuranceApp({dataDirectory:directory,providerMode:'replay',
  credentials:{customerAccessCode:'voice-lab-demo-customer-only-2026',reviewerAccessCode:'voice-lab-demo-reviewer-only-2026'},
  voice:{enabled:process.env.PAX_SYNTHETIC_VOICE_ENABLED==='1',
    ...(process.env.OPENAI_API_KEY?{openAiApiKey:process.env.OPENAI_API_KEY}:{}),
    ...(process.env.LIVE_MODEL?{liveModel:process.env.LIVE_MODEL}:{}),
    ...(process.env.LIVE_VOICE?{liveVoice:process.env.LIVE_VOICE}:{})},
  // Live intake extraction needs its own customer consent (extraction/consent); without key or voice, rules-v1 stays.
  modelExtraction:process.env.PAX_SYNTHETIC_VOICE_ENABLED==='1'&&process.env.OPENAI_API_KEY?{enabled:true,transport:openAiResponsesTransport(process.env.OPENAI_API_KEY)}:{}});
await app.listen(port,'127.0.0.1');
console.info(`Voice Lab API: http://127.0.0.1:${port}/api/status`);
console.info('Open http://localhost:4300 (debugging-app npm start). Public synthetic customer code: voice-lab-demo-customer-only-2026');
console.info(`Live GPT-Live configuration present: ${process.env.PAX_SYNTHETIC_VOICE_ENABLED==='1'&&!!process.env.OPENAI_API_KEY}. No provider call has been made.`);
let closing=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{
  if(closing)return;closing=true;await app.close();await rm(directory,{recursive:true,force:true});process.exit(0);
});
