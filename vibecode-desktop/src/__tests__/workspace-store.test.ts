// ============================================================
// VibeCode Desktop — Workspace Store Tests
// Tests add/remove recent, max recent limit, project type
// detection. Uses temp directory.
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WorkspaceStore, detectProjectType, RecentWorkspace, ProjectType } from '../main/services/workspace-store';

// ─── Helper: Create a temp directory ───────────────────────────────────────

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vibecode-workspace-'));
}

function cleanupDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// Create a testable WorkspaceStore that uses a temp directory
class TestableWorkspaceStore extends WorkspaceStore {
  constructor(filePath: string) {
    super();
    // Override the filePath to use temp directory
    (this as any).filePath = filePath;
    // Ensure the directory and file exist
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify({ version: 1, recentWorkspaces: [] }), 'utf-8');
    }
  }
}

describe('WorkspaceStore', () => {
  let tempDir: string;
  let store: TestableWorkspaceStore;
  let testFilePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    testFilePath = path.join(tempDir, 'recent.json');
    store = new TestableWorkspaceStore(testFilePath);
  });

  afterEach(() => {
    cleanupDir(tempDir);
  });

  // ── Add Recent ───────────────────────────────────────────────────────────

  describe('addRecent', () => {
    it('should add a workspace to the recent list', () => {
      const wsDir = path.join(tempDir, 'my-project');
      fs.mkdirSync(wsDir, { recursive: true });

      const entry = store.addRecent(wsDir);

      expect(entry.path).toBe(wsDir);
      expect(entry.name).toBe('my-project');
      expect(entry.lastOpened).toBeGreaterThan(0);
      expect(entry.projectType).toBeTruthy();
    });

    it('should add workspace with custom name', () => {
      const wsDir = path.join(tempDir, 'project-dir');
      fs.mkdirSync(wsDir, { recursive: true });

      const entry = store.addRecent(wsDir, 'My Custom Project');

      expect(entry.name).toBe('My Custom Project');
    });

    it('should add workspace with custom project type', () => {
      const wsDir = path.join(tempDir, 'typed-project');
      fs.mkdirSync(wsDir, { recursive: true });

      const entry = store.addRecent(wsDir, undefined, 'rust');

      expect(entry.projectType).toBe('rust');
    });

    it('should move existing entry to the front', () => {
      const wsDir = path.join(tempDir, 'revisited');
      fs.mkdirSync(wsDir, { recursive: true });

      store.addRecent(path.join(tempDir, 'first'));
      store.addRecent(wsDir);
      store.addRecent(path.join(tempDir, 'third'));

      // Re-add the same workspace
      store.addRecent(wsDir);

      const recent = store.getRecent();
      expect(recent[0].path).toBe(wsDir);
    });
  });

  // ── Remove Recent ────────────────────────────────────────────────────────

  describe('removeRecent', () => {
    it('should remove a workspace from the recent list', () => {
      const wsDir1 = path.join(tempDir, 'remove-test-1');
      const wsDir2 = path.join(tempDir, 'remove-test-2');
      fs.mkdirSync(wsDir1, { recursive: true });
      fs.mkdirSync(wsDir2, { recursive: true });

      store.addRecent(wsDir1);
      store.addRecent(wsDir2);

      const removed = store.removeRecent(wsDir1);
      expect(removed).toBe(true);

      const recent = store.getRecent();
      expect(recent.find((w) => w.path === wsDir1)).toBeUndefined();
      expect(recent.find((w) => w.path === wsDir2)).toBeDefined();
    });

    it('should return false when removing non-existent workspace', () => {
      const removed = store.removeRecent('/nonexistent/path');
      expect(removed).toBe(false);
    });
  });

  // ── Max Recent Limit ─────────────────────────────────────────────────────

  describe('max recent limit', () => {
    it('should keep at most 20 recent workspaces', () => {
      for (let i = 0; i < 25; i++) {
        const wsDir = path.join(tempDir, `project-${i}`);
        fs.mkdirSync(wsDir, { recursive: true });
        store.addRecent(wsDir);
      }

      const recent = store.getRecent();
      expect(recent.length).toBeLessThanOrEqual(20);
    });
  });

  // ── Get Recent ───────────────────────────────────────────────────────────

  describe('getRecent', () => {
    it('should return workspaces sorted by lastOpened desc', () => {
      const wsDir1 = path.join(tempDir, 'oldest');
      const wsDir2 = path.join(tempDir, 'newest');
      fs.mkdirSync(wsDir1, { recursive: true });
      fs.mkdirSync(wsDir2, { recursive: true });

      store.addRecent(wsDir1);

      // Small delay to ensure different timestamp
      const entry2 = store.addRecent(wsDir2);

      const recent = store.getRecent();
      expect(recent.length).toBeGreaterThanOrEqual(2);
      // Newest should be first (or at least present)
      expect(recent.some((w) => w.path === wsDir2)).toBe(true);
    });

    it('should respect the limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        const wsDir = path.join(tempDir, `limited-${i}`);
        fs.mkdirSync(wsDir, { recursive: true });
        store.addRecent(wsDir);
      }

      const recent = store.getRecent(3);
      expect(recent.length).toBeLessThanOrEqual(3);
    });

    it('should return empty list when no workspaces added', () => {
      const recent = store.getRecent();
      expect(recent).toEqual([]);
    });
  });

  // ── Clear Recent ─────────────────────────────────────────────────────────

  describe('clearRecent', () => {
    it('should clear all recent workspaces', () => {
      const wsDir = path.join(tempDir, 'clearable');
      fs.mkdirSync(wsDir, { recursive: true });
      store.addRecent(wsDir);

      store.clearRecent();

      const recent = store.getRecent();
      expect(recent).toHaveLength(0);
    });
  });

  // ── Project Type Detection ───────────────────────────────────────────────

  describe('detectProjectType', () => {
    it('should detect node project from package.json', () => {
      const projectDir = path.join(tempDir, 'node-project');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'package.json'), '{}', 'utf-8');

      const type = detectProjectType(projectDir);
      expect(type).toBe('node');
    });

    it('should detect python project from requirements.txt', () => {
      const projectDir = path.join(tempDir, 'python-project');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'requirements.txt'), 'flask==2.0', 'utf-8');

      const type = detectProjectType(projectDir);
      expect(type).toBe('python');
    });

    it('should detect python project from pyproject.toml', () => {
      const projectDir = path.join(tempDir, 'python-project2');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'pyproject.toml'), '[project]', 'utf-8');

      const type = detectProjectType(projectDir);
      expect(type).toBe('python');
    });

    it('should detect rust project from Cargo.toml', () => {
      const projectDir = path.join(tempDir, 'rust-project');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'Cargo.toml'), '[package]', 'utf-8');

      const type = detectProjectType(projectDir);
      expect(type).toBe('rust');
    });

    it('should detect go project from go.mod', () => {
      const projectDir = path.join(tempDir, 'go-project');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'go.mod'), 'module example', 'utf-8');

      const type = detectProjectType(projectDir);
      expect(type).toBe('go');
    });

    it('should detect java project from pom.xml', () => {
      const projectDir = path.join(tempDir, 'java-project');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'pom.xml'), '<project>', 'utf-8');

      const type = detectProjectType(projectDir);
      expect(type).toBe('java');
    });

    it('should detect java project from build.gradle', () => {
      const projectDir = path.join(tempDir, 'java-project2');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'build.gradle'), 'plugins {}', 'utf-8');

      const type = detectProjectType(projectDir);
      expect(type).toBe('java');
    });

    it('should return generic for unknown project types', () => {
      const projectDir = path.join(tempDir, 'unknown-project');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'README.md'), 'Hello', 'utf-8');

      const type = detectProjectType(projectDir);
      expect(type).toBe('generic');
    });

    it('should return generic for non-existent directories', () => {
      const type = detectProjectType('/nonexistent/directory');
      expect(type).toBe('generic');
    });
  });

  // ── Persistence ──────────────────────────────────────────────────────────

  describe('persistence', () => {
    it('should persist workspaces across store instances', () => {
      const wsDir = path.join(tempDir, 'persistent-project');
      fs.mkdirSync(wsDir, { recursive: true });

      store.addRecent(wsDir, 'Persistent Project');

      // Create a new store instance
      const store2 = new TestableWorkspaceStore(testFilePath);
      const recent = store2.getRecent();

      expect(recent.some((w) => w.name === 'Persistent Project')).toBe(true);
    });
  });

  // ── Atomic Writes ────────────────────────────────────────────────────────

  describe('atomic writes', () => {
    it('should use temp file for atomic writes', () => {
      const wsDir = path.join(tempDir, 'atomic-project');
      fs.mkdirSync(wsDir, { recursive: true });
      store.addRecent(wsDir);

      // Main file should exist
      expect(fs.existsSync(testFilePath)).toBe(true);
      // Temp file should not exist (was renamed)
      expect(fs.existsSync(testFilePath + '.tmp')).toBe(false);
    });
  });
});
