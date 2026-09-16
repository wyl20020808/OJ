import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const apiProxy = {
  target: `http://127.0.0.1:${process.env.OJPLATFORM_API_PORT ?? '3010'}`,
  changeOrigin: true,
};
const pluginRoot = resolve(
  process.env.OJPLATFORM_ONLINE_CODE_EDITOR_ROOT ?? '../OnlineCodeEditor',
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
