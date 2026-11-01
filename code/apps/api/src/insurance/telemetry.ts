import { LifeInsuranceEngine } from './engine.js';
import { WorkflowError,type Actor,type InsuranceCase } from './types.js';

const stage=(c:InsuranceCase)=>c.policies.length?'demo_policy':c.applications.some(a=>a.submittedAt)?'application_submitted':
  c.recommendations.length?'recommendation':c.runs.length?'analysis':c.confirmedVersions.length?'profile_confirmed':'intake';
export class PrototypeInsights {
  constructor(readonly engine:LifeInsuranceEngine){}
  aggregate(actor:Actor) {
    this.engine.sessions.assertActive(actor);if(actor.role!=='reviewer')throw new WorkflowError('FORBIDDEN',403);
    return this.engine.store.view(db=>{
      const cases=Object.values(db.cases),stageCounts:Record<string,number>={},potentialDropoffs:Record<string,number>={},blockingReasons:Record<string,number>={};
      for(const c of cases) {
        const current=stage(c);stageCounts[current]=(stageCounts[current]??0)+1;
        if(!c.policies.length&&Date.parse(c.updatedAt)<Date.now()-10*60_000)potentialDropoffs[current]=(potentialDropoffs[current]??0)+1;
        const run=c.runs.find(r=>r.id===c.activeRunId);
        for(const reason of new Set(run?.reviewReasons??[]))blockingReasons[reason]=(blockingReasons[reason]??0)+1;
      }
      const scores=db.feedback.map(f=>f.score),promoters=scores.filter(s=>s>=9).length,detractors=scores.filter(s=>s<=6).length;
      return {dataMode:'synthetic_cases',caseCount:cases.length,currentStageCounts:stageCounts,
        potentialDropoffs,dropoffDefinition:'No policy and no case update for ten minutes; a signal, not confirmed abandonment.',blockingReasons,
        humanHandover:{requested:cases.filter(c=>c.handover.wantsHumanAdvisor).length,automaticDialing:false},
        nps:{responses:scores.length,score:scores.length?Math.round(100*(promoters-detractors)/scores.length):null},
        containsFinancialAmounts:false,containsFreeText:false};
    });
  }
}
