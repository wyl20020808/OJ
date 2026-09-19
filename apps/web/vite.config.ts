import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiProxy = {
  target: `http://127.0.0.1:${process.env.OJPLATFORM_API_PORT ?? '3010'}`,
  changeOrigin: true,
};
// Resolved relative to this config, so the fallback works regardless of the
// working directory. The Web image sets OJPLATFORM_ONLINE_CODE_EDITOR_ROOT to
// its container path, which still takes precedence.
const pluginRoot = resolve(
  process.env.OJPLATFORM_ONLINE_CODE_EDITOR_ROOT ??
    fileURLToPath(new URL('../../plugins/OnlineCodeEditor', import.meta.url)),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      {
        find: /^@ojplatform\/online-code-editor\/(.+)$/,
        replacement: `${resolve(pluginRoot, 'src')}/$1`,
      },
      {
        find: '@ojplatform/online-code-editor',
        replacement: resolve(pluginRoot, 'src/plugin.ts'),
      },
    ],
  },
  server: {
    fs: { allow: [pluginRoot] },
    proxy: { '/api': apiProxy, '/ready': apiProxy },
  },
  preview: { proxy: { '/api': apiProxy, '/ready': apiProxy } },
});
