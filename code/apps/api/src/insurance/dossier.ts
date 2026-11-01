import { sha256Json } from '../calculation/hash.js';
import { LifeInsuranceEngine } from './engine.js';
import { DemoJourneyService } from './journey.js';
import type { Actor } from './types.js';
import { WorkflowError } from './types.js';
import { t,presentRun,presentRecommendation,presentJourney,complianceSteps,moneyText,statusText,catalog,type Locale } from './i18n.js';
import { CASE_DTO_VERSION,PortalDtoSchema,SummaryBundleSchema } from '@pax/contracts';

const escape=(text:unknown)=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** The Pax logo, inline so the dossier also stands alone (saved or printed); the dot follows the theme. */
const LOGO=`<svg xmlns="http://www.w3.org/2000/svg" class="logo" role="img" aria-label="Pax" viewBox="0 0 450.21 144.62"><g><g><path d="M65.37,141.73V0h60.16c41.8,0,60.16,20.54,60.16,49.17s-18.37,49.17-60.16,49.17h-22.27v43.39h-37.89ZM122.35,69.42c18.22,0,24.58-7.52,24.58-20.25s-6.36-20.25-24.58-20.25h-19.09v40.49h19.09ZM273.92,141.73l-2.75-12c-12.44,10.12-24.3,14.9-39.92,14.9-23.28,0-39.63-13.3-39.63-34.85s14.75-33.99,44.54-38.61c16.92-2.6,25.45-3.9,31.82-4.63v-3.91c0-10.56-5.35-15.33-17.36-15.33-13.31,0-18.08,5.35-18.66,14.32h-35.29c2.6-29.94,25.31-39.92,56.55-39.92,38.04,0,51.49,16.34,51.49,48.45v39.63c0,13.02.29,18.8,3.18,31.96h-33.99ZM268.85,106.15v-17.64c-5.06.72-9.55,1.45-22.42,3.61-13.6,2.31-18.08,7.52-18.08,14.03,0,7.23,4.05,12.44,14.46,12.44,7.81,0,18.66-5.35,26.03-12.44ZM312.53,141.73l45.41-58.86-44.98-58.28h43.97l26.18,35.43,26.47-35.43h39.34l-45.12,57.99,46.42,59.15h-45.56l-25.74-34.42-26.32,34.42h-40.06Z" fill="#8ccd0f"/></g><rect class="logo-dot" y="100.66" width="39.92" height="41.07"/></g></svg>`;

/**
 * The web app's look for the dossier, a standalone page (sandboxed frame, print, saved file) that
 * cannot load the app's stylesheet. The values repeat apps/web/src/styles/tokens.css, light and
 * dark: on screen the dossier follows the system theme like the app, on paper it is always light.
 * Sections are cards as in the app; the Demo mark is the app's purple badge.
 */
const STYLE=`
:root{color-scheme:light dark;--bg:#fff;--surface:#f5f5f5;--text:#121212;--muted:#6a6a6a;--line:#d4d4d4;--strong:#121212;--logo-dot:#2a0754}
@media screen and (prefers-color-scheme:dark){:root{--bg:#1c1c1c;--surface:#282828;--text:#d4d4d4;--muted:#adadad;--line:#3a3a3a;--strong:#d4d4d4;--logo-dot:#fff}}
*{box-sizing:border-box}
html{background:var(--bg)}
body{max-width:60rem;margin:0 auto;padding:1.25rem 1rem 2rem;color:var(--text);font:400 1rem/1.5 'Civil Premium','Pax Civil',system-ui,-apple-system,sans-serif;overflow-wrap:anywhere}
header{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.logo{display:block;width:auto;height:1.5rem}
.logo-dot{fill:var(--logo-dot)}
.badge{display:inline-block;padding:.125rem .5rem;border-radius:62.5rem;color:#fff;background:#3c0078;font-size:.75rem;font-weight:700}
h1,h2{margin:0;font-weight:700;line-height:1.25}
h1{margin:1.25rem 0 .5rem;font-size:2rem}
h2{margin:0 0 .75rem;font-size:1.125rem}
p{margin:.5rem 0 0}
ul{margin:0;padding-left:1.25rem}
li+li{margin-top:.375rem}
.note,footer{color:var(--muted);font-size:.875rem}
section{margin-top:1rem;padding:1rem;border:.075rem solid var(--line);border-radius:1rem;background:var(--bg)}
@media (min-width:64rem){section{border-radius:1.25rem}}
.table{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.9375rem;overflow-wrap:normal}
th,td{padding:.5rem .75rem .5rem 0;border-bottom:.075rem solid var(--line);text-align:left;vertical-align:top}
tr>:last-child{padding-right:0}
thead th{color:var(--muted);font-size:.875rem;font-weight:500;border-bottom-color:var(--strong)}
tbody tr:last-child>*{border-bottom:0}
tbody th{font-weight:500}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
footer{margin-top:1.5rem}
@media screen and (max-width:40rem){h1{font-size:1.5rem}
thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
table,tbody,tr,th,td{display:block}
tr{padding:.5rem 0;border-bottom:.075rem solid var(--line)}
tbody th,td{padding:.125rem 0;border:0}
td{display:flex;justify-content:space-between;gap:1rem;text-align:right}
td::before{content:attr(data-label);color:var(--muted);text-align:left}}
@media print{@page{margin:18mm 16mm}body{max-width:none;padding:0}section{padding:0;border:0;margin-top:1.5rem}.table{overflow:visible}tr,li{break-inside:avoid}h2{break-after:avoid}.badge{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
`;
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
    const localizedPortal=PortalDtoSchema.parse({...presentJourney(portal,c.locale),complianceSteps:complianceSteps(c.locale),schemaVersion:CASE_DTO_VERSION});
    const localized={...common,schemaVersion:CASE_DTO_VERSION,locale:c.locale,assumptions:presentation?.assumptions??[],presentation,
      recommendations:common.recommendations.map(r=>presentRecommendation(r,c.locale)),reviewTasks:localizedPortal.reviewTasks,portal:localizedPortal};
    return SummaryBundleSchema.parse({schemaVersion:CASE_DTO_VERSION,snapshotId,customer:{snapshotId,...localized},advisor:{snapshotId,...localized,
      providerProvenance:run?.providerResults.map(r=>({operation:r.operation,status:r.status,provenance:r.provenance,issues:r.issues}))??[],
      openQuestions:this.engine.questions(actor,id).mandatoryFields,
      decisions:c.recommendations.filter(r=>r.runId===run?.id).flatMap(r=>[r.decision,...r.candidates.map(p=>p.rule)])}});
  }
  html(actor:Actor,id:string,audience:'customer'|'advisor') {
    const bundle=this.bundle(actor,id),d=bundle[audience];
    const locale:Locale=d.locale;const messages=catalog(locale).messages;const say=(key:Parameters<typeof t>[1])=>escape(t(locale,key));
    const label=(key:string)=>messages[key]??t(locale,'common.review');
    const person=(id:string)=>`${t(locale,'common.person')} ${(d.financial?.persons.findIndex(p=>p.id===id)??-1)+1}`;
    const list=(items:string[])=>items.length?`<ul>${items.map(s=>`<li>${escape(s)}</li>`).join('')}</ul>`:`<p class="note">${say('common.none')}</p>`;
    const section=(title:string,body:string)=>`<section><h2>${title}</h2>${body}</section>`;
    const table=(head:string,body:string)=>`<div class="table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    const metrics=d.presentation?.metrics??[];
    // One review status for every figure (usually "estimate"): said once below the table, not per row.
    const statuses=[...new Set(metrics.map(m=>m.statusLabel))];const perRow=statuses.length>1;
    const rows=metrics.map(m=>`<tr><th>${escape((m.personId?person(m.personId)+' · ':'')+m.label)}</th><td class="num" data-label="CHF">${escape(m.formatted)}</td><td data-label="${say('common.period')}">${escape(m.periodLabel)}</td>${perRow?`<td data-label="${say('common.status')}">${escape(m.statusLabel)}</td>`:''}</tr>`).join('');
    const results=table(`<th>${say('common.metric')}</th><th class="num">CHF</th><th>${say('common.period')}</th>${perRow?`<th>${say('common.status')}</th>`:''}`,rows)
      +(!perRow&&statuses.length?`<p class="note">${say('common.status')}: ${escape(statuses[0])}</p>`:'');
    const goals=d.goals.map(g=>`${label('goal.'+g.kind)}${g.targetMonth?' · '+g.targetMonth:''}${g.targetCapitalCents!==null?' · '+moneyText(locale,g.targetCapitalCents):''}`);
    const riskRows=d.riskNeeds.map(r=>`<tr><th>${escape(person(r.personId))} · ${escape(label('event.'+r.event))}</th><td class="num" data-label="${say('common.need')}">${escape(moneyText(locale,r.annualNeedCents))}</td><td class="num" data-label="${say('common.gap')}">${escape(moneyText(locale,r.annualGapCents))}</td><td class="num" data-label="${say('common.capitalNeed')}">${escape(moneyText(locale,r.deathCapitalCents))}</td></tr>`).join('');
    const risks=table(`<th>${say('common.person')}</th><th class="num">${say('common.need')}</th><th class="num">${say('common.gap')}</th><th class="num">${say('common.capitalNeed')}</th>`,riskRows);
    // Each option on one line, its reasoning below in small print.
    const options=d.recommendations.flatMap(r=>r.candidates.map(c=>`<li><strong>${escape(c.productName)}</strong> · ${escape(moneyText(locale,c.needAmountCents))} (${escape(label('period.'+c.needPeriod))})<br><span class="note">${escape(c.explanation)}</span></li>`));
    const recommendations=(options.length?`<ul>${options.join('')}</ul>`:`<p class="note">${say('common.none')}</p>`)+`<p class="note">${say('common.noPremium')}</p>`;
    const policies=d.portal.policies.map(p=>`${t(locale,'common.policy')} · ${p.id} · ${t(locale,'common.demo')}`);
    const applications=d.portal.applications.map(a=>`${t(locale,'common.application')} · ${a.id} · ${statusText(locale,a.status)}`);
    const quotes=d.portal.quotes.map(q=>`${t(locale,'common.quote')} · ${q.id} · ${t(locale,'common.noPremium')}`);
    const portal=[...quotes,...applications,...policies];
    const timeline=d.timeline?.phases.map(p=>p.fromMonth+' · '+p.persons.map(x=>`${person(x.personId)}: ${statusText(locale,x.phase)}`).join(' · '))??[];
    const provenance=audience==='advisor'?bundle.advisor.providerProvenance.map(p=>`${p.operation} · ${statusText(locale,p.status)} · ${p.provenance.sourceRef} · ${p.provenance.inputHash}`):[];
    // The same review note can come from the assumptions and from the review reasons.
    const assumptions=[...new Set([...d.assumptions,...(d.presentation?.reviewReasons.map(r=>r.text)??[])])];
    return `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light dark"><title>${say('common.title')}</title>
<style>${STYLE}</style>
<header>${LOGO}${audience==='advisor'?`<span class="note">${say('common.advisor')}</span>`:''}</header>
<h1>${say('common.title')}</h1><span class="badge">${say('common.demo')}</span><p class="note">${say('common.disclaimer')}</p>
${section(say('common.goals'),list(goals))}
${section(say('common.results'),results)}
${section(say('common.risks'),risks)}
${section(say('common.recommendations'),recommendations)}
${d.timeline?section(say('common.timeline'),list(timeline)):''}
${section(say('common.assumptions'),list(assumptions))}
${portal.length?section(say('common.portal'),list(portal)+`<p class="note">${say('common.documents')}</p>`):''}
${audience==='advisor'?section(say('common.sources'),list(provenance)):''}
<footer>${say('common.case')} ${escape(d.caseId)} · ${say('common.profile')} ${escape(d.profileVersion)} · ${say('common.snapshot')} ${escape(bundle.snapshotId)}</footer></html>`;
  }
}
