import type { PaxAvatar } from '../../../../../../avatar-prototype/pax-avatar.js';

export type { PaxAvatar } from '../../../../../../avatar-prototype/pax-avatar.js';

/** Local output-energy visualisation only. Never emits playback/confirmation evidence. */
export function connectAvatarAudio(
  avatar: PaxAvatar,
  source: Parameters<PaxAvatar['attachAudio']>[0],
): void {
  avatar.attachAudio(source);
  avatar.handle({ type: 'local-audio-visual', enabled: source !== null });
}

/** Remote level above which Paxi counts as speaking, and the quiet that ends a reply (as in Lukas's adapter). */
const SPEAKING_LEVEL = 0.1;
const REPLY_END_MS = 600;

/**
 * The live call's voice for Paxi's face: segments the remote voice by energy into reply segments,
 * like Lukas's GPT-Live adapter (`avatar-prototype/openai-realtime-adapter.js`: started when the
 * energy rises, ended after 600 ms quiet). While a segment runs the renderer shows the reply
 * emotion GPT-Live classified (curious, pleased, empathetic, …); between segments listening and
 * thinking. The local-audio-visual mode would show only explaining and listening instead.
 *
 * The segments are a visual heuristic for the renderer only (ids `visual-…`): never recorded,
 * never playback, audibility or confirmation evidence. Returns the stop function.
 */
export function followAvatarVoice(avatar: PaxAvatar, stream: MediaStream): () => void {
  avatar.attachAudio(stream);
  avatar.handle({ type: 'local-audio-visual', enabled: false });
  let segment: string | null = null,
    sequence = 0,
    lastSound = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    if (avatar.state.level > SPEAKING_LEVEL) {
      lastSound = now;
      if (!segment) {
        segment = `visual-${++sequence}`;
        avatar.handle({ type: 'playback', event: 'started', playbackId: segment });
      }
    } else if (segment && now - lastSound > REPLY_END_MS) {
      avatar.handle({ type: 'playback', event: 'ended', playbackId: segment });
      segment = null;
    }
  }, 50);
  return () => {
    clearInterval(timer);
    if (segment) avatar.handle({ type: 'playback', event: 'ended', playbackId: segment });
  };
}
