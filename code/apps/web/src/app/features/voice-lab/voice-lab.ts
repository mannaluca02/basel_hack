import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, afterRenderEffect, computed, effect, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { HumanHandoverView, InsuranceCaseDto } from '@pax/contracts';
import { CustomerApi, type CustomerSession } from '../../core/advisor/api/customer-api';
import { CustomerReview } from '../../core/advisor/api/customer-review';
import { CaseStore } from '../../core/advisor/store/case-store';
import { AppLanguage } from '../../core/i18n/language';
import { LocaleFormat } from '../../core/i18n/locale-format';
import { ReviewPanel } from '../review/review-panel';
import { LabTrace } from '../../core/voice/lab-trace';
import { VoiceLabApi } from '../../core/voice/voice-lab-api';
import { connectAvatarAudio, type PaxAvatar } from '../../core/voice/voice-avatar';
import { INTAKE_FIELDS, type IntakeFieldId, type IntakeRow, type IntakeStatus } from '../../core/voice/intake-plan';
import { INTAKE_TEXT } from '../../core/voice/intake-text';
import { LiveVoice } from '../../core/voice/live-voice';

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

/** Diagnostics around the app's live voice (`LiveVoice`): setup, prompt settings, payload trace.
 * The conversation keeps running when the lab closes; the app's own control stops it. */
@Component({
  selector:'app-voice-lab',
  imports:[FormsModule,TranslocoPipe,JsonPipe,ReviewPanel],
  changeDetection:ChangeDetectionStrategy.OnPush,
  templateUrl:'./voice-lab.html',styleUrl:'./voice-lab.scss',
})
export class VoiceLab {
  protected readonly customer=inject(CustomerApi);
  protected readonly review=inject(CustomerReview);
  protected readonly store=inject(CaseStore);
  protected readonly trace=inject(LabTrace);
  private readonly live=inject(LiveVoice);
  private readonly api=inject(VoiceLabApi);
  private readonly language=inject(AppLanguage);
  private readonly transloco=inject(TranslocoService);
  private readonly format=inject(LocaleFormat);
  private readonly host=viewChild<ElementRef<HTMLElement>>('avatarHost');
  private readonly turns=viewChild<ElementRef<HTMLElement>>('turns');
  private avatar:PaxAvatar|null=null;
  private destroyed=false;
  protected accessCode='voice-lab-demo-customer-only-2026';
  protected readonly apiMode=this.live.apiMode;
  protected readonly personId=this.live.personId;
  protected readonly consent=this.live.consent;
  protected readonly busy=this.live.busy;
  protected readonly state=this.live.state;
  protected readonly error=this.live.error;
  protected readonly providerAvailable=this.live.providerAvailable;
  protected readonly promptSkills=this.live.promptSkills;
  protected readonly selectedSkills=this.live.selectedSkills;
  protected readonly promptSettingsReady=this.live.promptSettingsReady;
  protected readonly timeBudget=this.live.timeBudget;
  protected readonly priority=this.live.priority;
  protected readonly notice=this.live.notice;
  protected readonly dialogue=this.live.dialogue;
  protected readonly extractionNotice=this.live.extractionNotice;
  protected readonly extractionConsent=this.live.extractionConsent;
  protected readonly evaluating=this.live.evaluating;
  protected readonly extractionFailed=this.live.extractionFailed;
  protected readonly latestExtraction=this.live.latestExtraction;
  protected readonly latestSource=this.live.latestSource;
  protected readonly rows=this.live.rows;
  protected readonly active=this.live.active;
  protected readonly caseReady=this.live.caseReady;
  protected readonly persons=this.live.persons;
  protected readonly validPerson=this.live.validPerson;
  protected readonly handoverActive=this.live.handoverActive;
  protected readonly intakeStatus=INTAKE_STATUS;
  protected readonly intakeLabel=(id:IntakeFieldId)=>INTAKE_TEXT[id].label;
  protected readonly captured=computed(()=>this.rows().filter(r=>r.status==='proposed'||r.status==='accepted').length);
  protected readonly intakeTotal=INTAKE_FIELDS.length;
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

  constructor() {
    this.trace.enabled.set(true);
    afterNextRender(()=>{void this.loadAvatar();});
    if(this.apiMode)void this.live.loadNotice();
    if(this.apiMode&&this.customer.session()){this.store.connect();this.store.refresh();}
    this.live.events.pipe(takeUntilDestroyed()).subscribe(event=>this.avatar?.handle(event));
    effect(()=>{const stream=this.live.audio();if(this.avatar)connectAvatarAudio(this.avatar,stream);});
    // Follow the conversation: the newest line stays visible inside the scrolling list.
    afterRenderEffect(()=>{this.dialogue();const el=this.turns()?.nativeElement;if(el)el.scrollTop=el.scrollHeight;});
    effect(()=>{
      const projection=this.store.projection();
      if(!projection)return;
      this.trace.add('local','canonical → presenter → CaseStore → view',projection);
      // Minimal synthetic conversation projection; no full case or extractor context transfer.
    });
    inject(DestroyRef).onDestroy(()=>{this.destroyed=true;this.avatar?.destroy();this.trace.enabled.set(false);this.trace.clear();});
  }

  /** Explicit setup gesture: authenticate if needed, then seed only a genuinely empty case. */
  protected async prepare(event?:Event):Promise<void> {
    event?.preventDefault();
    if(!this.apiMode||this.busy()||this.active()||this.handoverActive())return;
    await this.live.run(async()=>{
      if(!this.customer.session()){
        await this.review.signIn(this.accessCode);
        if(!this.customer.session()||this.review.error()){this.error.set('SIGN_IN_FAILED');return;}
      }
      const session=this.live.currentSession();
      const c=await this.live.readCurrentCase(session);
      if(c.handover?.stopDigitalConversation){this.store.refresh();return;}
      if(canInitialize(c))await this.live.forSession(session,()=>this.api.post('voice-lab/initialize',{expectedCaseRevision:c.caseRevision}));
      else if(!c.draft.insurance?.persons.length||!c.draft.financial?.persons.length)this.error.set('CASE_REQUIRES_REVIEW');
      this.store.connect();this.store.refresh();
      await this.live.loadNotice();
    });
  }
  protected async refreshSetup():Promise<void> {
    if(!this.apiMode||this.busy()||this.active())return;
    await this.live.run(async()=>{await this.live.readCurrentCase();this.store.refresh();await this.live.loadNotice();});
  }
  protected async startLive():Promise<void> {
    if(!this.ready()||this.liveBlocker()||this.active())return;
    this.avatar?.reset();
    await this.live.start();
  }
  protected stop():void {this.live.stop();}
  protected selectSkill(id:string,checked:boolean):void {
    this.selectedSkills.update(ids=>checked?[...new Set([...ids,id])]:ids.filter(value=>value!==id));
  }
  protected async handover():Promise<void> {
    if(!this.caseReady()||this.busy()||this.handoverActive())return;
    const session=this.live.currentSession();
    this.live.handoverControl.requestStop(session);
    this.stop();
    await this.live.run(async()=>{
      const c=await this.live.readCurrentCase(session),messageId=`handover_${crypto.randomUUID()}`;
      const response=await this.live.forSession(session,()=>this.api.post<HandoverCommandResponse>('handover',{action:'request',messageId,expectedCaseRevision:c.caseRevision,source:'ui'}));
      this.acceptHandoverCommand(session,response,messageId,'request');
      this.store.refresh();
    });
  }
  protected async resume():Promise<void> {
    if(!this.caseReady()||this.busy()||!this.handoverActive())return;
    const session=this.live.currentSession();
    await this.live.run(async()=>{
      const c=await this.live.readCurrentCase(session),messageId=`resume_${crypto.randomUUID()}`;
      const response=await this.live.forSession(session,()=>this.api.post<HandoverCommandResponse>('handover',{action:'resume',messageId,expectedCaseRevision:c.caseRevision,source:'ui'}));
      this.acceptHandoverCommand(session,response,messageId,'resume');this.store.refresh();
    });
  }
  /** Readable value: CHF, percent, yes/no; never raw cents. */
  protected show(row:IntakeRow):string {
    const v=row.value;
    if(row.status==='unclear')return row.quote??'';
    if(typeof v==='boolean')return this.transloco.translate(v?'lab.intake.yes':'lab.intake.no');
    if(typeof v!=='number'){const key=INTAKE_VALUE[`${row.fieldId}:${String(v)}`];return key?this.transloco.translate(key):v==null?'':String(v);}
    return row.fieldId==='employment_rate_percent'?this.format.percent(v/10000):['annual_gross_income_chf','pillar_3a_annual_contribution_chf','monthly_housing_cost_chf'].includes(row.fieldId)?this.format.chf(v/100):String(v);
  }
  private acceptHandoverCommand(session:CustomerSession,response:HandoverCommandResponse,messageId:string,action:'request'|'resume'):void {
    if(response?.caseId!==session.caseId||response.command?.messageId!==messageId||response.command.action!==action||!response.handover){
      throw new Error('INVALID_HANDOVER_RESPONSE');
    }
    this.live.handoverControl.observe(session,response,true);
  }
  private async loadAvatar():Promise<void> {
    const url='/voice-avatar/pax-avatar.js';
    try {
      const module=await import(/* @vite-ignore */ url) as {createPaxAvatar(host:HTMLElement):PaxAvatar};
      const host=this.host()?.nativeElement;
      if(!this.destroyed&&host){this.avatar=module.createPaxAvatar(host);connectAvatarAudio(this.avatar,this.live.audio());}
    } catch {this.trace.add('local','avatar',{code:'AVATAR_LOAD_FAILED'});}
  }
}

/** Existing intake, review work and profile/history are never replaced by demo preparation. */
function canInitialize(c:InsuranceCaseDto):boolean {
  return !c.draft.financial&&!c.draft.insurance&&!c.draft.goals.length&&!c.draft.reviewFlags.length&&
    ![c.proposalBatches,c.confirmedVersions,c.proposals,c.ambiguities,c.runs,c.reviewTasks,
      c.recommendations,c.quotes,c.applications,c.policies,c.estimates,c.comparisons,c.toolRuns]
      .some(items=>items?.length);
}
