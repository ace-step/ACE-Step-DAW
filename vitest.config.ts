import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Stub out @kabelsalat/web — Strudel's optional modular synth engine
      // has a broken export in v0.4.1. We don't use it; we use queryArc only.
      '@kabelsalat/web': resolve(__dirname, 'src/stubs/kabelsalat-web.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    server: {
      deps: {
        // Force Vite to process @strudel packages so the alias is applied
        inline: [/@strudel\/.*/],
      },
    },
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/vite-env.d.ts'],
      thresholds: {
        statements: 40,
        branches: 35,
        functions: 35,
        lines: 40,
      },
    },
  },
});
