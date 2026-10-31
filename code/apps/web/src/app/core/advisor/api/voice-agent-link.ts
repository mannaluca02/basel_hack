import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { APP_ENVIRONMENT } from '../../config/app-environment';
import { AppLanguage } from '../../i18n/language';
import { AgentActivity } from '../ui-models';
import { CustomerApi, VoicePrivacyNotice } from './customer-api';

export type VoiceLinkState = 'idle' | 'notice' | 'linking' | 'opened' | 'failed';
export type VoiceControl = 'end' | 'mute' | 'unmute' | 'stop_speaking';

/** Renew the 15-minute agent grant this long before it runs out. */
const RENEW_BEFORE_MS = 2 * 60_000;
/** How often to check whether the customer closed the Paxi window. */
const WINDOW_CHECK_MS = 2000;

/**
 * Hands the case to the separate voice agent (Paxi): after the customer read the voice notice,
 * a case-scoped agent grant goes straight to the voice agent's server, which keeps it. The grant
 * is never stored or shown here. Paxi then proposes what it heard as packages on the review stand.
 *
 * While the Paxi window is open the link stays in sync: the grant is renewed before it expires,
 * Paxi reports its state and activity (`pax.status`), follows the app language, and a closed
 * window ends the link.
 */
@Injectable({ providedIn: 'root' })
export class VoiceAgentLink {
  private readonly http = inject(HttpClient);
  private readonly api = inject(CustomerApi);
  private readonly url = inject(APP_ENVIRONMENT).voiceAgentUrl ?? null;
  private readonly stateValue = signal<VoiceLinkState>('idle');
  private readonly noticeValue = signal<VoicePrivacyNotice | null>(null);
  private readonly activityValue = signal<AgentActivity>('idle');
  /** The Paxi window this tab opened; only it accepts our call controls. */
  private paxiWindow: Window | null = null;
  private linkId: string | null = null;
  private renewTimer: ReturnType<typeof setTimeout> | undefined;
  private windowTimer: ReturnType<typeof setInterval> | undefined;

  readonly available = this.url !== null;
  readonly state = this.stateValue.asReadonly();
  readonly notice = this.noticeValue.asReadonly();
  /** What Paxi is doing right now, for the avatar ring; `idle` while no call runs. */
  readonly activity = this.activityValue.asReadonly();

  constructor() {
    const language = inject(AppLanguage);
    effect(() => {
      const current = language.language();
      untracked(() => {
        if (this.stateValue() === 'opened') this.setLanguage(current);
      });
    });
    const onMessage = (event: MessageEvent) => this.receive(event);
    window.addEventListener('message', onMessage);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('message', onMessage);
      this.release();
    });
  }

  async showNotice(): Promise<void> {
    try {
      this.noticeValue.set(await this.api.voicePrivacy());
      this.stateValue.set('notice');
    } catch {
      this.stateValue.set('failed');
    }
  }

  dismiss(): void {
    this.stateValue.set('idle');
  }

  /** Steers the call in the Paxi window (FE-10); Paxi only listens to the window that opened it. */
  control(action: VoiceControl): void {
    this.post({ type: 'pax.call', action });
    if (action === 'end') this.ended();
  }

  /** Paxi follows the app's language with a native voice. */
  setLanguage(language: string): void {
    this.post({ type: 'pax.call', action: 'language', language });
  }

  /** The Paxi window is still open. */
  get windowOpen(): boolean {
    return !!this.paxiWindow && !this.paxiWindow.closed;
  }

  /** Call from the click itself, so the browser allows the new window. */
  async open(): Promise<void> {
    const caseId = this.api.session()?.caseId;
    const notice = this.noticeValue();
    if (!this.url || !caseId || !notice) return;
    const target = window.open('about:blank', 'paxi');
    this.stateValue.set('linking');
    try {
      const grant = await this.api.agentAccess(caseId);
      const { linkId } = await firstValueFrom(
        this.http.post<{ linkId: string }>(`${this.url}/api/case-link`, {
          caseId,
          agentToken: grant.sessionToken,
          expiresAt: grant.expiresAt,
          voiceNoticeVersion: notice.version,
        }),
      );
      // Paxi sends its state back to this origin only.
      const page = `${this.url}/?link=${encodeURIComponent(linkId)}&app=${encodeURIComponent(window.location.origin)}`;
      if (target) target.location.href = page;
      this.paxiWindow = target ?? window.open(page, 'paxi');
      this.linkId = linkId;
      this.scheduleRenewal(caseId, grant.expiresAt);
      clearInterval(this.windowTimer);
      this.windowTimer = setInterval(() => {
        if (!this.windowOpen) this.ended();
      }, WINDOW_CHECK_MS);
      this.stateValue.set('opened');
    } catch (error) {
      target?.close();
      console.error('VoiceAgentLink: handing the case to Paxi failed', error);
      this.stateValue.set('failed');
    }
  }

  private post(message: Record<string, string>): void {
    const target = this.paxiWindow;
    if (!this.url || !target || target.closed) return;
    target.postMessage(message, new URL(this.url).origin);
  }

  private receive(event: MessageEvent): void {
    if (!this.url || event.origin !== new URL(this.url).origin || event.source !== this.paxiWindow) return;
    const data = event.data as { type?: string; state?: string; activity?: AgentActivity } | null;
    if (data?.type !== 'pax.status') return;
    if (data.activity) this.activityValue.set(data.activity);
    if (data.state === 'ended') this.ended();
  }

  /** A new grant for the same link shortly before the old one runs out. */
  private scheduleRenewal(caseId: string, expiresAt: string): void {
    clearTimeout(this.renewTimer);
    const delay = Math.max(0, Date.parse(expiresAt) - Date.now() - RENEW_BEFORE_MS);
    this.renewTimer = setTimeout(async () => {
      if (!this.url || !this.linkId || !this.windowOpen) return;
      try {
        const grant = await this.api.agentAccess(caseId);
        await firstValueFrom(
          this.http.put(`${this.url}/api/case-link/${encodeURIComponent(this.linkId)}`, {
            caseId,
            agentToken: grant.sessionToken,
            expiresAt: grant.expiresAt,
          }),
        );
        this.scheduleRenewal(caseId, grant.expiresAt);
      } catch (error) {
        console.error('VoiceAgentLink: renewing the grant for Paxi failed', error);
      }
    }, delay);
  }

  private ended(): void {
    this.release();
    this.activityValue.set('idle');
    if (this.stateValue() === 'opened' || this.stateValue() === 'linking') this.stateValue.set('idle');
  }

  private release(): void {
    clearTimeout(this.renewTimer);
    clearInterval(this.windowTimer);
    this.linkId = null;
  }
}
