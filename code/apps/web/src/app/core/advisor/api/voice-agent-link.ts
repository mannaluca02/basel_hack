import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { APP_ENVIRONMENT } from '../../config/app-environment';
import { CustomerApi, VoicePrivacyNotice } from './customer-api';

export type VoiceLinkState = 'idle' | 'notice' | 'linking' | 'opened' | 'failed';

/**
 * Hands the case to the separate voice agent (Paxi): after the customer read the voice notice,
 * a case-scoped agent grant goes straight to the voice agent's server, which keeps it. The grant
 * is never stored or shown here. Paxi then proposes what it heard as packages on the review stand.
 */
@Injectable({ providedIn: 'root' })
export class VoiceAgentLink {
  private readonly http = inject(HttpClient);
  private readonly api = inject(CustomerApi);
  private readonly url = inject(APP_ENVIRONMENT).voiceAgentUrl ?? null;
  private readonly stateValue = signal<VoiceLinkState>('idle');
  private readonly noticeValue = signal<VoicePrivacyNotice | null>(null);

  readonly available = this.url !== null;
  readonly state = this.stateValue.asReadonly();
  readonly notice = this.noticeValue.asReadonly();

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
      const page = `${this.url}/?link=${encodeURIComponent(linkId)}`;
      if (target) target.location.href = page;
      else window.open(page, 'paxi');
      this.stateValue.set('opened');
    } catch (error) {
      target?.close();
      console.error('VoiceAgentLink: handing the case to Paxi failed', error);
      this.stateValue.set('failed');
    }
  }
}
