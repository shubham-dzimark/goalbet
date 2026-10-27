// Starts the E2E API and worker as one process for Playwright's webServer (the worker has no port
// of its own to wait for). Stopping this process stops both.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { API_ENV, ROOT } from '../stack.mjs';

const env = { ...process.env, ...API_ENV };
const children = ['api', 'worker'].map((app) =>
  spawn(process.execPath, ['dist/main.js'], { cwd: join(ROOT, 'apps', app), env, stdio: 'inherit' }),
);
const stop = () => {
  for (const c of children) c.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const c of children) c.on('exit', (code) => {
  if (code !== null && code !== 0) {
    console.error(`e2e backend: a process exited with ${code}`);
    stop();
  }
});
