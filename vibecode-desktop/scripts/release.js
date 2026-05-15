#!/usr/bin/env node
/**
 * VibeCode Desktop — Release Script
 *
 * Automates version bumping, changelog generation, git tagging,
 * and release preparation.
 *
 * Usage:
 *   node scripts/release.js patch   # 0.1.0 → 0.1.1
 *   node scripts/release.js minor   # 0.1.0 → 0.2.0
 *   node scripts/release.js major   # 0.1.0 → 1.0.0
 *   node scripts/release.js --dry-run  # preview without changes
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Parse Arguments ────────────────────────────────────────────
const args = process.argv.slice(2);
let bumpType = 'patch';
let dryRun = false;
let channel = 'stable';

for (const arg of args) {
  if (['patch', 'minor', 'major'].includes(arg)) {
    bumpType = arg;
  } else if (arg === '--dry-run') {
    dryRun = true;
  } else if (arg.startsWith('--channel=')) {
    channel = arg.split('=')[1];
  } else if (arg === '--help') {
    console.log(`
VibeCode Release Script

Usage:
  node scripts/release.js [bump-type] [options]

Bump Types:
  patch    Bug fixes (0.1.0 → 0.1.1)
  minor    New features (0.1.0 → 0.2.0)
  major    Breaking changes (0.1.0 → 1.0.0)

Options:
  --channel=<ch>   Release channel: stable, beta, nightly (default: stable)
  --dry-run        Preview changes without committing
  --help           Show this help
`);
    process.exit(0);
  }
}

// ── Configuration ──────────────────────────────────────────────
const projectRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const changelogPath = path.join(projectRoot, 'CHANGELOG.md');

// ── Semantic Version Bump ──────────────────────────────────────
function bumpVersion(currentVersion, type) {
  const parts = currentVersion.split('.').map(Number);
  switch (type) {
    case 'major':
      return `${parts[0] + 1}.0.0`;
    case 'minor':
      return `${parts[0]}.${parts[1] + 1}.0`;
    case 'patch':
    default:
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}

// ── Generate Changelog ─────────────────────────────────────────
function generateChangelog(newVersion) {
  let changelog = '';

  // Get commits since last tag
  try {
    const lastTag = execSync('git describe --tags --abbrev=0 2>/dev/null || echo ""', {
      cwd: projectRoot,
      encoding: 'utf8',
    }).trim();

    const logRange = lastTag ? `${lastTag}..HEAD` : 'HEAD~50..HEAD';
    const commits = execSync(
      `git log ${logRange} --pretty=format:"- %s (%h)" --no-merges`,
      { cwd: projectRoot, encoding: 'utf8' }
    ).trim();

    changelog = commits;
  } catch {
    changelog = '- Initial release';
  }

  const date = new Date().toISOString().split('T')[0];
  const entry = `## [${newVersion}] — ${date}\n\n${changelog}\n`;

  // Prepend to existing changelog or create new
  let existingChangelog = '';
  if (fs.existsSync(changelogPath)) {
    existingChangelog = fs.readFileSync(changelogPath, 'utf8');
  }

  const newChangelog = `# Changelog\n\nAll notable changes to VibeCode Desktop will be documented in this file.\n\n${entry}${existingChangelog.replace(/^# Changelog\n\n/, '')}`;

  return { entry, fullChangelog: newChangelog };
}

// ── Main Release Flow ─────────────────────────────────────────
function main() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const currentVersion = packageJson.version;
  const newVersion = bumpVersion(currentVersion, bumpType);

  console.log(`
╔══════════════════════════════════════════════════════════╗
║  VibeCode Desktop — Release Preparation                 ║
║  Current:  v${currentVersion.padEnd(43)}║
║  New:      v${newVersion.padEnd(43)}║
║  Channel:  ${channel.padEnd(43)}║
║  Bump:     ${bumpType.padEnd(43)}║
╚══════════════════════════════════════════════════════════╝
`);

  if (dryRun) {
    console.log('[Release] DRY RUN — no changes will be made');
  }

  // Step 1: Ensure clean working directory
  try {
    const status = execSync('git status --porcelain', { cwd: projectRoot, encoding: 'utf8' });
    if (status.trim()) {
      console.error('[Release] Working directory is not clean. Commit or stash changes first.');
      process.exit(1);
    }
  } catch {
    console.warn('[Release] Could not check git status');
  }

  // Step 2: Pull latest
  console.log('[Release] Pulling latest changes...');
  if (!dryRun) {
    execSync('git pull origin main', { cwd: projectRoot, stdio: 'inherit' });
  }

  // Step 3: Update package.json version
  console.log(`[Release] Bumping version: ${currentVersion} → ${newVersion}`);
  if (!dryRun) {
    packageJson.version = newVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  }

  // Step 4: Generate changelog
  console.log('[Release] Generating changelog...');
  const { entry, fullChangelog } = generateChangelog(newVersion);
  console.log('[Release] Changelog entry:\n');
  console.log(entry);

  if (!dryRun) {
    fs.writeFileSync(changelogPath, fullChangelog);
  }

  // Step 5: Commit version bump
  console.log('[Release] Committing version bump...');
  if (!dryRun) {
    execSync(`git add package.json package-lock.json CHANGELOG.md`, { cwd: projectRoot });
    execSync(`git commit -m "chore: release v${newVersion}"`, { cwd: projectRoot, stdio: 'inherit' });
  }

  // Step 6: Create git tag
  console.log(`[Release] Creating tag v${newVersion}...`);
  if (!dryRun) {
    execSync(`git tag -a v${newVersion} -m "Release v${newVersion}"`, { cwd: projectRoot });
  }

  // Step 7: Push changes and tag
  console.log('[Release] Pushing to remote...');
  if (!dryRun) {
    execSync('git push origin main', { cwd: projectRoot, stdio: 'inherit' });
    execSync(`git push origin v${newVersion}`, { cwd: projectRoot, stdio: 'inherit' });
  }

  console.log(`
╔══════════════════════════════════════════════════════════╗
║  VibeCode Desktop — Release Ready                       ║
║  Version:  v${newVersion.padEnd(43)}║
║  Channel:  ${channel.padEnd(43)}║
║  Tag:      v${newVersion.padEnd(43)}║
║  Next:     Run CI/CD pipeline to build & publish        ║
╚══════════════════════════════════════════════════════════╝
`);
}

main();
