import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DemoAppModule } from './app.module.js';
import { SafeDemoErrorFilter } from './demo/error.filter.js';
import { pathToFileURL } from 'node:url';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { createLifeInsuranceApp } from './insurance/app.js';
import { liveAppOptions,livePort,startVoiceAgent } from './live-options.js';

export async function createDemoApp() {
  const app=await NestFactory.create<NestExpressApplication>(DemoAppModule,{logger:false,bodyParser:false});
  app.useBodyParser('json',{limit:'32kb',strict:true});
  app.useGlobalFilters(new SafeDemoErrorFilter());
  app.use((_req:IncomingMessage,res:ServerResponse,next:()=>void)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');next();});
  app.enableCors({origin:['http://localhost:4200','http://127.0.0.1:4200'],methods:['GET','POST'],credentials:false});
  app.enableShutdownHooks();return app;
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port=livePort(process.env);
  const {app,runtime}=await createLifeInsuranceApp(liveAppOptions(process.env));
  try{await app.listen(port,'127.0.0.1');}catch(error){await runtime.close();throw error;}
  const paxi=await startVoiceAgent(process.env);
  if(paxi.warning)console.warn(paxi.warning);
  console.info(`Pax life-insurance backend (live calculator): http://127.0.0.1:${port}/api/status`);
  if(process.env.PAX_DEMO_START==='1')console.info('Demo start without access code: POST /api/demo/start');
  console.info(`Local demo access codes: ${runtime.store.directory}/access-codes.json`);
}
