import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@ojplatform/database',
        replacement: resolve('packages/database/src/index.ts'),
      },
      {
        find: '@ojplatform/cache',
        replacement: resolve('packages/cache/src/index.ts'),
      },
      {
        find: '@ojplatform/storage',
        replacement: resolve('packages/storage/src/index.ts'),
      },
      {
        find: '@ojplatform/judge-runtime',
        replacement: resolve('packages/judge-runtime/src/index.ts'),
      },
      {
        find: '@ojplatform/plugin-sdk',
        replacement: resolve('packages/plugin-sdk/src/index.ts'),
      },
      {
        find: '@ojplatform/capability-broker',
        replacement: resolve('packages/capability-broker/src/index.ts'),
      },
      {
        find: /^@ojplatform\/online-code-editor\/(.+)$/,
        replacement: resolve('plugins/OnlineCodeEditor/src') + '/$1',
      },
      {
        find: '@ojplatform/online-code-editor',
        replacement: resolve('plugins/OnlineCodeEditor/src/plugin.ts'),
      },
    ],
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/integration/**'],
  },
});
