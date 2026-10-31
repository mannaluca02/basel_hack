import { Injectable, signal } from '@angular/core';
import type { AgentActivity } from '../advisor/ui-models';

/**
 * What the live voice is doing while a call runs, `null` otherwise. Kept apart from `LiveVoice`
 * so the avatar ring can read it without loading the voice code into the first bundle.
 */
@Injectable({ providedIn: 'root' })
export class VoiceActivity {
  readonly live = signal<AgentActivity | null>(null);
  /** The remote voice the customer hears, for Paxi's local audio visual; `null` without a call. */
  readonly audio = signal<MediaStream | null>(null);
  /** Paxi's latest line in the running call, for the caption under Paxi; `null` without a call. */
  readonly caption = signal<string | null>(null);
}
