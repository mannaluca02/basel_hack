import { Body,Controller,Get,Inject,Injectable,Module,Param,Post,Req,UseGuards,type DynamicModule } from '@nestjs/common';
import { z } from 'zod';
import { ExtractorContextSchema,ProposalBatchInputSchema,VoiceLogSchema,type ProposalBatch } from '@pax/contracts';
import { sha256Json } from '../calculation/hash.js';
import { LIFE_RUNTIME,type LifeRuntime } from '../insurance/runtime.js';
import { LifeSessionGuard } from '../insurance/http.js';
import { WorkflowError,type Actor } from '../insurance/types.js';
import { PROCESSING_NOTICE,ResponsesIntakeAdapter,type IntakeTarget,type ResponsesTransport } from './responses.js';

const ConversationSchema=z.array(z.object({role:z.enum(['user','assistant']),text:z.string().min(1).max(8000)}).strict()).max(20);
const TurnSchema=z.object({demoTurnId:z.string(),processingNoticeVersion:z.string(),voiceLog:VoiceLogSchema,conversation:ConversationSchema}).strict();
export const DEMO_TURNS={
  'annual-gross':{speakerPersonId:'person_demo_1',text:'Mein Bruttojahreseinkommen beträgt 119’000 Franken.',conversation:[{role:'assistant',text:'Wie hoch ist dein Bruttojahreseinkommen?'}]},
  smalltalk:{speakerPersonId:'person_demo_1',text:'Guten Morgen!',conversation:[]},
  'assistant-example':{speakerPersonId:'person_demo_1',text:'Das war nur dein Beispiel.',conversation:[{role:'assistant',text:'Zum Beispiel: Mein Bruttojahreseinkommen beträgt 119’000 Franken.'}]},
} as const;
const demoFields:IntakeTarget[]=[
  {path:'insurance.persons.0.grossAnnualIncomeCents',personId:'person_demo_1',value:12000000,currency:'CHF',unit:'cent',period:'year',incomeBasis:'gross'},
];
const TRANSPORT=Symbol('ERNI_RESPONSES_TRANSPORT');
const unavailable:ResponsesTransport=async()=>{throw new WorkflowError('MODEL_TRANSPORT_NOT_CONFIGURED',503);};

@Injectable()
export class ErniDialogService {
  private readonly adapter:ResponsesIntakeAdapter;
  private readonly pending=new Map<string,Promise<{batch:ProposalBatch|null}>>();
  constructor(@Inject(LIFE_RUNTIME) private readonly r:LifeRuntime,@Inject(TRANSPORT) transport:ResponsesTransport){this.adapter=new ResponsesIntakeAdapter(transport);}
  async turn(actor:Actor,id:string,input:unknown){
    this.r.sessions.assertActive(actor);if(actor.role!=='advisor')throw new WorkflowError('FORBIDDEN',403);
    const body=TurnSchema.parse(input);
    const handoverRevision=this.r.extraction.context(actor,id).handover.revision;
    const run=()=>this.extractTurn(actor,id,body,handoverRevision),previous=this.pending.get(id);
    const job=previous?previous.then(run,run):run();
    this.pending.set(id,job);
    try{return await job;}finally{if(this.pending.get(id)===job)this.pending.delete(id);}
  }
  private async extractTurn(actor:Actor,id:string,body:z.infer<typeof TurnSchema>,handoverRevision:number){
    const voice=body.voiceLog;
    if(voice.caseId!==id||actor.caseId!==id)throw new WorkflowError('NOT_FOUND',404);
    const context=ExtractorContextSchema.parse(this.r.extraction.context(actor,id));
    if(context.handover.revision!==handoverRevision)throw new WorkflowError('DIGITAL_TASK_CANCELLED');
    if(context.handover.stopDigitalConversation)throw new WorkflowError('HUMAN_HANDOVER_ACTIVE');
    const demo=Object.hasOwn(DEMO_TURNS,body.demoTurnId)?DEMO_TURNS[body.demoTurnId as keyof typeof DEMO_TURNS]:null;
    if(!demo||voice.locale!=='de'||voice.text!==demo.text||JSON.stringify(body.conversation)!==JSON.stringify(demo.conversation))throw new WorkflowError('SYNTHETIC_ORIGIN_REQUIRED',422);
    if(body.processingNoticeVersion!==PROCESSING_NOTICE.version)throw new WorkflowError('PROCESSING_NOTICE_REQUIRED',422);
    const source={messageId:voice.messageId,turnId:voice.turnId,sourceRef:`synthetic:erni-demo:${body.demoTurnId}:${sha256Json(body)}`};
    const previous=context.proposalBatches.find(batch=>batch.messageId===voice.messageId);
    if(previous){
      if(previous.source.sourceRef!==source.sourceRef||previous.source.turnId!==voice.turnId)throw new WorkflowError('IDEMPOTENCY_CONFLICT');
      return {batch:previous};
    }
    if(voice.expectedCaseRevision!==undefined&&voice.expectedCaseRevision!==context.caseRevision)throw new WorkflowError('VERSION_CONFLICT');
    const fields=demoFields.filter(field=>field.personId===demo.speakerPersonId);
    // shortcut: only authored baseline inputs are allowed; extend provenance with the correction/clarification tickets.
    if(!fields.length||fields.some(field=>
      !context.personIds.includes(field.personId)||!context.writablePaths.includes(field.path)||
      !context.fields.some(current=>current.path===field.path&&current.personId===field.personId&&current.value===field.value)))throw new WorkflowError('SYNTHETIC_CONTEXT_REQUIRED',422);
    this.r.modelExtraction.assertTransferAllowed(actor,id);
    const task=this.r.engine.digitalTasks.begin(id);
    try{
      const result=await this.adapter.extract({conversation:[...body.conversation,{role:'user',text:voice.text}],speakerPersonId:demo.speakerPersonId,
        fields:structuredClone(fields),writablePaths:fields.map(field=>field.path),questions:[]},body.processingNoticeVersion,task.signal);
      this.r.modelExtraction.assertTransferAllowed(actor,id);
      const current=ExtractorContextSchema.parse(this.r.extraction.context(actor,id));
      if(task.signal.aborted||current.handover.revision!==context.handover.revision)throw new WorkflowError('DIGITAL_TASK_CANCELLED');
      if(current.caseRevision!==context.caseRevision)throw new WorkflowError('VERSION_CONFLICT');
      if(!result.changes.length&&!result.ambiguities.length){
        if(body.demoTurnId==='annual-gross')throw new WorkflowError('INVALID_MODEL_OUTPUT',502);
        return {batch:null};
      }
      if(body.demoTurnId!=='annual-gross')throw new WorkflowError('INVALID_MODEL_OUTPUT',502);
      const batchInput=ProposalBatchInputSchema.safeParse({messageId:voice.messageId,source,expectedCaseRevision:context.caseRevision,
        expectedProfileVersion:context.profileVersion,basisDraftHash:context.draftHash,changes:result.changes,
        ambiguities:result.ambiguities.map(item=>({...item,source}))});
      if(!batchInput.success)throw new WorkflowError('INVALID_MODEL_OUTPUT',502);
      return {batch:await this.r.extraction.proposeBatch(actor,id,batchInput.data)};
    }finally{task.finish();}
  }
}

@Controller('api') @UseGuards(LifeSessionGuard)
export class ErniDialogController {
  constructor(private readonly dialog:ErniDialogService){}
  @Get('erni-dialog/processing-notice') notice(){return PROCESSING_NOTICE;}
  @Post('cases/:caseId/erni-dialog/turns') turn(@Req() req:{actor:Actor},@Param('caseId') id:string,@Body() input:unknown){return this.dialog.turn(req.actor,id,input);}
}

@Module({controllers:[ErniDialogController],providers:[ErniDialogService,{provide:TRANSPORT,useValue:unavailable}],exports:[ErniDialogService]})
export class ErniDialogModule {
  static register(options:{transport:ResponsesTransport}):DynamicModule {
    return {module:ErniDialogModule,providers:[{provide:TRANSPORT,useValue:options.transport}]};
  }
}
