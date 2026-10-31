import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AnalysisRequestSchema, AnalysisResultSchema, CaseSnapshotSchema, ScenarioSchema, GraphContextSchema,
  type AnalysisRequest, type AnalysisResult, type CaseSnapshot, type Scenario, type MoneyMetric, type Status } from '@pax/contracts';
import { calculateBudget, calculateCapital, summarizePillars, calculateProgress, simulateScenario, DOMAIN_MODEL_VERSION } from '@pax/domain';
import { calculationInputHash } from './hash.js';

export class CalculationConflict extends Error {
  constructor(public readonly code:'INPUT_HASH_MISMATCH'|'STALE_CONTEXT'|'METRIC_UNAVAILABLE') {super(code);}
}
export function createAnalysisRequest(snapshot:CaseSnapshot,scenario:Scenario={kind:'baseline'},scenarioVersionId='baseline_v1',
  requestedAreas:AnalysisRequest['requestedAreas']=['budget','capital','pillars']):AnalysisRequest {
  const c=CaseSnapshotSchema.parse(snapshot);const s=ScenarioSchema.parse(scenario);
  return AnalysisRequestSchema.parse({schemaVersion:'1.0',messageId:randomUUID(),caseId:c.caseId,correlationId:randomUUID(),
    profileVersion:c.profileVersion,scenarioVersionId,calculationInputHash:calculationInputHash(c,s,scenarioVersionId,requestedAreas),
    requestedAreas,executionMode:'local',snapshot:c,scenario:s});
}

@Injectable()
export class CalculationService {
  analyze(input:unknown):AnalysisResult {
    const r=AnalysisRequestSchema.parse(input);
    if (r.calculationInputHash!==calculationInputHash(r.snapshot,r.scenario,r.scenarioVersionId,r.requestedAreas))
      throw new CalculationConflict('INPUT_HASH_MISMATCH');
    const simulation=simulateScenario(r.snapshot,r.scenario);const c=simulation.snapshot;
    const budget=calculateBudget(c);const capital=calculateCapital(c);const pillars=summarizePillars(c);
    const blocked=simulation.issues.some(i=>['INCOME_SCALING_UNSUPPORTED','HOUSING_BUNDLE_UNSUPPORTED'].includes(i.code));
    const metrics:AnalysisResult['metrics']=[];const statuses:AnalysisResult['statusByArea']={};const issues=[...simulation.issues];
    const add=(id:string,value:MoneyMetric,status:Status,sourceRefs:string[],personId?:string)=> {
      metrics.push({id,...value,status,sourceRefs,...(personId?{personId}:{})});
    };
    if(r.requestedAreas.includes('budget')) {
      statuses.budget=blocked?'needs_input':budget.status;issues.push(...budget.issues);
      const refs=[...c.persons.map(p=>p.income.sourceRef),...c.expenses.map(e=>e.amount.sourceRef),c.safetyBuffer.sourceRef];
      for(const key of ['incomeAnnual','expensesAnnual','cashflowAnnual','safetyBufferAnnual','affordableContributionAnnual','deficitAnnual'] as const)
        add(key,blocked?{...budget[key],value:null}:budget[key],statuses.budget,refs);
      for(const id of budget.excludedExpenseIds) issues.push({code:'TAX_ALREADY_INCLUDED',path:`expenses.${id}`,message:'Tax already included in net-after-tax income; not deducted twice.'});
    }
    if(r.requestedAreas.includes('capital')) {
      statuses.capital=capital.status;issues.push(...capital.issues);
      const refs=c.assets.map(a=>a.amount.sourceRef);add('freeCapital',capital.freeCapital,capital.status,refs);
      for(const [id,predicate] of [
        ['totalCapital',()=>true],['pillar3Capital',(a:CaseSnapshot['assets'][number])=>a.pillar==='3'],
        ['restrictedCapital',(a:CaseSnapshot['assets'][number])=>a.liquidity==='restricted']
      ] as const) {
        const assets=c.assets.filter(predicate);
        const known=assets.every(a=>a.amount.value!==null&&a.amount.confirmation==='confirmed'&&a.amount.review!=='rejected')&&c.assetsConfirmed;
        add(id,{value:known?assets.reduce((s,a)=>s+a.amount.value!,0):null,currency:'CHF',unit:'cent',period:'once'},capital.status,assets.map(a=>a.amount.sourceRef));
      }
    }
    if(r.requestedAreas.includes('pillars')) {
      statuses.pillars=r.scenario.kind==='family'?'requires_review':pillars.status;issues.push(...pillars.issues);
      for(const pillar of pillars.pillars) for(const group of pillar.groups)
        add(`pillar_${pillar.pillar}_${group.event}_${group.personId}`,group.amountAnnual,
          r.scenario.kind==='family'?'requires_review':group.status,group.sourceRefs,group.personId);
    }
    if(simulation.home) for(const [name,value] of Object.entries(simulation.home)) {
      if(value.period==='once'?r.requestedAreas.includes('capital'):r.requestedAreas.includes('budget'))
        add(`home_${name}`,value,'estimated',['scenario:home-cost-assumptions']);
    }
    const start=r.snapshot.valuationDate.slice(0,7);const end=new Date(`${start}-01T00:00:00Z`);end.setUTCMonth(end.getUTCMonth()+11);
    return AnalysisResultSchema.parse({schemaVersion:'1.0',messageId:randomUUID(),caseId:r.caseId,correlationId:r.correlationId,
      profileVersion:r.profileVersion,scenarioVersionId:r.scenarioVersionId,runId:randomUUID(),calculationInputHash:r.calculationInputHash,
      modelVersion:DOMAIN_MODEL_VERSION,createdAt:new Date().toISOString(),dataClassification:c.dataClassification,
      valuationDate:c.valuationDate,priceBasis:c.priceBasis,periodStart:start,periodEnd:end.toISOString().slice(0,7),
      statusByArea:statuses,metrics,issues,progress:calculateProgress(c),
      capitalBreakdown:r.requestedAreas.includes('capital')?capital.assets.map(a=>({assetId:a.id,totalCents:a.totalCents,
        allocatedCents:a.allocatedCents,freeCents:a.freeCents,excludedReason:a.excludedReason,
        allocations:c.assets.find(x=>x.id===a.id)!.allocations})):[],
      assumptions:['Flows are annualized snapshot values, not a time-varying pension forecast.',
        'Integer CHF cents; month-to-year multiplication, display rounding only.',...simulation.assumptions]});
  }

  graphFacts(contextInput:unknown,resultInput:unknown,currentInput:unknown) {
    const context=GraphContextSchema.parse(contextInput);const result=AnalysisResultSchema.parse(resultInput);
    const current=AnalysisRequestSchema.parse(currentInput);
    if(context.caseId!==result.caseId || context.runId!==result.runId || context.profileVersion!==result.profileVersion ||
      context.scenarioVersionId!==result.scenarioVersionId || current.caseId!==result.caseId ||
      current.profileVersion!==result.profileVersion || current.scenarioVersionId!==result.scenarioVersionId ||
      result.calculationInputHash!==calculationInputHash(current.snapshot,current.scenario,current.scenarioVersionId,current.requestedAreas) ||
      context.periodStart<result.periodStart || context.periodEnd>result.periodEnd)
      throw new CalculationConflict('STALE_CONTEXT');
    const metric=result.metrics.find(m=>m.id===context.metricId && m.personId===context.personId);
    if(!metric || metric.value===null) throw new CalculationConflict('METRIC_UNAVAILABLE');
    const expectedGraph=metric.id.startsWith('pillar_')?'pillar_overview':metric.period==='once'?'capital_overview':'household_budget';
    if(context.graphId!==expectedGraph) throw new CalculationConflict('METRIC_UNAVAILABLE');
    return {context,metric,issues:result.issues,assumptions:result.assumptions,modelVersion:result.modelVersion};
  }
}
