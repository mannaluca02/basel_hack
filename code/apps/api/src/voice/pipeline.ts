import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  AgentReplySchema, VoiceLogSchema, VoicePlaybackEventSchema,
  type AgentReply, type VoiceLog, type VoicePlaybackEvent,
} from '@pax/contracts';

const AudioSchema = z.object({
  bytes: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength > 0 && bytes.byteLength <= 10 * 1024 * 1024),
  mediaType: z.enum(['audio/wav', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/mp4']),
}).strict();
const InputSchema = VoiceLogSchema.omit({ text: true, source: true, transcriptStatus: true })
  .extend({ audio: AudioSchema }).strict();
const TranscriptSchema = z.object({ text: z.string().trim().min(1).max(8000), status: z.literal('final') }).strict();
const MaskedTextSchema = z.string().trim().min(1).max(12000);

export type AudioClip = z.infer<typeof AudioSchema>;
export type VoiceTurnInput = z.infer<typeof InputSchema>;
export interface MaskRequest {
  /** Opaque, unique per run; links both directions without a global sensitive-data mapping. */
  readonly scopeId: string;
  readonly direction: 'inbound' | 'outbound';
  readonly text: string;
  readonly locale: VoiceLog['locale'];
}
export interface VoiceProviders {
  transcribe(audio: AudioClip, signal: AbortSignal): Promise<{ text: string; status: 'final' }>;
  /** Required, text-only policy boundary. A future Presidio adapter owns request-local entity mappings. */
  mask(request: MaskRequest, signal: AbortSignal): Promise<string>;
  dialog(log: VoiceLog, signal: AbortSignal): Promise<AgentReply>;
  synthesize(reply: AgentReply, signal: AbortSignal): Promise<AudioClip>;
  /** Resolve `ended` only on natural audio completion, never on enqueue, interruption or error. */
  play(audio: AudioClip, signal: AbortSignal): Promise<'ended' | 'cancelled'>;
}
export interface VoiceTurnResult {
  readonly voiceLog: VoiceLog;
  readonly reply: AgentReply;
  readonly playback: VoicePlaybackEvent;
}
type Stage = 'STT' | 'MASK' | 'DIALOG' | 'TTS' | 'PLAYBACK';
type ErrorCode = 'INVALID_INPUT' | 'ABORTED' | 'TIMEOUT' | `${Stage}_FAILED`;

/** Diagnostics deliberately omit audio, transcripts, provider responses and original exception text. */
export class VoicePipelineError extends Error {
  constructor(readonly code: ErrorCode) {
    super(`Voice pipeline: ${code}`);
    this.name = 'VoicePipelineError';
  }
}

/** Opt-in orchestration; no credentials, storage, confirmation decisions or provider retries. */
export class VoicePipeline {
  private readonly timeoutMs: number;

  constructor(private readonly providers: VoiceProviders, options: { timeoutMs?: number } = {}) {
    for (const name of ['transcribe', 'mask', 'dialog', 'synthesize', 'play'] as const) {
      if (typeof providers[name] !== 'function') throw new TypeError(`Voice provider required: ${name}`);
    }
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 120_000) {
      throw new RangeError('Voice timeout must be an integer between 1 and 120000 ms');
    }
  }

  async run(input: VoiceTurnInput, parentSignal?: AbortSignal): Promise<VoiceTurnResult> {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) throw new VoicePipelineError('INVALID_INPUT');
    const { audio, ...metadata } = parsed.data;
    const scopeId = randomUUID();
    const controller = new AbortController();
    const abort = () => controller.abort(new VoicePipelineError('ABORTED'));
    parentSignal?.addEventListener('abort', abort, { once: true });
    if (parentSignal?.aborted) abort();
    const timer = setTimeout(() => controller.abort(new VoicePipelineError('TIMEOUT')), this.timeoutMs);
    const signal = controller.signal;
    try {
      const transcript = await stage('STT', signal, async () =>
        TranscriptSchema.parse(await this.providers.transcribe(audio, signal)));
      const voiceLog = await stage('MASK', signal, async () => VoiceLogSchema.parse({
        ...metadata, source: 'voice', transcriptStatus: 'final',
        text: MaskedTextSchema.parse(await this.providers.mask({ scopeId, direction: 'inbound', text: transcript.text, locale: metadata.locale }, signal)),
      }));
      const reply = await stage('DIALOG', signal, async () => {
        const value = AgentReplySchema.parse(await this.providers.dialog(structuredClone(voiceLog), signal));
        for (const key of ['caseId', 'turnId', 'correlationId', 'locale'] as const) {
          if (value[key] !== metadata[key]) throw new Error('Reply binding mismatch');
        }
        return value;
      });
      const spokenReply = await stage('MASK', signal, async () => AgentReplySchema.parse({
        ...reply,
        text: MaskedTextSchema.parse(await this.providers.mask({ scopeId, direction: 'outbound', text: reply.text, locale: reply.locale }, signal)),
      }));
      const speech = await stage('TTS', signal, async () =>
        AudioSchema.parse(await this.providers.synthesize(structuredClone(spokenReply), signal)));
      const event = await stage('PLAYBACK', signal, async () =>
        z.enum(['ended', 'cancelled']).parse(await this.providers.play(speech, signal)));
      const playback = VoicePlaybackEventSchema.parse({
        schemaVersion: metadata.schemaVersion, caseId: metadata.caseId,
        correlationId: metadata.correlationId, turnId: metadata.turnId,
        messageId: `playback_event_${randomUUID()}`, playbackId: `playback_${randomUUID()}`,
        replyId: spokenReply.replyId, event, occurredAt: new Date().toISOString(),
      });
      return { voiceLog, reply: spokenReply, playback };
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', abort);
    }
  }
}

/** Abort wins even if a provider ignores its signal; late output cannot start another stage. */
function stage<T>(name: Stage, signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve().then(() => {
      signal.throwIfAborted();
      return work();
    }).then(value => {
      signal.removeEventListener('abort', aborted);
      if (signal.aborted) aborted();
      else resolve(value);
    }, () => {
      signal.removeEventListener('abort', aborted);
      if (signal.aborted) aborted();
      else reject(new VoicePipelineError(`${name}_FAILED`));
    });
  });
}
