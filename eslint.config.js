// ESLint flat config (ESLint 9+). No external plugins so `npm run lint` works offline.
// Gameplay files are linted but never auto-fixed in a way that changes logic;
// run `npm run lint:fix` only for style issues.
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**']
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module'
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'warn'
    }
  }
];
