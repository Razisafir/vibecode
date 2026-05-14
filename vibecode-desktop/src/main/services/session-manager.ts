import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SessionState {
  id: string;
  projectId: string;
  workspace: {
    openFiles: string[];
    activeFile?: string;
    scrollPositions: Record<string, number>;
  };
  conversation: {
    messages: unknown[];
    activeProvider: string;
    activeModel: string;
  };
  execution: {
    activePlan?: unknown;
    runningTasks: string[];
    completedTasks: string[];
  };
  layout: {
    sidebarOpen: boolean;
    sidebarWidth: number;
    aiPanelOpen: boolean;
    aiPanelWidth: number;
    activeSidebarTab: string;
  };
  lastSaved: number;
  createdAt: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const VIBECODE_DIR = '.vibecode';
const SESSIONS_DIR = 'sessions';
const FILE_EXTENSION = '.json';

// ─── SessionManager ─────────────────────────────────────────────────────────

export class SessionManager {
  private baseDir: string;
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(os.homedir(), VIBECODE_DIR, SESSIONS_DIR);
    this.ensureDirectoryExists(this.baseDir);
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /** Save a session state to disk */
  save(state: SessionState): void {
    const updated: SessionState = {
      ...state,
      lastSaved: Date.now(),
    };

    const filePath = this.getFilePath(updated.id);
    try {
      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');
    } catch (err) {
      console.error(`[SessionManager] Failed to save session ${updated.id}:`, err);
      throw err;
    }
  }

  /** Restore a session by ID */
  restore(sessionId: string): SessionState | null {
    const filePath = this.getFilePath(sessionId);
    if (!fs.existsSync(filePath)) return null;

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as SessionState;
    } catch (err) {
      console.error(`[SessionManager] Failed to restore session ${sessionId}:`, err);
      return null;
    }
  }

  /** List all saved sessions, sorted by most recent first */
  list(): SessionState[] {
    if (!fs.existsSync(this.baseDir)) return [];

    const sessions: SessionState[] = [];

    const files = fs.readdirSync(this.baseDir).filter((f) => f.endsWith(FILE_EXTENSION));

    for (const file of files) {
      const filePath = path.join(this.baseDir, file);
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const state = JSON.parse(raw) as SessionState;
        sessions.push(state);
      } catch {
        // Skip corrupted files
      }
    }

    return sessions.sort((a, b) => b.lastSaved - a.lastSaved);
  }

  /** Delete a session by ID */
  delete(sessionId: string): boolean {
    const filePath = this.getFilePath(sessionId);
    if (!fs.existsSync(filePath)) return false;

    try {
      fs.unlinkSync(filePath);
      // Clean up auto-save timer if active
      this.stopAutoSave(sessionId);
      return true;
    } catch (err) {
      console.error(`[SessionManager] Failed to delete session ${sessionId}:`, err);
      return false;
    }
  }

  /** Start auto-saving a session at the given interval (ms, default 30s) */
  autoSave(state: SessionState, interval: number = 30_000): NodeJS.Timeout {
    // Stop any existing timer for this session
    this.stopAutoSave(state.id);

    const timer = setInterval(() => {
      try {
        this.save(state);
      } catch (err) {
        console.error(`[SessionManager] Auto-save failed for session ${state.id}:`, err);
      }
    }, interval);

    this.autoSaveTimers.set(state.id, timer);
    return timer;
  }

  /** Stop auto-save for a given session */
  stopAutoSave(sessionId: string): void {
    const existing = this.autoSaveTimers.get(sessionId);
    if (existing) {
      clearInterval(existing);
      this.autoSaveTimers.delete(sessionId);
    }
  }

  /** Get the most recent session for a project */
  getLatest(projectId: string): SessionState | null {
    const projectSessions = this.list().filter((s) => s.projectId === projectId);
    return projectSessions.length > 0 ? projectSessions[0] : null;
  }

  /** Create a new session with default values */
  create(projectId: string): SessionState {
    const now = Date.now();
    const state: SessionState = {
      id: uuidv4(),
      projectId,
      workspace: {
        openFiles: [],
        activeFile: undefined,
        scrollPositions: {},
      },
      conversation: {
        messages: [],
        activeProvider: '',
        activeModel: '',
      },
      execution: {
        activePlan: undefined,
        runningTasks: [],
        completedTasks: [],
      },
      layout: {
        sidebarOpen: true,
        sidebarWidth: 280,
        aiPanelOpen: true,
        aiPanelWidth: 400,
        activeSidebarTab: 'files',
      },
      lastSaved: now,
      createdAt: now,
    };

    this.save(state);
    return state;
  }

  /** Dispose — stop all auto-save timers */
  dispose(): void {
    for (const [id] of this.autoSaveTimers) {
      this.stopAutoSave(id);
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private getFilePath(sessionId: string): string {
    return path.join(this.baseDir, `${sessionId}${FILE_EXTENSION}`);
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}
