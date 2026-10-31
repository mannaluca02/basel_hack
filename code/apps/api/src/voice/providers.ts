import { z } from 'zod';
import { VoiceConnectionSchema, type VoiceConnection, type VoiceProvider } from '@pax/contracts';
import { WorkflowError } from '../insurance/types.js';
export interface VoiceGateway {
    readonly id: VoiceProvider;
    open(input: {
        sdp?: string;
        locale: string;
        prompt: string;
    }, signal: AbortSignal): Promise<{
        providerSessionId: string;
        connection: VoiceConnection;
    }>;
    stop(providerSessionId: string): Promise<'requested' | 'client_required'>;
}
async function jsonRequest(fetcher: typeof fetch, url: string, init: RequestInit) {
    try {
        const r = await fetcher(url, { ...init, redirect: 'error' });
        if (!r.ok) {
            await r.body?.cancel();
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
    }, signal: AbortSignal) {
        if (!input.sdp?.startsWith('v='))
            throw new WorkflowError('VOICE_SDP_REQUIRED', 422);
        const data = await jsonRequest(this.fetcher, 'https://api.openai.com/v1/live/sessions', { method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
            headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ session: { model: this.model, instructions: input.prompt, audio: { output: { voice: this.voice } }, store: false }, transport: { type: 'webrtc', sdp: input.sdp } }) });
        const schema = z.object({ session: z.object({ id: z.string().min(1).max(200) }), transport: z.object({ type: z.literal('webrtc'), sdp: z.string().min(1).max(150000) }) });
        const parsed = schema.safeParse(data);
        if (!parsed.success)
            throw new WorkflowError('VOICE_PROVIDER_RESPONSE_INVALID', 502);
        return { providerSessionId: parsed.data.session.id, connection: VoiceConnectionSchema.parse({ provider: this.id, session: { id: parsed.data.session.id }, transport: parsed.data.transport }) };
    }
    async stop(id: string) {
        try {
            const r = await this.fetcher(`https://api.openai.com/v1/live/sessions/${encodeURIComponent(id)}/hangup`, { method: 'POST', headers: { Authorization: `Bearer ${this.key}` }, redirect: 'error', signal: AbortSignal.timeout(3000) });
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
        return { providerSessionId: parsed.data.conversation_id, connection: VoiceConnectionSchema.parse({ provider: this.id, token: parsed.data.token, conversationId: parsed.data.conversation_id, agentId: this.agentId }) };
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
};
export function gatewaysFor(options: VoiceOptions) {
    if (options.gateways)
        return options.gateways;
    return [...(options.openAiApiKey ? [new OpenAiLiveGateway(options.openAiApiKey, options.liveModel, options.liveVoice)] : []),
        ...(options.elevenLabsApiKey && options.elevenLabsAgentId ? [new ElevenLabsGateway(options.elevenLabsApiKey, options.elevenLabsAgentId)] : [])];
}
