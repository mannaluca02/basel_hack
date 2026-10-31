import { sha256Json } from '../calculation/hash.js';
import { LifeInsuranceEngine } from './engine.js';
import { DemoJourneyService } from './journey.js';
import type { Actor } from './types.js';
import { WorkflowError } from './types.js';
import { t,presentRun,presentRecommendation,presentJourney,moneyText,statusText,catalog,type Locale } from './i18n.js';

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
    const presentation=run?presentRun(run,c.locale):null;
    const localized={...common,locale:c.locale,assumptions:presentation?.assumptions??[],presentation,
      recommendations:common.recommendations.map(r=>presentRecommendation(r,c.locale)),portal:presentJourney(portal,c.locale)};
    return {snapshotId,customer:{snapshotId,...localized},advisor:{snapshotId,...localized,
      providerProvenance:run?.providerResults.map(r=>({operation:r.operation,status:r.status,provenance:r.provenance,issues:r.issues}))??[],
      openQuestions:this.engine.questions(actor,id).mandatoryFields,
      decisions:c.recommendations.filter(r=>r.runId===run?.id).flatMap(r=>[r.decision,...r.candidates.map(p=>p.rule)])}};
  }
  html(actor:Actor,id:string,audience:'customer'|'advisor') {
    const bundle=this.bundle(actor,id),d=bundle[audience];
    const locale:Locale=d.locale;const messages=catalog(locale).messages;
    const label=(key:string)=>messages[key]??t(locale,'common.review');
    const person=(id:string)=>`${t(locale,'common.person')} ${(d.financial?.persons.findIndex(p=>p.id===id)??-1)+1}`;
    const list=(items:string[])=>items.length?`<ul>${items.map(s=>`<li>${escape(s)}</li>`).join('')}</ul>`:`<p>${escape(t(locale,'common.none'))}</p>`;
    const rows=(d.presentation?.metrics??[]).map(m=>`<tr><th>${escape((m.personId?person(m.personId)+' · ':'')+m.label)}</th><td>${escape(m.formatted)}</td><td>${escape(m.periodLabel)}</td><td>${escape(m.statusLabel)}</td></tr>`).join('');
    const goals=d.goals.map(g=>`${label('goal.'+g.kind)}${g.targetMonth?' · '+g.targetMonth:''}${g.targetCapitalCents!==null?' · '+moneyText(locale,g.targetCapitalCents):''}`);
    const riskRows=d.riskNeeds.map(r=>`<tr><th>${escape(person(r.personId))} · ${escape(label('event.'+r.event))}</th><td>${escape(moneyText(locale,r.annualNeedCents))}</td><td>${escape(moneyText(locale,r.annualGapCents))}</td><td>${escape(moneyText(locale,r.deathCapitalCents))}</td></tr>`).join('');
    const recommendations=d.recommendations.flatMap(r=>r.candidates.map(c=>`${c.productName} · ${moneyText(locale,c.needAmountCents)} (${label('period.'+c.needPeriod)}) · ${c.explanation}`));
    const policies=d.portal.policies.map(p=>`${t(locale,'common.policy')} · ${p.id} · ${t(locale,'common.demo')}`);
    const applications=d.portal.applications.map(a=>`${t(locale,'common.application')} · ${a.id} · ${statusText(locale,a.status)}`);
    const quotes=d.portal.quotes.map(q=>`${t(locale,'common.quote')} · ${q.id} · ${t(locale,'common.noPremium')}`);
    const timeline=d.timeline?.phases.map(p=>p.fromMonth+' · '+p.persons.map(x=>`${person(x.personId)}: ${statusText(locale,x.phase)}`).join(' · '))??[];
    const provenance=audience==='advisor'?bundle.advisor.providerProvenance.map(p=>`${p.operation} · ${statusText(locale,p.status)} · ${p.provenance.sourceRef} · ${p.provenance.inputHash}`):[];
    return `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(t(locale,'common.title'))}</title>
<style>body{font:16px Arial,sans-serif;color:#121212;max-width:1000px;margin:3rem auto;padding:1rem}h1{color:#3c0078}aside{border:3px solid #3c0078;padding:1rem}table{border-collapse:collapse;width:100%}td,th{padding:.5rem;text-align:left;border-bottom:1px solid #ddd}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{margin:0;max-width:none}}</style>
<h1>${escape(t(locale,audience==='advisor'?'common.advisor':'common.customer'))}</h1><aside><strong>${escape(t(locale,'common.demo'))}</strong><p>${escape(t(locale,'common.disclaimer'))}</p></aside>
<p>${escape(t(locale,'common.case'))} ${escape(d.caseId)} · ${escape(t(locale,'common.profile'))} ${escape(d.profileVersion)} · ${escape(t(locale,'common.snapshot'))} ${escape(bundle.snapshotId)}</p>
<h2>${escape(t(locale,'common.goals'))}</h2>${list(goals)}
<h2>${escape(t(locale,'common.results'))}</h2><table><thead><tr><th>${escape(t(locale,'common.metric'))}</th><th>CHF</th><th>${escape(t(locale,'common.period'))}</th><th>${escape(t(locale,'common.status'))}</th></tr></thead><tbody>${rows}</tbody></table>
<h2>${escape(t(locale,'common.assumptions'))}</h2>${list([...d.assumptions,...(d.presentation?.reviewReasons.map(r=>r.text)??[])])}
<h2>${escape(t(locale,'common.risks'))}</h2><table><thead><tr><th>${escape(t(locale,'common.person'))}</th><th>${escape(t(locale,'common.need'))}</th><th>${escape(t(locale,'common.gap'))}</th><th>${escape(t(locale,'common.capitalNeed'))}</th></tr></thead><tbody>${riskRows}</tbody></table>
${d.timeline?`<h2>${escape(t(locale,'common.timeline'))}</h2>${list(timeline)}`:''}
<h2>${escape(t(locale,'common.recommendations'))}</h2>${list(recommendations)}<p>${escape(t(locale,'common.noPremium'))}</p>
<h2>${escape(t(locale,'common.portal'))}</h2>${list([...quotes,...applications,...policies])}<p>${escape(t(locale,'common.documents'))}</p>
${audience==='advisor'?`<h2>${escape(t(locale,'common.sources'))}</h2>${list(provenance)}`:''}</html>`;
  }
}
