// eslint.config.js — config mínimo sem dependências extras de ESLint
// Para usar o config completo (com typescript-eslint e react plugins),
// instale: eslint typescript-eslint eslint-plugin-react eslint-plugin-react-hooks
export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
