// @ts-check
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      'dist/',
      'node_modules/',
      '**/.weifuwu/',
      '**/.sessions/',
      'coverage/',
      'examples/',
      '.scripts/',
      'scripts/',
    ],
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // ── Gradual strictness ──────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'warn', // Stage 2 target: error
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'error',
      // {} is valid in many patterns (e.g. Record<string, {}>); fix gradually
      '@typescript-eslint/no-empty-object-type': 'warn',

      // ── Code quality ───────────────────────────────────────────
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-console': 'warn', // allow logger but not raw console
      'no-duplicate-imports': 'error',
      // Empty catch blocks need comments; use _err pattern
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // ── Test files get looser rules ──────────────────────────────
  {
    files: ['test/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-console': 'off',
      // Side-effect imports (setup) legitimately coexist with named imports
      'no-duplicate-imports': 'off',
      'no-useless-assignment': 'off',
    },
  },
  // ── Client-side hooks (browser globals) ──────────────────────
  {
    files: ['use-*.ts', 'client-*.ts', 'client-theme.ts'],
    rules: {
      'no-console': 'off',
    },
  },
)
