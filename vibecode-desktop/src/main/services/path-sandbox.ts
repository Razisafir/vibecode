import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger';

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

/**
 * Directory names that are ALWAYS blocked, even if they exist within the
 * workspace root.  These are security-sensitive directories that should never
 * be exposed to the renderer process.
 */
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

/**
 * Directory names that contain credentials or secrets and should be blocked
 * even when they appear as path components within the workspace.
 */
const BLOCKED_PATH_COMPONENTS = new Set([
  '.ssh',
  '.gnupg',
  '.aws',
  '.kube',
  '.docker',
]);

// ─── File Extension Allowlist / Blocklist ───────────────────────────────────

/**
 * Allowed file extensions for reading.  Covers common text-based formats
 * used in software development.
 */
const ALLOWED_READ_EXTENSIONS = new Set([
  // Web / Frontend
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.html', '.htm', '.css', '.scss', '.less', '.sass',
  '.vue', '.svelte', '.astro',

  // Data / Config
  '.json', '.json5', '.jsonc',
  '.yaml', '.yml',
  '.toml', '.ini', '.cfg', '.conf', '.rc',
  '.xml', '.csv', '.tsv',

  // Docs
  '.md', '.mdx', '.txt', '.rst', '.adoc', '.org',

  // Shell / Scripts
  '.sh', '.bash', '.zsh', '.fish',
  '.bat', '.cmd', '.ps1',
  '.sql', '.graphql', '.gql',

  // Python
  '.py', '.pyi', '.pyx', '.pxd', '.toml',

  // Rust
  '.rs', '.toml',

  // Go
  '.go', '.mod', '.sum',

  // Java / JVM
  '.java', '.kt', '.kts', '.scala', '.groovy', '.gradle',
  '.properties',

  // C / C++
  '.c', '.h', '.cpp', '.hpp', '.cc', '.cxx', '.hh',

  // .NET
  '.cs', '.csproj', '.sln',

  // Ruby
  '.rb', '.erb', '.gemspec', '.rake',

  // PHP
  '.php',

  // Swift / Apple
  '.swift',

  // Config / Dotfiles
  '.env', '.env.local', '.env.development', '.env.production', '.env.test',
  '.gitignore', '.gitattributes',
  '.eslintrc', '.prettierrc', '.babelrc', '.npmrc', '.nvmrc', '.node-version',
  '.editorconfig', '.stylelintrc',
  '.dockerignore', '.containerignore',
  '.makefile', '.cmake',

  // Lockfiles
  '.lock', '.lockfile',

  // Misc text
  '.log', '.rtf',

  // Web manifest
  '.webmanifest',

  // Protobuf / IDL
  '.proto', '.thrift',

  // Makefile-like (no extension — handled separately)
]);

/**
 * Binary / dangerous file extensions that are always blocked from both
 * reading and writing through the sandboxed IPC layer.
 */
const BLOCKED_EXTENSIONS = new Set([
  // Executables
  '.exe', '.dll', '.so', '.dylib', '.sys', '.drv',
  '.app', '.dmg', '.deb', '.rpm', '.msi', '.msp',
  '.com', '.scr', '.bat', '.cmd', // .bat/.cmd allowed in read but blocked in write for safety

  // Binary data
  '.bin', '.dat', '.db', '.sqlite', '.sqlite3',
  '.o', '.obj', '.a', '.lib', '.pdb',

  // Archives (can contain malware)
  '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar',

  // Images / Media (not text — use dedicated APIs instead)
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flac',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',

  // Certificates / Keys
  '.pem', '.key', '.p12', '.pfx', '.cer', '.crt', '.der',
  '.pub', '.asc',

  // Database
  '.sqlitedb', '.db-journal', '.db-wal',

  // Java binaries
  '.class', '.jar', '.war', '.ear',

  // Python bytecode
  '.pyc', '.pyo',

  // Other
  '.wasm',
]);

// ─── PathSandbox Service ────────────────────────────────────────────────────

/**
 * PathSandbox enforces filesystem access boundaries for the renderer process.
 *
 * All IPC handlers that touch the filesystem MUST route their paths through
 * `validatePath()` before performing any I/O.  This prevents path-traversal
 * attacks, symlink escapes, and access to security-sensitive directories.
 *
 * The sandbox operates on a single **workspace root** which can be changed at
 * runtime (e.g. when the user opens a new project folder).
 */
export class PathSandbox {
  private workspaceRoot: string;
  private resolvedWorkspaceRoot: string;

  /**
   * @param workspaceRoot - The initial workspace root directory.
   *                        If the directory doesn't exist yet it will be
   *                        resolved via `path.resolve()` only; real-path
   *                        resolution happens lazily when the directory exists.
   */
  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.resolvedWorkspaceRoot = this.resolveRealPath(this.workspaceRoot);
    logger.info(`[PathSandbox] Initialized with workspace root: ${this.workspaceRoot}`);
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Validate that `requestedPath` is safe to access within the current
   * workspace sandbox.
   *
   * Checks performed (in order):
   *  1. Normalize and resolve to an absolute path
   *  2. Resolve symlinks via `fs.realpathSync()` (if the path exists)
   *  3. Verify the resolved path starts with the workspace root
   *  4. Reject path traversal outside the workspace
   *  5. Reject access to blocked directory names (`.ssh`, `.aws`, etc.)
   *  6. Reject blocked file extensions (binaries, executables, etc.)
   *
   * @param requestedPath - The path requested by the renderer.
   * @returns A `PathValidationResult` indicating whether access is allowed.
   */
  validatePath(requestedPath: string): PathValidationResult {
    // Step 1: Normalize and resolve to absolute path
    const normalized = path.normalize(requestedPath);
    const resolved = path.resolve(normalized);

    // Step 2: Resolve symlinks if the path (or its parent) exists
    const realPath = this.resolveRealPath(resolved);

    // Step 3: Workspace containment check
    const effectiveRoot = this.getEffectiveRoot();
    if (!realPath.startsWith(effectiveRoot + path.sep) && realPath !== effectiveRoot) {
      const msg = `Path escapes workspace: "${realPath}" is outside "${effectiveRoot}"`;
      this.logBlocked('workspace-escape', requestedPath, realPath, msg);
      return { allowed: false, resolvedPath: realPath, error: msg };
    }

    // Step 4: Path traversal check (double-check after normalization)
    const relative = path.relative(effectiveRoot, realPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      const msg = `Path traversal detected: "${requestedPath}" resolves to "${realPath}"`;
      this.logBlocked('path-traversal', requestedPath, realPath, msg);
      return { allowed: false, resolvedPath: realPath, error: msg };
    }

    // Step 5: Blocked directory check
    const blockedDir = this.checkBlockedDirectories(realPath, effectiveRoot);
    if (blockedDir) {
      const msg = `Access to blocked directory "${blockedDir}" is forbidden`;
      this.logBlocked('blocked-directory', requestedPath, realPath, msg);
      return { allowed: false, resolvedPath: realPath, error: msg };
    }

    // Step 6: Blocked extension check (only for files, not directories)
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

  /**
   * Validate that a file path has an allowed extension for reading.
   *
   * Files without extensions (e.g. `Makefile`, `Dockerfile`) are allowed.
   * Files with extensions not in the allowlist OR in the blocklist are rejected.
   *
   * @param filePath - The file path to validate.
   * @returns A `PathValidationResult` indicating whether the extension is allowed.
   */
  validateReadExtension(filePath: string): PathValidationResult {
    const ext = path.extname(filePath).toLowerCase();

    // No extension — allow (e.g. Makefile, Dockerfile, LICENSE)
    if (!ext) {
      return { allowed: true, resolvedPath: filePath };
    }

    // Blocked extensions take precedence
    if (BLOCKED_EXTENSIONS.has(ext)) {
      const msg = `Reading files with extension "${ext}" is not allowed`;
      this.logBlocked('blocked-read-extension', filePath, filePath, msg);
      return { allowed: false, resolvedPath: filePath, error: msg };
    }

    // If we have an explicit allowlist, check it
    if (ALLOWED_READ_EXTENSIONS.has(ext)) {
      return { allowed: true, resolvedPath: filePath };
    }

    // Extension not in allowlist — deny by default
    const msg = `Reading files with extension "${ext}" is not in the allowed list`;
    this.logBlocked('unknown-read-extension', filePath, filePath, msg);
    return { allowed: false, resolvedPath: filePath, error: msg };
  }

  /**
   * Validate that a file path has an allowed extension for writing.
   *
   * Same rules as reading: blocked extensions are always denied, unknown
   * extensions are denied by default.
   *
   * @param filePath - The file path to validate.
   * @returns A `PathValidationResult` indicating whether the extension is allowed.
   */
  validateWriteExtension(filePath: string): PathValidationResult {
    const ext = path.extname(filePath).toLowerCase();

    // No extension — allow
    if (!ext) {
      return { allowed: true, resolvedPath: filePath };
    }

    // Blocked extensions take precedence
    if (BLOCKED_EXTENSIONS.has(ext)) {
      const msg = `Writing files with extension "${ext}" is not allowed`;
      this.logBlocked('blocked-write-extension', filePath, filePath, msg);
      return { allowed: false, resolvedPath: filePath, error: msg };
    }

    // Check allowlist
    if (ALLOWED_READ_EXTENSIONS.has(ext)) {
      return { allowed: true, resolvedPath: filePath };
    }

    // Unknown extension — deny by default
    const msg = `Writing files with extension "${ext}" is not in the allowed list`;
    this.logBlocked('unknown-write-extension', filePath, filePath, msg);
    return { allowed: false, resolvedPath: filePath, error: msg };
  }

  /**
   * Update the workspace root.  Called when the user opens a different
   * project directory.
   *
   * @param root - The new workspace root directory.
   */
  setWorkspaceRoot(root: string): void {
    const resolved = path.resolve(root);
    this.workspaceRoot = resolved;
    this.resolvedWorkspaceRoot = this.resolveRealPath(resolved);
    logger.info(`[PathSandbox] Workspace root changed to: ${resolved}`);
  }

  /**
   * Get the current workspace root.
   *
   * @returns The normalized, absolute workspace root path.
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Quick check whether a given path is within the current workspace.
   * This does NOT check blocked directories or extensions — use
   * `validatePath()` for full validation.
   *
   * @param inputPath - The path to check.
   * @returns `true` if the path is within the workspace root.
   */
  isWithinWorkspace(inputPath: string): boolean {
    const resolved = path.resolve(inputPath);
    const realPath = this.resolveRealPath(resolved);
    const effectiveRoot = this.getEffectiveRoot();
    return realPath.startsWith(effectiveRoot + path.sep) || realPath === effectiveRoot;
  }

  // ── Private Helpers ────────────────────────────────────────────────────

  /**
   * Resolve the real (canonical) path by following symlinks.
   * If the path doesn't exist on disk yet (e.g. a file being created),
   * we resolve the parent directory and append the basename.
   */
  private resolveRealPath(inputPath: string): string {
    try {
      return fs.realpathSync(inputPath);
    } catch {
      // Path doesn't exist — resolve parent if possible
      const parent = path.dirname(inputPath);
      const base = path.basename(inputPath);

      try {
        const realParent = fs.realpathSync(parent);
        return path.join(realParent, base);
      } catch {
        // Parent doesn't exist either — fall back to normalized resolve
        return path.resolve(inputPath);
      }
    }
  }

  /**
   * Get the effective workspace root (real path resolved).
   */
  private getEffectiveRoot(): string {
    return this.resolvedWorkspaceRoot;
  }

  /**
   * Check whether any path component relative to the workspace root
   * matches a blocked directory name.
   *
   * @returns The blocked directory name, or `null` if none found.
   */
  private checkBlockedDirectories(targetPath: string, workspaceRoot: string): string | null {
    const relative = path.relative(workspaceRoot, targetPath);
    const parts = relative.split(path.sep);

    for (const part of parts) {
      // Check exact name matches
      if (BLOCKED_PATH_COMPONENTS.has(part)) {
        return part;
      }

      // Check compound patterns like ".config/gh"
      // We need to check if the relative path starts with any BLOCKED_DIRECTORY_NAMES entry
      const normalizedRelative = relative.replace(/\\/g, '/');
      for (const blocked of BLOCKED_DIRECTORY_NAMES) {
        if (normalizedRelative.startsWith(blocked.replace(/\\/g, '/')) || normalizedRelative.includes('/' + blocked.replace(/\\/g, '/'))) {
          return blocked;
        }
      }
    }

    return null;
  }

  /**
   * Determine if a path looks like it points to a file (has an extension).
   */
  private hasFileExtension(inputPath: string): boolean {
    const base = path.basename(inputPath);
    // Dotfiles like .gitignore don't count as having an extension
    // but "real" extensions like .ts do
    const lastDot = base.lastIndexOf('.');
    if (lastDot <= 0) return false; // hidden files with no ext, or no dot
    return true;
  }

  /**
   * Log a blocked access attempt.
   */
  private logBlocked(
    reason: string,
    requestedPath: string,
    resolvedPath: string,
    message: string,
  ): void {
    logger.warn(
      `[PathSandbox] BLOCKED (${reason}): requested="${requestedPath}" resolved="${resolvedPath}" reason="${message}"`,
    );
  }
}

// ─── Singleton Instance ─────────────────────────────────────────────────────

/**
 * Default PathSandbox instance.  Initialized with the user's home directory
 * as a safe default.  The workspace root should be changed via
 * `setWorkspaceRoot()` when the user opens a project.
 */
const defaultRoot = path.join(os.homedir(), 'vibecode-workspace');

// Ensure the default workspace directory exists
try {
  if (!fs.existsSync(defaultRoot)) {
    fs.mkdirSync(defaultRoot, { recursive: true });
  }
} catch {
  // Fallback to tmpdir if home is not writable
}

export const pathSandbox = new PathSandbox(defaultRoot);
