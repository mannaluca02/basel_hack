import { JsonPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, afterRenderEffect, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { HumanHandoverView, InsuranceCaseDto, VoiceSessionStartResponse } from '@pax/contracts';
import { CustomerApi, type CustomerSession } from '../../../src/app/core/advisor/api/customer-api';
import { CustomerReview } from '../../../src/app/core/advisor/api/customer-review';
import { CaseStore } from '../../../src/app/core/advisor/store/case-store';
import { APP_ENVIRONMENT } from '../../../src/app/core/config/app-environment';
import { AppLanguage } from '../../../src/app/core/i18n/language';
import { LocaleFormat } from '../../../src/app/core/i18n/locale-format';
import { ReviewPanel } from '../../../src/app/features/review/review-panel';
import { LabTrace } from './lab-trace';
import { PaxiCaseVoice } from './paxi-case-voice';
import { VoiceLabApi } from './voice-lab-api';
import { connectAvatarAudio, type PaxAvatar } from './voice-avatar';
import { HandoverControl } from './handover-control';
import { INTAKE_FIELDS, afterCustomerTurn, emptyIntakeMemory, intakeRows, nextIntakeField, steeringContext, type IntakeFieldId, type IntakeRow, type IntakeStatus, type TurnExtraction } from './intake-plan';

// Full literal keys: check:i18n cannot see computed ones.
const INTAKE_TEXT: Record<IntakeFieldId, { label: string; question: string }> = {
  annual_gross_income_chf: { label: 'lab.intake.field.annual_gross_income_chf', question: 'lab.intake.question.annual_gross_income_chf' },
  employment_rate_percent: { label: 'lab.intake.field.employment_rate_percent', question: 'lab.intake.question.employment_rate_percent' },
  civil_status: { label: 'lab.intake.field.civil_status', question: 'lab.intake.question.civil_status' },
  has_pension_fund: { label: 'lab.intake.field.has_pension_fund', question: 'lab.intake.question.has_pension_fund' },
  pillar_3a_annual_contribution_chf: { label: 'lab.intake.field.pillar_3a_annual_contribution_chf', question: 'lab.intake.question.pillar_3a_annual_contribution_chf' },
  monthly_housing_cost_chf: { label: 'lab.intake.field.monthly_housing_cost_chf', question: 'lab.intake.question.monthly_housing_cost_chf' },
  desired_retirement_age: { label: 'lab.intake.field.desired_retirement_age', question: 'lab.intake.question.desired_retirement_age' },
  risk_appetite: { label: 'lab.intake.field.risk_appetite', question: 'lab.intake.question.risk_appetite' },
};
// Literal keys again (check:i18n); unknown enum values fall back to the raw string.
const INTAKE_VALUE: Record<string, string> = {
  'civil_status:single': 'lab.intake.value.civil_status.single', 'civil_status:married': 'lab.intake.value.civil_status.married',
  'civil_status:cohabiting': 'lab.intake.value.civil_status.cohabiting', 'civil_status:registered_partnership': 'lab.intake.value.civil_status.registered_partnership',
  'risk_appetite:low': 'lab.intake.value.risk_appetite.low', 'risk_appetite:medium': 'lab.intake.value.risk_appetite.medium', 'risk_appetite:high': 'lab.intake.value.risk_appetite.high',
};
const INTAKE_STATUS: Record<IntakeStatus, string> = {
  open: 'lab.intake.status.open', asking: 'lab.intake.status.asking', unclear: 'lab.intake.status.unclear',
  proposed: 'lab.intake.status.proposed', accepted: 'lab.intake.status.accepted', skipped: 'lab.intake.status.skipped',
};
const CONTEXT_FACT: Record<IntakeFieldId, string> = {
  annual_gross_income_chf: 'lab.context.fact.income', employment_rate_percent: 'lab.context.fact.employment',
  civil_status: 'lab.context.fact.civilStatus', has_pension_fund: 'lab.context.fact.pensionFund',
  pillar_3a_annual_contribution_chf: 'lab.context.fact.pillar3a', monthly_housing_cost_chf: 'lab.context.fact.housing',
  desired_retirement_age: 'lab.context.fact.retirement', risk_appetite: 'lab.context.fact.risk',
};

type HandoverCommandResponse = HumanHandoverView & {
  command: { messageId: string; action: 'request' | 'resume' };
};

interface LabTurnResult {
  mode:'synthetic'|'live';
  source:{text:string};
  extraction:TurnExtraction&{adapter:string;route:string;result:{proposalBatch?:unknown;issues?:{code:string}[]}};
}
interface DialogueLine {id:number;speaker:'customer'|'agent';text:string;origin:'live';}

@Component({
  selector:'app-voice-lab',
  imports:[FormsModule,TranslocoPipe,JsonPipe,ReviewPanel],
  changeDetection:ChangeDetectionStrategy.OnPush,
  templateUrl:'./voice-lab.html',styleUrl:'./voice-lab.scss',
})
export class VoiceLab {
  protected readonly apiMode=inject(APP_ENVIRONMENT).dataSource==='api';
  protected readonly customer=inject(CustomerApi);
  protected readonly review=inject(CustomerReview);
  protected readonly store=inject(CaseStore);
  protected readonly trace=inject(LabTrace);
  private readonly api=inject(VoiceLabApi);
  private readonly language=inject(AppLanguage);
  private readonly transloco=inject(TranslocoService);
  private readonly format=inject(LocaleFormat);
  private readonly host=viewChild<ElementRef<HTMLElement>>('avatarHost');
  private readonly turns=viewChild<ElementRef<HTMLElement>>('turns');
  private avatar:PaxAvatar|null=null;
  private stream:MediaStream|null=null;
  private sessionId:string|null=null;
  private sequence=0;
  private epoch=0;
  private destroyed=false;
  private queue:Promise<void>=Promise.resolve();
  protected accessCode='voice-lab-demo-customer-only-2026';
  protected readonly personId=signal('');
  protected readonly consent=signal(false);
  protected readonly busy=signal(false);
  protected readonly state=signal('idle');
  protected readonly error=signal<string|null>(null);
  protected readonly providerAvailable=signal(false);
  protected readonly promptSkills=signal<readonly {id:string;name:string;description:string}[]>([]);
  protected readonly selectedSkills=signal<readonly string[]>([]);
  protected readonly promptSettingsReady=signal(false);
  protected readonly timeBudget=signal(10);
  protected readonly priority=signal<IntakeFieldId|''>('');
  protected readonly notice=signal('');
  protected readonly dialogue=signal<readonly DialogueLine[]>([]);
  protected readonly extractionNotice=signal<{enabled:boolean;version:string;noticeHash:string;text:string}|null>(null);
  protected readonly extractionConsent=signal(false);
  protected readonly intake=signal(emptyIntakeMemory);
  protected readonly evaluating=signal(false);
  protected readonly extractionFailed=signal(false);
  protected readonly intakeStatus=INTAKE_STATUS;
  protected readonly intakeLabel=(id:IntakeFieldId)=>INTAKE_TEXT[id].label;
  protected readonly rows=computed(()=>{const c=this.store.canonical();return c?intakeRows(c,this.personId(),this.intake()):[];});
  protected readonly captured=computed(()=>this.rows().filter(r=>r.status==='proposed'||r.status==='accepted').length);
  protected readonly intakeTotal=INTAKE_FIELDS.length;
  protected readonly latestExtraction=signal<LabTurnResult['extraction']|null>(null);
  protected readonly latestSource=signal('');
  /** Readable projection of backend-owned proposals, never a second extraction of the browser trace. */
  protected readonly conversationContext=computed(()=>{
    this.language.language();
    const rows=this.rows();
    const facts=(status:IntakeStatus)=>rows.filter(row=>row.status===status).map(row=>
      this.transloco.translate(CONTEXT_FACT[row.fieldId],{value:this.show(row)})).join(' ');
    const labels=(statuses:IntakeStatus[])=>rows.filter(row=>statuses.includes(row.status))
      .map(row=>this.transloco.translate(INTAKE_TEXT[row.fieldId].label)).join(', ');
    return {proposed:facts('proposed'),accepted:facts('accepted'),
      unclear:rows.filter(row=>row.quote!==undefined).map(row=>this.transloco.translate('lab.context.unclear',{
        field:this.transloco.translate(INTAKE_TEXT[row.fieldId].label),quote:row.quote??'',
      })).join(' '),open:labels(['open','asking']),skipped:labels(['skipped'])};
  });
  protected readonly extractionOutcome=computed(()=>{
    const extraction=this.latestExtraction();if(!extraction)return null;
    if(extraction.result.issues?.length)return 'lab.context.reviewNeeded';
    if(extraction.clarifications?.length)return 'lab.context.needsClarification';
    return extraction.result.proposalBatch?'lab.context.updated':'lab.context.noMatch';
  });
  protected readonly active=computed(()=>['connecting','connected'].includes(this.state()));
  protected readonly caseReady=computed(()=>this.apiMode&&!!this.customer.session()&&this.store.canonical()?.id===this.customer.session()?.caseId);
  protected readonly persons=computed(()=>{
    if(!this.caseReady())return [];
    const financial=this.store.canonical()?.draft.financial?.persons??[];
    return (this.store.projection()?.persons??[]).filter(person=>financial.some(p=>p.id===person.personId));
  });
  protected readonly validPerson=computed(()=>this.persons().some(person=>person.personId===this.personId()));
  private readonly handoverControl=new HandoverControl(this.customer.session,()=>{
    const c=this.store.canonical();return c?{caseId:c.id,handover:c.handover}:null;
  });
  protected readonly handoverActive=this.handoverControl.stopped;
  protected readonly setupState=computed(()=>{
    if(!this.apiMode)return 'api';
    if(!this.customer.session())return 'signedOut';
    if(!this.caseReady())return 'loading';
    if(this.persons().length)return 'ready';
    return canInitialize(this.store.canonical()!)?'empty':'incomplete';
  });
  protected readonly setupMessage=computed(()=>({
    api:'lab.apiRequired',signedOut:'lab.setup.signedOut',loading:'lab.setup.loading',
    empty:'lab.setup.empty',incomplete:'lab.setup.incomplete',ready:'lab.setup.ready',
  })[this.setupState()]);
  protected readonly ready=computed(()=>this.setupState()==='ready'&&this.validPerson()&&!this.handoverActive()&&!this.busy()&&!this.review.busy());
  protected readonly dialogueBlocker=computed(()=>{
    if(this.handoverActive())return 'lab.setup.handover';
    if(this.setupState()!=='ready')return this.setupMessage();
    if(!this.validPerson())return 'lab.setup.choosePerson';
    if(this.busy()||this.review.busy())return 'lab.setup.working';
    if(this.active())return 'lab.setup.running';
    return null;
  });
  // The live model is only reachable after its own consent; without it the app would silently fall back to rigid rules.
  protected readonly liveBlocker=computed(()=>this.dialogueBlocker()??(!this.extractionNotice()?.enabled?'lab.setup.extractionUnavailable':!this.promptSettingsReady()?'lab.settings.unavailable':!this.consent()?'lab.setup.consent':!this.extractionConsent()?'lab.intake.extractionBlocker':!this.providerAvailable()?'lab.setup.provider':null));
  protected readonly errorMessage=computed(()=>{
    switch(this.error()){
      case 'NotAllowedError': case 'PermissionDeniedError':return 'lab.error.microphoneDenied';
      case 'NotFoundError':return 'lab.error.microphoneMissing';
      case 'SESSION_EXPIRED':return 'lab.error.sessionExpired';
      case 'CASE_REQUIRES_REVIEW':return 'lab.setup.incomplete';
      default:return 'lab.error.recover';
    }
  });
  protected readonly traceRows=computed(()=>[...this.trace.entries()].reverse());

  private readonly voice=new PaxiCaseVoice({
    open:async sdp=>{
      const epoch=this.epoch;
      const c=await this.customer.loadCase(this.caseId());
      if(epoch!==this.epoch)throw new Error('ABORTED');
      const response=await this.api.post<VoiceSessionStartResponse>('voice/sessions',{
        messageId:`start_${crypto.randomUUID()}`,expectedCaseRevision:c.caseRevision,provider:'gpt-live',locale:c.locale,
        dataClassification:'synthetic',noticeVersion:'voice-synthetic-v1',allowExternalVoiceProcessing:true,sdp,
        conversationSettings:{skillIds:this.selectedSkills(),timeBudgetMinutes:this.timeBudget(),priorities:this.priority()?[this.priority()]:[]},
      });
      if(epoch===this.epoch)this.sessionId=response.voiceSession.id;return response;
    },
    opening:()=>{
      return 'Use the configured persona and assigned conversation skills. Start with a brief invitation to describe their life with work, family and housing, in the configured language. Do not read a form question. Follow their story and the selected priorities.';
    },
    close:sid=>{if(this.sessionId===sid)this.sessionId=null;return this.api.post(`voice/sessions/${sid}/close`,{reason:'customer_closed'});},
    onStatus:(state,detail)=>{this.state.set(state);if(detail)this.error.set(detail);},
    onAudio:stream=>{
      this.stream=stream;
      if(this.avatar)connectAvatarAudio(this.avatar,stream);
      this.trace.add('local','avatar output-energy visualization',{enabled:stream!==null,signal:'local heuristic',playbackEvidence:false});
    },
    onEvent:event=>this.avatar?.handle(event),
    onTrace:(direction,payload)=>this.trace.add(direction,'GPT-Live data channel',payload),
    onTurn:(speaker,text,segmentation)=>{
      const epoch=this.epoch,sid=this.sessionId,personId=this.personId();
      if(!sid)return;
      this.append(speaker,text,'live');
      this.queue=this.queue.then(async()=>{
        if(epoch!==this.epoch||this.destroyed)return;
        const c=await this.customer.loadCase(this.caseId());
        if(epoch!==this.epoch)return;
        const messageId=`turn_${crypto.randomUUID()}`;
        this.trace.add('local','transcript segmentation',{segmentation,speaker,messageId});
        await this.api.post(`voice/sessions/${sid}/turns`,{speaker,log:{schemaVersion:'1.0',messageId,caseId:c.id,
          correlationId:sid,turnId:messageId,source:'voice',locale:c.locale,text,transcriptStatus:'final',dataClassification:'synthetic'}});
        if(epoch!==this.epoch)return;
        if(speaker==='customer')await this.extractLive(sid,messageId,personId,epoch);
        this.store.refresh();
      }).catch(()=>{if(epoch===this.epoch){this.error.set('TURN_ROUTING_FAILED');this.stop();}});
    },
  });

  constructor() {
    this.trace.enabled.set(true);
    afterNextRender(()=>{void this.loadAvatar();});
    if(this.apiMode)void this.loadNotice();
    if(this.apiMode&&this.customer.session()){this.store.connect();this.store.refresh();}
    this.store.digitalStops.pipe(takeUntilDestroyed()).subscribe(command=>{
      if(command.reason==='session-ended'){
        this.handoverControl.synchronizeSession();this.stop();
      }else{
        const session=this.customer.session();
        if(session&&this.handoverControl.observe(session,command.update))this.stop();
      }
    });
    this.store.contextUpdates.pipe(takeUntilDestroyed()).subscribe(update=>{
      const session=this.customer.session();
      if(session)this.handoverControl.observe(session,update);
      this.trace.add('receive','SSE advisor.context.updated',update);
    });
    // Follow the conversation: the newest line stays visible inside the scrolling list.
    afterRenderEffect(()=>{this.dialogue();const el=this.turns()?.nativeElement;if(el)el.scrollTop=el.scrollHeight;});
    effect(()=>{
      const persons=this.persons();
      if(!persons.some(person=>person.personId===this.personId())){
        if(this.active())this.stop();
        this.personId.set(persons[0]?.personId??'');
      }
    });
    effect(()=>{
      // Clarifications and source quotes belong to the selected speaker, not to the whole case.
      this.personId();this.intake.set(emptyIntakeMemory);this.latestExtraction.set(null);this.latestSource.set('');this.extractionFailed.set(false);
    });
    effect(()=>{
      const projection=this.store.projection();
      if(!projection)return;
      this.trace.add('local','canonical → presenter → CaseStore → view',projection);
      // Minimal synthetic conversation projection; no full case or extractor context transfer.
    });
    // Fires on projection and on memory changes (rows depends on both); updateContext dedupes by value, so no feedback loop.
    effect(()=>{
      const rows=this.rows();
      if(this.state()==='connected'&&rows.length)this.voice.updateContext(this.steer(rows));
    });
    let previousSession=this.customer.session();
    effect(()=>{
      const session=this.customer.session();
      this.handoverControl.synchronizeSession();
      if(!session||session!==previousSession){
        this.stop();if(previousSession){this.consent.set(false);this.extractionConsent.set(false);}
        this.dialogue.set([]);this.latestExtraction.set(null);this.latestSource.set('');this.intake.set(emptyIntakeMemory);this.extractionFailed.set(false);
      }
      previousSession=session;
    });
    let locale=this.language.language();
    effect(()=>{const next=this.language.language();if(next!==locale){locale=next;this.stop();this.consent.set(false);this.extractionConsent.set(false);if(this.apiMode)void this.loadNotice();}});
    inject(DestroyRef).onDestroy(()=>{this.destroyed=true;this.stop();this.avatar?.destroy();this.trace.enabled.set(false);this.trace.clear();});
  }

  /** Explicit setup gesture: authenticate if needed, then seed only a genuinely empty case. */
  protected async prepare(event?:Event):Promise<void> {
    event?.preventDefault();
    if(!this.apiMode||this.busy()||this.active()||this.handoverActive())return;
    await this.act(async()=>{
      if(!this.customer.session()){
        await this.review.signIn(this.accessCode);
        if(!this.customer.session()||this.review.error()){this.error.set('SIGN_IN_FAILED');return;}
      }
      const session=this.currentSession();
      const c=await this.readCurrentCase(session);
      if(c.handover?.stopDigitalConversation){this.store.refresh();return;}
      if(canInitialize(c))await this.forSession(session,()=>this.api.post('voice-lab/initialize',{expectedCaseRevision:c.caseRevision}));
      else if(!c.draft.insurance?.persons.length||!c.draft.financial?.persons.length)this.error.set('CASE_REQUIRES_REVIEW');
      this.store.connect();this.store.refresh();
      await this.loadNotice();
    });
  }
  protected async refreshSetup():Promise<void> {
    if(!this.apiMode||this.busy()||this.active())return;
    await this.act(async()=>{await this.readCurrentCase();this.store.refresh();await this.loadNotice();});
  }
  protected async startLive():Promise<void> {
    if(!this.ready()||this.liveBlocker()||this.active())return;
    const epoch=++this.epoch,notice=this.extractionNotice();this.error.set(null);this.avatar?.reset();this.intake.set(emptyIntakeMemory);
    if(notice?.enabled){
      // The transfer consent settles before any media opens.
      let granted=false;const session=this.currentSession();
      await this.act(async()=>{
        const c=await this.readCurrentCase(session);
        await this.forSession(session,()=>this.api.post('extraction/consent',{expectedCaseRevision:c.caseRevision,noticeVersion:notice.version,noticeHash:notice.noticeHash,
          dataClassification:'synthetic',allowSyntheticModelExtraction:true}));
        granted=true;
      });
      if(!granted||epoch!==this.epoch)return;
    }
    await this.voice.start();
  }
  protected stop():void {++this.epoch;this.voice.stop();this.state.set('idle');}
  protected selectSkill(id:string,checked:boolean):void {
    this.selectedSkills.update(ids=>checked?[...new Set([...ids,id])]:ids.filter(value=>value!==id));
  }
  protected async handover():Promise<void> {
    if(!this.caseReady()||this.busy()||this.handoverActive())return;
    const session=this.currentSession();
    this.handoverControl.requestStop(session);
    this.stop();
    await this.act(async()=>{
      const c=await this.readCurrentCase(session),messageId=`handover_${crypto.randomUUID()}`;
      const response=await this.forSession(session,()=>this.api.post<HandoverCommandResponse>('handover',{action:'request',messageId,expectedCaseRevision:c.caseRevision,source:'ui'}));
      this.acceptHandoverCommand(session,response,messageId,'request');
      this.store.refresh();
    });
  }
  protected async resume():Promise<void> {
    if(!this.caseReady()||this.busy()||!this.handoverActive())return;
    const session=this.currentSession();
    await this.act(async()=>{
      const c=await this.readCurrentCase(session),messageId=`resume_${crypto.randomUUID()}`;
      const response=await this.forSession(session,()=>this.api.post<HandoverCommandResponse>('handover',{action:'resume',messageId,expectedCaseRevision:c.caseRevision,source:'ui'}));
      this.acceptHandoverCommand(session,response,messageId,'resume');this.store.refresh();
    });
  }
  /** Only a failed extraction is non-fatal; a vanished session still ends the conversation. */
  private async extractLive(sid:string,messageId:string,personId:string,epoch:number):Promise<void> {
    const asked=nextIntakeField(this.rows());
    this.evaluating.set(true);this.extractionFailed.set(false);
    const post=()=>this.api.post<LabTurnResult>('voice-lab/turns',{mode:'live',voiceSessionId:sid,messageId,personId});
    try {
      let result:LabTurnResult;
      try {result=await post();}
      catch(error) {
        // A customer accept racing this turn changes revision/draft: read fresh and retry once with the same id, without counting an attempt.
        if(!(error instanceof HttpErrorResponse&&['VERSION_CONFLICT','STALE_PROPOSAL','STALE_CONTEXT'].includes(error.error?.code)))throw error;
        this.store.refresh();await this.customer.loadCase(this.caseId());
        if(epoch!==this.epoch)return;
        result=await post();
      }
      if(epoch!==this.epoch)return;
      this.extracted(result);
      // A disabled/failing extractor and smalltalk are not answers to a question. In
      // particular, never advance the plan or mark fields skipped on infrastructure errors.
      if(result.extraction.result.issues?.length)this.extractionFailed.set(true);
      else if(result.extraction.clarifications?.length||result.extraction.request?.observations?.length)
        this.intake.update(memory=>afterCustomerTurn(memory,asked,result.extraction));
    } catch(error) {
      if(error instanceof HttpErrorResponse&&(error.status===401||error.status===410))throw error;
      if(epoch!==this.epoch)return;
      this.trace.add('local','voice-lab/turns',{code:'EXTRACTION_FAILED',conversationContinues:true});
      this.extractionFailed.set(true);
    } finally {this.evaluating.set(false);}
  }
  private question(id:IntakeFieldId):string {return this.transloco.translate(INTAKE_TEXT[id].question);}
  /** The short clarification names gross and year, so it only fits income; other fields repeat their own question. */
  private steer(rows:IntakeRow[]) {return steeringContext(rows,id=>this.question(id),nextIntakeField(rows)==='annual_gross_income_chf'?this.transloco.translate('lab.intake.clarify'):undefined);}
  /** Readable value: CHF, percent, yes/no; never raw cents. */
  protected show(row:IntakeRow):string {
    const v=row.value;
    if(row.status==='unclear')return row.quote??'';
    if(typeof v==='boolean')return this.transloco.translate(v?'lab.intake.yes':'lab.intake.no');
    if(typeof v!=='number'){const key=INTAKE_VALUE[`${row.fieldId}:${String(v)}`];return key?this.transloco.translate(key):v==null?'':String(v);}
    return row.fieldId==='employment_rate_percent'?this.format.percent(v/10000):['annual_gross_income_chf','pillar_3a_annual_contribution_chf','monthly_housing_cost_chf'].includes(row.fieldId)?this.format.chf(v/100):String(v);
  }
  private extracted(result:LabTurnResult):void {
    this.extractionFailed.set(false);
    this.latestExtraction.set(result.extraction);
    this.latestSource.set(result.source.text);
    this.trace.add('local',result.extraction.route,{adapter:result.extraction.adapter,request:result.extraction.request,result:result.extraction.result});
  }
  private append(speaker:DialogueLine['speaker'],text:string,origin:DialogueLine['origin']):void {
    this.dialogue.update(lines=>[...lines.slice(-39),{id:++this.sequence,speaker,text,origin}]);
  }
  private async act(work:()=>Promise<void>):Promise<void> {
    this.busy.set(true);this.error.set(null);
    try {await work();}catch(error) {
      if(error instanceof SupersededCaseOperation)return;
      if(error instanceof HttpErrorResponse&&(error.status===401||error.status===410||error.error?.code==='CSRF_INVALID')){
        this.customer.clearSession();this.store.clear();this.error.set('SESSION_EXPIRED');
      }else if(this.error()!=='SESSION_EXPIRED')this.error.set('API_REQUEST_FAILED');
      this.store.refresh();
    }finally {this.busy.set(false);}
  }
  private async readCurrentCase(session=this.currentSession()):Promise<InsuranceCaseDto> {
    try{
      const c=await this.forSession(session,()=>this.customer.loadCase(session.caseId));
      if(c.id!==session.caseId)throw new SupersededCaseOperation();
      this.handoverControl.observe(session,{caseId:c.id,handover:c.handover});
      return c;
    }
    catch(error){
      if(error instanceof HttpErrorResponse&&error.status===404){
        this.customer.clearSession();this.store.clear();this.error.set('SESSION_EXPIRED');
      }
      throw error;
    }
  }
  private currentSession():CustomerSession {
    const session=this.customer.session();if(!session)throw new Error('UNAUTHORIZED');return session;
  }
  private async forSession<T>(session:CustomerSession,work:()=>Promise<T>):Promise<T> {
    const assertCurrent=()=>{if(this.destroyed||this.customer.session()!==session)throw new SupersededCaseOperation();};
    assertCurrent();
    try{const value=await work();assertCurrent();return value;}
    catch(error){assertCurrent();throw error;}
  }
  private acceptHandoverCommand(session:CustomerSession,response:HandoverCommandResponse,messageId:string,action:'request'|'resume'):void {
    if(response?.caseId!==session.caseId||response.command?.messageId!==messageId||response.command.action!==action||!response.handover){
      throw new Error('INVALID_HANDOVER_RESPONSE');
    }
    this.handoverControl.observe(session,response,true);
  }
  private caseId():string {const id=this.customer.session()?.caseId;if(!id)throw new Error('UNAUTHORIZED');return id;}
  /** Live requires model extraction; an unavailable notice must block starting, not silently use rules. */
  private async loadExtractionNotice():Promise<void> {
    try {this.extractionNotice.set(await this.api.get(`extraction/privacy?locale=${this.language.language()}`));}
    catch {this.extractionNotice.set(null);}
  }
  private async loadNotice():Promise<void> {
    void this.loadExtractionNotice();
    void this.loadPromptSettings();
    try {
      const privacy=await this.api.get<{text:string;providers:{provider:string;available:boolean}[]}>(`voice/privacy?locale=${this.language.language()}`);
      this.notice.set(privacy.text);this.providerAvailable.set(privacy.providers.some(p=>p.provider==='gpt-live'&&p.available));
    } catch {this.providerAvailable.set(false);this.error.set('BACKEND_UNAVAILABLE');}
  }
  private async loadPromptSettings():Promise<void> {
    try {
      const settings=await this.api.get<{skills:{id:string;name:string;description:string}[];defaultTimeBudgetMinutes:number}>('voice/settings');
      this.promptSkills.set(settings.skills);
      if(!this.promptSettingsReady()){
        this.selectedSkills.set(settings.skills.map(skill=>skill.id));this.timeBudget.set(settings.defaultTimeBudgetMinutes);
      }else this.selectedSkills.update(ids=>ids.filter(id=>settings.skills.some(skill=>skill.id===id)));
      this.promptSettingsReady.set(true);
    } catch {this.promptSettingsReady.set(false);}
  }
  private async loadAvatar():Promise<void> {
    const url='/voice-avatar/pax-avatar.js';
    try {
      const module=await import(/* @vite-ignore */ url) as {createPaxAvatar(host:HTMLElement):PaxAvatar};
      const host=this.host()?.nativeElement;
      if(!this.destroyed&&host){this.avatar=module.createPaxAvatar(host);connectAvatarAudio(this.avatar,this.stream);}
    } catch {this.trace.add('local','avatar',{code:'AVATAR_LOAD_FAILED'});}
  }
}

class SupersededCaseOperation extends Error {}

/** Existing intake, review work and profile/history are never replaced by demo preparation. */
function canInitialize(c:InsuranceCaseDto):boolean {
  return !c.draft.financial&&!c.draft.insurance&&!c.draft.goals.length&&!c.draft.reviewFlags.length&&
    ![c.proposalBatches,c.confirmedVersions,c.proposals,c.ambiguities,c.runs,c.reviewTasks,
      c.recommendations,c.quotes,c.applications,c.policies,c.estimates,c.comparisons,c.toolRuns]
      .some(items=>items?.length);
}
