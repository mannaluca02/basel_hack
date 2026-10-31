import { sha256Json } from '../calculation/hash.js';
import { LifeInsuranceEngine } from './engine.js';
import { DemoJourneyService } from './journey.js';
import type { Actor } from './types.js';
import { WorkflowError } from './types.js';

const escape=(text:unknown)=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export class DossierService {
  constructor(readonly engine:LifeInsuranceEngine,readonly journey:DemoJourneyService){}
  bundle(actor:Actor,id:string) {
    if(actor.role==='advisor')throw new WorkflowError('FORBIDDEN',403);
    const c=this.engine.caseFor(actor,id);const profile=c.confirmedVersions.at(-1);
    const run=!c.draftDirty?c.runs.find(r=>r.id===c.activeRunId):null;const portal=this.journey.portal(actor,id);
    const common={caseId:c.id,profileVersion:profile?.version??null,runId:run?.id??null,calculationInputHash:run?.inputHash??null,
      draftPending:c.draftDirty,goals:profile?.draft.goals??c.draft.goals,financial:profile?.draft.financial??null,
      metrics:run?.local.metrics??[],capitalAllocations:run?.local.capitalBreakdown??[],riskNeeds:run?.riskNeeds??[],
      timeline:run?.timeline??null,pillarPicture:run?.pillarPicture??[],assumptions:run?.assumptions??[],reviewReasons:run?.reviewReasons??[],reviewTasks:portal.reviewTasks,
      recommendations:c.recommendations.filter(r=>r.runId===run?.id),comparisons:c.comparisons.filter(x=>x.profileVersion===profile?.version),portal,coverageInForce:false,demo:true};
    const snapshotId=sha256Json(common);
    return {snapshotId,customer:{snapshotId,...common},advisor:{snapshotId,...common,
      providerProvenance:run?.providerResults.map(r=>({operation:r.operation,status:r.status,provenance:r.provenance,issues:r.issues}))??[],
      openQuestions:this.engine.questions(actor,id).mandatoryFields,
      decisions:c.recommendations.filter(r=>r.runId===run?.id).flatMap(r=>[r.decision,...r.candidates.map(p=>p.rule)])}};
  }
  html(actor:Actor,id:string,audience:'customer'|'advisor') {
    const bundle=this.bundle(actor,id),d=bundle[audience];
    const rows=d.metrics.map(m=>`<tr><th>${escape(m.id)}</th><td>${m.value===null?'Unbekannt':escape(new Intl.NumberFormat('de-CH',{style:'currency',currency:'CHF'}).format(m.value/100))}</td><td>${escape(m.period)}</td><td>${escape(m.status)}</td></tr>`).join('');
    return `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Pax LifeMap – Demo-Dossier</title>
<style>body{font:16px Arial,sans-serif;color:#121212;max-width:1000px;margin:3rem auto;padding:1rem}h1{color:#3c0078}aside{border:3px solid #3c0078;padding:1rem}table{border-collapse:collapse;width:100%}td,th{padding:.5rem;text-align:left;border-bottom:1px solid #ddd}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{margin:0;max-width:none}}</style>
<h1>Pax LifeMap – ${audience==='advisor'?'Fachperson':'Kunde'}</h1><aside><strong>DEMO – KEIN VERSICHERUNGSSCHUTZ</strong><p>Testkonfiguration ohne echte Offerte, Unterschrift, Annahme oder Police von Pax.</p></aside>
<p>Fall ${escape(d.caseId)} · Profil ${escape(d.profileVersion)} · Snapshot ${escape(bundle.snapshotId)}</p>
<h2>Bestätigter Bedarf und Ergebnisse</h2><table><thead><tr><th>Kennzahl</th><th>CHF</th><th>Periode</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Ziele, Annahmen und Prüfung</h2><pre>${escape(JSON.stringify({goals:d.goals,assumptions:d.assumptions,review:d.reviewTasks},null,2))}</pre>
<h2>Lebensversicherungsbedarf</h2><pre>${escape(JSON.stringify(d.riskNeeds,null,2))}</pre>
<h2>Demo-Vertragsweg und Portal</h2><pre>${escape(JSON.stringify(d.portal,null,2))}</pre>
${audience==='advisor'?`<h2>Prüfbare Quellen und Regeln</h2><pre>${escape(JSON.stringify(bundle.advisor.providerProvenance,null,2))}</pre>`:''}</html>`;
  }
}
