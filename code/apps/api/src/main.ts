import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DemoAppModule } from './app.module.js';
import { SafeDemoErrorFilter } from './demo/error.filter.js';
import { pathToFileURL } from 'node:url';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { createLifeInsuranceApp } from './insurance/app.js';

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
  const {app,runtime}=await createLifeInsuranceApp({providerMode:'live',token:process.env.LOGISMATA_BEARER_TOKEN??''});
  try{await app.listen(port,'127.0.0.1');}catch(error){await runtime.close();throw error;}
  console.info(`Pax life-insurance backend (live calculator): http://127.0.0.1:${port}/api/status`);
  console.info(`Local demo access codes: ${runtime.store.directory}/access-codes.json`);
}
