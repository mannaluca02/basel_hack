import {redactDiagnostic} from '../../api/dist/insurance/http.js';
import {DurableObject} from 'cloudflare:workers';
import {handleAsNodeRequest} from 'cloudflare:node';
import {createLifeInsuranceApp} from '../../api/dist/insurance/app.js';
import {ProductDocuments} from '../../api/dist/insurance/documents.js';
import {LiveLogismataProvider} from '../../api/dist/logismata/client.js';
import {normalizePersonaDraft} from '../../api/dist/insurance/demo-journey.js';
import {configureVoicePrompt} from '../../api/dist/voice/prompt.js';
import prompt from '../generated/prompt.json';
import manifest from '../generated/documents.json';
import {workerOptions,type WorkerConfig} from './config.js';
import persona from '../../../fixtures/personas/mueller.json';
import {durableStore,type StoreSecrets} from './durable-store.js';
import type {LifeRuntime} from '../../api/dist/insurance/runtime.js';

interface Env extends StoreSecrets {ASSETS:Fetcher;LIFE: DurableObjectNamespace<LifeInsuranceObject>}

export class LifeInsuranceObject extends DurableObject<Env> {
  private boot?: Promise<void>;
  private port?: number;
  private runtime?: LifeRuntime;
  private store?: Awaited<ReturnType<typeof durableStore>>;

  /** Shared by concurrent requests; a failed boot is cleaned up and retried by the next request or alarm. */
  private ready() {
    return this.boot??=this.start().catch(error=>{console.error(JSON.stringify({event:'do_boot_failed',...failure(error)}));this.boot=undefined;throw error;});
  }

  private async start() {
    const started=Date.now();
    let parts:Awaited<ReturnType<typeof createLifeInsuranceApp>>|undefined;
    try {
      const store=this.store=await durableStore(this.ctx.storage,this.env);
      const credentials=await store.credentials();
      const options=workerOptions(this.env as unknown as WorkerConfig);
      configureVoicePrompt({...prompt,loader:{skillsPrompt:skills=>skills.map(skill=>prompt.sections[skill.file as keyof typeof prompt.sections]).join('\n\n')}});
      const documents=await ProductDocuments.fromAssets(manifest,this.env.ASSETS);
      // Defer credential validation until calculation so status/demo remain usable without local secrets.
      let provider:LiveLogismataProvider|undefined;
      parts=await createLifeInsuranceApp({
        ...options,personaDraft:async(_id,today)=>normalizePersonaDraft(persona,today),
        store,internalTimers:false,credentials,documents,
        provider:{execute(...args:Parameters<LiveLogismataProvider['execute']>){return (provider??=new LiveLogismataProvider({token:options.token??''})).execute(...args);}},
      });
      const {app,runtime}=parts;this.runtime=runtime;
      await runtime.sweepRetention();await runtime.sweepVoice();
      await app.listen(0);
      const address=app.getHttpServer().address();
      if(!address||typeof address==='string')throw new Error('Expected Node HTTP routing port');
      this.port=address.port;
      console.log(JSON.stringify({event:'nest-do-boot',milliseconds:Date.now()-started}));
    } catch(error) {
      // Leave nothing half-started behind, so the next request or alarm boots from scratch.
      await parts?.app.close().catch(()=>{});await parts?.runtime.close().catch(()=>{});
      this.runtime=this.store=this.port=undefined;throw error;
    }
  }

  async alarm() {
    try {
      await this.ready();
      await this.runtime!.sweepVoice();await this.runtime!.sweepRetention();
      // Transactions also arm alarms, including writes from background engine work.
      await this.store!.arm();
    }catch(error){console.error(JSON.stringify({event:'alarm_failed',...failure(error)}));throw error;}
  }

  async fetch(request: Request) {
    await this.ready();
    const headers=new Headers(request.headers);
    headers.set('x-forwarded-proto',new URL(request.url).protocol.slice(0,-1));
    headers.set('host',new URL(request.url).host);
    return handleAsNodeRequest(this.port!,new Request(request,{headers}));
  }
}

export default {
  async fetch(request: Request,env: Env) {
    const path=new URL(request.url).pathname;
    if(path==='/api'||path.startsWith('/api/'))return env.LIFE.getByName('singleton').fetch(request);
    if(path==='/_products'||path.startsWith('/_products/'))return new Response('Not found',{status:404});
    const response=await env.ASSETS.fetch(request);
    const headers=new Headers(response.headers);
    headers.set('X-Content-Type-Options','nosniff');
    if(headers.get('Content-Type')?.includes('text/html')) {
      headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' https://api.openai.com wss://api.openai.com https://api.elevenlabs.io wss://api.elevenlabs.io; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
      headers.set('Permissions-Policy','microphone=(self)');
      headers.set('Referrer-Policy','strict-origin-when-cross-origin');
    }
    if(headers.get('Content-Type')?.includes('text/html')||path==='/ngsw.json'||path==='/ngsw-worker.js')headers.set('Cache-Control','no-cache');
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  },
};

function failure(error:unknown){return {error:error instanceof Error?error.name:'Error',message:redactDiagnostic(error instanceof Error?error.message:String(error)).slice(0,300)};}
