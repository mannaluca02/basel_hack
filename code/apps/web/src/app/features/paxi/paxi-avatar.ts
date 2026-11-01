import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  InjectionToken,
  NgZone,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { AgentActivity } from '../../core/advisor/ui-models';
import { VoiceActivity } from '../../core/voice/voice-activity';
import { connectAvatarAudio, type PaxAvatar } from '../../core/voice/voice-avatar';

export interface PaxAvatarModule {
  createPaxAvatar(host: HTMLElement): PaxAvatar;
}

/**
 * Loads Lukas's renderer. `scripts/sync-voice-avatar.mjs` copies it from `code/avatar-prototype`
 * into `public/voice-avatar/` before every start, build and test, so his file stays the only source.
 */
export const PAX_AVATAR_MODULE = new InjectionToken<() => Promise<PaxAvatarModule>>(
  'PAX_AVATAR_MODULE',
  {
    providedIn: 'root',
    factory: () => () => {
      const url = '/voice-avatar/pax-avatar.js';
      return import(/* @vite-ignore */ url) as Promise<PaxAvatarModule>;
    },
  },
);

/** Activity states the renderer knows; it shows speaking through the audio, error is not a face. */
const AVATAR_ACTIVITY: Readonly<Record<AgentActivity, 'idle' | 'listening' | 'thinking'>> = {
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'idle',
  error: 'idle',
};

/**
 * Paxi, drawn by `pax-avatar.js`. Created after the first render outside NgZone (its animation
 * frames must not trigger change detection) and destroyed with the component.
 *
 * With a call in the app, the remote voice drives the mouth (`audio`, a local audio visual only,
 * never playback evidence). Without one (scripted mock, Paxi in its own window), a speaking
 * activity drives it with a generated level, so Paxi still talks while the advisor speaks.
 */
@Component({
  selector: 'app-paxi-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[class.failed]': 'failed()' },
  template: `
    <div class="canvas" #canvas></div>
    @if (failed()) {
      <svg class="placeholder" viewBox="0 0 24 24" focusable="false">
        <circle cx="12" cy="9" r="4" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </svg>
    }
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
    }

    .canvas {
      grid-area: 1 / 1;
      width: 100%;
    }

    .placeholder {
      grid-area: 1 / 1;
      width: 50%;
      height: 50%;
      fill: none;
      stroke: var(--icon-muted);
      stroke-width: 2;
      stroke-linecap: round;
    }
  `,
})
export class PaxiAvatar {
  readonly activity = input<AgentActivity>('idle');
  /** The voice the customer hears, while a call runs in the app. */
  readonly audio = input<MediaStream | null>(null);

  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');
  private readonly avatar = signal<PaxAvatar | null>(null);
  protected readonly failed = signal(false);
  /** What drives the mouth right now, so a new activity does not reattach the same source. */
  private source: MediaStream | 'generated' | null = null;
  private readonly zone = inject(NgZone);

  constructor() {
    const load = inject(PAX_AVATAR_MODULE);
    let destroyed = false;

    // A renderer that does not load or cannot draw here leaves the placeholder; the app goes on.
    afterNextRender(() => {
      load()
        .then((module) => {
          if (destroyed) return;
          const host = this.canvas().nativeElement;
          this.avatar.set(this.zone.runOutsideAngular(() => module.createPaxAvatar(host)));
        })
        .catch(() => {
          if (!destroyed) this.failed.set(true);
        });
    });

    inject(DestroyRef).onDestroy(() => {
      destroyed = true;
      this.avatar()?.destroy();
    });

    // Reply emotions of the live call (GPT-Live emotion triggers); the renderer holds each a while.
    const voice = inject(VoiceActivity);
    effect(() => {
      const avatar = this.avatar();
      const emotion = voice.emotion();
      if (!avatar || !emotion) return;
      untracked(() => this.zone.runOutsideAngular(() => avatar.handle({ type: 'emotion', emotion: emotion.emotion })));
    });

    effect(() => {
      const avatar = this.avatar();
      const activity = this.activity();
      const audio = this.audio();
      if (!avatar) return;
      // The renderer's timers and audio analyser must not trigger change detection either.
      untracked(() => this.zone.runOutsideAngular(() => this.drive(avatar, activity, audio)));
    });
  }

  private drive(avatar: PaxAvatar, activity: AgentActivity, audio: MediaStream | null): void {
    const source = audio ?? (activity === 'speaking' ? 'generated' : null);
    if (source !== this.source) {
      this.source = source;
      connectAvatarAudio(avatar, source === 'generated' ? speechLevel : source);
    }
    avatar.handle({ type: 'activity', state: AVATAR_ACTIVITY[activity] });
  }
}

/** A speech-like level for Paxi's mouth without audio: syllables over slower phrases, 0..1. */
function speechLevel(): number {
  const t = performance.now();
  return Math.max(0, 0.35 + 0.3 * Math.sin(t / 85) * Math.sin(t / 410));
}
