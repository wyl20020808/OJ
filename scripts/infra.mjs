import { spawn } from 'node:child_process';

const compose = ['compose', '-f', 'deploy/docker/compose.yml', ...process.argv.slice(2)];
const command = process.platform === 'win32' ? 'wsl.exe' : 'docker';
const args = process.platform === 'win32' ? ['-d', 'Ubuntu-24.04', '--', 'docker', ...compose] : compose;
const child = spawn(command, args, { stdio: 'inherit', shell: false });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
