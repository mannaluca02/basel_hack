// ElevenLabs as an alternative voice provider for Paxi. The server keeps one ElevenLabs
// agent (created on first use) and hands the browser a short-lived WebRTC token per
// call. The Paxi prompt is passed per conversation as an override, so the agent itself
// only holds the voice, the languages and the permission to override.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const API = "https://api.elevenlabs.io/v1/convai";
export const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "v3V1d2rk6528UrLKRuy8";
const LLM = process.env.ELEVENLABS_LLM ?? "gpt-6-luna";

function agentConfig() {
  return {
    name: "Paxi (Pax LifeMap)",
    conversation_config: {
      agent: {
        // Empty: the browser plays the recorded intro, then the agent waits for the person.
        first_message: "",
        language: "de",
        prompt: {
          prompt: "You are Paxi. The full prompt is sent with every conversation.",
          llm: LLM,
          built_in_tools: {
            language_detection: { name: "language_detection", params: { system_tool_type: "language_detection" } },
          },
        },
      },
      // One multilingual voice covers all four languages; language detection switches ASR and TTS.
      language_presets: Object.fromEntries(["fr", "it", "en"].map((code) => [code, { overrides: { agent: { language: code } } }])),
      tts: { voice_id: ELEVENLABS_VOICE_ID },
      turn: { turn_timeout: 8 },
      conversation: { max_duration_seconds: 1800 },
    },
    platform_settings: {
      overrides: {
        conversation_config_override: {
          agent: { first_message: true, language: true, prompt: { prompt: true } },
        },
      },
    },
  };
}

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.detail?.message ?? data?.detail ?? response.statusText;
    throw Object.assign(new Error(`ElevenLabs ${method} ${path}: ${typeof message === "string" ? message : JSON.stringify(message)}`), {
      status: response.status,
    });
  }
  return data;
}

/**
 * Returns the ID of Paxi's ElevenLabs agent. It is created on first use and updated when
 * its configuration changes; the ID is kept in cacheFile (or set ELEVENLABS_AGENT_ID).
 */
export async function ensureAgent(cacheFile) {
  if (process.env.ELEVENLABS_AGENT_ID) return process.env.ELEVENLABS_AGENT_ID;
  const config = agentConfig();
  const hash = createHash("sha256").update(JSON.stringify(config)).digest("hex");
  const cached = await readFile(cacheFile, "utf8").then(JSON.parse, () => null);
  if (cached?.agentId && cached.hash === hash) return cached.agentId;
  let agentId = cached?.agentId;
  if (agentId) await api(`/agents/${agentId}`, { method: "PATCH", body: config });
  else ({ agent_id: agentId } = await api("/agents/create", { method: "POST", body: config }));
  await writeFile(cacheFile, JSON.stringify({ agentId, hash }, null, 2) + "\n");
  return agentId;
}

/** A short-lived token the browser uses to open the WebRTC conversation. */
export async function conversationToken(agentId) {
  const { token } = await api(`/conversation/token?agent_id=${encodeURIComponent(agentId)}`);
  return token;
}
