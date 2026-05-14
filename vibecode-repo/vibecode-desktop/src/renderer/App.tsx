import React, { useState, useEffect, useCallback } from 'react';
import type { LayoutState, SidebarTab } from './types';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Workspace from './components/Workspace';
import AIPanel from './components/AIPanel';
import CommandPalette from './components/CommandPalette';
import Onboarding from './components/Onboarding';

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

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        if (window.vibecode?.session) {
          const latestSession = await window.vibecode.session.getLatest('default');
          if (latestSession?.layout) {
            setLayout(latestSession.layout);
          }
        }
      } catch {
        // Session restore is best-effort
      }
    };
    restoreSession();
  }, []);

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
        setLayout((prev) => ({
          ...prev,
          sidebarOpen: !prev.sidebarOpen,
        }));
      }

      // Cmd/Ctrl+J: Toggle AI panel
      if (isMod && e.key === 'j') {
        e.preventDefault();
        setLayout((prev) => ({
          ...prev,
          aiPanelOpen: !prev.aiPanelOpen,
        }));
      }

      // Escape: Close command palette
      if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen]);

  const handleToggleSidebar = useCallback(() => {
    setLayout((prev) => ({ ...prev, sidebarOpen: !prev.sidebarOpen }));
  }, []);

  const handleToggleAIPanel = useCallback(() => {
    setLayout((prev) => ({ ...prev, aiPanelOpen: !prev.aiPanelOpen }));
  }, []);

  const handleSidebarTabChange = useCallback((tab: SidebarTab) => {
    setLayout((prev) => ({
      ...prev,
      activeSidebarTab: tab,
      sidebarOpen: true,
    }));
  }, []);

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

  if (!isInitialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary">
        <div className="spinner spinner-lg" />
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
    </div>
  );
}

export default App;
