import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Vitest shares the Vite pipeline (research R16) so component tests resolve the same aliases,
// plugins, and static-asset handling as the real build.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./tests/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
      exclude: ['tests/e2e/**', 'node_modules/**'],
      // No hosted CI in this project (local verification only) — reject accidentally committed
      // `.only` focused tests unconditionally instead of gating on a CI env var that never exists.
      allowOnly: false,
    },
  }),
);
