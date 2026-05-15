/**
 * VibeCode Desktop — E2E Test Fixtures
 *
 * Provides Electron app launch/teardown helpers,
 * mock provider configurations, and test workspace setup.
 */

import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ── Types ──────────────────────────────────────────────────────

export interface TestContext {
  app: ElectronApplication;
  page: Page;
  tempDir: string;
  cleanup: () => Promise<void>;
}

// ── Electron App Launch ────────────────────────────────────────

/**
 * Launch the VibeCode Electron app for testing.
 * Creates a temporary user data directory to ensure isolation.
 */
export async function launchApp(options?: {
  env?: Record<string, string>;
  args?: string[];
}): Promise<TestContext> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibecode-e2e-'));
  const userDataDir = path.join(tempDir, 'userData');
  fs.mkdirSync(userDataDir, { recursive: true });

  // Create test workspace
  const workspaceDir = path.join(tempDir, 'workspace');
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, 'package.json'), JSON.stringify({
    name: 'test-project',
    version: '1.0.0',
  }, null, 2));
  fs.writeFileSync(path.join(workspaceDir, 'hello.txt'), 'Hello, VibeCode!');
  fs.mkdirSync(path.join(workspaceDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, 'src', 'index.ts'), 'console.log("test");');

  const projectRoot = path.resolve(__dirname, '..');
  const mainPath = path.join(projectRoot, 'dist', 'main', 'main.js');

  // Ensure the app is built
  if (!fs.existsSync(mainPath)) {
    throw new Error(
      `Main process not built. Run 'npm run build' before E2E tests.\n` +
      `Expected: ${mainPath}`
    );
  }

  const app = await electron.launch({
    path: path.join(projectRoot, 'node_modules', '.bin', 'electron'),
    args: [
      path.join(projectRoot),
      `--user-data-dir=${userDataDir}`,
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      ...(options?.args || []),
    ],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      VIBECODE_DEV: 'true',
      VIBECODE_E2E: 'true',
      ...options?.env,
    },
  });

  const page = await app.firstWindow();

  // Wait for the window to be ready
  await page.waitForLoadState('domcontentloaded');

  return {
    app,
    page,
    tempDir,
    cleanup: async () => {
      try {
        await app.close();
      } catch {
        // Best-effort close
      }
      // Clean up temp directory
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    },
  };
}

// ── Mock Provider Config ───────────────────────────────────────

/**
 * Returns a mock provider configuration for testing.
 * Uses a fake API key — actual API calls should be mocked.
 */
export function getMockProviderConfig() {
  return {
    name: 'Test Provider',
    type: 'openai' as const,
    apiKey: 'sk-test-mock-key-e2e-testing',
    baseUrl: 'http://localhost:0', // Intentionally unreachable — tests should mock
    models: [
      {
        id: 'gpt-4-test',
        name: 'GPT-4 Test',
        contextWindow: 8192,
        supportsStreaming: true,
        supportsTools: false,
        supportsVision: false,
      },
    ],
    priority: 1,
  };
}

/**
 * Returns a mock Ollama provider config for local testing.
 */
export function getMockOllamaConfig() {
  return {
    name: 'Ollama Local',
    type: 'ollama' as const,
    baseUrl: 'http://localhost:11434',
    models: [
      {
        id: 'llama2',
        name: 'Llama 2',
        contextWindow: 4096,
        supportsStreaming: true,
        supportsTools: false,
        supportsVision: false,
      },
    ],
    priority: 2,
  };
}

// ── Test Helpers ───────────────────────────────────────────────

/**
 * Wait for the app to be fully loaded and responsive.
 */
export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="app-root"], .app-root, #root', {
    timeout: 15000,
  });
}

/**
 * Dismiss onboarding if it's shown.
 */
export async function dismissOnboarding(page: Page): Promise<void> {
  try {
    const onboarding = page.locator('[data-testid="onboarding"], .onboarding');
    if (await onboarding.isVisible({ timeout: 3000 })) {
      const skipButton = page.locator('button:has-text("Skip"), button:has-text("Get Started")');
      if (await skipButton.isVisible({ timeout: 1000 })) {
        await skipButton.click();
      }
    }
  } catch {
    // Onboarding may not be shown
  }
}

/**
 * Open the settings panel from the sidebar.
 */
export async function openSettings(page: Page): Promise<void> {
  const settingsTab = page.locator('[data-testid="settings-tab"], button:has-text("Settings")');
  await settingsTab.click();
}

/**
 * Configure a test provider through the settings UI.
 */
export async function configureTestProvider(page: Page): Promise<void> {
  await openSettings(page);
  // Provider configuration would go through the settings panel
  // This is a placeholder for the actual UI interaction
}

/**
 * Execute an IPC call through the renderer's window.vibecode API.
 */
export async function ipcCall<T = any>(page: Page, namespace: string, method: string, ...args: any[]): Promise<T> {
  return page.evaluate(
    ({ ns, meth, a }) => (window as any).vibecode?.[ns]?.[meth](...a),
    { ns: namespace, meth: method, a: args }
  );
}

/**
 * Create a test workspace directory with sample files.
 */
export function createTestWorkspace(baseDir: string): string {
  const workspaceDir = path.join(baseDir, 'test-workspace');
  fs.mkdirSync(workspaceDir, { recursive: true });

  // Create sample project structure
  fs.writeFileSync(path.join(workspaceDir, 'package.json'), JSON.stringify({
    name: 'e2e-test-project',
    version: '1.0.0',
    description: 'E2E test workspace',
    scripts: { test: 'echo "test"' },
  }, null, 2));

  fs.writeFileSync(path.join(workspaceDir, 'README.md'), '# Test Project\n\nE2E test workspace.');
  fs.mkdirSync(path.join(workspaceDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, 'src', 'index.ts'), 'export function hello() { return "world"; }');
  fs.writeFileSync(path.join(workspaceDir, 'src', 'utils.ts'), 'export function add(a: number, b: number) { return a + b; }');
  fs.mkdirSync(path.join(workspaceDir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, '.git', 'HEAD'), 'ref: refs/heads/main');

  return workspaceDir;
}
