import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'dist-electron'],
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/main/services/**/*.ts', 'src/main/utils/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
      'electron': resolve(__dirname, 'src/__tests__/mocks/electron.ts'),
      'electron-updater': resolve(__dirname, 'src/__tests__/mocks/electron-updater.ts'),
    },
  },
  esbuild: {
    target: 'es2020',
  },
});
