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
import { extractAnswers } from "./answer-extractor.mjs";
import { createCaseBridge } from "./case-bridge.mjs";
import { extractContext } from "./conversation-context.mjs";
import { detectLanguage } from "./language-detect.mjs";
import { customVoices } from "./paxi-voice.mjs";
import { withoutForeignScript } from "./public/paxi-common.js";
import { loadSkills, skillsPrompt } from "./skills.mjs";
import { createCommandQueue, steerCommand } from "./steering.mjs";
import { timingSafeEqual } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(resolve(here, "../../.env"));
} catch {
  // No .env at the repo root; rely on the process environment.
}

// 3100, so it runs next to the case backend on 3000. Inside the backend process (see
// apps/api/src/main.ts) PAX_VOICE_AGENT_PORT sets it, so the backend's PORT does not apply.
const port = Number(process.env.PAX_VOICE_AGENT_PORT ?? process.env.PORT ?? 3100);
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
// PAXI_LOG_DIR moves the logs, e.g. for tests; the default stays in data/ (gitignored).
const logDirectory = resolve(process.env.PAXI_LOG_DIR ?? resolve(here, "data/conversations"));
// Valentin's case backend; Paxi proposes what it heard there once the app linked a case.
const bridge = createCaseBridge({ apiUrl: process.env.PAX_API_URL ?? "http://127.0.0.1:3000" });
// The customer app that may hand a case to Paxi (see /api/case-link).
const appOrigins = new Set((process.env.PAX_APP_ORIGINS ?? "http://localhost:4200,http://127.0.0.1:4200").split(",").map((o) => o.trim()));
const questionnaire = JSON.parse(await readFile(resolve(here, "questionnaire.json"), "utf8"));
// Paxi collects core, extended and planning fields; colleague and suitability fields are
// left to a Pax colleague.
const voiceFields = questionnaire.fields.filter((field) => !["colleague", "suitability"].includes(field.tier));
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
// Skills assigned to Paxi (skills/*.md with "assigned: true"), added right after the persona.
const skills = await loadSkills(resolve(here, "skills"));
console.log(`Paxi skills: ${skills.map((skill) => skill.name).join(", ") || "none"}`);
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
function paxiPrompt({ language, voicePrompt, priorities = [] }) {
  const languageRule = language
    ? `Current conversation language: ${languages[language].name}, spoken with native pronunciation. If the person starts speaking another of your languages, follow them.`
    : `Languages: you speak German, French, Italian and English, each with native pronunciation. Continue in the language the person speaks.`;
  return `${persona}
${skillsPrompt(skills)}

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

Once the above is known, and only if the person has time, the details the calculation needs. Ask them compactly, in plain words, and say once why (so a colleague of yours can calculate what fits them). Rough numbers are fine; if they do not know, move on, a colleague will complete them:
${topicList("planning")}

${
    priorities.length
      ? `Right now the app especially needs: ${labelsOf(priorities).join(", ")}. Steer the conversation there early, in a natural way.\n\n`
      : ""
  }Only wrap up when the app's note says that everything is complete or handed to a colleague. If the person wants to stop before that, tell them in one sentence that only a few quick questions are left and ask them right away. If they still want to go, say that a colleague of yours will complete the rest with them.`;
}

// GPT-Live adds OpenAI's recommended policies (backchannel, interruption, delegation).
// gpt-live-1 delegates on <|SpawnThinking|>; the only backend task left is the language.
function liveInstructions(voiceOption, language, priorities) {
  return `${paxiPrompt({ language, voicePrompt: voiceOption.prompt, priorities })}

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

// Avatar emotions, as in Lukas's prototype (code/avatar-prototype/server.mjs, AVATAR-INTERFACE.md):
// GPT-Live classifies every transcript fragment. The person's words predict the tone of the
// reply ("reply_emotion"), Paxi's own words refine it ("emotion"). Keep the values in sync
// with ReplyEmotion in pax-avatar.d.ts.
const EMOTION_CHOICES = [
  { value: "neutral", description: "Sachlicher, ruhiger Grundzustand ohne besonderen Anlass. Im Zweifel neutral." },
  { value: "acknowledging", description: "Kurze Bestätigung oder Zusammenfassung: Ich habe dich verstanden. Keine neue Erklärung oder Erfolgsmeldung." },
  { value: "curious", description: "Offene Rückfrage zu Wünschen, Lebenssituation oder fehlenden Angaben der Person." },
  { value: "explaining", description: "Paxi erklärt Zusammenhänge, Berechnungen, Vorsorgelücken oder nächste Optionen sachlich und engagiert." },
  { value: "shocked", description: "Nur bei echtem Schock: etwas wirklich Unerwartetes oder Alarmierendes wurde gesagt. Nicht bei blosser Sorge, Überraschung oder Belastung." },
  { value: "empathetic", description: "Persönlicher Verlust, Krankheit oder Belastung: stilles Mitgefühl zeigen." },
  { value: "pleased", description: "Warme Begrüssung, Willkommen oder freundliche Freude über eine gute Nachricht." },
  { value: "recovering", description: "Paxi hat etwas missverstanden, korrigiert sich oder muss einen Versuch beziehungsweise eine Erklärung wiederholen." },
  { value: "presenting_offer", description: "Nur wenn gerade eine konkrete Offerte oder ein fertiges Ergebnis tatsächlich präsentiert wird. Nicht bei einer Ankündigung oder blossen Zustimmung." },
];
const emotionTriggers = [
  {
    type: "decisions",
    event_type: "session.input_transcript.delta",
    decisions: { questions: [{ type: "choice", name: "reply_emotion", instructions: "Welche Emotion soll Paxi in der Antwort auf die aktuellen Worte der Person zeigen?", choices: EMOTION_CHOICES }] },
  },
  {
    type: "decisions",
    event_type: "session.output_transcript.delta",
    decisions: { questions: [{ type: "choice", name: "emotion", instructions: "Welche Emotion passt zu dem, was Paxi gerade sagt?", choices: EMOTION_CHOICES }] },
  },
];

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
  // A linked conversation lives in the encrypted case; no second, unencrypted copy on disk.
  if (log.caseLink) return;
  try {
    await saveLog(logDirectory, log);
  } catch (error) {
    console.error("Could not write conversation log", log.conversationId, error.message);
  }
}

app.get("/api/questionnaire", (_request, response) => response.json(questionnaire));

// The customer app hands over a case-scoped agent grant after the person read the voice notice.
// Only the app's own origin may do this; the grant stays in this process and is never logged.
function fromApp(request, response, next) {
  const requestOrigin = request.headers.origin;
  if (!appOrigins.has(requestOrigin)) {
    response.status(403).json({ error: "Unexpected request origin" });
    return;
  }
  response.setHeader("Access-Control-Allow-Origin", requestOrigin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "POST, PUT");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept-Language");
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }
  next();
}
app.options("/api/case-link", fromApp);
app.options("/api/case-link/:linkId", fromApp);
// The app renews the 15-minute grant while Paxi is open, so a long call keeps syncing.
app.put("/api/case-link/:linkId", fromApp, (request, response) => {
  try {
    response.json(bridge.renew(request.params.linkId, request.body));
  } catch (error) {
    response.status(error.message === "Unknown link" ? 404 : 400).json({ error: error.message });
  }
});
app.post("/api/case-link", fromApp, (request, response) => {
  try {
    response.status(201).json(bridge.register(request.body));
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

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
  // Questions another part of the app wants answered first (see /priorities).
  const priorities = validPriorities(request.body.priorities) ?? earlierLog?.priorities ?? [];
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
    const sessionConfig = {
      model: liveModel,
      instructions: liveInstructions(voiceOption, language, priorities),
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
      triggers: emotionTriggers,
    };
    const create = (session) => client.live.create({ session, transport: { type: "webrtc", sdp: request.body.sdp } });
    let result;
    let emotions = true;
    try {
      result = await create(sessionConfig);
    } catch (error) {
      // Voice must work even if the project may not use Decisions: retry once without them.
      if (!(error instanceof OpenAI.APIError) || error.status >= 500 || !/trigger|decision/i.test(error.message)) throw error;
      console.warn("Emotion triggers rejected, starting without avatar emotions:", error.status, error.message);
      const { triggers, ...voiceOnly } = sessionConfig;
      result = await create(voiceOnly);
      emotions = false;
    }

    const sessionId = result.session.id;
    const log = earlierLog ?? createLog({ conversationId: sessionId, questionnaire, model: liveModel });
    conversations.set(log.conversationId, log);
    // Only the case reference is logged; the grant stays in the bridge.
    const caseLink = !earlierLog && request.body.link ? bridge.linkFor(request.body.link) : null;
    if (caseLink) {
      log.caseLink = caseLink;
      log.events.push({ type: "case_linked", at: new Date().toISOString(), caseId: caseLink.caseId });
    }
    if (!earlierLog && priorities.length) setPriorities(log, priorities, "start");
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
      emotions,
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
      // Words in another script are misread noise (the browser drops them too).
      const text = fragment.speaker === "user" ? withoutForeignScript(fragment.text) : fragment.text;
      if (!text.trim()) continue;
      addTranscriptFragment(log, {
        speaker: fragment.speaker,
        text,
        start_ms: fragment.start_ms + entry.offsetMs,
        end_ms: fragment.end_ms + entry.offsetMs,
        reply_id: typeof fragment.reply_id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(fragment.reply_id) ? fragment.reply_id : undefined,
      });
    }
  }
  if (fragments.some((fragment) => fragment.speaker === "user")) scheduleExtraction(log);
  if (fragments.length && log.caseLink) bridge.turnsChanged(log.caseLink.linkId, log);
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
  if (changed && log.caseLink) bridge.answersChanged(log.caseLink.linkId, log);
}

// The browser polls this to update the UI and to give Paxi a quiet note of what is missing.
app.get("/api/conversations/:sessionId/progress", async (request, response) => {
  const session = findSession(request, response);
  if (!session) return;
  const { log } = session;
  const caseState = log.caseLink ? await caseStateFor(log) : null;
  const since = Number(request.query.since) || 0;
  const changes = Object.entries(log.answers)
    .filter(([, answer]) => (answer.version ?? 0) > since)
    .map(([fieldId, answer]) => ({ fieldId, value: answer.value, status: answer.status }));
  response.json({
    version: log.answersVersion ?? 0,
    changes,
    known: knownSummary(log),
    ...progress(log),
    commands: commands.since(log.conversationId, Number(request.query.commands) || 0),
    ...(log.caseLink
      ? {
          case_linked: caseState !== null,
          case_questions: caseState?.questions ?? [],
          case_recommendation: caseState?.recommendation ?? null,
          stop: caseState?.stop === true,
        }
      : {}),
  });
});

// Takes over what the shared case already knows, so Paxi does not ask for it again, and passes
// on the case's open clarifications and the stop for a human advisor. `null` once the grant expired.
async function caseStateFor(log) {
  const state = await bridge.caseState(log.caseLink.linkId).catch((error) => {
    console.error("Reading the linked case failed", error.code ?? error.message);
    return null;
  });
  if (!state) return null;
  const at = new Date().toISOString();
  for (const [fieldId, raw] of Object.entries(state.known)) {
    const field = fieldsById.get(fieldId);
    const answer = log.answers[fieldId];
    if (!field || !answer || answer.status === "captured") continue;
    const result = validateAnswer(field, String(raw));
    if (!result.ok) continue;
    log.answersVersion = (log.answersVersion ?? 0) + 1;
    log.answers[fieldId] = { ...answer, value: result.value, status: "captured", source: "case", updatedAt: at, version: log.answersVersion };
    bridge.markKnown(log.conversationId, fieldId, result.value);
  }
  return state;
}

// "Name: Dario Roth; Wohnort: …" for Paxi's notes.
function knownSummary(log) {
  return Object.values(log.answers)
    .filter((answer) => answer.status === "captured")
    .map((answer) => `${answer.label}: ${answer.value}`)
    .join("; ");
}

// Called by the browser when the backend model calls set_language ({ language }), or with
// the person's first words ({ text }) so the voice switch does not depend on the model.
app.post("/api/conversations/:sessionId/language", sameOrigin, async (request, response) => {
  const session = findSession(request, response);
  if (!session) return;
  const { log, entry } = session;
  // Only Paxi's four languages count; words in another script are noise.
  const text = typeof request.body?.text === "string" ? withoutForeignScript(request.body.text.slice(0, 500)) || null : null;
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
  const priorities = log.priorities ?? [];
  // Prioritised details first, in the order they were given.
  const byPriority = (ids) =>
    [...ids].sort((a, b) => (priorities.indexOf(a) + 1 || Infinity) - (priorities.indexOf(b) + 1 || Infinity));
  const core = byPriority(openFields(log, "core"));
  const extended = byPriority(openFields(log, "extended"));
  const planning = byPriority(openFields(log, "planning"));
  return {
    open_priority: labelsOf([...core, ...extended, ...planning].filter((id) => priorities.includes(id))),
    open_core: labelsOf(core),
    open_extended: labelsOf(extended),
    open_planning: labelsOf(planning),
    core_complete: core.length === 0,
    complete: core.length === 0 && extended.length === 0,
  };
}

// --- Priorities: another part of the app steers which questions come first ----------------

function validPriorities(value) {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.filter((id) => fieldsById.has(id)))];
}

function setPriorities(log, priorities, source) {
  log.priorities = priorities;
  log.events.push({ type: "priorities_set", at: new Date().toISOString(), fields: priorities, source });
}

// For example Earnie's advisor backend or the UI: { "fields": ["annual_gross_income_chf", ...] }.
// An empty list clears the priorities. The browser passes the result on to Paxi.
app.post("/api/conversations/:sessionId/priorities", sameOrigin, async (request, response) => {
  const session = findSession(request, response);
  if (!session) return;
  const priorities = validPriorities(request.body?.fields);
  if (!priorities) {
    response.status(400).json({ error: "fields must be a list of questionnaire field IDs" });
    return;
  }
  setPriorities(session.log, priorities, typeof request.body?.source === "string" ? request.body.source.slice(0, 60) : "api");
  await persist(session.log);
  response.json({ priorities, labels: labelsOf(priorities), ...progress(session.log) });
});

// --- Steering a running call: topics, visuals, priorities, end ---------------------------

const commands = createCommandQueue();
// Shared secret for Valentin's backend (POST /api/steer); without it, backend steering is off.
const steerToken = process.env.PAXI_STEER_TOKEN ?? "";

// What a visual shows (and what changed since the last version), in a few plain sentences:
// the caller's own description, or one the backend model writes from the data (for example
// a ChartResult from the web app).
async function describeVisual({ title, description, data, previous }) {
  if (description) return { description, change: null };
  if (data === undefined) return { description: "", change: null };
  try {
    client ??= new OpenAI({ maxRetries: 0 });
    const result = await client.responses.create({
      model: backendModel,
      reasoning: { effort: "low" },
      instructions:
        "This is the data of a visual (usually a chart) that a person sees on their screen during a conversation with a voice assistant. " +
        "In `description`, say in at most four short English sentences what it shows and what stands out, with rounded numbers. " +
        "If a previous version is given, say in `change` in at most two short sentences what changed and in which direction; otherwise set `change` to an empty string. " +
        "Money values with unit rappen are cents: divide by 100 for CHF. null means unknown; say so if it matters. No advice.",
      input: `Title: ${title}\n${previous?.data ? `Previous version: ${previous.data}\n` : ""}Current version: ${data}`,
      text: {
        format: {
          type: "json_schema",
          name: "visual",
          strict: true,
          schema: {
            type: "object",
            properties: { description: { type: "string" }, change: { type: "string" } },
            required: ["description", "change"],
            additionalProperties: false,
          },
        },
      },
    });
    const { description: said, change } = JSON.parse(result.output_text);
    return { description: said.trim().slice(0, 900), change: change.trim().slice(0, 400) || null };
  } catch (error) {
    console.error("Visual description failed", error.message);
    return { description: data.slice(0, 900), change: null };
  }
}

const steerContext = { describe: describeVisual, validFields: validPriorities, labelsOf, setPriorities };

// From Paxi's page (paxi.steer, paxi.showVisual, or the customer app via postMessage): the
// browser applies the returned command itself.
app.post("/api/conversations/:sessionId/steer", sameOrigin, async (request, response) => {
  const session = findSession(request, response);
  if (!session) return;
  const result = await steerCommand(session.log, request.body, steerContext);
  if (result.error) {
    response.status(400).json({ error: result.error });
    return;
  }
  await persist(session.log);
  response.json({ command: result.command, description: result.description, change: result.change });
});

// Kept for the first integration: same as steer with { type: "visual" }.
app.post("/api/conversations/:sessionId/visuals", sameOrigin, async (request, response) => {
  const session = findSession(request, response);
  if (!session) return;
  const result = await steerCommand(session.log, { ...request.body, type: "visual" }, steerContext);
  if (result.error) {
    response.status(400).json({ error: result.error });
    return;
  }
  await persist(session.log);
  response.json({ command: result.command, description: result.description, change: result.change });
});

function bearerMatches(request) {
  const given = Buffer.from(/^Bearer (.+)$/.exec(request.headers.authorization ?? "")?.[1] ?? "");
  const expected = Buffer.from(steerToken);
  return steerToken !== "" && given.length === expected.length && timingSafeEqual(given, expected);
}

// The running conversation for a case or conversation ID, the newest if there are several.
function activeConversation({ caseId, conversationId }) {
  const matching = [...conversations.values()].filter(
    (log) => log.status === "active" && (conversationId ? log.conversationId === conversationId : caseId && log.caseLink?.caseId === caseId),
  );
  return matching.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))[0] ?? null;
}

// From the backend, server to server: { caseId | conversationId, type, ... } with the shared
// secret as bearer token. The command waits for the browser's next progress poll (≤ 1.5 s).
app.post("/api/steer", async (request, response) => {
  if (!steerToken) {
    response.status(503).json({ error: "Backend steering is off; set PAXI_STEER_TOKEN" });
    return;
  }
  if (!bearerMatches(request)) {
    response.status(401).json({ error: "Invalid steering token" });
    return;
  }
  const log = activeConversation(request.body ?? {});
  if (!log) {
    response.status(404).json({ error: "No running Paxi conversation for this case" });
    return;
  }
  const result = await steerCommand(log, request.body, steerContext);
  if (result.error) {
    response.status(400).json({ error: result.error });
    return;
  }
  await persist(log);
  const queued = result.command ? commands.push(log.conversationId, result.command) : null;
  response.status(202).json({ conversationId: log.conversationId, queued: queued ? { type: queued.type, seq: queued.seq } : null, description: result.description, change: result.change });
});

// --- After a restart: the browser reattaches its running call (VOICE-10) ------------------

const SESSION_ID = /^[A-Za-z0-9_-]{1,120}$/;

// The voice server keeps sessions and case links in memory only. After a restart the browser
// still has its WebRTC call; it sends what it knows, and the conversation continues. An
// unlinked conversation comes back from its log file; a linked one is never written to disk,
// so it is rebuilt from the browser's transcript. With a fresh link from the customer app
// ({ link }), the case gets the call history and the proposals again.
app.post("/api/conversations/:sessionId/reattach", sameOrigin, async (request, response) => {
  const body = request.body ?? {};
  const sessionId = request.params.sessionId;
  const conversationId = body.conversationId;
  const known = Array.isArray(body.sessions) ? body.sessions.filter((s) => SESSION_ID.test(s?.sessionId ?? "") && Number.isFinite(s.offsetMs)) : [];
  if (!SESSION_ID.test(sessionId) || typeof conversationId !== "string" || !SESSION_ID.test(conversationId) || !known.some((s) => s.sessionId === sessionId)) {
    response.status(400).json({ error: "sessionId, conversationId and sessions are required" });
    return;
  }
  let log = sessions.get(sessionId)?.log ?? (await loadConversation(conversationId));
  const rebuilt = !log;
  if (rebuilt) {
    log = createLog({ conversationId, questionnaire, model: liveModel });
    log.language = languages[body.language] ? body.language : null;
  }
  if (log.conversationId !== conversationId) {
    response.status(404).json({ error: "Unknown conversation" });
    return;
  }
  log.status = "active";
  log.endedAt = null;
  for (const s of known) {
    const entry = log.sessions.find((e) => e.sessionId === s.sessionId) ?? addSession(log, { sessionId: s.sessionId, voice: String(s.voice ?? ""), language: log.language, offsetMs: s.offsetMs });
    sessions.set(s.sessionId, { log, entry });
  }
  if (rebuilt && Array.isArray(body.fragments)) {
    for (const { sessionId: from, fragment } of body.fragments.slice(-2000)) {
      const entry = log.sessions.find((e) => e.sessionId === from);
      if (!entry || !fragment || !["user", "agent"].includes(fragment.speaker) || typeof fragment.text !== "string") continue;
      if (!Number.isFinite(fragment.start_ms) || !Number.isFinite(fragment.end_ms)) continue;
      const text = fragment.speaker === "user" ? withoutForeignScript(fragment.text) : fragment.text;
      if (!text.trim()) continue;
      addTranscriptFragment(log, { speaker: fragment.speaker, text: text.slice(0, 4000), start_ms: fragment.start_ms + entry.offsetMs, end_ms: fragment.end_ms + entry.offsetMs, reply_id: fragment.reply_id });
    }
  }
  const caseLink = typeof body.link === "string" ? bridge.linkFor(body.link) : null;
  if (caseLink) {
    log.caseLink = caseLink;
    log.events.push({ type: "case_linked", at: new Date().toISOString(), caseId: caseLink.caseId, after: "restart" });
  }
  log.events.push({ type: "reattached", at: new Date().toISOString(), sessionId, rebuilt });
  conversations.set(conversationId, log);
  if (log.transcript.some((turn) => turn.speaker === "user")) scheduleExtraction(log);
  if (log.caseLink) bridge.turnsChanged(log.caseLink.linkId, log);
  await persist(log);
  response.json({ ok: true, rebuilt, case_linked: Boolean(log.caseLink && caseLink) });
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
    commands.clear(log.conversationId);
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
      ? "say warmly in your own words what this conversation is for (getting to know them so you can propose plans that fit their life at the end) and that it takes about ten minutes; if the history shows you already confirmed the language, do not confirm it again. If they already said their name, use it; otherwise ask how you may call them."
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

/** Starts listening; the case backend calls this to run Paxi in its own process. */
export function startVoiceAgent() {
  return new Promise((resolveStart, rejectStart) => {
    const server = app.listen(port, "127.0.0.1", (error) => {
      if (error) return rejectStart(error);
      console.log(`Voice agent: open ${origin}`);
      resolveStart(server);
    });
  });
}

// Run on its own: npm start in this folder.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await startVoiceAgent();
