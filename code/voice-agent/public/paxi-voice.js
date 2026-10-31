// Paxi voice client: a reusable ES module with no UI of its own. It connects the
// microphone to GPT-Live over WebRTC, runs the backend's tool calls, switches to a
// native voice when the person picks a language, and reports everything through
// callbacks. Avatar events follow code/avatar-prototype/AVATAR-INTERFACE.md.
//
//   const paxi = createPaxiVoice({ onAudioStream, onAvatarEvent, onTranscript, onAnswer, onStatus });
//   button.onclick = () => paxi.start();   // must run from a user action (microphone, audio)
//   paxi.stop();

const FLUSH_INTERVAL_MS = 1000;
const HANDOFF_CLOSE_TIMEOUT_MS = 5000;
const FINAL_CLOSE_TIMEOUT_MS = 15_000;
// Same thresholds as the avatar prototype: GPT-Live has no speech or playback boundary
// events, so activity comes from local audio energy.
const LEVEL_THRESHOLD = 0.015;
const SILENCE_MS = 600;

/**
 * @param {object} options
 * @param {string} [options.baseUrl] Origin of the voice-agent server ("" for same origin).
 * @param {(stream: MediaStream) => void} [options.onAudioStream] The stream the person hears; called again after a voice switch.
 * @param {(event: object) => void} [options.onAvatarEvent] AvatarEvents: activity, playback.
 * @param {(fragment: {speaker: "user"|"agent", text: string, startMs: number, endMs: number}) => void} [options.onTranscript]
 * @param {(answer: {fieldId: string, value: string}) => void} [options.onAnswer] A questionnaire detail was saved.
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

  const emit = (callback, value) => {
    try {
      callback(value);
    } catch (error) {
      console.error("Paxi callback failed", error);
    }
  };
  const status = (state, detail) => emit(onStatus, { state, detail, conversationId });

  async function postJson(path, body) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok && response.status !== 204) throw new Error(await response.text());
    return response.status === 204 ? null : response.json();
  }

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

  async function handleSaveAnswer(session, item) {
    let output;
    try {
      const args = JSON.parse(item.arguments);
      output = await postJson(`/api/conversations/${session.id}/answers`, { ...args, call_id: item.call_id });
      if (output.saved) emit(onAnswer, { fieldId: output.field_id, value: output.value });
    } catch (error) {
      console.error("save_answer failed", error);
      output = { saved: false, reason: "Technischer Fehler beim Speichern." };
    }
    returnToolResult(session, item.call_id, output);
  }

  async function handleSetLanguage(session, item) {
    let result;
    try {
      result = await postJson(`/api/conversations/${session.id}/language`, JSON.parse(item.arguments));
    } catch (error) {
      console.error("set_language failed", error);
      result = { ok: false };
    }
    if (!result.ok || !result.switch_voice || switching) {
      // This voice already fits (or the switch failed): carry on in this session.
      returnToolResult(session, item.call_id, { ok: result.ok, language: result.language });
      return;
    }
    switchVoice(session, item.call_id, result.voice);
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
      returnToolResult(previous, callId, { ok: false, reason: "voice switch failed, continue in this voice" });
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

  // --- Welcome ---------------------------------------------------------------------------

  // The server plays the recorded welcome through the session; if that fails, Paxi says it live.
  async function playWelcome(session) {
    try {
      const result = await postJson(`/api/conversations/${session.id}/welcome`, {});
      const startMs = performance.now() - session.connectedAt;
      emit(onTranscript, { speaker: "agent", text: result.text, startMs, endMs: startMs + result.durationMs });
    } catch (error) {
      console.error("Welcome recording failed", error);
      send(session, { type: "session.commentary.append", delegation_id: null, content: session.fallbackGreeting });
    }
  }

  // --- Session events ------------------------------------------------------------------

  function handleEvent(session, event) {
    switch (event.type) {
      case "session.started":
        session.ready = true;
        session.connectedAt = performance.now();
        if (session.welcome) playWelcome(session);
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
        pendingFragments.push({
          sessionId: session.id,
          fragment: { speaker, text: event.delta, start_ms: event.start_ms, end_ms: event.end_ms },
        });
        emit(onTranscript, {
          speaker,
          text: event.delta,
          startMs: event.start_ms + session.offsetMs,
          endMs: event.end_ms + session.offsetMs,
        });
        break;
      }
      case "response.event": {
        const inner = event.event;
        const item = inner?.item;
        if (inner?.type !== "response.output_item.done" || item?.type !== "function_call") break;
        if (handledCalls.has(item.call_id)) break;
        handledCalls.add(item.call_id);
        if (item.name === "save_answer") handleSaveAnswer(session, item);
        else if (item.name === "set_language") handleSetLanguage(session, item);
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
      const result = await postJson("/api/session", { sdp: peer.localDescription.sdp, continueFrom });
      Object.assign(session, {
        id: result.session.id,
        voice: result.voice,
        offsetMs: result.offsetMs,
        opening: result.greeting,
        welcome: result.welcome,
        fallbackGreeting: result.fallbackGreeting,
      });
      conversationId ??= result.conversationId;
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
    clearInterval(levelTimer);
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
    /** Starts a conversation. Call it from a click or tap: browsers require a user action. */
    async start() {
      if (running) return;
      running = true;
      finishing = false;
      conversationId = undefined;
      pendingFragments = [];
      handledCalls = new Set();
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
        current = await connect({});
        flushTimer = setInterval(flushTranscript, FLUSH_INTERVAL_MS);
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
