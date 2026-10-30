import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      '@test': path.join(root, 'test'),
      '@': path.join(root, 'src'),
      // `server-only` throws outside a React Server Components bundle; tests run plain Node.
      'server-only': path.join(root, 'test/support/empty-module.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts', 'scripts/**/*.test.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      // The service layer and the modules behind it (adapters in src/app are covered by E2E).
      include: ['src/server/services/**', 'src/server/db/**', 'src/lib/**'],
      exclude: ['**/*.test.ts'],
      thresholds: { lines: 80, statements: 80 },
    },
  },
});
