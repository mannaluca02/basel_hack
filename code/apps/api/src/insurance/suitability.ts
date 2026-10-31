import { randomUUID } from 'node:crypto';
import {
  QUALIFIED_PRODUCT_IDS,SUITABILITY_FORM_VERSION,SuitabilityCheckInputSchema,SuitabilityCheckSchema,SuitabilityViewSchema,
  type InvestmentStrategy,type SuitabilityAnswers,type SuitabilityCheck,
} from '@pax/contracts';
import type { LifeInsuranceEngine } from './engine.js';
import { WorkflowError,type Actor,type InsuranceCase } from './types.js';

/** Points per answer, as printed in sections B and C of the Pax form. */
const POINTS={
  goal:{low_risk:0,moderate_risk:15,high_risk:30},
  horizon:{under_10_years:0,'10_to_15_years':15,over_15_years:30},
  experience:{none:0,knowledge_only:10,experience:20,extensive:30},
  lossReaction:{sell_all:0,sell_part:10,hold:20,buy_more:30},
} as const;
/** Upper end of the bands in A3 (yearly) and A4 (once), in cents; the top band has no limit. */
const SAVING_LIMIT={under_1k:99_999,'1k_3k':300_000,'3k_7k':700_000,over_7k:Infinity} as const;
const INVESTMENT_LIMIT={under_10k:999_999,'10k_50k':5_000_000,'50k_150k':15_000_000,'150k_300k':30_000_000,over_300k:Infinity} as const;

/** Strategy bands of the form: conservative up to 44, balanced 45–84, dynamic from 85 points. */
export function strategyFor(points:number):InvestmentStrategy {
  return points<45?'conservative':points<85?'balanced':'dynamic';
}

/**
 * Section D: total × (100 % − guarantee) + 120 × guarantee. Financial affordability holds if the
 * chosen premium and/or single investment stay within A3/A4; the profile fits if the chosen
 * strategy is the one of the points. The form offers no horizon under ten years, so a shorter one
 * is advised against.
 */
export function evaluateSuitability(answers:SuitabilityAnswers) {
  const points={goal:POINTS.goal[answers.investmentGoal],horizon:POINTS.horizon[answers.horizon],
    experience:POINTS.experience[answers.securitiesExperience],lossReaction:POINTS.lossReaction[answers.lossReaction]};
  const total=points.goal+points.horizon+points.experience+points.lossReaction;
  const guarantee=answers.guaranteedPercent/100;
  const afterGuarantee=Math.round((total*(1-guarantee)+120*guarantee)*100)/100;
  const profileStrategy=strategyFor(afterGuarantee);
  const affordable=(answers.annualPremiumCents===null||answers.annualPremiumCents<=SAVING_LIMIT[answers.annualSavingCapacity])&&
    (answers.singleInvestmentCents===null||answers.singleInvestmentCents<=INVESTMENT_LIMIT[answers.singleInvestmentCapacity]);
  const strategyMatches=answers.selectedStrategy===profileStrategy;
  const reasons=[...(affordable?[]:['NOT_AFFORDABLE' as const]),...(strategyMatches?[]:['STRATEGY_DOES_NOT_MATCH_PROFILE' as const]),
    ...(answers.horizon==='under_10_years'?['HORIZON_TOO_SHORT' as const]:[])];
  return {points:{...points,total,afterGuarantee},profileStrategy,affordable,strategyMatches,
    result:reasons.length?'advised_against' as const:'suitable' as const,reasons};
}

export class SuitabilityService {
  constructor(private readonly engine:LifeInsuranceEngine){}

  view(actor:Actor,id:string) {
    if(actor.role==='advisor')throw new WorkflowError('FORBIDDEN',403);
    const c=this.engine.caseFor(actor,id);
    return SuitabilityViewSchema.parse({caseId:id,formVersion:SUITABILITY_FORM_VERSION,binding:false,
      qualifiedProductIds:[...QUALIFIED_PRODUCT_IDS],checks:c.suitabilityChecks??[]});
  }

  /** The customer's own answers for one qualified product and person of the confirmed profile. */
  async check(actor:Actor,id:string,input:unknown) {
    this.engine.sessions.assertActive(actor);
    if(actor.role!=='customer')throw new WorkflowError('FORBIDDEN',403);
    const body=SuitabilityCheckInputSchema.parse(input);
    return this.engine.edit(actor,id,body.expectedCaseRevision,(c,db)=>{
      const profile=c.confirmedVersions.at(-1);
      if(!profile||c.draftDirty)throw new WorkflowError('STALE_CONTEXT');
      if(!profile.draft.financial?.persons.some(p=>p.id===body.personId))throw new WorkflowError('PERSON_REFERENCE_MISMATCH',422);
      c.suitabilityChecks??=[];
      if(c.suitabilityChecks.length>=20)throw new WorkflowError('SUITABILITY_CAPACITY',429);
      const check:SuitabilityCheck=SuitabilityCheckSchema.parse({id:randomUUID(),createdAt:new Date().toISOString(),
        formVersion:SUITABILITY_FORM_VERSION,binding:false,productId:body.productId,personId:body.personId,profileVersion:profile.version,
        answers:body.answers,...evaluateSuitability(body.answers),humanConfirmationRequired:true});
      c.suitabilityChecks.push(check);
      this.engine.touch(c,'suitability_checked');this.engine.audit(db,actor,c,'suitability_checked',check.result);
      return check;
    });
  }
}

/** Throws unless every selected qualified product has a current, suitable pre-check. */
export function assertSuitable(c:InsuranceCase,profileVersion:number,selected:{productId:string;personId:string|null}[],defaultPersonId:string) {
  for(const p of selected) {
    if(!(QUALIFIED_PRODUCT_IDS as readonly string[]).includes(p.productId))continue;
    const personId=p.personId??defaultPersonId;
    const check=[...(c.suitabilityChecks??[])].reverse().find(x=>x.productId===p.productId&&x.personId===personId&&x.profileVersion===profileVersion);
    if(!check)throw new WorkflowError('SUITABILITY_CHECK_REQUIRED',422,[p.productId]);
    if(check.result!=='suitable')throw new WorkflowError('SUITABILITY_ADVISED_AGAINST',422,check.reasons);
  }
}
