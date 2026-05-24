// ─── VibeCode Desktop — Kernel FS (ARC 17) ───────────────────────────────────
// KERNEL ISOLATION + IMPORT WALL ENFORCEMENT
//
// THIS IS THE ONLY MODULE IN THE ENTIRE CODEBASE ALLOWED TO IMPORT:
//   - fs
//   - fs/promises
//
// ALL other modules MUST import from this file instead of importing fs directly.
// If any file outside /kernel/ imports fs → the build MUST fail (import-firewall).
//
// This module provides TWO categories of operations:
//   1. WORKSPACE MUTATIONS — require executionNodeId (gated by ExecutionGateway)
//   2. INTERNAL APP OPERATIONS — no executionNodeId required (not gated, but
//      still centralized here for import wall enforcement)
//
// NON-NEGOTIABLE PRINCIPLE: "No Node → No Action" for workspace mutations.
// If a workspace mutation is attempted without executionNodeId → HARD CRASH.
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { authorizeFsOp, ExecutionGateway } from '../core/execution-gateway';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// BRANDED TYPE — ExecutionNodeId cannot be forged
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Branded type for ExecutionNode IDs.
 * This can ONLY be obtained through ExecutionGateway — it cannot be
 * constructed manually. This makes it impossible to call gated functions
 * without going through the gateway.
 *
 * The branding is erased at runtime (it's just a string), but TypeScript
 * enforces at compile time that you can't create this type yourself.
 */
export type ExecutionNodeId = string & { __executionNodeId: true };

/**
 * Re-exported fs types for use by non-kernel modules.
 * These allow consumers to reference fs types without importing fs directly,
 * which is required by the import wall (ARC 17).
 */
export type KernelFsStats = fs.Stats;
export type KernelFsFSWatcher = fs.FSWatcher;

/**
 * Type guard to check if a string is an ExecutionNodeId.
 * At runtime this is always true for any string — the enforcement is
 * at the TYPE level. But we also do a runtime check that the node
 * exists in the graph.
 */
function assertNodeExists(nodeId: string | undefined, operation: string, targetPath: string): asserts nodeId is string {
  if (!nodeId) {
    const error = new Error(
      `[KERNEL-FS] HARD ASSERTION FAILED: No ExecutionNode for ${operation} on "${targetPath}". ` +
      `"No Node → No Action" — this is a MANDATORY gate violation.`
    );
    logger.error('kernel-fs', error.message);
    throw error;
  }

  // Verify the gateway is initialized
  if (!ExecutionGateway.isInitialized()) {
    throw new Error(
      `[KERNEL-FS] HARD ASSERTION FAILED: ExecutionGateway not initialized. ` +
      `Cannot verify node ${nodeId} for ${operation} on "${targetPath}".`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: WORKSPACE MUTATION OPERATIONS — GATED
// These modify user workspace files and REQUIRE an executionNodeId.
// ─────────────────────────────────────────────────────────────────────────────

export interface KernelFsWriteOptions {
  /** The ExecutionNode ID that authorizes this write. MANDATORY. */
  nodeId: string;
  /** The absolute path to write to */
  filePath: string;
  /** The content to write */
  content: string | Buffer;
  /** Encoding (default: utf-8) */
  encoding?: BufferEncoding;
  /** Whether to create parent directories (default: true) */
  createDirs?: boolean;
}

export interface KernelFsDeleteOptions {
  /** The ExecutionNode ID that authorizes this delete. MANDATORY. */
  nodeId: string;
  /** The absolute path to delete */
  filePath: string;
  /** Whether to recursively delete directories */
  recursive?: boolean;
}

export interface KernelFsRenameOptions {
  /** The ExecutionNode ID that authorizes this rename. MANDATORY. */
  nodeId: string;
  /** The old path */
  oldPath: string;
  /** The new path */
  newPath: string;
}

export interface KernelFsMkdirOptions {
  /** The ExecutionNode ID that authorizes this mkdir. MANDATORY. */
  nodeId: string;
  /** The directory path to create */
  dirPath: string;
  /** Whether to create parent directories (default: true) */
  recursive?: boolean;
}

export interface KernelFsChmodOptions {
  /** The ExecutionNode ID that authorizes this chmod. MANDATORY. */
  nodeId: string;
  /** The file path */
  filePath: string;
  /** The file mode */
  mode: number;
}

/**
 * Write a file to the workspace. REQUIRES an ExecutionNode ID.
 * If no nodeId is provided → HARD CRASH.
 */
export async function kernelFsWrite(options: KernelFsWriteOptions): Promise<{ bytesWritten: number; filePath: string }> {
  assertNodeExists(options.nodeId, 'write', options.filePath);
  authorizeFsOp(options.filePath, options.nodeId, 'write');

  const encoding = options.encoding ?? 'utf-8';
  const createDirs = options.createDirs !== false;

  if (createDirs) {
    const dir = path.dirname(options.filePath);
    await fsPromises.mkdir(dir, { recursive: true });
  }

  await fsPromises.writeFile(options.filePath, options.content, encoding);

  const bytesWritten = typeof options.content === 'string'
    ? Buffer.byteLength(options.content, encoding)
    : options.content.length;

  return { bytesWritten, filePath: options.filePath };
}

/**
 * Write a file synchronously. REQUIRES an ExecutionNode ID.
 * If no nodeId is provided → HARD CRASH.
 */
export function kernelFsWriteSync(options: KernelFsWriteOptions): { bytesWritten: number; filePath: string } {
  assertNodeExists(options.nodeId, 'write', options.filePath);
  authorizeFsOp(options.filePath, options.nodeId, 'write');

  const encoding = options.encoding ?? 'utf-8';
  const createDirs = options.createDirs !== false;

  if (createDirs) {
    const dir = path.dirname(options.filePath);
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(options.filePath, options.content, encoding);

  const bytesWritten = typeof options.content === 'string'
    ? Buffer.byteLength(options.content, encoding)
    : options.content.length;

  return { bytesWritten, filePath: options.filePath };
}

/**
 * Delete a file or directory. REQUIRES an ExecutionNode ID.
 * If no nodeId is provided → HARD CRASH.
 */
export async function kernelFsDelete(options: KernelFsDeleteOptions): Promise<{ deleted: boolean; filePath: string }> {
  assertNodeExists(options.nodeId, 'delete', options.filePath);
  authorizeFsOp(options.filePath, options.nodeId, 'delete');

  let existed = false;
  let wasDirectory = false;
  try {
    const stat = await fsPromises.stat(options.filePath);
    existed = true;
    wasDirectory = stat.isDirectory();
  } catch {
    // Doesn't exist
  }

  if (!existed) {
    return { deleted: false, filePath: options.filePath };
  }

  if (wasDirectory && options.recursive) {
    await fsPromises.rm(options.filePath, { recursive: true, force: true });
  } else if (wasDirectory) {
    await fsPromises.rmdir(options.filePath);
  } else {
    await fsPromises.unlink(options.filePath);
  }

  return { deleted: true, filePath: options.filePath };
}

/**
 * Delete synchronously. REQUIRES an ExecutionNode ID.
 */
export function kernelFsDeleteSync(options: KernelFsDeleteOptions): { deleted: boolean; filePath: string } {
  assertNodeExists(options.nodeId, 'delete', options.filePath);
  authorizeFsOp(options.filePath, options.nodeId, 'delete');

  let existed = false;
  let wasDirectory = false;
  try {
    const stat = fs.statSync(options.filePath);
    existed = true;
    wasDirectory = stat.isDirectory();
  } catch {
    // Doesn't exist
  }

  if (!existed) {
    return { deleted: false, filePath: options.filePath };
  }

  if (wasDirectory && options.recursive) {
    fs.rmSync(options.filePath, { recursive: true, force: true });
  } else if (wasDirectory) {
    fs.rmdirSync(options.filePath);
  } else {
    fs.unlinkSync(options.filePath);
  }

  return { deleted: true, filePath: options.filePath };
}

/**
 * Rename/move a file. REQUIRES an ExecutionNode ID.
 * If no nodeId is provided → HARD CRASH.
 */
export async function kernelFsRename(options: KernelFsRenameOptions): Promise<{ oldPath: string; newPath: string }> {
  assertNodeExists(options.nodeId, 'rename', options.oldPath);
  authorizeFsOp(options.oldPath, options.nodeId, 'rename');

  const targetDir = path.dirname(options.newPath);
  await fsPromises.mkdir(targetDir, { recursive: true });
  await fsPromises.rename(options.oldPath, options.newPath);

  return { oldPath: options.oldPath, newPath: options.newPath };
}

/**
 * Rename synchronously. REQUIRES an ExecutionNode ID.
 */
export function kernelFsRenameSync(options: KernelFsRenameOptions): { oldPath: string; newPath: string } {
  assertNodeExists(options.nodeId, 'rename', options.oldPath);
  authorizeFsOp(options.oldPath, options.nodeId, 'rename');

  const targetDir = path.dirname(options.newPath);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.renameSync(options.oldPath, options.newPath);

  return { oldPath: options.oldPath, newPath: options.newPath };
}

/**
 * Create a directory (workspace mutation). REQUIRES an ExecutionNode ID.
 * If no nodeId is provided → HARD CRASH.
 */
export async function kernelFsMkdir(options: KernelFsMkdirOptions): Promise<{ dirPath: string; created: boolean }> {
  assertNodeExists(options.nodeId, 'mkdir', options.dirPath);
  authorizeFsOp(options.dirPath, options.nodeId, 'mkdir');

  const recursive = options.recursive !== false;
  try {
    const stat = await fsPromises.stat(options.dirPath);
    if (stat.isDirectory()) {
      return { dirPath: options.dirPath, created: false };
    }
  } catch {
    // Doesn't exist — proceed
  }

  await fsPromises.mkdir(options.dirPath, { recursive });
  return { dirPath: options.dirPath, created: true };
}

/**
 * Create a directory synchronously (workspace mutation). REQUIRES an ExecutionNode ID.
 */
export function kernelFsMkdirSync(options: KernelFsMkdirOptions): { dirPath: string; created: boolean } {
  assertNodeExists(options.nodeId, 'mkdir', options.dirPath);
  authorizeFsOp(options.dirPath, options.nodeId, 'mkdir');

  const recursive = options.recursive !== false;
  try {
    const stat = fs.statSync(options.dirPath);
    if (stat.isDirectory()) {
      return { dirPath: options.dirPath, created: false };
    }
  } catch {
    // Doesn't exist — proceed
  }

  fs.mkdirSync(options.dirPath, { recursive });
  return { dirPath: options.dirPath, created: true };
}

/**
 * Change file permissions (workspace mutation). REQUIRES an ExecutionNode ID.
 */
export async function kernelFsChmod(options: KernelFsChmodOptions): Promise<{ filePath: string; mode: number }> {
  assertNodeExists(options.nodeId, 'chmod', options.filePath);
  authorizeFsOp(options.filePath, options.nodeId, 'chmod');
  await fsPromises.chmod(options.filePath, options.mode);
  return { filePath: options.filePath, mode: options.mode };
}

/**
 * Copy a file (workspace mutation). REQUIRES an ExecutionNode ID.
 */
export async function kernelFsCopyFile(options: { nodeId: string; src: string; dest: string }): Promise<{ bytesWritten: number }> {
  assertNodeExists(options.nodeId, 'copy', options.src);
  authorizeFsOp(options.src, options.nodeId, 'copy');

  const destDir = path.dirname(options.dest);
  await fsPromises.mkdir(destDir, { recursive: true });

  await fsPromises.copyFile(options.src, options.dest);

  const stat = await fsPromises.stat(options.dest);
  return { bytesWritten: stat.size };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: READ-ONLY OPERATIONS — NOT GATED
// Reads don't mutate workspace state, so they don't require an ExecutionNode.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read a file. NOT gated (reads don't mutate workspace state).
 */
export async function kernelFsRead(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
  return fsPromises.readFile(filePath, encoding);
}

/**
 * Read a file synchronously. NOT gated.
 */
export function kernelFsReadSync(filePath: string, encoding: BufferEncoding = 'utf-8'): string {
  return fs.readFileSync(filePath, encoding);
}

/**
 * Read a file as a Buffer. NOT gated.
 */
export async function kernelFsReadBuffer(filePath: string): Promise<Buffer> {
  return fsPromises.readFile(filePath);
}

/**
 * Stat a path. NOT gated (reads don't mutate workspace state).
 */
export async function kernelFsStat(filePath: string): Promise<fs.Stats> {
  return fsPromises.stat(filePath);
}

/**
 * Stat a path synchronously. NOT gated.
 */
export function kernelFsStatSync(filePath: string): fs.Stats {
  return fs.statSync(filePath);
}

/**
 * Check if a path exists. NOT gated.
 */
export function kernelFsExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a path exists (async). NOT gated.
 */
export async function kernelFsExistsAsync(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * List a directory. NOT gated (reads don't mutate workspace state).
 */
export async function kernelFsReaddir(dirPath: string): Promise<fs.Dirent[]> {
  return fsPromises.readdir(dirPath, { withFileTypes: true });
}

/**
 * List a directory synchronously. NOT gated.
 */
export function kernelFsReaddirSync(dirPath: string): fs.Dirent[] {
  return fs.readdirSync(dirPath, { withFileTypes: true });
}

/**
 * Get real path (resolves symlinks). NOT gated.
 */
export async function kernelFsRealpath(filePath: string): Promise<string> {
  return fsPromises.realpath(filePath);
}

/**
 * Get real path synchronously. NOT gated.
 */
export function kernelFsRealpathSync(filePath: string): string {
  return fs.realpathSync(filePath);
}

/**
 * Watch a path for changes. NOT gated (watching is read-only).
 */
export function kernelFsWatch(
  filePath: string,
  options: fs.WatchOptions,
  listener?: (event: string, filename: string | null) => void
): fs.FSWatcher {
  return fs.watch(filePath, options, listener);
}

/**
 * Access a path. NOT gated.
 */
export async function kernelFsAccess(filePath: string, mode?: number): Promise<void> {
  return fsPromises.access(filePath, mode);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: INTERNAL APP OPERATIONS — UNGATED
// These write to VibeCode's own config/cache directories, NOT user workspace.
// They do NOT require an ExecutionNode because they don't mutate user files.
// They ARE centralized here for import wall enforcement.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write to an internal app data file (config, cache, logs, etc.).
 * This does NOT touch workspace files, so no ExecutionNode required.
 * The path must be within VibeCode's own data directories.
 */
export async function kernelFsWriteInternal(filePath: string, content: string | Buffer, encoding: BufferEncoding = 'utf-8'): Promise<void> {
  const dir = path.dirname(filePath);
  await fsPromises.mkdir(dir, { recursive: true });
  await fsPromises.writeFile(filePath, content, encoding);
}

/**
 * Write to an internal app data file synchronously.
 */
export function kernelFsWriteInternalSync(filePath: string, content: string | Buffer, encoding: BufferEncoding = 'utf-8'): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, encoding);
}

/**
 * Read internal app data file.
 */
export async function kernelFsReadInternal(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
  return fsPromises.readFile(filePath, encoding);
}

/**
 * Delete an internal app data file.
 */
export async function kernelFsDeleteInternal(filePath: string): Promise<void> {
  try {
    await fsPromises.unlink(filePath);
  } catch {
    // File may not exist
  }
}

/**
 * Delete an internal app data file or directory synchronously.
 * Handles both files and directories (with optional recursive delete).
 */
export function kernelFsDeleteInternalSync(filePath: string, options?: { recursive?: boolean }): void {
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: options?.recursive ?? false, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
  } catch {
    // File doesn't exist — nothing to do
  }
}

/**
 * Create an internal app directory.
 */
export async function kernelFsMkdirInternal(dirPath: string, recursive: boolean = true): Promise<void> {
  await fsPromises.mkdir(dirPath, { recursive });
}

/**
 * Create an internal app directory synchronously.
 */
export function kernelFsMkdirInternalSync(dirPath: string, recursive: boolean = true): void {
  fs.mkdirSync(dirPath, { recursive });
}

/**
 * Check if an internal path exists.
 */
export function kernelFsExistsInternal(filePath: string): boolean {
  return kernelFsExists(filePath);
}

/**
 * Read an internal directory.
 */
export async function kernelFsReaddirInternal(dirPath: string): Promise<string[]> {
  return fsPromises.readdir(dirPath);
}

/**
 * Read an internal directory synchronously.
 */
export function kernelFsReaddirInternalSync(dirPath: string): string[] {
  return fs.readdirSync(dirPath);
}

/**
 * Write JSON to an internal file.
 */
export async function kernelFsWriteInternalJson(filePath: string, data: unknown, pretty: boolean = true): Promise<void> {
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await kernelFsWriteInternal(filePath, content);
}

/**
 * Read JSON from an internal file.
 */
export async function kernelFsReadInternalJson<T = unknown>(filePath: string): Promise<T> {
  const content = await kernelFsReadInternal(filePath);
  return JSON.parse(content) as T;
}

/**
 * Copy a file (internal operation, no workspace gating).
 */
export async function kernelFsCopyInternal(src: string, dest: string): Promise<void> {
  const dir = path.dirname(dest);
  await fsPromises.mkdir(dir, { recursive: true });
  await fsPromises.copyFile(src, dest);
}

/**
 * Append to an internal file.
 */
export async function kernelFsAppendInternal(filePath: string, content: string | Buffer, encoding: BufferEncoding = 'utf-8'): Promise<void> {
  const dir = path.dirname(filePath);
  await fsPromises.mkdir(dir, { recursive: true });
  await fsPromises.appendFile(filePath, content, encoding);
}

/**
 * Append to an internal file synchronously.
 */
export function kernelFsAppendInternalSync(filePath: string, content: string | Buffer, encoding: BufferEncoding = 'utf-8'): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(filePath, content, encoding);
}

/**
 * Rename an internal file.
 */
export async function kernelFsRenameInternal(oldPath: string, newPath: string): Promise<void> {
  const dir = path.dirname(newPath);
  await fsPromises.mkdir(dir, { recursive: true });
  await fsPromises.rename(oldPath, newPath);
}

/**
 * Rename an internal file synchronously.
 */
export function kernelFsRenameInternalSync(oldPath: string, newPath: string): void {
  const dir = path.dirname(newPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.renameSync(oldPath, newPath);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: RAW fs RE-EXPORTS FOR KERNEL-INTERNAL USE ONLY
// These are available ONLY to other kernel/ modules. Non-kernel code
// must use the typed functions above.
// ─────────────────────────────────────────────────══════════════════════════════

/**
 * @internal KERNEL USE ONLY
 * Raw fs.promises access for other kernel modules (kernel-process.ts, kernel-terminal.ts).
 * DO NOT import this from outside /kernel/.
 */
export const rawFsPromises = fsPromises;

/**
 * @internal KERNEL USE ONLY
 * Raw fs access for other kernel modules.
 * DO NOT import this from outside /kernel/.
 */
export const rawFs = fs;

/**
 * @internal KERNEL USE ONLY
 * path module access (re-exported for convenience since kernel modules need it).
 */
export { path };
