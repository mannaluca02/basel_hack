// Conversation log: one JSON file per GPT-Live session with the transcript,
// the questionnaire answers and the notable session events.
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Fragments of the same speaker closer than this are merged into one turn.
const TURN_GAP_MS = 1200;
const MAX_TEXT_LENGTH = 200;
const MAX_AMOUNT_CHF = 100_000_000;

// A conversation can span several GPT-Live sessions when Paxi switches to a native
// voice; they share one log, named after the first session.
export function createLog({ conversationId, questionnaire, model }) {
  return {
    schemaVersion: "1.1",
    conversationId,
    status: "active",
    startedAt: new Date().toISOString(),
    endedAt: null,
    model,
    language: null,
    sessions: [],
    questionnaire: {
      id: questionnaire.id,
      version: questionnaire.version,
      locale: questionnaire.locale,
    },
    answers: Object.fromEntries(
      questionnaire.fields.map((field) => [
        field.id,
        { label: field.label, tier: field.tier ?? "core", value: null, status: "open", updatedAt: null },
      ]),
    ),
    transcript: [],
    events: [],
    // Details the person did not want to give; a Pax colleague clarifies them.
    humanFollowUp: [],
  };
}

export function addSession(log, { sessionId, voice, language, offsetMs }) {
  const session = { sessionId, voice, language, offsetMs, startedAt: new Date().toISOString(), endedAt: null, usage: null };
  log.sessions.push(session);
  return session;
}

// Transcript deltas carry no turn IDs, so turns are grouped by speaker and timing.
// reply_id marks the turn with a message ID given from outside (a confirmation question the
// customer app created); such a turn is never merged with the turn before it.
export function addTranscriptFragment(log, { speaker, text, start_ms, end_ms, reply_id }) {
  let turn = null;
  for (let i = log.transcript.length - 1; i >= 0; i--) {
    if (log.transcript[i].speaker === speaker) {
      turn = log.transcript[i];
      break;
    }
  }
  if (turn && start_ms - turn.end_ms <= TURN_GAP_MS && turn.replyId === reply_id) {
    turn.text += text;
    turn.end_ms = Math.max(turn.end_ms, end_ms);
    return;
  }
  log.transcript.push({ speaker, text, start_ms, end_ms, ...(reply_id ? { replyId: reply_id } : {}) });
  log.transcript.sort((a, b) => a.start_ms - b.start_ms);
}

export function validateAnswer(field, rawValue) {
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!value) return { ok: false, reason: "Der Wert ist leer." };

  if (field.type === "string") {
    if (value.length > MAX_TEXT_LENGTH) return { ok: false, reason: "Der Wert ist zu lang." };
    return { ok: true, value };
  }

  if (field.type === "date") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const date = match && new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
    if (!date || date.toISOString().slice(0, 10) !== value) {
      return { ok: false, reason: "Das Datum muss im Format JJJJ-MM-TT gültig sein." };
    }
    const now = new Date();
    if (date > now) return { ok: false, reason: "Das Datum liegt in der Zukunft." };
    if (now.getUTCFullYear() - date.getUTCFullYear() > 120) {
      return { ok: false, reason: "Das Datum liegt mehr als 120 Jahre zurück." };
    }
    return { ok: true, value };
  }

  if (field.type === "integer") {
    if (!/^-?\d+$/.test(value)) return { ok: false, reason: "Bitte eine ganze Zahl." };
    const number = Number(value);
    if (field.min !== undefined && number < field.min) return { ok: false, reason: `Der Wert muss mindestens ${field.min} sein.` };
    if (field.max !== undefined && number > field.max) return { ok: false, reason: `Der Wert darf höchstens ${field.max} sein.` };
    return { ok: true, value: number };
  }

  if (field.type === "money") {
    // Accepts "85000", "85'000", "85 000" and "CHF 85000".
    const cleaned = value.replace(/^CHF\s*/i, "").replace(/['’\s]/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { ok: false, reason: "Bitte einen Betrag in Franken, z. B. 85000." };
    const amount = Number(cleaned);
    if (amount > MAX_AMOUNT_CHF) return { ok: false, reason: "Der Betrag ist unrealistisch hoch." };
    return { ok: true, value: amount };
  }

  if (field.type === "enum") {
    if (!field.options.includes(value)) return { ok: false, reason: `Erlaubt sind: ${field.options.join(", ")}.` };
    return { ok: true, value };
  }

  if (field.type === "boolean") {
    const normalized = value.toLowerCase();
    if (["true", "ja", "yes", "oui", "sì", "si"].includes(normalized)) return { ok: true, value: true };
    if (["false", "nein", "no", "non"].includes(normalized)) return { ok: true, value: false };
    return { ok: false, reason: "Bitte true oder false." };
  }

  return { ok: false, reason: `Unbekannter Feldtyp ${field.type}.` };
}

// Open details of one tier. Declined details go to a Pax colleague, so Paxi does not ask
// for them again; "declined_once" stays open for one more gentle try.
export function openFields(log, tier = "core") {
  return Object.entries(log.answers)
    .filter(([, answer]) => (answer.tier ?? "core") === tier)
    .filter(([, answer]) => answer.status === "open" || answer.status === "declined_once")
    .map(([id]) => id);
}

export async function saveLog(directory, log) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${log.conversationId}.json`);
  // Write to a temporary file first so a crash never leaves half a JSON file.
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(log, null, 2) + "\n", "utf8");
  await rename(temporaryPath, path);
  return path;
}
