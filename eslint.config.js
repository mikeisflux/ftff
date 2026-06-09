import js from '@eslint/js';
import globals from 'globals';

// Flat ESLint config covering the Node server and the React client. Kept
// intentionally lenient — it catches real mistakes (undefined vars, unreachable
// code) without failing CI on stylistic preferences.
export default [
  { ignores: ['**/dist/**', '**/node_modules/**', '**/uploads/**'] },
  js.configs.recommended,
  {
    files: ['server/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    files: ['client/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^[A-Z_]' }],
    },
  },
];
