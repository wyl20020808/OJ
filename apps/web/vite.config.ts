import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxy = {
  target: `http://127.0.0.1:${process.env.OJPLATFORM_API_PORT ?? '3010'}`,
  changeOrigin: true,
};

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': apiProxy, '/ready': apiProxy } },
  preview: { proxy: { '/api': apiProxy, '/ready': apiProxy } },
});
