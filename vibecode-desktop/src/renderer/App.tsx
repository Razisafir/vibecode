import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { LayoutState, SidebarTab, EnhancedSessionState } from './types';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Workspace from './components/Workspace';
import AIPanel from './components/AIPanel';
import CommandPalette from './components/CommandPalette';
import Onboarding from './components/Onboarding';
import CrashRecoveryModal from './components/CrashRecoveryModal';
import ResizeHandle from './components/ResizeHandle';
import ToastContainer from './components/ToastContainer';
import { useSessionRestore } from './hooks/useSessionRestore';
import { useFPSMonitor } from './hooks/useFPSMonitor';
import { useToast } from './hooks/useToast';

// ─── Panel Size Constraints ──────────────────────────────────────────────────

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 500;
const MIN_AI_PANEL_WIDTH = 300;
const MAX_AI_PANEL_WIDTH = 700;

// ─── Default Layout ──────────────────────────────────────────────────────────

const DEFAULT_LAYOUT: LayoutState = {
  sidebarOpen: true,
  sidebarWidth: 280,
  aiPanelOpen: true,
  aiPanelWidth: 400,
  activeSidebarTab: 'files',
};

// ─── localStorage Keys ───────────────────────────────────────────────────────

const LAYOUT_STORAGE_KEY = 'vibecode:layout-state';

function loadLayoutFromStorage(): LayoutState | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LayoutState;
      return {
        sidebarOpen: parsed.sidebarOpen ?? DEFAULT_LAYOUT.sidebarOpen,
        sidebarWidth: Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, parsed.sidebarWidth ?? DEFAULT_LAYOUT.sidebarWidth)),
        aiPanelOpen: parsed.aiPanelOpen ?? DEFAULT_LAYOUT.aiPanelOpen,
        aiPanelWidth: Math.max(MIN_AI_PANEL_WIDTH, Math.min(MAX_AI_PANEL_WIDTH, parsed.aiPanelWidth ?? DEFAULT_LAYOUT.aiPanelWidth)),
        activeSidebarTab: parsed.activeSidebarTab ?? DEFAULT_LAYOUT.activeSidebarTab,
      };
    }
  } catch {
    // localStorage not available
  }
  return null;
}

function saveLayoutToStorage(layout: LayoutState): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // localStorage not available
  }
}

// ─── App ─────────────────────────────────────────────────────────────────────

function App() {
  const [layout, setLayout] = useState<LayoutState>(() => {
    return loadLayoutFromStorage() ?? DEFAULT_LAYOUT;
  });
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteMode, setCommandPaletteMode] = useState<'commands' | 'files'>('commands');
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showRestoreToast, setShowRestoreToast] = useState(false);
  const autoSaveStartedRef = useRef(false);

  // Toast system
  const { toasts, showToast, dismiss: dismissToast } = useToast();

  // Session restore hook
  const {
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
  } = useSessionRestore();

  // FPS monitoring — sends heartbeat to main process every 5 seconds
  useFPSMonitor({
    reportIntervalMs: 5000,
    freezeThreshold: 5,
    freezeDurationMs: 2000,
  });

  // Check for first launch on mount
  useEffect(() => {
    const checkFirstLaunch = async () => {
      try {
        const hasCompletedOnboarding = localStorage.getItem('vibecode:onboarding-complete');
        if (!hasCompletedOnboarding) {
          setOnboardingVisible(true);
        }
      } catch {
        // localStorage may not be available in some contexts
      }
      setIsInitialized(true);
    };
    checkFirstLaunch();
  }, []);

  // Apply restored session state when available (non-crash, normal restore)
  useEffect(() => {
    if (!isRestoring && restoredState && !hasCrashedSession) {
      // Apply layout from restored state
      if (restoredState.layout) {
        const restoredLayout: LayoutState = {
          sidebarOpen: restoredState.layout.sidebarOpen,
          sidebarWidth: Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, restoredState.layout.sidebarWidth)),
          aiPanelOpen: restoredState.layout.aiPanelOpen,
          aiPanelWidth: Math.max(MIN_AI_PANEL_WIDTH, Math.min(MAX_AI_PANEL_WIDTH, restoredState.layout.aiPanelWidth)),
          activeSidebarTab: restoredState.layout.activeSidebarTab as SidebarTab,
        };
        setLayout(restoredLayout);
      }

      // Start auto-save for this session
      if (!autoSaveStartedRef.current && currentSessionId) {
        startAutoSave(restoredState);
        autoSaveStartedRef.current = true;
      }

      // Show restored toast briefly
      setShowRestoreToast(true);
      const toastTimer = setTimeout(() => setShowRestoreToast(false), 3000);

      return () => clearTimeout(toastTimer);
    }
  }, [isRestoring, restoredState, hasCrashedSession, currentSessionId, startAutoSave]);

  // Persist layout to localStorage on every change
  useEffect(() => {
    saveLayoutToStorage(layout);
  }, [layout]);

  // Save layout changes to session
  const saveLayoutToSession = useCallback((newLayout: LayoutState) => {
    if (!restoredState) return;

    const updated: EnhancedSessionState = {
      ...restoredState,
      layout: {
        ...restoredState.layout,
        sidebarOpen: newLayout.sidebarOpen,
        sidebarWidth: newLayout.sidebarWidth,
        aiPanelOpen: newLayout.aiPanelOpen,
        aiPanelWidth: newLayout.aiPanelWidth,
        activeSidebarTab: newLayout.activeSidebarTab,
      },
    };

    saveCurrentState(updated).catch(() => {
      // Best-effort save
    });
  }, [restoredState, saveCurrentState]);

  // ─── Resize Handlers ─────────────────────────────────────────────────────

  const handleSidebarResize = useCallback((delta: number) => {
    setLayout((prev) => {
      const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, prev.sidebarWidth + delta));
      const newLayout = { ...prev, sidebarWidth: newWidth };
      saveLayoutToSession(newLayout);
      return newLayout;
    });
  }, [saveLayoutToSession]);

  const handleAIPanelResize = useCallback((delta: number) => {
    setLayout((prev) => {
      const newWidth = Math.max(MIN_AI_PANEL_WIDTH, Math.min(MAX_AI_PANEL_WIDTH, prev.aiPanelWidth + delta));
      const newLayout = { ...prev, aiPanelWidth: newWidth };
      saveLayoutToSession(newLayout);
      return newLayout;
    });
  }, [saveLayoutToSession]);

  // ─── Keyboard Shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      const isShift = e.shiftKey;

      // Cmd/Ctrl+K: Command palette
      if (isMod && e.key === 'k' && !isShift) {
        e.preventDefault();
        setCommandPaletteMode('commands');
        setCommandPaletteOpen((prev) => !prev);
      }

      // Cmd/Ctrl+Shift+P: Command palette in command mode
      if (isMod && isShift && e.key === 'P') {
        e.preventDefault();
        setCommandPaletteMode('commands');
        setCommandPaletteOpen(true);
      }

      // Cmd/Ctrl+P: Quick file search (opens command palette in file mode)
      if (isMod && e.key === 'p' && !isShift) {
        e.preventDefault();
        setCommandPaletteMode('files');
        setCommandPaletteOpen(true);
      }

      // Cmd/Ctrl+S: Save current file
      if (isMod && e.key === 's' && !isShift) {
        e.preventDefault();
        // Dispatch custom event for Workspace to pick up
        window.dispatchEvent(new CustomEvent('vibecode:save-file'));
        showToast('File saved', 'success');
      }

      // Cmd/Ctrl+Shift+S: Save all
      if (isMod && isShift && e.key === 'S') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('vibecode:save-all'));
        showToast('All files saved', 'success');
      }

      // Cmd/Ctrl+L: Focus AI panel
      if (isMod && e.key === 'l' && !isShift) {
        e.preventDefault();
        setLayout((prev) => ({
          ...prev,
          aiPanelOpen: true,
        }));
        // Focus the AI input after a tick to ensure panel is open
        setTimeout(() => {
          const aiInput = document.querySelector<HTMLTextAreaElement>('[data-ai-input]');
          aiInput?.focus();
        }, 200);
      }

      // Cmd/Ctrl+B: Toggle sidebar
      if (isMod && e.key === 'b' && !isShift) {
        e.preventDefault();
        setLayout((prev) => {
          const newLayout = { ...prev, sidebarOpen: !prev.sidebarOpen };
          saveLayoutToSession(newLayout);
          return newLayout;
        });
      }

      // Cmd/Ctrl+J: Toggle AI panel
      if (isMod && e.key === 'j' && !isShift) {
        e.preventDefault();
        setLayout((prev) => {
          const newLayout = { ...prev, aiPanelOpen: !prev.aiPanelOpen };
          saveLayoutToSession(newLayout);
          return newLayout;
        });
      }

      // Cmd/Ctrl+.: Toggle terminal panel
      if (isMod && e.key === '.') {
        e.preventDefault();
        setLayout((prev) => {
          const newLayout: LayoutState = {
            ...prev,
            activeSidebarTab: 'terminal' as SidebarTab,
            sidebarOpen: prev.activeSidebarTab === 'terminal' ? !prev.sidebarOpen : true,
          };
          saveLayoutToSession(newLayout);
          return newLayout;
        });
      }

      // Cmd/Ctrl+Shift+M: Toggle memory panel
      if (isMod && isShift && e.key === 'M') {
        e.preventDefault();
        setLayout((prev) => {
          const newLayout: LayoutState = {
            ...prev,
            activeSidebarTab: 'memory' as SidebarTab,
            sidebarOpen: prev.activeSidebarTab === 'memory' ? !prev.sidebarOpen : true,
          };
          saveLayoutToSession(newLayout);
          return newLayout;
        });
      }

      // Cmd/Ctrl+Enter: Send AI message (when AI panel focused)
      if (isMod && e.key === 'Enter') {
        const aiInput = document.querySelector<HTMLTextAreaElement>('[data-ai-input]');
        if (document.activeElement === aiInput) {
          e.preventDefault();
          // Trigger send by dispatching an event
          aiInput?.dispatchEvent(new CustomEvent('vibecode:ai-send'));
        }
      }

      // Escape: Close command palette
      if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, saveLayoutToSession, showToast]);

  // ─── Toggle Handlers ──────────────────────────────────────────────────────

  const handleToggleSidebar = useCallback(() => {
    setLayout((prev) => {
      const newLayout = { ...prev, sidebarOpen: !prev.sidebarOpen };
      saveLayoutToSession(newLayout);
      return newLayout;
    });
  }, [saveLayoutToSession]);

  const handleToggleAIPanel = useCallback(() => {
    setLayout((prev) => {
      const newLayout = { ...prev, aiPanelOpen: !prev.aiPanelOpen };
      saveLayoutToSession(newLayout);
      return newLayout;
    });
  }, [saveLayoutToSession]);

  const handleSidebarTabChange = useCallback((tab: SidebarTab) => {
    setLayout((prev) => {
      const newLayout = {
        ...prev,
        activeSidebarTab: tab,
        sidebarOpen: true,
      };
      saveLayoutToSession(newLayout);
      return newLayout;
    });
  }, [saveLayoutToSession]);

  const handleOnboardingComplete = useCallback(() => {
    setOnboardingVisible(false);
    try {
      localStorage.setItem('vibecode:onboarding-complete', 'true');
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleOnboardingSkip = useCallback(() => {
    setOnboardingVisible(false);
    try {
      localStorage.setItem('vibecode:onboarding-complete', 'true');
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Handle crash recovery restore
  const handleCrashRestore = useCallback(async () => {
    const state = await restoreSession();
    if (state?.layout) {
      setLayout({
        sidebarOpen: state.layout.sidebarOpen,
        sidebarWidth: Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, state.layout.sidebarWidth)),
        aiPanelOpen: state.layout.aiPanelOpen,
        aiPanelWidth: Math.max(MIN_AI_PANEL_WIDTH, Math.min(MAX_AI_PANEL_WIDTH, state.layout.aiPanelWidth)),
        activeSidebarTab: state.layout.activeSidebarTab as SidebarTab,
      });

      // Start auto-save for restored session
      startAutoSave(state);
      autoSaveStartedRef.current = true;
    }
    showToast('Session restored', 'success');
  }, [restoreSession, startAutoSave, showToast]);

  // Handle crash recovery dismiss — start fresh
  const handleCrashStartFresh = useCallback(async () => {
    await dismissCrashRecovery();

    // Create a new enhanced session
    try {
      if (window.vibecode?.session) {
        const newSession = await window.vibecode.session.createEnhanced('default');
        startAutoSave(newSession);
        autoSaveStartedRef.current = true;
      }
    } catch {
      // Best-effort
    }
  }, [dismissCrashRecovery, startAutoSave]);

  // Cleanup auto-save on unmount
  useEffect(() => {
    return () => {
      if (currentSessionId) {
        stopAutoSave(currentSessionId);
      }
    };
  }, [currentSessionId, stopAutoSave]);

  if (!isInitialized || isRestoring) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <div className="spinner spinner-lg" />
          <p className="text-sm text-text-tertiary">
            {isRestoring ? 'Restoring session...' : 'Loading VibeCode...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-bg-primary text-text-primary">
      {/* Custom Title Bar */}
      <TitleBar
        onToggleSidebar={handleToggleSidebar}
        onToggleAIPanel={handleToggleAIPanel}
        sidebarOpen={layout.sidebarOpen}
        aiPanelOpen={layout.aiPanelOpen}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        {layout.sidebarOpen && (
          <>
            <Sidebar
              isOpen={layout.sidebarOpen}
              activeTab={layout.activeSidebarTab}
              onTabChange={handleSidebarTabChange}
              onToggle={handleToggleSidebar}
              width={layout.sidebarWidth}
            />
            <ResizeHandle side="right" onResize={handleSidebarResize} />
          </>
        )}

        {!layout.sidebarOpen && (
          <Sidebar
            isOpen={layout.sidebarOpen}
            activeTab={layout.activeSidebarTab}
            onTabChange={handleSidebarTabChange}
            onToggle={handleToggleSidebar}
            width={layout.sidebarWidth}
          />
        )}

        {/* Center Workspace */}
        <Workspace className="flex-1" />

        {/* Right AI Panel */}
        {layout.aiPanelOpen && (
          <>
            <ResizeHandle side="left" onResize={handleAIPanelResize} />
            <AIPanel
              isOpen={layout.aiPanelOpen}
              onToggle={handleToggleAIPanel}
              width={layout.aiPanelWidth}
            />
          </>
        )}

        {!layout.aiPanelOpen && (
          <AIPanel
            isOpen={layout.aiPanelOpen}
            onToggle={handleToggleAIPanel}
            width={layout.aiPanelWidth}
          />
        )}
      </div>

      {/* Command Palette */}
      {commandPaletteOpen && (
        <CommandPalette
          onClose={() => setCommandPaletteOpen(false)}
          onToggleSidebar={handleToggleSidebar}
          onToggleAIPanel={handleToggleAIPanel}
          onTabChange={handleSidebarTabChange}
          sidebarOpen={layout.sidebarOpen}
          aiPanelOpen={layout.aiPanelOpen}
        />
      )}

      {/* Onboarding Overlay */}
      {onboardingVisible && (
        <Onboarding
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}

      {/* Crash Recovery Modal */}
      {hasCrashedSession && (
        <CrashRecoveryModal
          crashInfo={crashInfo}
          onRestore={handleCrashRestore}
          onStartFresh={handleCrashStartFresh}
        />
      )}

      {/* Session Restored Toast (legacy inline) */}
      {showRestoreToast && (
        <div className="fixed bottom-4 left-4 z-50 animate-slide-up">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-secondary px-4 py-3 shadow-lg">
            <svg
              className="h-5 w-5 text-success"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-sm text-text-primary">
              Session restored
            </span>
          </div>
        </div>
      )}

      {/* Toast Notification System */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
