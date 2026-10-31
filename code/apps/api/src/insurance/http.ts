import { Body,Controller,Get,Post,Put,Delete,Patch,Param,Query,Req,Res,UseGuards,Inject,Injectable,Module,
  Catch,HttpException,Sse,type CanActivate,type ExecutionContext,type ArgumentsHost,type ExceptionFilter,type DynamicModule,type MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { z } from 'zod';
import { PRIVACY_NOTICE } from '@pax/contracts';
import { LIFE_RUNTIME,type LifeRuntime } from './runtime.js';
import { WorkflowError,type Actor } from './types.js';
import { Operations } from '../logismata/contracts.js';
import { PAX_PRODUCTS } from './products.js';
import { lifeOpenApi } from './openapi.js';

type Request={headers:Record<string,string|undefined>;ip?:string;method:string;actor:Actor};
type Response={setHeader:(key:string,value:string)=>void;status:(code:number)=>Response;json:(value:unknown)=>void;send:(value:unknown)=>void;type:(value:string)=>Response};
const allowedOrigins=new Set(['http://localhost:4200','http://127.0.0.1:4200','http://localhost:3000','http://127.0.0.1:3000']);
const tokenFrom=(req:Request)=>{
  const header=req.headers.authorization;
  if(header?.startsWith('Bearer '))return {token:header.slice(7),cookie:false};
  const match=req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('pax_session='));
  return {token:match?.slice('pax_session='.length)??'',cookie:true};
};
const uuid=(id:string)=>{if(!z.uuid().safeParse(id).success)throw new WorkflowError('NOT_FOUND',404);return id;};
@Injectable()
export class LifeSessionGuard implements CanActivate {
  private writes=new Map<string,{start:number;count:number}>();
  constructor(@Inject(LIFE_RUNTIME) private readonly r:LifeRuntime){}
  canActivate(context:ExecutionContext) {
    const req=context.switchToHttp().getRequest<Request>();const {token,cookie}=tokenFrom(req);req.actor=this.r.sessions.authenticate(token);
    if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
      if(cookie){if(req.headers.origin&&!allowedOrigins.has(req.headers.origin))throw new WorkflowError('ORIGIN_FORBIDDEN',403);this.r.sessions.verifyCsrf(req.actor,req.headers['x-csrf-token']??'');}
      const t=Date.now(),old=this.writes.get(req.actor.sessionHash);const row=old&&t-old.start<60_000?old:{start:t,count:0};
      row.count++;if(row.count>200)throw new WorkflowError('REQUEST_RATE_LIMIT',429);this.writes.set(req.actor.sessionHash,row);
      if(this.writes.size>1000)for(const [key,row] of this.writes)if(t-row.start>60_000)this.writes.delete(key);
    }
    return true;
  }
}
@Catch()
export class SafeLifeErrorFilter implements ExceptionFilter {
  catch(error:unknown,host:ArgumentsHost) {
    const res=host.switchToHttp().getResponse<Response>();
    if(error instanceof WorkflowError){res.status(error.status).json({code:error.code,fields:error.fields});return;}
    if(error instanceof z.ZodError){res.status(400).json({code:'INVALID_INPUT',fields:error.issues.slice(0,20).map(i=>i.path.map(String).join('.'))});return;}
    const status=error instanceof HttpException?error.getStatus():500;
    res.status(status).json({code:status===413?'PAYLOAD_TOO_LARGE':status===404?'NOT_FOUND':status===400?'INVALID_INPUT':'INTERNAL_ERROR'});
  }
}

@Controller('api')
export class PublicLifeController {
  constructor(@Inject(LIFE_RUNTIME) private readonly r:LifeRuntime){}
  @Get('status') status(){return {service:'pax-life-insurance-backend',modelVersion:'0.2.0',providerMode:this.r.providerMode,
    dataMode:'synthetic-only',paxContractApiAvailable:false,realCoverageCanBeActivated:false,operations:Object.keys(Operations)};}
  @Get('privacy') privacy(){return PRIVACY_NOTICE;}
  @Get('openapi.json') openapi(){return lifeOpenApi();}
  @Post('sessions') async login(@Body() input:unknown,@Req() req:Request,@Res({passthrough:true}) res:Response){
    if(req.headers.origin&&!allowedOrigins.has(req.headers.origin))throw new WorkflowError('ORIGIN_FORBIDDEN',403);
    const body=z.object({accessCode:z.string().min(1).max(200)}).strict().parse(input);
    const result=await this.r.sessions.login(body.accessCode,req.ip??'local');
    res.setHeader('Set-Cookie',`pax_session=${result.sessionToken}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=3600`);return result;
  }
}
@Controller('api') @UseGuards(LifeSessionGuard)
export class ProtectedLifeController {
  constructor(@Inject(LIFE_RUNTIME) private readonly r:LifeRuntime){}
  @Delete('sessions/current') async logout(@Req() req:Request,@Res({passthrough:true}) res:Response){
    await this.r.sessions.revoke(req.actor);res.setHeader('Set-Cookie','pax_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0');return {revoked:true};
  }
  @Get('cases') list(@Req() req:Request){return this.r.engine.list(req.actor);}
  @Post('cases') create(@Req() req:Request,@Body() body:unknown){return this.r.engine.createCase(req.actor,body);}
  @Get('cases/:caseId') get(@Req() req:Request,@Param('caseId') id:string){return this.r.engine.caseFor(req.actor,uuid(id));}
  @Patch('cases/:caseId/draft') patch(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){return this.r.engine.patchDraft(req.actor,uuid(id),body);}
  @Post('cases/:caseId/confirmations') confirm(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){return this.r.engine.confirm(req.actor,uuid(id),body);}
  @Get('cases/:caseId/questions') questions(@Req() req:Request,@Param('caseId') id:string){return this.r.engine.questions(req.actor,uuid(id));}
  @Post('cases/:caseId/calculations') analyze(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){return this.r.engine.analyze(req.actor,uuid(id),body);}
  @Post('cases/:caseId/active-analysis') selectAnalysis(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){return this.r.engine.selectAnalysis(req.actor,uuid(id),body);}
  @Post('cases/:caseId/comparisons') compare(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){return this.r.comparisons.create(req.actor,uuid(id),body);}
  @Get('cases/:caseId/comparisons/:comparisonId') comparison(@Req() req:Request,@Param('caseId') id:string,@Param('comparisonId') comparisonId:string){return this.r.comparisons.get(req.actor,uuid(id),comparisonId);}
  @Post('cases/:caseId/locations') async locations(@Req() req:Request,@Param('caseId') id:string,@Body() input:unknown){
    if(req.actor.role!=='customer')throw new WorkflowError('FORBIDDEN',403);const c=this.r.engine.caseFor(req.actor,uuid(id));
    const body=z.object({search:z.string().regex(/^[A-Za-zÀ-ÿ0-9 -]{2,60}$/),allowSyntheticCalculatorTransfer:z.literal(true)}).strict().parse(input);
    const result=await this.r.engine.provider.execute('searchLocation',{Search:body.search,Language:{de:1,fr:2,it:3,en:4}[c.locale]});
    return {locations:result.metadata.locations,provenance:result.provenance};
  }
  @Post('cases/:caseId/calculator-estimates') estimate(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){return this.r.estimates.calculate(req.actor,uuid(id),body);}
  @Post('cases/:caseId/recommendations') recommend(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){z.object({}).strict().parse(body??{});return this.r.engine.recommendation(req.actor,uuid(id));}
  @Post('cases/:caseId/reviews') requestReview(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){z.object({}).strict().parse(body??{});return this.r.engine.requestReview(req.actor,uuid(id));}
  @Post('cases/:caseId/review-decisions') review(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){return this.r.engine.reviewDecision(req.actor,uuid(id),body);}
  @Post('cases/:caseId/demo-quotes') quote(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){return this.r.journey.quote(req.actor,uuid(id),body);}
  @Post('cases/:caseId/demo-applications') application(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){return this.r.journey.application(req.actor,uuid(id),body);}
  @Post('cases/:caseId/demo-applications/submit') submit(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){return this.r.journey.submit(req.actor,uuid(id),body);}
  @Post('cases/:caseId/demo-applications/start-review') startReview(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){return this.r.journey.startReview(req.actor,uuid(id),body);}
  @Post('cases/:caseId/demo-applications/decisions') decide(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){return this.r.journey.decide(req.actor,uuid(id),body);}
  @Post('cases/:caseId/demo-policies') policy(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){return this.r.journey.issuePolicy(req.actor,uuid(id),body);}
  @Get('cases/:caseId/portal') portal(@Req() req:Request,@Param('caseId') id:string){return this.r.journey.portal(req.actor,uuid(id));}
  @Get('cases/:caseId/summaries') summaries(@Req() req:Request,@Param('caseId') id:string){return this.r.dossier.bundle(req.actor,uuid(id));}
  @Get('cases/:caseId/dossier') dossier(@Req() req:Request,@Param('caseId') id:string,@Query('audience') audience='customer',@Query('format') format='json',@Res({passthrough:true}) res:Response){
    const a=z.enum(['customer','advisor']).parse(audience);const f=z.enum(['json','html']).parse(format);
    if(f==='html'){res.type('text/html; charset=utf-8');return this.r.dossier.html(req.actor,uuid(id),a);}
    return this.r.dossier.bundle(req.actor,uuid(id))[a];
  }
  @Get('cases/:caseId/documents/:documentId') async document(@Req() req:Request,@Param('caseId') id:string,@Param('documentId') documentId:string,@Res() res:Response){
    this.r.engine.caseFor(req.actor,uuid(id));const document=await this.r.documents.read(documentId);
    res.type('application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${document.filename}"`);res.setHeader('X-Document-SHA256',document.sha256);res.send(document.bytes);
  }
  @Get('cases/:caseId/products') products(@Req() req:Request,@Param('caseId') id:string){
    this.r.engine.caseFor(req.actor,uuid(id));return {kind:'educational_catalog_not_personal_recommendations',products:PAX_PRODUCTS};
  }
  @Post('cases/:caseId/agent-access') agent(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){z.object({}).strict().parse(body??{});this.r.engine.caseFor(req.actor,uuid(id));return this.r.sessions.agentToken(req.actor,id);}
  @Get('cases/:caseId/advisor/context') context(@Req() req:Request,@Param('caseId') id:string){return this.r.engine.advisorContext(req.actor,uuid(id));}
  @Post('cases/:caseId/advisor/proposals') propose(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){return this.r.advisory.propose(req.actor,uuid(id),body);}
  @Post('cases/:caseId/advisor/proposals/:proposalId/accept') accept(@Req() req:Request,@Param('caseId') id:string,@Param('proposalId') proposalId:string,@Body() body:unknown){return this.r.advisory.accept(req.actor,uuid(id),proposalId,body);}
  @Post('cases/:caseId/graph-context') graph(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){return this.r.engine.selectGraph(req.actor,uuid(id),body);}
  @Patch('cases/:caseId/preferences') preferences(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){return this.r.engine.preferences(req.actor,uuid(id),body);}
  @Sse('cases/:caseId/advisor/events') events(@Req() req:Request,@Param('caseId') id:string):Observable<MessageEvent> {
    uuid(id);this.r.engine.caseFor(req.actor,id,true);
    return new Observable(subscriber=>{
      let version=-1;
      const poll=()=>{
        try{
          if(this.r.closed){subscriber.complete();return;}
          this.r.sessions.assertActive(req.actor);
          const state=this.r.store.view(db=>{const c=db.cases[id];if(!c)return null;return {version:c.contextRevision,last:c.events.at(-1),expiresAt:c.expiresAt};});
          if(!state||state.expiresAt<=new Date().toISOString()){subscriber.complete();return;}
          if(state.version<=version)return;version=state.version;
          const eventId=state.last?.id??`snapshot_${version}`;const reason=state.last?.reason??'snapshot';
          subscriber.next({type:'advisor.context.updated',id:eventId,data:{schemaVersion:'1.0',messageId:eventId,caseId:id,
            correlationId:eventId,eventId,contextRevision:version,reason,contextRef:`/api/cases/${id}/advisor/context`,
            interruptPolicy:['conversation_preference_changed','agent_proposal_available','estimate_available'].includes(reason)?'refresh_before_next_turn':'if_current_answer_invalid'}});
        }catch{subscriber.complete();}
      };
      const timer=setInterval(poll,250);poll();return ()=>clearInterval(timer);
    });
  }
  @Get('cases/:caseId/audit') audit(@Req() req:Request,@Param('caseId') id:string){this.r.engine.caseFor(req.actor,uuid(id));return this.r.store.view(db=>db.audit.filter(a=>a.caseId===id));}
  @Post('cases/:caseId/feedback') feedback(@Req() req:Request,@Param('caseId') id:string,@Body() body:unknown){return this.r.insights.feedback(req.actor,uuid(id),body);}
  @Get('insights') insights(@Req() req:Request){return this.r.insights.aggregate(req.actor);}
  @Delete('cases/:caseId') remove(@Req() req:Request,@Param('caseId') id:string){
    if(req.actor.role!=='customer')throw new WorkflowError('FORBIDDEN',403);
    return this.r.engine.edit(req.actor,uuid(id),undefined,(c,db)=>{
      delete db.cases[c.id];db.feedback=db.feedback.filter(f=>f.caseId!==c.id);
      for(const [key,s] of Object.entries(db.sessions))if(s.caseId===c.id)delete db.sessions[key];
      this.r.engine.audit(db,req.actor,c,'case_deleted');return {deleted:true};});
  }
}

@Module({})
export class LifeHttpModule {
  static register(runtime:LifeRuntime):DynamicModule {
    return {module:LifeHttpModule,controllers:[PublicLifeController,ProtectedLifeController],providers:[LifeSessionGuard,
      {provide:LIFE_RUNTIME,useValue:runtime},{provide:'STORAGE_LIFECYCLE',useValue:{onModuleDestroy:()=>runtime.close()}}]};
  }
}
