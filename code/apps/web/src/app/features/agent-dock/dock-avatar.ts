import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { AgentActivity } from '../../core/advisor/ui-models';
import { VoiceActivity } from '../../core/voice/voice-activity';
import { connectAvatarAudio, type PaxAvatar } from '../../core/voice/voice-avatar';

/** Lukas's renderer, copied to public/ by scripts/sync-voice-avatar.mjs. */
const AVATAR_URL = '/voice-avatar/pax-avatar.js';

/** The renderer knows three activities; speaking shows through the voice's audio level instead. */
const AVATAR_ACTIVITY: Readonly<Record<AgentActivity, 'idle' | 'listening' | 'thinking'>> = {
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'listening',
  error: 'idle',
};

/**
 * Paxi in the agent dock: Lukas's avatar renderer (avatar-prototype/pax-avatar.js), driven by the
 * same activity as the ring and, during a live call, by the level of Paxi's voice. Until the
 * renderer loaded, or if it cannot, the dock's placeholder figure stays. Decorative: the dock's
 * button and status text carry the meaning.
 */
@Component({
  selector: 'app-dock-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[class.ready]': 'ready()' },
  template: `
    <div #host class="renderer"></div>
    @if (!ready()) {
      <svg class="placeholder" viewBox="0 0 24 24" focusable="false">
        <circle cx="12" cy="9" r="4" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </svg>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: grid;
      width: 100%;
      height: 100%;
      place-items: center;
    }

    .renderer {
      position: absolute;
      inset: -6%;
    }

    .placeholder {
      width: 65%;
      height: 65%;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
    }
  `,
})
export class DockAvatar {
  readonly activity = input<AgentActivity>('idle');

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly voice = inject(VoiceActivity);
  private readonly avatar = signal<PaxAvatar | null>(null);
  protected readonly ready = signal(false);

  constructor() {
    let destroyed = false;
    afterNextRender(() => void this.load(() => destroyed));
    inject(DestroyRef).onDestroy(() => {
      destroyed = true;
      this.avatar()?.destroy();
    });
    effect(() => {
      this.avatar()?.handle({ type: 'activity', state: AVATAR_ACTIVITY[this.activity()] });
    });
    effect(() => {
      const avatar = this.avatar();
      if (avatar) connectAvatarAudio(avatar, this.voice.audio());
    });
  }

  private async load(destroyed: () => boolean): Promise<void> {
    try {
      const module = (await import(/* @vite-ignore */ AVATAR_URL)) as {
        createPaxAvatar(host: HTMLElement): PaxAvatar;
      };
      if (destroyed()) return;
      this.avatar.set(module.createPaxAvatar(this.host().nativeElement));
      this.ready.set(true);
    } catch {
      // No renderer (tests, a build without the copied file): the placeholder stays.
    }
  }
}
