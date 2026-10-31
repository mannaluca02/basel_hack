// Helpers for the Paxi voice client (kept separate so other clients can reuse them).

export function wordsOf(text) {
  return text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
}

const FILLERS = new Set(["mhm", "hm", "hmm", "ähm", "äh", "ehm", "uh", "um", "mm", "ah", "oh"]);

// True when a transcript fragment contains actual words, not just breathing, background
// noise tags like "[sniff]" or fillers. Noise must not count as the person being active.
export function isSpeech(text) {
  const words = wordsOf(text.replace(/\[[^\]]*\]?/g, " ").replace(/^[^\[]*\]/, " "));
  return words.some((word) => !FILLERS.has(word) && word.length > 1);
}

// "Ciao" is left out on purpose: in Italian it is also a greeting.
const GOODBYES = [
  "tschüss", "tschüs", "tschau", "adieu", "uf wiederluege", "uf wiederhöre", "mach's gut", "machs gut", "bis bald", "auf wiedersehen", "auf wiederhören",
  "au revoir", "à bientôt", "bonne journée", "arrivederci", "a presto", "buona giornata", "goodbye", "bye bye", "take care",
];
const GOODBYE_PATTERN = new RegExp(`(^|[^\\p{L}])(${GOODBYES.join("|")})($|[^\\p{L}])`, "iu");

/** True when Paxi's words sound like a farewell. */
export function isGoodbye(text) {
  return GOODBYE_PATTERN.test(text.replace(/[’]/g, "'"));
}

/** The quiet note that tells Paxi what is known and what is still missing. */
export function progressNote(progress) {
  if (progress.complete) {
    const planning = progress.open_planning ?? [];
    return planning.length
      ? `The core and extended details are complete. If the person has time, find out these details for the calculation, compactly and in plain words: ${planning.join(", ")}. If they want to finish: summarise, propose your plans, say a colleague of yours will look at your proposals and get in touch with an assessment, and say goodbye once.`
      : "Everything is complete. Now summarise and check, propose your plans (skill \"Proposing plans\"), then say a colleague of yours will look at your proposals and get in touch with an assessment, and say goodbye once.";
  }
  const open = [...progress.open_core, ...progress.open_extended];
  const priority = progress.open_priority ?? [];
  return [
    progress.known ? `Already known (never ask again): ${progress.known}.` : "",
    priority.length ? `The app especially needs these next: ${priority.join(", ")}. Steer the conversation there at the next natural moment.` : "",
    `Still open: ${open.join(", ")}. Find these out naturally in the conversation, in whatever order fits. Do not start wrapping up on your own yet. But if the person wants to end, respect it: summarise briefly, propose what you can, and say goodbye without asking anything else.`,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function postJson(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok && response.status !== 204) {
    const text = await response.text();
    let message = text;
    try {
      message = JSON.parse(text).error ?? text;
    } catch {
      // Not JSON; keep the text as it is.
    }
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}

/**
 * Polls the server for answers the extractor found in the conversation. Calls onChanges
 * with new answers, and onNote whenever what is open changes, so Paxi gets a quiet note.
 */
export function createProgressPoller({ baseUrl, sessionId, onChanges, onNote, intervalMs = 1500 }) {
  let version = 0;
  let lastNote = "";
  let latest = null;
  const tick = async () => {
    try {
      const response = await fetch(`${baseUrl}/api/conversations/${sessionId()}/progress?since=${version}`);
      if (!response.ok) return;
      const progress = await response.json();
      latest = progress;
      if (progress.changes.length) onChanges(progress.changes);
      version = progress.version;
      const note = progressNote(progress);
      // Only the open list matters for the note; known values alone do not trigger a new one.
      const key = `${progress.complete}|${progress.open_priority}|${progress.open_core}|${progress.open_extended}|${progress.open_planning}`;
      if (key !== lastNote) {
        lastNote = key;
        onNote(note);
      }
    } catch (error) {
      console.error("Progress poll failed", error);
    }
  };
  const timer = setInterval(tick, intervalMs);
  tick();
  return {
    stop: () => clearInterval(timer),
    get latest() {
      return latest;
    },
  };
}
