// Paxi voice client: a reusable ES module with no UI of its own. It connects the
// microphone to GPT-Live over WebRTC, runs the backend's tool calls, switches to a
// native voice when the person picks a language, and reports everything through
// callbacks. Avatar events follow code/avatar-prototype/AVATAR-INTERFACE.md.
//
//   const paxi = createPaxiVoice({ onAudioStream, onAvatarEvent, onTranscript, onAnswer, onStatus });
//   button.onclick = () => paxi.start();   // must run from a user action (microphone, audio)
//   paxi.stop();

import { createProgressPoller, isGoodbye, isSpeech, postJson as post, withoutForeignScript, wordsOf } from "./paxi-common.js";

const FLUSH_INTERVAL_MS = 1000;
// Reply emotions the avatar knows (ReplyEmotion in code/avatar-prototype/pax-avatar.d.ts).
const REPLY_EMOTIONS = ["neutral", "acknowledging", "curious", "explaining", "shocked", "empathetic", "pleased", "recovering", "presenting_offer"];
const EMOTION_QUESTIONS = { "session.input_transcript.delta": "reply_emotion", "session.output_transcript.delta": "emotion" };
const HANDOFF_CLOSE_TIMEOUT_MS = 5000;
const FINAL_CLOSE_TIMEOUT_MS = 15_000;
// Same thresholds as the avatar prototype: GPT-Live has no speech or playback boundary
// events, so activity comes from local audio energy.
const LEVEL_THRESHOLD = 0.015;
const SILENCE_MS = 600;
// Pause after the person's first words before their language is detected.
const FIRST_WORDS_PAUSE_MS = 700;
// At most one note about misread foreign-script words per this interval.
const FOREIGN_NOTE_GAP_MS = 15_000;
// Charts can change several times in a row (each recalculation); only the latest counts.
const VISUAL_UPDATE_DEBOUNCE_MS = 1200;
// After an end request, the call closes at the latest after this, even without a goodbye.
const END_FALLBACK_MS = 15_000;
// A confirmation question counts as presented once Paxi said this share of its words.
const QUESTION_COVERAGE = 0.85;
// Pause after the person's answer to a confirmation question before it counts as final.
const ANSWER_PAUSE_MS = 1200;
// A confirmation question that was not fully played by then is cancelled.
const QUESTION_TIMEOUT_MS = 30_000;
// The question is sent once Paxi has been quiet this long, and sent again after this if Paxi did not start it.
const QUESTION_QUIET_MS = 500;
const QUESTION_RETRY_MS = 5000;
// GPT-Live has no event to cancel an answer in progress; an appended instruction interrupts the
// model's current speech (Live delegation guide, "direction to stop speaking").
const STOP_INSTRUCTION =
  "The person just asked you to stop talking. Stop speaking right away and do not continue, finish or repeat what you were saying. This applies only to what you were saying at this moment: when the person speaks again, answer them normally.";
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
// The intro gets quieter the moment the microphone hears a voice clearly louder than the
// intro's own echo (measured during its first second), long before the transcript arrives.
// If the transcript does not confirm the person's own words, the volume comes back.
const ECHO_CALIBRATION_MS = 1200;
const VOICE_OVER_ECHO = 2.5;
const MIN_VOICE_LEVEL = 0.02;
const DUCKED_VOLUME = 0.2;
const DUCK_RELEASE_MS = 2500;

/**
 * @param {object} options
 * @param {string} [options.baseUrl] Origin of the voice-agent server ("" for same origin).
 * @param {string} [options.caseLink] Link ID from /api/case-link: Paxi then proposes what it hears to that case.
 * @param {(stream: MediaStream) => void} [options.onAudioStream] The stream the person hears; called again after a voice switch.
 * @param {(event: object) => void} [options.onAvatarEvent] AvatarEvents: activity, playback.
 * @param {(fragment: {speaker: "user"|"agent", text: string, startMs: number, endMs: number}) => void} [options.onTranscript]
 * @param {(answer: {fieldId: string, value: string|null, status: "captured"|"declined"}) => void} [options.onAnswer]
 *   A questionnaire detail was saved, or the person declined it (a Pax colleague follows up).
 * @param {(status: {state: "connecting"|"connected"|"switching"|"ended"|"error", detail?: string, conversationId?: string}) => void} [options.onStatus]
 */
export function createPaxiVoice({
  baseUrl = "",
  caseLink,
  onAudioStream = () => {},
  onAvatarEvent = () => {},
  onTranscript = () => {},
  onAnswer = () => {},
  onStatus = () => {},
  onConfirmation = () => {},
  onServerLost = () => {},
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
  let muted = false; // the person muted their microphone
  let silenced = false; // the person asked Paxi to stop talking, until they speak again
  let lastActivity = 0;
  let nudges = 0;
  let idleTimer;
  let lastUserAt = 0;
  let inactiveWarnedAt = null;
  let closingForInactivity = false;
  let resumeId = null;
  let startPriorities;
  let poller = null;
  let agentTurnText = "";
  let goodbyeTimer;
  let closeAfterGoodbye = null;
  let userTurnText = "";
  let userGoodbyeTimer;
  let personSaidGoodbye = false;
  let foreignNoteAt = -Infinity;
  let pendingSteering = []; // steering commands waiting for the conversation language and a ready session
  let agenda = []; // topics and visuals Paxi turns to after the current exchange, in order
  let agendaReminded = false; // one reminder per answer of the person
  const visualUpdates = new Map(); // visual ID -> pending debounced update
  let ending = false; // the app or backend asked Paxi to end the call
  let endTimer;
  let conversationLanguage = null;
  let sentFragments = []; // everything posted, to rebuild the conversation after a server restart
  let serverLost = false;
  let confirmation = null; // the open confirmation question (VOICE-08)

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
        sentFragments.push(...entries);
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

  // The ID the next audible segment will get, so emotions that arrive early can be tied to it.
  function upcomingPlaybackId() {
    return playbackId ?? `paxi-${conversationId ?? "call"}-${playbackSequence + 1}`;
  }

  function endPlayback(event) {
    if (!playbackId) return;
    const ended = playbackId;
    emit(onAvatarEvent, { type: "playback", event, playbackId });
    playbackId = null;
    confirmationPlaybackEnded(event, ended);
  }

  function checkLevels() {
    const now = performance.now();
    for (const m of monitors) {
      m.analyser.getFloatTimeDomainData(m.samples);
      const rms = Math.sqrt(m.samples.reduce((sum, n) => sum + n * n, 0) / m.samples.length);
      if (!m.output) duckIntroOnVoice(rms, now);
      if (rms > LEVEL_THRESHOLD) {
        m.lastSound = now;
        // Only Paxi's voice keeps the conversation "active"; microphone noise does not.
        if (m.output) lastActivity = now;
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
    if (result.ok) {
      languageChosen = true;
      conversationLanguage = result.language;
    }
    if (!result.ok || !result.switch_voice || switching) {
      // This voice already fits (or the switch failed): carry on in this session.
      returnToolResult(session, item.call_id, { ok: result.ok, language: result.language });
      flushSteering();
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
    conversationLanguage = result.language;
    if (result.switch_voice && !switching) switchVoice(session, null, result.voice);
    else flushSteering();
  }

  // --- Voice switch -------------------------------------------------------------------

  // Hands the conversation to a new session with the native voice. The old session
  // is muted right away so the person never hears the wrong voice in the new language.
  async function switchVoice(previous, callId, voice) {
    cancelConfirmation("new_question");
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
    intro = { audio, words, session, endedAt: null, pending: [], startedAt: performance.now(), echoLevel: 0, duckedAt: null };
    audio.addEventListener("ended", () => endIntro("ended"));
    // The recorded welcome is a warm greeting; the avatar shows it as soon as it is audible.
    emit(onAvatarEvent, { type: "emotion", emotion: "pleased", playbackId: upcomingPlaybackId() });
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
    intro.startMs = performance.now() - session.connectedAt;
    emit(onTranscript, { speaker: "agent", text: session.intro.text, startMs: intro.startMs, endMs: intro.startMs });
  }

  function endIntro(reason) {
    if (!intro || intro.endedAt) return;
    intro.endedAt = performance.now();
    intro.audio.pause();
    // Logged with the time it really played, so the next turn is not merged into it.
    if (intro.startMs !== undefined) {
      const fragment = {
        speaker: "agent",
        text: intro.session.intro.text,
        start_ms: intro.startMs,
        end_ms: intro.endedAt - intro.session.connectedAt,
      };
      pendingFragments.push({ sessionId: intro.session.id, fragment });
    }
    if (intro.monitor) stopMonitor(intro.monitor);
    endPlayback(reason === "interrupted" ? "cancelled" : "ended");
    lastActivity = performance.now();
    lastUserAt = performance.now();
    // Hand the avatar back the session's own voice.
    if (current?.stream) emit(onAudioStream, current.stream);
  }

  function duckIntroOnVoice(rms, now) {
    if (!intro || intro.endedAt) return;
    if (now - intro.startedAt < ECHO_CALIBRATION_MS) {
      intro.echoLevel = Math.max(intro.echoLevel, rms);
      return;
    }
    if (rms > Math.max(MIN_VOICE_LEVEL, intro.echoLevel * VOICE_OVER_ECHO)) {
      if (!intro.duckedAt) intro.audio.volume = DUCKED_VOLUME;
      intro.duckedAt = now;
    } else if (intro.duckedAt && now - intro.duckedAt > DUCK_RELEASE_MS) {
      intro.duckedAt = null;
      intro.audio.volume = 1;
    }
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
    // Noise tags like "[clear throat]" never stop the intro.
    const words = wordsOf(intro.pending.map((f) => f.text).join(" ").replace(/\[[^\]]*\]?/g, " "));
    const own = words.filter((word) => !intro.words.has(word)).length;
    if (words.length === 0 || own / words.length < OWN_WORDS_SHARE) return [];
    // The person is speaking: stop the intro and let their words through.
    const accepted = intro.pending;
    endIntro("interrupted");
    intro = null;
    return accepted;
  }

  // --- Languages and visuals -----------------------------------------------------------------

  // The person's words were transcribed partly in another script: most likely noise or echo.
  // Paxi hears the same, so a quiet note keeps it in its four languages.
  function foreignScriptHeard(session) {
    const now = performance.now();
    if (session !== current || !session.ready || now - foreignNoteAt < FOREIGN_NOTE_GAP_MS) return;
    foreignNoteAt = now;
    send(session, {
      type: "session.thinking.append",
      delegation_id: null,
      content: languageChosen
        ? "The transcript just picked up words in another language or script. That was noise or echo, not the person: do not react to it and never switch to that language. Stay in the conversation language; if you missed something, briefly ask the person to repeat it."
        : "The transcript just picked up words in another language or script. That was noise or echo, not the person. You only speak German, French, Italian and English: wait for the person to answer in one of them.",
    });
  }

  // --- Steering: topics, visuals, priorities and ending from the app or backend -------------

  // Notes wait until the language is chosen and the voice switch is done, so they reach the
  // session the person hears. Agenda items (a topic, a new or changed visual) are then brought
  // up one by one after the current exchange: see remindOfAgenda.
  function flushSteering() {
    if (!pendingSteering.length || !languageChosen || switching || !current?.ready || (intro && !intro.endedAt)) return;
    for (const command of pendingSteering) {
      send(current, { type: "session.thinking.append", delegation_id: null, content: command.note });
      if (command.type === "agenda") agenda = [...agenda.filter((item) => item.id !== command.id), command];
      if (command.type === "drop") agenda = agenda.filter((item) => item.id !== command.id);
    }
    pendingSteering = [];
  }

  function applyCommand(command) {
    if (!command || !running) return;
    if (command.type === "end") return endOnRequest(command);
    if (command.type === "stop_speaking") return this_.stopSpeaking();
    if (!command.note) return;
    // A newer command for the same topic or visual replaces one that is still waiting.
    if (command.id) pendingSteering = pendingSteering.filter((item) => item.id !== command.id);
    pendingSteering.push(command);
    flushSteering();
  }

  // The person answers: that ends the current exchange, so Paxi's reply turns to the next
  // agenda item. Sent while they are still talking, so it arrives before Paxi answers.
  function remindOfAgenda() {
    if (agendaReminded || confirmation || !agenda.length || !current?.ready) return;
    agendaReminded = true;
    send(current, { type: "session.thinking.append", delegation_id: null, content: agenda.shift().reminder });
  }

  // The app or backend ends the call: Paxi says a short goodbye first unless told otherwise.
  function endOnRequest(command) {
    if (!running || ending) return;
    ending = true;
    agenda = [];
    pendingSteering = [];
    cancelConfirmation("cancelled_by_customer");
    if (!command.goodbye || !current?.ready) {
      this_.stop();
      return;
    }
    if (silenced) {
      silenced = false;
      current.audio.muted = false;
    }
    send(current, { type: "session.commentary.append", delegation_id: null, content: command.note });
    endTimer = setTimeout(() => this_.stop(), END_FALLBACK_MS);
  }

  async function sendSteer(command) {
    const result = await postJson(`/api/conversations/${current.id}/steer`, command);
    applyCommand(result.command);
    return result;
  }

  // --- Confirmation questions (VOICE-08) -----------------------------------------------------

  // The customer app created a confirmation (POST /api/cases/:id/customer-confirmations). Paxi
  // says exactly its question; the app hears back when it was really played to the end
  // ("presented"), what the person answered ("answer"), or that it was cancelled. The app
  // makes the backend calls: only it holds the customer session.
  function askConfirmation({ confirmationId, questionText, questionReplyId }) {
    cancelConfirmation("new_question");
    const report = (event) => emit(onConfirmation, { confirmationId, questionReplyId, ...event });
    if (!current?.ready || switching || ending) return report({ event: "cancelled", reason: "new_question", detail: "not_connected" });
    // Commentary is limited to 500 tokens; longer questions belong on the screen.
    if (questionText.length > 1500) return report({ event: "cancelled", reason: "new_question", detail: "too_long" });
    confirmation = { confirmationId, questionText, questionReplyId, report, state: "waiting", said: "", playbackId: null, answer: "", timer: null, quietSince: null, tries: 0 };
    const open = confirmation;
    open.timer = setTimeout(() => cancelConfirmation("new_question", "not_played"), QUESTION_TIMEOUT_MS);
    agendaReminded = true; // no agenda item may take over this turn
    // Paxi ignores the request while it is still talking (it then waits for an answer to its own
    // question), so the question goes out once Paxi has been quiet briefly, and once more if
    // Paxi does not start it.
    open.poll = setInterval(() => {
      if (confirmation !== open) return clearInterval(open.poll);
      if (open.state !== "waiting") return;
      const now = performance.now();
      if (playbackId || !current?.ready || now - lastUserAt < QUESTION_QUIET_MS) {
        open.quietSince = null;
        return;
      }
      open.quietSince ??= now;
      if (now - open.quietSince < QUESTION_QUIET_MS || (open.sentAt && now - open.sentAt < QUESTION_RETRY_MS)) return;
      if (open.tries >= 2) return;
      open.tries += 1;
      open.sentAt = now;
      send(current, {
        type: "session.commentary.append",
        delegation_id: null,
        content: `Ask the person this confirmation question now. Read it word for word, exactly as written and in this language, with nothing before or after it. Then stop and wait for their answer:\n"${questionText}"`,
      });
    }, 100);
  }

  function cancelConfirmation(reason, detail) {
    if (!confirmation) return;
    const { report, timer, poll } = confirmation;
    clearTimeout(timer);
    clearInterval(poll);
    confirmation = null;
    report({ event: "cancelled", reason, ...(detail ? { detail } : {}) });
  }

  const coverage = (said, question) => {
    const heard = new Set(wordsOf(said));
    const words = wordsOf(question);
    return words.length ? words.filter((word) => heard.has(word)).length / words.length : 0;
  };

  // Paxi's words while the question is open: they belong to the question turn.
  function confirmationAgentFragment(fragment) {
    if (!confirmation) return;
    if (confirmation.state === "awaiting_answer") {
      // Paxi moves on before the person answered: the question no longer applies.
      if (!confirmation.answer && isSpeech(fragment.text)) cancelConfirmation("new_question", "paxi_continued");
      return;
    }
    // Paxi is still finishing what it said before the question was sent.
    if (confirmation.state === "waiting" && !confirmation.sentAt) return;
    clearInterval(confirmation.poll);
    confirmation.state = "playing";
    confirmation.said += fragment.text;
    confirmation.playbackId = upcomingPlaybackId();
    fragment.reply_id = confirmation.questionReplyId;
  }

  // Playback of a segment ended. Only a complete, uninterrupted question counts as presented.
  function confirmationPlaybackEnded(event, id) {
    if (confirmation?.state !== "playing" || id !== confirmation.playbackId) return;
    if (event !== "ended") return cancelConfirmation("cancelled_by_customer", "interrupted");
    if (coverage(confirmation.said, confirmation.questionText) < QUESTION_COVERAGE) return; // a pause mid-question
    // The transcript can run ahead of the audio: wait briefly whether another segment follows.
    confirmation.state = "settling";
    const open = confirmation;
    setTimeout(() => {
      if (confirmation !== open || open.state !== "settling") return;
      if (playbackId) {
        open.state = "playing";
        open.playbackId = playbackId;
        return;
      }
      clearTimeout(open.timer);
      open.state = "awaiting_answer";
      open.report({ event: "presented", playback: { playbackId: id, event: "ended" }, spokenText: open.said.trim() });
    }, SILENCE_MS);
  }

  // The person's words while the question is open: an interruption, or the answer.
  function confirmationUserFragment(text) {
    if (!confirmation) return;
    // Still waiting to ask: the person answers Paxi's previous question; ask afterwards.
    if (confirmation.state === "waiting" && !confirmation.sentAt) return;
    if (confirmation.state !== "awaiting_answer") return cancelConfirmation("cancelled_by_customer", "interrupted");
    confirmation.answer += text;
    clearTimeout(confirmation.timer);
    confirmation.timer = setTimeout(() => {
      const { report, answer } = confirmation;
      confirmation = null;
      report({ event: "answer", text: answer.trim(), locale: conversationLanguage ?? "de", transcriptStatus: "final" });
    }, ANSWER_PAUSE_MS);
  }

  // --- Taking the initiative ---------------------------------------------------------------

  function checkIdle() {
    if (!running || switching || closingForInactivity || ending || confirmation || !current?.ready || (intro && !intro.endedAt)) return;
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
    if (languageChosen && agenda.length) {
      say(agenda.shift().nudge);
      return;
    }
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
        if (current?.ready && !ending) send(current, { type: "session.thinking.append", delegation_id: null, content: note });
      },
      onStop: () => {
        poller?.stop();
        if (running && !finishing) this_.stop();
      },
      onCommands: (commands) => commands.forEach(applyCommand),
      onLost: () => {
        if (serverLost || !running) return;
        serverLost = true;
        emit(onServerLost, { conversationId, linked: Boolean(caseLink) });
      },
    });
  }

  // A goodbye is final. When Paxi says goodbye, the call ends after the farewell, even if
  // details are still open (they go to a Pax colleague). When the person says goodbye,
  // Paxi only says goodbye too. Reopening the conversation after a farewell feels wrong.
  // Only if the person keeps talking about something else does the conversation go on.
  function watchForGoodbye(text) {
    agentTurnText += text;
    clearTimeout(goodbyeTimer);
    goodbyeTimer = setTimeout(() => {
      const said = agentTurnText;
      agentTurnText = "";
      if (!isGoodbye(said) || !running || closingForInactivity) return;
      closingForInactivity = true;
      closeAfterGoodbye = setTimeout(() => finish("closed"), GOODBYE_MS);
    }, 1200);
  }

  function watchUserForGoodbye(text) {
    userTurnText += text;
    clearTimeout(userGoodbyeTimer);
    userGoodbyeTimer = setTimeout(() => {
      const said = userTurnText;
      userTurnText = "";
      if (!running) return;
      if (!isGoodbye(said)) {
        // The person kept talking after a farewell: the conversation goes on.
        if (closeAfterGoodbye && !ending) {
          clearTimeout(closeAfterGoodbye);
          closeAfterGoodbye = null;
          closingForInactivity = false;
        }
        return;
      }
      if (personSaidGoodbye) return;
      personSaidGoodbye = true;
      send(current, {
        type: "session.commentary.append",
        delegation_id: null,
        content:
          "The person is saying goodbye. Do not ask anything else, not even a small question. Thank them warmly in one or two sentences, say that a colleague of yours will look at your proposals and the open points and get in touch with an assessment, and say goodbye.",
      });
    }, 800);
  }


  // --- Avatar emotions -----------------------------------------------------------------------

  // GPT-Live classifies each transcript fragment (session.triggers on the server). Results can
  // arrive late or out of order, so per direction only newer fragments than the last applied
  // one count. Invalid or failed answers leave the face as it is (AVATAR-INTERFACE.md).
  function handleEmotion(session, envelope) {
    if (envelope.delegation_id != null || session.retired || session.audio.muted) return;
    const result = envelope.event;
    if (result?.type !== "decision.completed") return;
    const direction = session.emotionSources[envelope.source_event_type];
    const source = direction?.events.get(envelope.source_event_id);
    if (!source || source.index <= direction.applied) return;
    const name = EMOTION_QUESTIONS[envelope.source_event_type];
    const answer = result.decision?.answers?.find((a) => a?.type === "choice" && a.name === name);
    if (!answer || !REPLY_EMOTIONS.includes(answer.choice)) return;
    direction.applied = source.index;
    emit(onAvatarEvent, { type: "emotion", emotion: answer.choice, playbackId: source.playbackId });
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
        if (muted) send(session, { type: "session.input_audio.mute" });
        flushSteering();
        status("connected", session.voice);
        break;
      case "session.input_transcript.delta":
      case "session.output_transcript.delta": {
        // Remember which playback segment this fragment belongs to, for its emotion result.
        const direction = session.emotionSources[event.type];
        if (event.event_id && !direction.events.has(event.event_id)) {
          direction.events.set(event.event_id, { index: ++direction.index, playbackId: upcomingPlaybackId() });
        }
        const speaker = event.type === "session.input_transcript.delta" ? "user" : "agent";
        // A muted, retiring session may still talk; nobody hears it, so its words are not
        // logged. The person's words are kept: they keep talking while the voice switches.
        if (speaker === "agent" && (session.retired || session.audio.muted)) break;
        // Words in another script are noise the transcription misread; they never choose a language.
        const text = speaker === "user" ? withoutForeignScript(event.delta) : event.delta;
        if (text !== event.delta) foreignScriptHeard(session);
        if (!text.trim()) break;
        const fragment = { speaker, text, start_ms: event.start_ms, end_ms: event.end_ms };
        const accepted = speaker === "user" ? filterIntroEcho(session, fragment) : [fragment];
        for (const f of accepted) {
          lastActivity = performance.now();
          // Breathing or noise tags like "[sniff]" are logged, but do not count as activity.
          if (speaker === "user" && isSpeech(f.text)) {
            // Paxi may talk again once the person said something after "stop speaking".
            if (silenced && current) {
              silenced = false;
              current.audio.muted = false;
              // The stop instruction only meant that one answer.
              send(current, { type: "session.thinking.append", delegation_id: null, content: "The person is talking to you again after asking you to stop. Listen and answer what they say now, normally." });
            }
            nudges = 0;
            lastUserAt = performance.now();
            inactiveWarnedAt = null;
            collectFirstWords(session, f.text);
            if (session === current && languageChosen && !switching) {
              confirmationUserFragment(f.text);
              remindOfAgenda();
            }
            watchUserForGoodbye(f.text);
          }
          if (speaker === "agent") {
            agendaReminded = false;
            if (session === current) confirmationAgentFragment(f);
            watchForGoodbye(f.text);
          }
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
      case "decision.event":
        handleEmotion(session, event);
        break;
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
    const session = {
      peer,
      audio,
      previous,
      ready: false,
      retired: false,
      ended: false,
      emotionSources: Object.fromEntries(Object.keys(EMOTION_QUESTIONS).map((type) => [type, { index: 0, applied: 0, events: new Map() }])),
    };
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
      const result = await postJson("/api/session", {
        sdp: peer.localDescription.sdp,
        continueFrom,
        resume: previous ? undefined : resumeId,
        priorities: previous ? undefined : startPriorities,
        link: previous ? undefined : caseLink,
      });
      Object.assign(session, {
        id: result.session.id,
        voice: result.voice,
        offsetMs: result.offsetMs,
        opening: result.greeting,
        intro: result.intro,
        fallbackGreeting: result.fallbackGreeting,
      });
      conversationId ??= result.conversationId;
      if (result.language) {
        languageChosen = true;
        conversationLanguage = result.language;
      }
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
    cancelConfirmation("cancelled_by_customer", "call_ended");
    clearTimeout(endTimer);
    for (const { timer } of visualUpdates.values()) clearTimeout(timer);
    visualUpdates.clear();
    poller?.stop();
    poller = null;
    clearTimeout(goodbyeTimer);
    clearTimeout(userGoodbyeTimer);
    clearTimeout(closeAfterGoodbye);
    closeAfterGoodbye = null;
    agentTurnText = "";
    userTurnText = "";
    personSaidGoodbye = false;
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

  const this_ = {
    /**
     * Starts a conversation. Call it from a click or tap: browsers require a user action.
     * Pass { resume: conversationId } to continue a conversation that was closed, for
     * example after inactivity; Paxi then picks up where it left off.
     */
    async start({ resume, priorities } = {}) {
      if (running) return;
      resumeId = resume ?? null;
      startPriorities = priorities;
      running = true;
      finishing = false;
      conversationId = undefined;
      pendingFragments = [];
      handledCalls = new Set();
      languageChosen = false;
      firstWords = "";
      pendingSteering = [];
      agenda = [];
      agendaReminded = false;
      ending = false;
      conversationLanguage = null;
      sentFragments = [];
      serverLost = false;
      foreignNoteAt = -Infinity;
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

    /**
     * Steers Paxi from outside: these questionnaire fields (IDs from questionnaire.json)
     * should come next, for example because a calculation needs them. Paxi brings them up
     * at the next natural moment. An empty list clears the priorities.
     */
    async prioritize(fieldIds, source = "app") {
      if (!current?.id) {
        startPriorities = fieldIds;
        return null;
      }
      const result = await postJson(`/api/conversations/${current.id}/priorities`, { fields: fieldIds, source });
      if (result.labels.length && current?.ready) {
        send(current, {
          type: "session.thinking.append",
          delegation_id: null,
          content: `The app now especially needs: ${result.open_priority.join(", ") || result.labels.join(", ")}. At the next natural moment, steer the conversation there, without breaking off what the person is telling you.`,
        });
      }
      return result;
    },

    /**
     * Steers the running call from the app. Commands:
     * - { type: "topic", topic, reason?, fields?, urgency?: "next" | "soon" }: talk about this next
     * - { type: "visual", id, title, event?: "shown" | "updated" | "hidden", description? | data?, revision?, announce? }
     * - { type: "priorities", fields }: questionnaire fields that come first
     * - { type: "end", reason?, goodbye?: true }: say goodbye and end the call
     * - { type: "stop_speaking" }
     * Topics and visuals never cut the person off: Paxi finishes the current exchange first.
     */
    async steer(command) {
      if (!current?.id) throw new Error("Start the conversation before steering it.");
      if (command?.type === "stop_speaking") {
        this_.stopSpeaking();
        return { command };
      }
      // A chart that changes several times in a row: only its latest version goes to Paxi.
      if (command?.type === "visual" && command.event === "updated" && command.id) {
        return new Promise((resolve, reject) => {
          const waiting = visualUpdates.get(command.id);
          if (waiting) {
            clearTimeout(waiting.timer);
            waiting.resolve({ command: null, superseded: true });
          }
          const timer = setTimeout(() => {
            visualUpdates.delete(command.id);
            sendSteer(command).then(resolve, reject);
          }, VISUAL_UPDATE_DEBOUNCE_MS);
          visualUpdates.set(command.id, { timer, resolve });
        });
      }
      return sendSteer(command);
    },

    /** A visual appeared ({ id, title, description? | data? }); same as steer({ type: "visual" }). */
    showVisual(visual) {
      return this_.steer({ ...visual, type: "visual", event: visual.event ?? "shown" });
    },

    /** A visual on the screen changed, for example a recalculated chart. */
    updateVisual(visual) {
      return this_.steer({ ...visual, type: "visual", event: "updated" });
    },

    /** A visual is no longer on the screen. */
    hideVisual(id) {
      return this_.steer({ type: "visual", id, event: "hidden" });
    },

    /**
     * Asks a confirmation question the customer app created (VOICE-08):
     * { confirmationId, questionText, questionReplyId }. Results arrive via onConfirmation:
     * "presented" (played completely), "answer" (the person's final answer) or "cancelled".
     */
    confirm(question) {
      if (!question?.confirmationId || typeof question.questionText !== "string" || !question.questionReplyId) {
        throw new Error("confirmationId, questionText and questionReplyId are required");
      }
      askConfirmation(question);
    },

    /** The app cancels the open confirmation question, for example because it showed a new one. */
    cancelConfirmation() {
      cancelConfirmation("cancelled_by_customer", "by_app");
    },

    /**
     * After the voice server restarted (onServerLost), hands it the running call again, with a
     * fresh case link from the customer app if the call was linked ({ link }).
     */
    async reattach({ link } = {}) {
      if (!current?.id || !conversationId) return null;
      const result = await postJson(`/api/conversations/${current.id}/reattach`, {
        conversationId,
        link,
        language: conversationLanguage,
        sessions: sessions.filter((s) => s.id).map((s) => ({ sessionId: s.id, offsetMs: s.offsetMs, voice: s.voice })),
        fragments: sentFragments,
      });
      serverLost = false;
      return result;
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

    /** Mutes the person's microphone; Paxi keeps talking and listening resumes on unmute. */
    setMuted(value) {
      muted = Boolean(value);
      microphone?.getAudioTracks().forEach((track) => (track.enabled = !muted));
      // While muted, GPT-Live also takes no turns from the (silent) microphone.
      if (current?.ready) send(current, { type: muted ? "session.input_audio.mute" : "session.input_audio.unmute" });
    },

    get muted() {
      return muted;
    },

    /**
     * Stops what Paxi is saying right now: its voice is muted until the person speaks again, so
     * the rest of that answer is neither heard nor logged (like a muted session in a voice switch).
     */
    stopSpeaking() {
      if (!current) return;
      silenced = true;
      current.audio.muted = true;
      endPlayback("cancelled");
      cancelConfirmation("cancelled_by_customer", "stopped");
      // Also stops the answer on the server, so Paxi answers what the person says next.
      if (current.ready) send(current, { type: "session.instructions.append", delegation_id: null, content: STOP_INSTRUCTION });
    },

    /** URL of the conversation's JSON log, once the conversation has started. */
    get logUrl() {
      return conversationId ? `${baseUrl}/api/conversations/${conversationId}` : null;
    },

    get running() {
      return running;
    },

    /** Follows the app's language: switches Paxi to that language's native voice. */
    async setLanguage(language) {
      if (!current?.ready || switching) return;
      let result;
      try {
        result = await postJson(`/api/conversations/${current.id}/language`, { language });
      } catch (error) {
        console.error("Language from the app failed", error);
        return;
      }
      if (!result.ok) return;
      languageChosen = true;
      if (result.switch_voice && !switching) switchVoice(current, null, result.voice);
    },
  };
  return this_;
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
