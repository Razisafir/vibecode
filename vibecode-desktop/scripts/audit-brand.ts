#!/usr/bin/env npx ts-node
// Phase 10: Brand Audit
// Check 26: Finds forbidden terminology violations

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface BrandViolation {
  file: string;
  line: number;
  content: string;
  violation: string;
}

const rootDir = join(__dirname, '..');

// Forbidden terms that would indicate we're misrepresenting VibeCode
// Only flag actual misrepresentation, not negations like "not a fork of VS Code"
const FORBIDDEN_TERMS = [
  { pattern: /(?:^|is a )VS\s*Code\s*fork/gi, reason: 'VibeCode is not a VS Code fork' },
  { pattern: /(?:^|is an?)\s*Electron\s+app\b/gi, reason: 'VibeCode is an AI-Native Desktop Operating Environment, not just an Electron app' },
  { pattern: /(?:^|is a )fork\s+of\s+VS\s*Code/gi, reason: 'Not a fork of VS Code' },
  { pattern: /(?:^|is )based\s+on\s+VS\s*Code/gi, reason: 'Not based on VS Code' },
  { pattern: /(?:^|is an?)\s*Electron\s+wrapper/gi, reason: 'Not just an Electron wrapper' },
];

// Scan only source and documentation files
const SCAN_EXTENSIONS = ['.ts', '.js', '.md', '.json', '.yml', '.yaml'];
const EXCLUDE_DIRS = ['node_modules', 'dist', '.git', 'coverage', 'packages'];
// Exclude the audit script itself (its pattern definitions would be false positives)
const EXCLUDE_FILES = ['audit-brand.ts'];

function scanDirectory(dir: string, violations: BrandViolation[]): void {
  if (!existsSync(dir)) return;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDE_DIRS.includes(entry.name)) continue;

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, violations);
    } else if (entry.isFile() && SCAN_EXTENSIONS.includes(extname(entry.name)) && !EXCLUDE_FILES.includes(entry.name)) {
      scanFile(fullPath, violations);
    }
  }
}

function scanFile(filePath: string, violations: BrandViolation[]): void {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { pattern, reason } of FORBIDDEN_TERMS) {
        if (pattern.test(line)) {
          violations.push({
            file: filePath.replace(rootDir + '/', ''),
            line: i + 1,
            content: line.trim(),
            violation: reason,
          });
        }
        // Reset regex lastIndex
        pattern.lastIndex = 0;
      }
    }
  } catch {
    // Skip files that can't be read
  }
}

const violations: BrandViolation[] = [];
scanDirectory(join(rootDir, 'src'), violations);
scanDirectory(join(rootDir, 'scripts'), violations);
scanDirectory(join(rootDir, 'build'), violations);
scanDirectory(rootDir, violations); // Root-level .md files

// Output results
const result = {
  timestamp: new Date().toISOString(),
  totalViolations: violations.length,
  violations,
  status: violations.length === 0 ? 'PASS' : 'FAIL',
};

console.log(JSON.stringify(result, null, 2));

if (violations.length > 0) {
  console.error(`\n❌ Found ${violations.length} brand violation(s)`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}: ${v.violation}`);
    console.error(`    "${v.content}"`);
  }
  process.exit(1);
} else {
  console.log('\n✅ Zero brand violations found');
  process.exit(0);
}
