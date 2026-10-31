// Conversation log: one JSON file per GPT-Live session with the transcript,
// the questionnaire answers and the notable session events.
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Fragments of the same speaker closer than this are merged into one turn.
const TURN_GAP_MS = 1200;
const MAX_TEXT_LENGTH = 200;

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
        { label: field.label, value: null, status: "open", updatedAt: null },
      ]),
    ),
    transcript: [],
    events: [],
  };
}

export function addSession(log, { sessionId, voice, language, offsetMs }) {
  const session = { sessionId, voice, language, offsetMs, startedAt: new Date().toISOString(), endedAt: null, usage: null };
  log.sessions.push(session);
  return session;
}

// Transcript deltas carry no turn IDs, so turns are grouped by speaker and timing.
export function addTranscriptFragment(log, { speaker, text, start_ms, end_ms }) {
  let turn = null;
  for (let i = log.transcript.length - 1; i >= 0; i--) {
    if (log.transcript[i].speaker === speaker) {
      turn = log.transcript[i];
      break;
    }
  }
  if (turn && start_ms - turn.end_ms <= TURN_GAP_MS) {
    turn.text += text;
    turn.end_ms = Math.max(turn.end_ms, end_ms);
    return;
  }
  log.transcript.push({ speaker, text, start_ms, end_ms });
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

  return { ok: false, reason: `Unbekannter Feldtyp ${field.type}.` };
}

export function openFields(log) {
  return Object.entries(log.answers)
    .filter(([, answer]) => answer.status !== "captured")
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
