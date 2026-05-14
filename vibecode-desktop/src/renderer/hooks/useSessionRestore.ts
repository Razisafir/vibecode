import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  EnhancedSessionState,
  RecoveryInfo,
  CrashInfo,
} from '../types';

const AUTO_SAVE_INTERVAL = 30_000;
const WORKSPACE_SAVE_INTERVAL = 10_000;

export interface UseSessionRestoreReturn {
  isRestoring: boolean;
  hasCrashedSession: boolean;
  restoredState: EnhancedSessionState | null;
  crashInfo: CrashInfo | null;
  restoreSession: (sessionId?: string) => Promise<EnhancedSessionState | null>;
  dismissCrashRecovery: () => void;
  saveCurrentState: (state: EnhancedSessionState) => Promise<void>;
  startAutoSave: (state: EnhancedSessionState, interval?: number) => void;
  stopAutoSave: (sessionId: string) => void;
  currentSessionId: string | null;
}

/**
 * Hook that handles restoring the full app state on startup.
 *
 * On mount, checks if there's a crashed session and if so, offers recovery.
 * If normal, restores the latest session state.
 * After restoration, updates all relevant React state.
 */
export function useSessionRestore(): UseSessionRestoreReturn {
  const [isRestoring, setIsRestoring] = useState(true);
  const [hasCrashedSession, setHasCrashedSession] = useState(false);
  const [restoredState, setRestoredState] = useState<EnhancedSessionState | null>(null);
  const [crashInfo, setCrashInfo] = useState<CrashInfo | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const workspaceSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentStateRef = useRef<EnhancedSessionState | null>(null);

  // Check for crashed sessions on mount
  useEffect(() => {
    const checkForCrash = async () => {
      setIsRestoring(true);
      try {
        if (!window.vibecode?.session) {
          setIsRestoring(false);
          return;
        }

        const recoveryInfo: RecoveryInfo = await window.vibecode.session.getRecoveryInfo();

        if (recoveryInfo.hasCrashedSession && recoveryInfo.crashInfo) {
          setHasCrashedSession(true);
          setCrashInfo(recoveryInfo.crashInfo);
          console.log('[SessionRestore] Crashed session detected:', recoveryInfo.crashInfo);
        } else if (recoveryInfo.sessionId) {
          // Normal startup — restore latest session
          const state = await window.vibecode.session.restoreEnhanced(recoveryInfo.sessionId);
          if (state) {
            setRestoredState(state);
            setCurrentSessionId(state.id);
            currentStateRef.current = state;
          }
        }
      } catch (err) {
        console.error('[SessionRestore] Failed to check crash status:', err);
      } finally {
        setIsRestoring(false);
      }
    };

    checkForCrash();
  }, []);

  // Save on beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentStateRef.current && window.vibecode?.session) {
        // Synchronous save attempt via IPC send (fire-and-forget)
        try {
          window.vibecode.session.saveEnhanced(currentStateRef.current);
        } catch {
          // Best-effort
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  /**
   * Restore a session by ID, or the latest if no ID provided.
   * After restoring, applies the state to all relevant React state.
   */
  const restoreSession = useCallback(async (sessionId?: string): Promise<EnhancedSessionState | null> => {
    setIsRestoring(true);
    try {
      if (!window.vibecode?.session) return null;

      let state: EnhancedSessionState | null = null;

      if (sessionId) {
        state = await window.vibecode.session.restoreEnhanced(sessionId);
      } else {
        // Try to get the recovery session (latest or crashed)
        state = await window.vibecode.session.getRecoverySession();
      }

      if (state) {
        setRestoredState(state);
        setCurrentSessionId(state.id);
        currentStateRef.current = state;

        // Mark that this session is now clean (we're restoring it)
        await window.vibecode.session.updateEnhancedState({
          ...state,
          recovery: {
            ...state.recovery,
            lastCrashed: false,
            safeShutdown: false, // Will be set to true on next clean shutdown
          },
        });
      }

      return state;
    } catch (err) {
      console.error('[SessionRestore] Failed to restore session:', err);
      return null;
    } finally {
      setIsRestoring(false);
    }
  }, []);

  /** Dismiss crash recovery — archive the crashed session and start fresh */
  const dismissCrashRecovery = useCallback(async () => {
    setHasCrashedSession(false);
    setCrashInfo(null);

    if (crashInfo?.sessionId && window.vibecode?.session) {
      try {
        await window.vibecode.session.archiveCrashedSession(crashInfo.sessionId);
      } catch (err) {
        console.error('[SessionRestore] Failed to archive crashed session:', err);
      }
    }
  }, [crashInfo]);

  /** Save the current enhanced state */
  const saveCurrentState = useCallback(async (state: EnhancedSessionState): Promise<void> => {
    try {
      currentStateRef.current = state;
      if (window.vibecode?.session) {
        await window.vibecode.session.saveEnhanced(state);
        await window.vibecode.session.updateEnhancedState(state);
      }
    } catch (err) {
      console.error('[SessionRestore] Failed to save state:', err);
    }
  }, []);

  /** Start auto-saving at the given interval */
  const startAutoSave = useCallback((state: EnhancedSessionState, interval?: number) => {
    const saveInterval = interval ?? AUTO_SAVE_INTERVAL;

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
    }

    currentStateRef.current = state;

    autoSaveTimerRef.current = setInterval(async () => {
      if (currentStateRef.current && window.vibecode?.session) {
        try {
          await window.vibecode.session.saveEnhanced(currentStateRef.current);
        } catch (err) {
          console.error('[SessionRestore] Auto-save failed:', err);
        }
      }
    }, saveInterval);

    // Start workspace-specific save (more frequent)
    if (workspaceSaveTimerRef.current) {
      clearInterval(workspaceSaveTimerRef.current);
    }

    workspaceSaveTimerRef.current = setInterval(async () => {
      if (currentStateRef.current && window.vibecode?.session) {
        try {
          await window.vibecode.session.updateEnhancedState(currentStateRef.current);
        } catch (_err) {
          // Workspace save is best-effort
        }
      }
    }, WORKSPACE_SAVE_INTERVAL);
  }, []);

  /** Stop auto-save */
  const stopAutoSave = useCallback((sessionId: string) => {
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (workspaceSaveTimerRef.current) {
      clearInterval(workspaceSaveTimerRef.current);
      workspaceSaveTimerRef.current = null;
    }

    if (window.vibecode?.session) {
      window.vibecode.session.stopAutoSaveEnhanced(sessionId).catch(() => {});
    }
  }, []);

  return {
    isRestoring,
    hasCrashedSession,
    restoredState,
    crashInfo,
    restoreSession,
    dismissCrashRecovery,
    saveCurrentState,
    startAutoSave,
    stopAutoSave,
    currentSessionId,
  };
}
