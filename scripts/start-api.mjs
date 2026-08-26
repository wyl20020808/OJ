import { spawn } from 'node:child_process';

const child = spawn('pnpm', ['--filter', '@ojplatform/api', 'dev'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    OJPLATFORM_INFRA: 'false',
    PORT: '3010',
    HOST: '127.0.0.1',
  },
  shell: true,
});
const stop = () => {
  if (!child.killed) child.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
