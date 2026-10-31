import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLifeRuntime} from '../apps/api/dist/insurance/runtime.js';
import {localizedCase} from '../apps/api/dist/insurance/i18n.js';
import {lifeDraft,SyntheticTestProvider} from '../tests/helpers/life-fixture.mjs';
import {InsuranceCaseDtoSchema,AdvisorContextSchema,VoiceLogSchema,AgentReplySchema,VoicePlaybackEventSchema,GraphExplanationRequestSchema} from '@pax/contracts';

// Intentionally injected synthetic provider; no external API/model call and no real credentials.
const credentials={customerAccessCode:'contract-example-customer-at-least-32',reviewerAccessCode:'contract-example-reviewer-at-least-32'};
const directory=await mkdtemp(join(tmpdir(),'pax-contract-examples-'));let runtime;
try{
 runtime=await createLifeRuntime({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials});
 const actor=runtime.sessions.authenticate((await runtime.sessions.login(credentials.customerAccessCode,'local-example')).sessionToken);
 let c=await runtime.engine.createCase(actor,{locale:'de',timeBudgetMinutes:10,noticeVersion:'lifemap-synthetic-v2',dataClassification:'synthetic'});
 c=await runtime.engine.patchDraft(actor,c.id,{...(await lifeDraft()),expectedCaseRevision:c.caseRevision});
 c=await runtime.engine.confirm(actor,c.id,{expectedCaseRevision:c.caseRevision,confirmProfileAndAssumptions:true,allowSyntheticCalculatorTransfer:true,noticeVersion:'lifemap-synthetic-v2'});
 const {run}=await runtime.engine.analyze(actor,c.id,{expectedCaseRevision:c.caseRevision,expectedProfileVersion:1,scenarioVersionId:'baseline_v1',scenario:{kind:'baseline'}});
 await runtime.engine.recommendation(actor,c.id);
 await runtime.engine.selectGraph(actor,c.id,{caseId:c.id,profileVersion:1,scenarioVersionId:run.scenarioVersionId,runId:run.id,graphId:'household_budget',metricId:'cashflowAnnual',periodStart:run.local.periodStart,periodEnd:run.local.periodEnd});
 const agent=runtime.sessions.authenticate((await runtime.sessions.agentToken(actor,c.id)).sessionToken);
 const dto=InsuranceCaseDtoSchema.parse(localizedCase(runtime.engine.caseFor(actor,c.id))),context=AdvisorContextSchema.parse(runtime.engine.advisorContext(agent,c.id));
 const head={schemaVersion:'1.0',messageId:'message_demo_01',caseId:c.id,correlationId:'correlation_demo_01',turnId:'turn_demo_01'};
 const voice=VoiceLogSchema.parse({...head,source:'voice',locale:'de',text:'Was bedeutet der jährliche Überschuss oder Fehlbetrag in dieser Grafik?',transcriptStatus:'final',dataClassification:'synthetic',expectedCaseRevision:dto.caseRevision});
 const metric=dto.presentation.activeRun.metrics.find(m=>m.id==='cashflowAnnual');
 const reply=AgentReplySchema.parse({...head,messageId:'reply_message_01',replyId:'reply_demo_01',contextRevision:context.contextRevision,kind:'explanation',locale:'de',
   text:`Im aktuellen bestätigten Stand beträgt der jährliche Überschuss oder Fehlbetrag ${metric.formatted}. Dies ist eine Momentaufnahme mit den erfassten Angaben.`,
   requiresConfirmation:false,containsFinancialAmounts:true,contextId:context.contextId,runId:context.runId,profileVersion:context.profileVersion,
   scenarioVersionId:context.scenarioVersionId,calculationInputHash:context.calculationInputHash,
   factRefs:[{metricId:'cashflowAnnual',runId:context.runId,profileVersion:context.profileVersion,scenarioVersionId:context.scenarioVersionId,sourceRefs:context.selectedGraphFacts.sourceRefs}]});
 const playback=VoicePlaybackEventSchema.parse({...head,messageId:'playback_message_01',replyId:reply.replyId,playbackId:'playback_demo_01',event:'started',occurredAt:new Date().toISOString()});
 const graph=GraphExplanationRequestSchema.parse({...head,messageId:'graph_message_01',contextId:context.contextId,graphContext:dto.graphContext,question:'Was bedeutet dieser jährliche Betrag?'});
 const output=new URL('../fixtures/contracts/',import.meta.url);await mkdir(output,{recursive:true});
 for(const [name,value]of Object.entries({case:dto,context,'voice-log':voice,'agent-reply':reply,'voice-playback':playback,'graph-explanation':graph})){
   const content=JSON.stringify(value,null,2)+'\n';if(/"(?:sessionToken|csrfToken|sessionHash|idempotency|ownerId)"/.test(content))throw new Error('Private field in example');
   await writeFile(new URL(`${name}.v1.json`,output),content);
 }
 console.log('Exported 6 synthetic shared-contract examples; no live API call, no credentials.');
}finally{await runtime?.close();await rm(directory,{recursive:true,force:true});}
