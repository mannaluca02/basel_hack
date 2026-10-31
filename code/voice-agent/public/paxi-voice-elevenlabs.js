// Paxi voice client for ElevenLabs. Same interface as createPaxiVoice (GPT-Live):
// start() from a click, stop(), logUrl, running, and the same callbacks. ElevenLabs does
// not hand out the audio stream, so the avatar gets a level function (onLevelSource)
// instead of onAudioStream.
import { Conversation } from "https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.28.0/+esm";
import { createProgressPoller, isGoodbye, isSpeech, postJson as post, wordsOf } from "./paxi-common.js";

const FLUSH_INTERVAL_MS = 1000;
const INACTIVE_WARN_MS = 30_000;
const INACTIVE_GRACE_MS = 30_000;
const GOODBYE_MS = 7000;
const OWN_WORDS_SHARE = 0.5;

/**
 * @param {object} options See createPaxiVoice in paxi-voice.js. Additionally:
 * @param {(level: () => number) => void} [options.onLevelSource] Returns Paxi's current output level (0..1) for the avatar.
 */
export function createPaxiElevenLabs({
  baseUrl = "",
  onLevelSource = () => {},
  onAvatarEvent = () => {},
  onTranscript = () => {},
  onAnswer = () => {},
  onStatus = () => {},
} = {}) {
  let conversation;
  let session; // { sessionId, conversationId, offsetMs, startedAt }
  let running = false;
  let finishing = false;
  let closing = false;
  let conversationId;
  let pendingFragments = [];
  let flushTimer;
  let idleTimer;
  let poller;
  let intro = null;
  let languageChosen = false;
  let lastUserAt = 0;
  let inactiveWarnedAt = null;
  let lastGoodbyeNudge = 0;
  let playbackId = null;
  let playbackSequence = 0;

  const emit = (callback, value) => {
    try {
      callback(value);
    } catch (error) {
      console.error("Paxi callback failed", error);
    }
  };
  const status = (state, detail) => emit(onStatus, { state, detail, conversationId });
  const postJson = (path, body) => post(baseUrl, path, body);
  const now = () => performance.now() - (session?.startedAt ?? performance.now()) + (session?.offsetMs ?? 0);

  // Notes from the app that Paxi should act on; ElevenLabs only speaks after a user message.
  const appNote = (text) => conversation?.sendUserMessage(`[App note, not from the person: ${text}]`);

  function record(speaker, text) {
    const start = now();
    // ElevenLabs reports whole turns; spread them over a rough speaking time for the log.
    const fragment = { speaker, text, start_ms: Math.round(start), end_ms: Math.round(start + text.length * 60) };
    pendingFragments.push(fragment);
    emit(onTranscript, { speaker, text, startMs: fragment.start_ms, endMs: fragment.end_ms });
  }

  async function flushTranscript() {
    if (!session || pendingFragments.length === 0) return;
    const fragments = pendingFragments;
    pendingFragments = [];
    try {
      // offsetMs is already included, so the server must not add it again.
      await postJson(`/api/conversations/${session.sessionId}/transcript`, {
        fragments: fragments.map((f) => ({ ...f, start_ms: f.start_ms - session.offsetMs, end_ms: f.end_ms - session.offsetMs })),
      });
    } catch (error) {
      pendingFragments = fragments.concat(pendingFragments);
      console.error("Transcript upload failed", error);
    }
  }

  // --- Intro: played locally, stops as soon as the person really speaks ----------------------

  async function playIntro({ url, text }) {
    const audio = new Audio(`${baseUrl}${url}`);
    intro = { audio, words: new Set(wordsOf(text)) };
    audio.addEventListener("ended", () => endIntro());
    try {
      await audio.play();
      onLevelSource(levelOf(audio));
      emit(onAvatarEvent, { type: "playback", event: "started", playbackId: "paxi-intro" });
      record("agent", text);
    } catch (error) {
      console.error("Intro playback failed", error);
      intro = null;
    }
  }

  function endIntro(cancelled = false) {
    if (!intro) return;
    intro.audio.pause();
    intro = null;
    emit(onAvatarEvent, { type: "playback", event: cancelled ? "cancelled" : "ended", playbackId: "paxi-intro" });
    lastUserAt = performance.now();
    if (conversation) onLevelSource(() => conversation.getOutputVolume());
  }

  // Without headphones the intro can echo into the microphone; that is not the person.
  function isIntroEcho(text) {
    if (!intro) return false;
    const words = wordsOf(text);
    const own = words.filter((word) => !intro.words.has(word)).length;
    return words.length > 0 && own / words.length < OWN_WORDS_SHARE;
  }

  // --- Conversation events -------------------------------------------------------------------

  async function handleMessage({ message, source, role }) {
    const speaker = source === "user" || role === "user" ? "user" : "agent";
    if (!message?.trim() || message.startsWith("[App note")) return;
    if (speaker === "user") {
      if (isIntroEcho(message)) return;
      endIntro(true);
      record("user", message);
      if (!isSpeech(message)) return;
      lastUserAt = performance.now();
      inactiveWarnedAt = null;
      if (!languageChosen) {
        languageChosen = true;
        postJson(`/api/conversations/${session.sessionId}/language`, { text: message }).catch(console.error);
      }
      return;
    }
    record("agent", message);
    if (isGoodbye(message)) handleGoodbye();
  }

  // Once everything is complete, Paxi's goodbye ends the call; before that, it carries on.
  function handleGoodbye() {
    if (closing) return;
    if (poller?.latest?.complete) {
      closing = true;
      setTimeout(() => finish("closed"), GOODBYE_MS);
      return;
    }
    const open = [...(poller?.latest?.open_core ?? []), ...(poller?.latest?.open_extended ?? [])];
    if (!open.length || performance.now() - lastGoodbyeNudge < 20_000) return;
    lastGoodbyeNudge = performance.now();
    appNote(`You started to say goodbye, but the conversation is not finished. Still open: ${open.join(", ")}. Say lightly that there is a little more you would love to know and continue with one of these.`);
  }

  function handleMode({ mode }) {
    if (mode === "speaking") {
      playbackId = `paxi-el-${++playbackSequence}`;
      emit(onAvatarEvent, { type: "playback", event: "started", playbackId });
    } else if (playbackId) {
      emit(onAvatarEvent, { type: "playback", event: "ended", playbackId });
      playbackId = null;
      emit(onAvatarEvent, { type: "activity", state: "listening" });
    }
  }

  // ElevenLabs re-engages quiet people by itself (turn timeout); the app only handles the close.
  function checkIdle() {
    if (!running || closing || intro || !conversation) return;
    const t = performance.now();
    if (playbackId) return;
    if (inactiveWarnedAt && t - inactiveWarnedAt >= INACTIVE_GRACE_MS) {
      closing = true;
      appNote("The person still has not reacted. Say in one or two short sentences, in the conversation language, that you are ending the call now because nothing has happened for a while, and that they can simply start again later and you will continue right where you left off.");
      setTimeout(() => finish("inactive"), GOODBYE_MS);
      return;
    }
    if (!inactiveWarnedAt && t - lastUserAt >= INACTIVE_WARN_MS) {
      inactiveWarnedAt = t;
      appNote("The person has not said anything for a while. Kindly say, in the conversation language, that you will close the call in about 30 seconds if you do not hear from them, and that they can simply start again later and continue right where you left off.");
    }
  }

  async function finish(reason) {
    if (finishing) return;
    finishing = true;
    clearInterval(flushTimer);
    clearInterval(idleTimer);
    poller?.stop();
    await flushTranscript();
    if (session) await postJson(`/api/conversations/${session.sessionId}/close`, { status: reason }).catch(console.error);
    endIntro(true);
    if (playbackId) emit(onAvatarEvent, { type: "playback", event: "cancelled", playbackId });
    playbackId = null;
    emit(onAvatarEvent, { type: "activity", state: "idle" });
    await conversation?.endSession().catch(() => {});
    conversation = undefined;
    running = false;
    status("ended", reason);
  }

  return {
    /** Starts a conversation; call it from a click. { resume: conversationId } continues one. */
    async start({ resume } = {}) {
      if (running) return;
      running = true;
      finishing = false;
      closing = false;
      languageChosen = false;
      inactiveWarnedAt = null;
      pendingFragments = [];
      conversationId = undefined;
      status("connecting");
      try {
        // Ask for the microphone inside the click, before the network round trips.
        const microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        microphone.getTracks().forEach((track) => track.stop());
        const result = await postJson("/api/elevenlabs/session", { resume });
        session = { ...result, startedAt: performance.now() };
        conversationId = result.conversationId;
        languageChosen = Boolean(result.language);
        lastUserAt = performance.now();
        if (result.intro) playIntro(result.intro);
        conversation = await Conversation.startSession({
          conversationToken: result.token,
          connectionType: "webrtc",
          overrides: {
            agent: {
              prompt: { prompt: result.prompt },
              firstMessage: result.firstMessage,
              ...(result.language ? { language: result.language } : {}),
            },
          },
          onMessage: handleMessage,
          onModeChange: handleMode,
          onError: (message) => console.error("ElevenLabs error", message),
          onDisconnect: () => {
            if (running && !finishing) finish(closing ? "inactive" : "disconnected");
          },
        });
        if (!intro) onLevelSource(() => conversation.getOutputVolume());
        flushTimer = setInterval(flushTranscript, FLUSH_INTERVAL_MS);
        idleTimer = setInterval(checkIdle, 1000);
        poller = createProgressPoller({
          baseUrl,
          sessionId: () => session.sessionId,
          onChanges: (changes) => {
            for (const { fieldId, value, status: answerStatus } of changes) {
              if (answerStatus === "captured" || answerStatus === "declined") emit(onAnswer, { fieldId, value, status: answerStatus });
            }
          },
          onNote: (note) => conversation?.sendContextualUpdate(note),
        });
        status("connected", "elevenlabs");
      } catch (error) {
        running = false;
        endIntro(true);
        status("error", error instanceof Error ? error.message : String(error));
        throw error;
      }
    },

    stop() {
      if (running) finish("closed");
    },

    get logUrl() {
      return conversationId ? `${baseUrl}/api/conversations/${conversationId}` : null;
    },

    get running() {
      return running;
    },
  };
}

// Output level of a media element for the avatar while the intro plays.
function levelOf(audio) {
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  context.createMediaElementSource(audio).connect(analyser);
  analyser.connect(context.destination);
  const samples = new Float32Array(analyser.fftSize);
  return () => {
    analyser.getFloatTimeDomainData(samples);
    return Math.min(1, Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length) * 4);
  };
}
