/**
 * Paxi's reply emotions: the ReplyEmotion values of the avatar renderer
 * (avatar-prototype/pax-avatar.d.ts) and the choices of the backend's GPT-Live emotion triggers.
 */
export const REPLY_EMOTIONS = [
  'neutral',
  'acknowledging',
  'curious',
  'explaining',
  'shocked',
  'empathetic',
  'pleased',
  'recovering',
  'presenting_offer',
] as const;
export type ReplyEmotion = (typeof REPLY_EMOTIONS)[number];

export function isReplyEmotion(value: unknown): value is ReplyEmotion {
  return (REPLY_EMOTIONS as readonly unknown[]).includes(value);
}
