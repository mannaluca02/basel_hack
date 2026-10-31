import { createHash } from 'node:crypto';
import type { AnalysisRequest, CaseSnapshot, Scenario } from '@pax/contracts';
import { DOMAIN_MODEL_VERSION } from '@pax/domain';

export function canonicalJson(value:unknown):string {
  if (value===null || typeof value==='string' || typeof value==='boolean') return JSON.stringify(value);
  if (typeof value==='number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '['+value.map(canonicalJson).join(',')+']';
  if (typeof value==='object' && value!==null)
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJson((value as Record<string,unknown>)[k])).join(',')+'}';
  throw new TypeError('Only finite JSON data can be hashed');
}
export const sha256Json=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
export function calculationInputHash(snapshot:CaseSnapshot,scenario:Scenario,scenarioVersionId:string,areas:AnalysisRequest['requestedAreas']):string {
  // A technical case revision can change without changing financial inputs.
  const {caseRevision,...financialSnapshot}=snapshot;
  return sha256Json({modelVersion:DOMAIN_MODEL_VERSION,snapshot:financialSnapshot,scenario,scenarioVersionId,areas:[...new Set(areas)].sort()});
}
