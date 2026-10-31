import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const checks = [
  { id: 'build', area: 'codeQuality', command: 'npm', args: ['run', 'build'], fix: 'Fix the TypeScript build before evaluating generated code.' },
  { id: 'clients', area: 'codeQuality', command: 'npm', args: ['run', 'typecheck:clients'], fix: 'Fix browser-facing contract type compatibility.' },
  { id: 'contracts', area: 'codeQuality', command: 'npm', args: ['run', 'contracts:check'], fix: 'Regenerate and review the shared contract exports.' },
  { id: 'voice-tests', area: 'functional', command: process.execPath,
    args: ['--test', 'tests/voice-integration.test.mjs', 'tests/voice-evaluation.test.mjs', 'tests/customer-confirmations.test.mjs'],
    fix: 'Fix the failing audio pipeline, confirmation or bounded-evaluation assertions; inspect command output.' },
];

/** A caller may repair between attempts using previousFeedback; the CLI only re-executes checks. */
export async function executeEvaluation({ execute, verify, maxAttempts = 5, onFeedback = async () => {} }) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw new RangeError('maxAttempts must be an integer between 1 and 5');
  }
  const attempts = [];
  let previousFeedback = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let evaluation; let evidence; let role = 'Executor';
    try {
      evidence = await execute({ attempt, previousFeedback: structuredClone(previousFeedback) });
      role = 'Verifier';
      evaluation = await verify(evidence);
      for (const area of ['functional', 'codeQuality']) {
        const result = evaluation?.[area];
        if (typeof result?.passed !== 'boolean' || !Array.isArray(result.feedback) ||
          !result.feedback.length || !result.feedback.every(text => typeof text === 'string' && text.length > 0)) {
          throw new TypeError('Invalid verifier result');
        }
      }
      evaluation = structuredClone(evaluation);
    } catch {
      const failure = { passed: false, feedback: [`${role} failed on attempt ${attempt}; no passing evaluation is available.`] };
      evaluation = { functional: failure, codeQuality: structuredClone(failure) };
    }
    const entry = { attempt, evaluation, ...(Array.isArray(evidence) ? { checks: evidence } : {}) };
    attempts.push(entry);
    await onFeedback(structuredClone(entry));
    previousFeedback = evaluation;
    if (evaluation.functional.passed && evaluation.codeQuality.passed) {
      return { passed: true, attempts, feedback: evaluation };
    }
  }
  return { passed: false, attempts, feedback: previousFeedback };
}

/** Verifier is separate from command execution and requires every named check, not an empty all(). */
export function verifyVoiceChecks(evidence) {
  const evaluation = { functional: { passed: true, feedback: [] }, codeQuality: { passed: true, feedback: [] } };
  const successful = id => {
    const matches = evidence.filter(result => result.id === id);
    return matches.length === 1 && matches[0].exitCode === 0 && matches[0].signal === null && matches[0].timedOut === false;
  };
  for (const check of checks) {
    const passed = successful(check.id) && (check.area !== 'functional' || successful('build'));
    evaluation[check.area].passed &&= passed;
    evaluation[check.area].feedback.push(passed ? `${check.id}: passed.` : `${check.id}: failed or missing. ${check.fix}`);
  }
  return evaluation;
}

/** Kill the isolated POSIX process group, not just npm; settle independently of open pipes. */
export async function runCheck(check, cwd, { timeoutMs = 120000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new RangeError('Invalid check timeout');
  return new Promise(resolveResult => {
    const grouped = process.platform !== 'win32';
    const child = spawn(check.command, check.args, { cwd, shell: false,
      detached: grouped, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let timedOut = false; let settled = false; let cleanupTimer;
    const append = chunk => { output = (output + chunk.toString()).slice(-16000); };
    const finish = (exitCode, signal) => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(cleanupTimer);
      child.stdout.destroy(); child.stderr.destroy(); child.unref();
      resolveResult({ id: check.id, exitCode, signal, timedOut, output });
    };
    child.stdout.on('data', append); child.stderr.on('data', append);
    child.on('error', error => {
      append(`Process could not start (${error.code ?? 'UNKNOWN'}).`); finish(null, null);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      if (grouped && child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
        finish(null, 'SIGKILL');
      } else if (child.pid) {
        // Do not kill the parent before taskkill has located its descendant tree.
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
        const cleaned = () => { child.kill('SIGKILL'); finish(null, 'SIGKILL'); };
        cleanupTimer = setTimeout(() => { killer.kill('SIGKILL'); cleaned(); }, 1000);
        killer.on('error', cleaned); killer.on('close', cleaned);
      } else {
        child.kill('SIGKILL');
        finish(null, 'SIGKILL');
      }
    }, timeoutMs);
    child.on('close', (exitCode, signal) => { if (!timedOut) finish(exitCode, signal); });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !/^--max-attempts=[1-5]$/.test(args[0]))) {
    throw new Error('Usage: node scripts/voice-evaluation.mjs [--max-attempts=1..5]');
  }
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const report = await executeEvaluation({ maxAttempts: args.length ? Number(args[0].split('=')[1]) : 5,
    execute: async () => {
      const results = [];
      for (const check of checks) {
        const result = await runCheck(check, cwd); results.push(result);
        // Never run old compiled tests after a failed build.
        if (check.id === 'build' && (result.exitCode !== 0 || result.signal !== null || result.timedOut)) break;
      }
      return results;
    }, verify: verifyVoiceChecks,
    onFeedback: async ({ attempt, evaluation }) => {
      console.error(`Attempt ${attempt}/${args.length ? args[0].split('=')[1] : 5}: functional=${evaluation.functional.passed}, codeQuality=${evaluation.codeQuality.passed}`);
      for (const area of ['functional', 'codeQuality']) {
        for (const message of evaluation[area].feedback) console.error(`  ${area}: ${message}`);
      }
    },
  });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.passed ? 0 : 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
