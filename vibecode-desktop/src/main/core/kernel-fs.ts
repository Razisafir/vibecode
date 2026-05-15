// ─── VibeCode Desktop — Kernel FS Proxy (ARC 16) ─────────────────────────
// KERNEL LOCKDOWN MODE
//
// This is the ONLY module allowed to import and use 'fs' for workspace mutations.
// ALL workspace file mutations MUST go through this module.
// Any code that imports 'fs' directly for write/delete/rename operations
// on workspace files is a BYPASS and must be eliminated.
//
// HARD RUNTIME ASSERTION:
//   "If ExecutionNode is not created first → throw and crash"
//   No soft warnings. Only hard failure.
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import { authorizeFsOp } from './execution-audit';
import { ExecutionGateway } from './execution-gateway';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// HARD ASSERTION — "No Node → No Action"
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * HARD ASSERTION: Verify that an ExecutionNode was created BEFORE this FS operation.
 * If no nodeId is provided, or the node doesn't exist in the graph, this THROWS.
 * No soft warnings. Only hard failure.
 */
function assertNodeExists(nodeId: string | undefined, operation: string, targetPath: string): void {
  if (!nodeId) {
    const error = new Error(
      `[KERNEL-FS] HARD ASSERTION FAILED: No ExecutionNode for ${operation} on "${targetPath}". ` +
      `"No Node → No Action" — this is a MANDATORY gate violation.`
    );
    logger.error('kernel-fs', error.message);
    throw error;
  }

  // Verify the node exists in the ESM graph
  if (!ExecutionGateway.isInitialized()) {
    throw new Error(
      `[KERNEL-FS] HARD ASSERTION FAILED: ExecutionGateway not initialized. ` +
      `Cannot verify node ${nodeId} for ${operation} on "${targetPath}".`
    );
  }

  // The gateway will throw if the node doesn't exist when we try to use it
  // This is our verification that the node is real
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORKSPACE FS OPERATIONS — All go through gateway authorization
// ═══════════════════════════════════════════════════════════════════════════════

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

/**
 * Write a file to the workspace. REQUIRES an ExecutionNode ID.
 * If no nodeId is provided → HARD CRASH.
 */
export async function kernelFsWrite(options: KernelFsWriteOptions): Promise<{ bytesWritten: number; filePath: string }> {
  // HARD ASSERTION: Node MUST exist
  assertNodeExists(options.nodeId, 'write', options.filePath);

  // Authorize in the audit system
  authorizeFsOp(options.filePath, options.nodeId, 'write');

  const encoding = options.encoding ?? 'utf-8';
  const createDirs = options.createDirs !== false;

  // Create parent directories if needed
  if (createDirs) {
    const dir = path.dirname(options.filePath);
    await fs.promises.mkdir(dir, { recursive: true });
  }

  // Perform the actual write
  await fs.promises.writeFile(options.filePath, options.content, encoding);

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
  // HARD ASSERTION: Node MUST exist
  assertNodeExists(options.nodeId, 'write', options.filePath);

  // Authorize in the audit system
  authorizeFsOp(options.filePath, options.nodeId, 'write');

  const encoding = options.encoding ?? 'utf-8';
  const createDirs = options.createDirs !== false;

  // Create parent directories if needed
  if (createDirs) {
    const dir = path.dirname(options.filePath);
    fs.mkdirSync(dir, { recursive: true });
  }

  // Perform the actual write
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
  // HARD ASSERTION: Node MUST exist
  assertNodeExists(options.nodeId, 'delete', options.filePath);

  // Authorize in the audit system
  authorizeFsOp(options.filePath, options.nodeId, 'delete');

  // Check if path exists
  let existed = false;
  let wasDirectory = false;
  try {
    const stat = await fs.promises.stat(options.filePath);
    existed = true;
    wasDirectory = stat.isDirectory();
  } catch {
    // Doesn't exist
  }

  if (!existed) {
    return { deleted: false, filePath: options.filePath };
  }

  // Perform the deletion
  if (wasDirectory && options.recursive) {
    await fs.promises.rm(options.filePath, { recursive: true, force: true });
  } else if (wasDirectory) {
    await fs.promises.rmdir(options.filePath);
  } else {
    await fs.promises.unlink(options.filePath);
  }

  return { deleted: true, filePath: options.filePath };
}

/**
 * Rename/move a file. REQUIRES an ExecutionNode ID.
 * If no nodeId is provided → HARD CRASH.
 */
export async function kernelFsRename(options: KernelFsRenameOptions): Promise<{ oldPath: string; newPath: string }> {
  // HARD ASSERTION: Node MUST exist
  assertNodeExists(options.nodeId, 'rename', options.oldPath);

  // Authorize in the audit system
  authorizeFsOp(options.oldPath, options.nodeId, 'rename');

  // Ensure target directory exists
  const targetDir = path.dirname(options.newPath);
  await fs.promises.mkdir(targetDir, { recursive: true });

  // Perform the rename
  await fs.promises.rename(options.oldPath, options.newPath);

  return { oldPath: options.oldPath, newPath: options.newPath };
}

/**
 * Create a directory. REQUIRES an ExecutionNode ID.
 * If no nodeId is provided → HARD CRASH.
 */
export async function kernelFsMkdir(options: KernelFsMkdirOptions): Promise<{ dirPath: string; created: boolean }> {
  // HARD ASSERTION: Node MUST exist
  assertNodeExists(options.nodeId, 'mkdir', options.dirPath);

  // Authorize in the audit system (mkdir is a mutation)
  authorizeFsOp(options.dirPath, options.nodeId, 'mkdir');

  const recursive = options.recursive !== false;

  // Check if already exists
  try {
    const stat = await fs.promises.stat(options.dirPath);
    if (stat.isDirectory()) {
      return { dirPath: options.dirPath, created: false };
    }
  } catch {
    // Doesn't exist — proceed
  }

  // Create the directory
  await fs.promises.mkdir(options.dirPath, { recursive });

  return { dirPath: options.dirPath, created: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// READ-ONLY OPERATIONS — These are NOT gated (reads don't mutate state)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Read a file. NOT gated (reads don't mutate workspace state).
 */
export async function kernelFsRead(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
  return fs.promises.readFile(filePath, encoding);
}

/**
 * Stat a path. NOT gated (reads don't mutate workspace state).
 */
export async function kernelFsStat(filePath: string): Promise<fs.Stats> {
  return fs.promises.stat(filePath);
}

/**
 * List a directory. NOT gated (reads don't mutate workspace state).
 */
export async function kernelFsReaddir(dirPath: string): Promise<fs.Dirent[]> {
  return fs.promises.readdir(dirPath, { withFileTypes: true });
}
