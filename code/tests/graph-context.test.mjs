import {test} from 'node:test';
import assert from 'node:assert/strict';
import {credentials,demoApp} from './helpers/demo-http.mjs';

/**
 * The selected chart point (AI-04): the customer picks an exact run, person, metric and period in
 * a chart; the backend checks it against the run and hands the advisor only those facts. Also
 * the switch between saved analyses, which the charts' scenario choice uses.
 */
const graph=(c,run,extra)=>({caseId:c.id,profileVersion:run.profileVersion,scenarioVersionId:run.scenarioVersionId,runId:run.id,
  periodStart:run.local.periodStart,periodEnd:run.local.periodEnd,...extra});
const active=c=>c.runs.find(r=>r.id===c.activeRunId);

test('only a current analysis of the confirmed profile can become active',async t=>{
  const f=await demoApp(t);
  assert.equal((await f.customer.call('POST',`${f.path}/active-analysis`,{runId:crypto.randomUUID()})).body.code,'STALE_CONTEXT');
  assert.equal((await f.customer.call('POST',`${f.path}/active-analysis`,{runId:'not-a-uuid'})).status,400);
  assert.equal((await f.reviewer.signIn(credentials.reviewerAccessCode)).role,'reviewer');
  const c=await f.current();
  const reviewerSwitch=await f.reviewer.call('POST',`${f.path}/active-analysis`,{runId:c.runs[0].id});
  assert.equal(reviewerSwitch.status,403,'only the customer chooses');
});
