// One-off: creates one of Paxi's prompt-to-voice voices and prints its ID.
//   node create-voice.mjs              -> multilingual Paxi voice (LIVE_VOICE_ID)
//   node create-voice.mjs italian      -> Italian-only Paxi voice (LIVE_VOICE_ID_IT)
// Put the printed line into the repo root .env. Each run saves a new voice.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { customVoices } from "./paxi-voice.mjs";

const here = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(resolve(here, "../../.env"));
} catch {
  // No .env at the repo root; rely on the process environment.
}
if (!process.env.OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY in the repo root .env");
  process.exit(1);
}

const kind = process.argv[2] ?? "multilingual";
const voice = customVoices[kind];
if (!voice) {
  console.error(`Unknown voice "${kind}". Choose one of: ${Object.keys(customVoices).join(", ")}`);
  process.exit(1);
}

const response = await fetch("https://api.openai.com/v1/audio/voices", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    type: "prompt",
    name: voice.name,
    prompt: voice.prompt,
    script_hint: voice.scriptHint,
    model: "auto",
  }),
});
const body = await response.json();
if (!response.ok) {
  console.error("Voice creation failed", response.status, body.error?.message ?? body);
  process.exit(1);
}
console.log(`${voice.env}=${body.id}`);
