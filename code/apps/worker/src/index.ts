import {DurableObject} from 'cloudflare:workers';
import {handleAsNodeRequest} from 'cloudflare:node';
import {randomBytes} from 'node:crypto';
import {createLifeInsuranceApp} from '../../api/dist/insurance/app.js';
import {ProductDocuments} from '../../api/dist/insurance/documents.js';
import {LiveLogismataProvider} from '../../api/dist/logismata/client.js';
import {normalizePersonaDraft} from '../../api/dist/insurance/demo-journey.js';
import {configureVoicePrompt} from '../../api/dist/voice/prompt.js';
import prompt from '../generated/prompt.json';
import manifest from '../generated/documents.json';
import {workerOptions,type WorkerConfig} from './config.js';
import persona from '../../../fixtures/personas/mueller.json';

import {memoryStore} from './memory-store.js';

interface Env {ASSETS:Fetcher;LIFE: DurableObjectNamespace<LifeInsuranceObject>}

export class LifeInsuranceObject extends DurableObject<Env> {
  private boot?: Promise<void>;
  private port?: number;

  private async start() {
    const started=Date.now();
    const credentials={customerAccessCode:randomBytes(32).toString('hex'),reviewerAccessCode:randomBytes(32).toString('hex')};
    const options=workerOptions(this.env as unknown as WorkerConfig);
    configureVoicePrompt({...prompt,loader:{skillsPrompt:skills=>skills.map(skill=>prompt.sections[skill.file as keyof typeof prompt.sections]).join('\n\n')}});
    const documents=await ProductDocuments.fromAssets(manifest,this.env.ASSETS);
    // Defer credential validation until calculation so status/demo remain usable without local secrets.
    let provider:LiveLogismataProvider|undefined;
    const {app}=await createLifeInsuranceApp({
      ...options,personaDraft:async(_id,today)=>normalizePersonaDraft(persona,today),
      store:memoryStore(credentials),credentials,documents,
      provider:{execute(...args:Parameters<LiveLogismataProvider['execute']>){return (provider??=new LiveLogismataProvider({token:options.token??''})).execute(...args);}},
    });
    await app.listen(0);
    const address=app.getHttpServer().address();
    if(!address||typeof address==='string')throw new Error('Expected Node HTTP routing port');
    this.port=address.port;
    console.log(JSON.stringify({spike:'nest-do-boot',milliseconds:Date.now()-started}));
  }

  async fetch(request: Request) {
    await (this.boot??=this.start());
    const headers=new Headers(request.headers);
    headers.set('x-forwarded-proto',new URL(request.url).protocol.slice(0,-1));
    headers.set('host',new URL(request.url).host);
    return handleAsNodeRequest(this.port!,new Request(request,{headers}));
  }
}

export default {
  fetch(request: Request,env: Env) {
    if(!new URL(request.url).pathname.startsWith('/api/'))return new Response('Not found',{status:404});
    return env.LIFE.getByName('singleton').fetch(request);
  },
};
