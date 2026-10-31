// GPT-Live voice agent for the Pax intake questionnaire.
// Creates WebRTC sessions (API key stays here) and owns the JSON conversation log.
import express from "express";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile } from "node:fs/promises";
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
import { extractAnswers } from "./answer-extractor.mjs";
import { extractContext } from "./conversation-context.mjs";
import { conversationToken, ELEVENLABS_VOICE_ID, ensureAgent } from "./elevenlabs.mjs";
import { detectLanguage } from "./language-detect.mjs";
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
// Paxi collects core and extended fields; suitability questions are left to a Pax colleague.
const voiceFields = questionnaire.fields.filter((field) => field.tier !== "suitability");
const fieldsById = new Map(voiceFields.map((field) => [field.id, field]));

// Only sessions created by this server may write logs. Session ID -> { log, entry }.
const sessions = new Map();
// Conversation ID -> log, so a closed conversation can be resumed.
const conversations = new Map();

// Finds a conversation in memory or, after a server restart, in its log file.
async function loadConversation(conversationId) {
  if (typeof conversationId !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(conversationId)) return null;
  if (conversations.has(conversationId)) return conversations.get(conversationId);
  try {
    const log = JSON.parse(await readFile(resolve(logDirectory, `${conversationId}.json`), "utf8"));
    if (log.conversationId !== conversationId) return null;
    conversations.set(conversationId, log);
    return log;
  } catch {
    return null;
  }
}

const persona = await readFile(resolve(here, "persona.md"), "utf8");
const welcomeText = (await readFile(resolve(here, "welcome.txt"), "utf8")).trim();

// Recorded intro (public/intro.mp3). The browser plays it itself, so the person can
// interrupt it: a GPT-Live audio fixture would drop all input while it plays.
const introUrl = await access(resolve(here, "public/intro.mp3")).then(() => "/intro.mp3", () => null);

const topicList = (tier) =>
  voiceFields
    .filter((field) => (field.tier ?? "core") === tier)
    .map((field) => `- ${field.label}. For example: ${field.question}`)
    .join("\n");

// How the extractor returns each value.
function valueFormat(field) {
  if (field.type === "date") return "Datum JJJJ-MM-TT";
  if (field.type === "integer") return `ganze Zahl${field.min !== undefined ? ` ${field.min} bis ${field.max}` : ""}`;
  if (field.type === "money") return "Betrag in CHF als Zahl, z. B. 85000";
  if (field.type === "enum") return `genau einer von: ${field.options.join(", ")}`;
  if (field.type === "boolean") return "true oder false";
  return "Text";
}

const labelsOf = (ids) => ids.map((id) => fieldsById.get(id).label);
const openLabels = (log) => labelsOf([...openFields(log, "core"), ...openFields(log, "extended")]);

// Paxi's prompt, shared by all voice providers: persona.md, language, today's date and
// what to find out. Saving happens by itself (answer-extractor.mjs), so Paxi only talks.
function paxiPrompt({ language, voicePrompt }) {
  const languageRule = language
    ? `Current conversation language: ${languages[language].name}, spoken with native pronunciation. If the person starts speaking another of your languages, follow them.`
    : `Languages: you speak German, French, Italian and English, each with native pronunciation. Continue in the language the person speaks.`;
  return `${persona}
## Languages

${languageRule}
${voicePrompt ? `\n## Voice\n\n${voicePrompt}\n` : ""}
## Today

Today is ${today()}. Use this date for anything time-related, for example to work out someone's birth year from their age and birthday, or how long ago something was.

## What you want to find out

The app listens along and fills in the questionnaire by itself from what the person says. You never need to say that you noted or saved something, and you do not need to confirm every detail. Only check back on things that are easy to mishear: names, dates and amounts.

You will receive quiet notes from the app about what is already known and what is still open. Never ask for something that is already known, and do not follow the order of the list below: let it come up in the conversation.

Important for the first conversation:
${topicList("core")}

Also part of the picture; find these out too, whenever they fit:
${topicList("extended")}

Only wrap up when the app's note says that everything is complete or handed to a colleague. If the person wants to stop before that, tell them in one sentence that only a few quick questions are left and ask them right away. If they still want to go, say that a colleague of yours will complete the rest with them.`;
}

// GPT-Live adds OpenAI's recommended policies (backchannel, interruption, delegation).
// gpt-live-1 delegates on <|SpawnThinking|>; the only backend task left is the language.
function liveInstructions(voiceOption, language) {
  return `${paxiPrompt({ language, voicePrompt: voiceOption.prompt })}

## Policies

Backchannel policy: Rarely use backchannels, at most a quiet "mhm" in a longer story. Never talk over the person.

Interruption policy: Stop speaking when the person clearly starts talking to you, also in the middle of the welcome. Ignore short noises, coughs or background sounds and keep going smoothly.

Delegation policy:
Backend tools:
- Language: switches to a native voice for the language the person speaks.

Generate <|SpawnThinking|> when:
- The person speaks ${language ? `a language other than ${languages[language].name}` : "for the first time, also when they interrupt the welcome"} (they choose the conversation language just by speaking it).

Do not generate <|SpawnThinking|> when:
- The person tells you about themselves or answers a question. Just keep the conversation going; the app picks up the details by itself.

Never mention tools, systems, saving or searching.`;
}

// Swiss local date, so Paxi and the backend calculate ages and durations correctly.
function today() {
  const now = new Date();
  const long = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  const iso = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(now);
  return `${long} (${iso})`;
}

const backendInstructions = `Du hilfst Paxi bei der Sprachwahl. Die Person wählt ihre Sprache, indem sie einfach in ihr spricht. Wenn sie nach der Begrüssung zum ersten Mal spricht oder in eine andere Sprache wechselt, rufe set_language mit dieser Sprache auf (de, fr, it oder en). Spricht sie weiter in der bereits gesetzten Sprache, rufe set_language nicht erneut auf. Gib danach nur eine sehr knappe, sachliche Rückmeldung für Paxi, nichts zum Vorlesen.`;

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
  // Resuming a conversation that was closed, e.g. after inactivity.
  const resumed = request.body.resume ? await loadConversation(request.body.resume) : null;
  if (request.body.resume && (!resumed || resumed.status === "active")) {
    response.status(404).json({ error: "Conversation cannot be resumed" });
    return;
  }
  const earlierLog = previous?.log ?? resumed;
  const language = earlierLog?.language ?? null;
  const voiceOption = language ? voiceByKey.get(languages[language].voiceKey) : startVoice;
  const playIntro = !earlierLog && introUrl !== null;
  const opening = previous ? continuation(previous.log) : resumed ? resumption(resumed) : playIntro ? duringIntro() : greeting();
  // With the recorded intro, the model gets it as its own first turn so it knows what is said.
  const history = earlierLog
    ? historyItems(earlierLog)
    : playIntro
      ? [{ type: "message", role: "assistant", content: [{ type: "output_text", text: welcomeText }] }]
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
            instructions: [
              backendInstructions,
              ...(language ? [`Die Sprache ist bereits auf ${language} gesetzt; rufe set_language nur auf, wenn die Person in eine andere Sprache wechselt.`] : []),
            ].join("\n"),
            tools: [setLanguageTool],
            tool_choice: "auto",
            parallel_tool_calls: false,
          },
        },
      },
      transport: { type: "webrtc", sdp: request.body.sdp },
    });

    const sessionId = result.session.id;
    const log = earlierLog ?? createLog({ conversationId: sessionId, questionnaire, model: liveModel });
    conversations.set(log.conversationId, log);
    if (resumed) {
      log.status = "active";
      log.endedAt = null;
      log.events.push({ type: "conversation_resumed", at: new Date().toISOString() });
    }
    // Transcript times restart at 0 in every session; shift them onto the conversation timeline.
    const offsetMs = earlierLog ? Date.now() - Date.parse(log.startedAt) : 0;
    const entry = addSession(log, { sessionId, voice: voiceOption.key, language, offsetMs });
    sessions.set(sessionId, { log, entry });
    await persist(log);
    response.status(201).json({
      ...result,
      conversationId: log.conversationId,
      language,
      voice: voiceOption.key,
      offsetMs,
      // The browser sends this as commentary, so Paxi speaks first (or stays quiet during the intro).
      greeting: opening,
      intro: playIntro ? { url: introUrl, text: welcomeText } : null,
      // Spoken live if the browser cannot play the intro.
      fallbackGreeting: playIntro ? greeting() : null,
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
  if (fragments.some((fragment) => fragment.speaker === "user")) scheduleExtraction(log);
  await persist(log);
  response.status(204).end();
});

// --- Filling the questionnaire from the conversation ------------------------------------

const EXTRACTION_DEBOUNCE_MS = 1500;
const extraction = new Map(); // conversation ID -> { timer, running, again }

// Runs the extractor shortly after the person stopped talking, one run at a time.
function scheduleExtraction(log) {
  const state = extraction.get(log.conversationId) ?? { timer: null, running: false, again: false };
  extraction.set(log.conversationId, state);
  clearTimeout(state.timer);
  state.timer = setTimeout(async () => {
    if (state.running) {
      state.again = true;
      return;
    }
    state.running = true;
    try {
      await runExtraction(log);
    } catch (error) {
      console.error("Answer extraction failed", log.conversationId, error.message);
    } finally {
      state.running = false;
      if (state.again) {
        state.again = false;
        scheduleExtraction(log);
      }
    }
  }, EXTRACTION_DEBOUNCE_MS);
}

async function runExtraction(log) {
  client ??= new OpenAI({ maxRetries: 0 });
  const { updates, declines } = await extractAnswers({
    client,
    model: backendModel,
    fields: voiceFields,
    formatOf: valueFormat,
    log,
    today: today(),
  });
  const at = new Date().toISOString();
  let changed = false;
  const stamp = (fieldId, answer) => {
    log.answersVersion = (log.answersVersion ?? 0) + 1;
    log.answers[fieldId] = { ...log.answers[fieldId], ...answer, updatedAt: at, version: log.answersVersion };
    changed = true;
  };
  for (const { field_id: fieldId, value, quote } of updates) {
    const field = fieldsById.get(fieldId);
    const result = field ? validateAnswer(field, value) : { ok: false };
    if (!result.ok || log.answers[fieldId].value === result.value) continue;
    stamp(fieldId, { value: result.value, status: "captured", quote });
    log.events.push({ type: "answer_saved", at, fieldId, value: result.value, quote });
  }
  // One refusal: Paxi may ask once more later. A second one goes to a Pax colleague.
  for (const { field_id: fieldId, times, reason } of declines) {
    const answer = log.answers[fieldId];
    if (!answer || answer.status === "captured" || answer.status === "declined") continue;
    if (times >= 2) {
      stamp(fieldId, { value: null, status: "declined", note: reason });
      log.humanFollowUp = [...(log.humanFollowUp ?? []).filter((item) => item.fieldId !== fieldId), { fieldId, label: answer.label, reason, at }];
      log.events.push({ type: "answer_declined", at, fieldId, reason });
    } else if (answer.status !== "declined_once") {
      stamp(fieldId, { value: null, status: "declined_once", note: reason });
      log.events.push({ type: "answer_declined_once", at, fieldId, reason });
    }
  }
  if (changed) await persist(log);
}

// The browser polls this to update the UI and to give Paxi a quiet note of what is missing.
app.get("/api/conversations/:sessionId/progress", (request, response) => {
  const session = findSession(request, response);
  if (!session) return;
  const { log } = session;
  const since = Number(request.query.since) || 0;
  const changes = Object.entries(log.answers)
    .filter(([, answer]) => (answer.version ?? 0) > since)
    .map(([fieldId, answer]) => ({ fieldId, value: answer.value, status: answer.status }));
  response.json({ version: log.answersVersion ?? 0, changes, known: knownSummary(log), ...progress(log) });
});

// "Name: Dario Roth; Wohnort: …" for Paxi's notes.
function knownSummary(log) {
  return Object.values(log.answers)
    .filter((answer) => answer.status === "captured")
    .map((answer) => `${answer.label}: ${answer.value}`)
    .join("; ");
}

// --- ElevenLabs ----------------------------------------------------------------------------

const RESUME_GREETINGS = {
  de: "Hey, schön, dass du wieder da bist! Machen wir dort weiter, wo wir aufgehört haben.",
  fr: "Hey, content que tu sois de retour ! On reprend là où on s'était arrêtés.",
  it: "Ehi, che bello che sei tornato! Riprendiamo da dove ci eravamo fermati.",
  en: "Hey, good to have you back! Let's pick up where we left off.",
};

app.get("/api/providers", (_request, response) =>
  response.json({
    providers: [
      { key: "gpt-live", label: "OpenAI GPT-Live", available: Boolean(process.env.OPENAI_API_KEY) },
      { key: "elevenlabs", label: "ElevenLabs", available: Boolean(process.env.ELEVENLABS_API_KEY) },
    ],
  }),
);

// Starts (or resumes) a conversation with ElevenLabs. The answers are still filled in by
// the extractor from the transcript, exactly like with GPT-Live.
app.post("/api/elevenlabs/session", sameOrigin, async (request, response) => {
  if (!process.env.ELEVENLABS_API_KEY) {
    response.status(503).json({ error: "Set ELEVENLABS_API_KEY in the repo root .env" });
    return;
  }
  const resumed = request.body?.resume ? await loadConversation(request.body.resume) : null;
  if (request.body?.resume && (!resumed || resumed.status === "active")) {
    response.status(404).json({ error: "Conversation cannot be resumed" });
    return;
  }
  try {
    await mkdir(resolve(here, "data"), { recursive: true });
    const agentId = await ensureAgent(resolve(here, "data/elevenlabs-agent.json"));
    const token = await conversationToken(agentId);
    const sessionId = `el_${randomUUID()}`;
    const log = resumed ?? createLog({ conversationId: sessionId, questionnaire, model: "elevenlabs" });
    conversations.set(log.conversationId, log);
    if (resumed) {
      log.status = "active";
      log.endedAt = null;
      log.events.push({ type: "conversation_resumed", at: new Date().toISOString() });
    }
    const offsetMs = resumed ? Date.now() - Date.parse(log.startedAt) : 0;
    const entry = addSession(log, { sessionId, voice: `elevenlabs:${ELEVENLABS_VOICE_ID}`, language: log.language, offsetMs });
    sessions.set(sessionId, { log, entry });
    await persist(log);

    const opening = resumed
      ? `${resumption(log)}

The conversation so far:
${log.transcript
          .slice(-30)
          .map((turn) => `${turn.speaker === "user" ? "Person" : "Paxi"}: ${turn.text.trim()}`)
          .join("\n")}`
      : "The welcome was played to the person as a recording. Wait for their first words; they choose the language. Use language detection to switch to their language right away.";
    response.status(201).json({
      provider: "elevenlabs",
      token,
      sessionId,
      conversationId: log.conversationId,
      offsetMs,
      language: log.language,
      prompt: `${paxiPrompt({ language: log.language })}

## Now

${opening}

Never mention tools, systems or saving. Notes in square brackets that start with "App note" come from the app, not from the person: follow them, never read them out.`,
      firstMessage: resumed ? RESUME_GREETINGS[log.language ?? "de"] : "",
      intro: resumed || !introUrl ? null : { url: introUrl, text: welcomeText },
    });
  } catch (error) {
    console.error("ElevenLabs session failed", error.status, error.message);
    response.status(error.status === 401 ? 502 : (error.status ?? 502)).json({ error: error.message });
  }
});

// Called by the browser when the backend model calls set_language ({ language }), or with
// the person's first words ({ text }) so the voice switch does not depend on the model.
app.post("/api/conversations/:sessionId/language", sameOrigin, async (request, response) => {
  const session = findSession(request, response);
  if (!session) return;
  const { log, entry } = session;
  const text = typeof request.body?.text === "string" ? request.body.text.slice(0, 500) : null;
  let language = request.body?.language;
  if (!language && text) {
    client ??= new OpenAI({ maxRetries: 0 });
    language = await detectLanguage(client, backendModel, text).catch((error) => {
      console.error("Language detection failed", error.message);
      return null;
    });
  }
  if (!languages[language]) {
    response.json({ ok: false, reason: "Unbekannte Sprache." });
    return;
  }
  const changed = log.language !== language;
  log.language = language;
  if (changed) {
    log.events.push({ type: "language_set", at: new Date().toISOString(), language, source: text ? "first_words" : "tool" });
  }
  await persist(log);
  const voice = languages[language].voiceKey;
  response.json({ ok: true, language, voice, switch_voice: voice !== entry.voice });
});

// What is still missing; the browser also hands this to Paxi as quiet context.
function progress(log) {
  const core = openFields(log, "core");
  const extended = openFields(log, "extended");
  return {
    open_core: labelsOf(core),
    open_extended: labelsOf(extended),
    core_complete: core.length === 0,
    complete: core.length === 0 && extended.length === 0,
  };
}

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
    log.status = ["disconnected", "inactive"].includes(status) ? status : "closed";
    log.endedAt = at;
    log.events.push({ type: `conversation_${log.status}`, at });
    // Runs after the response; the log file gets a "context" section when it finishes.
    extractContext(client, backendModel, log).then(() => persist(log));
  }
  await persist(log);
  response.status(204).end();
});

app.get("/api/conversations/:sessionId", (request, response) => {
  const session = findSession(request, response);
  if (session) response.json(session.log);
});

function duringIntro() {
  return "Your welcome above is being played to the person as a recording right now. Stay silent, do not greet again or repeat it, and wait for the person to speak; their first words choose the language. The recording may echo back through their microphone; ignore audio that repeats it.";
}

// Used when there is no recorded intro.
function greeting() {
  return `Say this welcome now, smoothly and with native pronunciation for each language, then pause and listen: "${welcomeText}"
If the person starts speaking at any point during the welcome, stop right away and do not finish the other languages. Their first words choose the language: generate <|SpawnThinking|> right away so the app can switch to a native voice, and only say a very short acknowledgment in their language while it does.`;
}

function continuation(log) {
  const language = languages[log.language].name;
  const saved = Object.values(log.answers)
    .filter((answer) => answer.status === "captured")
    .map((answer) => `${answer.label}: ${answer.value}`);
  const firstSwitch = log.sessions.length === 1;
  return `The conversation continues in a new voice because the person chose ${language}. Do not greet again and do not introduce yourself again.
Already saved: ${saved.length ? saved.join("; ") : "nothing yet"}.
Still open: ${openLabels(log).join(", ") || "nothing"}.
Now, in ${language} and using the informal form, ${
    firstSwitch
      ? "say warmly in your own words that you would love to get to know them a bit (if the history shows you already confirmed the language, do not confirm it again). If they already said their name, use it; otherwise ask how you may call them."
      : "smoothly pick up the conversation where it left off."
  }`;
}

function resumption(log) {
  const language = log.language ? languages[log.language].name : "the language they used before";
  const open = openLabels(log);
  return `The person is back: the earlier call was closed after a while without activity, and they started it again. Do not introduce yourself again.
Now, in ${language} and using the informal form, welcome them back warmly in one short sentence (use their name if you know it), say you will continue where you left off, and then ${
    open.length ? `continue with what is still open: ${open.join(", ")}.` : "continue the conversation naturally."
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
