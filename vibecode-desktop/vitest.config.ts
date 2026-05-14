import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

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
      'electron': resolve(__dirname, 'src/__tests__/mocks/electron.ts'),
      // Mock electron-updater for auto-updater tests
      'electron-updater': resolve(__dirname, 'src/__tests__/mocks/electron-updater.ts'),
    },
  },
});
