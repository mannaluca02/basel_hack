import 'reflect-metadata';
import {VoiceModule} from '../voice/module.js';
import { Module,type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { IncomingMessage,ServerResponse } from 'node:http';
import { LifeHttpModule,SafeLifeErrorFilter } from './http.js';
import { createLifeRuntime,type RuntimeOptions } from './runtime.js';

@Module({})
class LifeApplicationModule {}

export async function createLifeInsuranceApp(options:RuntimeOptions={},featureModules:NonNullable<DynamicModule['imports']>=[]) {
  const runtime=await createLifeRuntime(options);
  try {
    const app=await NestFactory.create<NestExpressApplication>({module:LifeApplicationModule,imports:[LifeHttpModule.register(runtime),VoiceModule,...featureModules]},{logger:false,bodyParser:false});
    app.use((_req:IncomingMessage,res:ServerResponse,next:()=>void)=>{
      res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
      res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");next();
    });
    app.useBodyParser('json',{limit:'192kb',strict:true});app.useGlobalFilters(new SafeLifeErrorFilter());
    app.enableCors({origin:['http://localhost:4200','http://127.0.0.1:4200'],credentials:true,methods:['GET','POST','PUT','PATCH','DELETE']});
    app.enableShutdownHooks();return {app,runtime};
  }catch(e){await runtime.close();throw e;}
}
