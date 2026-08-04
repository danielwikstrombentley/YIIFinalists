import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Monorepo-wide flat config (ESLint 9). Type-aware linting is intentionally left off for CI speed;
// enable per-package `parserOptions.project` later if a rule genuinely needs type information.
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.pnpm-store/**',
      'spec-kit/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Config files run under Node directly, not through the app bundlers.
    files: ['**/*.config.{js,ts,mjs,cjs}'],
    rules: {
      'no-console': 'off',
    },
  },
);
