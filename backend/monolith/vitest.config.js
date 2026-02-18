import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@integram/common': path.resolve(__dirname, '../../packages/@integram/common/index.js'),
      '@integram/database': path.resolve(__dirname, '../../packages/@integram/database/index.js'),
      '@integram/logger': path.resolve(__dirname, '../../packages/@integram/logger/index.js'),
    },
  },
  test: {
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs}',
      '../../packages/**/__tests__/*.{test,spec}.{js,mjs,cjs}',
      '../../services/**/__tests__/*.{test,spec}.{js,mjs,cjs}',
    ],
    globals: true,
    environment: 'node',
    testTimeout: 30000,
  },
});
