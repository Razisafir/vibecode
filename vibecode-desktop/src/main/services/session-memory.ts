// ─── VibeCode Desktop — Session Memory System ─────────────────────────────────
// ARC 20 P0-5: Memory + Continuity System
//
// The AI must persist working memory across sessions:
//   - Active objectives
//   - Unfinished tasks
//   - Workspace history
//   - Prior AI plans
//   - Recurring user patterns
//
// The AI should resume context naturally after restart.
// ──────────────────────────────────────────────────────────────────────────────

import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import {
  kernelFsExistsInternal,
  kernelFsReadSync,
  kernelFsWriteInternalSync,
  kernelFsMkdirInternalSync,
} from '../kernel/kernel-fs';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** A tracked objective the user is working toward */
export interface ActiveObjective {
  id: string;
  /** Description of the goal */
  description: string;
  /** When this objective was first mentioned */
  createdAt: number;
  /** Last time the user referenced this */
  lastReferencedAt: number;
  /** Current status */
  status: 'active' | 'completed' | 'abandoned' | 'blocked';
  /** Progress notes */
  notes: string[];
  /** Related file paths */
  relatedFiles: string[];
  /** Related plan IDs */
  relatedPlanIds: string[];
  /** Completion percentage (0-100) */
  progress: number;
}

/** An unfinished task detected from previous session */
export interface UnfinishedTask {
  id: string;
  /** What was being done */
  description: string;
  /** Where the user left off */
  context: string;
  /** When this was last active */
  lastActiveAt: number;
  /** Files that were open/active */
  activeFiles: string[];
  /** Whether the AI had a pending plan */
  hadPendingPlan: boolean;
  /** Plan ID if there was an active plan */
  planId?: string;
}

/** User pattern — recurring behavior the AI learns */
export interface UserPattern {
  /** Pattern type */
  type: 'workflow' | 'preference' | 'habit' | 'avoidance';
  /** Pattern description */
  description: string;
  /** How often this pattern occurs */
  frequency: number;
  /** Last time this pattern was observed */
  lastObserved: number;
  /** Confidence in this pattern (0-1) */
  confidence: number;
  /** Example commands or actions */
  examples: string[];
}

/** Workspace history entry */
export interface WorkspaceHistoryEntry {
  /** Workspace root path */
  workspacePath: string;
  /** Project name */
  projectName: string;
  /** When this workspace was last opened */
  lastOpenedAt: number;
  /** Total time spent in this workspace (ms) */
  totalSessionTime: number;
  /** Number of sessions */
  sessionCount: number;
  /** Active objectives at close */
  objectivesAtClose: string[];
  /** Unfinished tasks at close */
  unfinishedTasks: string[];
}

/** Session snapshot — saved when the app closes */
export interface SessionSnapshot {
  /** Unique session ID */
  sessionId: string;
  /** When this session started */
  startedAt: number;
  /** When this session ended */
  endedAt: number;
  /** Workspace root */
  workspaceRoot: string;
  /** Active objectives */
  objectives: ActiveObjective[];
  /** Unfinished tasks */
  unfinishedTasks: UnfinishedTask[];
  /** User patterns observed in this session */
  patterns: UserPattern[];
  /** Files that were open */
  openFiles: string[];
  /** Active file */
  activeFile: string | null;
  /** Last AI conversation summary */
  conversationSummary: string;
  /** Terminal commands run */
  commandCount: number;
  /** Execution nodes created */
  executionCount: number;
  /** Whether the session ended cleanly */
  cleanShutdown: boolean;
}

/** The full session memory state */
export interface SessionMemoryState {
  /** All active objectives across workspaces */
  objectives: ActiveObjective[];
  /** Unfinished tasks from last session */
  unfinishedTasks: UnfinishedTask[];
  /** Learned user patterns */
  patterns: UserPattern[];
  /** Workspace history */
  workspaceHistory: WorkspaceHistoryEntry[];
  /** Last session snapshot */
  lastSnapshot: SessionSnapshot | null;
  /** When the memory was last persisted */
  lastPersisted: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION MEMORY SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class SessionMemoryService extends EventEmitter {
  private state: SessionMemoryState;
  private persistPath: string;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly PERSIST_DELAY = 3000; // 3s debounce
  private readonly MAX_OBJECTIVES = 20;
  private readonly MAX_PATTERNS = 50;
  private readonly MAX_WORKSPACE_HISTORY = 20;

  constructor() {
    super();
    this.setMaxListeners(30);

    const vibecodeHome = process.env.VIBECODE_HOME ||
      path.join(os.homedir(), '.vibecode');
    this.persistPath = path.join(vibecodeHome, 'session-memory.json');

    this.state = {
      objectives: [],
      unfinishedTasks: [],
      patterns: [],
      workspaceHistory: [],
      lastSnapshot: null,
      lastPersisted: 0,
    };

    // Load persisted state
    this.load();
  }

  // ─── Objective Management ──────────────────────────────────────────────

  /** Add or update an active objective */
  trackObjective(description: string, relatedFiles?: string[]): ActiveObjective {
    // Check if this objective already exists
    const existing = this.state.objectives.find(
      o => o.status === 'active' && this.similarDescription(o.description, description)
    );

    if (existing) {
      existing.lastReferencedAt = Date.now();
      existing.relatedFiles = [...new Set([...existing.relatedFiles, ...(relatedFiles ?? [])])];
      this.schedulePersist();
      return existing;
    }

    const objective: ActiveObjective = {
      id: `obj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      description,
      createdAt: Date.now(),
      lastReferencedAt: Date.now(),
      status: 'active',
      notes: [],
      relatedFiles: relatedFiles ?? [],
      relatedPlanIds: [],
      progress: 0,
    };

    this.state.objectives.push(objective);
    this.enforceObjectiveLimit();
    this.schedulePersist();

    this.emit('objective:added', objective);
    return objective;
  }

  /** Update objective progress */
  updateObjectiveProgress(objectiveId: string, progress: number, note?: string): void {
    const objective = this.state.objectives.find(o => o.id === objectiveId);
    if (!objective) return;

    objective.progress = Math.max(0, Math.min(100, progress));
    objective.lastReferencedAt = Date.now();
    if (note) {
      objective.notes.push(note);
    }
    if (objective.progress >= 100) {
      objective.status = 'completed';
      this.emit('objective:completed', objective);
    }

    this.schedulePersist();
  }

  /** Mark an objective as blocked */
  blockObjective(objectiveId: string, reason: string): void {
    const objective = this.state.objectives.find(o => o.id === objectiveId);
    if (!objective) return;

    objective.status = 'blocked';
    objective.notes.push(`Blocked: ${reason}`);
    objective.lastReferencedAt = Date.now();
    this.schedulePersist();
  }

  /** Get active objectives */
  getActiveObjectives(): ActiveObjective[] {
    return this.state.objectives.filter(o => o.status === 'active');
  }

  // ─── Unfinished Task Tracking ──────────────────────────────────────────

  /** Track an unfinished task for session continuity */
  trackUnfinishedTask(
    description: string,
    context: string,
    activeFiles: string[],
    hadPendingPlan: boolean,
    planId?: string,
  ): UnfinishedTask {
    const task: UnfinishedTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      description,
      context,
      lastActiveAt: Date.now(),
      activeFiles,
      hadPendingPlan,
      planId,
    };

    this.state.unfinishedTasks.push(task);
    this.schedulePersist();

    return task;
  }

  /** Get unfinished tasks from last session */
  getUnfinishedTasks(): UnfinishedTask[] {
    return this.state.unfinishedTasks.filter(t => t.lastActiveAt > Date.now() - 7 * 24 * 60 * 60 * 1000);
  }

  /** Clear an unfinished task */
  clearUnfinishedTask(taskId: string): void {
    this.state.unfinishedTasks = this.state.unfinishedTasks.filter(t => t.id !== taskId);
    this.schedulePersist();
  }

  // ─── User Pattern Learning ─────────────────────────────────────────────

  /** Observe a user pattern */
  observePattern(type: UserPattern['type'], description: string, example?: string): void {
    const existing = this.state.patterns.find(
      p => p.type === type && this.similarDescription(p.description, description)
    );

    if (existing) {
      existing.frequency++;
      existing.lastObserved = Date.now();
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      if (example && existing.examples.length < 5) {
        existing.examples.push(example);
      }
    } else {
      const pattern: UserPattern = {
        type,
        description,
        frequency: 1,
        lastObserved: Date.now(),
        confidence: 0.3,
        examples: example ? [example] : [],
      };
      this.state.patterns.push(pattern);
      this.enforcePatternLimit();
    }

    this.schedulePersist();
  }

  /** Get learned patterns */
  getPatterns(type?: UserPattern['type']): UserPattern[] {
    if (type) {
      return this.state.patterns.filter(p => p.type === type);
    }
    return this.state.patterns.sort((a, b) => b.confidence - a.confidence);
  }

  /** Get preferences */
  getPreferences(): UserPattern[] {
    return this.state.patterns.filter(p => p.type === 'preference');
  }

  // ─── Workspace History ─────────────────────────────────────────────────

  /** Record a workspace session */
  recordWorkspaceSession(workspacePath: string, sessionDurationMs: number): void {
    const existing = this.state.workspaceHistory.find(w => w.workspacePath === workspacePath);

    if (existing) {
      existing.lastOpenedAt = Date.now();
      existing.totalSessionTime += sessionDurationMs;
      existing.sessionCount++;
      existing.projectName = path.basename(workspacePath);
    } else {
      const entry: WorkspaceHistoryEntry = {
        workspacePath,
        projectName: path.basename(workspacePath),
        lastOpenedAt: Date.now(),
        totalSessionTime: sessionDurationMs,
        sessionCount: 1,
        objectivesAtClose: [],
        unfinishedTasks: [],
      };
      this.state.workspaceHistory.push(entry);
      this.enforceWorkspaceHistoryLimit();
    }

    this.schedulePersist();
  }

  /** Get recent workspaces */
  getRecentWorkspaces(limit: number = 10): WorkspaceHistoryEntry[] {
    return this.state.workspaceHistory
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
      .slice(0, limit);
  }

  // ─── Session Snapshot ──────────────────────────────────────────────────

  /** Save a session snapshot — call on app shutdown */
  saveSnapshot(snapshot: SessionSnapshot): void {
    this.state.lastSnapshot = snapshot;

    // Update workspace history with objectives and tasks
    const wsEntry = this.state.workspaceHistory.find(
      w => w.workspacePath === snapshot.workspaceRoot
    );
    if (wsEntry) {
      wsEntry.objectivesAtClose = snapshot.objectives.map(o => o.description);
      wsEntry.unfinishedTasks = snapshot.unfinishedTasks.map(t => t.description);
    }

    this.schedulePersist();
  }

  /** Get the last session snapshot for continuity */
  getLastSnapshot(): SessionSnapshot | null {
    return this.state.lastSnapshot;
  }

  /** Generate a "resume context" prompt for AI */
  generateResumeContext(): string {
    const lines: string[] = [];

    // Unfinished tasks
    const unfinished = this.getUnfinishedTasks();
    if (unfinished.length > 0) {
      lines.push('### Unfinished Tasks from Last Session');
      for (const task of unfinished) {
        lines.push(`- ${task.description}`);
        if (task.context) lines.push(`  Context: ${task.context}`);
        if (task.activeFiles.length > 0) lines.push(`  Files: ${task.activeFiles.join(', ')}`);
      }
      lines.push('');
    }

    // Active objectives
    const objectives = this.getActiveObjectives();
    if (objectives.length > 0) {
      lines.push('### Active Objectives');
      for (const obj of objectives) {
        lines.push(`- ${obj.description} (${obj.progress}% complete)`);
      }
      lines.push('');
    }

    // Learned preferences
    const prefs = this.getPreferences();
    if (prefs.length > 0) {
      lines.push('### User Preferences');
      for (const pref of prefs) {
        lines.push(`- ${pref.description}`);
      }
      lines.push('');
    }

    // Last session summary
    if (this.state.lastSnapshot) {
      const snap = this.state.lastSnapshot;
      const timeAgo = this.formatTimeAgo(snap.endedAt);
      lines.push(`### Last Session (${timeAgo})`);
      if (snap.conversationSummary) {
        lines.push(snap.conversationSummary);
      }
      lines.push('');
    }

    return lines.length > 0 ? lines.join('\n') : 'No previous session context available.';
  }

  // ─── Persistence ───────────────────────────────────────────────────────

  private load(): void {
    try {
      if (!kernelFsExistsInternal(this.persistPath)) return;

      const data = JSON.parse(kernelFsReadSync(this.persistPath, 'utf-8'));
      this.state = {
        objectives: data.objectives ?? [],
        unfinishedTasks: data.unfinishedTasks ?? [],
        patterns: data.patterns ?? [],
        workspaceHistory: data.workspaceHistory ?? [],
        lastSnapshot: data.lastSnapshot ?? null,
        lastPersisted: data.lastPersisted ?? 0,
      };

      logger.info('session-memory', `Loaded: ${this.state.objectives.length} objectives, ${this.state.patterns.length} patterns`);
    } catch (err) {
      logger.warn('session-memory', `Failed to load: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private persist(): void {
    try {
      const dir = path.dirname(this.persistPath);
      if (!kernelFsExistsInternal(dir)) {
        kernelFsMkdirInternalSync(dir);
      }

      this.state.lastPersisted = Date.now();
      kernelFsWriteInternalSync(this.persistPath, JSON.stringify(this.state, null, 2), 'utf-8');

      logger.debug('session-memory', 'State persisted');
    } catch (err) {
      logger.error('session-memory', `Failed to persist: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persist();
      this.persistTimer = null;
    }, this.PERSIST_DELAY);
  }

  /** Force persist — call on app shutdown */
  flush(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.persist();
  }

  // ─── Utilities ─────────────────────────────────────────────────────────

  private similarDescription(a: string, b: string): boolean {
    // Simple similarity check — normalize and compare
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const na = normalize(a);
    const nb = normalize(b);

    // Exact match
    if (na === nb) return true;

    // One contains the other
    if (na.includes(nb) || nb.includes(na)) return true;

    // Check if they share significant words
    const wordsA = new Set(na.split(/\s+/).filter(w => w.length > 3));
    const wordsB = new Set(nb.split(/\s+/).filter(w => w.length > 3));
    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));

    if (wordsA.size > 0 && intersection.size / Math.min(wordsA.size, wordsB.size) > 0.6) {
      return true;
    }

    return false;
  }

  private enforceObjectiveLimit(): void {
    if (this.state.objectives.length > this.MAX_OBJECTIVES) {
      // Remove completed/abandoned objectives first
      this.state.objectives = this.state.objectives
        .filter(o => o.status === 'active' || o.status === 'blocked')
        .slice(0, this.MAX_OBJECTIVES);
    }
  }

  private enforcePatternLimit(): void {
    if (this.state.patterns.length > this.MAX_PATTERNS) {
      this.state.patterns = this.state.patterns
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, this.MAX_PATTERNS);
    }
  }

  private enforceWorkspaceHistoryLimit(): void {
    if (this.state.workspaceHistory.length > this.MAX_WORKSPACE_HISTORY) {
      this.state.workspaceHistory = this.state.workspaceHistory
        .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
        .slice(0, this.MAX_WORKSPACE_HISTORY);
    }
  }

  private formatTimeAgo(timestamp: number): string {
    const diffMs = Date.now() - timestamp;
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'just now';
  }

  /** Get the full state (for debugging/IPC) */
  getState(): SessionMemoryState {
    return { ...this.state };
  }
}

// ─── Module-level singleton ──────────────────────────────────────────────────

let sessionMemoryService: SessionMemoryService | null = null;

export function getSessionMemoryService(): SessionMemoryService {
  if (!sessionMemoryService) {
    sessionMemoryService = new SessionMemoryService();
  }
  return sessionMemoryService;
}
