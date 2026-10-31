import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PRIVACY_NOTICE} from '@pax/contracts';
import {createLifeInsuranceApp} from '../apps/api/dist/insurance/app.js';
import {SyntheticTestProvider} from './helpers/life-fixture.mjs';
import {FakeVoiceGateway,voiceCredentials} from './helpers/voice-fixture.mjs';

/** All intake/transcript/extraction/state operations cross the authenticated public HTTP seam. */
async function incomeCase(t,locale='en') {
  const directory=await mkdtemp(join(tmpdir(),'pax-spoken-income-'));
  const {app}=await createLifeInsuranceApp({dataDirectory:directory,provider:new SyntheticTestProvider(),providerMode:'test',credentials:voiceCredentials,
    voice:{enabled:true,gateways:[new FakeVoiceGateway()]}});
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  await app.listen(0,'127.0.0.1');const base=await app.getUrl();let login;
  async function call(method,path,body){
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(login?{Cookie:`pax_session=${login.sessionToken}`,'X-CSRF-Token':login.csrfToken}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r.status,body:await r.json()};
  }
  login=(await call('POST','/api/sessions',{accessCode:voiceCredentials.customerAccessCode})).body;
  const c=(await call('POST','/api/cases',{locale,timeBudgetMinutes:30,noticeVersion:PRIVACY_NOTICE.version,dataClassification:'synthetic'})).body;
  const path=`/api/cases/${c.id}`;
  const init=await call('POST',`${path}/voice-lab/initialize`,{expectedCaseRevision:c.caseRevision});
  assert.equal(init.status,201,JSON.stringify(init.body));
  const current=async()=>{const result=await call('GET',path);assert.equal(result.status,200);return result.body;};
  const before=await current();
  const started=await call('POST',`${path}/voice/sessions`,{messageId:crypto.randomUUID(),expectedCaseRevision:before.caseRevision,provider:'gpt-live',locale,
    dataClassification:'synthetic',noticeVersion:'voice-synthetic-v1',allowExternalVoiceProcessing:true,sdp:'v=synthetic-offer'});
  assert.equal(started.status,201,JSON.stringify(started.body));
  const sid=started.body.voiceSession.id;
  return {before,current,call,path,sid,
    async turn(speaker,text){
      const messageId=crypto.randomUUID();
      const result=await call('POST',`${path}/voice/sessions/${sid}/turns`,{speaker,log:{schemaVersion:'1.0',messageId,caseId:c.id,correlationId:sid,turnId:messageId,
        source:'voice',locale,text,transcriptStatus:'final',dataClassification:'synthetic'}});
      assert.equal(result.status,201,JSON.stringify(result.body));return messageId;
    },
    extract:messageId=>call('POST',`${path}/voice-lab/turns`,{mode:'live',voiceSessionId:sid,messageId,personId:'person_demo_1'}),
    transcript:()=>call('GET',`${path}/voice/sessions/${sid}/transcript`),
  };
}

test('actual live English speech and Correction. create sourced pending proposals without accepting or confirming them',async t=>{
  const f=await incomeCase(t);
  const firstText='My annual gross income is one hundred nineteen thousand Swiss francs';
  const correctedText='Correction. My annual gross income is one hundred eighteen thousand Swiss francs';
  const firstId=await f.turn('customer',firstText);
  const first=await f.extract(firstId);
  assert.equal(first.status,201,JSON.stringify(first.body));
  assert.ok(first.body.extraction.result.proposalBatch,'observed spoken income must create a pending proposal');
  assert.deepEqual(first.body.extraction.request.observations,[{
    fieldId:'annual_gross_income_chf',personId:'person_demo_1',sourceMessageId:firstId,
    quote:'one hundred nineteen thousand',value:'119000',precision:'exact',unit:'CHF',period:'year',basis:'gross',
  }]);
  assert.equal(first.body.extraction.result.proposalBatch.changes[0].value,11900000);
  const firstAgent=await f.turn('agent',"Thanks. And what's your monthly net income, also in CHF?");
  assert.equal((await f.extract(firstAgent)).body.code,'VOICE_SOURCE_NOT_FOUND');
  const correctedId=await f.turn('customer',correctedText);
  const corrected=await f.extract(correctedId);
  assert.equal(corrected.status,201,JSON.stringify(corrected.body));
  assert.equal(corrected.body.extraction.request.observations[0].quote,'one hundred eighteen thousand');
  assert.equal(corrected.body.extraction.request.observations[0].sourceMessageId,correctedId);
  assert.equal(corrected.body.extraction.result.proposalBatch.changes[0].value,11800000);
  const lastAgent=await f.turn('agent','Got it, thanks. Now, your monthly net income, please?');
  assert.equal((await f.extract(lastAgent)).body.code,'VOICE_SOURCE_NOT_FOUND');
  const state=await f.current();
  assert.deepEqual(state.proposalBatches.map(b=>b.status),['superseded','proposed']);
  assert.equal(state.proposalBatches[0].replacedByBatchId,state.proposalBatches[1].id);
  assert.deepEqual(state.proposalBatches[1].supersedesBatchIds,[state.proposalBatches[0].id]);
  assert.equal(state.draft.insurance.persons[0].grossAnnualIncomeCents,12000000);
  assert.deepEqual(state.draft.financial,f.before.draft.financial);
  assert.equal(state.draft.insurance.annualSavingCents,f.before.draft.insurance.annualSavingCents);
  assert.deepEqual(state.confirmedVersions,[]);
  const transcript=(await f.transcript()).body;
  assert.deepEqual(transcript.turns.map(t=>[t.speaker,t.log.text]),[
    ['customer',firstText],['agent',"Thanks. And what's your monthly net income, also in CHF?"],
    ['customer',correctedText],['agent','Got it, thanks. Now, your monthly net income, please?'],
  ]);
  assert.equal(first.body.extraction.externalModelCall,false);
});

test('German explicit annual gross phrases accept bounded exact number words and keep their raw source quotes',async t=>{
  const f=await incomeCase(t,'de');
  for(const [text,quote,cents] of [
    ['Mein Bruttojahreseinkommen beträgt einhundertneunzehntausend Schweizer Franken.','einhundertneunzehntausend',11900000],
    ['Korrektur. Mein jährliches Bruttoeinkommen beträgt einhundertachtzehntausend Franken','einhundertachtzehntausend',11800000],
    ['Mein jährliches Bruttoeinkommen ist hundertneunzehn tausend CHF.','hundertneunzehn tausend',11900000],
    ['Mein Bruttojahreseinkommen beträgt ein hundert neunzehn tausend Schweizer Franken','ein hundert neunzehn tausend',11900000],
    ['Mein Bruttojahreseinkommen beträgt eintausendeins Franken','eintausendeins',100100],
    ['Mein Bruttojahreseinkommen beträgt einunddreissigtausend CHF','einunddreissigtausend',3100000],
    ['Mein Bruttojahreseinkommen beträgt einunddreißigtausend CHF','einunddreißigtausend',3100000],
    ['Mein Bruttojahreseinkommen beträgt zwölftausendfünfhundertsechsundfünfzig Franken','zwölftausendfünfhundertsechsundfünfzig',1255600],
    ['Mein Bruttojahreseinkommen beträgt neunhundertneunundneunzigtausendneunhundertneunundneunzig CHF','neunhundertneunundneunzigtausendneunhundertneunundneunzig',99999900],
    ['Mein Bruttojahreseinkommen beträgt null Franken','null',0],
    ["Korrektur: Mein jährliches Bruttoeinkommen beträgt 119'000.50 Schweizer Franken.","119'000.50",11900050],
    // Explicit English syntax determines number conventions even in a German UI/session.
    ['My annual gross income is One Hundred Nineteen Thousand Swiss francs','One Hundred Nineteen Thousand',11900000],
  ])await t.test(text,async()=>{
    const mid=await f.turn('customer',text),result=await f.extract(mid);
    assert.equal(result.status,201,JSON.stringify(result.body));
    assert.ok(result.body.extraction.result.proposalBatch,'exact German speech must produce a proposal');
    assert.equal(result.body.extraction.result.proposalBatch.changes[0].value,cents);
    assert.equal(result.body.extraction.request.observations[0].quote,quote);
    assert.ok(text.includes(result.body.extraction.request.observations[0].quote));
    assert.equal(result.body.extraction.request.observations[0].sourceMessageId,mid);
  });
  const state=await f.current();
  assert.equal(state.draft.insurance.persons[0].grossAnnualIncomeCents,12000000);
  assert.deepEqual(state.confirmedVersions,[]);
});

test('English place-value grammar and explicitly grouped decimal CHF amounts produce exact cents with raw quotes',async t=>{
  const f=await incomeCase(t);
  for(const [amount,cents] of [
    ['one hundred and nineteen thousand',11900000],
    ['one hundred nineteen thousand and five',11900500],
    ['one hundred nineteen thousand one hundred and twenty-three',11912300],
    ['one hundred one thousand one hundred one',10110100],
    ['one thousand one',100100],['zero',0],
    ['nine hundred ninety-nine thousand nine hundred ninety-nine',99999900],
    ['119,000',11900000],['119,000.50',11900050],["119'000.5",11900050],['119’000.50',11900050],
    ['1000000',100000000],['0.01',1],
  ])await t.test(amount,async()=>{
    const text=`My annual gross income is ${amount} Swiss francs.`;
    const mid=await f.turn('customer',text),result=await f.extract(mid);
    assert.equal(result.status,201,JSON.stringify(result.body));
    assert.equal(result.body.extraction.result.proposalBatch?.changes[0].value,cents,JSON.stringify(result.body));
    assert.equal(result.body.extraction.request.observations[0].quote,amount);
    assert.equal(result.body.extraction.request.observations[0].sourceMessageId,mid);
  });
  assert.deepEqual((await f.current()).draft,f.before.draft);
});

for(const [locale,prefix,correction] of [
  ['fr','Mon revenu annuel brut est de','Correction'],
  ['it','Il mio reddito annuo lordo è','Correzione'],
])test(`${locale}: existing numeric annual gross routes retain Swiss grouping, decimals and source quotes`,async t=>{
  const f=await incomeCase(t,locale);
  for(const [amount,cents] of [['119000',11900000],['119000.50',11900050],["119'000.50",11900050],['1000000',100000000]])await t.test(amount,async()=>{
    const text=`${correction}: ${prefix} ${amount} CHF.`;
    const mid=await f.turn('customer',text),result=await f.extract(mid);
    assert.equal(result.status,201,JSON.stringify(result.body));
    assert.equal(result.body.extraction.result.proposalBatch?.changes[0].value,cents,JSON.stringify(result.body));
    assert.equal(result.body.extraction.request.observations[0].quote,amount);
  });
  for(const marker of ['Korrektur','Correction','Correzione'])await t.test(`legacy ${marker} prefix`,async()=>{
    const mid=await f.turn('customer',`${marker}: ${prefix} 119000 CHF.`),result=await f.extract(mid);
    assert.equal(result.body.extraction.result.proposalBatch?.changes[0].value,11900000);
  });
  const count=(await f.current()).proposalBatches.length;
  const comma=await f.turn('customer',`${prefix} 119,000 CHF.`),unsupported=await f.extract(comma);
  assert.deepEqual(unsupported.body.extraction.request.observations,[]);
  assert.equal(unsupported.body.extraction.result.issues[0].code,'RULE_NOT_MATCHED');
  assert.equal((await f.current()).proposalBatches.length,count);
  assert.deepEqual((await f.current()).draft,f.before.draft);
});

const rejectedEnglish=[
  ...['about one hundred nineteen thousand','approximately 119000','at least 119000','up to 119000',
    'not one hundred nineteen thousand','minus one hundred nineteen thousand','negative 119000','-119000','-0',
    '119000-120000','between one hundred nineteen thousand and one hundred twenty thousand',
    'one one hundred nineteen thousand','one hundred hundred nineteen thousand','one hundred nineteen nineteen thousand',
    'one hundred nineteen thousand thousand','one thousand thousand','one thousand million','one million',
    'zero thousand','one hundred and zero','one hundred and and nineteen thousand','one hundred nineteen thousand zero',
    'one hundred nineteen thousand one one','one hundred nineteen thousand point five','nineteen hundred','119 thousand',
    '119000 118000','119,00','1,19,000','11,9000','01,000',"119'00","1'19'000","1'000,000","1’000'000",
    '119.000','119000,50','119,000,50','119,000.123','0119000','10000000000.01',
  ].map(amount=>`My annual gross income is ${amount} CHF.`),
  'My monthly gross income is one hundred nineteen thousand Swiss francs',
  'My annual net income is one hundred nineteen thousand Swiss francs',
  'My annual income is one hundred nineteen thousand Swiss francs',
  "My partner's annual gross income is one hundred nineteen thousand Swiss francs",
  'My annual gross income is one hundred nineteen thousand dollars',
  'My annual gross income is one hundred nineteen thousand',
  'My annual gross income is 119000 CHF, but that was only an example.',
  'My annual gross income is 119000 CHF. My annual gross income is 118000 CHF.',
];
const rejectedGerman=[
  ...['ungefähr einhundertneunzehntausend','circa 119000','ca. 119000','rund 119000','mindestens 119000','nicht 119000',
    'minus einhundertneunzehntausend','-119000','119000 bis 120000',
    'zwischen einhundertneunzehntausend und einhundertzwanzigtausend',
    'ein einhundertneunzehntausend','hundert hundert tausend','tausend tausend','neun zehn tausend',
    'eins hundertneunzehntausend','eins tausend','einsundzwanzigtausend','einhundertneunzehntausendnull',
    'einhundertneunzehntausend komma fünf','eine Million','119 tausend','119,000','119.000',"1'19'000",'119000 118000',
  ].map(amount=>`Mein jährliches Bruttoeinkommen beträgt ${amount} Schweizer Franken.`),
  'Mein monatliches Bruttoeinkommen beträgt 119000 CHF.',
  'Mein Nettojahreseinkommen beträgt 119000 CHF.',
  'Mein jährliches Einkommen beträgt 119000 CHF.',
  'Das Bruttojahreseinkommen meines Partners beträgt 119000 CHF.',
];
for(const [locale,cases] of [['en',rejectedEnglish],['de',rejectedGerman]])test(`${locale}: unsupported, approximate, repeated or malformed income statements never invent an observation`,async t=>{
  const f=await incomeCase(t,locale);
  for(const text of cases)await t.test(text,async()=>{
    const mid=await f.turn('customer',text),result=await f.extract(mid);
    assert.equal(result.status,201,JSON.stringify(result.body));
    assert.deepEqual(result.body.extraction.request.observations,[],text);
    assert.equal(result.body.extraction.result.proposalBatch,null,text);
    assert.equal(result.body.extraction.result.issues[0].code,'RULE_NOT_MATCHED',text);
    assert.equal(result.body.extraction.result.issues[0].action,'screen_or_human_review',text);
  });
  // Even an exactly matching statement spoken by the agent is never a customer fact.
  const agent=await f.turn('agent','My annual gross income is one hundred nineteen thousand Swiss francs');
  const forbidden=await f.extract(agent);assert.equal(forbidden.status,422);assert.equal(forbidden.body.code,'VOICE_SOURCE_NOT_FOUND');
  const state=await f.current();
  assert.deepEqual(state.draft,f.before.draft);
  assert.deepEqual(state.proposalBatches,[]);
  assert.deepEqual(state.confirmedVersions,[]);
  assert.equal(state.caseRevision,f.before.caseRevision);
});
