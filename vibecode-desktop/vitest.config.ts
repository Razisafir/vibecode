import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
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
      // Mock Electron imports at the module level
      'electron': new URL('./src/__tests__/mocks/electron.ts', import.meta.url).pathname,
    },
  },
});
