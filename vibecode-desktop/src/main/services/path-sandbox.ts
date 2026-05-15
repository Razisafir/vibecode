import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger';
import { auditLog } from '../utils/audit-log';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Result of a path validation check. */
export interface PathValidationResult {
  /** Whether the path is allowed within the sandbox. */
  allowed: boolean;
  /** The fully resolved, normalized absolute path. */
  resolvedPath: string;
  /** Human-readable error message when `allowed` is false. */
  error?: string;
}

// ─── Blocked Directories ────────────────────────────────────────────────────

const BLOCKED_DIRECTORY_NAMES = new Set([
  '.ssh',
  '.gnupg',
  '.aws',
  '.kube',
  '.config/gh',
  '.config/gcloud',
  '.docker',
  '.npmrc',
  '.pypirc',
  '.netrc',
  '.pgpass',
  '.htpasswd',
]);

const BLOCKED_PATH_COMPONENTS = new Set([
  '.ssh',
  '.gnupg',
  '.aws',
  '.kube',
  '.docker',
  '.config',
]);

// ─── Device / Pseudo-Filesystem Prefixes ─────────────────────────────────────

const BLOCKED_PATH_PREFIXES = [
  '/dev/',
  '/proc/',
  '/sys/',
];

// ─── Sensitive Home Directory Subpaths ───────────────────────────────────────

const SENSITIVE_HOME_SUBPATHS = [
  '.ssh',
  '.gnupg',
  '.aws',
  '.config',
];

// ─── File Extension Allowlist / Blocklist ────────────────────────────────────

const ALLOWED_READ_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.html', '.htm', '.css', '.scss', '.less', '.sass',
  '.vue', '.svelte', '.astro',
  '.json', '.json5', '.jsonc',
  '.yaml', '.yml',
  '.toml', '.ini', '.cfg', '.conf', '.rc',
  '.xml', '.csv', '.tsv',
  '.md', '.mdx', '.txt', '.rst', '.adoc', '.org',
  '.sh', '.bash', '.zsh', '.fish',
  '.bat', '.cmd', '.ps1',
  '.sql', '.graphql', '.gql',
  '.py', '.pyi', '.pyx', '.pxd',
  '.rs', '.toml',
  '.go', '.mod', '.sum',
  '.java', '.kt', '.kts', '.scala', '.groovy', '.gradle',
  '.properties',
  '.c', '.h', '.cpp', '.hpp', '.cc', '.cxx', '.hh',
  '.cs', '.csproj', '.sln',
  '.rb', '.erb', '.gemspec', '.rake',
  '.php',
  '.swift',
  '.env', '.env.local', '.env.development', '.env.production', '.env.test',
  '.gitignore', '.gitattributes',
  '.eslintrc', '.prettierrc', '.babelrc', '.npmrc', '.nvmrc', '.node-version',
  '.editorconfig', '.stylelintrc',
  '.dockerignore', '.containerignore',
  '.makefile', '.cmake',
  '.lock', '.lockfile',
  '.log', '.rtf',
  '.webmanifest',
  '.proto', '.thrift',
]);

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.sys', '.drv',
  '.app', '.dmg', '.deb', '.rpm', '.msi', '.msp',
  '.com', '.scr',
  '.bin', '.dat', '.db', '.sqlite', '.sqlite3',
  '.o', '.obj', '.a', '.lib', '.pdb',
  '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flac',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.pem', '.key', '.p12', '.pfx', '.cer', '.crt', '.der',
  '.pub', '.asc',
  '.sqlitedb', '.db-journal', '.db-wal',
  '.class', '.jar', '.war', '.ear',
  '.pyc', '.pyo',
  '.wasm',
]);

// ─── PathSandbox Service ────────────────────────────────────────────────────

export class PathSandbox {
  private workspaceRoot: string;
  private resolvedWorkspaceRoot: string;
  private homeDir: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.resolvedWorkspaceRoot = this.resolveRealPath(this.workspaceRoot);
    this.homeDir = os.homedir();
    logger.info('workspace', `PathSandbox initialized with workspace root: ${this.workspaceRoot}`);
  }

  // ── Public API ─────────────────────────────────────────────────────────

  validatePath(requestedPath: string): PathValidationResult {
    // Step 1: Normalize and resolve to absolute path
    const normalized = path.normalize(requestedPath);
    const resolved = path.resolve(normalized);

    // Step 2: UNC path blocking (Windows)
    if (this.isUNCPath(resolved)) {
      const msg = `UNC paths are blocked: "${resolved}"`;
      this.logBlocked('unc-path', requestedPath, resolved, msg);
      return { allowed: false, resolvedPath: resolved, error: msg };
    }

    // Step 3: Device/pseudo-filesystem blocking
    if (this.isDeviceOrPseudoPath(resolved)) {
      const msg = `Access to device/pseudo-filesystem path is blocked: "${resolved}"`;
      this.logBlocked('device-path', requestedPath, resolved, msg);
      return { allowed: false, resolvedPath: resolved, error: msg };
    }

    // Step 4: Resolve symlinks (resolve ALL symlinks before checking containment)
    const realPath = this.resolveRealPath(resolved);

    // Step 5: Workspace containment check (with case-sensitivity handling)
    const effectiveRoot = this.getEffectiveRoot();
    if (!this.pathStartsWith(realPath, effectiveRoot) && realPath !== effectiveRoot) {
      const msg = `Path escapes workspace: "${realPath}" is outside "${effectiveRoot}"`;
      this.logBlocked('workspace-escape', requestedPath, realPath, msg);
      return { allowed: false, resolvedPath: realPath, error: msg };
    }

    // Step 6: Path traversal check (double-check after normalization)
    const relative = path.relative(effectiveRoot, realPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      const msg = `Path traversal detected: "${requestedPath}" resolves to "${realPath}"`;
      this.logBlocked('path-traversal', requestedPath, realPath, msg);
      return { allowed: false, resolvedPath: realPath, error: msg };
    }

    // Step 7: Sensitive home directory blocking
    const sensitiveDir = this.checkSensitiveHomeDirectories(realPath);
    if (sensitiveDir) {
      const msg = `Access to sensitive directory "${sensitiveDir}" is forbidden`;
      this.logBlocked('sensitive-dir', requestedPath, realPath, msg);
      return { allowed: false, resolvedPath: realPath, error: msg };
    }

    // Step 8: Blocked directory check (within workspace)
    const blockedDir = this.checkBlockedDirectories(realPath, effectiveRoot);
    if (blockedDir) {
      const msg = `Access to blocked directory "${blockedDir}" is forbidden`;
      this.logBlocked('blocked-directory', requestedPath, realPath, msg);
      return { allowed: false, resolvedPath: realPath, error: msg };
    }

    // Step 9: Blocked extension check (only for files)
    if (this.hasFileExtension(realPath)) {
      const ext = path.extname(realPath).toLowerCase();
      if (BLOCKED_EXTENSIONS.has(ext)) {
        const msg = `Access to file with blocked extension "${ext}" is forbidden`;
        this.logBlocked('blocked-extension', requestedPath, realPath, msg);
        return { allowed: false, resolvedPath: realPath, error: msg };
      }
    }

    return { allowed: true, resolvedPath: realPath };
  }

  validateReadExtension(filePath: string): PathValidationResult {
    const ext = path.extname(filePath).toLowerCase();
    if (!ext) return { allowed: true, resolvedPath: filePath };
    if (BLOCKED_EXTENSIONS.has(ext)) {
      const msg = `Reading files with extension "${ext}" is not allowed`;
      this.logBlocked('blocked-read-extension', filePath, filePath, msg);
      return { allowed: false, resolvedPath: filePath, error: msg };
    }
    if (ALLOWED_READ_EXTENSIONS.has(ext)) return { allowed: true, resolvedPath: filePath };
    const msg = `Reading files with extension "${ext}" is not in the allowed list`;
    this.logBlocked('unknown-read-extension', filePath, filePath, msg);
    return { allowed: false, resolvedPath: filePath, error: msg };
  }

  validateWriteExtension(filePath: string): PathValidationResult {
    const ext = path.extname(filePath).toLowerCase();
    if (!ext) return { allowed: true, resolvedPath: filePath };
    if (BLOCKED_EXTENSIONS.has(ext)) {
      const msg = `Writing files with extension "${ext}" is not allowed`;
      this.logBlocked('blocked-write-extension', filePath, filePath, msg);
      return { allowed: false, resolvedPath: filePath, error: msg };
    }
    if (ALLOWED_READ_EXTENSIONS.has(ext)) return { allowed: true, resolvedPath: filePath };
    const msg = `Writing files with extension "${ext}" is not in the allowed list`;
    this.logBlocked('unknown-write-extension', filePath, filePath, msg);
    return { allowed: false, resolvedPath: filePath, error: msg };
  }

  setWorkspaceRoot(root: string): void {
    const resolved = path.resolve(root);
    this.workspaceRoot = resolved;
    this.resolvedWorkspaceRoot = this.resolveRealPath(resolved);
    logger.info('workspace', `PathSandbox workspace root changed to: ${resolved}`);
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  isWithinWorkspace(inputPath: string): boolean {
    const resolved = path.resolve(inputPath);
    const realPath = this.resolveRealPath(resolved);
    const effectiveRoot = this.getEffectiveRoot();
    return this.pathStartsWith(realPath, effectiveRoot) || realPath === effectiveRoot;
  }

  // ── Private Helpers ────────────────────────────────────────────────────

  /**
   * Resolve the real (canonical) path by following symlinks.
   * Resolves ALL symlinks in the path before checking containment.
   */
  private resolveRealPath(inputPath: string): string {
    try {
      return fs.realpathSync(inputPath);
    } catch {
      // Path doesn't exist — resolve parent if possible, then append basename
      const parent = path.dirname(inputPath);
      const base = path.basename(inputPath);

      // Recursively resolve parent symlinks
      try {
        const realParent = fs.realpathSync(parent);
        return path.join(realParent, base);
      } catch {
        // Parent doesn't exist either — walk up until we find an existing ancestor
        let currentParent = parent;
        const parts: string[] = [base];
        while (currentParent !== path.dirname(currentParent)) {
          parts.unshift(path.basename(currentParent));
          currentParent = path.dirname(currentParent);
          try {
            const realAncestor = fs.realpathSync(currentParent);
            return path.join(realAncestor, ...parts);
          } catch {
            continue;
          }
        }
        // Fallback to normalized resolve
        return path.resolve(inputPath);
      }
    }
  }

  private getEffectiveRoot(): string {
    return this.resolvedWorkspaceRoot;
  }

  /**
   * Case-insensitive path comparison for macOS/Windows.
   * On case-insensitive filesystems, /Users/foo and /users/FOO should match.
   */
  private pathStartsWith(target: string, prefix: string): boolean {
    // Try exact match first (fastest path)
    if (target.startsWith(prefix + path.sep)) return true;

    // On macOS/Windows, try case-insensitive comparison
    if (process.platform === 'darwin' || process.platform === 'win32') {
      const lowerTarget = target.toLowerCase();
      const lowerPrefix = prefix.toLowerCase();
      if (lowerTarget.startsWith(lowerPrefix + path.sep)) return true;
    }

    return false;
  }

  /**
   * Check if a path is a UNC path (Windows network path).
   */
  private isUNCPath(inputPath: string): boolean {
    // UNC paths start with \\ (e.g. \\server\share)
    return process.platform === 'win32' && /^[\\\/]{2}[^\\\/]/.test(inputPath);
  }

  /**
   * Check if a path points to a device or pseudo-filesystem.
   * Blocks access to /dev/*, /proc/*, /sys/* on Linux/macOS.
   */
  private isDeviceOrPseudoPath(inputPath: string): boolean {
    const normalized = path.normalize(inputPath);
    for (const prefix of BLOCKED_PATH_PREFIXES) {
      if (normalized.startsWith(prefix)) return true;
    }
    return false;
  }

  /**
   * Check if a path is inside a sensitive home directory (e.g. ~/.ssh, ~/.aws).
   */
  private checkSensitiveHomeDirectories(targetPath: string): string | null {
    const normalized = path.normalize(targetPath);
    const homeNormalized = path.normalize(this.homeDir);

    // Check if path is under the home directory
    if (!this.pathStartsWith(normalized, homeNormalized) && normalized !== homeNormalized) {
      return null; // Not under home directory — no check needed
    }

    const relative = path.relative(homeNormalized, normalized);
    const parts = relative.split(path.sep);

    if (parts.length === 0) return null;

    // Check the first path component under home
    const firstComponent = parts[0];
    for (const sensitive of SENSITIVE_HOME_SUBPATHS) {
      if (firstComponent === sensitive) {
        return `~/${sensitive}`;
      }
    }

    return null;
  }

  private checkBlockedDirectories(targetPath: string, workspaceRoot: string): string | null {
    const relative = path.relative(workspaceRoot, targetPath);
    const parts = relative.split(path.sep);

    for (const part of parts) {
      if (BLOCKED_PATH_COMPONENTS.has(part)) {
        return part;
      }

      const normalizedRelative = relative.replace(/\\/g, '/');
      for (const blocked of BLOCKED_DIRECTORY_NAMES) {
        if (normalizedRelative.startsWith(blocked.replace(/\\/g, '/')) || normalizedRelative.includes('/' + blocked.replace(/\\/g, '/'))) {
          return blocked;
        }
      }
    }

    return null;
  }

  private hasFileExtension(inputPath: string): boolean {
    const base = path.basename(inputPath);
    const lastDot = base.lastIndexOf('.');
    if (lastDot <= 0) return false;
    return true;
  }

  private logBlocked(reason: string, requestedPath: string, resolvedPath: string, message: string): void {
    logger.warn(
      'workspace',
      `PathSandbox BLOCKED (${reason}): requested="${requestedPath}" resolved="${resolvedPath}" reason="${message}"`,
    );

    // Audit log for blocked access attempts
    auditLog.auditLog('path.blocked', {
      reason,
      requestedPath: requestedPath.slice(0, 500),
      resolvedPath: resolvedPath.slice(0, 500),
      message,
    }, 'failure');
  }
}

// ─── Singleton Instance ─────────────────────────────────────────────────────

const defaultRoot = path.join(os.homedir(), 'vibecode-workspace');

try {
  if (!fs.existsSync(defaultRoot)) {
    fs.mkdirSync(defaultRoot, { recursive: true });
  }
} catch {
  // Fallback to tmpdir if home is not writable
}

export const pathSandbox = new PathSandbox(defaultRoot);
