import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DraftSchema} from '../packages/contracts/dist/index.js';
import {answerChanges,answerTargets,askText,consequences,openAsks,openKeys,pendingView,validAnswers} from '../apps/api/dist/voice/lab-questions.js';
import {setupDraft} from '../apps/api/dist/voice/lab-setup.js';
import {latestExchange} from '../apps/api/dist/voice/exchange.js';
import {modelObservations} from '../apps/api/dist/voice/lab-intake.js';
import {answerObservations} from '../apps/api/dist/voice/lab-questions.js';
import {FakeVoiceGateway} from './helpers/voice-fixture.mjs';
import {demoApp} from './helpers/demo-http.mjs';

/**
 * The live build's "only ask" flow: after the person exists, Paxi asks for everything the profile
 * still needs, the answers land as proposals, and once nothing is open the acceptance confirms and
 * calculates. Nothing is assumed.
 */
const CASE='00000000-0000-4000-8000-000000000001';
const empty=DraftSchema.parse({financial:null,insurance:null,goals:[],reviewFlags:[]});
const frame=()=>{const f=setupDraft(empty,CASE,1990,8000,'voice:test');return DraftSchema.parse({...empty,...f});};
const answer=(key,value,period='once',quote='x')=>({key,value,period,quote});

test('after the setup the open questions follow the conversation order and include the budget',()=>{
  const keys=openKeys(frame());
  assert.equal(keys[0],'goals');
  assert.ok(keys.indexOf('insurance.relationship')<keys.indexOf('insurance.persons.person_1.grossAnnualIncomeCents'));
  assert.ok(keys.indexOf('financial.persons.person_1.income')<keys.indexOf('financial.expenses_add.living'));
  assert.ok(keys.indexOf('financial.assets')<keys.indexOf('insurance.debtsConfirmed'));
  assert.equal(keys.at(-1),'insurance.riskCapitalStrategy');
  for(const key of ['financial.expenses_add.living','financial.expenses_add.tax','financial.expenses_add.provision','financial.expenses_add.reserve',
    'financial.safetyBuffer','financial.assets','financial.expenses.housing'])assert.ok(keys.includes(key),key);
  assert.ok(!keys.includes('financial.expenses_add.debt'),'the debt line follows the debts, it is never asked');
  assert.ok(!keys.includes('financial')&&!keys.includes('insurance'));
});

test('every open question has a localized text; the partner\'s own fields name the partner',()=>{
  const d=frame();
  for(const locale of ['de','fr','it','en'])for(const ask of openAsks(d,locale))assert.ok(ask.text.length>5,`${locale} ${ask.key}`);
  assert.match(askText(d,'financial.partner','de'),/Partner/);
  const two=pendingView(d,[{path:'financial.persons_add',value:{...d.financial.persons[0],id:'person_2'}},
    {path:'insurance.persons_add',value:{...d.insurance.persons[0],personId:'person_2'}}],CASE);
  assert.match(askText(two,'insurance.persons.person_2.grossAnnualIncomeCents','de'),/^Zu Ihrer Partnerin oder Ihrem Partner: Wie hoch/);
  assert.doesNotMatch(askText(two,'insurance.persons.person_1.grossAnnualIncomeCents','de'),/Partner/);
});

test('every open field is a target, the intake fields too: one the intake extraction missed is still taken',()=>{
  const targets=answerTargets(frame());
  const keys=targets.map(t=>t.key);
  for(const key of ['insurance.relationship','insurance.persons.person_1.grossAnnualIncomeCents','insurance.persons.person_1.withPillar2',
    'insurance.persons.person_1.desiredWorkStopAge','insurance.existingAnnualPillar3aContributionCents','financial.expenses.housing',
    'insurance.persons.person_1.retirementPensionAnnualCents','financial.persons.person_1.income'])assert.ok(keys.includes(key),key);
  assert.ok(targets.every(t=>!t.correction),'nothing answered yet, nothing to correct');
  assert.match(targets.find(t=>t.key==='financial.persons.person_1.income').description,/never this field/,'a gross income never lands as net');
});

test('the real conversation: 80000 a year confirmed as brutto, 3a 500 a month, a later correction',()=>{
  const d=frame();
  const gross=validAnswers(answerTargets(d),{answers:[{id:'insurance.persons.person_1.grossAnnualIncomeCents',value:'80000',period:'year',quote:'achtzigtausend pro Jahr'}]},
    ['Ja, ungefähr achtzigtausend pro Jahr','Ja']);
  assert.deepEqual(gross.map(a=>[a.key,a.value,a.period]),[['insurance.persons.person_1.grossAnnualIncomeCents',8000000,'year']]);
  const pillar3a=validAnswers(answerTargets(d),{answers:[{id:'insurance.existingAnnualPillar3aContributionCents',value:'500',period:'month',quote:'fünfhundert pro Monat'}]},
    ['Ja','Ja, ich zahle fünfhundert pro Monat in die Säule drei A ein']);
  assert.deepEqual(pillar3a.map(a=>[a.key,a.value,a.period]),[['insurance.existingAnnualPillar3aContributionCents',50000,'month']]);

  // No children, answered: "plane noch drei Kinder ein" changes it, but only when said now.
  const answered=pendingView(d,[{path:'insurance.sharedChildren',value:0}],CASE);
  const target=answerTargets(answered).find(t=>t.key==='insurance.sharedChildren');
  assert.equal(target.correction,true);
  assert.match(target.description,/Already answered \(0\)/);
  const correction={answers:[{id:'insurance.sharedChildren',value:'3',period:null,quote:'plane noch drei Kinder ein'}]};
  assert.deepEqual(validAnswers(answerTargets(answered),correction,['Äh, keine','und plane noch drei Kinder ein']).map(a=>a.value),[3]);
  assert.deepEqual(validAnswers(answerTargets(answered),correction,['und plane noch drei Kinder ein','Ja']),[],'said earlier: no change now');
});

test('a value the profile already holds is no change; the 3a per month becomes a year',async()=>{
  const d=pendingView(frame(),[{path:'insurance.sharedChildren',value:0}],CASE);
  assert.deepEqual(await answerChanges(d,[answer('insurance.sharedChildren',0)],'voice:test'),[]);
  const changes=await answerChanges(d,[answer('insurance.existingAnnualPillar3aContributionCents',50000,'month'),answer('insurance.sharedChildren',3)],'voice:test');
  assert.deepEqual(changes.map(c=>[c.path,c.value]),[['insurance.existingAnnualPillar3aContributionCents',600000],['insurance.sharedChildren',3]]);
  assert.ok(openKeys(pendingView(d,changes,CASE)).includes('insurance.children'),'three children: their birth years are asked next');
});

test('each open question tells Paxi what the answer must give',()=>{
  const asks=openAsks(frame(),'de');
  assert.ok(asks.every(a=>a.about&&a.about.length>10),JSON.stringify(asks.filter(a=>!a.about).map(a=>a.key)));
  const married=openAsks(pendingView(frame(),[{path:'insurance.relationship',value:'married'}],CASE),'de');
  assert.match(married.find(a=>a.key==='financial.partner').about,/age of the partner.*employment rate of the partner/);
});

test('model output is untrusted: unknown fields, unsaid quotes and values off their unit are dropped',()=>{
  const targets=answerTargets(frame());
  const said=['Wir sparen 2.500 Franken im Monat, Ziel Pension und Familie. Steuern 12000.'];
  const got=validAnswers(targets,{answers:[
    {id:'financial.persons.person_1.income',value:'2.500',period:'month',quote:'2.500 Franken im Monat'},
    {id:'goals',value:'retirement, family',period:null,quote:'Ziel Pension und Familie'},
    {id:'financial.expenses_add.tax',value:'12000',period:null,quote:'Steuern 12000'},
    {id:'financial.assets',value:'99000',period:null,quote:'never said'},
    {id:'insurance.annualReturnBps',value:'viel',period:null,quote:'Steuern'},
    {id:'goals',value:'retirement',period:null,quote:'Pension'},
    {id:'not.a.field',value:'1',period:null,quote:'Steuern'},
    {id:'insurance.persons.person_1.providerSex',value:'divers',period:null,quote:'Steuern'},
  ]},said);
  assert.deepEqual(got.map(a=>[a.key,a.value,a.period]),[
    // In conversation order, not in the model's.
    ['goals',['retirement','family'],'once'],['financial.persons.person_1.income',250000,'month'],['financial.expenses_add.tax',1200000,'year']]);
});

test('answers become canonical changes; partner, goals, children and debts are additions',async()=>{
  const d=frame();
  const changes=await answerChanges(d,[answer('goals',['retirement','family']),answer('partner.age',33),answer('partner.employment_rate_percent',60),
    answer('financial.persons.person_1.income',600000,'month'),answer('insurance.retirementNeedAnnualCents',500000,'month'),
    answer('insurance.persons.person_1.protectionTermMonths',240),answer('insurance.persons.person_1.providerSex','female'),
    answer('financial.expenses_add.living',300000,'month'),answer('financial.assets',0),answer('insurance.debtsConfirmed',['mortgage'])],'voice:test');
  const by=path=>changes.filter(c=>c.path===path).map(c=>c.value);
  assert.deepEqual(by('goals_add').map(g=>[g.id,g.priority,g.targetMonth]),[['goal_retirement',1,null],['goal_family',2,null]]);
  assert.equal(by('financial.persons_add')[0].birthYear,Number(d.financial.valuationDate.slice(0,4))-33);
  assert.equal(by('financial.persons_add')[0].employmentRateBps,6000);
  assert.equal(by('financial.persons_add')[0].income.value,null,'the partner\'s income is asked, not invented');
  assert.equal(by('insurance.persons_add')[0].personId,'person_2');
  assert.deepEqual([by('financial.persons.0.income.value')[0],by('financial.persons.0.income.period')[0],by('financial.persons.0.incomeBasis')[0]],[600000,'month','net_after_income_tax']);
  assert.equal(by('insurance.retirementNeedAnnualCents')[0],6000000,'a monthly answer to a yearly field is multiplied, nothing else');
  assert.equal(by('insurance.persons.0.protectionTermMonths')[0],240);
  assert.equal(by('insurance.persons.0.providerSex')[0],2);
  assert.equal(by('financial.expenses_add')[0].category,'living');
  assert.deepEqual(by('financial.assetsConfirmed'),[true]);
  assert.deepEqual(by('financial.assets_add'),[],'no savings: confirmed without an asset');
  assert.deepEqual(by('insurance.debts_add').map(x=>[x.id,x.balanceCents]),[['debt_mortgage',null]]);
  assert.equal(by('insurance.persons.0.debtPayoffCents').length,0,'with a debt the payoff is asked');
  // The whole batch applies to the draft.
  const after=pendingView(d,changes,CASE);
  assert.equal(after.financial.persons.length,2);
  assert.ok(openKeys(after).includes('insurance.debts.debt_mortgage.balanceCents'));
  assert.ok(openKeys(after).includes('financial.persons.person_2.income'));
});

test('plain consequences only: no pension fund, no debts, known debt payments, single',()=>{
  const d=frame();
  const noFund=pendingView(d,[{path:'insurance.persons.0.withPillar2',value:false,personId:'person_1'},{path:'insurance.debtsConfirmed',value:true},
    {path:'insurance.relationship',value:'single'}],CASE);
  const out=Object.fromEntries(consequences(noFund,'voice:test').map(c=>[c.path,c.value]));
  assert.equal(out['insurance.persons.0.retirementPensionAnnualCents'],0);
  assert.equal(out['insurance.persons.0.pillar2Risk.survivorAnnualCents'],0);
  assert.equal(out['insurance.persons.0.debtPayoffCents'],0);
  assert.equal(out['insurance.persons.0.debtTreatment'],'included_in_income_need');
  assert.equal(out['financial.expenses_add'].amount.value,0);
  assert.equal(out['insurance.relationshipSinceYear'],Number(d.financial.valuationDate.slice(0,4)));
  assert.equal(out['insurance.persons.0.disabilityNeedAnnualCents'],undefined,'needs are always asked');

  const debts=pendingView(d,[{path:'insurance.debtsConfirmed',value:true},{path:'insurance.debts_add',value:{id:'debt_mortgage',ownerPersonIds:['person_1'],balanceCents:50000000,annualServiceCents:1200000,kind:'mortgage'}}],CASE);
  const line=consequences(debts,'voice:test').find(c=>c.path==='financial.expenses_add');
  assert.equal(line.value.amount.value,1200000);
  assert.equal(line.value.amount.period,'year');
  assert.deepEqual(consequences(frame(),'voice:test'),[],'nothing said, nothing written');
});

/** OpenAI replaced: setup facts, intake observations and answers from fixed tables. */
function fakeModel(intakeFirstTurn,values) {
  const requests=[];let intakeTurns=0;
  const transport=async request=>{
    requests.push(request);
    const name=request.tools[0].name,input=JSON.parse(request.input[0].content);
    let args;
    if(name==='submit_setup_facts')args={age:{value:'34',quote:'Antwort'},employment_rate_percent:{value:'80',quote:'Antwort'}};
    else if(name==='submit_intake_observations')args={observations:intakeTurns++===0?intakeFirstTurn:[]};
    // A customer who never corrects anything: answered fields are left alone.
    else args={answers:input.fields.filter(field=>!/Already answered/.test(field.description)).flatMap(field=>{
      const known=Object.entries(values).find(([pattern])=>new RegExp(`^${pattern}$`).test(field.id));
      return known?[{id:field.id,value:known[1][0],period:known[1][1]??null,quote:'Antwort'}]:[];
    })};
    return {status:'completed',output:[{type:'function_call',name,arguments:JSON.stringify(args)}]};
  };
  return {transport,requests};
}

const intake=[['annual_gross_income_chf','95000',{period:'year',basis:'gross'}],['civil_status','married'],['has_pension_fund','true'],
  ['pillar_3a_annual_contribution_chf','7000'],['monthly_housing_cost_chf','2200'],['desired_retirement_age','65'],['risk_appetite','low']]
  .map(([fieldId,value,extra])=>({fieldId,quote:'Antwort',value,precision:'exact',period:null,basis:null,...extra}));
const values={
  'goals':['retirement,income_protection'],'insurance\\.relationshipSinceYear':['2015'],'insurance\\.sharedChildren':['1'],'insurance\\.children':['2019'],
  'insurance\\.children\\.[^.]+\\.supportUntilMonth':['2044'],'insurance\\.riskCapitalStrategy':['preserve_assets_for_other_goals'],
  'insurance\\.debtsConfirmed':['none'],'insurance\\.existingPrivateRiskBenefitsConfirmed':['false'],'insurance\\.retirementNeedAnnualCents':['80000'],
  'insurance\\.annualReturnBps':['1'],'insurance\\.retirementHorizonAge':['90'],'insurance\\.annualSavingCents':['6000'],
  'insurance\\.existingAnnualRetirementSavingCents':['5000'],'insurance\\.taxLocationId':['Basel'],'financial\\.safetyBuffer':['500','month'],
  'financial\\.assets':['50000'],'partner\\.age':['33'],'partner\\.employment_rate_percent':['60'],
  'financial\\.expenses_add\\.living':['3000','month'],'financial\\.expenses_add\\.provision':['500','month'],
  'financial\\.expenses_add\\.reserve':['800','month'],'financial\\.persons\\.[^.]+\\.income':['6000','month'],
  'insurance\\.persons\\.[^.]+\\.providerSex':['female'],'insurance\\.persons\\.[^.]+\\.grossAnnualIncomeCents':['70000'],
  'insurance\\.persons\\.[^.]+\\.withPillar2':['true'],'insurance\\.persons\\.[^.]+\\.retirementPensionAnnualCents':['30000'],
  'insurance\\.persons\\.[^.]+\\.desiredWorkStopAge':['65'],'insurance\\.persons\\.[^.]+\\.disabilityNeedAnnualCents':['60000'],
  'insurance\\.persons\\.[^.]+\\.deathNeedAnnualCents':['50000'],'insurance\\.persons\\.[^.]+\\.protectionTermMonths':['20'],
  'insurance\\.persons\\.[^.]+\\.existingDeathCapitalCents':['0'],'insurance\\.persons\\.[^.]+\\.deathOneOffCostsCents':['10000'],
  'insurance\\.persons\\.[^.]+\\.personalAffordableAnnualPremiumCents':['3000'],'insurance\\.persons\\.[^.]+\\.pillar2Risk\\.\\w+':['20000'],
};

test('only asking: the conversation fills the whole profile, then the acceptance confirms and calculates',async t=>{
  const {c,model}=await converse(t,intake,values);
  assert.ok(model.requests.every(r=>r.model==='gpt-6-luna'&&r.service_tier==='fast'&&r.reasoning.effort==='low'),'GPT-6 Luna, fast tier');
  assert.equal(c.draft.insurance.persons[0].grossAnnualIncomeCents,9500000,'the intake value stays: answering the same field again changes nothing');
});

test('the intake extraction misses everything: the open questions still take every field, the charts still come',async t=>{
  const {c}=await converse(t,[],{...values,'insurance\\.relationship':['married'],'insurance\\.existingAnnualPillar3aContributionCents':['500','month'],
    'financial\\.expenses\\.housing':['2200','month']});
  assert.equal(c.draft.insurance.persons[0].grossAnnualIncomeCents,7000000);
  assert.equal(c.draft.insurance.existingAnnualPillar3aContributionCents,600000,'500 a month is 6000 a year');
  assert.equal(c.draft.financial.expenses.find(e=>e.id==='housing').amount.value,220000);
});

/** A whole live conversation over HTTP until the profile is confirmed and calculated. */
async function converse(t,intake,values) {
  const model=fakeModel(intake,values);
  const f=await demoApp(t,{demoStart:true,voice:{enabled:true,gateways:[new FakeVoiceGateway()]},modelExtraction:{enabled:true,transport:model.transport}});
  const started=await f.customer.call('POST','/api/demo/start',{locale:'de',empty:true});
  f.customer.csrf=started.body.csrfToken;
  const path=`/api/cases/${started.body.caseId}`,current=async()=>(await f.customer.call('GET',path)).body;
  const notice=(await f.customer.call('GET','/api/extraction/privacy?locale=de')).body;
  let c=await current();
  await f.customer.call('POST',`${path}/extraction/consent`,{expectedCaseRevision:c.caseRevision,noticeVersion:notice.version,noticeHash:notice.noticeHash,dataClassification:'synthetic',allowSyntheticModelExtraction:true});
  c=await current();
  const sid=(await f.customer.call('POST',`${path}/voice/sessions`,{messageId:'ask_all',expectedCaseRevision:c.caseRevision,provider:'gpt-live',locale:'de',
    dataClassification:'synthetic',noticeVersion:'voice-synthetic-v1',allowExternalVoiceProcessing:true,sdp:'v=offer'})).body.voiceSession.id;
  const say=async personId=>{
    const latest=await current(),messageId=`turn_${crypto.randomUUID()}`;
    await f.customer.call('POST',`${path}/voice/sessions/${sid}/turns`,{speaker:'customer',log:{schemaVersion:'1.0',messageId,caseId:latest.id,correlationId:sid,turnId:messageId,
      source:'voice',locale:'de',text:'Antwort',transcriptStatus:'final',dataClassification:'synthetic'}});
    const r=await f.customer.call('POST',`${path}/voice-lab/turns`,{mode:'live',voiceSessionId:sid,messageId,...(personId?{personId}:{})});
    assert.equal(r.status,201,JSON.stringify(r.body));
    return r.body.extraction;
  };
  const asks=async()=>(await f.customer.call('GET',`${path}/voice-lab/questions`)).body.asks;
  const accept=async()=>{const r=await f.customer.call('POST',`${path}/demo-accept`,{});assert.equal(r.status,201,JSON.stringify(r.body));return r.body;};

  assert.ok((await say()).result.proposalBatch,'the person');
  await accept();
  const before=await asks();
  assert.equal(before[0].key,'goals');
  assert.match(before[0].text,/Familie, Eigenheim oder Pensionierung/);

  // Each turn answers what is open; partner, children and their details open up turn by turn.
  let accepted,turns=0;
  for(;turns<8;turns++) {
    const turn=await say('person_1');
    assert.ok(turn.answers,`the open questions are read every turn (turn ${turns}): ${JSON.stringify(await asks())}`);
    accepted=await accept();
    if(accepted.profileVersion!==null)break;
  }
  assert.ok(turns<8,`still missing: ${JSON.stringify(accepted.missing)}`);
  assert.equal(accepted.profileVersion,1);
  assert.ok(accepted.runs.length>0,'the charts are calculated');
  assert.deepEqual(await asks(),[],'nothing left to ask');

  c=await current();
  assert.equal(c.draft.financial.persons.length,2);
  assert.equal(c.draft.insurance.children[0].supportUntilMonth,'2044-12');
  assert.equal(c.draft.insurance.taxLocationId,400100000);
  assert.equal(c.draft.insurance.persons[0].debtTreatment,'included_in_income_need','no debts: nothing to treat');
  assert.equal(c.draft.financial.expenses.find(e=>e.category==='debt').amount.value,0);
  // Answers are proposals of the customer's own words, never estimates.
  for(const person of c.draft.financial.persons)assert.equal(person.income.origin,'user');
  assert.ok(model.requests.some(r=>r.tools[0].name==='submit_answers'));
  return {c,model};
}

test('an answered amount is known before any confirmation: the net income is not asked again',()=>{
  const d=pendingView(frame(),[{path:'financial.persons.0.income.value',value:1000000,personId:'person_1'},{path:'financial.persons.0.income.period',value:'month',personId:'person_1'},
    {path:'financial.persons.0.incomeBasis',value:'net_after_income_tax',personId:'person_1'}],CASE);
  assert.equal(d.financial.persons[0].income.confirmation,'proposed');
  assert.ok(!openKeys(d).includes('financial.persons.person_1.income'));
});

test('answers come from the latest sentence: older sentences belonged to earlier questions',()=>{
  const targets=answerTargets(frame());
  const answer=(id,value,quote,period=null)=>({answers:[{id,value,period,quote}]});
  // "67" was the retirement age two answers ago, "Niedrig" the risk appetite: no planning horizon.
  assert.deepEqual(validAnswers(targets,answer('insurance.retirementHorizonAge','67','67'),['67','Niedrig','Familie, eigenes Haus und finanziell abgesichert']),[]);
  // "Sagen wir 1.000" was the housing cost: no safety buffer from a later sentence.
  assert.deepEqual(validAnswers(targets,answer('financial.safetyBuffer','1000','Sagen wir 1.000','month'),['Sagen wir 1.000','Ja, pro Monat','67']),[]);
  // A short confirmation completes the sentence before it.
  assert.deepEqual(validAnswers(targets,answer('insurance.persons.person_1.grossAnnualIncomeCents','80000','ungefähr 80.000','year'),
    ['Brutto im Jahr ungefähr 80.000, mein Zivilstand ist ledig','Ja, brutto pro Jahr']).map(a=>a.value),[8000000]);
  // The partner's age and rate may come one after the other.
  const married=answerTargets(pendingView(frame(),[{path:'insurance.relationship',value:'married'}],CASE));
  assert.equal(validAnswers(married,{answers:[{id:'partner.age',value:'33',period:null,quote:'sie ist 33'},{id:'partner.employment_rate_percent',value:'60',period:null,quote:'60 Prozent'}]},
    ['sie ist 33','und arbeitet 60 Prozent']).length,2);
});

test('a percentage is never an amount: "60 Prozent", "zehn Prozent der Schuld"',()=>{
  const d=pendingView(frame(),[{path:'insurance.debtsConfirmed',value:true},{path:'insurance.debts_add',value:{id:'debt_consumer',ownerPersonIds:['person_1'],balanceCents:150000000,annualServiceCents:null,kind:'consumer'}}],CASE);
  const targets=answerTargets(d);
  assert.deepEqual(validAnswers(targets,{answers:[{id:'insurance.persons.person_1.grossAnnualIncomeCents',value:'60',period:null,quote:'ich arbeite 60 Prozent'}]},['ich arbeite 60 Prozent']),[]);
  assert.deepEqual(validAnswers(targets,{answers:[{id:'insurance.debts.debt_consumer.annualServiceCents',value:'10',period:null,quote:'Zehn Prozent'}]},['Zehn Prozent']),[]);
});

test('Paxi learns what a question accepts: a realistic return, a planning horizon, a number of years',()=>{
  const about=Object.fromEntries(openAsks(frame(),'de').map(a=>[a.key,a.about]));
  assert.match(about['insurance.annualReturnBps'],/between -5 and 20/);
  assert.match(about['insurance.retirementHorizonAge'],/never the age to stop working/);
  assert.deepEqual(validAnswers(answerTargets(frame()),{answers:[{id:'insurance.annualReturnBps',value:'50',period:null,quote:'50 Prozent'}]},['50 Prozent']),[]);
});

test('live: the intake extraction fills only empty fields; an answered 3a is not overwritten by "20000 more saving"',async t=>{
  const requests=[];let intakeTurn=0;
  const transport=async request=>{
    requests.push(request);
    const name=request.tools[0].name;
    let args;
    if(name==='submit_setup_facts')args={age:{value:'22',quote:'22'},employment_rate_percent:{value:'60',quote:'60 Prozent'}};
    else if(name==='submit_intake_observations')args={observations:[
      [{fieldId:'pillar_3a_annual_contribution_chf',quote:'6000 im Jahr',value:'6000',precision:'exact',period:'year',basis:null}],
      [{fieldId:'pillar_3a_annual_contribution_chf',quote:'zwanzigtausend',value:'20000',precision:'exact',period:'year',basis:null}]][intakeTurn++]??[]};
    else args={answers:intakeTurn===2?[{id:'insurance.annualSavingCents',value:'20000',period:'year',quote:'zwanzigtausend'}]:[]};
    return {status:'completed',output:[{type:'function_call',name,arguments:JSON.stringify(args)}]};
  };
  const f=await demoApp(t,{demoStart:true,voice:{enabled:true,gateways:[new FakeVoiceGateway()]},modelExtraction:{enabled:true,transport}});
  const started=await f.customer.call('POST','/api/demo/start',{locale:'de',empty:true});
  f.customer.csrf=started.body.csrfToken;
  const path=`/api/cases/${started.body.caseId}`,current=async()=>(await f.customer.call('GET',path)).body;
  const notice=(await f.customer.call('GET','/api/extraction/privacy?locale=de')).body;
  let c=await current();
  await f.customer.call('POST',`${path}/extraction/consent`,{expectedCaseRevision:c.caseRevision,noticeVersion:notice.version,noticeHash:notice.noticeHash,dataClassification:'synthetic',allowSyntheticModelExtraction:true});
  c=await current();
  const sid=(await f.customer.call('POST',`${path}/voice/sessions`,{messageId:'only_empty',expectedCaseRevision:c.caseRevision,provider:'gpt-live',locale:'de',
    dataClassification:'synthetic',noticeVersion:'voice-synthetic-v1',allowExternalVoiceProcessing:true,sdp:'v=offer'})).body.voiceSession.id;
  const say=async(text,personId)=>{
    const latest=await current(),messageId=`turn_${crypto.randomUUID()}`;
    await f.customer.call('POST',`${path}/voice/sessions/${sid}/turns`,{speaker:'customer',log:{schemaVersion:'1.0',messageId,caseId:latest.id,correlationId:sid,turnId:messageId,
      source:'voice',locale:'de',text,transcriptStatus:'final',dataClassification:'synthetic'}});
    const r=await f.customer.call('POST',`${path}/voice-lab/turns`,{mode:'live',voiceSessionId:sid,messageId,...(personId?{personId}:{})});
    assert.equal(r.status,201,JSON.stringify(r.body));
    await f.customer.call('POST',`${path}/demo-accept`,{});
  };
  await say('Ich bin 22 und arbeite 60 Prozent');
  await say('In die 3a zahle ich 6000 im Jahr','person_1');
  assert.equal((await current()).draft.insurance.existingAnnualPillar3aContributionCents,600000);
  await say('Ähh, zwanzigtausend','person_1');
  c=await current();
  assert.equal(c.draft.insurance.existingAnnualPillar3aContributionCents,600000,'the 3a stays');
  assert.equal(c.draft.insurance.annualSavingCents,2000000,'the additional saving is where it was asked');
});

const P=text=>({role:'assistant',text}),K=text=>({role:'user',text});
const log=[P('Wie alt bist du?'),K('22'),P('Mit welchem Alter in Pension?'),K('67'),P('Und deine Risikobereitschaft?'),K('Niedrig'),
  P('Was möchtest du erreichen?'),K('Ähh,'),K('Familie und ein eigenes Haus')];

test('the recognition reads only the latest exchange: Paxi\'s question and the answer, fragments as one',()=>{
  assert.deepEqual(latestExchange(log),[P('Was möchtest du erreichen?'),K('Ähh,'),K('Familie und ein eigenes Haus')]);
  // A bare confirmation takes the exchange it confirms.
  assert.deepEqual(latestExchange([P('Wie viel verdienst du?'),K('80000 im Jahr'),P('Brutto?'),K('Ja, brutto')]),
    [P('Wie viel verdienst du?'),K('80000 im Jahr'),P('Brutto?'),K('Ja, brutto')]);
  assert.deepEqual(latestExchange([P('Wie alt bist du?'),K('22'),P('Pensionsalter?'),K('Mit 67')]),[P('Pensionsalter?'),K('Mit 67')],'a number is an answer of its own');
  assert.deepEqual(latestExchange(log,2).map(t=>t.text),['Und deine Risikobereitschaft?','Niedrig','Was möchtest du erreichen?','Ähh,','Familie und ein eigenes Haus']);
  assert.deepEqual(latestExchange([P('Hallo')]),[]);
});

test('both models get only the latest exchange, not the whole log',async()=>{
  const seen=[];
  const transport=async request=>{seen.push(JSON.parse(request.input[0].content).conversation);
    return {status:'completed',output:[{type:'function_call',name:request.tools[0].name,arguments:request.tools[0].name==='submit_answers'?'{"answers":[]}':'{"observations":[]}'}]};};
  await modelObservations(transport,log,'m1','person_1',new AbortController().signal);
  await answerObservations(transport,log,answerTargets(frame()),new AbortController().signal);
  for(const conversation of seen)assert.deepEqual(conversation.map(t=>t.text),['Was möchtest du erreichen?','Ähh,','Familie und ein eigenes Haus']);
  // The partner's age and rate may come one exchange after the other.
  const married=answerTargets(pendingView(frame(),[{path:'insurance.relationship',value:'married'}],CASE));
  seen.length=0;
  await answerObservations(transport,[...log,P('Wie alt ist deine Partnerin, und wie viel arbeitet sie?'),K('Sie ist 33'),P('Und das Pensum?'),K('60 Prozent')],married,new AbortController().signal);
  assert.ok(seen[0].some(t=>t.text==='Sie ist 33'));
  assert.ok(!seen[0].some(t=>t.text==='22'),'never the whole log');
});
