import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLifeRuntime} from '../apps/api/dist/insurance/runtime.js';
import {lifeDraft,SyntheticTestProvider} from '../tests/helpers/life-fixture.mjs';
import {ProposalBatchInputSchema} from '@pax/contracts';
const directory=await mkdtemp(join(tmpdir(),'pax-extraction-demo-'));
const credentials={customerAccessCode:'synthetic-extraction-demo-customer-key',reviewerAccessCode:'synthetic-extraction-demo-reviewer-key'};
let r;
try{
 r=await createLifeRuntime({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials});
 const customer=r.sessions.authenticate((await r.sessions.login(credentials.customerAccessCode,'local-demo')).sessionToken);
 let c=await r.engine.createCase(customer,{locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v1',dataClassification:'synthetic'});
 c=await r.engine.patchDraft(customer,c.id,{...(await lifeDraft()),expectedCaseRevision:c.caseRevision});
 const confirm=()=>r.engine.confirm(customer,c.id,{expectedCaseRevision:r.engine.caseFor(customer,c.id).caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v1'});
 await confirm();const agent=r.sessions.authenticate((await r.sessions.agentToken(customer,c.id)).sessionToken),context=r.extraction.context(agent,c.id);
 const input=ProposalBatchInputSchema.parse({messageId:'synthetic_salary_correction',source:{messageId:'synthetic_salary_correction',turnId:'turn_salary_01',sourceRef:'synthetic:invented-dialogue'},
   expectedCaseRevision:context.caseRevision,expectedProfileVersion:context.profileVersion,basisDraftHash:context.draftHash,
   changes:[{path:'financial.persons.0.income.value',personId:context.personIds[0],value:8300000},{path:'insurance.persons.0.grossAnnualIncomeCents',personId:context.personIds[0],value:11900000}]});
 const batch=await r.extraction.proposeBatch(agent,c.id,input);
 const acceptance=await r.extraction.acceptBatch(customer,c.id,batch.id,{expectedCaseRevision:r.engine.caseFor(customer,c.id).caseRevision,accept:true});
 const beforeConfirmation=r.extraction.context(agent,c.id);await confirm();const afterConfirmation=r.extraction.context(agent,c.id);
 const result=await r.engine.analyze(customer,c.id,{expectedCaseRevision:afterConfirmation.caseRevision,expectedProfileVersion:afterConfirmation.profileVersion,scenarioVersionId:'extraction_demo',scenario:{kind:'baseline'}});
 if(process.argv.includes('--export')){
   const output=new URL('../fixtures/extraction/',import.meta.url);await mkdir(output,{recursive:true});
   for(const [name,value] of Object.entries({'extractor-context':context,'proposal-batch-input':input,'proposal-batch':batch,'proposal-acceptance':acceptance,'context-before-confirmation':beforeConfirmation,'context-after-confirmation':afterConfirmation})){
     const content=JSON.stringify(value,null,2)+'\n';if(/"(?:ownerId|idempotency|sessionToken|csrfToken|sessionHash)"/.test(content))throw new Error('Private data in fixture');await writeFile(new URL(`${name}.v1.json`,output),content);
   }
 }
 console.log(JSON.stringify({passed:true,dataClassification:'synthetic',providerMode:'test',openAiCalled:false,profileBefore:context.profileVersion,profileAfter:afterConfirmation.profileVersion,
   batchStatus:r.engine.caseFor(customer,c.id).proposalBatches[0].status,acceptedTogether:batch.changes.length,
   amountStatusBeforeConfirmation:beforeConfirmation.draft.financial.persons[0].income.confirmation,amountStatusAfterConfirmation:afterConfirmation.draft.financial.persons[0].income.confirmation,
   calculatedProfile:result.run.profileVersion,financialInputMatches:result.run.profileVersion===afterConfirmation.profileVersion},null,2));
}finally{await r?.close();await rm(directory,{recursive:true,force:true});}
