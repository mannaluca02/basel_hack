import { DraftSchema,type InsuranceDraft,type ProposalChangeInput } from '@pax/contracts';
import { WorkflowError } from './types.js';
import { sha256Json } from '../calculation/hash.js';

// Explicit business fields only: metadata, identities, review attestation and arbitrary paths are never writable.
const paths=[
  /^financial\.persons\.\d+\.(birthYear|employmentRateBps|incomeBasis)$/,
  /^financial\.persons\.\d+\.income\.(value|period)$/,
  /^financial\.(expenses|assets|provisions)\.\d+\.amount\.(value|period)$/,
  /^financial\.expenses\.\d+\.category$/,
  /^financial\.assets\.\d+\.(liquidity|availableFrom|pillar)$/,
  /^financial\.provisions\.\d+\.(personId|pillar|event)$/,
  /^financial\.safetyBuffer\.(value|period)$/,
  /^financial\.(valuationDate|assetsConfirmed)$/,
  /^insurance\.(relationship|relationshipSinceYear|sharedChildren|taxLocationId|debtsConfirmed|existingPrivateRiskBenefitsConfirmed|confession1|confession2|taxableFortuneCents|retirementNeedAnnualCents|annualReturnBps|retirementHorizonAge|annualSavingCents|investmentKnowledgeConfirmed|existingAnnualRetirementSavingCents|existingAnnualPillar3aContributionCents|riskAppetite|riskCapitalStrategy)$/,
  /^insurance\.persons\.\d+\.(providerSex|grossAnnualIncomeCents|withPillar2|retirementPensionAnnualCents|currentPillar2CapitalCents|desiredWorkStopAge|disabilityNeedAnnualCents|deathNeedAnnualCents|protectionTermMonths|existingDeathCapitalCents|deathOneOffCostsCents|debtPayoffCents|debtTreatment|deathNeedExcludesRepaidDebtService|personalAffordableAnnualPremiumCents)$/,
  /^insurance\.persons\.\d+\.pillar2Risk\.(disabilityAnnualCents|disabilityChildAnnualCents|survivorAnnualCents|orphanAnnualCents)$/,
  /^insurance\.children\.\d+\.(birthYear|kind|supportUntilMonth|goalId)$/,
  /^insurance\.debts\.\d+\.(balanceCents|annualServiceCents|kind)$/,
  /^goals\.\d+\.(kind|targetMonth|priority|targetCapitalCents)$/,
];
const additions:Record<string,string>={goals_add:'goals','financial.persons_add':'financial.persons','financial.expenses_add':'financial.expenses',
  'financial.assets_add':'financial.assets','financial.provisions_add':'financial.provisions','insurance.persons_add':'insurance.persons',
  'insurance.children_add':'insurance.children','insurance.debts_add':'insurance.debts'};
export const permitted=(path:string)=>paths.some(p=>p.test(path))||Object.hasOwn(additions,path)||path==='financial'||path==='insurance';
export function at(root:unknown,path:string):unknown {
  let value=root;for(const key of path.split('.')){if(!value||typeof value!=='object'||!Object.hasOwn(value,key))return undefined;value=(value as Record<string,unknown>)[key];}return value;
}
export function personFor(draft:InsuranceDraft,path:string):string|undefined {
  const m=path.match(/^(financial|insurance)\.persons\.(\d+)\./);if(!m)return undefined;
  return m[1]==='financial'?draft.financial?.persons[Number(m[2])]?.id:draft.insurance?.persons[Number(m[2])]?.personId;
}
function amounts(d:InsuranceDraft){const f=d.financial;return f?[...f.persons.map(p=>p.income),...f.expenses.map(e=>e.amount),f.safetyBuffer,...f.assets.map(a=>a.amount),...f.provisions.map(p=>p.amount)]:[];}
export function applyChanges(draft:InsuranceDraft,changes:ProposalChangeInput[],caseId:string,sourceRef:string,strictPerson=true):InsuranceDraft {
  const copy=structuredClone(draft);
  for(const change of changes){
    if(!permitted(change.path))throw new WorkflowError('PATCH_PATH_FORBIDDEN',422,[change.path]);
    const personId=personFor(draft,change.path);
    if((strictPerson&&personId&&change.personId!==personId)||(change.personId&&change.personId!==personId))throw new WorkflowError('PERSON_REFERENCE_MISMATCH',422,[change.path]);
    if(change.path==='financial'||change.path==='insurance'){
      if(copy[change.path]!==null)throw new WorkflowError('INITIALIZATION_ONLY',422,[change.path]);
      (copy as unknown as Record<string,unknown>)[change.path]=structuredClone(change.value);continue;
    }
    const append=additions[change.path];
    if(append){const array=at(copy,append);if(!Array.isArray(array))throw new WorkflowError('PATCH_TARGET_MISSING',422,[change.path]);array.push(structuredClone(change.value));continue;}
    const keys=change.path.split('.'),key=keys.pop()!,node=at(copy,keys.join('.'));
    if(!node||typeof node!=='object'||!Object.hasOwn(node,key))throw new WorkflowError('PATCH_TARGET_MISSING',422,[change.path]);
    (node as Record<string,unknown>)[key]=structuredClone(change.value);
  }
  if(copy.financial){if(copy.financial.dataClassification!=='synthetic')throw new WorkflowError('REAL_CUSTOMER_PROCESSING_NOT_RELEASED',422);copy.financial.caseId=caseId;}
  const parsed=DraftSchema.parse(copy);
  const visit=(value:unknown,path:string)=>{
    if(!value||typeof value!=='object')return;
    if('confirmation'in value&&'currency'in value&&'sourceRef'in value){
      const field=value as ReturnType<typeof amounts>[number],previous=at(draft,path);
      if(previous===undefined||sha256Json(previous)!==sha256Json(field)){field.confirmation='proposed';field.origin='user';field.review='unreviewed';field.sourceRef=sourceRef;}
      return;
    }
    for(const [key,child] of Object.entries(value))visit(child,path?`${path}.${key}`:key);
  };
  visit(parsed,'');
  return parsed;
}
export function writablePaths(draft:InsuranceDraft){
  const found:string[]=[];
  const visit=(value:unknown,path:string)=>{
    if(value===null||typeof value!=='object'){if(permitted(path))found.push(path);return;}
    for(const [key,child] of Object.entries(value))visit(child,path?`${path}.${key}`:key);
  };
  visit(draft,'');for(const [path,target] of Object.entries(additions))if(Array.isArray(at(draft,target)))found.push(path);
  return found;
}
