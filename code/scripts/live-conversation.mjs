import 'reflect-metadata';
import {openAiResponsesTransport} from '../apps/api/dist/erni-dialog/responses.js';
import {formatReport,runConversation} from '../tests/helpers/live-conversation.mjs';

/**
 * The fake conversation of tests/live-conversation.test.mjs against the real recognition model
 * (OPENAI_API_KEY, gpt-6-luna on the fast tier): shows turn by turn what was recognised and in
 * the end which values were saved correctly. Calculations use the synthetic test calculator;
 * LIVE_CALCULATOR=1 uses Logismata (LOGISMATA_BEARER_TOKEN). Only invented details are sent.
 * Exit code 1 when a value is wrong, a question stayed open or nothing was calculated.
 */
const key=process.env.OPENAI_API_KEY;
if(!key)throw new Error('OPENAI_API_KEY is required (root .env); the conversation is synthetic.');
const live=process.env.LIVE_CALCULATOR==='1';
if(live&&!process.env.LOGISMATA_BEARER_TOKEN)throw new Error('LIVE_CALCULATOR=1 needs LOGISMATA_BEARER_TOKEN.');
const started=Date.now();
const report=await runConversation({transport:openAiResponsesTransport(key),...(live?{providerMode:'live',token:process.env.LOGISMATA_BEARER_TOKEN}:{}),
  onTurn:t=>process.stdout.write(t.speaker==='agent'?'P':t.recognition?.proposed.length?'+':'.')});
console.log(`\n\n${formatReport(report)}\n\nDauer: ${Math.round((Date.now()-started)/1000)} s, Rechner: ${live?'Logismata live':'synthetisch'}`);
const failed=report.expectations.some(e=>!e.ok)||report.stuck.length>0||report.runs===0;
process.exit(failed?1:0);
