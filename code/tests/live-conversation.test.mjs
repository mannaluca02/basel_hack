import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatReport,oracleTransport,runConversation} from './helpers/live-conversation.mjs';

/**
 * End to end, one whole fake conversation of the live build: start, consents, voice session,
 * every sentence through recognition, automatic acceptance and saving, until the profile is
 * confirmed and the charts are calculated. The model is an oracle reading the script, so this
 * proves the chain behind the recognition; `npm run test:live:conversation` runs the same
 * conversation against the real model.
 */
test('a whole fake conversation from A to Z: every answer recognised, saved, and the charts calculated',async()=>{
  const report=await runConversation({transport:oracleTransport()});
  const text=formatReport(report);
  assert.deepEqual(report.unscripted,[],`questions without an answer in the script:\n${text}`);
  assert.deepEqual(report.expectations.filter(e=>!e.ok),[],text);
  assert.deepEqual(report.stuck,[],`still open:\n${text}`);
  assert.equal(report.profileVersion,1,text);
  assert.ok(report.runs>0,'the charts are calculated');
  // Paxi asked each question once: nothing was asked again because it went unsaved.
  const asked=report.turns.filter(t=>t.speaker==='agent').map(t=>t.text);
  const repeated=asked.filter((q,i)=>asked.indexOf(q)!==i&&!/Risiko-Leistungen|brutto und pro Jahr/.test(q));
  assert.deepEqual(repeated,[],text);
});
