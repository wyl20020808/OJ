import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: {
      executablePath:
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    },
  },
  webServer: [
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
