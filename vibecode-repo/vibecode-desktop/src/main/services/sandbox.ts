// ─── Filesystem Sandbox ─────────────────────────────────────────────────────
//
// Validates all filesystem operations against workspace root allowlists.
// Prevents path traversal attacks and arbitrary filesystem access from renderer.
//

import * as path from 'path';
import * as fs from 'fs';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SandboxConfig {
  /** List of allowed workspace root paths (absolute) */
  allowedRoots: string[];
  /** Whether to block symlinks that resolve outside allowed roots */
  blockExternalSymlinks: boolean;
  /** Whether to log blocked access attempts */
  logBlockedAccess: boolean;
  /** Maximum allowed path length */
  maxPathLength: number;
}

export interface SandboxValidationResult {
  allowed: boolean;
  resolvedPath: string;
  reason?: string;
}

export interface BlockedAccessLogEntry {
  timestamp: number;
  requestedPath: string;
  resolvedPath: string;
  reason: string;
  operation: string;
}

// ─── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: SandboxConfig = {
  allowedRoots: [],
  blockExternalSymlinks: true,
  logBlockedAccess: true,
  maxPathLength: 4096,
};

// ─── FileSystemSandbox ──────────────────────────────────────────────────────

export class FileSystemSandbox {
  private config: SandboxConfig;
  private blockedAccessLog: BlockedAccessLogEntry[] = [];
  private maxLogSize = 1000;

  constructor(config?: Partial<SandboxConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // Normalize allowed roots to absolute paths
    this.config.allowedRoots = this.config.allowedRoots.map((root) =>
      path.resolve(root)
    );
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /** Add a workspace root to the allowlist */
  addRoot(rootPath: string): void {
    const resolved = path.resolve(rootPath);
    if (!this.config.allowedRoots.includes(resolved)) {
      this.config.allowedRoots.push(resolved);
    }
  }

  /** Remove a workspace root from the allowlist */
  removeRoot(rootPath: string): void {
    const resolved = path.resolve(rootPath);
    this.config.allowedRoots = this.config.allowedRoots.filter(
      (r) => r !== resolved
    );
  }

  /** Get all currently allowed roots */
  getAllowedRoots(): string[] {
    return [...this.config.allowedRoots];
  }

  /** Validate a path for a given operation. Returns whether access is allowed. */
  validate(requestedPath: string, operation: string = 'read'): SandboxValidationResult {
    try {
      // Check path length
      if (requestedPath.length > this.config.maxPathLength) {
        return this.deny(
          requestedPath,
          `Path exceeds maximum length (${this.config.maxPathLength})`,
          operation
        );
      }

      const resolvedPath = path.resolve(requestedPath);

      // Check for null bytes (path injection)
      if (requestedPath.includes('\0') || resolvedPath.includes('\0')) {
        return this.deny(
          requestedPath,
          'Path contains null bytes',
          operation
        );
      }

      // Check if path is within any allowed root
      const isWithinRoot = this.config.allowedRoots.some((root) => {
        // Path must start with the root
        const relative = path.relative(root, resolvedPath);
        return !relative.startsWith('..') && !path.isAbsolute(relative);
      });

      if (!isWithinRoot) {
        return this.deny(
          requestedPath,
          `Path is outside all allowed workspace roots`,
          operation
        );
      }

      // Check for symlinks that resolve outside allowed roots
      if (this.config.blockExternalSymlinks) {
        const symlinkCheck = this.checkSymlink(resolvedPath, operation);
        if (!symlinkCheck.allowed) {
          return symlinkCheck;
        }
      }

      // Check for path traversal patterns
      if (this.hasPathTraversal(requestedPath)) {
        return this.deny(
          requestedPath,
          'Path contains traversal patterns',
          operation
        );
      }

      return { allowed: true, resolvedPath };
    } catch (err) {
      return this.deny(
        requestedPath,
        `Validation error: ${err instanceof Error ? err.message : String(err)}`,
        operation
      );
    }
  }

  /** Validate that a write operation is allowed */
  validateWrite(filePath: string): SandboxValidationResult {
    return this.validate(filePath, 'write');
  }

  /** Validate that a read operation is allowed */
  validateRead(filePath: string): SandboxValidationResult {
    return this.validate(filePath, 'read');
  }

  /** Validate that a delete operation is allowed */
  validateDelete(filePath: string): SandboxValidationResult {
    return this.validate(filePath, 'delete');
  }

  /** Get the blocked access log */
  getBlockedAccessLog(): BlockedAccessLogEntry[] {
    return [...this.blockedAccessLog];
  }

  /** Clear the blocked access log */
  clearLog(): void {
    this.blockedAccessLog = [];
  }

  /** Update sandbox config */
  updateConfig(updates: Partial<SandboxConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private deny(
    requestedPath: string,
    reason: string,
    operation: string
  ): SandboxValidationResult {
    if (this.config.logBlockedAccess) {
      const entry: BlockedAccessLogEntry = {
        timestamp: Date.now(),
        requestedPath,
        resolvedPath: path.resolve(requestedPath),
        reason,
        operation,
      };

      this.blockedAccessLog.push(entry);

      // Trim log if it grows too large
      if (this.blockedAccessLog.length > this.maxLogSize) {
        this.blockedAccessLog = this.blockedAccessLog.slice(-this.maxLogSize);
      }

      console.warn(
        `[Sandbox] BLOCKED ${operation} access to "${requestedPath}": ${reason}`
      );
    }

    return {
      allowed: false,
      resolvedPath: path.resolve(requestedPath),
      reason,
    };
  }

  /** Check if a path or any of its components are symlinks pointing outside allowed roots */
  private checkSymlink(
    resolvedPath: string,
    operation: string
  ): SandboxValidationResult {
    try {
      // Check each component of the path for symlinks
      const parts = resolvedPath.split(path.sep);
      let currentPath = '';

      for (let i = 0; i < parts.length; i++) {
        currentPath = currentPath ? path.join(currentPath, parts[i]) : parts[i];

        if (!currentPath) continue;

        try {
          const stat = fs.lstatSync(currentPath);
          if (stat.isSymbolicLink()) {
            const linkTarget = fs.realpathSync(currentPath);

            // Check if the symlink target is within allowed roots
            const isTargetInRoot = this.config.allowedRoots.some((root) => {
              const relative = path.relative(root, linkTarget);
              return !relative.startsWith('..') && !path.isAbsolute(relative);
            });

            if (!isTargetInRoot) {
              return this.deny(
                resolvedPath,
                `Symlink at "${currentPath}" resolves to "${linkTarget}" which is outside allowed roots`,
                operation
              );
            }
          }
        } catch {
          // Path component doesn't exist yet — this is fine for write operations
        }
      }
    } catch (err) {
      // If we can't check symlinks, be conservative and allow
      // (this can happen for paths that don't exist yet)
    }

    return { allowed: true, resolvedPath };
  }

  /** Check for suspicious path traversal patterns */
  private hasPathTraversal(p: string): boolean {
    const normalized = p.toLowerCase();
    // Check for encoded traversal attempts
    const traversalPatterns = [
      '..\\',
      '../',
      '%2e%2e',
      '%252e',
      '..%2f',
      '..%5c',
      '..%252f',
    ];

    return traversalPatterns.some((pattern) => normalized.includes(pattern));
  }
}
