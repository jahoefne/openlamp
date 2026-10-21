import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'samples', 'playwright-report', 'test-results', 'coverage', 'docs']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // `const { omitted, ...rest } = obj` is the idiomatic way to drop a key.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/worker.ts', 'src/worker/**/*.ts'],
    languageOptions: { globals: globals.worker },
  },
  {
    files: ['cli.mjs', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Core runs unchanged in the worker, the CLI and Vitest: no DOM, no worker scope.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/core must not touch the DOM.' },
        { name: 'document', message: 'src/core must not touch the DOM.' },
        { name: 'self', message: 'src/core must not depend on the worker scope.' },
      ],
    },
  },
  prettier,
]);
