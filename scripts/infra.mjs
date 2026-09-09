/* global process */
import { spawn, spawnSync } from 'node:child_process';

const compose = ['compose', '-f', 'deploy/docker/compose.yml', ...process.argv.slice(2)];
const command = process.platform === 'win32' ? 'wsl.exe' : 'docker';
const args = process.platform === 'win32' ? ['-d', 'Ubuntu-24.04', '--', 'docker', ...compose] : compose;
const keeperName = 'ojplatform-infra-keeper';
if (process.platform === 'win32' && process.argv[2] === 'up') {
  const keeper = spawn('wsl.exe', ['-d', 'Ubuntu-24.04', '--', 'bash', '-lc', `exec -a ${keeperName} sleep infinity`], { detached: true, stdio: 'ignore', windowsHide: true });
  keeper.unref();
}
const child = spawn(command, args, { stdio: 'inherit', shell: false });
child.on('exit', (code, signal) => {
  if (process.platform === 'win32' && process.argv[2] === 'down') spawnSync('wsl.exe', ['-d', 'Ubuntu-24.04', '--', 'pkill', '-f', keeperName], { stdio: 'ignore' });
  process.exit(code ?? (signal ? 1 : 0));
});
