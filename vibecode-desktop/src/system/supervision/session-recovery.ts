// ─── Session Recovery ─────────────────────────────────────────────────────
// Extracted recovery methods from SessionManager during Phase 2 refactoring.
// Only recovery-related methods are extracted; CRUD methods remain in
// src/main/services/session-manager.ts.
//
// Conversion: class methods → standalone functions.
// Internal state (crash flag file paths, etc.) → module-level variables.
// ─────────────────────────────────────────────────────────────────────────────

import {
  kernelFsExistsInternal,
  kernelFsReadSync,
  kernelFsReaddirInternalSync,
  kernelFsRenameInternalSync,
  kernelFsDeleteInternalSync,
  kernelFsMkdirInternalSync,
  kernelFsWriteInternalSync,
} from '../../main/kernel/kernel-fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

// ─── Re-exported Types (from session-manager) ──────────────────────────────

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
    activePlans: Array<{
      planId: string;
      status: string;
      currentStepIndex: number;
      startedAt: number;
    }>;
    recentPlans: Array<{
      planId: string;
      title: string;
      status: string;
      completedAt?: number;
    }>;
    proposalQueue: string[];
  };

  // AI Conversation persistence
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

  // Enhanced layout state
  layout: {
    sidebarOpen: boolean;
    sidebarWidth: number;
    aiPanelOpen: boolean;
    aiPanelWidth: number;
    activeSidebarTab: string;
    workspacePanel?: 'editor' | 'terminal' | 'welcome';
  };

  // Enhanced workspace details
  workspace: {
    rootPath: string;
    openFiles: string[];
    activeFile?: string;
    scrollPositions: Record<string, number>;
    expandedFolders: string[];
    recentFiles: string[];
  };

  // Recovery metadata
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

// ─── Module-level State ────────────────────────────────────────────────────

const baseDir: string = path.join(os.homedir(), VIBECODE_DIR, SESSIONS_DIR);

// Ensure base directory exists on module load
if (!kernelFsExistsInternal(baseDir)) {
  try {
    kernelFsMkdirInternalSync(baseDir);
  } catch {
    // Directory may already exist from another initialization
  }
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function getFilePath(sessionId: string): string {
  return path.join(baseDir, `${sessionId}${FILE_EXTENSION}`);
}

function ensureDirectoryExists(dirPath: string): void {
  if (!kernelFsExistsInternal(dirPath)) {
    kernelFsMkdirInternalSync(dirPath);
  }
}

/**
 * Atomic write: write to a temp file first, then rename.
 * Prevents corruption if the process crashes mid-write.
 */
function writeAtomic(filePath: string, content: string): void {
  const tempPath = filePath + TEMP_EXTENSION;

  try {
    kernelFsWriteInternalSync(tempPath, content, 'utf-8');
    kernelFsRenameInternalSync(tempPath, filePath);
  } catch (err) {
    try {
      if (kernelFsExistsInternal(tempPath)) {
        kernelFsDeleteInternalSync(tempPath);
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
function migrateToEnhanced(raw: Record<string, unknown>): EnhancedSessionState {
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

/** Get the latest enhanced session across all projects */
function getLatestEnhanced(): EnhancedSessionState | null {
  if (!kernelFsExistsInternal(baseDir)) return null;

  const files = kernelFsReaddirInternalSync(baseDir).filter((f) => f.endsWith(FILE_EXTENSION));
  if (files.length === 0) return null;

  let latest: EnhancedSessionState | null = null;
  let latestTime = 0;

  for (const file of files) {
    const filePath = path.join(baseDir, file);
    try {
      const raw = kernelFsReadSync(filePath);
      const parsed = JSON.parse(raw);
      if (parsed.lastSaved > latestTime) {
        latestTime = parsed.lastSaved;
        latest = migrateToEnhanced(parsed);
      }
    } catch {
      // Skip corrupted files
    }
  }

  return latest;
}

/** Save the full enhanced session state to disk (atomic write) */
function saveEnhanced(state: EnhancedSessionState): void {
  const trimmedState: EnhancedSessionState = {
    ...state,
    conversation: {
      ...state.conversation,
      messages: state.conversation.messages.slice(-MAX_CONVERSATION_MESSAGES),
    },
    lastSaved: Date.now(),
  };

  const filePath = getFilePath(trimmedState.id);
  try {
    writeAtomic(filePath, JSON.stringify(trimmedState, null, 2));
  } catch (err) {
    console.error(`[SessionRecovery] Failed to save enhanced session ${trimmedState.id}:`, err);
    throw err;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Check if the last session crashed */
export function wasCrashed(): boolean {
  const latest = getLatestEnhanced();
  if (!latest) return false;
  return latest.recovery?.safeShutdown === false;
}

/** Mark that a crash occurred (called from main process crash handler) */
export function markCrash(reason: string): void {
  const latest = getLatestEnhanced();
  if (!latest) {
    console.warn('[SessionRecovery] No session to mark as crashed');
    return;
  }

  latest.recovery = {
    lastCrashed: true,
    crashCount: (latest.recovery?.crashCount ?? 0) + 1,
    lastCrashReason: reason,
    safeShutdown: false,
  };

  saveEnhanced(latest);
  console.log(`[SessionRecovery] Session ${latest.id} marked as crashed: ${reason}`);
}

/** Mark that the app shut down cleanly */
export function markSafeShutdown(): void {
  const latest = getLatestEnhanced();
  if (!latest) return;

  latest.recovery = {
    ...latest.recovery,
    lastCrashed: false,
    safeShutdown: true,
  };

  saveEnhanced(latest);
  console.log(`[SessionRecovery] Session ${latest.id} marked as safe shutdown`);
}

/** Get the session to recover (latest, or the crashed one) */
export function getRecoverySession(): EnhancedSessionState | null {
  return getLatestEnhanced();
}

/** Get recovery info for the UI */
export function getRecoveryInfo(): RecoveryInfo {
  const latest = getLatestEnhanced();
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

/** Archive a crashed session (rename with .archived suffix) */
export function archiveCrashedSession(sessionId: string): boolean {
  const filePath = getFilePath(sessionId);
  if (!kernelFsExistsInternal(filePath)) return false;

  try {
    const archivePath = getFilePath(`${sessionId}.archived-${Date.now()}`);
    kernelFsRenameInternalSync(filePath, archivePath);
    console.log(`[SessionRecovery] Archived crashed session ${sessionId}`);
    return true;
  } catch (err) {
    console.error(`[SessionRecovery] Failed to archive session ${sessionId}:`, err);
    return false;
  }
}
