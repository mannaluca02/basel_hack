// PROTOTYPE — types for pax-avatar.js (rig + shared types). Controller: pax-avatar-controller.d.ts.
// Contract: see AVATAR-INTERFACE.md.

export type ReplyEmotion = "neutral" | "acknowledging" | "curious" | "explaining" | "reassuring" | "empathetic" | "pleased" | "recovering" | "presenting_offer";
export type Face = ReplyEmotion | "listening" | "thinking";

export type AvatarEvent =
  | { type: "activity"; state: "idle" | "listening" | "thinking" }
  | { type: "emotion"; emotion: ReplyEmotion; playbackId?: string }
  | { type: "playback"; event: "started" | "ended" | "cancelled" | "error"; playbackId: string; turnId?: string; replyId?: string };

export interface AvatarState {
  face: Face;
  activity: "idle" | "listening" | "thinking";
  playing: string | null;
  replyEmotion: ReplyEmotion;
}

export interface PaxAvatarRig {
  setEmotion(face: Face): boolean;
  /** Re-trigger the current expression’s entry animation. */
  replay(): void;
  attachStream(source: MediaStream | HTMLMediaElement): void;
  setLevelSource(fn: ((dt: number) => number) | null): void;
  readonly emotion: Face;
  destroy(): void;
}

export const EMOTIONS: Readonly<Record<Face, { label: string; subtitle: string }>>;
export function mountPaxAvatar(host: HTMLElement, options?: { onFrame?: (frame: unknown) => void }): PaxAvatarRig;
