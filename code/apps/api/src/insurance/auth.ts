import { createHash,randomBytes,randomUUID,timingSafeEqual } from 'node:crypto';
import { WorkflowError,type Actor } from './types.js';
import type { Database } from './types.js';
import { EncryptedCaseStore,type BootstrapCredentials } from './store.js';
import { SessionResponseSchema,AgentAccessResponseSchema } from '@pax/contracts';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const same=(a:string,b:string)=>timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)));
export class SessionService {
  private attempts=new Map<string,{count:number;until:number}>();
  constructor(private readonly store:EncryptedCaseStore,private readonly codes:BootstrapCredentials,private readonly now=()=>new Date()){
    if(codes.customerAccessCode.length<32||codes.reviewerAccessCode.length<32||same(codes.customerAccessCode,codes.reviewerAccessCode))
      throw new WorkflowError('ACCESS_CODE_ROLES_INVALID',500);
  }
  async login(accessCode:string,clientKey:string) {
    const now=this.now();const key=hash(clientKey);const prior=this.attempts.get(key);
    if(prior&&prior.until>now.getTime()&&prior.count>=8)throw new WorkflowError('LOGIN_RATE_LIMIT',429);
    const customer=same(accessCode,this.codes.customerAccessCode),reviewer=same(accessCode,this.codes.reviewerAccessCode);
    if(!customer&&!reviewer){
      if(this.attempts.size>1000)this.attempts.clear();
      this.attempts.set(key,{count:prior&&prior.until>now.getTime()?prior.count+1:1,until:now.getTime()+60_000});
      throw new WorkflowError('UNAUTHORIZED',401);
    }
    this.attempts.delete(key);const token=randomBytes(32).toString('base64url');const sessionHash=hash(token);
    const csrfToken=randomBytes(32).toString('base64url');
    const actor:Actor={id:randomUUID(),role:reviewer?'reviewer':'customer',sessionHash,csrfHash:hash(csrfToken),expiresAt:new Date(now.getTime()+3600_000).toISOString()};
    await this.store.transaction(db=>{
      for(const [key,s] of Object.entries(db.sessions))if(s.expiresAt<=now.toISOString())delete db.sessions[key];
      if(Object.keys(db.sessions).length>=200)throw new WorkflowError('SESSION_CAPACITY',429);
      db.sessions[sessionHash]=actor;
    });
    return SessionResponseSchema.parse({sessionToken:token,csrfToken,expiresAt:actor.expiresAt,role:actor.role,actorId:actor.id});
  }
  authenticate(token:string):Actor {
    if(!/^[A-Za-z0-9_-]{40,100}$/.test(token))throw new WorkflowError('UNAUTHORIZED',401);
    const actor=this.store.view(db=>db.sessions[hash(token)]);
    if(!actor||actor.expiresAt<=this.now().toISOString())throw new WorkflowError('UNAUTHORIZED',401);
    return actor;
  }
  verifyCsrf(actor:Actor,token:string){if(!actor.csrfHash||!same(hash(token),actor.csrfHash))throw new WorkflowError('CSRF_INVALID',403);}
  assertActive(actor:Actor,db?:Database){
    const stored=db?db.sessions[actor.sessionHash]:this.store.view(x=>x.sessions[actor.sessionHash]);
    if(!stored||stored.expiresAt<=this.now().toISOString())throw new WorkflowError('UNAUTHORIZED',401);
    if(stored.id!==actor.id||stored.role!==actor.role||stored.caseId!==actor.caseId)throw new WorkflowError('FORBIDDEN',403);
  }
  async revoke(actor:Actor){await this.store.transaction(db=>{
    this.assertActive(actor,db);delete db.sessions[actor.sessionHash];
    if(actor.role==='customer')for(const [key,s] of Object.entries(db.sessions))if(s.role==='advisor'&&s.id===actor.id)delete db.sessions[key];
  });}
  async agentToken(owner:Actor,caseId:string){
    this.assertActive(owner);
    if(owner.role!=='customer')throw new WorkflowError('FORBIDDEN',403);
    const token=randomBytes(32).toString('base64url');const actor:Actor={id:owner.id,role:'advisor',caseId,
      sessionHash:hash(token),expiresAt:new Date(Math.min(Date.parse(owner.expiresAt),this.now().getTime()+15*60_000)).toISOString()};
    await this.store.transaction(db=>{
      this.assertActive(owner,db);if(Object.keys(db.sessions).length>=200)throw new WorkflowError('SESSION_CAPACITY',429);
      const c=db.cases[caseId];if(!c||c.ownerId!==owner.id)throw new WorkflowError('NOT_FOUND',404);db.sessions[actor.sessionHash]=actor;
    });return AgentAccessResponseSchema.parse({sessionToken:token,role:actor.role,caseId,expiresAt:actor.expiresAt});
  }
}
