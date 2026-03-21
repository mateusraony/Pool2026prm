import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts', 'src/**/routes/__tests__/**/*.test.ts', 'src/**/services/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/services/**/*.ts', 'src/adapters/**/*.ts'],
      exclude: ['src/__tests__/**'],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 70,
        functions: 70,
      },
    },
  },
});
