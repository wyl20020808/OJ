import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'blog-full-experience.spec.ts',
  workers: 1,
  use: {
    baseURL: process.env.OJPLATFORM_BLOG_E2E_URL ?? 'http://127.0.0.1:5173',
    launchOptions: {
      executablePath:
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    },
  },
});
