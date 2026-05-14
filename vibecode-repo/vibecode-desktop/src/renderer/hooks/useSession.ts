import { useState, useEffect, useCallback, useRef } from 'react';
import type { SessionState, LayoutState, ChatMessage } from '../types';

const SESSION_KEY = 'vibecode:session';
const AUTO_SAVE_INTERVAL = 30000; // 30 seconds
const SESSION_ID_PREFIX = 'session';

const generateSessionId = (): string =>
  `${SESSION_ID_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

interface UseSessionReturn {
  sessionId: string;
  sessionState: SessionState | null;
  isSaving: boolean;
  isRestoring: boolean;
  saveSession: () => Promise<void>;
  restoreSession: (id?: string) => Promise<SessionState | null>;
  updateLayout: (layout: Partial<LayoutState>) => void;
  updateOpenFiles: (files: string[], activeFile?: string) => void;
  updateConversation: (messages: ChatMessage[], provider: string, model: string) => void;
  getLastSession: () => Promise<SessionState | null>;
}

export function useSession(): UseSessionReturn {
  const [sessionId, setSessionId] = useState<string>(generateSessionId());
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize session on mount
  useEffect(() => {
    const initSession = async () => {
      setIsRestoring(true);
      try {
        const restored = await restoreSessionInternal();
        if (restored) {
          setSessionState(restored);
          setSessionId(restored.id);
        } else {
          // Create a new default session
          const defaultSession = createDefaultSession();
          setSessionState(defaultSession);
        }
      } catch {
        const defaultSession = createDefaultSession();
        setSessionState(defaultSession);
      } finally {
        setIsRestoring(false);
      }
    };

    initSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save interval
  useEffect(() => {
    autoSaveTimerRef.current = setInterval(() => {
      saveSessionInternal();
    }, AUTO_SAVE_INTERVAL);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState]);

  // Save on beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveSessionInternal();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const createDefaultSession = (): SessionState => ({
    id: sessionId,
    projectId: 'default',
    workspace: {
      openFiles: [],
      scrollPositions: {},
    },
    conversation: {
      messages: [],
      activeProvider: 'openai',
      activeModel: 'gpt-4o',
    },
    execution: {
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
    lastSaved: Date.now(),
    createdAt: Date.now(),
  });

  const saveSessionInternal = useCallback(async () => {
    if (!sessionState) return;

    setIsSaving(true);
    try {
      const updatedState: SessionState = {
        ...sessionState,
        lastSaved: Date.now(),
      };

      // Try IPC first
      if (window.vibecode?.session) {
        await window.vibecode.session.save(updatedState);
      }

      // Also save to localStorage as backup
      try {
        localStorage.setItem(
          `${SESSION_KEY}:${sessionId}`,
          JSON.stringify(updatedState),
        );
      } catch {
        // localStorage may be full or unavailable
      }

      setSessionState(updatedState);
    } catch {
      // Save failed silently (auto-save is best-effort)
    } finally {
      setIsSaving(false);
    }
  }, [sessionState, sessionId]);

  const restoreSessionInternal = useCallback(async (): Promise<SessionState | null> => {
    // Try IPC first
    try {
      if (window.vibecode?.session) {
        const latest = await window.vibecode.session.getLatest('default');
        if (latest) return latest;
      }
    } catch {
      // IPC restore failed
    }

    // Fallback to localStorage
    try {
      const keys = Object.keys(localStorage).filter((k) =>
        k.startsWith(SESSION_KEY),
      );
      if (keys.length === 0) return null;

      // Find most recent session
      let latestSession: SessionState | null = null;
      let latestTimestamp = 0;

      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const session: SessionState = JSON.parse(raw);
          if (session.lastSaved > latestTimestamp) {
            latestTimestamp = session.lastSaved;
            latestSession = session;
          }
        } catch {
          // Invalid JSON, skip
        }
      }

      return latestSession;
    } catch {
      return null;
    }
  }, []);

  const saveSession = useCallback(async () => {
    await saveSessionInternal();
  }, [saveSessionInternal]);

  const restoreSession = useCallback(
    async (id?: string): Promise<SessionState | null> => {
      setIsRestoring(true);
      try {
        if (id && window.vibecode?.session) {
          const restored = await window.vibecode.session.restore(id);
          if (restored) {
            setSessionState(restored);
            setSessionId(restored.id);
            return restored;
          }
        }

        const restored = await restoreSessionInternal();
        if (restored) {
          setSessionState(restored);
          setSessionId(restored.id);
        }
        return restored;
      } finally {
        setIsRestoring(false);
      }
    },
    [restoreSessionInternal],
  );

  const updateLayout = useCallback((layout: Partial<LayoutState>) => {
    setSessionState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        layout: { ...prev.layout, ...layout },
      };
    });
  }, []);

  const updateOpenFiles = useCallback(
    (files: string[], activeFile?: string) => {
      setSessionState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          workspace: {
            ...prev.workspace,
            openFiles: files,
            activeFile,
          },
        };
      });
    },
    [],
  );

  const updateConversation = useCallback(
    (messages: ChatMessage[], provider: string, model: string) => {
      setSessionState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          conversation: {
            messages,
            activeProvider: provider,
            activeModel: model,
          },
        };
      });
    },
    [],
  );

  const getLastSession = useCallback(async (): Promise<SessionState | null> => {
    return restoreSessionInternal();
  }, [restoreSessionInternal]);

  return {
    sessionId,
    sessionState,
    isSaving,
    isRestoring,
    saveSession,
    restoreSession,
    updateLayout,
    updateOpenFiles,
    updateConversation,
    getLastSession,
  };
}
