import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {DEFAULT_HUMAN_HANDOVER} from '@pax/contracts';
import {z} from 'zod';
import {type Database,WorkflowError} from './types.js';

const AAD=Buffer.from('pax-lifemap-synthetic-store-v1');
const Envelope=z.object({version:z.literal(1),iv:z.string(),tag:z.string(),ciphertext:z.string()}).strict();
const Root=z.object({version:z.literal(1),sessions:z.record(z.string(),z.unknown()),cases:z.record(z.string(),z.unknown()),audit:z.array(z.unknown()),feedback:z.array(z.unknown())}).strict();

/** Shared envelope; preserve the Node file store's v1 format and migration defaults. */
export function decodeDatabase(envelope:string,key:Buffer):Database {
  if(Buffer.byteLength(envelope)>32_000_000)throw new Error('Store too large');
  const e=Envelope.parse(JSON.parse(envelope)),decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'base64'));
  decipher.setAAD(AAD);decipher.setAuthTag(Buffer.from(e.tag,'base64'));
  const decoded=Buffer.concat([decipher.update(Buffer.from(e.ciphertext,'base64')),decipher.final()]);
  const state=Root.parse(JSON.parse(decoded.toString('utf8'))) as Database;
  for(const c of Object.values(state.cases)){c.proposalBatches??=[];c.ambiguities??=[];c.voiceSessions??=[];c.agentTurns??=[];c.suitabilityChecks??=[];c.confirmationRequests??=[];c.modelExtractionConsent??=null;c.handover??=structuredClone(DEFAULT_HUMAN_HANDOVER);}
  return state;
}
export function encodeDatabase(state:Database,key:Buffer):string {
  const plain=Buffer.from(JSON.stringify(state));
  if(plain.length>20_000_000)throw new WorkflowError('STORE_CAPACITY',413);
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(AAD);
  const data=Buffer.concat([cipher.update(plain),cipher.final()]);
  return JSON.stringify({version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:data.toString('base64')});
}
