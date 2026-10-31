// PROTOTYPE — GPT-Live (WebRTC) → the existing AvatarEvents contract.
// sessionUrl exchanges SDP on the backend; the API key stays there.
const MODEL_EMOTIONS = ["neutral", "happy", "empathetic", "concerned", "surprised", "celebrating"];

export async function connectOpenAIRealtime({ sessionUrl, audioElement, onAudioStream, onAvatarEvent, onTranscript, onLog = () => {} }) {
  const logged = new Set();
  const log = (message) => { try { onLog(message); } catch {} };
  const logOnce = (message) => {
    if (logged.has(message)) return;
    logged.add(message); log(message);
  };
  const actions = {
    show_pension_picture: async () => { log("Demo action: show_pension_picture"); return "Das Vorsorgebild wurde nur als Demo angefordert; es wurde kein Bild angezeigt."; },
    request_human_advisor: async () => { log("Demo action: request_human_advisor"); return "Der menschliche Berater wurde nur als Demo angefordert; es wurde niemand kontaktiert."; },
  };
  const delegations = new Map();
  const directions = Object.fromEntries(["session.input_transcript.delta", "session.output_transcript.delta"].map((type) => [type, { index: 0, applied: 0, events: new Map() }]));
  const pc = new RTCPeerConnection();
  const dc = pc.createDataChannel("oai-events");
  const context = new AudioContext();
  let mic, timer, closeTimer, readyTimer, playing = false, sequence = 0, closed = false, started = false;
  let playbackId = `live-${crypto.randomUUID()}-${sequence}`;
  const monitors = [];
  const send = (event) => {
    try {
      if (dc.readyState !== "open" || closed) { logOnce("Live data channel unavailable; update ignored"); return false; }
      dc.send(JSON.stringify(event)); return true;
    } catch { logOnce("Live update could not be sent; conversation continues"); return false; }
  };
  const finishDelegation = (id, content) => {
    const task = delegations.get(id);
    if (!task || task.answered) return;
    task.answered = true;
    clearTimeout(task.timer);
    send({ type: "session.commentary.append", event_id: `result-${crypto.randomUUID()}`, delegation_id: id, content });
  };
  const failedAction = "Das konnte ich gerade nicht ausführen. Wir können das Gespräch fortsetzen.";
  const runAction = async (id, choice) => {
    const task = delegations.get(id);
    if (!task || task.running || task.answered) return;
    task.running = true;
    let timeout;
    try {
      const content = choice === "none" ? "Keine Aktion erforderlich." : await Promise.race([
        Promise.resolve().then(() => actions[choice]()),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("action timed out")), 3000); }),
      ]);
      finishDelegation(id, content);
    } catch { logOnce("Decision action failed or timed out; conversation continues"); finishDelegation(id, failedAction); }
    finally { clearTimeout(timeout); }
  };
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // Attach a handler immediately: startup can fail before SDP exchange finishes.
  ready.catch(() => {});
  const playback = (event) => onAvatarEvent({ type: "playback", event, playbackId, replyId: playbackId });
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer); clearTimeout(closeTimer); clearTimeout(readyTimer);
    delegations.forEach((task) => clearTimeout(task.timer));
    if (playing) playback("cancelled");
    mic?.getTracks().forEach((track) => track.stop());
    monitors.forEach(({ source }) => source.disconnect());
    pc.close(); context.close(); audioElement.srcObject = null;
    onAvatarEvent({ type: "activity", state: "idle" });
  };
  const monitor = (stream, output) => {
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    monitors.push({ source, analyser, samples: new Float32Array(analyser.fftSize), output, active: false, lastSound: 0 });
  };
  pc.ontrack = ({ track, streams }) => {
    const stream = streams[0] || new MediaStream([track]);
    audioElement.srcObject = stream;
    audioElement.play().catch(() => onLog("Select audio playback if your browser blocks autoplay"));
    onAudioStream?.(stream);
    monitor(stream, true);
  };
  dc.onopen = () => log("data channel open");
  dc.onclose = () => { if (!started) rejectReady(new Error("Live data channel closed before startup")); cleanup(); };
  dc.onmessage = ({ data }) => {
    try {
      const ev = JSON.parse(data);
      if (!ev || typeof ev.type !== "string") { logOnce("Malformed Live event ignored"); return; }
      const direction = directions[ev.type];
      if (direction) {
        if (typeof ev.event_id !== "string" || typeof ev.delta !== "string") { logOnce("Malformed transcript ignored"); return; }
        if (!direction.events.has(ev.event_id)) direction.events.set(ev.event_id, { index: ++direction.index, playbackId });
        if (ev.type === "session.output_transcript.delta") onTranscript?.(ev.delta, playbackId);
        return;
      }
      switch (ev.type) {
        case "session.started":
          started = true; log("session.started (gpt-live-1)"); resolveReady();
          break;
        case "session.delegation.created": {
          const id = ev.delegation?.id;
          if (typeof id !== "string") { logOnce("Malformed delegation ignored"); break; }
          if (!delegations.has(id)) {
            const task = { answered: false, running: false };
            delegations.set(id, task);
            task.timer = setTimeout(() => {
              logOnce("Decision did not finish; conversation continues");
              finishDelegation(id, failedAction);
            }, 10000);
          }
          break;
        }
        case "decision.event": {
          const event = ev.event;
          const task = delegations.get(ev.delegation_id);
          if (!event || typeof event.type !== "string") {
            logOnce("Malformed decision ignored");
            if (task) finishDelegation(ev.delegation_id, failedAction);
            break;
          }
          if (event.type !== "decision.completed") {
            if (/failed|incomplete|cancelled|error/.test(event.type)) {
              logOnce(`Decision ${event.type} ignored`);
              if (task) finishDelegation(ev.delegation_id, failedAction);
            }
            break;
          }
          const answers = event.decision?.answers;
          if (!Array.isArray(answers) || (event.decision.status && event.decision.status !== "completed")) {
            logOnce("Missing or incomplete decision answers ignored");
            if (task) finishDelegation(ev.delegation_id, failedAction);
            break;
          }
          if (ev.delegation_id != null) {
            if (!task) { logOnce("Unknown decision delegation ignored"); break; }
            const answer = answers.find((a) => a?.type === "choice" && a.name === "ui_action");
            if (!answer || !["show_pension_picture", "request_human_advisor", "none"].includes(answer.choice)) {
              logOnce("Invalid action answer ignored"); finishDelegation(ev.delegation_id, failedAction); break;
            }
            void runAction(ev.delegation_id, answer.choice);
          } else {
            const direction = directions[ev.source_event_type];
            const source = direction?.events.get(ev.source_event_id);
            const name = ev.source_event_type === "session.input_transcript.delta" ? "reply_emotion" : "emotion";
            const answer = answers.find((a) => a?.type === "choice" && a.name === name);
            if (!source || !answer || !MODEL_EMOTIONS.includes(answer.choice)) { logOnce("Invalid emotion answer or source ignored"); break; }
            if (source.index <= direction.applied) { logOnce("Stale emotion answer ignored"); break; }
            direction.applied = source.index;
            onAvatarEvent({ type: "emotion", emotion: answer.choice, playbackId: source.playbackId });
            log(`emotion trigger (${name}): ${answer.choice}`);
          }
          break;
        }
        case "session.closed":
          log("session.closed"); cleanup();
          break;
        case "error":
          logOnce(`Live error (conversation continues): ${ev.error?.message || ev.message || "unknown error"}`);
          if (ev.delegation_id) finishDelegation(ev.delegation_id, failedAction);
          break;
        default:
          logOnce(`Live event ignored: ${ev.type}`);
      }
    } catch { logOnce("Malformed Live message or callback failure ignored"); }
  };

  try {
    await context.resume();
    mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    pc.addTrack(mic.getAudioTracks()[0], mic);
    monitor(mic, false);
    // shortcut: Live has no speech/playback boundary events; silence splits local audio into segments.
    // Pauses and interruptions are indistinguishable here; use ended, never invent a server cancellation.
    timer = setInterval(() => {
      const now = performance.now();
      for (const m of monitors) {
        m.analyser.getFloatTimeDomainData(m.samples);
        const rms = Math.sqrt(m.samples.reduce((sum, n) => sum + n * n, 0) / m.samples.length);
        if (rms > 0.015) {
          m.lastSound = now;
          if (!m.active) {
            m.active = true;
            if (m.output) { playing = true; playback("started"); }
            else onAvatarEvent({ type: "activity", state: "listening" });
          }
        } else if (m.active && now - m.lastSound > 600) {
          m.active = false;
          if (m.output) { playback("ended"); playing = false; playbackId = `${playbackId.slice(0, playbackId.lastIndexOf("-"))}-${++sequence}`; }
          else onAvatarEvent({ type: "activity", state: "thinking" });
        }
      }
    }, 50);
    await pc.setLocalDescription(await pc.createOffer());
    if (pc.iceGatheringState !== "complete") {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { pc.removeEventListener("icegatheringstatechange", changed); reject(new Error("ICE gathering timed out")); }, 10000);
        function changed() {
          if (pc.iceGatheringState !== "complete") return;
          clearTimeout(timeout); pc.removeEventListener("icegatheringstatechange", changed); resolve();
        }
        pc.addEventListener("icegatheringstatechange", changed);
        changed();
      });
    }
    const response = await fetch(sessionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sdp: pc.localDescription.sdp }),
    });
    if (!response.ok) throw new Error(`${sessionUrl} ${response.status}: ${await response.text()}`);
    if (response.headers.get("X-Avatar-Decisions") === "disabled") log("emotions/actions disabled; voice continues");
    const result = await response.json();
    await pc.setRemoteDescription({ type: "answer", sdp: result.transport.sdp });
    readyTimer = setTimeout(() => rejectReady(new Error("Live session startup timed out")), 60000);
    await ready;
    clearTimeout(readyTimer);
    return {
      close() {
        send({ type: "session.close" });
        mic.getTracks().forEach((track) => track.stop());
        closeTimer = setTimeout(cleanup, 5000);
      },
    };
  } catch (error) { cleanup(); throw error; }
}
