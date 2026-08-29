import { defineConfig } from '@playwright/test';

const phase1eRuntime = process.env.OJPLATFORM_PHASE1E_REAL_RUNTIME === 'true';
const apiPort = process.env.PHASE1E_API_PORT ?? '3021';
const webPort = phase1eRuntime ? 4174 : 4173;

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    launchOptions: {
      executablePath:
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    },
  },
  webServer: phase1eRuntime
    ? [
        {
          command:
            'pnpm --filter @ojplatform/web build && pnpm --filter @ojplatform/web preview --host 127.0.0.1 --port 4174',
          url: 'http://127.0.0.1:4174',
          reuseExistingServer: false,
          env: { OJPLATFORM_API_PORT: apiPort },
        },
      ]
    : [
        {
          command: 'node scripts/start-api.mjs',
          url: 'http://127.0.0.1:3010/health',
          reuseExistingServer: false,
        },
        {
          command:
            'pnpm --filter @ojplatform/web build && pnpm --filter @ojplatform/web preview --host 127.0.0.1 --port 4173',
          url: 'http://127.0.0.1:4173',
          reuseExistingServer: false,
        },
      ],
});
