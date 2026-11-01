import { openAiResponsesTransport } from './erni-dialog/responses.js';
import type { RuntimeOptions } from './insurance/runtime.js';

type Env = Readonly<Record<string, string | undefined>>;

/** The port of `npm start`; PORT or 3000. */
export function livePort(env: Env): number {
  const port = Number(env['PORT'] ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return port;
}

/**
 * What `npm start` builds the backend with, from the environment (the root .env): the live
 * calculator, the demo start, the voice providers and the model extraction. The live voice in
 * the app needs model-v1, so voice or extraction with a key wires the OpenAI transport; without a
 * key the extraction stays off.
 */
export function liveAppOptions(env: Env): RuntimeOptions {
  const key = env['OPENAI_API_KEY'];
  const extraction = env['PAX_SYNTHETIC_EXTRACTION_ENABLED'] === '1' || env['PAX_SYNTHETIC_VOICE_ENABLED'] === '1';
  return {
    providerMode: 'live',
    demoStart: env['PAX_DEMO_START'] === '1',
    token: env['LOGISMATA_BEARER_TOKEN'] ?? '',
    modelExtraction: extraction && key ? { enabled: true, transport: openAiResponsesTransport(key) }
      : { enabled: env['PAX_SYNTHETIC_EXTRACTION_ENABLED'] === '1' },
    voice: {
      enabled: env['PAX_SYNTHETIC_VOICE_ENABLED'] === '1',
      ...(key ? { openAiApiKey: key } : {}),
      ...(env['ELEVENLABS_API_KEY'] ? { elevenLabsApiKey: env['ELEVENLABS_API_KEY'] } : {}),
      ...(env['ELEVENLABS_AGENT_ID'] ? { elevenLabsAgentId: env['ELEVENLABS_AGENT_ID'] } : {}),
      ...(env['LIVE_MODEL'] ? { liveModel: env['LIVE_MODEL'] } : {}),
      ...(env['LIVE_VOICE'] ? { liveVoice: env['LIVE_VOICE'] } : {}),
      // GPT-Live's background model reads the turns (LIVE_REPORTS=0: the backend reads them itself).
      reports: extraction && !!key && env['LIVE_REPORTS'] !== '0',
    },
  };
}

type VoiceAgentModule = { startVoiceAgent(): Promise<unknown> };

/**
 * Dario's voice agent (Paxi, code/voice-agent) runs in this process instead of a second one. It
 * keeps its own port (3100): its page, origin checks and the app's postMessage link rely on that
 * origin. It talks to this backend over HTTP like any client. Only with PAX_VOICE_AGENT=1 (the
 * app's `paxi` configuration, `npm run dev:paxi`); the other configurations use the live voice in
 * the app. A missing install or a taken port only costs Paxi, never the backend: the result says
 * what happened.
 */
export async function startVoiceAgent(
  env: Record<string, string | undefined>,
  load: () => Promise<VoiceAgentModule> = () =>
    import(new URL('../../../voice-agent/server.mjs', import.meta.url).href) as Promise<VoiceAgentModule>,
): Promise<{ started: boolean; warning?: string }> {
  if (env['PAX_VOICE_AGENT'] !== '1') return { started: false };
  env['PAX_VOICE_AGENT_PORT'] ??= '3100';
  try {
    await (await load()).startVoiceAgent();
    return { started: true };
  } catch (error) {
    const busy = (error as { code?: string })?.code === 'EADDRINUSE';
    return {
      started: false,
      warning: `Voice agent (Paxi) not started: ${busy ? `port ${env['PAX_VOICE_AGENT_PORT']} is taken (a separate Paxi still running?)` : `${error instanceof Error ? error.message : String(error)} (npm install in code/voice-agent?)`}`,
    };
  }
}
