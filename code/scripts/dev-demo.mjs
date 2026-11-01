// One command for the demo: the case backend with the demo start (live calculator) on 3000 and
// the Angular app in its demo configuration on 4200. The app opens on a ready, calculated
// synthetic case (Mueller persona); no access code. Ctrl+C stops both.
// `--paxi` serves its paxi configuration and starts Dario's voice agent (Paxi, port 3100) in the
// backend's process: Paxi talks in its own window instead of the live voice in the app.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const code = fileURLToPath(new URL('..', import.meta.url));
const paxi = process.argv.includes('--paxi');
// `--live`: the live configuration, end to end without test data (empty case, voice sets it up).
const live = process.argv.includes('--live');
const app = paxi ? 'start:paxi' : live ? 'start:live' : 'start:demo';
const children = [
  spawn('npm', ['start'], { cwd: code, stdio: 'inherit', env: { ...process.env, PAX_DEMO_START: '1', ...(paxi ? { PAX_VOICE_AGENT: '1' } : {}) } }),
  spawn('npm', ['run', app, '--', '--host', '127.0.0.1', '--port', '4200'], {
    cwd: `${code}apps/web`,
    stdio: 'inherit',
  }),
];
const stop = () => {
  for (const child of children) child.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', (status) => {
  if (status) {
    console.error(`dev:demo: a process ended with status ${status}, stopping the other one`);
    stop();
    process.exitCode = status;
  }
});
console.info('Demo: http://127.0.0.1:4200 (backend http://127.0.0.1:3000/api/status)');
