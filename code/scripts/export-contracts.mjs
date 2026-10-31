import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {z} from 'zod';
import {
  InsuranceCaseDtoSchema,AdvisorContextSchema,AdvisorContextUpdatedSchema,LifeAnalysisResponseSchema,
  VoiceLogSchema,AgentReplySchema,VoicePlaybackEventSchema,GraphExplanationRequestSchema,SummaryBundleSchema,PortalDtoSchema,
} from '@pax/contracts';

const documents={
  'insurance-case-v1':InsuranceCaseDtoSchema,'advisor-context-v1':AdvisorContextSchema,
  'context-updated-v1':AdvisorContextUpdatedSchema,'life-analysis-response-v1':LifeAnalysisResponseSchema,
  'voice-log-v1':VoiceLogSchema,'agent-reply-v1':AgentReplySchema,'voice-playback-v1':VoicePlaybackEventSchema,
  'graph-explanation-v1':GraphExplanationRequestSchema,
  'summary-bundle-v1':SummaryBundleSchema,'portal-v1':PortalDtoSchema,
};
const directory=new URL('../packages/contracts/schemas/',import.meta.url);
const check=process.argv.includes('--check');if(!check)await mkdir(directory,{recursive:true});
for(const [name,schema] of Object.entries(documents)){
  const json=z.toJSONSchema(schema,{unrepresentable:'any'});
  json.title=name;json.description='Pax synthetic-data PoC contract v1. Runtime Zod/domain reference checks and authorization remain authoritative; JSON Schema alone does not grant permission.';
  const content=JSON.stringify(json,null,2)+'\n',path=new URL(`${name}.schema.json`,directory);
  if(check){if(await readFile(path,'utf8')!==content)throw new Error(`Outdated contract export: ${name}; run npm run contracts:export`);}
  else await writeFile(path,content);
}
console.log(`${check?'Verified':'Exported'} ${Object.keys(documents).length} shared JSON Schemas`);
