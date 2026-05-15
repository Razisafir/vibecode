// ============================================================
// VibeCode Desktop — Path Sandbox Tests
// Tests workspace containment, path traversal prevention,
// symlink following prevention, extension allowlists, and more.
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PathSandbox } from '../main/services/path-sandbox';

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibecode-sandbox-'));
  return dir;
}

function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best effort
  }
}

describe('PathSandbox', () => {
  let tempDir: string;
  let sandbox: PathSandbox;

  beforeEach(() => {
    tempDir = createTempDir();
    sandbox = new PathSandbox(tempDir);
  });

  afterEach(() => {
    cleanupDir(tempDir);
  });

  // ── Workspace Root Containment ───────────────────────────────────────────

  describe('workspace root containment', () => {
    it('should allow paths within workspace root', () => {
      const result = sandbox.validatePath(path.join(tempDir, 'src', 'index.ts'));
      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should allow the workspace root itself', () => {
      const result = sandbox.validatePath(tempDir);
      expect(result.allowed).toBe(true);
    });

    it('should allow nested directories within workspace', () => {
      const result = sandbox.validatePath(path.join(tempDir, 'deep', 'nested', 'dir', 'file.ts'));
      expect(result.allowed).toBe(true);
    });

    it('should reject paths outside the workspace root', () => {
      const result = sandbox.validatePath('/etc/passwd');
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('escapes workspace');
    });
  });

  // ── Path Traversal Prevention ────────────────────────────────────────────

  describe('path traversal prevention', () => {
    it('should reject path traversal attempts with ../', () => {
      const result = sandbox.validatePath(path.join(tempDir, '..', 'etc', 'passwd'));
      expect(result.allowed).toBe(false);
    });

    it('should reject deep path traversal attempts', () => {
      const result = sandbox.validatePath(path.join(tempDir, '..', '..', '..', 'etc', 'passwd'));
      expect(result.allowed).toBe(false);
    });

    it('should allow legitimate relative paths within workspace', () => {
      // Create a subdirectory
      const subDir = path.join(tempDir, 'project');
      fs.mkdirSync(subDir, { recursive: true });

      const result = sandbox.validatePath(path.join(subDir, 'file.ts'));
      expect(result.allowed).toBe(true);
    });
  });

  // ── Symlink Following Prevention ─────────────────────────────────────────

  describe('symlink following prevention', () => {
    it('should reject symlinks that point outside the workspace', () => {
      // Create a symlink inside workspace that points outside
      const outsideDir = createTempDir();
      fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'secret data', 'utf-8');

      const linkPath = path.join(tempDir, 'outside-link');
      try {
        fs.symlinkSync(outsideDir, linkPath, 'dir');
      } catch {
        // Symlinks may not be supported on all platforms
        cleanupDir(outsideDir);
        return;
      }

      const result = sandbox.validatePath(path.join(linkPath, 'secret.txt'));
      expect(result.allowed).toBe(false);

      cleanupDir(outsideDir);
    });

    it('should allow symlinks that point within the workspace', () => {
      // Create a real dir and a symlink to it within the workspace
      const realDir = path.join(tempDir, 'real-dir');
      fs.mkdirSync(realDir, { recursive: true });

      const linkPath = path.join(tempDir, 'link-dir');
      try {
        fs.symlinkSync(realDir, linkPath, 'dir');
      } catch {
        // Symlinks may not be supported on all platforms
        return;
      }

      const result = sandbox.validatePath(path.join(linkPath, 'file.ts'));
      expect(result.allowed).toBe(true);
    });
  });

  // ── Read Extension Allowlist ─────────────────────────────────────────────

  describe('validateReadExtension', () => {
    it('should allow reading common source code extensions', () => {
      expect(sandbox.validateReadExtension('file.ts').allowed).toBe(true);
      expect(sandbox.validateReadExtension('file.tsx').allowed).toBe(true);
      expect(sandbox.validateReadExtension('file.js').allowed).toBe(true);
      expect(sandbox.validateReadExtension('file.py').allowed).toBe(true);
      expect(sandbox.validateReadExtension('file.rs').allowed).toBe(true);
      expect(sandbox.validateReadExtension('file.go').allowed).toBe(true);
      expect(sandbox.validateReadExtension('file.json').allowed).toBe(true);
      expect(sandbox.validateReadExtension('file.md').allowed).toBe(true);
      expect(sandbox.validateReadExtension('file.yaml').allowed).toBe(true);
      expect(sandbox.validateReadExtension('file.css').allowed).toBe(true);
    });

    it('should allow files without extensions', () => {
      expect(sandbox.validateReadExtension('Makefile').allowed).toBe(true);
      expect(sandbox.validateReadExtension('Dockerfile').allowed).toBe(true);
      expect(sandbox.validateReadExtension('LICENSE').allowed).toBe(true);
    });

    it('should reject reading blocked extensions', () => {
      expect(sandbox.validateReadExtension('file.exe').allowed).toBe(false);
      expect(sandbox.validateReadExtension('file.dll').allowed).toBe(false);
      expect(sandbox.validateReadExtension('file.pem').allowed).toBe(false);
      expect(sandbox.validateReadExtension('file.key').allowed).toBe(false);
      expect(sandbox.validateReadExtension('file.zip').allowed).toBe(false);
      expect(sandbox.validateReadExtension('file.sqlite').allowed).toBe(false);
    });

    it('should reject reading unknown extensions', () => {
      expect(sandbox.validateReadExtension('file.xyz').allowed).toBe(false);
      expect(sandbox.validateReadExtension('file.dat').allowed).toBe(false);
    });
  });

  // ── Write Extension Allowlist ────────────────────────────────────────────

  describe('validateWriteExtension', () => {
    it('should allow writing common source code extensions', () => {
      expect(sandbox.validateWriteExtension('file.ts').allowed).toBe(true);
      expect(sandbox.validateWriteExtension('file.py').allowed).toBe(true);
      expect(sandbox.validateWriteExtension('file.json').allowed).toBe(true);
      expect(sandbox.validateWriteExtension('file.md').allowed).toBe(true);
    });

    it('should allow writing files without extensions', () => {
      expect(sandbox.validateWriteExtension('Makefile').allowed).toBe(true);
    });

    it('should reject writing blocked extensions', () => {
      expect(sandbox.validateWriteExtension('file.exe').allowed).toBe(false);
      expect(sandbox.validateWriteExtension('file.dll').allowed).toBe(false);
      expect(sandbox.validateWriteExtension('file.pem').allowed).toBe(false);
      expect(sandbox.validateWriteExtension('file.zip').allowed).toBe(false);
    });

    it('should reject writing unknown extensions', () => {
      expect(sandbox.validateWriteExtension('file.xyz').allowed).toBe(false);
    });
  });

  // ── Blocked Directories ──────────────────────────────────────────────────

  describe('blocked directories', () => {
    it('should reject access to .ssh directory', () => {
      const result = sandbox.validatePath(path.join(tempDir, '.ssh', 'id_rsa'));
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('blocked directory');
    });

    it('should reject access to .aws directory', () => {
      const result = sandbox.validatePath(path.join(tempDir, '.aws', 'credentials'));
      expect(result.allowed).toBe(false);
    });

    it('should reject access to .gnupg directory', () => {
      const result = sandbox.validatePath(path.join(tempDir, '.gnupg', 'pubring.kbx'));
      expect(result.allowed).toBe(false);
    });
  });

  // ── Workspace Root Changing ──────────────────────────────────────────────

  describe('setWorkspaceRoot', () => {
    it('should change the workspace root', () => {
      const newDir = createTempDir();

      sandbox.setWorkspaceRoot(newDir);

      expect(sandbox.getWorkspaceRoot()).toBe(newDir);

      // Path in new root should be allowed
      const result = sandbox.validatePath(path.join(newDir, 'src', 'file.ts'));
      expect(result.allowed).toBe(true);

      // Path in old root should now be rejected
      const oldResult = sandbox.validatePath(path.join(tempDir, 'src', 'file.ts'));
      expect(oldResult.allowed).toBe(false);

      cleanupDir(newDir);
    });
  });

  // ── Absolute vs Relative Path Handling ───────────────────────────────────

  describe('absolute vs relative path handling', () => {
    it('should resolve relative paths against workspace root', () => {
      const result = sandbox.validatePath(path.resolve(tempDir, 'src', 'index.ts'));
      expect(result.allowed).toBe(true);
    });

    it('should normalize paths with . and .. in the middle', () => {
      const result = sandbox.validatePath(path.resolve(tempDir, 'src', '.', 'index.ts'));
      expect(result.allowed).toBe(true);
    });

    it('should handle absolute paths correctly', () => {
      const absPath = path.resolve(tempDir, 'README.md');
      const result = sandbox.validatePath(absPath);
      expect(result.allowed).toBe(true);
    });
  });

  // ── isWithinWorkspace ────────────────────────────────────────────────────

  describe('isWithinWorkspace', () => {
    it('should return true for paths within workspace', () => {
      expect(sandbox.isWithinWorkspace(path.join(tempDir, 'src', 'file.ts'))).toBe(true);
    });

    it('should return true for the workspace root itself', () => {
      expect(sandbox.isWithinWorkspace(tempDir)).toBe(true);
    });

    it('should return false for paths outside workspace', () => {
      expect(sandbox.isWithinWorkspace('/etc/passwd')).toBe(false);
    });
  });

  // ── Blocked Extensions via validatePath ──────────────────────────────────

  describe('blocked extensions in validatePath', () => {
    it('should reject .exe files', () => {
      const result = sandbox.validatePath(path.join(tempDir, 'malware.exe'));
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('blocked extension');
    });

    it('should reject .dll files', () => {
      const result = sandbox.validatePath(path.join(tempDir, 'lib.dll'));
      expect(result.allowed).toBe(false);
    });

    it('should reject .pem files', () => {
      const result = sandbox.validatePath(path.join(tempDir, 'cert.pem'));
      expect(result.allowed).toBe(false);
    });

    it('should reject .key files', () => {
      const result = sandbox.validatePath(path.join(tempDir, 'private.key'));
      expect(result.allowed).toBe(false);
    });

    it('should allow .ts files', () => {
      const result = sandbox.validatePath(path.join(tempDir, 'app.ts'));
      expect(result.allowed).toBe(true);
    });
  });
});
