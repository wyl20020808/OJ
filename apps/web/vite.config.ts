import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const apiProxy = {
  target: `http://127.0.0.1:${process.env.OJPLATFORM_API_PORT ?? '3010'}`,
  changeOrigin: true,
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@ojplatform\/online-code-editor\/(.+)$/, replacement: `${resolve('D:/OJPlatform-worktrees/submission-live-eval-plugin-v2/src')}/$1` },
      { find: '@ojplatform/online-code-editor', replacement: resolve('D:/OJPlatform-worktrees/submission-live-eval-plugin-v2/src/plugin.ts') },
    ],
  },
  server: {
    fs: { allow: [resolve('D:/OJPlatform-worktrees/editor-ui-remediation-v1')] },
    proxy: { '/api': apiProxy, '/ready': apiProxy },
  },
  preview: { proxy: { '/api': apiProxy, '/ready': apiProxy } },
});
