import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
    include: ['**/__tests__/**/*.test.js', 'src/**/__tests__/**/*.test.js'],
  },
});
