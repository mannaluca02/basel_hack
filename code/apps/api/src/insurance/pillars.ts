import type { InsuranceDraft } from '@pax/contracts';
import { annual,usable } from '@pax/domain';
import type { NormalizedProviderResult } from '../logismata/normalize.js';
import type { LifeRun } from './types.js';

export function pillarPicture(draft:InsuranceDraft,results:NormalizedProviderResult[]):LifeRun['pillarPicture'] {
  const financial=draft.financial!,intake=draft.insurance!;
  const retirement=results.find(r=>r.operation==='retirement'),risk=results.find(r=>r.operation==='risk');
  const statuses=(s:string[])=>s.includes('requires_review')?'requires_review':s.includes('needs_input')?'needs_input':s.length?'estimated':'needs_input';
  return (['1','2','3'] as const).map(pillar=>{
    const pensions:LifeRun['pillarPicture'][number]['annualPensions']=[];const sources:string[]=[];
    if(pillar==='1'||pillar==='2') {
      const metric=retirement?.metrics.find(m=>m.id===`IncomePillar${pillar}`);
      if(metric){pensions.push({event:'retirement_household',personId:null,amountCents:metric.value});sources.push(retirement!.provenance.sourceRef);}
      for(const m of risk?.metrics.filter(m=>m.id.endsWith(`_pillar${pillar}`))??[]) {
        const person=financial.persons[Math.floor((m.scenario!-1)/4)];if(person)pensions.push({event:['disability_illness','disability_accident','death_illness','death_accident'][(m.scenario!-1)%4]!,personId:person.id,amountCents:m.value});
      }
      if(risk)sources.push(risk.provenance.sourceRef);
    }else for(const p of financial.provisions.filter(p=>p.pillar==='3')) {
      pensions.push({event:p.event,personId:p.personId,amountCents:annual(p.amount)});sources.push(p.amount.sourceRef);
    }
    let capital:number|null=null;
    if(pillar==='2')capital=intake.persons.every(p=>p.currentPillar2CapitalCents!==null)?intake.persons.reduce((sum,p)=>sum+p.currentPillar2CapitalCents!,0):null;
    if(pillar==='3') {
      const assets=financial.assets.filter(a=>a.pillar==='3');
      capital=financial.assetsConfirmed&&assets.every(a=>usable(a.amount))?assets.reduce((sum,a)=>sum+a.amount.value!,0):null;
      sources.push(...assets.map(a=>a.amount.sourceRef));
    }
    return {pillar,status:pillar==='3'?(capital===null?'needs_input':'estimated'):statuses([retirement?.status,risk?.status].filter(s=>s!==undefined)),
      annualPensions:pensions,capitalCents:capital,annualContributionCents:pillar==='3'?intake.existingAnnualPillar3aContributionCents:null,
      capitalIsReferenceOnly:true,sourceRefs:[...new Set(sources)]};
  });
}
