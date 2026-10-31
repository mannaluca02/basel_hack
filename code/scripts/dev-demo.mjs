// One command for the demo: the case backend with the demo start (live calculator) on 3000 and
// the Angular app in its demo configuration on 4200. The app opens on a ready, calculated
// synthetic case (Mueller persona); no access code. Ctrl+C stops both.
// `--debug` serves the app in its debug configuration instead: the same, plus the Voice Lab view.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const code = fileURLToPath(new URL('..', import.meta.url));
const app = process.argv.includes('--debug') ? 'start:debug' : 'start:demo';
const children = [
  spawn('npm', ['start'], { cwd: code, stdio: 'inherit', env: { ...process.env, PAX_DEMO_START: '1' } }),
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
