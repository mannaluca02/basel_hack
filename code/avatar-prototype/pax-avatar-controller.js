// PROTOTYPE — the interface between voice (Dario) and avatar (Lukas).
// Voice code only calls these methods; it never sets the face directly.
//
//   import { mountPaxAvatar } from "./pax-avatar.js";
//   import { createAvatarController } from "./pax-avatar-controller.js";
//   const avatar = createAvatarController(mountPaxAvatar(el));
//   avatar.attachAudio(remoteStream);                       // what the speaker plays
//   avatar.handle({ type: "activity", state: "listening" });
//   avatar.handle({ type: "emotion", emotion: "empathetic", playbackId: "resp_1" });
//   avatar.handle({ type: "playback", event: "started", playbackId: "resp_1" });
//
// Rules (see AVATAR-INTERFACE.md):
// - While a playback is running, "listening"/"thinking" do not change the face. A real
//   barge-in always ends with playback "cancelled"; noise or echo that the voice layer
//   ignores therefore never makes the avatar twitch.
// - Events for a playbackId that already ended/cancelled are ignored (I06: late callbacks).
// - An emotion that arrives while the user speaks or the advisor thinks is queued and shown
//   when the reply starts; otherwise it is shown right away.
// - While the advisor has the turn, the reply emotion is stabilised: "neutral" never replaces a
//   stronger emotion, and other changes apply at most every EMOTION_HOLD_MS (latest wins).
//   Transcript-driven classifiers flip on every few words; the face should not.
// - After a reply ends, its emotion is held briefly, then the face relaxes to neutral.

/** @typedef {"neutral"|"happy"|"empathetic"|"concerned"|"surprised"|"celebrating"|"reassuring"|"curious"|"unsure"} ReplyEmotion */
/**
 * @typedef {{ type: "activity", state: "idle"|"listening"|"thinking" }
 *   | { type: "emotion", emotion: ReplyEmotion, playbackId?: string }
 *   | { type: "playback", event: "started"|"ended"|"cancelled"|"error", playbackId: string, turnId?: string, replyId?: string }
 * } AvatarEvent
 */

export const REPLY_EMOTIONS = ["neutral", "happy", "empathetic", "concerned", "surprised", "celebrating", "reassuring", "curious", "unsure"];
const HOLD_AFTER_REPLY_MS = 1500;
const EMOTION_HOLD_MS = 2000;
const MAX_FINISHED_IDS = 50;

export function createAvatarController(rig, { onChange } = {}) {
  let activity = "idle";          // what the conversation is doing when nobody speaks
  let playing = null;             // playbackId currently audible
  let replyEmotion = "neutral";   // tone of the current / upcoming reply
  const finished = [];            // ended or cancelled playbackIds
  let relaxTimer = 0;
  let emotionChangedAt = -Infinity, pendingEmotion = null, pendingTimer = 0;

  const isFinished = (id) => id != null && finished.includes(id);
  function finish(id) {
    if (id == null || finished.includes(id)) return;
    finished.push(id); if (finished.length > MAX_FINISHED_IDS) finished.shift();
  }

  function setReplyEmotion(emotion, reason) {
    clearTimeout(pendingTimer); pendingEmotion = null;
    if (emotion !== replyEmotion) emotionChangedAt = Date.now();
    replyEmotion = emotion;
    render(reason);
  }
  function clearPending() { clearTimeout(pendingTimer); pendingEmotion = null; }

  function render(reason) {
    clearTimeout(relaxTimer);
    let face;
    if (playing) face = replyEmotion;
    else if (activity === "listening" || activity === "thinking") face = activity;
    else face = replyEmotion;
    rig.setEmotion(face);
    onChange?.({ face, activity, playing, replyEmotion, reason });
  }

  /** @param {AvatarEvent} ev @returns {boolean} false if the event was ignored */
  function handle(ev) {
    switch (ev?.type) {
      case "activity":
        if (!["idle", "listening", "thinking"].includes(ev.state)) return false;
        if (ev.state === "listening" && activity === "idle" && !playing) { replyEmotion = "neutral"; clearPending(); }   // a new turn starts from neutral
        activity = ev.state;
        render(`activity ${activity}`);
        return true;

      case "emotion":
        if (!REPLY_EMOTIONS.includes(ev.emotion) || isFinished(ev.playbackId)) return false;
        // While the user speaks or the advisor thinks, keep that face; render() shows it at playback start.
        if (activity !== "idle") { setReplyEmotion(ev.emotion, "emotion queued"); return true; }
        if (ev.emotion === replyEmotion) { clearPending(); return true; }
        if (ev.emotion === "neutral") return true;   // sticky: no drop to neutral mid-reply
        const wait = EMOTION_HOLD_MS - (Date.now() - emotionChangedAt);
        if (wait <= 0) { setReplyEmotion(ev.emotion, "emotion"); return true; }
        pendingEmotion = ev.emotion; clearTimeout(pendingTimer);
        pendingTimer = setTimeout(() => {
          if (pendingEmotion && activity === "idle") setReplyEmotion(pendingEmotion, "emotion after hold");
        }, wait);
        return true;

      case "playback":
        if (isFinished(ev.playbackId)) return false;
        if (ev.event === "started") {
          playing = ev.playbackId; activity = "idle";
          render("playback started");
        } else {
          if (playing && playing !== ev.playbackId) return false;   // not the audible one
          finish(ev.playbackId); playing = null;
          if (ev.event === "cancelled") { clearPending(); activity = "listening"; render("playback cancelled"); return true; }
          render(`playback ${ev.event}`);
          relaxTimer = setTimeout(() => {
            if (!playing && activity === "idle") { clearPending(); replyEmotion = "neutral"; render("relax"); }
          }, HOLD_AFTER_REPLY_MS);
        }
        return true;
    }
    return false;
  }

  return {
    handle,
    /** MediaStream or <audio>/<video> element that plays the advisor's voice. */
    attachAudio: (source) => rig.attachStream(source),
    /** Fallback if only raw audio chunks are available: a function returning 0..1 per frame. */
    setLevelSource: (fn) => rig.setLevelSource(fn),
    reset() { clearPending(); activity = "idle"; playing = null; replyEmotion = "neutral"; emotionChangedAt = -Infinity; finished.length = 0; render("reset"); },
    get state() { return { face: rig.emotion, activity, playing, replyEmotion }; },
  };
}
