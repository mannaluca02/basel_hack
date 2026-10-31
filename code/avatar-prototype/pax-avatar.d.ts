export type ReplyEmotion = "neutral" | "acknowledging" | "curious" | "explaining" | "shocked" | "empathetic" | "pleased" | "recovering" | "presenting_offer";
export type Face = ReplyEmotion | "listening" | "thinking";

export type AvatarEvent =
  /** Opt-in local energy-driven pose. Not a playback boundary or confirmation signal. */
  | { type: "local-audio-visual"; enabled: boolean }
  | { type: "activity"; state: "idle" | "listening" | "thinking" }
  | { type: "emotion"; emotion: ReplyEmotion; playbackId?: string }
  | { type: "playback"; event: "started" | "ended" | "cancelled" | "error"; playbackId: string; turnId?: string; replyId?: string };

export interface AvatarState {
  face: Face;
  activity: "idle" | "listening" | "thinking";
  playing: string | null;
  replyEmotion: ReplyEmotion;
  level: number;
  /** Local output-energy heuristic only; never proof of audibility or completed playback. */
  localAudioActive: boolean;
}

export interface PaxAvatar {
  /** False for ignored events, including finished playback IDs. */
  handle(event: AvatarEvent): boolean;
  attachAudio(source: MediaStream | HTMLMediaElement | (() => number) | null): void;
  /** Design/demo override; always plays the expression's entry gesture. */
  show(face: Face): void;
  reset(): void;
  readonly state: AvatarState;
  destroy(): void;
}

export const EMOTIONS: Readonly<Record<Face, { label: string; subtitle: string }>>;
export const REPLY_EMOTIONS: readonly ReplyEmotion[];
export interface PaxAvatarOptions {
  /** Minimum interval between reply emotion changes in milliseconds. Default 5000; 0 disables the hold. */
  emotionHoldMs?: number;
}
export function createPaxAvatar(host: HTMLElement, options?: PaxAvatarOptions): PaxAvatar;
