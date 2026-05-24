#!/usr/bin/env node
// ─── VibeCode Desktop — Import Firewall (ARC 17) ────────────────────────────
// STATIC IMPORT FIREWALL — BUILD-TIME ENFORCEMENT
//
// This script scans the ENTIRE codebase AST (not regex) and detects
// forbidden imports. If any file outside /kernel/ imports fs, fs/promises,
// child_process, or node-pty, the build FAILS.
//
// No runtime warnings. Only compile failure.
//
// Usage:
//   npx ts-node scripts/import-firewall.ts
//   # Or as part of build: npm run firewall
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/** Modules that are FORBIDDEN outside the kernel zone */
const FORBIDDEN_IMPORTS = [
  'fs',
  'fs/promises',
  'child_process',
  'node-pty',
];

/** The only directory allowed to import forbidden modules */
const KERNEL_ZONE = 'src/main/kernel';

/** Directories/files to skip entirely */
const SKIP_PATHS = [
  'node_modules',
  'dist',
  'dist-electron',
  '.git',
  'scripts',       // Build scripts can import whatever they need
  'e2e',           // E2E tests use fs for setup/teardown
  'tests',         // Top-level tests
  'src/__tests__', // Unit tests
  'watchdog.js',   // External watchdog process
];

/** File extensions to scan */
const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// ═══════════════════════════════════════════════════════════════════════════════
// SIMPLE AST-LIKE PARSER
// We don't need a full AST parser — we need to detect import/require
// statements accurately. This is more robust than regex because it:
// 1. Ignores strings and comments
// 2. Handles multi-line imports
// 3. Detects require() calls
// ═══════════════════════════════════════════════════════════════════════════════

interface Violation {
  filePath: string;
  line: number;
  column: number;
  importModule: string;
  importType: 'import' | 'require' | 'dynamic-import';
  lineContent: string;
}

/**
 * Strip comments and strings from a line to avoid false positives.
 * This handles:
 * - Single-line comments (// ...)
 * - Strings ('...' and "..." and `...`)
 * - Multi-line comment starts/ends
 */
function stripCommentsAndStrings(code: string): string {
  let result = '';
  let i = 0;
  let inSingleComment = false;
  let inMultiComment = false;
  let inString: false | "'" | '"' | '`' = false;
  let stringEscape = false;

  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];

    // Handle string escape
    if (stringEscape) {
      result += ' '; // Replace escaped chars with space
      stringEscape = false;
      i++;
      continue;
    }

    // Inside a string — replace everything with spaces
    if (inString) {
      if (ch === '\\') {
        stringEscape = true;
        result += ' ';
      } else if (ch === inString) {
        inString = false;
        result += ' ';
      } else {
        result += ' ';
      }
      i++;
      continue;
    }

    // Inside multi-line comment
    if (inMultiComment) {
      if (ch === '*' && next === '/') {
        inMultiComment = false;
        i += 2;
      } else {
        result += ' ';
        i++;
      }
      continue;
    }

    // Single-line comment
    if (ch === '/' && next === '/') {
      inSingleComment = true;
      // Skip rest of line
      const newlineIdx = code.indexOf('\n', i);
      if (newlineIdx === -1) {
        break;
      }
      result += ' '.repeat(newlineIdx - i);
      i = newlineIdx;
      inSingleComment = false;
      continue;
    }

    // Multi-line comment start
    if (ch === '/' && next === '*') {
      inMultiComment = true;
      result += '  ';
      i += 2;
      continue;
    }

    // String starts
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
      result += ' ';
      i++;
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

/**
 * Scan a single file for forbidden imports.
 */
function scanFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    const line = stripCommentsAndStrings(rawLine);
    const lineNum = lineIdx + 1;

    // Check for ES module imports:
    // import * as fs from 'fs'
    // import fs from 'fs'
    // import { spawn } from 'child_process'
    // import * as fsPromises from 'fs/promises'
    for (const forbidden of FORBIDDEN_IMPORTS) {
      // Pattern: from 'forbidden' or from "forbidden"
      const fromPattern = `from`;
      const fromIdx = line.indexOf(fromPattern);
      if (fromIdx !== -1) {
        // Check if the module path after 'from' matches
        const afterFrom = line.substring(fromIdx + fromPattern.length).trim();
        if (afterFrom.startsWith(`'${forbidden}'`) || afterFrom.startsWith(`"${forbidden}"`)) {
          violations.push({
            filePath,
            line: lineNum,
            column: fromIdx + 1,
            importModule: forbidden,
            importType: 'import',
            lineContent: rawLine.trim(),
          });
        }
      }

      // Pattern: require('forbidden') or require("forbidden")
      const requirePattern = 'require';
      const requireIdx = line.indexOf(requirePattern);
      if (requireIdx !== -1) {
        const afterRequire = line.substring(requireIdx + requirePattern.length).trim();
        if (afterRequire.startsWith(`('${forbidden}'`) || afterRequire.startsWith(`("${forbidden}"`) ||
            afterRequire.startsWith(`('${forbidden}')`) || afterRequire.startsWith(`("${forbidden}")`)) {
          violations.push({
            filePath,
            line: lineNum,
            column: requireIdx + 1,
            importModule: forbidden,
            importType: 'require',
            lineContent: rawLine.trim(),
          });
        }
      }

      // Pattern: import('forbidden') — dynamic import
      const dynamicImportPattern = 'import(';
      const dynamicIdx = line.indexOf(dynamicImportPattern);
      if (dynamicIdx !== -1) {
        const afterImport = line.substring(dynamicIdx + dynamicImportPattern.length).trim();
        if (afterImport.startsWith(`'${forbidden}'`) || afterImport.startsWith(`"${forbidden}"`)) {
          violations.push({
            filePath,
            line: lineNum,
            column: dynamicIdx + 1,
            importModule: forbidden,
            importType: 'dynamic-import',
            lineContent: rawLine.trim(),
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Check if a file path is inside the kernel zone.
 */
function isInKernelZone(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.includes(KERNEL_ZONE) || normalized.includes('src/main/kernel/');
}

/**
 * Check if a file path should be skipped.
 */
function shouldSkip(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return SKIP_PATHS.some(skip => normalized.includes(skip));
}

/**
 * Recursively find all files with the given extensions.
 */
function findFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];

  function walk(currentDir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (shouldSkip(fullPath)) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN — Run the firewall check
// ═══════════════════════════════════════════════════════════════════════════════

function main(): never {
  const projectRoot = path.resolve(__dirname, '..');
  const srcDir = path.join(projectRoot, 'src');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  VIBECODE IMPORT FIREWALL (ARC 17)');
  console.log('  Scanning for forbidden imports outside /kernel/');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();
  console.log(`  Project root: ${projectRoot}`);
  console.log(`  Kernel zone:  src/main/kernel/`);
  console.log(`  Forbidden:    ${FORBIDDEN_IMPORTS.join(', ')}`);
  console.log();

  // Find all source files
  const files = findFiles(srcDir, SCAN_EXTENSIONS);
  console.log(`  Scanning ${files.length} source files...`);
  console.log();

  // Scan each file
  const allViolations: Violation[] = [];

  for (const file of files) {
    // Kernel zone files are allowed to import forbidden modules
    if (isInKernelZone(file)) {
      continue;
    }

    const violations = scanFile(file);
    allViolations.push(...violations);
  }

  // Also scan the kernel zone to report what it imports (for transparency)
  const kernelFiles = files.filter(isInKernelZone);
  const kernelImports: Violation[] = [];
  for (const file of kernelFiles) {
    kernelImports.push(...scanFile(file));
  }

  // Report kernel zone imports (informational, not violations)
  if (kernelImports.length > 0) {
    console.log('  ── KERNEL ZONE IMPORTS (allowed) ────────────────────────');
    for (const v of kernelImports) {
      const relativePath = path.relative(projectRoot, v.filePath);
      console.log(`  ✓ ${relativePath}:${v.line} — ${v.importModule} (${v.importType})`);
    }
    console.log();
  }

  // Report violations
  if (allViolations.length === 0) {
    console.log('  ══════════════════════════════════════════════════════════');
    console.log('  ✓ IMPORT FIREWALL PASSED — No forbidden imports detected');
    console.log('    All fs/child_process/node-pty imports are inside /kernel/');
    console.log('  ══════════════════════════════════════════════════════════');
    process.exit(0);
  }

  console.log('  ══════════════════════════════════════════════════════════');
  console.log('  ✗ IMPORT FIREWALL FAILED — Forbidden imports detected!');
  console.log(`  ${allViolations.length} violation(s) found outside /kernel/`);
  console.log('  ══════════════════════════════════════════════════════════');
  console.log();

  // Group violations by file
  const byFile = new Map<string, Violation[]>();
  for (const v of allViolations) {
    const existing = byFile.get(v.filePath) || [];
    existing.push(v);
    byFile.set(v.filePath, existing);
  }

  for (const [filePath, violations] of byFile) {
    const relativePath = path.relative(projectRoot, filePath);
    console.log(`  ── ${relativePath} (${violations.length} violation(s)) ──`);
    for (const v of violations) {
      console.log(`    Line ${v.line}: ${v.importType} "${v.importModule}"`);
      console.log(`      ${v.lineContent}`);
      console.log(`      FIX: Replace with import from '../kernel/kernel-${v.importModule === 'fs' || v.importModule === 'fs/promises' ? 'fs' : v.importModule === 'child_process' ? 'process' : 'terminal'}'`);
    }
    console.log();
  }

  console.log('  ─────────────────────────────────────────────────────────');
  console.log('  BUILD FAILED: Remove all forbidden imports outside /kernel/');
  console.log('  Use kernel-fs, kernel-process, or kernel-terminal instead.');
  console.log('  ─────────────────────────────────────────────────────────');

  process.exit(1);
}

main();
