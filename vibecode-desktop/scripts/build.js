#!/usr/bin/env node
/**
 * VibeCode Desktop — Build Script
 *
 * Production build script with environment separation.
 * Supports: development, staging, production
 *
 * Usage:
 *   node scripts/build.js              # production build
 *   node scripts/build.js --env=dev    # development build
 *   node scripts/build.js --env=staging # staging build
 *   node scripts/build.js --no-pack    # build only, no packaging
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Parse Arguments ────────────────────────────────────────────
const args = process.argv.slice(2);
let env = 'production';
let noPack = false;
let platform = process.platform;
let clean = false;

for (const arg of args) {
  if (arg.startsWith('--env=')) {
    env = arg.split('=')[1];
  } else if (arg === '--no-pack') {
    noPack = true;
  } else if (arg.startsWith('--platform=')) {
    platform = arg.split('=')[1];
  } else if (arg === '--clean') {
    clean = true;
  } else if (arg === '--help') {
    console.log(`
VibeCode Build Script

Usage:
  node scripts/build.js [options]

Options:
  --env=<env>        Build environment: development, staging, production (default: production)
  --platform=<plat>  Target platform: darwin, win32, linux (default: current)
  --no-pack          Build only, skip electron-builder packaging
  --clean            Clean build artifacts before building
  --help             Show this help
`);
    process.exit(0);
  }
}

const validEnvs = ['development', 'staging', 'production'];
if (!validEnvs.includes(env)) {
  console.error(`Invalid environment: ${env}. Must be one of: ${validEnvs.join(', ')}`);
  process.exit(1);
}

// ── Configuration ──────────────────────────────────────────────
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const distElectronDir = path.join(projectRoot, 'dist-electron');

const envConfig = {
  development: {
    VIBECODE_ENV: 'development',
    VIBECODE_DEV: 'true',
    VIBECODE_API_URL: 'http://localhost:3001',
    VIBECODE_UPDATE_CHANNEL: 'nightly',
    NODE_ENV: 'development',
  },
  staging: {
    VIBECODE_ENV: 'staging',
    VIBECODE_DEV: 'false',
    VIBECODE_API_URL: 'https://staging-api.vibecode.dev',
    VIBECODE_UPDATE_CHANNEL: 'beta',
    NODE_ENV: 'staging',
  },
  production: {
    VIBECODE_ENV: 'production',
    VIBECODE_DEV: 'false',
    VIBECODE_API_URL: 'https://api.vibecode.dev',
    VIBECODE_UPDATE_CHANNEL: 'stable',
    NODE_ENV: 'production',
  },
};

// ── Helper Functions ───────────────────────────────────────────
function run(command, options = {}) {
  console.log(`[Build] > ${command}`);
  try {
    execSync(command, {
      stdio: 'inherit',
      cwd: projectRoot,
      env: { ...process.env, ...options.env },
      ...options,
    });
    return true;
  } catch (error) {
    if (!options.allowFail) {
      console.error(`[Build] FAILED: ${command}`);
      process.exit(1);
    }
    return false;
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// ── Build Pipeline ─────────────────────────────────────────────
console.log(`
╔══════════════════════════════════════════════════════════╗
║  VibeCode Desktop — Build Pipeline                      ║
║  Environment: ${env.padEnd(42)}║
║  Platform:    ${platform.padEnd(42)}║
╚══════════════════════════════════════════════════════════╝
`);

const config = envConfig[env];

// Step 1: Clean (if requested)
if (clean) {
  console.log('[Build] Step 1: Cleaning build artifacts...');
  run(`rm -rf ${distDir} ${distElectronDir}`);
  console.log('[Build] Clean complete.');
} else {
  console.log('[Build] Step 1: Skipping clean (use --clean to clean first)');
}

// Step 2: Type checking
console.log('[Build] Step 2: Type checking...');
run('npx tsc --noEmit', { allowFail: true });

// Step 3: Run tests
console.log('[Build] Step 3: Running tests...');
run('npx vitest run', { allowFail: env === 'development' });

// Step 4: Build main process
console.log('[Build] Step 4: Building main process...');
run('npx tsc -p tsconfig.main.json');

// Step 5: Build preload script
console.log('[Build] Step 5: Building preload script...');
run('npx tsc -p tsconfig.preload.json');

// Step 6: Build renderer
console.log('[Build] Step 6: Building renderer...');
run('npx vite build', { env: config });

// Step 7: Generate release metadata
console.log('[Build] Step 7: Generating release metadata...');
generateReleaseMetadata(env);

// Step 8: Validate build output
console.log('[Build] Step 8: Validating build output...');
validateBuild();

// Step 9: Package (unless --no-pack)
if (!noPack) {
  console.log('[Build] Step 9: Packaging with electron-builder...');
  packageApp(platform, env);
} else {
  console.log('[Build] Step 9: Skipping packaging (--no-pack)');
}

console.log(`
╔══════════════════════════════════════════════════════════╗
║  VibeCode Desktop — Build Complete                      ║
║  Environment: ${env.padEnd(42)}║
║  Status:      SUCCESS                                    ║
╚══════════════════════════════════════════════════════════╝
`);

// ── Release Metadata Generator ─────────────────────────────────
function generateReleaseMetadata(buildEnv) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  const version = packageJson.version;
  const buildDate = new Date().toISOString();
  const buildId = `vibecode-${version}-${buildEnv}-${Date.now()}`;

  const metadata = {
    version,
    buildDate,
    buildId,
    environment: buildEnv,
    channel: config.VIBECODE_UPDATE_CHANNEL,
    platform,
    nodeVersion: process.version,
    electronVersion: packageJson.devDependencies?.electron || 'unknown',
  };

  ensureDir(distDir);
  fs.writeFileSync(
    path.join(distDir, 'release-metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  console.log(`[Build] Release metadata: v${version} (${buildEnv}) [${buildId}]`);
}

// ── Build Validator ────────────────────────────────────────────
function validateBuild() {
  const requiredPaths = [
    path.join(distDir, 'main', 'main.js'),
    path.join(distDir, 'preload', 'preload.js'),
    path.join(distDir, 'renderer', 'index.html'),
    path.join(distDir, 'release-metadata.json'),
  ];

  let valid = true;
  for (const requiredPath of requiredPaths) {
    if (!fs.existsSync(requiredPath)) {
      console.error(`[Build] MISSING: ${requiredPath}`);
      valid = false;
    }
  }

  if (!valid) {
    console.error('[Build] Build validation FAILED — missing required files');
    process.exit(1);
  }

  console.log('[Build] Build validation passed — all required files present');
}

// ── Package App ───────────────────────────────────────────────
function packageApp(targetPlatform, buildEnv) {
  let platformFlag = '';
  if (targetPlatform === 'darwin' || targetPlatform === 'mac') {
    platformFlag = '--mac';
  } else if (targetPlatform === 'win32' || targetPlatform === 'win') {
    platformFlag = '--win';
  } else if (targetPlatform === 'linux') {
    platformFlag = '--linux';
  }

  const publishFlag = buildEnv === 'production' ? '--publish=onTagOrDraft' : '--publish=never';
  const command = `npx electron-builder ${platformFlag} ${publishFlag} --config electron-builder.yml`;

  console.log(`[Build] Packaging: ${command}`);
  run(command, { env: config });
}
