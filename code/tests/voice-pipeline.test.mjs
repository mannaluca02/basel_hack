import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceLogSchema, AgentReplySchema, VoicePlaybackEventSchema } from '@pax/contracts';
import { VoicePipeline } from '../apps/api/dist/voice/index.js';

const envelope = { schemaVersion: '1.0', messageId: 'voice_1', caseId: 'case_1', correlationId: 'question_1', turnId: 'turn_1' };
const clip = () => ({ bytes: new Uint8Array([82, 73, 70, 70]), mediaType: 'audio/wav' });
const input = () => ({ ...envelope, locale: 'de', dataClassification: 'synthetic', expectedCaseRevision: 1, audio: clip() });
const replyTo = log => ({ ...envelope, messageId: 'reply_message_1', replyId: 'reply_1', contextRevision: 1,
  kind: 'question', locale: log.locale, text: 'Danke, Erika. Was ist Ihr Ziel?', requiresConfirmation: false,
  containsFinancialAmounts: false, contextId: null, runId: null, profileVersion: null,
  scenarioVersionId: null, calculationInputHash: null, factRefs: [] });

function fixture(overrides = {}, options = {}) {
  const calls = [];
  const providers = {
    transcribe: async audio => { calls.push('stt'); assert.deepEqual(audio, clip()); return { text: 'Ich bin Erika.', status: 'final' }; },
    mask: async ({ text, direction }) => { calls.push(`mask:${direction}`); return text.replaceAll('Erika', '[PERSON_1]'); },
    dialog: async log => { calls.push('dialog'); VoiceLogSchema.parse(log); assert.equal(log.text, 'Ich bin [PERSON_1].'); return replyTo(log); },
    synthesize: async reply => { calls.push('tts'); AgentReplySchema.parse(reply); assert.equal(reply.text, 'Danke, [PERSON_1]. Was ist Ihr Ziel?'); return clip(); },
    play: async audio => { calls.push('play'); assert.deepEqual(audio, clip()); return 'ended'; },
    ...overrides,
  };
  return { calls, pipeline: new VoicePipeline(providers, options) };
}

test('audio traverses STT, masking, dialog, outbound masking and TTS before a bound playback completion', async () => {
  const { pipeline, calls } = fixture();
  const result = await pipeline.run(input());
  assert.deepEqual(calls, ['stt', 'mask:inbound', 'dialog', 'mask:outbound', 'tts', 'play']);
  assert.equal(result.voiceLog.source, 'voice');
  assert.equal(result.voiceLog.expectedCaseRevision, 1);
  assert.equal(result.voiceLog.text, 'Ich bin [PERSON_1].');
  const playback = VoicePlaybackEventSchema.parse(result.playback);
  assert.equal(playback.event, 'ended');
  assert.equal(playback.caseId, 'case_1');
  assert.equal(playback.turnId, 'turn_1');
  assert.equal(playback.correlationId, 'question_1');
  assert.equal(playback.replyId, result.reply.replyId);
  assert.ok(playback.playbackId);
  assert.ok(!JSON.stringify(result).includes('Erika'));
  assert.ok(!Object.hasOwn(result.voiceLog, 'audio'));
});

test('invalid input and real-data labels fail before any provider receives audio', async () => {
  for (const change of [body => { body.dataClassification = 'personal'; }, body => { body.audio.bytes = new Uint8Array(); },
    body => { body.audio.mediaType = 'text/plain'; }, body => { body.audio.bytes = new Uint8Array(10 * 1024 * 1024 + 1); },
    body => { body.rawAudio = 'smuggled'; }, body => { body.locale = 'xx'; }]) {
    const { pipeline, calls } = fixture(); const body = input(); change(body);
    await assert.rejects(pipeline.run(body), { code: 'INVALID_INPUT' });
    assert.deepEqual(calls, []);
  }
});

test('partial, empty and malformed STT results never reach masking or dialog', async () => {
  for (const output of [{ text: 'ja', status: 'partial' }, { text: '   ', status: 'final' }, { text: 'ja', status: 'final', audio: 'extra' }]) {
    const { pipeline, calls } = fixture({ transcribe: async () => output });
    await assert.rejects(pipeline.run(input()), { code: 'STT_FAILED' });
    assert.deepEqual(calls, []);
  }
});

test('masking is required and fails closed in both directions without exposing provider exception text', async () => {
  assert.throws(() => fixture({ mask: undefined }), /required: mask/);
  for (const direction of ['inbound', 'outbound']) {
    const { pipeline, calls } = fixture({ mask: async request => {
      if (request.direction === direction) throw new Error('sensitive: Erika');
      return request.text.replaceAll('Erika', '[PERSON_1]');
    } });
    await assert.rejects(pipeline.run(input()), error => {
      assert.equal(error.code, 'MASK_FAILED'); assert.ok(!String(error).includes('Erika')); assert.equal(error.cause, undefined); return true;
    });
    assert.ok(!calls.includes(direction === 'inbound' ? 'dialog' : 'tts'));
  }
  for (const text of ['', ' '.repeat(3), 'x'.repeat(12001)]) {
    const { pipeline, calls } = fixture({ mask: async () => text });
    await assert.rejects(pipeline.run(input()), { code: 'MASK_FAILED' });
    assert.ok(!calls.includes('dialog'));
  }
});

test('foreign case, turn, correlation, locale and ungrounded financial replies stop before TTS', async () => {
  for (const patch of [{ caseId: 'other' }, { turnId: 'other' }, { correlationId: 'other' }, { locale: 'fr' }, { containsFinancialAmounts: true }]) {
    const { pipeline, calls } = fixture({ dialog: async log => ({ ...replyTo(log), ...patch }) });
    await assert.rejects(pipeline.run(input()), { code: 'DIALOG_FAILED' });
    assert.ok(!calls.includes('tts'));
  }
});

test('empty or malformed synthesized audio cannot be played', async () => {
  for (const audio of [{ ...clip(), bytes: new Uint8Array() }, { ...clip(), mediaType: 'text/html' }]) {
    const { pipeline, calls } = fixture({ synthesize: async () => audio });
    await assert.rejects(pipeline.run(input()), { code: 'TTS_FAILED' });
    assert.ok(!calls.includes('play'));
  }
});

test('provider failures are stage-specific and cannot fabricate a completed playback', async () => {
  for (const [provider, code] of [['transcribe', 'STT_FAILED'], ['dialog', 'DIALOG_FAILED'], ['synthesize', 'TTS_FAILED'], ['play', 'PLAYBACK_FAILED']]) {
    const { pipeline } = fixture({ [provider]: async () => { throw new Error('private upstream response'); } });
    await assert.rejects(pipeline.run(input()), { code, message: `Voice pipeline: ${code}` });
  }
  const { pipeline } = fixture({ play: async () => 'started' });
  await assert.rejects(pipeline.run(input()), { code: 'PLAYBACK_FAILED' });
});

test('completion waits for the real player result and an interruption stays cancelled', async () => {
  let finish; let entered;
  const playing = new Promise(resolve => { entered = resolve; });
  const { pipeline } = fixture({ play: async () => { entered(); return new Promise(resolve => { finish = resolve; }); } });
  let settled = false;
  const run = pipeline.run(input()).then(result => { settled = true; return result; });
  await playing; assert.equal(settled, false);
  finish('cancelled');
  const result = await run;
  assert.equal(result.playback.event, 'cancelled');
});

test('pre-aborted turns never start STT', async () => {
  const controller = new AbortController(); controller.abort();
  const { pipeline, calls } = fixture();
  await assert.rejects(pipeline.run(input(), controller.signal), { code: 'ABORTED' });
  assert.deepEqual(calls, []);
});

test('abort at every asynchronous boundary discards late output even from an uncooperative provider', async () => {
  for (const provider of ['transcribe', 'mask', 'dialog', 'synthesize', 'play']) {
    let entered; let release; let providerSignal;
    const waiting = new Promise(resolve => { entered = resolve; });
    const late = new Promise(resolve => { release = resolve; });
    const { pipeline, calls } = fixture({ [provider]: async (_, signal) => { providerSignal = signal; entered(); return late; } });
    const controller = new AbortController();
    const run = pipeline.run(input(), controller.signal);
    await waiting; const before = [...calls]; controller.abort();
    await assert.rejects(run, { code: 'ABORTED' });
    assert.equal(providerSignal.aborted, true);
    release(provider === 'transcribe' ? { text: 'late', status: 'final' } : provider === 'dialog' ? replyTo(input()) : provider === 'play' ? 'ended' : provider === 'mask' ? 'late' : clip());
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, before);
  }
});

test('deadline bounds a hung provider and does not retry external calls', async () => {
  let requests = 0; let providerSignal;
  const { pipeline, calls } = fixture({ transcribe: async (_, signal) => {
    requests++; providerSignal = signal; return new Promise(() => {});
  } }, { timeoutMs: 20 });
  await assert.rejects(pipeline.run(input()), { code: 'TIMEOUT' });
  assert.equal(requests, 1); assert.equal(providerSignal.aborted, true); assert.deepEqual(calls, []);
  for (const timeoutMs of [0, -1, Infinity, 120001]) assert.throws(() => fixture({}, { timeoutMs }), RangeError);
});

test('concurrent turns get isolated masking scopes shared only by their two text directions', async () => {
  const scopes = [];
  const { pipeline } = fixture({ mask: async request => {
    scopes.push({ scopeId: request.scopeId, direction: request.direction });
    return request.text.replaceAll('Erika', '[PERSON_1]');
  } });
  const results = await Promise.all([pipeline.run(input()), pipeline.run(input())]);
  const unique = new Set(scopes.map(request => request.scopeId));
  assert.equal(unique.size, 2);
  for (const scope of unique) assert.deepEqual(scopes.filter(request => request.scopeId === scope).map(request => request.direction), ['inbound', 'outbound']);
  assert.notEqual(results[0].playback.playbackId, results[1].playback.playbackId);
});

for (const playbackOutcome of ['ended', 'cancelled']) {
  test(`runtime integration: ${playbackOutcome} question playback ${playbackOutcome === 'ended' ? 'enables' : 'does not enable'} an STT customer answer`, async t => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { createLifeRuntime } = await import('../apps/api/dist/insurance/runtime.js');
    const { lifeDraft, SyntheticTestProvider } = await import('./helpers/life-fixture.mjs');
    const directory = await mkdtemp(join(tmpdir(), 'pax-voice-integration-'));
    const credentials = { customerAccessCode: 'voice-integration-customer-at-least-32', reviewerAccessCode: 'voice-integration-reviewer-at-least-32' };
    const runtime = await createLifeRuntime({ dataDirectory: directory, credentials, provider: new SyntheticTestProvider(), providerMode: 'test' });
    t.after(async () => { await runtime.close(); await rm(directory, { recursive: true, force: true }); });
    const customer = runtime.sessions.authenticate((await runtime.sessions.login(credentials.customerAccessCode, 'customer')).sessionToken);
    let c = await runtime.engine.createCase(customer, { locale: 'de', timeBudgetMinutes: 10, noticeVersion: 'lifemap-synthetic-v2', dataClassification: 'synthetic' });
    c = await runtime.engine.patchDraft(customer, c.id, { ...await lifeDraft(), expectedCaseRevision: c.caseRevision });
    await runtime.engine.confirm(customer, c.id, { expectedCaseRevision: c.caseRevision, confirmProfileAndAssumptions: true,
      allowSyntheticCalculatorTransfer: true, noticeVersion: 'lifemap-synthetic-v2' });
    const agent = runtime.sessions.authenticate((await runtime.sessions.agentToken(customer, c.id)).sessionToken);
    const current = () => runtime.engine.caseFor(customer, c.id);
    const context = runtime.extraction.context(agent, c.id);
    const batch = await runtime.extraction.proposeBatch(agent, c.id, { messageId: 'salary_proposal',
      source: { messageId: 'salary_proposal', turnId: 'salary_turn', sourceRef: 'synthetic:voice-test' },
      expectedCaseRevision: context.caseRevision, expectedProfileVersion: context.profileVersion, basisDraftHash: context.draftHash,
      changes: [{ path: 'insurance.persons.0.grossAnnualIncomeCents', personId: 'person_demo_1', value: 11900000 }] });
    const question = await runtime.confirmations.create(customer, c.id, { expectedCaseRevision: current().caseRevision,
      target: { kind: 'accept_batch', batchId: batch.id }, channel: 'voice', questionTurnId: 'turn_1', questionReplyId: 'reply_1' });
    const binding = { expectedCaseRevision: question.basisCaseRevision, questionId: question.questionId,
      questionHash: question.questionHash, questionTurnId: question.questionTurnId, questionReplyId: question.questionReplyId };
    const makeInput = () => ({ ...input(), caseId: c.id, correlationId: question.questionId, expectedCaseRevision: current().caseRevision });
    const providers = { transcribe: async () => ({ text: 'Bitte die Frage vorlesen.', status: 'final' }),
      mask: async ({ text }) => text, // Explicitly synthetic-only test policy, never a production default.
      dialog: async log => ({ ...replyTo(log), caseId: c.id, correlationId: question.questionId, text: question.questionText }),
      synthesize: async reply => { assert.equal(reply.text, question.questionText); return clip(); },
      play: async () => playbackOutcome };
    const spoken = await new VoicePipeline(providers).run(makeInput());
    if (spoken.playback.event === 'ended') {
      await runtime.confirmations.presented(customer, c.id, question.id, { ...binding, reviewDisplayed: true,
        profileAndAssumptionsDisplayed: false, privacyNoticeDisplayed: false,
        playback: { playbackId: spoken.playback.playbackId, event: spoken.playback.event } });
    }
    let accepted = false;
    const answerPipeline = new VoicePipeline({ ...providers,
      transcribe: async () => ({ text: 'Ja.', status: 'final' }),
      dialog: async log => {
        const outcome = await runtime.confirmations.answer(customer, c.id, question.id, { ...binding, channel: 'voice', voiceLog: log });
        accepted = outcome.accepted;
        return { ...replyTo(log), caseId: c.id, correlationId: question.questionId, turnId: log.turnId, text: 'Die Änderung ist übernommen.' };
      }, synthesize: async () => clip(), play: async () => 'ended',
    });
    const answer = { ...makeInput(), messageId: 'answer_1', turnId: 'answer_turn_1' };
    if (playbackOutcome === 'ended') {
      const result = await answerPipeline.run(answer);
      assert.equal(result.voiceLog.text, 'Ja.'); assert.equal(accepted, true);
      assert.equal(current().draft.insurance.persons[0].grossAnnualIncomeCents, 11900000);
    } else {
      await assert.rejects(answerPipeline.run(answer), { code: 'DIALOG_FAILED' });
      assert.equal(accepted, false);
      assert.equal(current().draft.insurance.persons[0].grossAnnualIncomeCents, 12000000);
      assert.equal(runtime.confirmations.get(customer, c.id, question.id).status, 'awaiting_presentation');
    }
    assert.equal(current().confirmedVersions.length, 1, 'acceptance never confirms the whole profile');
  });
}
