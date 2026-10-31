import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeEvaluation, verifyVoiceChecks, runCheck } from '../scripts/voice-evaluation.mjs';

const passing = () => ({
  functional: { passed: true, feedback: ['Audio-to-playback checks passed.'] },
  codeQuality: { passed: true, feedback: ['Type and contract checks passed.'] },
});

test('executor stops on the first fully verified success', async () => {
  let executions = 0; let verifications = 0;
  const report = await executeEvaluation({ execute: async () => { executions++; return 'evidence'; },
    verify: async evidence => { verifications++; assert.equal(evidence, 'evidence'); return passing(); } });
  assert.equal(report.passed, true); assert.equal(report.attempts.length, 1);
  assert.equal(executions, 1); assert.equal(verifications, 1);
});

test('code-quality failure blocks success, feeds the executor and stops after exactly five attempts', async () => {
  const received = []; const feedback = [];
  const evaluation = { ...passing(), codeQuality: { passed: false, feedback: ['Fix the failed TypeScript build.'] } };
  const report = await executeEvaluation({ execute: async context => { received.push(context); return {}; },
    verify: async () => evaluation, onFeedback: async entry => { feedback.push(entry); } });
  assert.equal(report.passed, false); assert.equal(report.attempts.length, 5); assert.equal(feedback.length, 5);
  assert.equal(received[0].previousFeedback, null);
  assert.deepEqual(received[1].previousFeedback.codeQuality.feedback, ['Fix the failed TypeScript build.']);
  assert.deepEqual(report.feedback.codeQuality.feedback, ['Fix the failed TypeScript build.']);
});

test('executor can use verifier feedback to pass on a later attempt', async () => {
  let fixed = false;
  const report = await executeEvaluation({ execute: async ({ previousFeedback }) => {
    if (previousFeedback?.functional.feedback.includes('Handle cancelled playback.')) fixed = true;
    return fixed;
  }, verify: async evidence => evidence ? passing() : {
    ...passing(), functional: { passed: false, feedback: ['Handle cancelled playback.'] },
  } });
  assert.equal(report.passed, true); assert.equal(report.attempts.length, 2);
});

test('invalid attempt limits are rejected before running work', async () => {
  for (const maxAttempts of [0, 6, 1.5, NaN, Infinity, '5']) {
    await assert.rejects(executeEvaluation({ maxAttempts, execute: () => assert.fail('must not execute'), verify: passing }), RangeError);
  }
});

test('executor and verifier exceptions yield failure feedback within the configured cap', async () => {
  for (const failedRole of ['execute', 'verify']) {
    const report = await executeEvaluation({ maxAttempts: 2,
      execute: async () => { if (failedRole === 'execute') throw new Error('private'); return {}; },
      verify: async () => { throw new Error('private'); },
    });
    assert.equal(report.passed, false); assert.equal(report.attempts.length, 2);
    assert.ok(!JSON.stringify(report).includes('private'));
    assert.match(report.feedback.functional.feedback[0], /failed/);
  }
});

test('a malformed verifier response cannot report success', async () => {
  const report = await executeEvaluation({ maxAttempts: 1, execute: async () => ({}),
    verify: async () => ({ functional: { passed: 'yes' }, codeQuality: { passed: true } }),
  });
  assert.equal(report.passed, false);
});

test('verification needs complete fresh evidence; empty, skipped, duplicate or signalled checks fail', () => {
  const checks = ['build', 'clients', 'contracts', 'voice-tests'].map(id => ({ id, exitCode: 0, signal: null, timedOut: false }));
  const success = verifyVoiceChecks(checks);
  assert.equal(success.functional.passed, true); assert.equal(success.codeQuality.passed, true);
  for (const evidence of [[], checks.slice(0, 3), [...checks, checks[0]],
    checks.map(check => check.id === 'voice-tests' ? { ...check, exitCode: null, signal: 'SIGTERM' } : check),
    checks.map(check => check.id === 'voice-tests' ? { ...check, timedOut: true } : check)]) {
    const evaluation = verifyVoiceChecks(evidence);
    assert.equal(evaluation.functional.passed && evaluation.codeQuality.passed, false);
  }
  const failedBuild = verifyVoiceChecks(checks.map(check => check.id === 'build' ? { ...check, exitCode: 1 } : check));
  assert.equal(failedBuild.codeQuality.passed, false); assert.equal(failedBuild.functional.passed, false);
  assert.match(failedBuild.codeQuality.feedback.join(' '), /build/);
});

test('real command execution captures a failure and bounded output for verifier feedback', async () => {
  const evidence = await runCheck({ id: 'voice-tests', command: process.execPath,
    args: ['-e', 'process.stdout.write("x".repeat(20000)); process.stderr.write("assertion failed"); process.exitCode = 1;'],
  }, process.cwd());
  assert.equal(evidence.exitCode, 1); assert.equal(evidence.timedOut, false);
  assert.ok(evidence.output.includes('assertion failed')); assert.ok(evidence.output.length <= 16000);
  const report = await executeEvaluation({ maxAttempts: 1, execute: async () => [evidence], verify: verifyVoiceChecks });
  assert.equal(report.passed, false);
  assert.ok(report.attempts[0].checks[0].output.includes('assertion failed'));
});

test('timeout kills a command tree with inherited pipes and returns failure evidence', { timeout: 5000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'pax-voice-check-'));
  const heartbeat = join(directory, 'heartbeat');
  let descendant;
  t.after(async () => {
    if (Number.isInteger(descendant) && descendant > 0) { try { process.kill(descendant, 'SIGKILL'); } catch {} }
    await rm(directory, { recursive: true, force: true });
  });
  const childSource = `const fs = require('node:fs'); const path = ${JSON.stringify(heartbeat)};
    fs.writeFileSync(path, 'started'); process.on('SIGTERM', () => {});
    setInterval(() => fs.appendFileSync(path, '.'), 10);`;
  const source = `const {spawn} = require('node:child_process');
    const child = spawn(process.execPath, ['-e', ${JSON.stringify(childSource)}], {stdio: ['ignore', 'inherit', 'inherit']});
    console.log(child.pid); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);`;
  const started = Date.now();
  const evidence = await runCheck({ id: 'voice-tests', command: process.execPath, args: ['-e', source] }, process.cwd(), { timeoutMs: 300 });
  descendant = Number(evidence.output.trim());
  assert.ok(descendant > 0, 'the process with inherited pipes actually started');
  assert.equal(evidence.timedOut, true); assert.equal(evidence.exitCode, null); assert.equal(evidence.signal, 'SIGKILL');
  assert.ok(Date.now() - started < 3000, 'settlement must not wait for descendant pipes to close');
  const stoppedHeartbeat = await readFile(heartbeat, 'utf8');
  assert.ok(stoppedHeartbeat.startsWith('started'), 'the descendant actually ran');
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(await readFile(heartbeat, 'utf8'), stoppedHeartbeat, 'the descendant must stop, not just lose its output pipes');
  const evaluation = verifyVoiceChecks([evidence]); assert.equal(evaluation.functional.passed, false);
});
