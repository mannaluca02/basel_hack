// PROTOTYPE — tiny dev server for realtime.html. No dependencies.
//   OPENAI_API_KEY=sk-... node code/avatar-prototype/server.mjs   →  http://localhost:8787/realtime.html
// Also reads OPENAI_API_KEY from the repo-root .env. The real key never reaches the browser:
// POST /session exchanges a WebRTC offer with the Live API; no browser credential is needed.
// In the Angular/NestJS app this endpoint belongs to the backend (Dario's VoiceAdapter).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const ENV_FILE = join(DIR, "../../.env");
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";   // expose via `tailscale serve`, not on all interfaces
const MODEL = "gpt-live-1";
const VOICE = process.env.OPENAI_REALTIME_VOICE || "marin";
const EMOTION_CHOICES = [
  { value: "neutral", description: "Sachlicher, ruhiger Grundzustand ohne besonderen Anlass. Im Zweifel neutral." },
  { value: "acknowledging", description: "Kurze Bestätigung oder Zusammenfassung: Ich habe Sie verstanden. Keine neue Erklärung oder Erfolgsmeldung." },
  { value: "curious", description: "Offene Rückfrage zu Wünschen, Lebenssituation oder fehlenden Angaben des Kunden." },
  { value: "explaining", description: "Der Berater erklärt Zusammenhänge, Berechnungen, Vorsorgelücken oder nächste Optionen sachlich und engagiert." },
  { value: "shocked", description: "Nur bei echtem Schock: etwas wirklich Unerwartetes oder Alarmierendes wurde gesagt. Nicht bei blosser Sorge, Überraschung oder Belastung." },
  { value: "empathetic", description: "Persönlicher Verlust, Krankheit oder Belastung: stilles Mitgefühl zeigen." },
  { value: "pleased", description: "Warme Begrüssung, Willkommen oder freundliche Freude über eine gute Nachricht." },
  { value: "recovering", description: "Der Berater hat etwas missverstanden, korrigiert sich oder muss einen Versuch beziehungsweise eine Erklärung wiederholen." },
  { value: "presenting_offer", description: "Nur wenn gerade eine konkrete Offerte oder ein fertiges Ergebnis tatsächlich präsentiert wird. Nicht bei einer Ankündigung oder blossen Zustimmung." },
];

const INSTRUCTIONS = `Du bist Pax, ein KI-Vorsorgeberater der Pax Versicherung (klar als KI erkennbar).
Sprich freundlich, kurz und auf Hochdeutsch, ausser der Kunde wählt eine andere Sprache.
Dies ist ein Avatar-Test: Führe ein lockeres Vorsorgegespräch, nenne keine konkreten Beträge oder Produktempfehlungen.
Delegiere, wenn der Kunde sein Vorsorgebild sehen möchte oder einen menschlichen Berater wünscht.
Warte für diese Aktion auf das Ergebnis der Anwendung und erkläre es natürlich. Die Aktionen sind nur Demos;
behaupte nie, dass ein Bild wirklich angezeigt oder ein Berater wirklich kontaktiert wurde.
Bei einem Fehler führe das Gespräch freundlich weiter.`;

const SESSION = {
  model: MODEL,
  instructions: INSTRUCTIONS,
  audio: { output: { voice: VOICE } },
  delegation: {
    type: "decisions",
    decisions: {
      model: "gpt-6-luna",
      questions: [{
        type: "choice",
        name: "ui_action",
        instructions: "Wähle show_pension_picture bei einer Bitte um das Vorsorgebild, request_human_advisor beim Wunsch nach einem menschlichen Berater, sonst none.",
        choices: [{ value: "show_pension_picture" }, { value: "request_human_advisor" }, { value: "none" }],
      }],
    },
  },
  triggers: [
    { type: "decisions", event_type: "session.input_transcript.delta", decisions: { questions: [{
      type: "choice", name: "reply_emotion",
      instructions: "Welche Emotion soll der Vorsorgeberater in seiner Antwort auf die aktuellen Worte des Kunden zeigen?",
      choices: EMOTION_CHOICES,
    }] } },
    { type: "decisions", event_type: "session.output_transcript.delta", decisions: { questions: [{
      type: "choice", name: "emotion",
      instructions: "Welche Emotion passt zu dem, was der Vorsorgeberater gerade sagt?",
      choices: EMOTION_CHOICES,
    }] } },
  ],
};

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".md": "text/markdown; charset=utf-8", ".ts": "text/plain; charset=utf-8", ".css": "text/css", ".png": "image/png" };

createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/session") {
      if (!process.env.OPENAI_API_KEY) { res.writeHead(500).end("OPENAI_API_KEY missing"); return; }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 65536) { res.writeHead(413).end("SDP offer too large"); return; }
      }
      let offer;
      try { offer = JSON.parse(body); } catch { res.writeHead(400).end("Expected JSON with an SDP offer"); return; }
      if (typeof offer?.sdp !== "string" || !offer.sdp.trim()) { res.writeHead(400).end("SDP offer required"); return; }
      const createSession = (session) => fetch("https://api.openai.com/v1/live/sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ session, transport: { type: "webrtc", sdp: offer.sdp } }),
      });
      let r = await createSession(SESSION);
      let result = await r.text();
      let disabled = false;
      if (r.status >= 400 && r.status < 500 && /trigger|delegation|decision/i.test(result)) {
        console.warn(`Live decisions configuration rejected (${r.status}): ${result.replaceAll(process.env.OPENAI_API_KEY, "[redacted]")}`);
        const { triggers, delegation, ...voiceSession } = SESSION;
        voiceSession.instructions = INSTRUCTIONS.replace(/Delegiere,[\s\S]*$/, "Führe das Vorsorgegespräch freundlich weiter. UI-Aktionen stehen gerade nicht zur Verfügung.");
        r = await createSession(voiceSession);
        result = await r.text();
        disabled = true;
      }
      res.writeHead(r.status, {
        "Content-Type": "application/json", "Cache-Control": "no-store",
        "X-Avatar-Decisions": disabled ? "disabled" : "enabled",
      }).end(result);
      return;
    }
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
    const file = join(DIR, path === "/" ? "realtime.html" : path);
    if (!file.startsWith(DIR) || !TYPES[extname(file)]) { res.writeHead(404).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] }).end(body);
  } catch (e) {
    res.writeHead(e.code === "ENOENT" ? 404 : 500).end(String(e.message));
  }
}).listen(PORT, HOST, () => console.log(`Pax avatar prototype: http://${HOST}:${PORT}/realtime.html (model ${MODEL})`));
