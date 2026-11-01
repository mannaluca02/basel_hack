import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLifeInsuranceApp} from '../../apps/api/dist/insurance/app.js';
import {SyntheticTestProvider} from './life-fixture.mjs';
import {FakeVoiceGateway} from './voice-fixture.mjs';
import {client,credentials} from './demo-http.mjs';

/**
 * A whole live conversation from A to Z, as the live build runs it: the empty start, both
 * consents, a voice session, the first sentence that sets up the person, then Paxi asking what
 * the backend's open-question queue holds next (`GET voice-lab/questions`) and the customer
 * answering from the script below. Every customer sentence goes through `voice-lab/turns`
 * (recognition) and is taken over at once (`demo-accept`, as LiveVoice does in the live build),
 * until nothing is open, the profile is confirmed and the charts are calculated.
 *
 * `transport` is the model: `oracleTransport()` answers from the script (deterministic, for the
 * tests), `openAiResponsesTransport(key)` is the real one (scripts/live-conversation.mjs).
 */

const YEAR=new Date().getUTCFullYear();
const p1='insurance.persons.person_1',p2='insurance.persons.person_2';
const ins=(d,id)=>d.insurance.persons.find(p=>p.personId===id);
const fin=(d,id)=>d.financial.persons.find(p=>p.id===id);
const expense=(d,id)=>d.financial.expenses.find(e=>e.id===id)?.amount;
const yearly=a=>a&&a.value!==null?a.value*(a.period==='month'?12:1):null;

/** The customer's first sentence: age and employment rate set up the person. */
export const SETUP={say:'Ich bin vierunddreissig und arbeite achtzig Prozent als Pflegefachfrau.',
  facts:{age:{value:'34',quote:'vierunddreissig'},employment_rate_percent:{value:'80',quote:'achtzig Prozent'}},
  expect:[['Geburtsjahr',d=>fin(d,'person_1').birthYear,YEAR-34],['Pensum',d=>fin(d,'person_1').employmentRateBps,8000]]};

/**
 * What the customer says to each open question (`key` matches the backend's question key).
 * `say` are the customer's sentences; `paxi` an optional follow-up of Paxi between them.
 * `answers` is what a perfect recognition submits for the last sentence (the oracle only);
 * `expect` what the saved profile must hold in the end, whoever recognised it.
 */
export const SCRIPT=[
  {key:/^goals$/,say:['Ich möchte gut für die Pension vorsorgen und meine Familie absichern.'],
    answers:[['goals','retirement,family','für die Pension vorsorgen und meine Familie absichern']],
    expect:[['Ziele',d=>d.goals.map(g=>g.kind).sort().join(),'family,retirement']]},
  {key:/^insurance\.relationship$/,say:['Ich bin verheiratet.'],answers:[['insurance.relationship','married','verheiratet']],
    expect:[['Zivilstand',d=>d.insurance.relationship,'married']]},
  {key:/^financial\.partner$/,say:['Mein Mann ist dreiunddreissig und arbeitet sechzig Prozent.'],
    answers:[['partner.age','33','dreiunddreissig'],['partner.employment_rate_percent','60','sechzig Prozent']],
    expect:[['Partner Geburtsjahr',d=>fin(d,'person_2')?.birthYear,YEAR-33],['Partner Pensum',d=>fin(d,'person_2')?.employmentRateBps,6000]]},
  {key:/^insurance\.relationshipSinceYear$/,say:['Seit zweitausendfünfzehn.'],answers:[['insurance.relationshipSinceYear','2015','zweitausendfünfzehn']],
    expect:[['Partnerschaft seit',d=>d.insurance.relationshipSinceYear,2015]]},
  {key:/^insurance\.sharedChildren$/,say:['Wir haben eine Tochter.'],answers:[['insurance.sharedChildren','1','eine Tochter']],
    expect:[['Gemeinsame Kinder',d=>d.insurance.sharedChildren,1]]},
  {key:/^insurance\.children$/,say:['Sie ist zweitausendneunzehn geboren.'],answers:[['insurance.children','2019','zweitausendneunzehn']],
    expect:[['Kind Jahrgang',d=>d.insurance.children[0]?.birthYear,2019]]},
  {key:/^insurance\.children\.[^.]+\.supportUntilMonth$/,say:['Bis zweitausendvierundvierzig, dann ist sie fünfundzwanzig.'],
    answers:[['{key}','2044','Bis zweitausendvierundvierzig']],expect:[['Unterstützung bis',d=>d.insurance.children[0]?.supportUntilMonth,'2044-12']]},

  {key:/^insurance\.persons\.person_1\.providerSex$/,say:['Weiblich.'],answers:[['{key}','female','Weiblich']],expect:[['Geschlecht',d=>ins(d,'person_1').providerSex,2]]},
  {key:/^insurance\.persons\.person_1\.grossAnnualIncomeCents$/,say:['Etwa fünfundneunzigtausend.','Ja, brutto im Jahr.'],paxi:'Ist das brutto und pro Jahr?',
    answers:[['{key}','95000','fünfundneunzigtausend','year']],expect:[['Bruttoeinkommen',d=>ins(d,'person_1').grossAnnualIncomeCents,9500000]]},
  {key:/^financial\.persons\.person_1\.income$/,say:['Netto bleiben mir etwa sechstausend im Monat.'],answers:[['{key}','6000','sechstausend im Monat','month']],
    expect:[['Nettoeinkommen pro Jahr',d=>yearly(fin(d,'person_1').income),7200000],['Einkommensbasis',d=>fin(d,'person_1').incomeBasis,'net_after_income_tax']]},
  {key:/^insurance\.persons\.person_1\.withPillar2$/,say:['Ja, ich bin in einer Pensionskasse.'],answers:[['{key}','true','Ja, ich bin in einer Pensionskasse']],
    expect:[['Pensionskasse',d=>ins(d,'person_1').withPillar2,true]]},
  {key:/^insurance\.persons\.person_1\.retirementPensionAnnualCents$/,say:['Laut Vorsorgeausweis sind es dreissigtausend Franken im Jahr.'],
    answers:[['{key}','30000','dreissigtausend Franken im Jahr','year']],expect:[['PK-Rente',d=>ins(d,'person_1').retirementPensionAnnualCents,3000000]]},
  {key:/^insurance\.persons\.person_1\.pillar2Risk\./,say:['Invalidenrente vierundzwanzigtausend, Invaliden-Kinderrente viertausendachthundert, Partnerrente achtzehntausend und Waisenrente viertausendachthundert, alles im Jahr.'],
    answers:[[`${p1}.pillar2Risk.disabilityAnnualCents`,'24000','Invalidenrente vierundzwanzigtausend','year'],[`${p1}.pillar2Risk.disabilityChildAnnualCents`,'4800','Invaliden-Kinderrente viertausendachthundert','year'],
      [`${p1}.pillar2Risk.survivorAnnualCents`,'18000','Partnerrente achtzehntausend','year'],[`${p1}.pillar2Risk.orphanAnnualCents`,'4800','Waisenrente viertausendachthundert','year']],
    expect:[['PK Invalidenrente',d=>ins(d,'person_1').pillar2Risk.disabilityAnnualCents,2400000],['PK Invaliden-Kinderrente',d=>ins(d,'person_1').pillar2Risk.disabilityChildAnnualCents,480000],
      ['PK Partnerrente',d=>ins(d,'person_1').pillar2Risk.survivorAnnualCents,1800000],['PK Waisenrente',d=>ins(d,'person_1').pillar2Risk.orphanAnnualCents,480000]]},
  {key:/^insurance\.persons\.person_1\.desiredWorkStopAge$/,say:['Mit vierundsechzig.'],answers:[['{key}','64','vierundsechzig']],expect:[['Pensionsalter',d=>ins(d,'person_1').desiredWorkStopAge,64]]},
  {key:/^insurance\.persons\.person_1\.disabilityNeedAnnualCents$/,say:['Bei Erwerbsunfähigkeit bräuchte ich etwa siebzigtausend im Jahr.'],answers:[['{key}','70000','siebzigtausend im Jahr','year']],
    expect:[['Bedarf Erwerbsunfähigkeit',d=>ins(d,'person_1').disabilityNeedAnnualCents,7000000]]},
  {key:/^insurance\.persons\.person_1\.deathNeedAnnualCents$/,say:['Meine Familie bräuchte etwa fünfzigtausend im Jahr.'],answers:[['{key}','50000','fünfzigtausend im Jahr','year']],
    expect:[['Bedarf Todesfall',d=>ins(d,'person_1').deathNeedAnnualCents,5000000]]},
  {key:/^insurance\.persons\.person_1\.protectionTermMonths$/,say:['Zwanzig Jahre.'],answers:[['{key}','20','Zwanzig Jahre']],expect:[['Schutzdauer Monate',d=>ins(d,'person_1').protectionTermMonths,240]]},
  {key:/^insurance\.persons\.person_1\.existingDeathCapitalCents$/,say:['Keines, also null.'],answers:[['{key}','0','also null']],expect:[['Todesfallkapital',d=>ins(d,'person_1').existingDeathCapitalCents,0]]},
  {key:/^insurance\.persons\.person_1\.deathOneOffCostsCents$/,say:['Etwa fünfzehntausend für die Beerdigung.'],answers:[['{key}','15000','fünfzehntausend']],
    expect:[['Einmalige Kosten',d=>ins(d,'person_1').deathOneOffCostsCents,1500000]]},
  {key:/^insurance\.persons\.person_1\.personalAffordableAnnualPremiumCents$/,say:['Zweitausend im Jahr kann ich tragen.'],answers:[['{key}','2000','Zweitausend im Jahr','year']],
    expect:[['Tragbare Prämie',d=>ins(d,'person_1').personalAffordableAnnualPremiumCents,200000]]},

  {key:/^insurance\.persons\.person_2\.providerSex$/,say:['Männlich.'],answers:[['{key}','male','Männlich']],expect:[['Partner Geschlecht',d=>ins(d,'person_2')?.providerSex,1]]},
  {key:/^insurance\.persons\.person_2\.grossAnnualIncomeCents$/,say:['Er verdient brutto siebzigtausend im Jahr.'],answers:[['{key}','70000','brutto siebzigtausend im Jahr','year']],
    expect:[['Partner Bruttoeinkommen',d=>ins(d,'person_2')?.grossAnnualIncomeCents,7000000]]},
  {key:/^financial\.persons\.person_2\.income$/,say:['Netto hat er etwa viertausendfünfhundert im Monat.'],answers:[['{key}','4500','viertausendfünfhundert im Monat','month']],
    expect:[['Partner Nettoeinkommen pro Jahr',d=>yearly(fin(d,'person_2')?.income),5400000]]},
  {key:/^insurance\.persons\.person_2\.withPillar2$/,say:['Ja, er hat auch eine Pensionskasse.'],answers:[['{key}','true','er hat auch eine Pensionskasse']],
    expect:[['Partner Pensionskasse',d=>ins(d,'person_2')?.withPillar2,true]]},
  {key:/^insurance\.persons\.person_2\.retirementPensionAnnualCents$/,say:['Bei ihm sind es zweiundzwanzigtausend im Jahr.'],answers:[['{key}','22000','zweiundzwanzigtausend im Jahr','year']],
    expect:[['Partner PK-Rente',d=>ins(d,'person_2')?.retirementPensionAnnualCents,2200000]]},
  {key:/^insurance\.persons\.person_2\.pillar2Risk\./,say:['Bei ihm: Invalidenrente achtzehntausend, Kinderrente dreitausendsechshundert, Partnerrente zwölftausend und Waisenrente dreitausendsechshundert im Jahr.'],
    answers:[[`${p2}.pillar2Risk.disabilityAnnualCents`,'18000','Invalidenrente achtzehntausend','year'],[`${p2}.pillar2Risk.disabilityChildAnnualCents`,'3600','Kinderrente dreitausendsechshundert','year'],
      [`${p2}.pillar2Risk.survivorAnnualCents`,'12000','Partnerrente zwölftausend','year'],[`${p2}.pillar2Risk.orphanAnnualCents`,'3600','Waisenrente dreitausendsechshundert','year']],
    expect:[['Partner PK Invalidenrente',d=>ins(d,'person_2')?.pillar2Risk.disabilityAnnualCents,1800000],['Partner PK Partnerrente',d=>ins(d,'person_2')?.pillar2Risk.survivorAnnualCents,1200000]]},
  {key:/^insurance\.persons\.person_2\.desiredWorkStopAge$/,say:['Er möchte mit fünfundsechzig aufhören.'],answers:[['{key}','65','fünfundsechzig']],
    expect:[['Partner Pensionsalter',d=>ins(d,'person_2')?.desiredWorkStopAge,65]]},
  {key:/^insurance\.persons\.person_2\.disabilityNeedAnnualCents$/,say:['Er bräuchte dann etwa fünfundfünfzigtausend im Jahr.'],answers:[['{key}','55000','fünfundfünfzigtausend im Jahr','year']],
    expect:[['Partner Bedarf Erwerbsunfähigkeit',d=>ins(d,'person_2')?.disabilityNeedAnnualCents,5500000]]},
  {key:/^insurance\.persons\.person_2\.deathNeedAnnualCents$/,say:['Wenn ihm etwas passiert, bräuchten wir vierzigtausend im Jahr.'],answers:[['{key}','40000','vierzigtausend im Jahr','year']],
    expect:[['Partner Bedarf Todesfall',d=>ins(d,'person_2')?.deathNeedAnnualCents,4000000]]},
  {key:/^insurance\.persons\.person_2\.protectionTermMonths$/,say:['Auch zwanzig Jahre.'],answers:[['{key}','20','zwanzig Jahre']],expect:[['Partner Schutzdauer Monate',d=>ins(d,'person_2')?.protectionTermMonths,240]]},
  {key:/^insurance\.persons\.person_2\.existingDeathCapitalCents$/,say:['Er hat auch keines, null.'],answers:[['{key}','0','null']],expect:[['Partner Todesfallkapital',d=>ins(d,'person_2')?.existingDeathCapitalCents,0]]},
  {key:/^insurance\.persons\.person_2\.deathOneOffCostsCents$/,say:['Auch etwa fünfzehntausend.'],answers:[['{key}','15000','fünfzehntausend']],
    expect:[['Partner Einmalige Kosten',d=>ins(d,'person_2')?.deathOneOffCostsCents,1500000]]},
  {key:/^insurance\.persons\.person_2\.personalAffordableAnnualPremiumCents$/,say:['Er kann tausendfünfhundert im Jahr tragen.'],answers:[['{key}','1500','tausendfünfhundert im Jahr','year']],
    expect:[['Partner Tragbare Prämie',d=>ins(d,'person_2')?.personalAffordableAnnualPremiumCents,150000]]},

  {key:/^financial\.expenses\.housing$/,say:['Die Miete kostet zweitausendzweihundert im Monat.'],answers:[['{key}','2200','zweitausendzweihundert im Monat','month']],
    expect:[['Wohnkosten pro Jahr',d=>yearly(expense(d,'housing')),2640000]]},
  {key:/^financial\.expenses_add\.living$/,say:['Für den Lebensunterhalt brauchen wir etwa dreitausendfünfhundert im Monat.'],answers:[['{key}','3500','dreitausendfünfhundert im Monat','month']],
    expect:[['Lebenshaltung pro Jahr',d=>yearly(expense(d,'living')),4200000]]},
  {key:/^financial\.expenses_add\.provision$/,say:['Für Vorsorge und Versicherungen zahlen wir sechshundert im Monat.'],answers:[['{key}','600','sechshundert im Monat','month']],
    expect:[['Vorsorgebeiträge pro Jahr',d=>yearly(expense(d,'provision')),720000]]},
  {key:/^financial\.expenses_add\.reserve$/,say:['Wir legen fünfhundert im Monat auf die Seite.'],answers:[['{key}','500','fünfhundert im Monat','month']],
    expect:[['Rücklage pro Jahr',d=>yearly(expense(d,'reserve')),600000]]},
  {key:/^financial\.expenses_add\.tax$/,say:['Steuern zahlen wir etwa vierzehntausend im Jahr.'],answers:[['{key}','14000','vierzehntausend im Jahr','year']],expect:[]},
  {key:/^financial\.safetyBuffer$/,say:['Vierhundert im Monat möchten wir frei haben.'],answers:[['{key}','400','Vierhundert im Monat','month']],
    expect:[['Sicherheitspuffer pro Jahr',d=>yearly(d.financial.safetyBuffer),480000]]},
  {key:/^financial\.assets$/,say:['Auf den Konten haben wir etwa vierzigtausend.'],answers:[['{key}','40000','vierzigtausend']],
    expect:[['Erspartes',d=>d.financial.assets.find(a=>a.id==='savings')?.amount.value,4000000],['Vermögen bestätigt',d=>d.financial.assetsConfirmed,true]]},
  {key:/^insurance\.debtsConfirmed$/,say:['Nein, wir haben keine Schulden.'],answers:[['{key}','none','keine Schulden']],
    expect:[['Schulden geklärt',d=>d.insurance.debtsConfirmed,true],['Keine Schulden',d=>d.insurance.debts.length,0],
      ['Schuldenposten im Budget',d=>yearly(expense(d,'debt')),0],['Schuldenbehandlung (Folge)',d=>ins(d,'person_1').debtTreatment,'included_in_income_need']]},
  {key:/^insurance\.existingAnnualRetirementSavingCents$/,say:['Bisher sparen wir dreitausend im Jahr für die Pension.'],answers:[['{key}','3000','dreitausend im Jahr','year']],
    expect:[['Bisheriges Sparen',d=>d.insurance.existingAnnualRetirementSavingCents,300000]]},
  {key:/^insurance\.existingAnnualPillar3aContributionCents$/,say:['In die Säule drei A zahle ich siebentausend im Jahr.'],answers:[['{key}','7000','siebentausend im Jahr','year']],
    expect:[['Säule 3a',d=>d.insurance.existingAnnualPillar3aContributionCents,700000]]},
  {key:/^insurance\.retirementNeedAnnualCents$/,say:['Im Ruhestand brauchen wir etwa sechzigtausend im Jahr.'],answers:[['{key}','60000','sechzigtausend im Jahr','year']],
    expect:[['Bedarf Ruhestand',d=>d.insurance.retirementNeedAnnualCents,6000000]]},
  {key:/^insurance\.retirementHorizonAge$/,say:['Bis neunzig sollte es reichen.'],answers:[['{key}','90','Bis neunzig']],expect:[['Planungshorizont',d=>d.insurance.retirementHorizonAge,90]]},
  {key:/^insurance\.annualReturnBps$/,say:['Rechne mit zwei Prozent.'],answers:[['{key}','2','zwei Prozent']],expect:[['Rendite (bps)',d=>d.insurance.annualReturnBps,200]]},
  {key:/^insurance\.annualSavingCents$/,say:['Zusätzlich möchten wir fünftausend im Jahr sparen.'],answers:[['{key}','5000','fünftausend im Jahr','year']],
    expect:[['Zusätzliches Sparen',d=>d.insurance.annualSavingCents,500000]]},
  {key:/^insurance\.taxLocationId$/,say:['In Basel.'],answers:[['{key}','Basel','Basel']],expect:[['Steuerort',d=>d.insurance.taxLocationId,400100000]]},
  {key:/^insurance\.existingPrivateRiskBenefitsConfirmed$/,say:['Nein, private Versicherungen haben wir keine.'],answers:[['{key}','false','private Versicherungen haben wir keine']],
    expect:[['Private Risikoleistungen geklärt',d=>d.insurance.existingPrivateRiskBenefitsConfirmed,true]]},
  {key:/^insurance\.riskCapitalStrategy$/,say:['Die freien Mittel möchte ich lieber für andere Ziele behalten.'],answers:[['{key}','preserve_assets_for_other_goals','lieber für andere Ziele behalten']],
    expect:[['Strategie freie Mittel',d=>d.insurance.riskCapitalStrategy,'preserve_assets_for_other_goals']]},
];

/** A perfect recognition, read from the script: what the tests run against (no network). */
export function oracleTransport() {
  return async request=>{
    const name=request.tools[0].name,input=JSON.parse(request.input[0].content);
    const last=[...input.conversation].reverse().find(t=>t.role==='user')?.text??'';
    let args;
    if(name==='submit_setup_facts')args=input.conversation.some(t=>t.text===SETUP.say)?SETUP.facts:{age:{value:null,quote:''},employment_rate_percent:{value:null,quote:''}};
    else if(name==='submit_intake_observations')args={observations:[]};
    else {
      const entry=SCRIPT.find(e=>e.say.at(-1)===last),ids=new Set(input.fields.map(f=>f.id));
      // The asked key comes from the field list: the script's `{key}` stands for the one that matches.
      const answers=(entry?.answers??[]).map(([id,value,quote,period=null])=>({id:id==='{key}'?input.fields.find(f=>entry.key.test(f.id))?.id:id,value,quote,period}));
      args={answers:answers.filter(a=>a.id&&ids.has(a.id))};
    }
    return {status:'completed',output:[{type:'function_call',name,arguments:JSON.stringify(args)}]};
  };
}

/**
 * Runs the conversation and returns the report: every turn (who said what, what was proposed),
 * every expectation (expected vs saved), the questions the script had no answer for, those that
 * stayed open, and whether the profile was confirmed and calculated.
 */
export async function runConversation({transport,providerMode='test',provider=providerMode==='test'?new SyntheticTestProvider():undefined,token,maxTurns=150,onTurn=()=>{}}) {
  const directory=await mkdtemp(join(tmpdir(),'pax-live-conversation-'));
  const {app}=await createLifeInsuranceApp({dataDirectory:directory,provider,providerMode,token,credentials,demoStart:true,
    voice:{enabled:true,gateways:[new FakeVoiceGateway()]},modelExtraction:{enabled:true,transport}});
  const report={turns:[],expectations:[],unscripted:[],stuck:[],profileVersion:null,runs:0,missing:[]};
  try {
    await app.listen(0,'127.0.0.1');
    const customer=client(await app.getUrl());
    const call=async(method,path,body)=>{const r=await customer.call(method,path,body);if(r.status>=300)throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(r.body)}`);return r.body;};
    const started=await call('POST','/api/demo/start',{locale:'de',empty:true});
    customer.csrf=started.csrfToken;
    const path=`/api/cases/${started.caseId}`,current=()=>call('GET',path);
    const notice=await call('GET','/api/extraction/privacy?locale=de');
    let c=await current();
    await call('POST',`${path}/extraction/consent`,{expectedCaseRevision:c.caseRevision,noticeVersion:notice.version,noticeHash:notice.noticeHash,dataClassification:'synthetic',allowSyntheticModelExtraction:true});
    c=await current();
    const sid=(await call('POST',`${path}/voice/sessions`,{messageId:'live_conversation',expectedCaseRevision:c.caseRevision,provider:'gpt-live',locale:'de',
      dataClassification:'synthetic',noticeVersion:'voice-synthetic-v1',allowExternalVoiceProcessing:true,sdp:'v=offer'})).voiceSession.id;
    const record=async(speaker,text)=>{
      const messageId=`turn_${crypto.randomUUID()}`;
      await call('POST',`${path}/voice/sessions/${sid}/turns`,{speaker,log:{schemaVersion:'1.0',messageId,caseId:started.caseId,correlationId:sid,turnId:messageId,
        source:'voice',locale:'de',text,transcriptStatus:'final',dataClassification:'synthetic'}});
      return messageId;
    };
    const turn=async(messageId,personId,key)=>{
      // As LiveVoice: the question Paxi is on goes along (askedKey), from the person on.
      const asked=personId&&!key.startsWith('setup')?{askedKey:key}:{};
      const extraction=(await call('POST',`${path}/voice-lab/turns`,{mode:'live',voiceSessionId:sid,messageId,...(personId?{personId}:{}),...asked})).extraction;
      const proposed=[extraction.result?.proposalBatch,extraction.answers?.proposalBatch].filter(Boolean).at(-1);
      const accepted=await call('POST',`${path}/demo-accept`,{});
      const entry={key,proposed:(proposed?.changes??[]).map(x=>[x.path,x.value]),issues:[...(extraction.result?.issues??[]),...(extraction.answers?.issues??[])].map(i=>i.code)};
      report.turns.at(-1).recognition=entry;onTurn(report.turns.at(-1));
      return accepted;
    };
    const say=async(speaker,text,personId,key)=>{
      report.turns.push({speaker,text});
      const id=await record(speaker,text);
      if(speaker==='agent'){onTurn(report.turns.at(-1));return null;}
      return turn(id,personId,key);
    };

    // A: the first sentence sets up the person; then that sentence is read again for her (as LiveVoice does).
    await say('agent','Erzähl mal, wie sieht dein Leben gerade so aus, mit Arbeit, Familie, Wohnen?');
    report.turns.push({speaker:'customer',text:SETUP.say});
    const setupId=await record('customer',SETUP.say);
    await turn(setupId,undefined,'setup');
    if(!(await current()).draft.financial)throw new Error('The first sentence set up no person');
    await turn(setupId,'person_1','setup:replay');

    // B to Y: Paxi asks what the queue holds; an unanswered question goes to the back (as LiveVoice does).
    const attempts={};let accepted;
    for(let n=0;n<maxTurns;n++) {
      const asks=(await call('GET',`${path}/voice-lab/questions`)).asks;
      if(!asks.length)break;
      const ask=asks.reduce((best,a)=>(attempts[a.key]??0)<(attempts[best.key]??0)?a:best);
      if((attempts[ask.key]??0)>=3)break;
      attempts[ask.key]=(attempts[ask.key]??0)+1;
      const entry=SCRIPT.find(e=>e.key.test(ask.key));
      await say('agent',ask.text);
      if(!entry){if(!report.unscripted.includes(ask.key))report.unscripted.push(ask.key);await say('customer','Das weiss ich gerade nicht.','person_1',ask.key);continue;}
      for(const [i,text] of entry.say.entries()) {
        if(i>0&&entry.paxi)await say('agent',entry.paxi);
        accepted=await say('customer',text,'person_1',ask.key);
      }
    }

    // Z: the last acceptance confirms and calculates once nothing is open.
    // (Usually the last answer's acceptance already did; this one then has nothing left to take over.)
    accepted=await call('POST',`${path}/demo-accept`,{});
    report.missing=accepted.missing??[];
    report.stuck=(await call('GET',`${path}/voice-lab/questions`)).asks.map(a=>a.key);
    const final=await current(),draft=final.draft;
    report.profileVersion=final.confirmedVersions.at(-1)?.version??null;report.runs=final.runs.length;
    for(const [label,get,expected] of [...SETUP.expect,...SCRIPT.flatMap(e=>e.expect)]) {
      let actual;try{actual=get(draft);}catch{actual=undefined;}
      report.expectations.push({label,expected,actual:actual??null,ok:actual===expected});
    }
    return report;
  } finally {await app.close();await rm(directory,{recursive:true,force:true});}
}

/** The report as text: the conversation with what was recognised, then expected vs saved. */
export function formatReport(report) {
  const lines=['Gespräch:'];
  for(const t of report.turns) {
    lines.push(`${t.speaker==='agent'?'  Paxi :':'  Kunde:'} ${t.text}`);
    if(t.recognition)lines.push(`          → ${t.recognition.proposed.length?t.recognition.proposed.map(([p,v])=>`${p}=${typeof v==='object'?JSON.stringify(v).slice(0,60):v}`).join(', '):'nichts erkannt'}${t.recognition.issues.length?` [${t.recognition.issues.join(', ')}]`:''}`);
  }
  lines.push('','Ergebnis (erwartet → gespeichert):');
  for(const e of report.expectations)lines.push(`  ${e.ok?'✓':'✗'} ${e.label}: ${JSON.stringify(e.expected)} → ${JSON.stringify(e.actual)}`);
  const ok=report.expectations.filter(e=>e.ok).length;
  lines.push('',`${ok}/${report.expectations.length} Werte richtig gespeichert`,
    `Profil bestätigt: ${report.profileVersion!==null?`ja (Version ${report.profileVersion})`:'nein'}, berechnete Szenarien: ${report.runs}`,
    `Offen geblieben: ${report.stuck.length?report.stuck.join(', '):'nichts'}`,
    `Fragen ohne Antwort im Skript: ${report.unscripted.length?report.unscripted.join(', '):'keine'}`);
  return lines.join('\n');
}
