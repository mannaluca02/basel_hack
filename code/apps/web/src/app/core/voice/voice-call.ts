import { Injectable, computed, inject, signal } from '@angular/core';
import { VoiceAgentLink } from '../advisor/api/voice-agent-link';
import { CaseStore } from '../advisor/store/case-store';

export type CallState = 'idle' | 'notice' | 'active';

/**
 * The voice adapter the call controls talk to (FE-10); the UI implements no voice itself.
 * With a voice agent configured (`voiceAgentUrl`) it drives Paxi in its own window: start shows the
 * voice notice and opens Paxi, the other controls are passed to that window. Without one it drives
 * the scripted call: start and end connect and disconnect it, mute and stop have nothing to act on.
 */
@Injectable({ providedIn: 'root' })
export class VoiceCall {
  private readonly store = inject(CaseStore);
  private readonly link = inject(VoiceAgentLink);
  private readonly mutedState = signal(false);
  private readonly endedState = signal(false);

  /** Paxi runs in its own window; the person starts talking there. */
  readonly viaPaxi = this.link.available;
  readonly muted = this.mutedState.asReadonly();
  /** The customer ended the call on purpose, so a closed stream is no connection problem. */
  readonly endedByUser = this.endedState.asReadonly();
  readonly notice = this.link.notice;

  readonly state = computed<CallState>(() => {
    if (this.viaPaxi) {
      const link = this.link.state();
      return link === 'opened' ? 'active' : link === 'notice' || link === 'linking' ? 'notice' : 'idle';
    }
    return this.store.connection() === 'disconnected' ? 'idle' : 'active';
  });

  start(): void {
    this.endedState.set(false);
    if (this.viaPaxi) void this.link.showNotice();
    else this.store.connect();
  }

  /** After the voice notice: opens Paxi. Call it from the click, so the browser allows the window. */
  confirm(): void {
    void this.link.open();
  }

  cancel(): void {
    this.link.dismiss();
  }

  end(): void {
    this.endedState.set(true);
    this.mutedState.set(false);
    if (this.viaPaxi) this.link.control('end');
    else this.store.disconnect();
  }

  toggleMute(): void {
    const muted = !this.mutedState();
    this.mutedState.set(muted);
    if (this.viaPaxi) this.link.control(muted ? 'mute' : 'unmute');
  }

  /** Interrupts what the agent is saying; it talks again once the person speaks. */
  stopSpeaking(): void {
    if (this.viaPaxi) this.link.control('stop_speaking');
  }
}
