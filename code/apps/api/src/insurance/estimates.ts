import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Cents } from '@pax/contracts';
import { LifeInsuranceEngine } from './engine.js';
import { WorkflowError,type Actor } from './types.js';
import { sha256Json } from '../calculation/hash.js';
import type { ProviderJob } from './provider-mapper.js';
import type { NormalizedProviderResult } from '../logismata/normalize.js';

export const EstimateRequestSchema=z.object({expectedCaseRevision:z.number().int().positive(),
  noticeVersion:z.literal('lifemap-synthetic-v2'),allowSyntheticCalculatorTransfer:z.literal(true),
  operations:z.array(z.enum(['income','budgetProposal','incomeFortuneTax','saving3a','capitalTax','purchaseP2'])).min(1).max(6),
  saving3a:z.object({years:z.number().int().min(1).max(100),initialCents:Cents,annualCents:Cents}).strict().optional(),
  capitalTax:z.object({paymentCents:Cents,paymentAge:z.number().int().min(18).max(100)}).strict().optional(),
  purchaseP2:z.object({investmentCents:Cents,years:z.number().int().min(1).max(50),conversionBps:z.number().int().min(0).max(2000)}).strict().optional(),
}).strict();

export class DraftEstimateService {
  constructor(readonly engine:LifeInsuranceEngine){}
  async calculate(actor:Actor,id:string,input:unknown,signal?:AbortSignal) {
    return this.engine.runDigital(actor,id,linked=>this.calculateDigital(actor,id,input,linked),signal);
  }
  private async calculateDigital(actor:Actor,id:string,input:unknown,signal:AbortSignal) {
    if(actor.role!=='customer')throw new WorkflowError('FORBIDDEN',403);
    const body=EstimateRequestSchema.parse(input),c=this.engine.caseFor(actor,id);
    if(c.caseRevision!==body.expectedCaseRevision)throw new WorkflowError('VERSION_CONFLICT');
    const d=c.draft,i=d.insurance,f=d.financial;
    if(!f||!i)throw new WorkflowError('NEEDS_INPUT',422,['financial','insurance']);
    const relationships={unknown:0,single:1,married:2,cohabiting:3,registered_partnership:4};
    const Relationship=relationships[i.relationship];
    const missing=[];
    if(!Relationship)missing.push('insurance.relationship');
    if(i.sharedChildren===null)missing.push('insurance.sharedChildren');
    if(i.persons.length!==f.persons.length||i.persons.some(p=>p.grossAnnualIncomeCents===null))missing.push('insurance.persons.grossAnnualIncomeCents');
    if(missing.length)throw new WorkflowError('NEEDS_INPUT',422,missing);
    const jobs:ProviderJob[]=[];const blocked:{operation:string;fields:string[]}[]=[];
    const first=i.persons[0]!,person=f.persons.find(p=>p.id===first.personId)!;
    const Income=i.persons.reduce((sum,p)=>sum+p.grossAnnualIncomeCents!/100,0);
    const common={Relationship,NumberOfChildren:i.sharedChildren!,BirthYear:person.birthYear};
    const taxAvailable=i.taxLocationId!==null&&i.confession1!==null&&(i.persons.length<2||i.confession2!==null);
    const tax={...common,TaxLocationID:i.taxLocationId!,IncomeType:1,Income,Confession1:i.confession1!,...(i.confession2===null?{}:{Confession2:i.confession2})};
    for(const operation of new Set(body.operations)) {
      if(operation==='budgetProposal')jobs.push({operation,request:{BudgetMonthly:false,IncomeType:1,Income,Relationship,NumberOfChildren:i.sharedChildren!,UseEffectiveTax:false,Language:{de:1,fr:2,it:3,en:4}[c.locale]}});
      else if(operation==='income') {
        if(i.taxLocationId===null){blocked.push({operation,fields:['insurance.taxLocationId']});continue;}
        for(const p of i.persons)jobs.push({operation,personId:p.personId,request:{...common,BirthYear:f.persons.find(x=>x.id===p.personId)!.birthYear,
          TaxLocationID:i.taxLocationId,Income:p.grossAnnualIncomeCents!/100,IncomeType:1,CalculateIncomeType:3}});
      } else {
        if(!taxAvailable){blocked.push({operation,fields:['insurance.taxLocationId','insurance.confession1','insurance.confession2_if_partner']});continue;}
        if(operation==='incomeFortuneTax') {
          if(i.taxableFortuneCents===null){blocked.push({operation,fields:['insurance.taxableFortuneCents']});continue;}
          jobs.push({operation,request:{...tax,Fortune:i.taxableFortuneCents/100}});
        } else if(operation==='saving3a') {
          if(!body.saving3a||first.providerSex===null||i.annualReturnBps===null){blocked.push({operation,fields:['saving3a','insurance.providerSex','insurance.annualReturnBps']});continue;}
          jobs.push({operation,request:{...tax,Sex:first.providerSex,Duration:body.saving3a.years,
            InitialInvestment:body.saving3a.initialCents/100,YearlyInvestment:body.saving3a.annualCents/100,InterestRate:i.annualReturnBps/100}});
        } else if(operation==='capitalTax') {
          if(!body.capitalTax||first.providerSex===null){blocked.push({operation,fields:['capitalTax','insurance.providerSex']});continue;}
          const {IncomeType,Income,...base}=tax;
          jobs.push({operation,request:{...base,Sex:first.providerSex,CapitalPayment:body.capitalTax.paymentCents/100,PaymentAge:body.capitalTax.paymentAge}});
        } else if(operation==='purchaseP2') {
          if(!body.purchaseP2||first.providerSex===null||i.annualReturnBps===null){blocked.push({operation,fields:['purchaseP2','insurance.providerSex','insurance.annualReturnBps']});continue;}
          jobs.push({operation,request:{...tax,Sex:first.providerSex,Investment:body.purchaseP2.investmentCents/100,PaymentDuration:body.purchaseP2.years,
            InterestRate:i.annualReturnBps/100,ConversionRate:body.purchaseP2.conversionBps/100}});
        }
      }
    }
    const results:NormalizedProviderResult[]=[];const errors:{operation:string;code:string}[]=[];
    for(const job of jobs){signal.throwIfAborted();try{
      const r=await this.engine.provider.execute(job.operation,job.request,signal);if(job.personId)r.metadata.personId=job.personId;results.push(r);
    }catch(e){errors.push({operation:job.operation,code:typeof e==='object'&&e!==null&&'code'in e&&/^[A-Z_]{2,80}$/.test(String(e.code))?String(e.code):'PROVIDER_ERROR'});}}
    signal.throwIfAborted();
    return this.engine.edit(actor,id,undefined,(current,db)=>{
      if(sha256Json(current.draft)!==sha256Json(d))throw new WorkflowError('STALE_CONTEXT');
      const estimate={id:randomUUID(),draftHash:sha256Json(d),at:new Date().toISOString(),results};current.estimates.push(estimate);current.estimates=current.estimates.slice(-10);
      this.engine.touch(current,'estimate_available');this.engine.audit(db,actor,current,'draft_estimate_calculated');
      return {...estimate,blocked,errors,confirmationRequired:true,profileMutated:false,
        incomeBasis:'Provider Net means after social deductions; account for income tax separately.',
        sourceRef:`estimate:${estimate.id}`};
    });
  }
}
