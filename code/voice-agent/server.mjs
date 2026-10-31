// GPT-Live voice agent for the Pax intake questionnaire.
// Creates WebRTC sessions (API key stays here) and owns the JSON conversation log.
import express from "express";
import OpenAI from "openai";
import { access, readFile } from "node:fs/promises";
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

const questionList = (tier) =>
  voiceFields
    .filter((field) => (field.tier ?? "core") === tier)
    .map((field) => `- ${field.label} (${field.id}). Casual way to ask: ${field.question}`)
    .join("\n");

// How the backend passes each value to save_answer.
function valueFormat(field) {
  if (field.type === "date") return "Datum JJJJ-MM-TT";
  if (field.type === "integer") return `ganze Zahl${field.min !== undefined ? ` ${field.min} bis ${field.max}` : ""}`;
  if (field.type === "money") return "Betrag in CHF als Zahl, z. B. 85000";
  if (field.type === "enum") return `genau einer von: ${field.options.join(", ")}`;
  if (field.type === "boolean") return "true oder false";
  return "Text";
}

const labelsOf = (ids) => ids.map((id) => fieldsById.get(id).label);

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
## Today

Today is ${today()}. Use this date for anything time-related, for example to work out someone's age from their birthday or how many years are left until a plan.

## Questionnaire details to pick up during the chat

Core details: you need all of these before the conversation may end.
${questionList("core")}

Extended details: pick them up when they fit naturally; a colleague completes the rest.
${questionList("extended")}

Before a detail is saved, repeat it naturally and let the person confirm it. Do not ask for something you can work out yourself: with the age and the birthday you know the birth year, so just confirm the full date.
Never say goodbye or wrap up while core details are still open. If the person wants to stop early, tell them in one sentence that only a few quick questions are left and ask them right away, without small talk. If they still want to go, say that a colleague of yours will complete the rest with them.

## Policies

Backchannel policy: Rarely use backchannels, at most a quiet "mhm" in a longer story. Never talk over the person.

Interruption policy: Stop speaking when the person clearly starts talking to you, also in the middle of the welcome. Ignore short noises, coughs or background sounds and keep going smoothly.

Delegation policy:
Backend tools:
- Questionnaire: saves a confirmed detail and reports which details are still open, or why a value was rejected.
- Language: switches to a native voice for the language the person speaks.
- Declined: notes that the person does not want to give a detail, so a colleague can clarify it with them later.

Generate <|SpawnThinking|> when:
- The person speaks ${language ? `a language other than ${languages[language].name}` : "for the first time, also when they interrupt the welcome"} (they choose the conversation language just by speaking it).
- The person has confirmed one of the questionnaire details.
- The person corrects a detail that was already saved.
- The person says they do not want to give one of the questionnaire details (each time they decline).

Do not generate <|SpawnThinking|> when:
- The person chats about their life, hobbies, work or plans. Just keep the conversation going; this context is picked up automatically afterwards.
- A detail is not yet confirmed or you need a short clarification.

While the backend works, keep chatting naturally about the current topic instead of waiting in silence. Never mention tools, systems, saving or searching. Do not say that something is saved before the backend confirms it. If a value is rejected, explain why in one sentence and ask again casually.`;
}

// Swiss local date, so Paxi and the backend calculate ages and durations correctly.
function today() {
  const now = new Date();
  const long = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  const iso = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(now);
  return `${long} (${iso})`;
}

const backendInstructions = `Du speicherst bestätigte Angaben für den Fragebogen "${questionnaire.title}".
Felder:
${voiceFields.map((field) => `- ${field.id}: ${field.label} (${valueFormat(field)})`).join("\n")}
Das Gespräch kann auf Deutsch, Französisch, Italienisch oder Englisch laufen; gespeichert wird immer im gleichen Format, unabhängig von der Sprache.
Sprachwahl: Die Person wählt ihre Sprache, indem sie einfach in ihr spricht. Wenn sie nach der Begrüssung zum ersten Mal spricht oder in eine andere Sprache wechselt, rufe set_language mit dieser Sprache auf (de, fr, it oder en), bevor du sonst etwas tust. Spricht sie weiter in der bereits gesetzten Sprache, rufe set_language nicht erneut auf.
Rufe save_answer genau einmal pro bestätigter Angabe auf.
Lehnt die Person eine Angabe ab, rufe decline_answer für dieses Feld auf, jedes Mal wenn sie ablehnt. Die Antwort sagt dir, ob Paxi später noch einmal sanft nachfragen soll oder ob ein Kollege oder eine Kollegin von Paxi es persönlich klärt; gib das genau so weiter.
- Datumswerte immer als JJJJ-MM-TT übergeben (z. B. "dritter März 1990" -> "1990-03-03"). Ein Alter allein ist kein Geburtsdatum.
- Namen vollständig (Vor- und Nachname) und so übergeben, wie die Person sie bestätigt hat, mit korrekter Gross-/Kleinschreibung. Ein Spitzname oder nur ein Vorname ist noch kein vollständiger Name.
Gib danach nur eine sehr knappe, sachliche Rückmeldung für Paxi (ohne Dank, ohne Begrüssung, nichts zum Vorlesen): gespeichert oder warum abgelehnt, und welche Kernangaben (open_core) noch fehlen.`;

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

const declineAnswerTool = {
  type: "function",
  name: "decline_answer",
  description: "Hält fest, dass die Person eine Angabe auch nach erneutem Nachfragen nicht geben möchte. Eine Pax-Mitarbeiterin oder ein Pax-Mitarbeiter klärt sie später persönlich.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      field_id: { type: "string", enum: voiceFields.map((field) => field.id) },
      reason: { type: "string", description: "Kurz, warum die Person die Angabe nicht geben möchte, falls sie es gesagt hat; sonst leer." },
    },
    required: ["field_id", "reason"],
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
      field_id: { type: "string", enum: voiceFields.map((field) => field.id) },
      value: { type: "string", description: "Der bestätigte Wert im Format des Feldes (siehe Anweisungen)." },
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
              `Heute ist ${today()}; rechne Alter und Zeiträume mit diesem Datum.`,
              ...(language ? [`Die Sprache ist bereits auf ${language} gesetzt; rufe set_language nur auf, wenn die Person in eine andere Sprache wechselt.`] : []),
            ].join("\n"),
            tools: [setLanguageTool, saveAnswerTool, declineAnswerTool],
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
  await persist(log);
  response.status(204).end();
});

// Called by the browser when the backend model calls set_language.
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
  return { open_core: labelsOf(core), open_extended: labelsOf(openFields(log, "extended")), core_complete: core.length === 0 };
}

// Called by the browser when the backend model calls decline_answer. The detail goes to a
// Pax colleague for the final assessment instead of being asked again and again.
app.post("/api/conversations/:sessionId/declined", sameOrigin, async (request, response) => {
  const session = findSession(request, response);
  if (!session) return;
  const { log } = session;
  const { field_id: fieldId, reason } = request.body ?? {};
  const field = fieldsById.get(fieldId);
  if (!field) {
    response.json({ ok: false, reason: "Unbekanntes Feld." });
    return;
  }
  const at = new Date().toISOString();
  const note = typeof reason === "string" ? reason.slice(0, 300) : "";
  // First refusal: Paxi may ask once more later. Only a second refusal goes to a colleague.
  if (log.answers[fieldId].status !== "declined_once") {
    log.answers[fieldId] = { ...log.answers[fieldId], value: null, status: "declined_once", note, updatedAt: at };
    log.events.push({ type: "answer_declined_once", at, fieldId, reason: note });
    await persist(log);
    response.json({
      ok: true,
      field_id: fieldId,
      handed_to_colleague: false,
      next: "Nimm es leicht und wechsle das Thema. Frag später, wenn es passt, höchstens noch einmal sanft nach und sag kurz, warum es hilft. Erwähne noch keine Kollegin und keinen Kollegen.",
    });
    return;
  }
  log.answers[fieldId] = { ...log.answers[fieldId], value: null, status: "declined", note, updatedAt: at };
  log.humanFollowUp = [...(log.humanFollowUp ?? []).filter((item) => item.fieldId !== fieldId), { fieldId, label: field.label, reason: note, at }];
  log.events.push({ type: "answer_declined", at, fieldId, reason: note });
  await persist(log);
  response.json({ ok: true, field_id: fieldId, handed_to_colleague: true, ...progress(log) });
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
    log.answers[fieldId] = { ...log.answers[fieldId], value: result.value, status: "captured", updatedAt: at };
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

  response.json({
    saved: result.ok,
    field_id: fieldId,
    ...(result.ok ? { value: result.value } : { reason: result.reason }),
    ...progress(log),
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
Core details still open: ${labelsOf(openFields(log, "core")).join(", ") || "none"}.
Now, in ${language} and using the informal form, ${
    firstSwitch
      ? "say warmly in your own words that you would love to get to know them a bit (if the history shows you already confirmed the language, do not confirm it again). If they already said their name, use it; otherwise ask how you may call them."
      : "smoothly pick up the conversation where it left off."
  }`;
}

function resumption(log) {
  const language = log.language ? languages[log.language].name : "the language they used before";
  const open = labelsOf(openFields(log, "core"));
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
