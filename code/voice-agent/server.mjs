// GPT-Live voice agent for the Pax intake questionnaire.
// Creates WebRTC sessions (API key stays here) and owns the JSON conversation log.
import express from "express";
import OpenAI from "openai";
import WebSocket from "ws";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addSession,
  addTranscriptFragment,
  createLog,
  openFields,
  saveLog,
  validateAnswer,
} from "./conversation-log.mjs";
import { extractContext } from "./conversation-context.mjs";
import { customVoices } from "./paxi-voice.mjs";

const here = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(resolve(here, "../../.env"));
} catch {
  // No .env at the repo root; rely on the process environment.
}

const port = Number(process.env.PORT ?? 3000);
const origin = `http://localhost:${port}`;
const liveModel = process.env.LIVE_MODEL ?? "gpt-live-1";
const backendModel = process.env.LIVE_BACKEND_MODEL ?? "gpt-6-luna";
// Voice of the welcome and the first session; after the person picks a language, Paxi
// switches to that language's native voice. Built-in voices are recorded from real
// speakers; GPT-Live has no built-in Italian voice, so Italian uses a custom one
// (create-voice.mjs).
const voices = [
  ...(process.env.LIVE_VOICE_ID
    ? [{ key: "paxi", voice: { id: process.env.LIVE_VOICE_ID }, prompt: customVoices.multilingual.prompt }]
    : []),
  ...(process.env.LIVE_VOICE_ID_IT
    ? [{ key: "paxi-it", voice: { id: process.env.LIVE_VOICE_ID_IT }, prompt: customVoices.italian.prompt }]
    : []),
  ...["juni", "nuri", "flitz", "brise", "gleam"].map((name) => ({ key: name, voice: name })),
];
const voiceByKey = new Map(voices.map((option) => [option.key, option]));
const startVoice = voiceByKey.get(process.env.LIVE_VOICE ?? "juni") ?? voiceByKey.get("juni");

// Native voice per conversation language. GPT-Live has no built-in Italian voice.
const languages = {
  de: { name: "German", voiceKey: startVoice.key },
  fr: { name: "French", voiceKey: "brise" },
  it: { name: "Italian", voiceKey: voiceByKey.has("paxi-it") ? "paxi-it" : voiceByKey.has("paxi") ? "paxi" : "juni" },
  en: { name: "English", voiceKey: "gleam" },
};
const logDirectory = resolve(here, "data/conversations");
const questionnaire = JSON.parse(await readFile(resolve(here, "questionnaire.json"), "utf8"));
const fieldsById = new Map(questionnaire.fields.map((field) => [field.id, field]));

// Only sessions created by this server may write logs. Session ID -> { log, entry }.
const sessions = new Map();

const persona = await readFile(resolve(here, "persona.md"), "utf8");
const welcomeText = (await readFile(resolve(here, "welcome.txt"), "utf8")).trim();

// Optional fixed welcome recording (record-welcome.mjs): raw mono PCM16 at 24 kHz, max 30 s.
const WELCOME_SAMPLE_RATE = 24000;
const welcomeAudio = await readFile(resolve(here, "welcome/welcome.pcm")).catch(() => null);
const welcomeSpoken = welcomeAudio
  ? (await readFile(resolve(here, "welcome/welcome-spoken.txt"), "utf8").catch(() => welcomeText)).trim()
  : null;
const welcomeDurationMs = welcomeAudio ? Math.round((welcomeAudio.length / 2 / WELCOME_SAMPLE_RATE) * 1000) : 0;
if (welcomeDurationMs > 30_000) throw new Error("welcome/welcome.pcm is longer than 30 s");

const questionList = questionnaire.fields
  .map((field) => `- ${field.label} (${field.id}). Casual way to ask: ${field.question}`)
  .join("\n");

// persona.md is the opening prompt; the rest follows OpenAI's recommended GPT-Live
// structure (backchannel, interruption and delegation policies). gpt-live-1 delegates
// on <|SpawnThinking|>.
function liveInstructions(voiceOption, language) {
  const languageRule = language
    ? `Current conversation language: ${languages[language].name}, spoken with native pronunciation. If the person starts speaking another of your languages, follow them.`
    : `Languages: you speak German, French, Italian and English, each with native pronunciation. Continue in the language the person speaks.`;
  return `${persona}
## Languages

${languageRule}
${voiceOption.prompt ? `\n## Voice\n\n${voiceOption.prompt}\n` : ""}
## Questionnaire details to pick up during the chat

${questionList}

Before a detail is saved, repeat it naturally and let the person confirm it.

## Policies

Backchannel policy: Rarely use backchannels, at most a quiet "mhm" in a longer story. Never talk over the person.

Interruption policy: Stop speaking when the person clearly starts talking to you. Ignore short noises, coughs or background sounds and keep going smoothly.

Delegation policy:
Backend tools:
- Questionnaire: saves a confirmed detail and reports which details are still open, or why a value was rejected.
- Language: switches to a native voice for the language the person speaks.

Generate <|SpawnThinking|> when:
- The person speaks ${language ? `a language other than ${languages[language].name}` : "for the first time after the welcome"} (they choose the conversation language just by speaking it).
- The person has confirmed one of the questionnaire details.
- The person corrects a detail that was already saved.

Do not generate <|SpawnThinking|> when:
- The person chats about their life, hobbies, work or plans. Just keep the conversation going; this context is picked up automatically afterwards.
- A detail is not yet confirmed or you need a short clarification.

While the backend works, keep chatting naturally about the current topic instead of waiting in silence. Never mention tools, systems, saving or searching. Do not say that something is saved before the backend confirms it. If a value is rejected, explain why in one sentence and ask again casually.`;
}

const backendInstructions = `Du speicherst bestätigte Angaben für den Fragebogen "${questionnaire.title}".
Felder:
${questionnaire.fields.map((field) => `- ${field.id}: ${field.label}, Typ ${field.type}`).join("\n")}
Das Gespräch kann auf Deutsch, Französisch, Italienisch oder Englisch laufen; gespeichert wird immer im gleichen Format, unabhängig von der Sprache.
Sprachwahl: Die Person wählt ihre Sprache, indem sie einfach in ihr spricht. Wenn sie nach der Begrüssung zum ersten Mal spricht oder in eine andere Sprache wechselt, rufe set_language mit dieser Sprache auf (de, fr, it oder en), bevor du sonst etwas tust. Spricht sie weiter in der bereits gesetzten Sprache, rufe set_language nicht erneut auf.
Rufe save_answer genau einmal pro bestätigter Angabe auf.
- Datumswerte immer als JJJJ-MM-TT übergeben (z. B. "dritter März 1990" -> "1990-03-03"). Ein Alter allein ist kein Geburtsdatum.
- Namen vollständig (Vor- und Nachname) und so übergeben, wie die Person sie bestätigt hat, mit korrekter Gross-/Kleinschreibung. Ein Spitzname oder nur ein Vorname ist noch kein vollständiger Name.
Gib danach eine sehr kurze Rückmeldung in der Gesprächssprache und in der Du-Form: was gespeichert oder warum es abgelehnt wurde. Erwähne offene Angaben nur als Hinweis für Paxi, damit Paxi sie später beiläufig im Gespräch erfragt, nicht als nächste Pflichtfrage.`;

const setLanguageTool = {
  type: "function",
  name: "set_language",
  description: "Setzt die Gesprächssprache auf die Sprache, in der die Person spricht. Die App wechselt dann zu einer muttersprachlichen Stimme.",
  strict: true,
  parameters: {
    type: "object",
    properties: { language: { type: "string", enum: Object.keys(languages) } },
    required: ["language"],
    additionalProperties: false,
  },
};

const saveAnswerTool = {
  type: "function",
  name: "save_answer",
  description: "Speichert eine von der Person bestätigte Antwort zu einem Fragebogenfeld.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      field_id: { type: "string", enum: questionnaire.fields.map((field) => field.id) },
      value: { type: "string", description: "Der bestätigte Wert; Datum als JJJJ-MM-TT." },
    },
    required: ["field_id", "value"],
    additionalProperties: false,
  },
};

// Created on first use so the page still loads without a key.
let client;
const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(express.static(resolve(here, "public")));
// The demo page shows Lukas's avatar from the avatar prototype.
app.use("/avatar", express.static(resolve(here, "../avatar-prototype")));

function sameOrigin(request, response, next) {
  if (request.headers.origin !== origin) {
    response.status(403).json({ error: "Unexpected request origin" });
    return;
  }
  next();
}

function findSession(request, response) {
  const session = sessions.get(request.params.sessionId);
  if (!session) response.status(404).json({ error: "Unknown session" });
  return session;
}

async function persist(log) {
  try {
    await saveLog(logDirectory, log);
  } catch (error) {
    console.error("Could not write conversation log", log.conversationId, error.message);
  }
}

app.get("/api/questionnaire", (_request, response) => response.json(questionnaire));

// Local-only demo. Add authentication before exposing session creation to other users.
// With continueFrom, the new session continues that conversation in a native voice.
app.post("/api/session", sameOrigin, async (request, response) => {
  if (typeof request.body?.sdp !== "string" || !request.body.sdp.trim()) {
    response.status(400).json({ error: "An SDP offer is required" });
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    response.status(503).json({ error: "Set OPENAI_API_KEY in the repo root .env" });
    return;
  }

  const previous = request.body.continueFrom ? sessions.get(request.body.continueFrom) : null;
  if (request.body.continueFrom && (!previous || previous.log.status !== "active")) {
    response.status(404).json({ error: "Unknown conversation" });
    return;
  }
  const language = previous ? previous.log.language : null;
  const voiceOption = previous
    ? voiceByKey.get(languages[language].voiceKey)
    : startVoice;
  const playWelcome = !previous && welcomeAudio !== null;
  const opening = previous ? continuation(previous.log) : playWelcome ? afterWelcome() : greeting();
  // With a recording, the model gets the welcome as its own first turn so it knows what was said.
  const history = previous
    ? historyItems(previous.log)
    : playWelcome
      ? [{ type: "message", role: "assistant", content: [{ type: "output_text", text: welcomeSpoken }] }]
      : [];

  client ??= new OpenAI({ maxRetries: 0 });
  try {
    const result = await client.live.create({
      session: {
        model: liveModel,
        instructions: liveInstructions(voiceOption, language),
        audio: { output: { voice: voiceOption.voice } },
        input: [...history, { role: "developer", content: [{ type: "input_text", text: opening }] }],
        delegation: {
          type: "responses",
          responses: {
            model: backendModel,
            instructions: language
              ? `${backendInstructions}\nDie Sprache ist bereits auf ${language} gesetzt; rufe set_language nur auf, wenn die Person in eine andere Sprache wechselt.`
              : backendInstructions,
            tools: [setLanguageTool, saveAnswerTool],
            tool_choice: "auto",
            parallel_tool_calls: false,
          },
        },
      },
      transport: { type: "webrtc", sdp: request.body.sdp },
    });

    const sessionId = result.session.id;
    const log = previous?.log ?? createLog({ conversationId: sessionId, questionnaire, model: liveModel });
    // Transcript times restart at 0 in every session; shift them onto the conversation timeline.
    const offsetMs = previous ? Date.now() - Date.parse(log.startedAt) : 0;
    const entry = addSession(log, { sessionId, voice: voiceOption.key, language, offsetMs });
    sessions.set(sessionId, { log, entry });
    await persist(log);
    response.status(201).json({
      ...result,
      conversationId: log.conversationId,
      voice: voiceOption.key,
      offsetMs,
      // The browser speaks this via commentary, unless the welcome recording is played instead.
      greeting: playWelcome ? null : opening,
      fallbackGreeting: playWelcome ? greeting() : null,
      welcome: playWelcome ? { text: welcomeSpoken, durationMs: welcomeDurationMs } : null,
    });
  } catch (error) {
    if (!(error instanceof OpenAI.APIError)) throw error;
    console.error("Live session creation failed", error.status, error.message);
    response.status(error.status ?? 502).json({ error: "Live session creation failed" });
  }
});

app.post("/api/conversations/:sessionId/transcript", sameOrigin, async (request, response) => {
  const session = findSession(request, response);
  if (!session) return;
  const { log, entry } = session;
  const fragments = Array.isArray(request.body?.fragments) ? request.body.fragments : [];
  for (const fragment of fragments) {
    if (
      (fragment.speaker === "user" || fragment.speaker === "agent") &&
      typeof fragment.text === "string" &&
      Number.isFinite(fragment.start_ms) &&
      Number.isFinite(fragment.end_ms)
    ) {
      addTranscriptFragment(log, {
        speaker: fragment.speaker,
        text: fragment.text,
        start_ms: fragment.start_ms + entry.offsetMs,
        end_ms: fragment.end_ms + entry.offsetMs,
      });
    }
  }
  await persist(log);
  response.status(204).end();
});

// Called by the browser when the backend model calls set_language.
app.post("/api/conversations/:sessionId/language", sameOrigin, async (request, response) => {
  const session = findSession(request, response);
  if (!session) return;
  const { log, entry } = session;
  const language = request.body?.language;
  if (!languages[language]) {
    response.json({ ok: false, reason: "Unbekannte Sprache." });
    return;
  }
  const changed = log.language !== language;
  log.language = language;
  if (changed) log.events.push({ type: "language_set", at: new Date().toISOString(), language });
  await persist(log);
  const voice = languages[language].voiceKey;
  response.json({ ok: true, language, voice, switch_voice: voice !== entry.voice });
});

// Called by the browser when the backend model calls save_answer.
app.post("/api/conversations/:sessionId/answers", sameOrigin, async (request, response) => {
  const session = findSession(request, response);
  if (!session) return;
  const { log } = session;
  const { field_id: fieldId, value, call_id: callId } = request.body ?? {};
  const field = fieldsById.get(fieldId);
  const at = new Date().toISOString();

  const result = field ? validateAnswer(field, value) : { ok: false, reason: "Unbekanntes Feld." };
  if (result.ok) {
    log.answers[fieldId] = { label: field.label, value: result.value, status: "captured", updatedAt: at };
  }
  log.events.push({
    type: result.ok ? "answer_saved" : "answer_rejected",
    at,
    callId: typeof callId === "string" ? callId : null,
    fieldId: typeof fieldId === "string" ? fieldId : null,
    value: typeof value === "string" ? value : null,
    ...(result.ok ? {} : { reason: result.reason }),
  });
  await persist(log);

  const remaining = openFields(log);
  response.json({
    saved: result.ok,
    field_id: fieldId,
    ...(result.ok ? { value: result.value } : { reason: result.reason }),
    open_fields: remaining,
    complete: remaining.length === 0,
  });
});

// status "handoff" ends only this session; the conversation continues in the next one.
app.post("/api/conversations/:sessionId/close", sameOrigin, async (request, response) => {
  const session = findSession(request, response);
  if (!session) return;
  const { log, entry } = session;
  const at = new Date().toISOString();
  entry.endedAt ??= at;
  entry.usage = request.body?.usage ?? entry.usage;
  const status = request.body?.status;
  if (status !== "handoff" && log.status === "active") {
    log.status = status === "disconnected" ? "disconnected" : "closed";
    log.endedAt = at;
    log.events.push({ type: `conversation_${log.status}`, at });
    // Runs after the response; the log file gets a "context" section when it finishes.
    extractContext(client, backendModel, log).then(() => persist(log));
  }
  await persist(log);
  response.status(204).end();
});

// Plays the welcome recording through the session output. GPT-Live accepts audio
// fixtures only on a server connection, so this attaches a sideband WebSocket.
app.post("/api/conversations/:sessionId/welcome", sameOrigin, async (request, response) => {
  const session = findSession(request, response);
  if (!session) return;
  const { log, entry } = session;
  if (!welcomeAudio || log.sessions[0] !== entry || entry.welcomePlayed) {
    response.status(409).json({ error: "No welcome to play for this session" });
    return;
  }
  entry.welcomePlayed = true;
  try {
    await playFixture(entry.sessionId, welcomeAudio);
    const startMs = Date.now() - Date.parse(log.startedAt);
    log.transcript.unshift({ speaker: "agent", text: welcomeSpoken, start_ms: startMs, end_ms: startMs + welcomeDurationMs, recording: true });
    log.events.push({ type: "welcome_played", at: new Date().toISOString() });
    await persist(log);
    response.json({ ok: true, text: welcomeSpoken, durationMs: welcomeDurationMs });
  } catch (error) {
    console.error("Welcome playback failed", entry.sessionId, error.message);
    response.status(502).json({ error: "Welcome playback failed" });
  }
});

// Resolves once GPT-Live accepts the audio; the sideband stays open until playback drains.
function playFixture(sessionId, pcm) {
  return new Promise((resolvePromise, reject) => {
    const socket = new WebSocket(`wss://api.openai.com/v1/live/sessions/${encodeURIComponent(sessionId)}/attach`, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    });
    const eventId = `welcome_${sessionId}`;
    const durationMs = (pcm.length / 2 / WELCOME_SAMPLE_RATE) * 1000;
    let accepted = false;
    const acceptTimeout = setTimeout(() => fail(new Error("No fixture.playing acknowledgment")), 10_000);
    const closeTimeout = setTimeout(() => socket.close(), durationMs + 15_000);
    function fail(error) {
      clearTimeout(acceptTimeout);
      clearTimeout(closeTimeout);
      socket.close();
      if (!accepted) reject(error);
    }
    socket.on("open", () => {
      socket.send(JSON.stringify({ type: "session.output_audio.fixture.play", event_id: eventId, audio: pcm.toString("base64") }));
    });
    socket.on("message", (data) => {
      const event = JSON.parse(data.toString());
      if (event.type === "session.output_audio.fixture.playing" && event.client_event_id === eventId) {
        accepted = true;
        clearTimeout(acceptTimeout);
        resolvePromise();
      } else if (event.type === "session.output_audio.fixture.played" && event.client_event_id === eventId) {
        clearTimeout(closeTimeout);
        socket.close();
      } else if (event.type === "error" && event.error?.client_event_id === eventId) {
        fail(new Error(event.error.message));
      }
    });
    socket.on("error", (error) => fail(error));
  });
}

app.get("/api/conversations/:sessionId", (request, response) => {
  const session = findSession(request, response);
  if (session) response.json(session.log);
});

function afterWelcome() {
  return "The welcome above was just played as a recording. Do not greet again or repeat it. Wait for the person to speak first; their words choose the language.";
}

// Used when no welcome recording exists; otherwise the recording is played (see /welcome).
function greeting() {
  return `Say this welcome now, smoothly and with native pronunciation for each language, then pause and listen: "${welcomeText}"`;
}

function continuation(log) {
  const language = languages[log.language].name;
  const saved = Object.values(log.answers)
    .filter((answer) => answer.status === "captured")
    .map((answer) => `${answer.label}: ${answer.value}`);
  const firstSwitch = log.sessions.length === 1;
  return `The conversation continues in a new voice because the person chose ${language}. Do not greet again and do not introduce yourself again.
Already saved: ${saved.length ? saved.join("; ") : "nothing yet"}.
Now, in ${language} and using the informal form, ${
    firstSwitch
      ? "say warmly in your own words that you are happy to continue in this language and would love to get to know them a bit. If they already said their name, use it; otherwise ask how you may call them."
      : "smoothly pick up the conversation where it left off."
  }`;
}

// The conversation so far as text history for a follow-up session.
function historyItems(log) {
  return log.transcript.slice(-40).map((turn) =>
    turn.speaker === "user"
      ? { type: "message", role: "user", content: [{ type: "input_text", text: turn.text }] }
      : { type: "message", role: "assistant", content: [{ type: "output_text", text: turn.text }] },
  );
}

app.listen(port, "127.0.0.1", () => console.log(`Voice agent: open ${origin}`));
