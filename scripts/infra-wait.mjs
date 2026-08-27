import { setTimeout as wait } from 'node:timers/promises';
import { execFileSync } from 'node:child_process';

const dockerCommand = process.platform === 'win32' ? 'wsl.exe' : 'docker';
const dockerPrefix = process.platform === 'win32' ? ['-d', 'Ubuntu-24.04', '--', 'docker'] : [];

for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    execFileSync(dockerCommand, [...dockerPrefix, 'compose', '-f', 'deploy/docker/compose.yml', 'up', '--wait'], { stdio: 'inherit' });
    process.exit(0);
  } catch { await wait(1000); }
}
throw new Error('Infrastructure did not become healthy within 30 seconds');
