// Paxi voice client: a reusable ES module with no UI of its own. It connects the
// microphone to GPT-Live over WebRTC, runs the backend's tool calls, switches to a
// native voice when the person picks a language, and reports everything through
// callbacks. Avatar events follow code/avatar-prototype/AVATAR-INTERFACE.md.
//
//   const paxi = createPaxiVoice({ onAudioStream, onAvatarEvent, onTranscript, onAnswer, onStatus });
//   button.onclick = () => paxi.start();   // must run from a user action (microphone, audio)
//   paxi.stop();

import { createProgressPoller, isGoodbye, isSpeech, postJson as post, wordsOf } from "./paxi-common.js";

const FLUSH_INTERVAL_MS = 1000;
const HANDOFF_CLOSE_TIMEOUT_MS = 5000;
const FINAL_CLOSE_TIMEOUT_MS = 15_000;
// Same thresholds as the avatar prototype: GPT-Live has no speech or playback boundary
// events, so activity comes from local audio energy.
const LEVEL_THRESHOLD = 0.015;
const SILENCE_MS = 600;
// Pause after the person's first words before their language is detected.
const FIRST_WORDS_PAUSE_MS = 700;
// Paxi takes the initiative after this much silence, at most twice in a row.
const IDLE_MS = 8000;
const MAX_NUDGES = 2;
// If the person says nothing for this long, Paxi announces that it will close the call,
// and closes it after the grace period. The conversation can be resumed later.
const INACTIVE_WARN_MS = 30_000;
const INACTIVE_GRACE_MS = 30_000;
// Time for Paxi's goodbye before the call is closed.
const GOODBYE_MS = 7000;
// The recorded intro can echo back through the microphone without headphones. Speech
// counts as the person's own once at least this share of its words is not from the intro.
const OWN_WORDS_SHARE = 0.5;
// Echo transcripts arrive a little after the audio, so the filter outlasts the intro.
const ECHO_TAIL_MS = 2000;

/**
 * @param {object} options
 * @param {string} [options.baseUrl] Origin of the voice-agent server ("" for same origin).
 * @param {(stream: MediaStream) => void} [options.onAudioStream] The stream the person hears; called again after a voice switch.
 * @param {(event: object) => void} [options.onAvatarEvent] AvatarEvents: activity, playback.
 * @param {(fragment: {speaker: "user"|"agent", text: string, startMs: number, endMs: number}) => void} [options.onTranscript]
 * @param {(answer: {fieldId: string, value: string|null, status: "captured"|"declined"}) => void} [options.onAnswer]
 *   A questionnaire detail was saved, or the person declined it (a Pax colleague follows up).
 * @param {(status: {state: "connecting"|"connected"|"switching"|"ended"|"error", detail?: string, conversationId?: string}) => void} [options.onStatus]
 */
export function createPaxiVoice({
  baseUrl = "",
  onAudioStream = () => {},
  onAvatarEvent = () => {},
  onTranscript = () => {},
  onAnswer = () => {},
  onStatus = () => {},
} = {}) {
  let microphone;
  let audioContext;
  let current; // the session the person currently hears
  let sessions = [];
  let switching = false;
  let finishing = false;
  let running = false;
  let conversationId;
  let closeTimeout;
  let flushTimer;
  let levelTimer;
  let pendingFragments = [];
  let handledCalls = new Set();
  let monitors = [];
  let playbackSequence = 0;
  let playbackId = null;
  let languageChosen = false;
  let firstWords = "";
  let firstWordsTimer;
  let intro = null; // { audio, monitor, words, endedAt, pending: [] } while the recorded intro runs
  let lastActivity = 0;
  let nudges = 0;
  let idleTimer;
  let lastUserAt = 0;
  let inactiveWarnedAt = null;
  let closingForInactivity = false;
  let resumeId = null;
  let poller = null;
  let agentTurnText = "";
  let goodbyeTimer;
  let lastGoodbyeNudge = 0;

  const emit = (callback, value) => {
    try {
      callback(value);
    } catch (error) {
      console.error("Paxi callback failed", error);
    }
  };
  const status = (state, detail) => emit(onStatus, { state, detail, conversationId });

  const postJson = (path, body) => post(baseUrl, path, body);


  // Fragments are posted per session; the server shifts them onto the conversation timeline.
  async function flushTranscript() {
    if (pendingFragments.length === 0) return;
    const batch = pendingFragments;
    pendingFragments = [];
    for (const [sessionId, entries] of Map.groupBy(batch, (entry) => entry.sessionId)) {
      try {
        await postJson(`/api/conversations/${sessionId}/transcript`, { fragments: entries.map((entry) => entry.fragment) });
      } catch (error) {
        // Keep the fragments for the next attempt instead of dropping them.
        pendingFragments = entries.concat(pendingFragments);
        console.error("Transcript upload failed", error);
      }
    }
  }

  function send(session, event) {
    if (session.events.readyState !== "open") return;
    session.events.send(JSON.stringify({ event_id: crypto.randomUUID(), ...event }));
  }

  function returnToolResult(session, callId, output) {
    send(session, {
      type: "response.item.create",
      item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) },
    });
    send(session, { type: "response.create" });
  }

  // --- Audio levels -> AvatarEvents ---------------------------------------------

  function monitor(stream, output) {
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const entry = { source, analyser, samples: new Float32Array(analyser.fftSize), output, active: false, lastSound: 0 };
    monitors.push(entry);
    return entry;
  }

  function stopMonitor(entry) {
    entry.source.disconnect();
    monitors = monitors.filter((m) => m !== entry);
  }

  function endPlayback(event) {
    if (!playbackId) return;
    emit(onAvatarEvent, { type: "playback", event, playbackId });
    playbackId = null;
  }

  function checkLevels() {
    const now = performance.now();
    for (const m of monitors) {
      m.analyser.getFloatTimeDomainData(m.samples);
      const rms = Math.sqrt(m.samples.reduce((sum, n) => sum + n * n, 0) / m.samples.length);
      if (rms > LEVEL_THRESHOLD) {
        m.lastSound = now;
        lastActivity = now;
        if (m.active) continue;
        m.active = true;
        if (m.output) {
          playbackId = `paxi-${conversationId ?? "call"}-${++playbackSequence}`;
          emit(onAvatarEvent, { type: "playback", event: "started", playbackId });
        } else {
          emit(onAvatarEvent, { type: "activity", state: "listening" });
        }
      } else if (m.active && now - m.lastSound > SILENCE_MS) {
        m.active = false;
        if (m.output) endPlayback("ended");
        else emit(onAvatarEvent, { type: "activity", state: "thinking" });
      }
    }
  }

  // --- Tool calls -----------------------------------------------------------------

  async function handleSetLanguage(session, item) {
    let result;
    try {
      result = await postJson(`/api/conversations/${session.id}/language`, JSON.parse(item.arguments));
    } catch (error) {
      console.error("set_language failed", error);
      result = { ok: false };
    }
    if (result.ok) languageChosen = true;
    if (!result.ok || !result.switch_voice || switching) {
      // This voice already fits (or the switch failed): carry on in this session.
      returnToolResult(session, item.call_id, { ok: result.ok, language: result.language });
      return;
    }
    switchVoice(session, item.call_id, result.voice);
  }

  // The person picks the language just by speaking, often while Paxi is still
  // welcoming them. Detecting it here makes the voice switch independent of whether
  // the model remembers to call set_language.
  function collectFirstWords(session, text) {
    if (languageChosen || session.previous) return;
    firstWords += text;
    clearTimeout(firstWordsTimer);
    clearInterval(idleTimer);
    if (intro) {
      intro.audio.pause();
      intro = null;
    }
    firstWordsTimer = setTimeout(() => detectLanguage(session), FIRST_WORDS_PAUSE_MS);
  }

  async function detectLanguage(session) {
    if (languageChosen || switching || !firstWords.trim()) return;
    let result;
    try {
      result = await postJson(`/api/conversations/${session.id}/language`, { text: firstWords });
    } catch (error) {
      console.error("Language detection failed", error);
      return;
    }
    if (!result.ok || languageChosen) return;
    languageChosen = true;
    if (result.switch_voice && !switching) switchVoice(session, null, result.voice);
  }

  // --- Voice switch -------------------------------------------------------------------

  // Hands the conversation to a new session with the native voice. The old session
  // is muted right away so the person never hears the wrong voice in the new language.
  async function switchVoice(previous, callId, voice) {
    switching = true;
    previous.audio.muted = true;
    if (previous.monitor) stopMonitor(previous.monitor);
    endPlayback("cancelled");
    status("switching", voice);
    await flushTranscript();
    try {
      current = await connect({ continueFrom: previous.id, previous });
    } catch (error) {
      console.error("Voice switch failed", error);
      previous.audio.muted = false;
      if (previous.stream) previous.monitor = monitor(previous.stream, true);
      switching = false;
      status("connected", "voice switch failed, same voice continues");
      if (callId) returnToolResult(previous, callId, { ok: false, reason: "voice switch failed, continue in this voice" });
    }
  }

  // Called once the new session runs: close the old one and keep its usage for the log.
  function retire(session) {
    session.retired = true;
    send(session, { type: "session.close" });
    session.closeTimeout = setTimeout(() => endRetired(session, null), HANDOFF_CLOSE_TIMEOUT_MS);
  }

  async function endRetired(session, usage) {
    if (session.ended) return;
    session.ended = true;
    clearTimeout(session.closeTimeout);
    session.peer.close();
    session.audio.srcObject = null;
    await postJson(`/api/conversations/${session.id}/close`, { status: "handoff", usage }).catch(console.error);
  }

  // --- Recorded intro ----------------------------------------------------------------------

  // The browser plays the intro itself while the microphone already runs, so the person
  // can interrupt it by simply speaking.
  async function playIntro(session) {
    const audio = new Audio(`${baseUrl}${session.intro.url}`);
    audio.crossOrigin = "anonymous";
    const words = new Set(wordsOf(session.intro.text));
    intro = { audio, words, endedAt: null, pending: [] };
    audio.addEventListener("ended", () => endIntro("ended"));
    try {
      await audio.play();
    } catch (error) {
      console.error("Intro playback failed", error);
      intro = null;
      send(session, { type: "session.commentary.append", delegation_id: null, content: session.fallbackGreeting });
      return;
    }
    const stream = audio.captureStream();
    intro.monitor = monitor(stream, true);
    emit(onAudioStream, stream);
    const startMs = performance.now() - session.connectedAt;
    const fragment = { speaker: "agent", text: session.intro.text, start_ms: startMs, end_ms: startMs + audio.duration * 1000 };
    pendingFragments.push({ sessionId: session.id, fragment });
    emit(onTranscript, { speaker: "agent", text: fragment.text, startMs: fragment.start_ms, endMs: fragment.end_ms });
  }

  function endIntro(reason) {
    if (!intro || intro.endedAt) return;
    intro.endedAt = performance.now();
    intro.audio.pause();
    if (intro.monitor) stopMonitor(intro.monitor);
    endPlayback(reason === "interrupted" ? "cancelled" : "ended");
    lastActivity = performance.now();
    lastUserAt = performance.now();
    // Hand the avatar back the session's own voice.
    if (current?.stream) emit(onAudioStream, current.stream);
  }

  // Decides whether a user transcript fragment is the person or the intro echoing back.
  // Returns the fragments to treat as the person's speech.
  function filterIntroEcho(session, fragment) {
    if (!intro || session.previous) return [fragment];
    if (intro.endedAt && performance.now() - intro.endedAt > ECHO_TAIL_MS) {
      intro = null;
      return [fragment];
    }
    intro.pending.push(fragment);
    const words = wordsOf(intro.pending.map((f) => f.text).join(" "));
    const own = words.filter((word) => !intro.words.has(word)).length;
    if (words.length === 0 || own / words.length < OWN_WORDS_SHARE) return [];
    // The person is speaking: stop the intro and let their words through.
    const accepted = intro.pending;
    endIntro("interrupted");
    intro = null;
    return accepted;
  }

  // --- Taking the initiative ---------------------------------------------------------------

  function checkIdle() {
    if (!running || switching || closingForInactivity || !current?.ready || (intro && !intro.endedAt)) return;
    const now = performance.now();
    if (playbackId) lastActivity = now;
    const say = (content) => send(current, { type: "session.commentary.append", delegation_id: null, content });

    // Long inactivity: announce the close, then close after the grace period.
    if (inactiveWarnedAt && now - inactiveWarnedAt >= INACTIVE_GRACE_MS) {
      closingForInactivity = true;
      say("The person still has not reacted. Say in the conversation language, in one or two short sentences, that you are ending the call now because nothing has happened for a while, and that they can simply start again later and you will continue right where you left off. Then stop.");
      setTimeout(() => finish("inactive"), GOODBYE_MS);
      return;
    }
    if (!inactiveWarnedAt && now - lastUserAt >= INACTIVE_WARN_MS && !playbackId) {
      inactiveWarnedAt = now;
      say("The person has not said anything for a while. Kindly say in the conversation language that you will close the call in about 30 seconds if you do not hear from them, and that they can simply start again later and continue right where you left off.");
      return;
    }

    // Short silence: take the initiative.
    if (inactiveWarnedAt || now - lastActivity < IDLE_MS || nudges >= MAX_NUDGES) return;
    nudges += 1;
    lastActivity = now;
    say(
      !languageChosen
        ? "Nobody has answered yet. Warmly ask again, very briefly in German, French, Italian and English, which language they would like, and say they can just start speaking."
        : "The person has been quiet for a while. Take the initiative in the conversation language: ask a light, open question, ask for a core detail that is still open, or pick up something they told you earlier. Keep it short.",
    );
  }


  // --- Questionnaire progress and closing ---------------------------------------------------

  // The server fills the questionnaire from the conversation; Paxi gets a quiet note of
  // what is known and what is still open, so it never asks twice or wraps up too early.
  function startProgress() {
    poller = createProgressPoller({
      baseUrl,
      sessionId: () => current?.id,
      onChanges: (changes) => {
        for (const { fieldId, value, status: answerStatus } of changes) {
          if (answerStatus === "captured" || answerStatus === "declined") emit(onAnswer, { fieldId, value, status: answerStatus });
        }
      },
      onNote: (note) => {
        if (current?.ready) send(current, { type: "session.thinking.append", delegation_id: null, content: note });
      },
    });
  }

  // Paxi sometimes starts to say goodbye while details are still open. Then it gets a
  // spoken nudge to carry on. Once everything is complete, its goodbye ends the call.
  function watchForGoodbye(text) {
    agentTurnText += text;
    clearTimeout(goodbyeTimer);
    goodbyeTimer = setTimeout(() => {
      const said = agentTurnText;
      agentTurnText = "";
      if (!isGoodbye(said) || !running || closingForInactivity) return;
      if (poller?.latest?.complete) {
        closingForInactivity = true;
        setTimeout(() => finish("closed"), GOODBYE_MS);
        return;
      }
      const open = [...(poller?.latest?.open_core ?? []), ...(poller?.latest?.open_extended ?? [])];
      if (!open.length || performance.now() - lastGoodbyeNudge < 20_000) return;
      lastGoodbyeNudge = performance.now();
      send(current, {
        type: "session.commentary.append",
        delegation_id: null,
        content: `You started to say goodbye, but the conversation is not finished yet. Still open: ${open.join(", ")}. Say in a light way that there is just a little more you would love to know, and continue naturally with one of these.`,
      });
    }, 1200);
  }

  // --- Session events ------------------------------------------------------------------

  function handleEvent(session, event) {
    switch (event.type) {
      case "session.started":
        session.ready = true;
        session.connectedAt = performance.now();
        lastActivity = performance.now();
        if (session.intro) playIntro(session);
        // The opening is also in the startup history; this makes the agent speak first.
        else send(session, { type: "session.commentary.append", delegation_id: null, content: session.opening });
        if (session.previous) {
          retire(session.previous);
          switching = false;
        }
        status("connected", session.voice);
        break;
      case "session.input_transcript.delta":
      case "session.output_transcript.delta": {
        // A muted, retiring session may still talk; nobody hears it, so it is not logged.
        if (session.retired || session.audio.muted) break;
        const speaker = event.type === "session.input_transcript.delta" ? "user" : "agent";
        const fragment = { speaker, text: event.delta, start_ms: event.start_ms, end_ms: event.end_ms };
        const accepted = speaker === "user" ? filterIntroEcho(session, fragment) : [fragment];
        for (const f of accepted) {
          lastActivity = performance.now();
          // Breathing or noise tags like "[sniff]" are logged, but do not count as activity.
          if (speaker === "user" && isSpeech(f.text)) {
            nudges = 0;
            lastUserAt = performance.now();
            inactiveWarnedAt = null;
            collectFirstWords(session, f.text);
          }
          if (speaker === "agent") watchForGoodbye(f.text);
          pendingFragments.push({ sessionId: session.id, fragment: f });
          emit(onTranscript, { speaker, text: f.text, startMs: f.start_ms + session.offsetMs, endMs: f.end_ms + session.offsetMs });
        }
        break;
      }
      case "response.event": {
        const inner = event.event;
        const item = inner?.item;
        if (inner?.type !== "response.output_item.done" || item?.type !== "function_call") break;
        if (handledCalls.has(item.call_id)) break;
        handledCalls.add(item.call_id);
        if (item.name === "set_language") handleSetLanguage(session, item);
        break;
      }
      case "session.closed":
        if (session.retired) endRetired(session, event.usage);
        else if (session === current) finish("closed", event.usage);
        break;
      case "error":
        console.error("GPT-Live error", event.error);
        break;
    }
  }

  async function connect({ continueFrom, previous }) {
    const peer = new RTCPeerConnection();
    const audio = new Audio();
    audio.autoplay = true;
    const session = { peer, audio, previous, ready: false, retired: false, ended: false };
    sessions.push(session);

    peer.addEventListener("track", (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      session.stream = stream;
      audio.srcObject = stream;
      audio.play().catch(() => status("error", "Der Browser blockiert die Audiowiedergabe."));
      session.monitor = monitor(stream, true);
      emit(onAudioStream, stream);
    });
    // The same microphone track feeds every session of the conversation.
    for (const track of microphone.getAudioTracks()) peer.addTrack(track, microphone);

    // Create the event channel before the SDP offer.
    session.events = peer.createDataChannel("oai-events");
    session.events.addEventListener("message", ({ data }) => {
      try {
        handleEvent(session, JSON.parse(data));
      } catch (error) {
        console.error("GPT-Live event failed", error);
      }
    });
    session.events.addEventListener("close", () => {
      if (session === current && !finishing && !switching) finish("disconnected");
    });

    try {
      await peer.setLocalDescription(await peer.createOffer());
      await waitForIceGathering(peer);
      const result = await postJson("/api/session", { sdp: peer.localDescription.sdp, continueFrom, resume: previous ? undefined : resumeId });
      Object.assign(session, {
        id: result.session.id,
        voice: result.voice,
        offsetMs: result.offsetMs,
        opening: result.greeting,
        intro: result.intro,
        fallbackGreeting: result.fallbackGreeting,
      });
      conversationId ??= result.conversationId;
      if (result.language) languageChosen = true;
      await peer.setRemoteDescription({ type: "answer", sdp: result.transport.sdp });
      return session;
    } catch (error) {
      peer.close();
      sessions = sessions.filter((s) => s !== session);
      throw error;
    }
  }

  async function finish(reason, usage = null) {
    if (finishing) return;
    finishing = true;
    clearTimeout(closeTimeout);
    clearInterval(flushTimer);
    await flushTranscript();
    if (current?.id) {
      await postJson(`/api/conversations/${current.id}/close`, { status: reason, usage }).catch(console.error);
    }
    cleanup();
    status("ended", reason);
  }

  function cleanup() {
    poller?.stop();
    poller = null;
    clearTimeout(goodbyeTimer);
    agentTurnText = "";
    clearInterval(levelTimer);
    clearTimeout(firstWordsTimer);
    endPlayback("cancelled");
    emit(onAvatarEvent, { type: "activity", state: "idle" });
    microphone?.getTracks().forEach((track) => track.stop());
    for (const session of sessions) {
      clearTimeout(session.closeTimeout);
      session.events?.close();
      session.peer.close();
      session.audio.srcObject = null;
    }
    for (const m of monitors) m.source.disconnect();
    audioContext?.close();
    sessions = [];
    monitors = [];
    current = undefined;
    switching = false;
    running = false;
  }

  return {
    /**
     * Starts a conversation. Call it from a click or tap: browsers require a user action.
     * Pass { resume: conversationId } to continue a conversation that was closed, for
     * example after inactivity; Paxi then picks up where it left off.
     */
    async start({ resume } = {}) {
      if (running) return;
      resumeId = resume ?? null;
      running = true;
      finishing = false;
      conversationId = undefined;
      pendingFragments = [];
      handledCalls = new Set();
      languageChosen = false;
      firstWords = "";
      intro = null;
      nudges = 0;
      lastUserAt = performance.now();
      inactiveWarnedAt = null;
      closingForInactivity = false;
      status("connecting");
      try {
        // Created inside the click, so the browser lets it run.
        audioContext = new AudioContext();
        // Echo cancellation keeps Paxi from hearing its own voice through the speakers,
        // which makes a full-duplex model stop and restart mid-sentence.
        microphone = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        });
        monitor(microphone, false);
        levelTimer = setInterval(checkLevels, 50);
        idleTimer = setInterval(checkIdle, 1000);
        current = await connect({});
        flushTimer = setInterval(flushTranscript, FLUSH_INTERVAL_MS);
        startProgress();
      } catch (error) {
        cleanup();
        status("error", error instanceof Error ? error.message : String(error));
        throw error;
      }
    },

    /** Ends the conversation gracefully; the log is completed on the server. */
    stop() {
      if (!current?.ready) {
        if (running) finish("closed");
        return;
      }
      // Keep media and events alive until session.closed delivers the final usage.
      send(current, { type: "session.close" });
      closeTimeout = setTimeout(() => finish("disconnected"), FINAL_CLOSE_TIMEOUT_MS);
    },

    /** URL of the conversation's JSON log, once the conversation has started. */
    get logUrl() {
      return conversationId ? `${baseUrl}/api/conversations/${conversationId}` : null;
    },

    get running() {
      return running;
    },
  };
}

function waitForIceGathering(connection) {
  if (connection.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      connection.removeEventListener("icegatheringstatechange", onState);
      reject(new Error("ICE-Kandidaten konnten nicht gesammelt werden."));
    }, 10_000);
    function onState() {
      if (connection.iceGatheringState !== "complete") return;
      clearTimeout(timeout);
      connection.removeEventListener("icegatheringstatechange", onState);
      resolve();
    }
    connection.addEventListener("icegatheringstatechange", onState);
  });
}
