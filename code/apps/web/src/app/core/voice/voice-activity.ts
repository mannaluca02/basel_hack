import { Injectable, signal } from '@angular/core';
import type { AgentActivity } from '../advisor/ui-models';
import type { ReplyEmotion } from './emotions';

/**
 * What the live voice is doing while a call runs, `null` otherwise, and Paxi's voice for the
 * avatar's mouth. Kept apart from `LiveVoice` so the dock can read it without loading the voice
 * code into the first bundle.
 */
@Injectable({ providedIn: 'root' })
export class VoiceActivity {
  readonly live = signal<AgentActivity | null>(null);
  /** The remote voice while a call runs: a local audio level for the avatar, nothing more. */
  readonly audio = signal<MediaStream | null>(null);
  /** Paxi's latest line in the running call, for the caption under Paxi; `null` without a call. */
  readonly caption = signal<string | null>(null);
  /** Paxi's latest reply emotion in the running call (GPT-Live emotion triggers); `null` without a call. */
  readonly emotion = signal<{ readonly emotion: ReplyEmotion; readonly seq: number } | null>(null);
}
