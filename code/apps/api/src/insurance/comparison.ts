import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { LifeInsuranceEngine } from './engine.js';
import { WorkflowError,type Actor,type ScenarioComparison } from './types.js';

export class ScenarioComparisonService {
  constructor(readonly engine:LifeInsuranceEngine){}
  async create(actor:Actor,id:string,input:unknown) {
    if(actor.role!=='customer')throw new WorkflowError('FORBIDDEN',403);
    const b=z.object({baselineRunId:z.string().uuid(),variantRunId:z.string().uuid(),expectedProfileVersion:z.number().int().positive()}).strict().parse(input);
    return this.engine.edit(actor,id,undefined,(c,db)=>{
      const baseline=c.runs.find(r=>r.id===b.baselineRunId),variant=c.runs.find(r=>r.id===b.variantRunId);
      if(c.draftDirty||!baseline||!variant||baseline.status!=='current'||variant.status!=='current'||
        baseline.profileVersion!==b.expectedProfileVersion||variant.profileVersion!==b.expectedProfileVersion||c.confirmedVersions.at(-1)?.version!==b.expectedProfileVersion)
        throw new WorkflowError('STALE_CONTEXT');
      if(baseline.local.valuationDate!==variant.local.valuationDate||baseline.local.priceBasis!==variant.local.priceBasis||baseline.modelVersion!==variant.modelVersion)
        throw new WorkflowError('INCOMPARABLE_PRICE_OR_DATE',422);
      const previous=c.comparisons.find(x=>x.baselineRunId===baseline.id&&x.variantRunId===variant.id);if(previous)return previous;
      if(c.comparisons.length>=50)throw new WorkflowError('COMPARISON_CAPACITY',429);
      const result:ScenarioComparison={id:randomUUID(),scope:'valuation_snapshot_local_metrics',valuationDate:baseline.local.valuationDate,futureTimelineCompared:false,profileVersion:b.expectedProfileVersion,baselineRunId:baseline.id,variantRunId:variant.id,
        baselineInputHash:baseline.inputHash,variantInputHash:variant.inputHash,
        metrics:baseline.local.metrics.flatMap(first=>{
          const second=variant.local.metrics.find(m=>m.id===first.id&&m.personId===first.personId);if(!second)return [];
          const comparable=first.period===second.period&&first.currency===second.currency&&first.unit===second.unit&&
            first.value!==null&&second.value!==null&&['valid','estimated'].includes(first.status)&&['valid','estimated'].includes(second.status);
          return [{id:first.id,...(first.personId?{personId:first.personId}:{}),currency:first.currency,unit:first.unit,period:first.period,
            baselineValue:first.value,variantValue:second.value,delta:comparable?second.value!-first.value!:null,
            status:comparable?'estimated':'requires_review'}];
        })};
      c.comparisons.push(result);this.engine.touch(c,'comparison_available');this.engine.audit(db,actor,c,'scenario_comparison_created');return result;
    });
  }
  get(actor:Actor,id:string,comparisonId:string) {
    const c=this.engine.caseFor(actor,id);const result=c.comparisons.find(r=>r.id===comparisonId);if(!result)throw new WorkflowError('NOT_FOUND',404);
    return {...result,stale:c.draftDirty||result.profileVersion!==c.confirmedVersions.at(-1)?.version};
  }
}
