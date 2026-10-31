// PROTOTYPE — tiny dev server for realtime.html. No dependencies.
//   OPENAI_API_KEY=sk-... node code/avatar-prototype/server.mjs   →  http://localhost:8787/realtime.html
// Also reads OPENAI_API_KEY from the repo-root .env. The real key never reaches the browser:
// POST /session mints a short-lived client secret for one WebRTC call.
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
const MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-live-1";
const VOICE = process.env.OPENAI_REALTIME_VOICE || "marin";

// Emotions the model may choose. listening/thinking are driven by conversation state, not by the model.
const MODEL_EMOTIONS = ["neutral", "happy", "empathetic", "concerned", "surprised", "celebrating"];

const INSTRUCTIONS = `Du bist Pax, ein KI-Vorsorgeberater der Pax Versicherung (klar als KI erkennbar).
Sprich freundlich, kurz und auf Hochdeutsch, ausser der Kunde wählt eine andere Sprache.
Dies ist ein Avatar-Test: Führe ein lockeres Vorsorgegespräch, nenne keine konkreten Beträge oder Produktempfehlungen.

Dein Avatar zeigt Gefühle. Rufe am Anfang JEDER Antwort zuerst das Tool set_emotion auf und sprich direkt danach weiter:
- neutral: sachliche Information
- happy: Begrüssung, gute Nachricht, Zustimmung
- empathetic: schwierige Themen wie Tod, Krankheit, Erwerbsunfähigkeit, Trennung
- concerned: du erkennst ein Risiko oder eine mögliche Vorsorgelücke
- surprised: der Kunde erzählt etwas Unerwartetes oder Neues
- celebrating: ein Ziel ist erreicht oder ein Abschluss ist erfolgt`;

const SESSION = {
  type: "realtime",
  model: MODEL,
  instructions: INSTRUCTIONS,
  audio: { output: { voice: VOICE } },
  tools: [{
    type: "function",
    name: "set_emotion",
    description: "Sets the facial expression of the Pax avatar for the reply you are about to speak.",
    parameters: {
      type: "object",
      properties: { emotion: { type: "string", enum: MODEL_EMOTIONS } },
      required: ["emotion"],
    },
  }],
  tool_choice: "auto",
};

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };

createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/session") {
      if (!process.env.OPENAI_API_KEY) { res.writeHead(500).end("OPENAI_API_KEY missing"); return; }
      const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ session: SESSION }),
      });
      res.writeHead(r.status, { "Content-Type": "application/json" }).end(await r.text());
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
