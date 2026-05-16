/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest configuration.
 *
 * The transform layer (`src/lib/chart/transform.ts`) is pure,
 * so a Node environment is enough — no DOM/jsdom required.
 *
 * Path alias `@/*` mirrors `tsconfig.json` so imports stay consistent
 * with application code.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/chart/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
