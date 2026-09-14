import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: {
    baseURL: process.env.CONTEST_RUNTIME_URL ?? 'http://127.0.0.1:5174',
    launchOptions: {
      executablePath:
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    },
  },
});
