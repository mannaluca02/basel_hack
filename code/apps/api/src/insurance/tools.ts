import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Cents,ProviderResultSchema } from '@pax/contracts';
import { Operations,RequestSchemas } from '../logismata/contracts.js';
import { LifeInsuranceEngine } from './engine.js';
import { sha256Json } from '../calculation/hash.js';
import { WorkflowError,type Actor } from './types.js';
import { languageNumber } from './i18n.js';

export const AdditionalOperations=['taxBaseInfo','searchLocationGeo','estateGainFields','estateGainTax','inheritanceAll','inheritanceGroup','inheritanceBeneficiary','corporateEntityTax'] as const;
type AdditionalOperation=typeof AdditionalOperations[number];
export const AdditionalMoneyFields:Record<AdditionalOperation,string[]>={taxBaseInfo:[],searchLocationGeo:[],estateGainFields:[],
  estateGainTax:['TaxableGain','Revenues','FirstCosts','BuildingInvest'],inheritanceAll:['Amount'],inheritanceGroup:['Amount'],inheritanceBeneficiary:['Amount'],
  corporateEntityTax:['TaxableProfitConf','TaxableProfitCanton','TaxableCapital','ShareCapital','NetProfitParticipationConf','NetProfitParticipationCanton','InnovationsDeduction','NotionalInterestDeduction','TotalAssets','TotalBeneficiaryParticipation']};
const inputSchema=(op:AdditionalOperation)=>{
  const base=RequestSchemas[op];const fields:Record<string,z.ZodType>={};
  for(const name of AdditionalMoneyFields[op]){
    const original=base.shape[name as keyof typeof base.shape] as z.ZodType;
    const amount=name==='TaxableGain'?z.number().int().min(-1e12).max(1e12):Cents;
    fields[name]=original.isOptional()?amount.optional():amount;
  }
  const schema=base.extend(fields);return op==='searchLocationGeo'?schema.omit({Language:true}):schema;
};
const common={expectedCaseRevision:z.number().int().positive(),noticeVersion:z.literal('lifemap-synthetic-v1'),allowSyntheticCalculatorTransfer:z.literal(true),requestUnits:z.literal('CHF_CENTS')};
const option=<T extends AdditionalOperation>(operation:T)=>z.object({...common,operation:z.literal(operation),request:inputSchema(operation)}).strict();
export const AdditionalToolRequestSchema=z.discriminatedUnion('operation',[
  option('taxBaseInfo'),option('searchLocationGeo'),option('estateGainFields'),option('estateGainTax'),
  option('inheritanceAll'),option('inheritanceGroup'),option('inheritanceBeneficiary'),option('corporateEntityTax')]);
export class AdditionalCalculatorTools {
  constructor(readonly engine:LifeInsuranceEngine){}
  list(actor:Actor,id:string){this.engine.caseFor(actor,id);return AdditionalOperations.map(operation=>({operation,operationId:Operations[operation].id,
    requestUnits:'CHF_CENTS',moneyFields:AdditionalMoneyFields[operation],scope:'isolated_calculator_estimate',requiresSeparateDomainReview:!['taxBaseInfo','searchLocationGeo','estateGainFields'].includes(operation)}));}
  async execute(actor:Actor,id:string,input:unknown) {
    if(actor.role!=='customer')throw new WorkflowError('FORBIDDEN',403);
    const b=AdditionalToolRequestSchema.parse(input),operation=b.operation as AdditionalOperation,c=this.engine.caseFor(actor,id);
    if(c.caseRevision!==b.expectedCaseRevision)throw new WorkflowError('VERSION_CONFLICT');
    if((c.toolRuns?.length??0)>=40)throw new WorkflowError('TOOL_CAPACITY',429);
    const request:Record<string,unknown>={...b.request};
    for(const name of AdditionalMoneyFields[operation])if(typeof request[name]==='number')request[name]=Number(request[name])/100;
    if(operation==='searchLocationGeo')request.Language=languageNumber[c.locale];
    const validated=RequestSchemas[operation].parse(request);
    let result;
    try{result=ProviderResultSchema.parse(await this.engine.provider.execute(operation,validated));}
    catch{throw new WorkflowError('PROVIDER_UNAVAILABLE',503);}
    return this.engine.edit(actor,id,undefined,(current,db)=>{
      if((current.toolRuns?.length??0)>=40)throw new WorkflowError('TOOL_CAPACITY',429);
      const record={id:randomUUID(),createdAt:new Date().toISOString(),operation,requestUnits:'CHF_CENTS',request:b.request,
        result,scope:'isolated_calculator_estimate',profileMutated:false,financialInputHashChanged:false,
        inputHash:sha256Json({operation,request:b.request}),locale:c.locale};
      (current.toolRuns??=[]).push(record);this.engine.touch(current,'estimate_available');this.engine.audit(db,actor,current,'additional_calculator_executed');return record;
    });
  }
}
