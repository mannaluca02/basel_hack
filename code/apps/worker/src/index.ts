import {DurableObject} from 'cloudflare:workers';
import {handleAsNodeRequest} from 'cloudflare:node';
import {createLifeInsuranceApp} from '../../api/dist/insurance/app.js';
import {ProductDocuments} from '../../api/dist/insurance/documents.js';
import {ProviderFailure} from '../../api/dist/logismata/client.js';
import persona from '../../../fixtures/personas/mueller.json';
import {DraftSchema} from '@pax/contracts';
import {durableStore,type StoreSecrets} from './durable-store.js';
import type {LifeRuntime} from '../../api/dist/insurance/runtime.js';

interface Env extends StoreSecrets {LIFE: DurableObjectNamespace<LifeInsuranceObject>}

export class LifeInsuranceObject extends DurableObject<Env> {
  private boot?: Promise<void>;
  private port?: number;
  private runtime?: LifeRuntime;
  private store?: Awaited<ReturnType<typeof durableStore>>;

  private async start() {
    const started=Date.now();
    const store=this.store=await durableStore(this.ctx.storage,this.env);
    const credentials=await store.credentials();
    // shortcut: no PDFs or calculator transport in this spike; replace with real asset/provider injection.
    const documents=ProductDocuments.empty();
    const {app,runtime}=await createLifeInsuranceApp({
      personaDraft:async()=>{
        const draft=DraftSchema.parse(structuredClone(persona.draft));
        const financial=draft.financial!;financial.valuationDate=new Date().toISOString().slice(0,10);
        for(const asset of financial.assets)if(asset.availableFrom<financial.valuationDate)asset.availableFrom=financial.valuationDate;
        return draft;
      },
      store,internalTimers:false,credentials,documents,demoStart:true,providerMode:'test',
      provider:{async execute(){throw new ProviderFailure('UNAVAILABLE');}},
    });
    this.runtime=runtime;
    await runtime.sweepRetention();await runtime.sweepVoice();
    await app.listen(0);
    const address=app.getHttpServer().address();
    if(!address||typeof address==='string')throw new Error('Expected Node HTTP routing port');
    this.port=address.port;
    console.log(JSON.stringify({spike:'nest-do-boot',milliseconds:Date.now()-started}));
  }

  async alarm() {
    await (this.boot??=this.start());
    await this.runtime!.sweepVoice();await this.runtime!.sweepRetention();
    // Transactions also arm alarms, including writes from background engine work.
    await this.store!.arm();
  }

  async fetch(request: Request) {
    await (this.boot??=this.start());
    return handleAsNodeRequest(this.port!,request);
  }
}

export default {
  fetch(request: Request,env: Env) {
    if(!new URL(request.url).pathname.startsWith('/api/'))return new Response('Not found',{status:404});
    return env.LIFE.getByName('singleton').fetch(request);
  },
};
