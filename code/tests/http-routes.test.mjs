import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FakeVoiceGateway} from './helpers/voice-fixture.mjs';
import {credentials,demoApp} from './helpers/demo-http.mjs';

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

test('case list, products, audit, reviews and comparisons over HTTP',async t=>{
  const f=await demoApp(t);
  const list=await f.customer.call('GET','/api/cases');
  assert.equal(list.status,200);
  assert.equal(list.body.cases?.length??list.body.length,1,'only the own case');

  const products=await f.customer.call('GET',`${f.path}/products`);
  assert.equal(products.body.kind,'educational_catalog_not_personal_recommendations');
  assert.ok(products.body.products.length>=5);
  assert.ok(products.body.products.every(p=>p.name&&p.summary));

  const audit=await f.customer.call('GET',`${f.path}/audit`);
  assert.equal(audit.status,200);
  assert.ok(audit.body.some(a=>a.action==='analysis_finished'));
  assert.ok(audit.body.every(a=>a.caseId===f.path.split('/').at(-1)));

  const review=await f.customer.call('POST',`${f.path}/reviews`,{});
  assert.equal(review.status,201,JSON.stringify(review.body));
  assert.ok(review.body.reasons.includes('USER_REQUESTED'));

  const c=await f.current();
  const baseline=c.runs.find(r=>r.scenarioVersionId==='standard_baseline_v1'),variant=c.runs.find(r=>r.scenarioVersionId==='standard_family_v1');
  const created=await f.customer.call('POST',`${f.path}/comparisons`,{baselineRunId:baseline.id,variantRunId:variant.id,expectedProfileVersion:1});
  assert.equal(created.status,201,JSON.stringify(created.body));
  const read=await f.customer.call('GET',`${f.path}/comparisons/${created.body.id}`);
  assert.equal(read.status,200);
  assert.equal(read.body.id,created.body.id);

  const estimate=await f.customer.call('POST',`${f.path}/calculator-estimates`,{expectedCaseRevision:await f.revision(),noticeVersion:'lifemap-synthetic-v2',allowSyntheticCalculatorTransfer:true,operations:['income']});
  assert.equal(estimate.status,201,JSON.stringify(estimate.body));
  assert.ok(estimate.body.results.length>0);

  const reviewer=await f.reviewer.signIn(credentials.reviewerAccessCode);
  assert.equal(reviewer.role,'reviewer');
  const insights=await f.reviewer.call('GET','/api/insights');
  assert.equal(insights.status,200);
  assert.equal(insights.body.caseCount,1);
  assert.equal((await f.customer.call('GET','/api/insights')).status,403,'aggregates are for the reviewer');
});

test('agent proposals, proposal batches and clarifications over HTTP, accepted by the customer',async t=>{
  const f=await demoApp(t);
  const call=await agent(f);
  // A single legacy proposal and its acceptance.
  const proposal=await call('POST',`${f.path}/advisor/proposals`,{messageId:'route_legacy',path:'financial.persons.0.income.value',value:8300000,expectedProfileVersion:1});
  assert.equal(proposal.status,201,JSON.stringify(proposal.body));
  const accepted=await f.customer.call('POST',`${f.path}/advisor/proposals/${proposal.body.id}/accept`,{expectedCaseRevision:await f.revision(),accept:true});
  assert.equal(accepted.status,201,JSON.stringify(accepted.body));

  // A batch with a clarification question, resolved by the customer.
  const context=(await call('GET',`${f.path}/advisor/extractor-context`)).body;
  const source={messageId:'route_batch',turnId:'route_turn',sourceRef:'synthetic:route'};
  const batch=await call('POST',`${f.path}/advisor/proposal-batches`,{messageId:'route_batch',source,expectedCaseRevision:context.caseRevision,
    expectedProfileVersion:context.profileVersion,basisDraftHash:context.draftHash,changes:[],
    ambiguities:[{path:'insurance.relationship',question:'Welche Situation gilt?',source}]});
  assert.equal(batch.status,201,JSON.stringify(batch.body));
  const ambiguity=(await f.current()).ambiguities.find(a=>a.status==='open');
  const resolved=await f.customer.call('POST',`${f.path}/ambiguities/${ambiguity.id}/resolve`,{expectedCaseRevision:await f.revision(),resolved:true,resolutionSourceRef:'synthetic:customer_clarified'});
  assert.equal(resolved.status,201,JSON.stringify(resolved.body));

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
  assert.equal((await f.customer.call('POST',`${f.path}/advisor/proposals`,{messageId:'customer',path:'goals.0.priority',value:1,expectedProfileVersion:1})).status,403,'only an agent proposes');
});

test('a customer confirmation can be read by id and cancelled over HTTP',async t=>{
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
  const read=await f.customer.call('GET',`${f.path}/customer-confirmations/${created.body.id}`);
  assert.equal(read.status,200);
  assert.equal(read.body.id,created.body.id);
  const cancelled=await f.customer.call('POST',`${f.path}/customer-confirmations/${created.body.id}/cancel`,{expectedCaseRevision:await f.revision(),reason:'new_question'});
  assert.equal(cancelled.status,201,JSON.stringify(cancelled.body));
  assert.equal((await f.customer.call('GET',`${f.path}/customer-confirmations/${created.body.id}`)).body.status,'cancelled');
});

test('voice providers and the agent\'s voice extraction route over HTTP',async t=>{
  const gateway=new FakeVoiceGateway();
  const f=await demoApp(t,{voice:{enabled:true,gateways:[gateway]}});
  const providers=await f.customer.call('GET','/api/voice/providers');
  assert.equal(providers.status,200);
  assert.ok(JSON.stringify(providers.body).includes('gpt-live'));
  const c=await f.current();
  const session=await f.customer.call('POST',`${f.path}/voice/sessions`,{messageId:'route_voice',expectedCaseRevision:c.caseRevision,provider:'gpt-live',locale:c.locale,
    dataClassification:'synthetic',noticeVersion:'voice-synthetic-v1',allowExternalVoiceProcessing:true,sdp:'v=route'});
  assert.equal(session.status,201,JSON.stringify(session.body));
  const sid=session.body.voiceSession.id,messageId='route_turn_1';
  const turn=await f.customer.call('POST',`${f.path}/voice/sessions/${sid}/turns`,{speaker:'customer',log:{schemaVersion:'1.0',messageId,caseId:c.id,correlationId:sid,
    turnId:messageId,source:'voice',locale:c.locale,text:'Mein Bruttojahreseinkommen ist 119000 Franken.',transcriptStatus:'final',dataClassification:'synthetic'}});
  assert.equal(turn.status,201,JSON.stringify(turn.body));
  const call=await agent(f);
  const context=(await call('GET',`${f.path}/advisor/extractor-context`)).body;
  const extraction=await call('POST',`${f.path}/voice/sessions/${sid}/extraction`,{messageId:'route_extract',expectedCaseRevision:context.caseRevision,
    expectedProfileVersion:context.profileVersion,basisDraftHash:context.draftHash,transcriptRevision:turn.body.voiceSession.transcriptRevision,
    observations:[{fieldId:'annual_gross_income_chf',personId:context.personIds[0],sourceMessageId:messageId,quote:'Mein Bruttojahreseinkommen ist 119000 Franken',
      value:119000,precision:'exact',unit:'CHF',period:'year',basis:'gross'}]});
  assert.equal(extraction.status,201,JSON.stringify(extraction.body));
  assert.ok(extraction.body.proposalBatch);
  assert.equal(extraction.body.confirmationStillRequired,true);
});

