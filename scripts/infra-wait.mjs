import { setTimeout as wait } from 'node:timers/promises';
import { execFileSync } from 'node:child_process';

for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    execFileSync('docker', ['compose', '-f', 'deploy/docker/compose.yml', 'up', '--wait'], { stdio: 'inherit' });
    process.exit(0);
  } catch { await wait(1000); }
}
throw new Error('Infrastructure did not become healthy within 30 seconds');
