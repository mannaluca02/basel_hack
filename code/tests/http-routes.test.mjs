import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoApp} from './helpers/demo-http.mjs';

/**
 * Every route that the service tests reach only below HTTP, once through the real controller:
 * wiring, guards, status codes and response shapes. The workflows themselves are covered in
 * depth by the service tests.
 */

/** A scoped agent of the demo case, like the voice agent. */
async function agent(f) {
  const grant=await f.customer.call('POST',`${f.path}/agent-access`,{});
  assert.equal(grant.status,201,JSON.stringify(grant.body));
  const headers={Authorization:`Bearer ${grant.body.sessionToken}`};
  return (method,path,body)=>fetch(f.base+path,{method,headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})})
    .then(async r=>({status:r.status,body:await r.json()}));
}

test('reviews, comparisons and estimates over HTTP',async t=>{
  const f=await demoApp(t);
  const review=await f.customer.call('POST',`${f.path}/reviews`,{});
  assert.equal(review.status,201,JSON.stringify(review.body));
  assert.ok(review.body.reasons.includes('USER_REQUESTED'));

  const c=await f.current();
  const baseline=c.runs.find(r=>r.scenarioVersionId==='standard_baseline_v1'),variant=c.runs.find(r=>r.scenarioVersionId==='standard_family_v1');
  const created=await f.customer.call('POST',`${f.path}/comparisons`,{baselineRunId:baseline.id,variantRunId:variant.id,expectedProfileVersion:1});
  assert.equal(created.status,201,JSON.stringify(created.body));

  const estimate=await f.customer.call('POST',`${f.path}/calculator-estimates`,{expectedCaseRevision:await f.revision(),noticeVersion:'lifemap-synthetic-v2',allowSyntheticCalculatorTransfer:true,operations:['income']});
  assert.equal(estimate.status,201,JSON.stringify(estimate.body));
  assert.ok(estimate.body.results.length>0);
});

test('proposal batches with a clarification and a change over HTTP, accepted by the customer',async t=>{
  const f=await demoApp(t);
  const call=await agent(f);
  // A batch with a clarification question.
  const context=(await call('GET',`${f.path}/advisor/extractor-context`)).body;
  const source={messageId:'route_batch',turnId:'route_turn',sourceRef:'synthetic:route'};
  const batch=await call('POST',`${f.path}/advisor/proposal-batches`,{messageId:'route_batch',source,expectedCaseRevision:context.caseRevision,
    expectedProfileVersion:context.profileVersion,basisDraftHash:context.draftHash,changes:[],
    ambiguities:[{path:'insurance.relationship',question:'Welche Situation gilt?',source}]});
  assert.equal(batch.status,201,JSON.stringify(batch.body));

  // A batch with a change, accepted.
  const fresh=(await call('GET',`${f.path}/advisor/extractor-context`)).body;
  const changeSource={messageId:'route_change',turnId:'route_change_turn',sourceRef:'synthetic:route_change'};
  const change=await call('POST',`${f.path}/advisor/proposal-batches`,{messageId:'route_change',source:changeSource,expectedCaseRevision:fresh.caseRevision,
    expectedProfileVersion:fresh.profileVersion,basisDraftHash:fresh.draftHash,
    changes:[{path:'insurance.persons.0.grossAnnualIncomeCents',personId:fresh.personIds[0],value:11900000}],ambiguities:[]});
  assert.equal(change.status,201,JSON.stringify(change.body));
  const take=await f.customer.call('POST',`${f.path}/advisor/proposal-batches/${change.body.id}/accept`,{expectedCaseRevision:await f.revision(),accept:true});
  assert.equal(take.status,201,JSON.stringify(take.body));
  assert.equal((await f.current()).draft.insurance.persons[0].grossAnnualIncomeCents,11900000);
});

test('a customer confirmation can be cancelled over HTTP',async t=>{
  const f=await demoApp(t);
  const call=await agent(f);
  const context=(await call('GET',`${f.path}/advisor/extractor-context`)).body;
  const source={messageId:'route_confirm',turnId:'route_confirm_turn',sourceRef:'synthetic:route_confirm'};
  const batch=(await call('POST',`${f.path}/advisor/proposal-batches`,{messageId:'route_confirm',source,expectedCaseRevision:context.caseRevision,
    expectedProfileVersion:context.profileVersion,basisDraftHash:context.draftHash,
    changes:[{path:'insurance.persons.0.grossAnnualIncomeCents',personId:context.personIds[0],value:11900000}],ambiguities:[]})).body;
  const created=await f.customer.call('POST',`${f.path}/customer-confirmations`,{expectedCaseRevision:await f.revision(),target:{kind:'accept_batch',batchId:batch.id},
    channel:'screen',questionTurnId:crypto.randomUUID(),questionReplyId:crypto.randomUUID()});
  assert.equal(created.status,201,JSON.stringify(created.body));
  const cancelled=await f.customer.call('POST',`${f.path}/customer-confirmations/${created.body.id}/cancel`,{expectedCaseRevision:await f.revision(),reason:'new_question'});
  assert.equal(cancelled.status,201,JSON.stringify(cancelled.body));
  assert.equal((await f.customer.call('GET',`${f.path}/customer-confirmations/current`)).body.confirmation.status,'cancelled');
});
