import type { GraphContext } from '@pax/contracts';
import type { LifeRun } from './types.js';
import { WorkflowError } from './types.js';

export function selectedGraphFacts(run:LifeRun,graph:GraphContext) {
  const local=run.local.metrics.find(m=>m.id===graph.metricId&&m.personId===graph.personId);
  if(local) {
    const expected=local.id.startsWith('pillar_')?'pillar_overview':local.period==='once'?'capital_overview':'household_budget';
    if(graph.graphId!==expected||local.value===null)throw new WorkflowError('METRIC_UNAVAILABLE',422);
    return {metric:local,series:[],sourceRefs:local.sourceRefs};
  }
  const risk=run.riskNeeds.find(r=>`risk_${r.scenario}_gap`===graph.metricId&&r.personId===graph.personId);
  if(risk&&graph.graphId==='risk_coverage') {
    if(risk.annualGapCents===null)throw new WorkflowError('METRIC_UNAVAILABLE',422);
    return {metric:{id:graph.metricId,value:risk.annualGapCents,unit:'cent',currency:'CHF',period:'year',status:risk.status,personId:risk.personId},series:[],sourceRefs:risk.sourceRefs};
  }
  if(graph.graphId==='retirement_timeline'&&run.timeline) {
    const selected=run.timeline.periods.filter(p=>p.month>=graph.periodStart&&p.month<=graph.periodEnd);
    if(!selected.length)throw new WorkflowError('METRIC_UNAVAILABLE',422);
    const series=selected.map(p=> {
      let value:number|null;
      if(graph.metricId==='retirement_income') {
        if(graph.personId) {
          const person=p.persons.find(x=>x.personId===graph.personId);if(!person)throw new WorkflowError('METRIC_UNAVAILABLE',422);
          const amounts=[person.employmentCents,person.pillar1Cents,person.pillar2Cents,person.pillar3Cents];
          value=amounts.some(v=>v===null)?null:amounts.reduce<number>((sum,v)=>sum+v!,0);
        }else value=p.incomeCents;
      } else {
        if(graph.personId)throw new WorkflowError('HOUSEHOLD_METRIC_NOT_PERSONAL',422);
        if(graph.metricId==='retirement_need')value=p.needCents;
        else if(graph.metricId==='retirement_withdrawal')value=p.withdrawalCents;
        else if(graph.metricId==='retirement_capital')value=p.capitalCents;
        else if(graph.metricId==='retirement_gap')value=p.unfundedCents;
        else throw new WorkflowError('METRIC_UNAVAILABLE',422);
      }
      return {month:p.month,value,unit:'cent',currency:'CHF',period:graph.metricId==='retirement_capital'?'once':'month',status:value===null?'needs_input':'estimated'};
    });
    // Preserve the monthly series; never sum capital balances or relabel a range as one month's income.
    return {metric:{id:graph.metricId,value:series.length===1?series[0]!.value:null,unit:'cent',currency:'CHF',
      period:series.length===1?series[0]!.period:'range',status:series.some(p=>p.value===null)?'needs_input':'estimated'},
      series,sourceRefs:['model:explicit-monthly-retirement-phases','model:finite-allocated-capital']};
  }
  throw new WorkflowError('METRIC_UNAVAILABLE',422);
}
