import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildVoicePrompt,configureVoicePrompt} from '../../api/dist/voice/prompt.js';
import {personaDraft,normalizePersonaDraft} from '../../api/dist/insurance/demo-journey.js';
import {ProductDocuments} from '../../api/dist/insurance/documents.js';
const root=new URL('../',import.meta.url);
const prompt=JSON.parse(await readFile(new URL('generated/prompt.json',root)));
const settings=[{}, {skillIds:[]}, {skillIds:[prompt.skills[0].file],timeBudgetMinutes:5}];
const node=await Promise.all(settings.map(s=>buildVoicePrompt('de',s)));
configureVoicePrompt({...prompt,loader:{skillsPrompt:skills=>skills.map(s=>prompt.sections[s.file]).join('\n\n')}});
assert.deepEqual(await Promise.all(settings.map(s=>buildVoicePrompt('de',s))),node);
const today=new Date('2026-11-01');
assert.deepEqual(normalizePersonaDraft(JSON.parse(await readFile(new URL('../../fixtures/personas/mueller.json',root))),today),await personaDraft('mueller',today));
const manifest=JSON.parse(await readFile(new URL('generated/documents.json',root)));
const assets={async fetch(request){return new Response(await readFile(new URL('assets'+new URL(request.url).pathname,root)));}};
await ProductDocuments.fromAssets(manifest,assets);
await assert.rejects(ProductDocuments.fromAssets(manifest,{async fetch(){return new Response('corrupted');}}),{code:'DOCUMENT_INTEGRITY_CHANGED'});
console.log('Prompt equality (default, empty and selected skills), persona equality, 12 PDF hashes and corruption rejection: passed');

const {mkdtemp,rm}=await import('node:fs/promises');
const {tmpdir}=await import('node:os');
const {join}=await import('node:path');
const {createLifeInsuranceApp}=await import('../../api/dist/insurance/app.js');
const directory=await mkdtemp(join(tmpdir(),'worker-http-check-'));
let app;
try {
  ({app}=await createLifeInsuranceApp({dataDirectory:directory,credentials:{customerAccessCode:'customer-check-01234567890123456789',reviewerAccessCode:'reviewer-check-01234567890123456789'},
    provider:{async execute(){throw new Error('No calculator expected');}},providerMode:'test',documents:ProductDocuments.empty(),demoStart:true,
    http:{sameOrigin:true,publicOrigin:'https://life.example'},shutdownHooks:false}));
  await app.listen(0,'127.0.0.1');
  const base=`http://127.0.0.1:${app.getHttpServer().address().port}`;
  const start=origin=>fetch(base+'/api/demo/start',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{"empty":true}'});
  assert.equal((await start('https://evil.example')).status,403);
  const response=await start('https://life.example');assert.equal(response.status,201);
  assert.match(response.headers.get('set-cookie'),/; Secure/);
  const session=await response.json();
  const logout=await fetch(base+'/api/sessions/current',{method:'DELETE',headers:{Origin:'https://life.example',Cookie:response.headers.get('set-cookie').split(';')[0],'x-csrf-token':session.csrfToken}});
  assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/; Secure/);
  console.log('Configured HTTPS origin, foreign-origin rejection and Secure login/logout cookies: passed');
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
