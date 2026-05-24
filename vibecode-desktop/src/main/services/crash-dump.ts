// Phase 2 shim — delegates to src/system/supervision/crash-dump; remove in Phase 4

export {
  initializeCrashDump,
  generateCrashDump,
  hasCrashDumps,
  listCrashDumps,
  clearCrashDumps,
  getCrashDumpsDir,
  CrashDump,
} from '../../system/supervision/crash-dump';

import {
  initializeCrashDump,
  generateCrashDump,
  hasCrashDumps,
  listCrashDumps,
  clearCrashDumps,
  getCrashDumpsDir,
} from '../../system/supervision/crash-dump';

// ─── Backward-compatible singleton-like API ─────────────────────────────────
// Old code accesses crashDumpService.initialize(), etc.
// This shim provides the same interface via an object with the same method names.

export const crashDumpService = {
  initialize: initializeCrashDump,
  generateCrashDump,
  hasCrashDumps,
  listCrashDumps,
  clearCrashDumps,
  getCrashDumpsDir,
};
