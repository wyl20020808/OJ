import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@ojplatform/database': resolve('packages/database/src/index.ts'),
      '@ojplatform/cache': resolve('packages/cache/src/index.ts'),
      '@ojplatform/storage': resolve('packages/storage/src/index.ts'),
      '@ojplatform/judge-runtime': resolve(
        'packages/judge-runtime/src/index.ts',
      ),
    },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/integration/**'],
  },
});
