import { randomUUID } from 'node:crypto';
import { CreateVoiceSessionSchema, VoiceSessionSchema, VoiceSessionStartResponseSchema, VoiceTurnInputSchema, VoiceTranscriptSchema, CloseVoiceSessionSchema, VoiceExtractionInputSchema, VoiceExtractionResponseSchema, VOICE_NOTICE_VERSION, type VoiceSession } from '@pax/contracts';
import { z } from 'zod';
import { VoiceObservationSchema } from '@pax/contracts';
import { LifeInsuranceEngine } from '../insurance/engine.js';
import { ExtractionWorkflow } from '../insurance/extraction.js';
import { WorkflowError, type Actor, type InsuranceCase, type StoredVoiceSession } from '../insurance/types.js';
import { sha256Json } from '../calculation/hash.js';
import { gatewaysFor, type VoiceOptions, type VoiceGateway } from './providers.js';
import { mapVoiceObservations, portfolioCatalog } from './portfolio.js';
import { buildVoicePrompt } from './prompt.js';
import { REPORT_POLICY, liveDelegation } from './lab-delegation.js';
import { productText } from '../insurance/i18n.js';
/**
 * Observations from a separately running voice agent (Paxi) that holds its own provider session.
 * It quotes the final customer turns it relied on; no audio and no full transcript reach the case.
 */
export const ExternalVoiceObservationsSchema = z.object({
    messageId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/), conversationId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
    expectedCaseRevision: z.number().int().positive(), expectedProfileVersion: z.number().int().positive().nullable(), basisDraftHash: z.string().regex(/^[a-f0-9]{64}$/),
    turns: z.array(z.object({ messageId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/), turnId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/), text: z.string().min(1).max(4000) }).strict()).min(1).max(24),
    observations: z.array(VoiceObservationSchema).min(1).max(50),
    supersedesBatchIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,120}$/)).max(20).default([]),
}).strict();
export const AgentVoiceTurnsSchema = z.object({
    conversationId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
    turns: z.array(z.object({ messageId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/), speaker: z.enum(['customer', 'agent']), text: z.string().min(1).max(4000), at: z.iso.datetime() }).strict()).min(1).max(50),
}).strict();
const MAX_AGENT_TURNS = 500;
const active = (s: StoredVoiceSession) => s.status === 'active' || s.status === 'starting';
const now = () => new Date().toISOString();
export class VoiceIntegrationService {
    private gateways: Map<string, VoiceGateway>;
    private cache = new Map<string, {
        until: number;
        response: z.infer<typeof VoiceSessionStartResponseSchema>;
    }>();
    private closing = new Map<string, Promise<void>>();
    private opening = new Map<string, {caseId:string; controller:AbortController}>();
    private handles = new Map<string, {
        caseId: string;
        provider: string;
        providerSessionId: string;
    }>();
    constructor(readonly engine: LifeInsuranceEngine, readonly extraction: ExtractionWorkflow, readonly options: VoiceOptions = {}) { this.gateways = new Map(gatewaysFor(options).map(p => [p.id, p])); }
    get enabled() { return this.options.enabled === true; }
    providers() { return ['gpt-live', 'elevenlabs'].map(provider => ({ provider, available: this.enabled && this.gateways.has(provider), syntheticOnly: true })); }
    privacy(locale = 'de') {
        const texts = { de: 'Optionale Sprachdemo: Nur ausdrücklich erfundene Angaben verwenden. Audio und Gesprächsdaten werden an den ausgewählten Sprachprovider OpenAI oder ElevenLabs übertragen. Provider-Schlüssel bleiben auf dem Server. Keine echten Personen-, Finanz- oder Gesundheitsdaten eingeben.', fr: 'Démonstration vocale facultative : utilisez uniquement des données explicitement fictives. L’audio et la conversation sont transmis au fournisseur vocal choisi, OpenAI ou ElevenLabs. Les clés restent sur le serveur. Aucune donnée personnelle, financière ou de santé réelle.', it: 'Demo vocale facoltativa: utilizzare esclusivamente dati esplicitamente fittizi. Audio e conversazione vengono trasmessi al provider vocale scelto, OpenAI o ElevenLabs. Le chiavi restano sul server. Nessun dato personale, finanziario o sanitario reale.', en: 'Optional voice demo: use explicitly invented details only. Audio and conversation data are sent to the selected voice provider, OpenAI or ElevenLabs. Provider keys stay on the server. Do not enter real personal, financial or health data.' };
        return { version: VOICE_NOTICE_VERSION, enabled: this.enabled, syntheticOnly: true, separateConsentRequired: true, externalVoiceProcessing: this.enabled, fullCaseTransferAuthorized: false, rawHealthDataAccepted: false,
            providers: this.providers(), locale, text: texts[locale as keyof typeof texts] ?? texts.de };
    }
    private customer(actor: Actor) { this.engine.sessions.assertActive(actor); if (actor.role !== 'customer')
        throw new WorkflowError('FORBIDDEN', 403); }
    private dto(s: StoredVoiceSession): VoiceSession { const { sessionHash, messageId, requestHash, providerSessionId, turns, extractions, handoverRevision, ...dto } = s; return VoiceSessionSchema.parse(dto); }
    private session(actor: Actor, c: InsuranceCase, id: string) {
        if (actor.role === 'reviewer')
            throw new WorkflowError('FORBIDDEN', 403);
        const s = c.voiceSessions.find(s => s.id === id);
        if (!s || actor.role === 'customer' && s.sessionHash !== actor.sessionHash)
            throw new WorkflowError('NOT_FOUND', 404);
        return s;
    }
    private assertActive(c: InsuranceCase, s: StoredVoiceSession) { this.engine.assertDigitalActive(c); if (s.status !== 'active' || s.expiresAt <= now() || s.handoverRevision !== c.handover.revision || s.locale !== c.locale)
        throw new WorkflowError('VOICE_SESSION_NOT_ACTIVE'); }
    private invalidateVoiceQuestions(c: InsuranceCase) { for (const q of c.confirmationRequests)
        if (q.channel === 'voice' && ['awaiting_presentation', 'awaiting_answer'].includes(q.status)) {
            q.status = 'invalidated';
            q.invalidationReason = 'new_question';
        } }
    private notify(c: InsuranceCase, reason: string, voiceSessionId: string) { c.contextRevision++; c.updatedAt = now(); c.events.push({ id: randomUUID(), contextRevision: c.contextRevision, reason, at: c.updatedAt, voiceSessionId }); c.events = c.events.slice(-100); }
    list(actor: Actor, id: string) { const c = this.engine.caseFor(actor, id, true); if (actor.role === 'reviewer')
        throw new WorkflowError('FORBIDDEN', 403); return { caseId: id, sessions: c.voiceSessions.filter(s => actor.role === 'advisor' || s.sessionHash === actor.sessionHash).map(s => this.dto(s)) }; }
    transcript(actor: Actor, id: string, sessionId: string) { const c = this.engine.caseFor(actor, id, true), s = this.session(actor, c, sessionId); return VoiceTranscriptSchema.parse({ caseId: id, voiceSession: this.dto(s), turns: s.turns }); }
    catalog() { return portfolioCatalog(); }
    async start(actor: Actor, id: string, input: unknown) {
        this.customer(actor);
        const b = CreateVoiceSessionSchema.parse(input), gateway = this.gateways.get(b.provider);
        if (!this.enabled || !gateway)
            throw new WorkflowError('VOICE_PROVIDER_DISABLED', 503);
        if (b.provider === 'gpt-live' && !b.sdp?.startsWith('v='))
            throw new WorkflowError('VOICE_SDP_REQUIRED', 422);
        const requestHash = sha256Json(b), initial = this.engine.caseFor(actor, id);
        this.engine.assertDigitalActive(initial);
        const previous = initial.voiceSessions.find(s => s.messageId === b.messageId);
        if (previous) {
            if (previous.locale !== initial.locale || previous.handoverRevision !== initial.handover.revision)
                throw new WorkflowError('VOICE_SESSION_NOT_ACTIVE');
            if (previous.sessionHash !== actor.sessionHash || previous.requestHash !== requestHash)
                throw new WorkflowError('IDEMPOTENCY_CONFLICT');
            const cached = this.cache.get(previous.id);
            if (previous.status === 'active' && previous.expiresAt > now() && cached && cached.until > Date.now())
                return { ...cached.response, replayed: true };
            throw new WorkflowError(previous.status === 'starting' ? 'VOICE_START_IN_PROGRESS' : 'VOICE_CONNECTION_NOT_REPLAYABLE');
        }
        const prompt = await buildVoicePrompt(b.locale,b.conversationSettings);
        // The browser keeps the background model's tools current (voice-lab/delegation) from the first turn on.
        const delegation = this.options.reports && b.provider === 'gpt-live' ? { session: liveDelegation(initial.draft, initial.proposalBatches, initial.id), policy: REPORT_POLICY } : undefined;
        const reserved = await this.engine.edit(actor, id, b.expectedCaseRevision, (c, db) => {
            if (c.locale !== b.locale)
                throw new WorkflowError('VOICE_LOCALE_MISMATCH', 422);
            if (c.voiceSessions.length >= 20)
                throw new WorkflowError('VOICE_SESSION_CAPACITY', 429);
            if (c.voiceSessions.some(s => s.messageId === b.messageId))
                throw new WorkflowError('VOICE_START_IN_PROGRESS');
            const prior = b.resumeFrom ? this.session(actor, c, b.resumeFrom) : null;
            if (c.voiceSessions.some(s => active(s) && s.id !== prior?.id))
                throw new WorkflowError('VOICE_ALREADY_ACTIVE');
            const s: StoredVoiceSession = { schemaVersion: '1.0', id: randomUUID(), caseId: id, provider: b.provider, locale: b.locale, status: 'starting', createdAt: now(), expiresAt: new Date(Math.min(Date.now() + 30 * 60000, Date.parse(actor.expiresAt), Date.parse(c.expiresAt))).toISOString(),
                endedAt: null, closeReason: null, transcriptRevision: 0, turnCount: 0, resumeFrom: b.resumeFrom ?? null, noticeVersion: VOICE_NOTICE_VERSION, dataClassification: 'synthetic', externalVoiceProcessingAccepted: true, remoteStop: 'not_requested', fullContextTransferAuthorized: false,
                sessionHash: actor.sessionHash, messageId: b.messageId, requestHash, providerSessionId: null, turns: [], extractions: {}, handoverRevision: c.handover.revision };
            c.voiceSessions.push(s);
            this.notify(c, 'voice_session_starting', s.id);
            this.engine.audit(db, actor, c, 'synthetic_voice_consent_recorded');
            return s;
        });
        const openingController=new AbortController();
        this.opening.set(reserved.id,{caseId:id,controller:openingController});
        let created: Awaited<ReturnType<VoiceGateway['open']>> | undefined;
        try {
            await this.engine.runDigital(actor, id, async (signal) => { created = await gateway.open({ ...(b.sdp === undefined ? {} : { sdp: b.sdp }), locale: b.locale, prompt, ...(delegation ? { delegation } : {}) }, signal); },openingController.signal);
            const session = await this.engine.edit(actor, id, undefined, (c, db) => {
                const s = this.session(actor, c, reserved.id);
                if (s.status !== 'starting' || s.handoverRevision !== c.handover.revision || c.caseRevision !== b.expectedCaseRevision || c.locale !== b.locale)
                    throw new WorkflowError('STALE_CONTEXT');
                s.status = 'active';
                s.providerSessionId = created!.providerSessionId;
                if (b.resumeFrom) {
                    const old = this.session(actor, c, b.resumeFrom);
                    if (active(old)) {
                        old.status = 'closed';
                        old.endedAt = now();
                        old.closeReason = 'voice_switch';
                        this.invalidateVoiceQuestions(c);
                    }
                }
                this.notify(c, 'voice_session_started', s.id);
                this.engine.audit(db, actor, c, 'voice_session_started');
                return this.dto(s);
            });
            this.handles.set(session.id, { caseId: id, provider: b.provider, providerSessionId: created!.providerSessionId });
            const response = VoiceSessionStartResponseSchema.parse({ voiceSession: session, connection: created!.connection, prompt, replayed: false, reports: created!.delegated === true });
            this.cache.set(session.id, { until: Date.now() + 30000, response });
            await this.sweep();
            return response;
        }
        catch (error) {
            if (created)
                await gateway.stop(created.providerSessionId).catch(() => { });
            await this.engine.store.transaction(db => { const c = db.cases[id], s = c?.voiceSessions.find(s => s.id === reserved.id); if (s && active(s)) {
                s.status = 'failed';
                s.closeReason = 'provider_failed';
                s.endedAt = now();
                this.notify(c!, 'voice_session_failed', s.id);
            } }).catch(() => { });
            throw error instanceof WorkflowError ? error : new WorkflowError('VOICE_PROVIDER_UNAVAILABLE', 503);
        } finally {this.opening.delete(reserved.id);}
    }
    async ingest(actor: Actor, id: string, sessionId: string, input: unknown) {
        this.customer(actor);
        const b = VoiceTurnInputSchema.parse(input);
        if (b.log.caseId !== id)
            throw new WorkflowError('VOICE_CASE_MISMATCH', 422);
        return this.engine.edit(actor, id, undefined, (c, db) => {
            const s = this.session(actor, c, sessionId);
            this.assertActive(c, s);
            if (b.log.locale !== s.locale)
                throw new WorkflowError('VOICE_LOCALE_MISMATCH', 422);
            const previous = s.turns.find(t => t.log.messageId === b.log.messageId);
            if (previous) {
                if (sha256Json({ speaker: previous.speaker, log: previous.log }) !== sha256Json(b))
                    throw new WorkflowError('IDEMPOTENCY_CONFLICT');
                return { voiceSession: this.dto(s), replayed: true };
            }
            if (s.turns.length >= 250 || s.turns.reduce((n, t) => n + t.log.text.length, 0) + b.log.text.length > 500000)
                throw new WorkflowError('VOICE_TRANSCRIPT_CAPACITY', 429);
            if (b.log.expectedCaseRevision !== undefined && b.log.expectedCaseRevision !== c.caseRevision)
                throw new WorkflowError('VERSION_CONFLICT');
            s.turns.push({ ...b, receivedAt: now() });
            s.transcriptRevision++;
            s.turnCount = s.turns.length;
            if (b.speaker === 'agent')
                for (const q of c.confirmationRequests)
                    if (['awaiting_presentation', 'awaiting_answer'].includes(q.status) && q.questionReplyId !== b.log.messageId) {
                        q.status = 'invalidated';
                        q.invalidationReason = 'new_question';
                    }
            this.notify(c, 'voice_turn_available', s.id);
            this.engine.audit(db, actor, c, 'voice_turn_finalized');
            return { voiceSession: this.dto(s), replayed: false };
        });
    }
    /**
     * Final turns of a separately running voice agent, for the call history in the customer app.
     * A turn is a record of what was said, not a fact: nothing here changes the draft or the
     * case revision, so an open customer question stays valid.
     */
    async recordAgentTurns(actor: Actor, id: string, input: unknown) {
        this.engine.sessions.assertActive(actor);
        if (actor.role !== 'advisor')
            throw new WorkflowError('FORBIDDEN', 403);
        if (!this.enabled)
            throw new WorkflowError('VOICE_PROVIDER_DISABLED', 503);
        this.engine.caseFor(actor, id, true);
        const b = AgentVoiceTurnsSchema.parse(input);
        return this.engine.store.transaction(db => {
            this.engine.sessions.assertActive(actor, db);
            const c = db.cases[id];
            if (!c || c.ownerId !== actor.id || actor.caseId !== id || c.expiresAt <= now())
                throw new WorkflowError('NOT_FOUND', 404);
            c.agentTurns ??= [];
            let changed = 0;
            for (const turn of b.turns) {
                const known = c.agentTurns.find(t => t.messageId === turn.messageId);
                // The agent groups speech into turns, so the text of its newest turn may still grow.
                if (known) {
                    if (known.text !== turn.text || known.speaker !== turn.speaker) { Object.assign(known, turn); changed++; }
                    continue;
                }
                if (c.agentTurns.length >= MAX_AGENT_TURNS)
                    throw new WorkflowError('VOICE_TURN_CAPACITY', 429);
                c.agentTurns.push({ ...turn, conversationId: b.conversationId, receivedAt: now() });
                changed++;
            }
            if (changed) {
                c.contextRevision++; c.updatedAt = now();
                c.events.push({ id: randomUUID(), contextRevision: c.contextRevision, reason: 'agent_turns_recorded', at: c.updatedAt });
                c.events = c.events.slice(-100);
            }
            return { caseId: id, contextRevision: c.contextRevision, recorded: changed, total: c.agentTurns.length };
        });
    }
    /**
     * What the voice agent may say about solutions: the current recommendation of the active run,
     * with product names in the case language. Only the rule-based result, no amounts it would
     * have to explain on its own; `null` before there is one.
     */
    agentRecommendation(actor: Actor, id: string) {
        if (actor.role === 'reviewer')
            throw new WorkflowError('FORBIDDEN', 403);
        const c = this.engine.caseFor(actor, id, true);
        const rec = [...c.recommendations].reverse().find(r => r.runId === c.activeRunId) ?? null;
        return { caseId: id, recommendation: rec && { id: rec.id, status: rec.status, reviewOpen: rec.status === 'human_review_required',
            candidates: rec.candidates.map(x => ({ productId: x.productId, productName: productText(c.locale, x.productId), personId: x.personId,
                suitabilityCheckRequired: x.rule.reasonCodes.includes('SUITABILITY_CHECK_REQUIRED') })) } };
    }
    /** The owner's call history from a separate voice agent; never part of the case DTO. */
    agentTurns(actor: Actor, id: string) {
        // Reviewers decide on the analysis, they do not read what the customer said.
        if (actor.role === 'reviewer')
            throw new WorkflowError('FORBIDDEN', 403);
        const c = this.engine.caseFor(actor, id, true);
        return { caseId: id, turns: (c.agentTurns ?? []).map(({ receivedAt: _received, ...turn }) => turn) };
    }
    /** Same mapping and gates as a backend voice session, for a voice agent with its own provider session. */
    async proposeExternal(actor: Actor, id: string, input: unknown) {
        this.engine.sessions.assertActive(actor);
        if (actor.role !== 'advisor')
            throw new WorkflowError('FORBIDDEN', 403);
        if (!this.enabled)
            throw new WorkflowError('VOICE_PROVIDER_DISABLED', 503);
        this.engine.caseFor(actor, id, true);
        const b = ExternalVoiceObservationsSchema.parse(input);
        return this.engine.store.transaction(db => {
            const c = db.cases[id];
            if (!c || c.ownerId !== actor.id || actor.caseId !== id || c.expiresAt <= now())
                throw new WorkflowError('NOT_FOUND', 404);
            const turnOf = (messageId: string) => b.turns.find(t => t.messageId === messageId);
            for (const observation of b.observations) {
                const turn = turnOf(observation.sourceMessageId);
                if (!turn || !turn.text.toLocaleLowerCase().includes(observation.quote.toLocaleLowerCase()))
                    throw new WorkflowError('VOICE_SOURCE_NOT_FOUND', 422);
            }
            const mapped = mapVoiceObservations(c.draft, b.observations, c.locale);
            const sourceRef = (messageId: string) => `voice-agent:${b.conversationId}:${messageId}`;
            const source = (messageId: string) => ({ messageId: b.messageId, turnId: turnOf(messageId)!.turnId, sourceRef: sourceRef(messageId) });
            const batch = mapped.changes.length || mapped.questions.length ? this.extraction.proposeBatchInTransaction(actor, c, db, { messageId: b.messageId,
                expectedCaseRevision: b.expectedCaseRevision, expectedProfileVersion: b.expectedProfileVersion, basisDraftHash: b.basisDraftHash,
                source: source(b.observations[0]!.sourceMessageId), changes: mapped.changes,
                ambiguities: mapped.questions.map(({ sourceMessageId, ...q }) => ({ ...q, source: source(sourceMessageId) })),
                supersedesBatchIds: b.supersedesBatchIds, supersedesProposalIds: [], resolvesAmbiguityIds: [] }) : null;
            this.engine.audit(db, actor, c, 'external_voice_observations_mapped');
            return { caseId: id, caseRevision: c.caseRevision, contextRevision: c.contextRevision, mappingVersion: 'voice-portfolio-v1', proposalBatch: batch, issues: mapped.issues, confirmationStillRequired: true };
        });
    }
    async propose(actor: Actor, id: string, sessionId: string, input: unknown) {
        this.engine.sessions.assertActive(actor);
        if (actor.role !== 'advisor')
            throw new WorkflowError('FORBIDDEN', 403);
        this.engine.caseFor(actor, id, true);
        const b = VoiceExtractionInputSchema.parse(input), requestHash = sha256Json(b);
        return this.engine.store.transaction(db => {
            this.engine.sessions.assertActive(actor, db);
            const c = db.cases[id];
            if (!c || c.ownerId !== actor.id || actor.caseId !== id || c.expiresAt <= now())
                throw new WorkflowError('NOT_FOUND', 404);
            const s = this.session(actor, c, sessionId);
            this.assertActive(c, s);
            const previous = s.extractions[b.messageId];
            const response = (entry: {
                proposalId: string | null;
                issues: unknown;
            }, replayed: boolean) => VoiceExtractionResponseSchema.parse({ caseId: id, voiceSessionId: sessionId, caseRevision: c.caseRevision, contextRevision: c.contextRevision, mappingVersion: 'voice-portfolio-v1', proposalBatch: entry.proposalId ? c.proposalBatches.find(p => p.id === entry.proposalId) : null, issues: entry.issues, confirmationStillRequired: true, replayed });
            if (previous) {
                if (previous.requestHash !== requestHash)
                    throw new WorkflowError('IDEMPOTENCY_CONFLICT');
                return response(previous, true);
            }
            if (c.caseRevision !== b.expectedCaseRevision || s.transcriptRevision !== b.transcriptRevision)
                throw new WorkflowError('VERSION_CONFLICT');
            if ((c.confirmedVersions.at(-1)?.version ?? null) !== b.expectedProfileVersion || sha256Json(c.draft) !== b.basisDraftHash)
                throw new WorkflowError('STALE_CONTEXT');
            if (Object.keys(s.extractions).length >= 100)
                throw new WorkflowError('VOICE_EXTRACTION_CAPACITY', 429);
            for (const observation of b.observations) {
                const source = s.turns.find(t => t.log.messageId === observation.sourceMessageId && t.speaker === 'customer');
                if (!source || !source.log.text.toLocaleLowerCase().includes(observation.quote.toLocaleLowerCase()))
                    throw new WorkflowError('VOICE_SOURCE_NOT_FOUND', 422);
            }
            const mapped = mapVoiceObservations(c.draft, b.observations, c.locale), sourceTurn = s.turns.find(t => t.log.messageId === b.observations[0]!.sourceMessageId)!;
            // Open changes of the replaced batches stay in the new one, so there is one cumulative open batch (acceptBatch needs a matching draft hash).
            // ponytail: a carried change keeps its original text but its sourceRef now names only the latest turn; per-change sources if audits need them.
            const carried = (changes: typeof mapped.changes) => { if (!changes.length) return changes; const paths = new Set(changes.map(x => x.path));
                return [...b.supersedesBatchIds.flatMap(oid => c.proposalBatches.find(p => p.id === oid && p.status === 'proposed')?.changes ?? []).filter(x => !paths.has(x.path)), ...changes]; };
            const batch = mapped.changes.length || mapped.questions.length ? this.extraction.proposeBatchInTransaction(actor, c, db, { messageId: b.messageId, expectedCaseRevision: b.expectedCaseRevision, expectedProfileVersion: b.expectedProfileVersion, basisDraftHash: b.basisDraftHash,
                source: { messageId: b.messageId, turnId: sourceTurn.log.turnId, sourceRef: `voice:${sessionId}:${b.messageId}` }, changes: carried(mapped.changes),
                ambiguities: mapped.questions.map(q => { const turn = s.turns.find(t => t.log.messageId === q.sourceMessageId)!; const { sourceMessageId, ...a } = q; return { ...a, source: { messageId: b.messageId, turnId: turn.log.turnId, sourceRef: `voice:${sessionId}:${q.sourceMessageId}` } }; }),
                supersedesBatchIds: b.supersedesBatchIds, supersedesProposalIds: b.supersedesProposalIds, resolvesAmbiguityIds: b.resolvesAmbiguityIds }) : null;
            const entry = { requestHash, proposalId: batch?.id ?? null, issues: mapped.issues, mappingVersion: 'voice-portfolio-v1', transcriptRevision: b.transcriptRevision, observations: b.observations.filter(o => o.fieldId !== 'full_name' && o.fieldId !== 'smoker') };
            s.extractions[b.messageId] = entry;
            this.engine.audit(db, actor, c, 'voice_observations_mapped');
            return response(entry, false);
        });
    }
    async close(actor: Actor, id: string, sessionId: string, input: unknown) {
        this.customer(actor);
        const b = CloseVoiceSessionSchema.parse(input);
        const result = await this.engine.edit(actor, id, undefined, (c, db) => { const s = this.session(actor, c, sessionId); if (active(s)) {
            s.status = 'closed';
            s.closeReason = b.reason;
            s.endedAt = now();
            this.invalidateVoiceQuestions(c);
            this.notify(c, 'voice_session_closed', s.id);
            this.engine.audit(db, actor, c, 'voice_session_closed');
        } return this.dto(s); }, { allowDuringHandover: true });
        this.cache.delete(sessionId);
        await this.sweep();
        return result;
    }
    async initialize() {
        await this.engine.store.transaction(db => { for (const c of Object.values(db.cases))
            for (const s of c.voiceSessions)
                if (this.options.resumeAfterRestart && s.status === 'active' && s.providerSessionId) {
                    // Still live between browser and provider: keep it and its remote handle.
                    this.handles.set(s.id, { caseId: c.id, provider: s.provider, providerSessionId: s.providerSessionId });
                } else if (active(s)) {
                    s.status = 'interrupted';
                    s.closeReason = 'server_restart';
                    s.endedAt = now();
                    this.invalidateVoiceQuestions(c);
                    this.notify(c, 'voice_session_interrupted', s.id);
                    if (s.providerSessionId)
                        this.handles.set(s.id, { caseId: c.id, provider: s.provider, providerSessionId: s.providerSessionId });
                } });
        await this.sweep();
    }
    async sweep() {
        for (const [id, item] of this.cache)
            if (item.until <= Date.now())
                this.cache.delete(id);
        const snapshot = this.engine.store.snapshot();
        for(const [sessionId,opening] of this.opening){
            const c=snapshot.cases[opening.caseId],s=c?.voiceSessions.find(s=>s.id===sessionId);
            if(!c||!s||!active(s)||s.locale!==c.locale||s.expiresAt<=now()||!snapshot.sessions[s.sessionHash]||snapshot.sessions[s.sessionHash]!.expiresAt<=now())opening.controller.abort();
        }
        const needs = Object.values(snapshot.cases).some(c => c.voiceSessions.some(s => active(s) && (s.expiresAt <= now() || !snapshot.sessions[s.sessionHash] || snapshot.sessions[s.sessionHash]!.expiresAt <= now() || c.handover.stopDigitalConversation || s.locale !== c.locale)));
        if (needs)
            await this.engine.store.transaction(db => {
                for (const c of Object.values(db.cases))
                    for (const s of c.voiceSessions)
                        if (active(s) && (s.expiresAt <= now() || !db.sessions[s.sessionHash] || db.sessions[s.sessionHash]!.expiresAt <= now() || c.handover.stopDigitalConversation || s.locale !== c.locale)) {
                            s.status = 'interrupted';
                            s.closeReason = c.handover.stopDigitalConversation ? 'human_handover' : s.locale !== c.locale ? 'voice_switch' : s.expiresAt <= now() ? 'expired' : 'session_revoked';
                            s.endedAt = now();
                            this.invalidateVoiceQuestions(c);
                            this.notify(c, 'voice_session_interrupted', s.id);
                            this.cache.delete(s.id);
                        }
            });
        const current = this.engine.store.snapshot();
        for (const [sessionId, handle] of this.handles) {
            const s = current.cases[handle.caseId]?.voiceSessions.find(s => s.id === sessionId);
            if (s && active(s))
                continue;
            this.cache.delete(sessionId);
            if (this.closing.has(sessionId))
                continue;
            const job = (async () => {
                let remoteStop: 'requested' | 'failed' | 'client_required' = 'client_required';
                try {
                    remoteStop = await this.gateways.get(handle.provider)?.stop(handle.providerSessionId) ?? 'client_required';
                }
                catch {
                    remoteStop = 'failed';
                }
                await this.engine.store.transaction(db => { const record = db.cases[handle.caseId]?.voiceSessions.find(s => s.id === sessionId); if (record)
                    record.remoteStop = remoteStop; }).catch(() => { });
                this.handles.delete(sessionId);
            })().finally(() => this.closing.delete(sessionId));
            this.closing.set(sessionId, job);
        }
    }
    async shutdown() {
        this.cache.clear();
        await this.engine.store.transaction(db => { for (const c of Object.values(db.cases))
            for (const s of c.voiceSessions)
                if (active(s)) {
                    s.status = 'interrupted';
                    s.closeReason = 'shutdown';
                    s.endedAt = now();
                } });
        await this.sweep();
        await Promise.allSettled([...this.closing.values()]);
    }
}
