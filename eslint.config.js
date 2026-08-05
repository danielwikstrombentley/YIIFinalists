import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Monorepo-wide flat config (ESLint 9). Type-aware linting is intentionally left off for CI speed;
// enable per-package `parserOptions.project` later if a rule genuinely needs type information.

/**
 * Builds `no-restricted-syntax` selectors that reject every *statically analyzable* way to reach
 * a forbidden path segment (e.g. `content-pipeline`) via dynamic `import()`: a plain string
 * literal, a no-substitution template literal, and Vite's `import.meta.glob()`/`globEager()`
 * sugar. This closes what `no-restricted-imports` (static import/export declarations only)
 * cannot see.
 *
 * Fundamental limit, documented rather than chased further: a specifier built at runtime from a
 * variable (e.g. `import(someComputedPath)`) is not statically analyzable by any lint rule or
 * dependency-graph tool — that class of bypass is only guarded against by code review and the
 * constitution check (plan.md Principle V), not by tooling.
 */
function crossAppBoundarySelectors(forbiddenSegment, message) {
  const anchored = `/(^|\\/)${forbiddenSegment}(\\/|$)/`;
  const globCallee = `CallExpression[callee.object.type='MetaProperty'][callee.property.name=/^glob(Eager)?$/]`;
  return [
    { selector: `ImportExpression > Literal[value=${anchored}]`, message },
    {
      selector: `ImportExpression > TemplateLiteral > TemplateElement[value.cooked=${anchored}]`,
      message,
    },
    // Descendant (not child) combinator below: `import.meta.glob()`/`globEager()` accept either a
    // single pattern or an array of patterns (`glob(['a', 'b'])`), so the literal/template can be
    // nested one level deeper inside an ArrayExpression argument.
    { selector: `${globCallee} Literal[value=${anchored}]`, message },
    { selector: `${globCallee} TemplateElement[value.cooked=${anchored}]`, message },
  ];
}

const EXPERIENCE_TO_PIPELINE_MESSAGE =
  'apps/experience (public runtime) must not import apps/content-pipeline (prep-time only), including via dynamic import()/import.meta.glob(). See plan.md Project Structure.';
const PIPELINE_TO_EXPERIENCE_MESSAGE =
  'apps/content-pipeline (prep-time only) must not import apps/experience (public runtime), including via dynamic import()/import.meta.glob(). See plan.md Project Structure.';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.min.js',
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
    // this additionally blocks reaching across via relative paths, static or dynamic.
    files: ['apps/experience/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'content-pipeline', message: EXPERIENCE_TO_PIPELINE_MESSAGE }],
          patterns: [
            {
              group: ['**/content-pipeline/**', '**/apps/content-pipeline/**'],
              message: EXPERIENCE_TO_PIPELINE_MESSAGE,
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...crossAppBoundarySelectors('content-pipeline', EXPERIENCE_TO_PIPELINE_MESSAGE),
      ],
    },
  },
  {
    files: ['apps/content-pipeline/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'experience', message: PIPELINE_TO_EXPERIENCE_MESSAGE }],
          patterns: [{ group: ['**/experience/**'], message: PIPELINE_TO_EXPERIENCE_MESSAGE }],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...crossAppBoundarySelectors('experience', PIPELINE_TO_EXPERIENCE_MESSAGE),
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
