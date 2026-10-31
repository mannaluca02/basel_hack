import type { PaxAvatar } from '../../../../../avatar-prototype/pax-avatar.js';

export type { PaxAvatar } from '../../../../../avatar-prototype/pax-avatar.js';

/** Local output-energy visualisation only. Never emits playback/confirmation evidence. */
export function connectAvatarAudio(
  avatar: PaxAvatar,
  source: Parameters<PaxAvatar['attachAudio']>[0],
): void {
  avatar.attachAudio(source);
  avatar.handle({ type: 'local-audio-visual', enabled: source !== null });
}
