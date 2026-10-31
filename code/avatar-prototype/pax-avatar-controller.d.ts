// PROTOTYPE — types for pax-avatar-controller.js. Contract: see AVATAR-INTERFACE.md.
import type { AvatarEvent, AvatarState, PaxAvatarRig, ReplyEmotion } from "./pax-avatar.js";

export type { AvatarEvent, AvatarState, ReplyEmotion };

export interface AvatarController {
  /** Returns false if the event was ignored (unknown, or for an ended/cancelled playbackId). */
  handle(event: AvatarEvent): boolean;
  /** The stream or element that plays the advisor's voice; drives the body motion. */
  attachAudio(source: MediaStream | HTMLMediaElement): void;
  /** Fallback when only raw audio chunks exist: return the current level 0..1 each frame. */
  setLevelSource(fn: ((dt: number) => number) | null): void;
  reset(): void;
  readonly state: AvatarState;
}

export const REPLY_EMOTIONS: readonly ReplyEmotion[];
export function createAvatarController(rig: PaxAvatarRig, options?: { onChange?: (change: AvatarState & { reason: string }) => void }): AvatarController;
