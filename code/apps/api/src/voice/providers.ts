import { providerFetch } from '../provider-fetch.js';
import { z } from 'zod';
import { VoiceConnectionSchema, type VoiceConnection, type VoiceProvider } from '@pax/contracts';
import { WorkflowError } from '../insurance/types.js';
import { EMOTION_TRIGGERS } from './emotions.js';
import type { LiveDelegation } from './lab-delegation.js';
/** GPT-Live's background model and the prompt lines that tell Paxi when to hand a turn to it. */
export type VoiceDelegation = { session: LiveDelegation; policy: string };
export interface VoiceGateway {
    readonly id: VoiceProvider;
    open(input: {
        sdp?: string;
        locale: string;
        prompt: string;
        delegation?: VoiceDelegation;
    }, signal: AbortSignal): Promise<{
        providerSessionId: string;
        connection: VoiceConnection;
        /** Whether the session runs the background model (the browser then sends its reports). */
        delegated: boolean;
    }>;
    stop(providerSessionId: string): Promise<'requested' | 'client_required'>;
}
/**
 * A JSON request to a provider. `retry` may answer a refused request once with a second one
 * (e.g. without an optional feature); its decision sees the status and the error text only.
 */
async function jsonRequest(fetcher: typeof fetch, url: string, init: RequestInit, retry?: (status: number, error: string) => RequestInit | null) {
    try {
        let r = await providerFetch(fetcher, url, init);
        if (!r.ok && retry && r.status < 500) {
            const second = retry(r.status, (await r.text()).slice(0, 2000));
            if (second) r = await providerFetch(fetcher, url, second);
        }
        if (!r.ok) {
            await r.body?.cancel().catch(() => undefined);
            throw new WorkflowError('VOICE_PROVIDER_UNAVAILABLE', 503);
        }
        const text = await r.text();
        if (text.length > 200000)
            throw new Error('oversized');
        return JSON.parse(text) as unknown;
    }
    catch (error) {
        if (error instanceof WorkflowError)
            throw error;
        throw new WorkflowError('VOICE_PROVIDER_UNAVAILABLE', 503);
    }
}
export class OpenAiLiveGateway implements VoiceGateway {
    readonly id = 'gpt-live' as const;
    constructor(private readonly key: string, private readonly model = 'gpt-live-1', private readonly voice = 'juni', private readonly fetcher: typeof fetch = fetch) { }
    async open(input: {
        sdp?: string;
        locale: string;
        prompt: string;
        delegation?: VoiceDelegation;
    }, signal: AbortSignal) {
        if (!input.sdp?.startsWith('v='))
            throw new WorkflowError('VOICE_SDP_REQUIRED', 422);
        // With Paxi's emotion triggers and the background model; a project that may not use one of
        // them gets the voice without it (the backend then reads every turn itself).
        let delegated = !!input.delegation;
        const request = (triggers: boolean, delegation: VoiceDelegation | undefined): RequestInit => ({ method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
            headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ session: { model: this.model, instructions: delegation ? input.prompt + delegation.policy : input.prompt, audio: { output: { voice: this.voice } }, store: false,
                ...(triggers ? { triggers: EMOTION_TRIGGERS } : {}), ...(delegation ? { delegation: delegation.session } : {}) }, transport: { type: 'webrtc', sdp: input.sdp } }) });
        const data = await jsonRequest(this.fetcher, 'https://api.openai.com/v1/live/sessions', request(true, input.delegation), (_status, error) => {
            const triggers = /trigger|decision/i.test(error), delegation = !!input.delegation && /delegat|tool|function|responses/i.test(error);
            if (!triggers && !delegation) return null;
            if (delegation) delegated = false;
            return request(!triggers, delegation ? undefined : input.delegation);
        });
        const schema = z.object({ session: z.object({ id: z.string().min(1).max(200) }), transport: z.object({ type: z.literal('webrtc'), sdp: z.string().min(1).max(150000) }) });
        const parsed = schema.safeParse(data);
        if (!parsed.success)
            throw new WorkflowError('VOICE_PROVIDER_RESPONSE_INVALID', 502);
        return { providerSessionId: parsed.data.session.id, connection: VoiceConnectionSchema.parse({ provider: this.id, session: { id: parsed.data.session.id }, transport: parsed.data.transport }), delegated };
    }
    async stop(id: string) {
        try {
            const r = await providerFetch(this.fetcher, `https://api.openai.com/v1/live/sessions/${encodeURIComponent(id)}/hangup`, { method: 'POST', headers: { Authorization: `Bearer ${this.key}` }, signal: AbortSignal.timeout(3000) });
            if (!r.ok)
                throw new Error('hangup');
            await r.body?.cancel();
            return 'requested' as const;
        }
        catch {
            throw new WorkflowError('VOICE_PROVIDER_CLOSE_FAILED', 503);
        }
    }
}
export class ElevenLabsGateway implements VoiceGateway {
    readonly id = 'elevenlabs' as const;
    constructor(private readonly key: string, private readonly agentId: string, private readonly fetcher: typeof fetch = fetch) { }
    async open(_input: {
        locale: string;
        prompt: string;
    }, signal: AbortSignal) {
        const data = await jsonRequest(this.fetcher, `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(this.agentId)}`, { method: 'GET', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), headers: { 'xi-api-key': this.key } });
        const parsed = z.object({ token: z.string().min(1).max(16000), conversation_id: z.string().min(1).max(200) }).safeParse(data);
        if (!parsed.success)
            throw new WorkflowError('VOICE_PROVIDER_RESPONSE_INVALID', 502);
        return { providerSessionId: parsed.data.conversation_id, connection: VoiceConnectionSchema.parse({ provider: this.id, token: parsed.data.token, conversationId: parsed.data.conversation_id, agentId: this.agentId }), delegated: false };
    }
    async stop(_id: string) { return 'client_required' as const; }
}
export type VoiceOptions = {
    enabled?: boolean;
    gateways?: VoiceGateway[];
    openAiApiKey?: string;
    elevenLabsApiKey?: string;
    elevenLabsAgentId?: string;
    liveModel?: string;
    liveVoice?: string;
    /**
     * GPT-Live hands every turn with a detail to its background model (GPT-6 Luna), which reports
     * the extraction as tool calls (lab-delegation.ts). Needs the model extraction; off: the
     * backend reads every turn itself.
     */
    reports?: boolean;
    /**
     * Hosts that restart under a running call (a Cloudflare Durable Object after a deploy or a
     * move) keep established sessions: the WebRTC call runs between browser and provider, so it
     * survives the restart. Sessions still starting are interrupted as before. Node keeps the
     * default (off): there a restart follows an exit and the call is gone.
     */
    resumeAfterRestart?: boolean;
};
export function gatewaysFor(options: VoiceOptions) {
    if (options.gateways)
        return options.gateways;
    return [...(options.openAiApiKey ? [new OpenAiLiveGateway(options.openAiApiKey, options.liveModel, options.liveVoice)] : []),
        ...(options.elevenLabsApiKey && options.elevenLabsAgentId ? [new ElevenLabsGateway(options.elevenLabsApiKey, options.elevenLabsAgentId)] : [])];
}
