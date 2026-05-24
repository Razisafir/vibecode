import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'dist-electron/',
      'node_modules/',
      'scripts/',
      '*.js',
      '*.mjs',
      '*.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    ...reactPlugin.configs.flat.recommended,
    ...reactPlugin.configs.flat['jsx-runtime'],
    settings: {
      react: {
        version: 'detect',
      },
    },
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // ─── ARC 15: Graph Enforcement Lint Rule ──────────────────────────────────
  // "No direct fs / pty / exec imports outside gateway"
  // This rule ensures that no main-process code directly imports fs, child_process,
  // or node-pty OUTSIDE of the approved gateway/executor files.
  // Violations indicate a bypass of the ExecutionGateway.
  {
    files: ['src/main/**/*.ts'],
    ignores: [
      'src/main/core/**',           // Gateway + Audit — allowed to reference
      'src/main/ipc/fs-handlers.ts', // FS handlers — audit-enforced
      'src/main/ipc/terminal-handlers.ts', // Terminal handlers — gateway-enforced
      'src/main/services/executors/**',    // Executors — authorized by step nodes
      'src/main/services/execution-state-machine.ts', // ESM — needs fs for persistence
      'src/main/services/execution-persistence.ts',   // Persistence — needs fs
      'src/main/services/path-sandbox.ts',            // Path sandbox — needs fs
      'src/main/services/diff-engine.ts',             // Diff engine — reads files
      'src/main/utils/**',                  // Utils — generally safe
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['fs', 'fs/promises', 'node:fs', 'node:fs/promises'],
            message: 'ARC 15: Direct fs imports are FORBIDDEN outside the ExecutionGateway. Use ExecutionGateway.executeFileMutation() or authorizeFsOp() instead. "No Node → No Action"',
          },
          {
            group: ['child_process', 'node:child_process'],
            message: 'ARC 15: Direct child_process imports are FORBIDDEN outside the ExecutionGateway. Use ExecutionGateway.executeTerminalCommand() instead. "No Node → No Action"',
          },
        ],
      }],
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'off',
      'no-unused-vars': 'off',
    },
  },
);
