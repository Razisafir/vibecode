import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { LayoutState, SidebarTab, EnhancedSessionState } from './types';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Workspace from './components/Workspace';
import AIPanel from './components/AIPanel';
import CommandPalette from './components/CommandPalette';
import Onboarding from './components/Onboarding';
import CrashRecoveryModal from './components/CrashRecoveryModal';
import { useSessionRestore } from './hooks/useSessionRestore';

const DEFAULT_LAYOUT: LayoutState = {
  sidebarOpen: true,
  sidebarWidth: 280,
  aiPanelOpen: true,
  aiPanelWidth: 400,
  activeSidebarTab: 'files',
};

function App() {
  const [layout, setLayout] = useState<LayoutState>(DEFAULT_LAYOUT);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showRestoreToast, setShowRestoreToast] = useState(false);
  const autoSaveStartedRef = useRef(false);

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
          sidebarWidth: restoredState.layout.sidebarWidth,
          aiPanelOpen: restoredState.layout.aiPanelOpen,
          aiPanelWidth: restoredState.layout.aiPanelWidth,
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+K: Command palette
      if (isMod && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }

      // Cmd/Ctrl+L: Focus AI panel
      if (isMod && e.key === 'l') {
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
      if (isMod && e.key === 'b') {
        e.preventDefault();
        setLayout((prev) => {
          const newLayout = { ...prev, sidebarOpen: !prev.sidebarOpen };
          saveLayoutToSession(newLayout);
          return newLayout;
        });
      }

      // Cmd/Ctrl+J: Toggle AI panel
      if (isMod && e.key === 'j') {
        e.preventDefault();
        setLayout((prev) => {
          const newLayout = { ...prev, aiPanelOpen: !prev.aiPanelOpen };
          saveLayoutToSession(newLayout);
          return newLayout;
        });
      }

      // Escape: Close command palette
      if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, saveLayoutToSession]);

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
        sidebarWidth: state.layout.sidebarWidth,
        aiPanelOpen: state.layout.aiPanelOpen,
        aiPanelWidth: state.layout.aiPanelWidth,
        activeSidebarTab: state.layout.activeSidebarTab as SidebarTab,
      });

      // Start auto-save for restored session
      startAutoSave(state);
      autoSaveStartedRef.current = true;
    }
    setShowRestoreToast(true);
    setTimeout(() => setShowRestoreToast(false), 4000);
  }, [restoreSession, startAutoSave]);

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
        <div className="flex flex-col items-center gap-3">
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
        <Sidebar
          isOpen={layout.sidebarOpen}
          activeTab={layout.activeSidebarTab}
          onTabChange={handleSidebarTabChange}
          onToggle={handleToggleSidebar}
        />

        {/* Center Workspace */}
        <Workspace className="flex-1" />

        {/* Right AI Panel */}
        <AIPanel
          isOpen={layout.aiPanelOpen}
          onToggle={handleToggleAIPanel}
        />
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

      {/* Session Restored Toast */}
      {showRestoreToast && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
          <div className="flex items-center gap-2 rounded-lg border border-border-primary bg-bg-secondary px-4 py-3 shadow-lg">
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
    </div>
  );
}

export default App;
