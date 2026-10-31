import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DemoAppModule } from './app.module.js';
import { SafeDemoErrorFilter } from './demo/error.filter.js';
import { pathToFileURL } from 'node:url';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { createLifeInsuranceApp } from './insurance/app.js';
import { openAiResponsesTransport } from './erni-dialog/responses.js';

/**
 * Dario's voice agent (Paxi, code/voice-agent) runs in this process instead of a second one. It
 * keeps its own port (3100): its page, origin checks and the app's postMessage link rely on that
 * origin. It talks to this backend over HTTP like any client. PAX_VOICE_AGENT=0 leaves it off;
 * a missing install or a taken port only costs Paxi, never the backend.
 */
async function startVoiceAgent() {
  if(process.env.PAX_VOICE_AGENT==='0')return;
  process.env.PAX_VOICE_AGENT_PORT??='3100';
  try{
    const entry=new URL('../../../voice-agent/server.mjs',import.meta.url).href;
    const agent=await import(entry) as {startVoiceAgent():Promise<unknown>};
    await agent.startVoiceAgent();
  }catch(error){
    const busy=(error as {code?:string})?.code==='EADDRINUSE';
    console.warn(`Voice agent (Paxi) not started: ${busy?`port ${process.env.PAX_VOICE_AGENT_PORT} is taken (a separate Paxi still running?)`:`${error instanceof Error?error.message:String(error)} (npm install in code/voice-agent?)`}`);
  }
}

export async function createDemoApp() {
  const app=await NestFactory.create<NestExpressApplication>(DemoAppModule,{logger:false,bodyParser:false});
  app.useBodyParser('json',{limit:'32kb',strict:true});
  app.useGlobalFilters(new SafeDemoErrorFilter());
  app.use((_req:IncomingMessage,res:ServerResponse,next:()=>void)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');next();});
  app.enableCors({origin:['http://localhost:4200','http://127.0.0.1:4200'],methods:['GET','POST'],credentials:false});
  app.enableShutdownHooks();return app;
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port=Number(process.env.PORT??3000);
  if(!Number.isInteger(port)||port<1||port>65535) throw new Error('Invalid PORT');
  // The live voice in the app needs the model extraction (model-v1); without a key it stays off.
  const extraction=process.env.PAX_SYNTHETIC_EXTRACTION_ENABLED==='1'||process.env.PAX_SYNTHETIC_VOICE_ENABLED==='1';
  const modelExtraction=extraction&&process.env.OPENAI_API_KEY?{enabled:true,transport:openAiResponsesTransport(process.env.OPENAI_API_KEY)}:{enabled:process.env.PAX_SYNTHETIC_EXTRACTION_ENABLED==='1'};
  const {app,runtime}=await createLifeInsuranceApp({providerMode:'live',demoStart:process.env.PAX_DEMO_START==='1',token:process.env.LOGISMATA_BEARER_TOKEN??'',modelExtraction,voice:{enabled:process.env.PAX_SYNTHETIC_VOICE_ENABLED==='1',
    ...(process.env.OPENAI_API_KEY?{openAiApiKey:process.env.OPENAI_API_KEY}:{}),
    ...(process.env.ELEVENLABS_API_KEY?{elevenLabsApiKey:process.env.ELEVENLABS_API_KEY}:{}),
    ...(process.env.ELEVENLABS_AGENT_ID?{elevenLabsAgentId:process.env.ELEVENLABS_AGENT_ID}:{}),
    ...(process.env.LIVE_MODEL?{liveModel:process.env.LIVE_MODEL}:{}),...(process.env.LIVE_VOICE?{liveVoice:process.env.LIVE_VOICE}:{})}});
  try{await app.listen(port,'127.0.0.1');}catch(error){await runtime.close();throw error;}
  await startVoiceAgent();
  console.info(`Pax life-insurance backend (live calculator): http://127.0.0.1:${port}/api/status`);
  if(process.env.PAX_DEMO_START==='1')console.info('Demo start without access code: POST /api/demo/start');
  console.info(`Local demo access codes: ${runtime.store.directory}/access-codes.json`);
}
