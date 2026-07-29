// ESLint 9 (flat config) — nunca existia um config aqui, então `npm run
// lint` sempre falhava silenciosamente (Fase 10 de
// docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md, critério de aceite
// "npm run lint... passam"). Regras deliberadamente enxutas: o objetivo
// agora é ter lint funcionando de verdade (pega erro real: variável não
// usada, import quebrado), não reescrever o estilo do projeto inteiro
// numa tacada só.
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: [
      'src/renderer/out/**',
      'src/renderer/.next/**',
      'dist/**',
      'release/**',
      'node_modules/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
