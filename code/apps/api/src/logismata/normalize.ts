import type { MoneyMetric,Status,Issue } from '@pax/contracts';
import { money } from '@pax/contracts';
import { ProviderEnvelope,RiskResponse,RetirementResponse,LimitsResponse,AgeResponse,BaseResponse,type Operation } from './contracts.js';

export type ProviderMetric=MoneyMetric & {id:string;status:Status;scenario?:number};
export type NormalizedProviderResult={operation:Operation;status:Status;metrics:ProviderMetric[];issues:Issue[];metadata:Record<string,unknown>;
  provenance:{mode:'replay'|'live';operationId:string;inputHash:string;capturedAt:string;sourceRef:string}};
export type Normalization=Omit<NormalizedProviderResult,'provenance'>;
const cents=(n:number)=> {const v=Math.round(n*100);if(!Number.isSafeInteger(v))throw new RangeError('Provider money overflow');return v;};
const record=(x:unknown)=>x as Record<string,unknown>;

export function normalizeResponse(operation:Operation,request:unknown,envelope:unknown):Normalization {
  const raw=ProviderEnvelope.parse(envelope).response;const req=record(request);
  const metrics:ProviderMetric[]=[];const issues:Issue[]=[];const metadata:Record<string,unknown>={};
  const add=(id:string,value:number|null,period:MoneyMetric['period'],status:Status,scenario?:number)=>
    metrics.push({id,...money(value===null?null:cents(value),period),status,...(scenario?{scenario}:{})});
  const problem=(code:string,path:string,message:string)=>issues.push({code,path,message});
  let status:Status='valid';
  if(operation==='saving3aLimits') {
    const data=LimitsResponse.parse(raw);
    add('max3aWithP2',data.Max3aSaving,'year','valid');add('max3aWithoutP2',data.Max3aSavingWithoutP2,'year','valid');
    metadata.eligibilityNotEstablished=true;
  } else if(operation==='ageLimits') {
    const data=AgeResponse.parse(raw);
    if(data.BirthYear!==req.BirthYear || data.MinimumAHVAge>data.MaximumAHVAge) throw new Error('Invalid age metadata');
    metadata.ageLimits={BirthYear:data.BirthYear,RegularPensionAge:data.RegularPensionAge,
      MinimumAHVAge:data.MinimumAHVAge,MaximumAHVAge:data.MaximumAHVAge};
  } else if(operation==='risk') {
    const data=RiskResponse.parse(raw);const statuses:Status[]=[];
    for(const row of data.RiskScenarioSummaries) {
      if(!req[row.Scenario<=4?'Person1':'Person2']) throw new Error('Unexpected risk person');
      const person=record(req[row.Scenario<=4?'Person1':'Person2']??{});
      const disability=(row.Scenario-1)%4<2;
      const needKey=disability?'NeedDisability':'NeedDeath';const percentKey=disability?'NeedInPcDisability':'NeedInPcDeath';
      const need=person[needKey];const percent=person[percentKey];
      const known=typeof need==='number' && (percent!==true||typeof person.GrossIncome==='number');
      let rowStatus:Status=row.ErrorCode===1?'valid':'requires_review';
      if(row.ErrorCode!==1) problem('RISK_PROVIDER_CODE_REVIEW',`risk.${row.Scenario}`,`Provider result code ${row.ErrorCode} requires domain review.`);
      if(!known) {
        if(rowStatus==='valid') rowStatus='needs_input';
        problem('RISK_NEED_UNKNOWN',`risk.${row.Scenario}.${needKey}`,'Missing need is not zero need; gap and surplus are withheld.');
      } else {
        const requested=percent===true ? (person.GrossIncome as number)*(need as number)/100 : need as number;
        if(Math.abs(row.IncomeNeed-requested)>1) {rowStatus='requires_review';problem('PROVIDER_NEED_MISMATCH',`risk.${row.Scenario}`,'Returned need differs from requested need.');}
        if(Math.abs(row.IncomeGap-Math.max(0,row.IncomeNeed-row.IncomeTotal))>1 ||
          Math.abs(row.IncomeSurplus-Math.max(0,row.IncomeTotal-row.IncomeNeed))>1) {
          rowStatus='requires_review';problem('PROVIDER_GAP_MISMATCH',`risk.${row.Scenario}`,'Returned gap/surplus is inconsistent.');
        }
      }
      statuses.push(rowStatus);
      add(`risk_${row.Scenario}_need`,known?row.IncomeNeed:null,'year',rowStatus,row.Scenario);
      add(`risk_${row.Scenario}_gap`,known?row.IncomeGap:null,'year',rowStatus,row.Scenario);
      add(`risk_${row.Scenario}_surplus`,known?row.IncomeSurplus:null,'year',rowStatus,row.Scenario);
      // IncomeTotal already includes the partner; never add IncomePartner again.
      add(`risk_${row.Scenario}_incomeTotal`,row.IncomeTotal,'year',rowStatus,row.Scenario);
      add(`risk_${row.Scenario}_pillar1`,row.IncomePillar1,'year',rowStatus,row.Scenario);
      add(`risk_${row.Scenario}_pillar2`,row.IncomePillar2,'year',rowStatus,row.Scenario);
    }
    const expected=req.Person2?8:4;
    if(data.RiskScenarioSummaries.length!==expected) {
      statuses.push('requires_review');problem('RISK_SCENARIOS_MISSING','risk','Not all requested person/event combinations were returned.');
    }
    status=statuses.includes('requires_review')?'requires_review':statuses.includes('needs_input')?'needs_input':'valid';
    metadata.scenarioCodes='1-4 Person1, 5-8 Person2: disability illness/accident, death illness/accident';
  } else if(operation==='retirement') {
    const data=RetirementResponse.parse(raw);const people=[req.Person1,req.Person2].filter(Boolean).map(record);
    const known=typeof req.NeedRetirement==='number' &&
      (req.NeedInPcRetirement!==true||people.every(p=>typeof p.GrossIncome==='number'));
    status=data.ErrorCode===1?'valid':'requires_review';
    if(data.ErrorCode!==1) problem('RETIREMENT_PROVIDER_CODE_REVIEW','retirement',`Provider result code ${data.ErrorCode} requires review.`);
    if(!known) {status=status==='valid'?'needs_input':status;problem('RETIREMENT_NEED_UNKNOWN','NeedRetirement','Missing retirement need is not zero.');}
    if(known && req.NeedInPcRetirement===true && people.length>1) {
      status='requires_review';problem('HOUSEHOLD_NEED_MAPPING_OPEN','NeedRetirement','Two-person percentage-need semantics need domain confirmation.');
    } else if(known) {
      const requested=req.NeedInPcRetirement===true ? Number(people[0]?.GrossIncome)*Number(req.NeedRetirement)/100:Number(req.NeedRetirement);
      if(Math.abs(data.IncomeNeed-requested)>1) {status='requires_review';problem('PROVIDER_NEED_MISMATCH','NeedRetirement','Returned retirement need differs from requested need.');}
    }
    if(known && (Math.abs(data.IncomeGap-Math.max(0,data.IncomeNeed-data.IncomeTotal))>1 ||
      Math.abs(data.IncomeTotal-data.IncomePillar1-data.IncomePillar2-data.IncomeWithdrawal)>1)) {
      status='requires_review';problem('RETIREMENT_TOTAL_MISMATCH','retirement','Income components or gap require review.');
    }
    for(const key of ['IncomeNeed','IncomeGap','IncomeTotal','IncomePillar1','IncomePillar2','IncomeWithdrawal'] as const)
      add(key,!known&&['IncomeNeed','IncomeGap'].includes(key)?null:data[key],'year',status);
    for(const key of ['AvailableFortune','CapitalNeed','CapitalGap'] as const)
      add(key,!known&&key!=='AvailableFortune'?null:data[key],'once',status);
    metadata.returnAndCapitalAssumptionsUnverified=true;
  } else {
    const data=BaseResponse.parse(raw);status='estimated';
    for(const [person,values] of Object.entries(data)) for(const [key,value] of Object.entries(values??{}))
      add(`${person}_${key}`,value,['CurrentCapital','CoverageCapital'].includes(key)?'once':'year','estimated');
    metadata.baselineEstimateNotPensionCertificate=true;
  }
  return {operation,status,metrics,issues,metadata};
}
