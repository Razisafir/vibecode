import React, { useState, useCallback } from 'react';
import type { AppView, ProjectConfig } from './types';
import HomeView from './components/HomeView';
import ProjectSetupView from './components/ProjectSetupView';
import IDEView from './components/IDEView';
import ToastContainer from './components/ToastContainer';
import { useToast } from './hooks/useToast';

// ─── Default Project Config ──────────────────────────────────────────────────

const DEFAULT_PROJECT: ProjectConfig = {
  name: 'Untitled Project',
  type: 'web-app',
  providerId: 'openai',
  model: 'gpt-4o',
  workspacePath: '',
  executionMode: 'assisted',
  safetyLevel: 'high',
  objective: '',
};

// ─── App ─────────────────────────────────────────────────────────────────────

function App() {
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [projectConfig, setProjectConfig] = useState<ProjectConfig>(DEFAULT_PROJECT);
  const [isInitialized, setIsInitialized] = useState(true);

  // Toast system
  const { toasts, showToast, dismiss: dismissToast } = useToast();

  // ─── Navigation Handlers ─────────────────────────────────────────────────

  const handleNewProject = useCallback(() => {
    setCurrentView('project-setup');
  }, []);

  const handleOpenProject = useCallback(async () => {
    try {
      const result = await window.vibecode?.workspace.open('');
      if (result?.success && result.data?.workspace) {
        const ws = result.data.workspace;
        setProjectConfig((prev) => ({
          ...prev,
          name: ws.name,
          workspacePath: ws.rootPath,
        }));
        setCurrentView('ide');
        showToast(`Opened ${ws.name}`, 'success');
      }
    } catch {
      showToast('Failed to open project', 'error');
    }
  }, [showToast]);

  const handleImportRepo = useCallback(() => {
    // For now, same as open project
    handleOpenProject();
  }, [handleOpenProject]);

  const handleOpenRecent = useCallback(async (path: string) => {
    try {
      const result = await window.vibecode?.workspace.switchWorkspace(path);
      if (result?.success && result.data?.workspace) {
        const ws = result.data.workspace;
        setProjectConfig((prev) => ({
          ...prev,
          name: ws.name,
          workspacePath: ws.rootPath,
        }));
        setCurrentView('ide');
        showToast(`Opened ${ws.name}`, 'success');
      }
    } catch {
      showToast('Failed to open project', 'error');
    }
  }, [showToast]);

  const handleLaunchProject = useCallback((config: ProjectConfig) => {
    setProjectConfig(config);
    setCurrentView('ide');
    showToast(`Project "${config.name}" created`, 'success');
  }, [showToast]);

  const handleGoHome = useCallback(() => {
    setCurrentView('home');
  }, []);

  const handleBackToHome = useCallback(() => {
    setCurrentView('home');
  }, []);

  // ─── Loading State ───────────────────────────────────────────────────────

  if (!isInitialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-deep">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <div className="spinner spinner-lg" />
          <p className="text-xs text-text-muted">
            Loading VibeCode...
          </p>
        </div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col bg-bg-deep text-text-primary">
      {currentView === 'home' && (
        <HomeView
          onNewProject={handleNewProject}
          onOpenProject={handleOpenProject}
          onImportRepo={handleImportRepo}
          onOpenRecent={handleOpenRecent}
        />
      )}

      {currentView === 'project-setup' && (
        <ProjectSetupView
          onLaunch={handleLaunchProject}
          onBack={handleBackToHome}
        />
      )}

      {currentView === 'ide' && (
        <IDEView
          projectConfig={projectConfig}
          onGoHome={handleGoHome}
        />
      )}

      {/* Toast Notification System */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
