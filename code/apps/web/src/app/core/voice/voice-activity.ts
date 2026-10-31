import { Injectable, signal } from '@angular/core';
import type { AgentActivity } from '../advisor/ui-models';

/**
 * What the live voice is doing while a call runs, `null` otherwise. Kept apart from `LiveVoice`
 * so the avatar ring can read it without loading the voice code into the first bundle.
 */
@Injectable({ providedIn: 'root' })
export class VoiceActivity {
  readonly live = signal<AgentActivity | null>(null);
}
