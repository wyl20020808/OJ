import { spawn } from 'node:child_process';

const child = spawn('pnpm', ['--filter', '@ojplatform/api', 'dev'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: '3010',
    HOST: '127.0.0.1',
    ...(process.env.OJPLATFORM_PHASE2B_REAL_RUNTIME === 'true'
      ? { OJPLATFORM_OPERATOR_USERNAMES: 'phase2b-operator' }
      : {}),
  },
  shell: true,
});
if (
  process.env.OJPLATFORM_E2E_SEED_OPERATOR === 'true' ||
  process.env.OJPLATFORM_PHASE2B_REAL_RUNTIME === 'true'
) {
  const seed = async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const health = await fetch('http://127.0.0.1:3010/health');
        if (health.ok) {
          await fetch('http://127.0.0.1:3010/api/auth/register', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              username: 'phase2b-operator',
              email: 'phase2b-operator@example.test',
              displayName: 'Phase 2B Operator',
              password: 'Phase2BOperatorPass123!',
            }),
          });
          return;
        }
      } catch {
        // The child may still be starting; readiness remains the authority.
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  };
  void seed();
}
const stop = () => {
  if (!child.killed) child.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
