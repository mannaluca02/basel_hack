// Real case service for the Angular review stand: `npm run demo:customer-review`, then
// `npm run start:api` in apps/web. A browser sign-in owns its case, so the fixture waits for that
// case and prepares it with the customer's own session. Synthetic data only; nothing external.
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLifeInsuranceApp} from '../apps/api/dist/insurance/app.js';
import {lifeDraft,SyntheticTestProvider} from '../tests/helpers/life-fixture.mjs';

const port=Number(process.env.PORT??3000),controlPort=port+1;
const credentials={customerAccessCode:'synthetic-review-demo-customer-key-32',reviewerAccessCode:'synthetic-review-demo-reviewer-key-32'};
const directory=await mkdtemp(join(tmpdir(),'pax-customer-review-'));
const {app,runtime:r}=await createLifeInsuranceApp({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials});
await app.listen(port,'127.0.0.1');

let prepared=null,counter=0;
const owned=()=>r.store.view(db=>{
  const c=Object.values(db.cases)[0],actor=c&&Object.values(db.sessions).find(s=>s.id===c.ownerId&&s.role==='customer');
  return actor?{id:c.id,actor}:null;
});
async function prepare({id,actor}){
  let c=r.engine.caseFor(actor,id);
  c=await r.engine.patchDraft(actor,id,{...(await lifeDraft()),expectedCaseRevision:c.caseRevision});
  await r.engine.confirm(actor,id,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v2'});
  const agent=r.sessions.authenticate((await r.sessions.agentToken(actor,id)).sessionToken);
  prepared={id,actor,agent};await scenarios.batch();
}
const source=()=>{const messageId=`review_demo_${++counter}`;return {messageId,source:{messageId,turnId:`turn_${messageId}`,sourceRef:`synthetic:${messageId}`}};};
const propose=extra=>{const {id,agent}=prepared,x=r.extraction.context(agent,id);
  return r.extraction.proposeBatch(agent,id,{...source(),expectedCaseRevision:x.caseRevision,expectedProfileVersion:x.profileVersion,basisDraftHash:x.draftHash,changes:[],...extra});};
const path='insurance.persons.0.grossAnnualIncomeCents';
const scenarios={
  batch:()=>propose({changes:[{path,personId:'person_demo_1',value:11900000}]}),
  ambiguity:()=>propose({ambiguities:[{path,personId:'person_demo_1',question:'Wie hoch ist Ihr Bruttojahreseinkommen?',source:source().source}]}),
  // Another change to the case while a question is on screen.
  'change-draft':async()=>{const {id,actor}=prepared,c=r.engine.caseFor(actor,id);
    await r.engine.patchDraft(actor,id,{goals:c.draft.goals.map(g=>({...g,priority:g.priority%5+1})),expectedCaseRevision:c.caseRevision});},
};
const timer=setInterval(()=>{const target=!prepared&&owned();if(target){prepared={...target};prepare(target).catch(e=>console.error('Preparing failed',e.code??e));}},200);
const control=createServer(async(req,res)=>{
  const run=scenarios[req.url.slice(1)];res.setHeader('Content-Type','application/json');
  if(!run||!prepared?.agent){res.statusCode=404;res.end('{}');return;}
  try{await run();res.end('{"ok":true}');}catch(e){res.statusCode=409;res.end(JSON.stringify({code:e.code??'FAILED'}));}
});
control.listen(controlPort,'127.0.0.1');
console.info(`Case service: http://127.0.0.1:${port}/api/status`);
console.info(`Demo access code: ${credentials.customerAccessCode}`);
console.info(`Scenarios: curl -X POST http://127.0.0.1:${controlPort}/{batch,ambiguity,change-draft}`);
const stop=async()=>{clearInterval(timer);control.close();await app.close();await rm(directory,{recursive:true,force:true});process.exit(0);};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
