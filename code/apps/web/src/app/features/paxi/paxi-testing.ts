import type { Provider } from '@angular/core';
import type { PaxAvatar } from '../../core/voice/voice-avatar';
import { PAX_AVATAR_MODULE } from './paxi-avatar';

type AvatarEvent = Parameters<PaxAvatar['handle']>[0];
type AudioSource = Parameters<PaxAvatar['attachAudio']>[0];

/** Records what the app tells Paxi; jsdom cannot run the real renderer (no matchMedia, no audio). */
export class FakePaxAvatar implements PaxAvatar {
  readonly events: AvatarEvent[] = [];
  readonly audio: AudioSource[] = [];
  host: HTMLElement | null = null;
  destroyed = false;
  readonly state: PaxAvatar['state'] = {
    face: 'neutral',
    activity: 'idle',
    playing: null,
    replyEmotion: 'neutral',
    level: 0,
    localAudioActive: false,
  };

  handle(event: AvatarEvent): boolean {
    this.events.push(event);
    return true;
  }

  attachAudio(source: AudioSource): void {
    this.audio.push(source);
  }

  show(): void {}

  reset(): void {}

  destroy(): void {
    this.destroyed = true;
  }
}

/** Serves a fake renderer instead of `/voice-avatar/pax-avatar.js`; `created` lists every Paxi. */
export function provideFakePaxAvatar(created: FakePaxAvatar[] = []): Provider {
  return {
    provide: PAX_AVATAR_MODULE,
    useValue: () =>
      Promise.resolve({
        createPaxAvatar: (host: HTMLElement) => {
          const avatar = new FakePaxAvatar();
          avatar.host = host;
          created.push(avatar);
          return avatar;
        },
      }),
  };
}
