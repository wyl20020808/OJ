import { spawn } from 'node:child_process';

const port = 3020;
const base = `http://127.0.0.1:${port}`;
const start = () => spawn('pnpm', ['--filter', '@ojplatform/api', 'dev'], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' }, stdio: 'pipe', shell: true });
const waitFor = async (url, timeout = 10000) => { const end = Date.now() + timeout; while (Date.now() < end) { try { const r = await fetch(url); if (r.ok) return r; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error(`Timed out waiting for ${url}`); };
const stop = (child) => new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('API shutdown timeout')), 5000); child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGTERM'); });
const verify = async () => { const health = await waitFor(`${base}/health`); if ((await health.json()).status !== 'ok') throw new Error('health contract failed'); const ready = await fetch(`${base}/ready`); if (ready.status !== 200) throw new Error('ready contract failed'); const missing = await fetch(`${base}/missing`); if (missing.status !== 404) throw new Error('404 contract failed'); if (!health.headers.get('x-request-id')) throw new Error('request id missing'); };
for (let round = 1; round <= 2; round += 1) { const child = start(); await verify(); await stop(child); console.log(`runtime round ${round} PASS`); }
console.log('API runtime smoke PASS: start, health, ready, 404, request ID, graceful shutdown, port reuse.');
