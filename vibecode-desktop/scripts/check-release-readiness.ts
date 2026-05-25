#!/usr/bin/env npx ts-node
// Phase 10: Release Readiness Check
// Check 25: Produces valid JSON report

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ReadinessCheck {
  name: string;
  passed: boolean;
  details: string;
  weight: number;
}

interface ReadinessReport {
  timestamp: string;
  version: string;
  overallScore: number;
  status: 'READY' | 'NOT_READY' | 'CONDITIONALLY_READY';
  checks: ReadinessCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    score: number;
  };
}

const rootDir = join(__dirname, '..');

function check(name: string, condition: boolean, details: string, weight: number = 1): ReadinessCheck {
  return { name, passed: condition, details, weight };
}

function runChecks(): ReadinessReport {
  const checks: ReadinessCheck[] = [];

  // 1. Package.json exists and valid
  const pkgPath = join(rootDir, 'package.json');
  const pkgExists = existsSync(pkgPath);
  let pkgValid = false;
  if (pkgExists) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      pkgValid = !!pkg.name && !!pkg.version && !!pkg.description;
    } catch {}
  }
  checks.push(check('package.json exists and valid', pkgExists && pkgValid, pkgExists ? 'Found and valid' : 'Missing or invalid', 3));

  // 2. TypeScript config exists
  const tsconfigExists = existsSync(join(rootDir, 'tsconfig.json'));
  checks.push(check('tsconfig.json exists', tsconfigExists, tsconfigExists ? 'Found' : 'Missing', 2));

  // 3. System kernel types exist
  const typesExist = existsSync(join(rootDir, 'src/system/kernel/types.ts'));
  checks.push(check('Kernel types defined', typesExist, typesExist ? 'types.ts found' : 'Missing', 3));

  // 4. State manager exists
  const stateExists = existsSync(join(rootDir, 'src/system/kernel/state.ts'));
  checks.push(check('State manager exists', stateExists, stateExists ? 'state.ts found' : 'Missing', 2));

  // 5. Lifecycle hooks exist
  const lifecycleExists = existsSync(join(rootDir, 'src/system/runtime/lifecycle.ts'));
  checks.push(check('Lifecycle hooks exist', lifecycleExists, lifecycleExists ? 'lifecycle.ts found' : 'Missing', 2));

  // 6. Plugin system exists
  const pluginManagerExists = existsSync(join(rootDir, 'src/system/runtime/plugin-manager.ts'));
  const pluginSandboxExists = existsSync(join(rootDir, 'src/system/runtime/plugin-sandbox.ts'));
  const pluginApiExists = existsSync(join(rootDir, 'src/system/runtime/plugin-api.ts'));
  const pluginRegistryExists = existsSync(join(rootDir, 'src/system/runtime/plugin-registry.ts'));
  const pluginSystemComplete = pluginManagerExists && pluginSandboxExists && pluginApiExists && pluginRegistryExists;
  checks.push(check('Plugin system complete', pluginSystemComplete, `Manager: ${pluginManagerExists}, Sandbox: ${pluginSandboxExists}, API: ${pluginApiExists}, Registry: ${pluginRegistryExists}`, 4));

  // 7. Multi-window system exists
  const windowManagerExists = existsSync(join(rootDir, 'src/system/runtime/window-manager.ts'));
  const windowHandleExists = existsSync(join(rootDir, 'src/system/runtime/window-handle.ts'));
  const ipcRouterExists = existsSync(join(rootDir, 'src/system/runtime/ipc-router.ts'));
  const windowSessionExists = existsSync(join(rootDir, 'src/system/runtime/window-session.ts'));
  const windowSystemComplete = windowManagerExists && windowHandleExists && ipcRouterExists && windowSessionExists;
  checks.push(check('Multi-window system complete', windowSystemComplete, `Manager: ${windowManagerExists}, Handle: ${windowHandleExists}, IPC: ${ipcRouterExists}, Session: ${windowSessionExists}`, 4));

  // 8. Observability layer exists
  const telemetryExists = existsSync(join(rootDir, 'src/system/observability/telemetry.ts'));
  const healthServerExists = existsSync(join(rootDir, 'src/system/observability/health-server.ts'));
  const auditLogExists = existsSync(join(rootDir, 'src/system/observability/audit-log.ts'));
  const observabilityComplete = telemetryExists && healthServerExists && auditLogExists;
  checks.push(check('Observability layer complete', observabilityComplete, `Telemetry: ${telemetryExists}, Health: ${healthServerExists}, Audit: ${auditLogExists}`, 3));

  // 9. Supervision layer exists
  const watchdogExists = existsSync(join(rootDir, 'src/system/supervision/watchdog.ts'));
  const crashRecoveryExists = existsSync(join(rootDir, 'src/system/supervision/crash-recovery.ts'));
  const sessionRecoveryExists = existsSync(join(rootDir, 'src/system/supervision/session-recovery.ts'));
  const crashDumpExists = existsSync(join(rootDir, 'src/system/supervision/crash-dump.ts'));
  const supervisionComplete = watchdogExists && crashRecoveryExists && sessionRecoveryExists && crashDumpExists;
  checks.push(check('Supervision layer complete', supervisionComplete, `Watchdog: ${watchdogExists}, CrashRecovery: ${crashRecoveryExists}, SessionRecovery: ${sessionRecoveryExists}, CrashDump: ${crashDumpExists}`, 3));

  // 10. CSP and Safe Mode exist
  const cspExists = existsSync(join(rootDir, 'src/system/runtime/csp.ts'));
  const safeModeExists = existsSync(join(rootDir, 'src/system/runtime/safe-mode.ts'));
  checks.push(check('Security modules exist', cspExists && safeModeExists, `CSP: ${cspExists}, SafeMode: ${safeModeExists}`, 2));

  // 11. CI/CD workflows exist
  const ciYmlExists = existsSync(join(rootDir, '.github/workflows/ci.yml'));
  const releaseYmlExists = existsSync(join(rootDir, '.github/workflows/release.yml'));
  const smokeYmlExists = existsSync(join(rootDir, '.github/workflows/smoke-test.yml'));
  checks.push(check('CI/CD pipelines exist', ciYmlExists && releaseYmlExists && smokeYmlExists, `CI: ${ciYmlExists}, Release: ${releaseYmlExists}, Smoke: ${smokeYmlExists}`, 3));

  // 12. electron-builder.yml exists
  const electronBuilderExists = existsSync(join(rootDir, 'electron-builder.yml'));
  checks.push(check('electron-builder.yml exists', electronBuilderExists, electronBuilderExists ? 'Found' : 'Missing', 3));

  // 13. Test infrastructure exists
  const vitestConfigExists = existsSync(join(rootDir, 'vitest.config.ts'));
  const testDirExists = existsSync(join(rootDir, 'src/tests'));
  checks.push(check('Test infrastructure exists', vitestConfigExists && testDirExists, `Vitest config: ${vitestConfigExists}, Tests dir: ${testDirExists}`, 3));

  // 14. README exists
  const readmeExists = existsSync(join(rootDir, 'README.md'));
  checks.push(check('README.md exists', readmeExists, readmeExists ? 'Found' : 'Missing', 2));

  // 15. CHANGELOG exists
  const changelogExists = existsSync(join(rootDir, 'CHANGELOG.md'));
  checks.push(check('CHANGELOG.md exists', changelogExists, changelogExists ? 'Found' : 'Missing', 2));

  // 16. Verification report exists
  const verificationReportExists = existsSync(join(rootDir, 'VERIFICATION_REPORT.md'));
  checks.push(check('Verification report exists', verificationReportExists, verificationReportExists ? 'Found' : 'Missing', 2));

  // 17. Main entry point exists
  const mainExists = existsSync(join(rootDir, 'src/main/main.ts'));
  checks.push(check('Main entry point exists', mainExists, mainExists ? 'Found' : 'Missing', 2));

  // 18. Branding service exists
  const brandingExists = existsSync(join(rootDir, 'src/main/services/branding.ts'));
  checks.push(check('Branding service exists', brandingExists, brandingExists ? 'Found' : 'Missing', 1));

  // 19. Safety guard exists
  const safetyGuardExists = existsSync(join(rootDir, 'src/main/services/safety/runtime-safety-guard.ts'));
  checks.push(check('Safety guard exists', safetyGuardExists, safetyGuardExists ? 'Found' : 'Missing', 2));

  // 20. macOS entitlements exist
  const entitlementsExist = existsSync(join(rootDir, 'build/entitlements.mac.plist'));
  checks.push(check('macOS entitlements exist', entitlementsExist, entitlementsExist ? 'Found' : 'Missing', 2));

  // Calculate score
  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const passedWeight = checks.filter(c => c.passed).reduce((sum, c) => sum + c.weight, 0);
  const score = Math.round((passedWeight / totalWeight) * 100);

  const passed = checks.filter(c => c.passed).length;
  const failed = checks.filter(c => !c.passed).length;

  let status: ReadinessReport['status'];
  if (score >= 90) status = 'READY';
  else if (score >= 75) status = 'CONDITIONALLY_READY';
  else status = 'NOT_READY';

  // Read version from package.json
  let version = '0.0.0';
  try {
    const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
    version = pkg.version || '0.0.0';
  } catch {}

  return {
    timestamp: new Date().toISOString(),
    version,
    overallScore: score,
    status,
    checks,
    summary: { total: checks.length, passed, failed, score },
  };
}

const report = runChecks();
console.log(JSON.stringify(report, null, 2));

if (report.overallScore < 90) {
  process.exit(1);
}
