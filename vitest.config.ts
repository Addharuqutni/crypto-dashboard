/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest configuration.
 *
 * Path alias `@/*` mirrors `tsconfig.json` so imports stay consistent with
 * application code.
 *
 * Windows-specific note: Vite's SSR-fetch transform cache lives under
 * `os.tmpdir()/<run>/ssr/<hash>`, regardless of `cacheDir`. On some Windows
 * setups (Defender real-time protection, OneDrive Files-On-Demand) those
 * temp files can be locked or quarantined between write and reopen, raising
 * `UNKNOWN: unknown error, open`. Inlining the worker module via
 * `server.deps.inline` bypasses that disk cache entirely and is harmless on
 * non-Windows hosts.
 *
 * `pool: 'forks'` ensures each test file runs in a child process so cached
 * module state cannot leak between unrelated test suites.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    pool: 'forks',
    server: {
      deps: {
        inline: [/src[\\/]lib[\\/]worker[\\/]/],
      },
    },
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/lib/application/**/*.ts',
        'src/lib/domain/**/*.ts',
        'src/lib/adapters/**/*.ts',
      ],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/index.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
