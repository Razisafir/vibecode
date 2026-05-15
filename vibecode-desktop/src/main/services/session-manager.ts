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

export interface EnhancedSessionState extends SessionState {
  // Enhanced execution state
  execution: {
    activePlan?: unknown;
    runningTasks: string[];
    completedTasks: string[];
    // NEW: Detailed active plans
    activePlans: Array<{
      planId: string;
      status: string;
      currentStepIndex: number;
      startedAt: number;
    }>;
    // NEW: Recent plans for history
    recentPlans: Array<{
      planId: string;
      title: string;
      status: string;
      completedAt?: number;
    }>;
    // NEW: Proposal queue
    proposalQueue: string[];
  };

  // NEW: AI Conversation persistence
  conversation: {
    messages: Array<{
      id: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      timestamp: number;
      metadata?: {
        provider?: string;
        model?: string;
        proposalIds?: string[];
        error?: string;
      };
    }>;
    activeProvider: string;
    activeModel: string;
  };

  // NEW: Enhanced layout state
  layout: {
    sidebarOpen: boolean;
    sidebarWidth: number;
    aiPanelOpen: boolean;
    aiPanelWidth: number;
    activeSidebarTab: string;
    workspacePanel?: 'editor' | 'terminal' | 'welcome';
  };

  // NEW: Enhanced workspace details
  workspace: {
    rootPath: string;
    openFiles: string[];
    activeFile?: string;
    scrollPositions: Record<string, number>;
    expandedFolders: string[];
    recentFiles: string[];
  };

  // NEW: Recovery metadata
  recovery: {
    lastCrashed: boolean;
    crashCount: number;
    lastCrashReason?: string;
    safeShutdown: boolean;
  };
}

export interface CrashInfo {
  sessionId: string;
  reason: string;
  timestamp: number;
  activePlans: Array<{ planId: string; status: string; currentStepIndex: number; startedAt: number }>;
  unsavedChanges: boolean;
}

export interface RecoveryInfo {
  hasCrashedSession: boolean;
  crashInfo?: CrashInfo;
  sessionId?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const VIBECODE_DIR = '.vibecode';
const SESSIONS_DIR = 'sessions';
const FILE_EXTENSION = '.json';
const TEMP_EXTENSION = '.tmp';
const MAX_CONVERSATION_MESSAGES = 100;
const DEFAULT_AUTO_SAVE_INTERVAL = 30_000;
const WORKSPACE_SAVE_INTERVAL = 10_000;

// ─── SessionManager ─────────────────────────────────────────────────────────

export class SessionManager {
  private baseDir: string;
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map();
  private workspaceSaveTimers: Map<string, NodeJS.Timeout> = new Map();
  private currentEnhancedState: Map<string, EnhancedSessionState> = new Map();

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(os.homedir(), VIBECODE_DIR, SESSIONS_DIR);
    this.ensureDirectoryExists(this.baseDir);
  }

  // ─── Legacy Public API (backward-compatible) ───────────────────────────

  /** Save a session state to disk */
  save(state: SessionState): void {
    const updated: SessionState = {
      ...state,
      lastSaved: Date.now(),
    };

    const filePath = this.getFilePath(updated.id);
    try {
      this.writeAtomic(filePath, JSON.stringify(updated, null, 2));
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
      this.stopWorkspaceSave(sessionId);
      this.currentEnhancedState.delete(sessionId);
      return true;
    } catch (err) {
      console.error(`[SessionManager] Failed to delete session ${sessionId}:`, err);
      return false;
    }
  }

  /** Start auto-saving a session at the given interval (ms, default 30s) */
  autoSave(state: SessionState, interval: number = DEFAULT_AUTO_SAVE_INTERVAL): NodeJS.Timeout {
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

  // ─── Enhanced Public API ───────────────────────────────────────────────

  /** Save the full enhanced session state to disk (atomic write) */
  saveEnhanced(state: EnhancedSessionState): void {
    // Enforce conversation message limit
    const trimmedState: EnhancedSessionState = {
      ...state,
      conversation: {
        ...state.conversation,
        messages: state.conversation.messages.slice(-MAX_CONVERSATION_MESSAGES),
      },
      lastSaved: Date.now(),
    };

    this.currentEnhancedState.set(trimmedState.id, trimmedState);

    const filePath = this.getFilePath(trimmedState.id);
    try {
      this.writeAtomic(filePath, JSON.stringify(trimmedState, null, 2));
    } catch (err) {
      console.error(`[SessionManager] Failed to save enhanced session ${trimmedState.id}:`, err);
      throw err;
    }
  }

  /** Restore a full enhanced session by ID */
  restoreEnhanced(sessionId: string): EnhancedSessionState | null {
    const filePath = this.getFilePath(sessionId);
    if (!fs.existsSync(filePath)) return null;

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      // Normalize to EnhancedSessionState — fill in any missing new fields
      const enhanced = this.migrateToEnhanced(parsed);
      this.currentEnhancedState.set(enhanced.id, enhanced);
      return enhanced;
    } catch (err) {
      console.error(`[SessionManager] Failed to restore enhanced session ${sessionId}:`, err);
      return null;
    }
  }

  /** Mark that a crash occurred (called from main process crash handler) */
  markCrash(reason: string): void {
    const latest = this.getLatestEnhanced();
    if (!latest) {
      // No session to mark — create a minimal crash record
      console.warn('[SessionManager] No session to mark as crashed');
      return;
    }

    latest.recovery = {
      lastCrashed: true,
      crashCount: (latest.recovery?.crashCount ?? 0) + 1,
      lastCrashReason: reason,
      safeShutdown: false,
    };

    this.saveEnhanced(latest);
    console.log(`[SessionManager] Session ${latest.id} marked as crashed: ${reason}`);
  }

  /** Mark that the app shut down cleanly */
  markSafeShutdown(): void {
    const latest = this.getLatestEnhanced();
    if (!latest) return;

    latest.recovery = {
      ...latest.recovery,
      lastCrashed: false,
      safeShutdown: true,
    };

    this.saveEnhanced(latest);
    console.log(`[SessionManager] Session ${latest.id} marked as safe shutdown`);
  }

  /** Check if the last session crashed */
  wasCrashed(): boolean {
    const latest = this.getLatestEnhanced();
    if (!latest) return false;
    // If the session file exists but safeShutdown is false/not set, it was a crash
    return latest.recovery?.safeShutdown === false;
  }

  /** Get the session to recover (latest, or the crashed one) */
  getRecoverySession(): EnhancedSessionState | null {
    return this.getLatestEnhanced();
  }

  /** Get recovery info for the UI */
  getRecoveryInfo(): RecoveryInfo {
    const latest = this.getLatestEnhanced();
    if (!latest) {
      return { hasCrashedSession: false };
    }

    const crashed = latest.recovery?.safeShutdown === false;

    if (crashed) {
      return {
        hasCrashedSession: true,
        crashInfo: {
          sessionId: latest.id,
          reason: latest.recovery?.lastCrashReason ?? 'Unknown',
          timestamp: latest.lastSaved,
          activePlans: latest.execution?.activePlans ?? [],
          unsavedChanges: latest.recovery?.safeShutdown === false,
        },
        sessionId: latest.id,
      };
    }

    return {
      hasCrashedSession: false,
      sessionId: latest.id,
    };
  }

  /** Auto-save with full enhanced state */
  autoSaveEnhanced(state: EnhancedSessionState, interval: number = DEFAULT_AUTO_SAVE_INTERVAL): NodeJS.Timeout {
    // Stop any existing timer for this session
    this.stopAutoSave(state.id);

    // Keep a reference that we update
    this.currentEnhancedState.set(state.id, state);

    const timer = setInterval(() => {
      try {
        const currentState = this.currentEnhancedState.get(state.id);
        if (currentState) {
          this.saveEnhanced(currentState);
        } else {
          this.saveEnhanced(state);
        }
      } catch (err) {
        console.error(`[SessionManager] Enhanced auto-save failed for session ${state.id}:`, err);
      }
    }, interval);

    this.autoSaveTimers.set(state.id, timer);
    return timer;
  }

  /** Update the in-memory enhanced state (for auto-save to pick up) */
  updateEnhancedState(state: EnhancedSessionState): void {
    this.currentEnhancedState.set(state.id, state);
  }

  /** Start more frequent workspace-only saves (every 10s) */
  startWorkspaceSave(state: EnhancedSessionState, interval: number = WORKSPACE_SAVE_INTERVAL): NodeJS.Timeout {
    this.stopWorkspaceSave(state.id);

    this.currentEnhancedState.set(state.id, state);

    const timer = setInterval(() => {
      try {
        const currentState = this.currentEnhancedState.get(state.id);
        if (currentState) {
          // Only update workspace-related fields
          const partial: Partial<EnhancedSessionState> = {
            workspace: currentState.workspace,
            lastSaved: Date.now(),
          };
          // Read existing, merge workspace, write back
          const existing = this.restoreEnhanced(state.id);
          if (existing) {
            this.saveEnhanced({
              ...existing,
              ...partial,
            });
          }
        }
      } catch (err) {
        console.error(`[SessionManager] Workspace auto-save failed for session ${state.id}:`, err);
      }
    }, interval);

    this.workspaceSaveTimers.set(state.id, timer);
    return timer;
  }

  /** Stop workspace-specific save */
  stopWorkspaceSave(sessionId: string): void {
    const existing = this.workspaceSaveTimers.get(sessionId);
    if (existing) {
      clearInterval(existing);
      this.workspaceSaveTimers.delete(sessionId);
    }
  }

  /** Create a new enhanced session with full default values */
  createEnhanced(projectId: string, rootPath?: string): EnhancedSessionState {
    const now = Date.now();
    const state: EnhancedSessionState = {
      id: uuidv4(),
      projectId,
      workspace: {
        rootPath: rootPath ?? '',
        openFiles: [],
        activeFile: undefined,
        scrollPositions: {},
        expandedFolders: [],
        recentFiles: [],
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
        activePlans: [],
        recentPlans: [],
        proposalQueue: [],
      },
      layout: {
        sidebarOpen: true,
        sidebarWidth: 280,
        aiPanelOpen: true,
        aiPanelWidth: 400,
        activeSidebarTab: 'files',
        workspacePanel: 'welcome',
      },
      recovery: {
        lastCrashed: false,
        crashCount: 0,
        safeShutdown: false,
      },
      lastSaved: now,
      createdAt: now,
    };

    this.saveEnhanced(state);
    return state;
  }

  /** Get the latest enhanced session across all projects */
  getLatestEnhanced(): EnhancedSessionState | null {
    if (!fs.existsSync(this.baseDir)) return null;

    const files = fs.readdirSync(this.baseDir).filter((f) => f.endsWith(FILE_EXTENSION));
    if (files.length === 0) return null;

    let latest: EnhancedSessionState | null = null;
    let latestTime = 0;

    for (const file of files) {
      const filePath = path.join(this.baseDir, file);
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.lastSaved > latestTime) {
          latestTime = parsed.lastSaved;
          latest = this.migrateToEnhanced(parsed);
        }
      } catch {
        // Skip corrupted files
      }
    }

    return latest;
  }

  /** Archive a crashed session (rename with .archived suffix) */
  archiveCrashedSession(sessionId: string): boolean {
    const filePath = this.getFilePath(sessionId);
    if (!fs.existsSync(filePath)) return false;

    try {
      const archivePath = this.getFilePath(`${sessionId}.archived-${Date.now()}`);
      fs.renameSync(filePath, archivePath);
      this.stopAutoSave(sessionId);
      this.stopWorkspaceSave(sessionId);
      this.currentEnhancedState.delete(sessionId);
      console.log(`[SessionManager] Archived crashed session ${sessionId}`);
      return true;
    } catch (err) {
      console.error(`[SessionManager] Failed to archive session ${sessionId}:`, err);
      return false;
    }
  }

  /** Dispose — stop all auto-save timers and flush */
  dispose(): void {
    // Flush current state before disposing
    for (const [, state] of this.currentEnhancedState) {
      try {
        this.saveEnhanced(state);
      } catch {
        // Best-effort flush
      }
    }

    for (const [id] of this.autoSaveTimers) {
      this.stopAutoSave(id);
    }
    for (const [id] of this.workspaceSaveTimers) {
      this.stopWorkspaceSave(id);
    }
    this.currentEnhancedState.clear();
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

  /**
   * Atomic write: write to a temp file first, then rename.
   * Prevents corruption if the process crashes mid-write.
   */
  private writeAtomic(filePath: string, content: string): void {
    const tempPath = filePath + TEMP_EXTENSION;

    try {
      // Write to temp file
      fs.writeFileSync(tempPath, content, 'utf-8');

      // Rename temp to target (atomic on most filesystems)
      fs.renameSync(tempPath, filePath);
    } catch (err) {
      // Clean up temp file if it exists
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {
        // Ignore cleanup errors
      }
      throw err;
    }
  }

  /**
   * Migrate a plain SessionState (or partially-hydrated EnhancedSessionState)
   * to a fully-populated EnhancedSessionState, filling in defaults for any
   * missing fields.
   */
  private migrateToEnhanced(raw: Record<string, unknown>): EnhancedSessionState {
    const base: SessionState = {
      id: (raw.id as string) ?? uuidv4(),
      projectId: (raw.projectId as string) ?? 'default',
      workspace: {
        openFiles: ((raw.workspace as any)?.openFiles as string[]) ?? [],
        activeFile: (raw.workspace as any)?.activeFile as string | undefined,
        scrollPositions: ((raw.workspace as any)?.scrollPositions as Record<string, number>) ?? {},
      },
      conversation: {
        messages: ((raw.conversation as any)?.messages as unknown[]) ?? [],
        activeProvider: ((raw.conversation as any)?.activeProvider as string) ?? '',
        activeModel: ((raw.conversation as any)?.activeModel as string) ?? '',
      },
      execution: {
        activePlan: (raw.execution as any)?.activePlan,
        runningTasks: ((raw.execution as any)?.runningTasks as string[]) ?? [],
        completedTasks: ((raw.execution as any)?.completedTasks as string[]) ?? [],
      },
      layout: {
        sidebarOpen: (raw.layout as any)?.sidebarOpen ?? true,
        sidebarWidth: (raw.layout as any)?.sidebarWidth ?? 280,
        aiPanelOpen: (raw.layout as any)?.aiPanelOpen ?? true,
        aiPanelWidth: (raw.layout as any)?.aiPanelWidth ?? 400,
        activeSidebarTab: (raw.layout as any)?.activeSidebarTab ?? 'files',
      },
      lastSaved: (raw.lastSaved as number) ?? Date.now(),
      createdAt: (raw.createdAt as number) ?? Date.now(),
    };

    return {
      ...base,
      workspace: {
        rootPath: (raw.workspace as any)?.rootPath ?? (raw.workspace as any)?.rootPath ?? '',
        openFiles: base.workspace.openFiles,
        activeFile: base.workspace.activeFile,
        scrollPositions: base.workspace.scrollPositions,
        expandedFolders: ((raw.workspace as any)?.expandedFolders as string[]) ?? [],
        recentFiles: ((raw.workspace as any)?.recentFiles as string[]) ?? [],
      },
      conversation: {
        messages: (raw.conversation as any)?.messages ?? base.conversation.messages as any[],
        activeProvider: base.conversation.activeProvider,
        activeModel: base.conversation.activeModel,
      },
      execution: {
        ...base.execution,
        activePlans: ((raw.execution as any)?.activePlans as any[]) ?? [],
        recentPlans: ((raw.execution as any)?.recentPlans as any[]) ?? [],
        proposalQueue: ((raw.execution as any)?.proposalQueue as string[]) ?? [],
      },
      layout: {
        ...base.layout,
        workspacePanel: (raw.layout as any)?.workspacePanel as ('editor' | 'terminal' | 'welcome') | undefined,
      },
      recovery: {
        lastCrashed: (raw.recovery as any)?.lastCrashed ?? false,
        crashCount: (raw.recovery as any)?.crashCount ?? 0,
        lastCrashReason: (raw.recovery as any)?.lastCrashReason as string | undefined,
        safeShutdown: (raw.recovery as any)?.safeShutdown ?? false,
      },
    };
  }
}
