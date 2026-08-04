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
    // Principle V / plan.md Project Structure: apps/experience (public runtime, ships to the LED
    // wall) and apps/content-pipeline (prep-time only, never bundled) are separate operational
    // concerns. Package-name imports are already impossible (neither app depends on the other),
    // this additionally blocks reaching across via relative paths.
    files: ['apps/experience/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'content-pipeline',
              message:
                'apps/experience (public runtime) must not import apps/content-pipeline (prep-time only). See plan.md Project Structure.',
            },
          ],
          patterns: [
            {
              group: ['**/content-pipeline/**', '**/apps/content-pipeline/**'],
              message:
                'apps/experience (public runtime) must not import apps/content-pipeline (prep-time only). See plan.md Project Structure.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/content-pipeline/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'experience',
              message:
                'apps/content-pipeline (prep-time only) must not import apps/experience (public runtime). See plan.md Project Structure.',
            },
          ],
          patterns: [
            {
              group: ['**/experience/**'],
              message:
                'apps/content-pipeline (prep-time only) must not import apps/experience (public runtime). See plan.md Project Structure.',
            },
          ],
        },
      ],
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
