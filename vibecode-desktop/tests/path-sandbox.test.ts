import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PathSandbox } from '../src/main/services/path-sandbox';

describe('PathSandbox', () => {
  let testDir: string;
  let sandbox: PathSandbox;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibecode-sandbox-test-'));
    sandbox = new PathSandbox(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('validatePath', () => {
    it('should allow paths within workspace', () => {
      const result = sandbox.validatePath(path.join(testDir, 'src', 'index.ts'));
      expect(result.allowed).toBe(true);
    });

    it('should reject paths outside workspace', () => {
      const result = sandbox.validatePath('/etc/passwd');
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('escapes workspace');
    });

    it('should reject path traversal attempts', () => {
      const result = sandbox.validatePath(path.join(testDir, '..', '..', 'etc', 'passwd'));
      expect(result.allowed).toBe(false);
    });

    it('should reject access to .ssh directory', () => {
      const sshPath = path.join(testDir, '.ssh', 'id_rsa');
      const result = sandbox.validatePath(sshPath);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('blocked directory');
    });

    it('should reject access to .aws directory', () => {
      const awsPath = path.join(testDir, '.aws', 'credentials');
      const result = sandbox.validatePath(awsPath);
      expect(result.allowed).toBe(false);
    });
  });

  describe('isWithinWorkspace', () => {
    it('should return true for paths within workspace', () => {
      expect(sandbox.isWithinWorkspace(path.join(testDir, 'src'))).toBe(true);
    });

    it('should return false for paths outside workspace', () => {
      expect(sandbox.isWithinWorkspace('/etc/passwd')).toBe(false);
    });
  });

  describe('Extension validation', () => {
    it('should allow reading .ts files', () => {
      const result = sandbox.validateReadExtension(path.join(testDir, 'app.ts'));
      expect(result.allowed).toBe(true);
    });

    it('should block reading .exe files', () => {
      const result = sandbox.validateReadExtension(path.join(testDir, 'malware.exe'));
      expect(result.allowed).toBe(false);
    });

    it('should block writing .pem key files', () => {
      const result = sandbox.validateWriteExtension(path.join(testDir, 'key.pem'));
      expect(result.allowed).toBe(false);
    });
  });
});
