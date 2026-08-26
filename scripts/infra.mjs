import { spawn } from 'node:child_process';

const compose = ['compose', '-f', 'deploy/docker/compose.yml', ...process.argv.slice(2)];
const child = spawn('docker', compose, { stdio: 'inherit', shell: true });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
