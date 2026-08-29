import { closeSync, openSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname
  .replace(/^\//, '')
  .replace(/\//g, '\\');
const stateFile = `${root}\.phase1e-api-harness.json`;
const logFile = `${root}\.phase1e-api-harness.log`;
const port = Number(process.env.PHASE1E_API_PORT ?? '3010');
const base = `http://127.0.0.1:${port}`;

async function readState() {
  try {
    return JSON.parse(await readFile(stateFile, 'utf8'));
  } catch {
    return null;
  }
}
async function waitReady(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const health = await fetch(`${base}/health`);
      const ready = await fetch(`${base}/ready`);
      if (health.ok && ready.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API readiness timeout at ${base}`);
}
async function start() {
  if (await readState()) {
    try {
      await waitReady(1_000);
      return;
    } catch {
      await writeFile(stateFile, '');
    }
  }
  const logDescriptor = openSync(logFile, 'a');
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'apps/api/src/server.ts'],
    {
      cwd: root,
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
      stdio: ['ignore', logDescriptor, logDescriptor],
      shell: false,
      detached: process.platform === 'win32',
    },
  );
  closeSync(logDescriptor);
  // The API is intentionally long-lived. Keep its scoped PID while allowing
  // this command to return after readiness.
  child.unref();
  await writeFile(
    stateFile,
    JSON.stringify({
      pid: child.pid,
      port,
      startedAt: new Date().toISOString(),
    }),
  );
  try {
    await waitReady();
  } catch (error) {
    await stop();
    throw error;
  }
  console.log(JSON.stringify({ event: 'API_START', pid: child.pid, port }));
}
async function stop() {
  const state = await readState();
  if (!state?.pid) return;
  try {
    if (process.platform === 'win32')
      execFileSync('taskkill', ['/PID', String(state.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
    else process.kill(state.pid, 'SIGTERM');
  } catch (error) {
    // A child may already have exited; do not mask lifecycle cleanup success.
    if (error?.status !== 128 && error?.status !== 1) throw error;
  } finally {
    await writeFile(stateFile, '');
  }
  console.log(JSON.stringify({ event: 'API_STOP', pid: state.pid }));
}
async function main() {
  const command = process.argv[2] ?? 'start';
  if (command === 'start') await start();
  else if (command === 'wait') await waitReady();
  else if (command === 'stop') await stop();
  else if (command === 'restart') {
    await stop();
    await start();
  } else if (command === 'log')
    console.log(
      (await readFile(logFile, 'utf8').catch(() => '')).replace(
        /(password|secret|token|leaseToken|cookie)[^\n]*/gi,
        '[redacted]',
      ),
    );
  else throw new Error(`Unknown lifecycle command: ${command}`);
}
await main();
