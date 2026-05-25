// VibeCode System Integration - Shell Detector v11.0
// Detects whether VibeCode is running in development mode or VS Code fork production mode.
// This determination affects how system modules initialize and which adapters are used.

/**
 * Shell mode indicating the runtime environment.
 */
export type ShellMode = 'development' | 'production';

/**
 * Shell detection result with detailed environment information.
 */
export interface ShellDetectionResult {
  /** The detected shell mode */
  mode: ShellMode;
  /** Whether the VS Code fork bridge is available */
  bridgeAvailable: boolean;
  /** The runtime platform */
  platform: string;
  /** Whether running in CI environment */
  ci: boolean;
  /** Whether running in Electron context */
  electronContext: boolean;
  /** Environment indicators that led to this detection */
  indicators: string[];
}

/**
 * Detects the current shell mode based on environment variables and runtime context.
 *
 * Development mode:
 *   - Running directly with vitest or ts-node
 *   - No VS Code fork bridge available
 *   - System modules use development adapters (mocks/stubs)
 *
 * Production mode:
 *   - Running within the VS Code fork desktop runtime
 *   - VS Code fork bridge is available via global scope
 *   - System modules connect to fork's native services
 */
export function detectShellMode(): ShellDetectionResult {
  const indicators: string[] = [];
  let mode: ShellMode = 'development';
  let bridgeAvailable = false;
  let electronContext = false;

  // Check for VS Code fork production environment
  const vibecodeEnv = process.env.VIBECODE_ENV;
  const vscodeForkId = process.env.VSCODE_FORK;
  const electronRunAsNode = process.env.ELECTRON_RUN_AS_NODE;

  // Detect Electron context
  if (typeof process !== 'undefined' && typeof process.versions === 'object' && 'electron' in process.versions) {
    electronContext = true;
    indicators.push('process.versions.electron present');
  }

  // Detect VS Code fork production mode
  if (vscodeForkId === '1') {
    mode = 'production';
    indicators.push('VSCODE_FORK=1');
  }

  if (vibecodeEnv === 'production') {
    mode = 'production';
    indicators.push('VIBECODE_ENV=production');
  }

  // Check for bridge availability on global scope
  if (typeof globalThis !== 'undefined' && '__VIBECODE_BRIDGE__' in globalThis) {
    bridgeAvailable = true;
    mode = 'production';
    indicators.push('__VIBECODE_BRIDGE__ on globalThis');
  }

  // When running as Node.js (not Electron), we're in development
  if (electronRunAsNode === '1') {
    mode = 'development';
    electronContext = false;
    indicators.push('ELECTRON_RUN_AS_NODE=1 (dev mode)');
  }

  // Detect CI environment
  const ci = !!(process.env.CI || process.env.GITHUB_ACTIONS || process.env.JENKINS_URL);

  if (ci) {
    indicators.push('CI environment detected');
  }

  // Default to development if no production indicators found
  if (indicators.length === 0) {
    indicators.push('No production indicators found — defaulting to development mode');
  }

  return {
    mode,
    bridgeAvailable,
    platform: process.platform,
    ci,
    electronContext,
    indicators,
  };
}

/**
 * Quick check: is VibeCode running in development mode?
 */
export function isDevelopmentMode(): boolean {
  return detectShellMode().mode === 'development';
}

/**
 * Quick check: is VibeCode running in VS Code fork production mode?
 */
export function isProductionMode(): boolean {
  return detectShellMode().mode === 'production';
}
