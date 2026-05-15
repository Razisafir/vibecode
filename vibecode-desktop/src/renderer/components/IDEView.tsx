import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { ActivityTab, ProjectConfig } from '../types';
import ActivityBar from './ActivityBar';
import FileExplorer from './sidebar/FileExplorer';
import TerminalPanel from './sidebar/TerminalPanel';
import MemoryPanel from './sidebar/MemoryPanel';
import SettingsPanel from './sidebar/SettingsPanel';
import EditorArea from './EditorArea';
import AIPanel from './AIPanel';
import StatusBar from './StatusBar';
import TitleBar from './TitleBar';

interface IDEViewProps {
  projectConfig: ProjectConfig;
  onGoHome: () => void;
}

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 400;
const MIN_AI_PANEL_WIDTH = 280;
const MAX_AI_PANEL_WIDTH = 600;
const MIN_BOTTOM_HEIGHT = 100;
const MAX_BOTTOM_HEIGHT = 400;

const SearchPanel: React.FC = () => (
  <div className="flex flex-col h-full">
    <div className="px-4 py-2 border-b border-border">
      <input
        type="text"
        className="input text-xs"
        placeholder="Search files..."
        autoFocus
      />
    </div>
    <div className="flex-1 flex items-center justify-center">
      <p className="text-xs text-text-muted">Search across your project</p>
    </div>
  </div>
);

const IDEView: React.FC<IDEViewProps> = ({ projectConfig, onGoHome }) => {
  const [layout, setLayout] = useState({
    sidebarOpen: true,
    sidebarWidth: 240,
    aiPanelOpen: true,
    aiPanelWidth: 380,
    activeTab: 'files' as ActivityTab,
    bottomPanelOpen: false,
    bottomPanelHeight: 200,
  });

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const aiPanelResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const bottomResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Persist layout to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('vibecode:ide-layout', JSON.stringify(layout));
    } catch {
      // Ignore
    }
  }, [layout]);

  // Load layout from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('vibecode:ide-layout');
      if (saved) {
        const parsed = JSON.parse(saved);
        setLayout((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === 'k' && !e.shiftKey) {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }

      if (isMod && e.key === 'b' && !e.shiftKey) {
        e.preventDefault();
        setLayout((prev) => ({ ...prev, sidebarOpen: !prev.sidebarOpen }));
      }

      if (isMod && e.key === 'j' && !e.shiftKey) {
        e.preventDefault();
        setLayout((prev) => ({ ...prev, aiPanelOpen: !prev.aiPanelOpen }));
      }

      if (isMod && e.key === '`') {
        e.preventDefault();
        setLayout((prev) => ({
          ...prev,
          bottomPanelOpen: !prev.bottomPanelOpen,
          activeTab: prev.bottomPanelOpen ? prev.activeTab : 'terminal',
        }));
      }

      if (isMod && e.key === 'l' && !e.shiftKey) {
        e.preventDefault();
        setLayout((prev) => ({ ...prev, aiPanelOpen: true }));
        setTimeout(() => {
          const aiInput = document.querySelector<HTMLTextAreaElement>('[data-ai-input]');
          aiInput?.focus();
        }, 200);
      }

      if (isMod && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('vibecode:save-file'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSidebarResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = layout.sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, startWidth + delta));
      setLayout((prev) => ({ ...prev, sidebarWidth: newWidth }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [layout.sidebarWidth]);

  const handleAIPanelResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = layout.aiPanelWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(MIN_AI_PANEL_WIDTH, Math.min(MAX_AI_PANEL_WIDTH, startWidth - delta));
      setLayout((prev) => ({ ...prev, aiPanelWidth: newWidth }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [layout.aiPanelWidth]);

  const handleBottomResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = layout.bottomPanelHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      const newHeight = Math.max(MIN_BOTTOM_HEIGHT, Math.min(MAX_BOTTOM_HEIGHT, startHeight - delta));
      setLayout((prev) => ({ ...prev, bottomPanelHeight: newHeight }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [layout.bottomPanelHeight]);

  const renderSidebarContent = () => {
    switch (layout.activeTab) {
      case 'files':
        return <FileExplorer />;
      case 'search':
        return <SearchPanel />;
      case 'memory':
        return <MemoryPanel />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return <FileExplorer />;
    }
  };

  return (
    <div className="flex h-full flex-col bg-bg-deep">
      {/* Title Bar */}
      <TitleBar
        projectName={projectConfig.name}
        onCommandPalette={() => setCommandPaletteOpen((prev) => !prev)}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Activity Bar */}
        <ActivityBar
          activeTab={layout.activeTab}
          onTabChange={(tab) => setLayout((prev) => ({ ...prev, activeTab: tab, sidebarOpen: true }))}
          sidebarOpen={layout.sidebarOpen}
          onToggleSidebar={() => setLayout((prev) => ({ ...prev, sidebarOpen: !prev.sidebarOpen }))}
          aiPanelOpen={layout.aiPanelOpen}
          onToggleAIPanel={() => setLayout((prev) => ({ ...prev, aiPanelOpen: !prev.aiPanelOpen }))}
          bottomPanelOpen={layout.bottomPanelOpen}
          onToggleBottomPanel={() => setLayout((prev) => ({ ...prev, bottomPanelOpen: !prev.bottomPanelOpen }))}
        />

        {/* Sidebar */}
        {layout.sidebarOpen && (
          <>
            <div
              className="sidebar-panel"
              style={{ width: `${layout.sidebarWidth}px` }}
            >
              {renderSidebarContent()}
            </div>
            {/* Resize Handle */}
            <div
              className="w-1 flex-shrink-0 cursor-col-resize hover:bg-accent/30 transition-colors duration-150"
              onMouseDown={handleSidebarResize}
            />
          </>
        )}

        {/* Center: Editor + Bottom Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor Area */}
          <EditorArea className="flex-1" />

          {/* Bottom Panel */}
          {layout.bottomPanelOpen && (
            <>
              <div
                className="h-1 flex-shrink-0 cursor-row-resize hover:bg-accent/30 transition-colors duration-150"
                onMouseDown={handleBottomResize}
              />
              <div
                className="flex-shrink-0 border-t border-border bg-bg-base"
                style={{ height: `${layout.bottomPanelHeight}px` }}
              >
                <TerminalPanel />
              </div>
            </>
          )}
        </div>

        {/* AI Panel Resize Handle */}
        {layout.aiPanelOpen && (
          <div
            className="w-1 flex-shrink-0 cursor-col-resize hover:bg-accent/30 transition-colors duration-150"
            onMouseDown={handleAIPanelResize}
          />
        )}

        {/* AI Panel */}
        <AIPanel
          isOpen={layout.aiPanelOpen}
          onToggle={() => setLayout((prev) => ({ ...prev, aiPanelOpen: !prev.aiPanelOpen }))}
          width={layout.aiPanelWidth}
        />
      </div>

      {/* Status Bar */}
      <StatusBar
        activeModel={projectConfig.model || 'GPT-4o'}
        executionMode={projectConfig.executionMode}
      />

      {/* Command Palette */}
      {commandPaletteOpen && (
        <div className="command-palette-overlay" onClick={() => setCommandPaletteOpen(false)}>
          <div className="command-palette" onClick={(e) => e.stopPropagation()}>
            <div className="command-palette-input">
              <input
                type="text"
                className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                placeholder="Type a command or search..."
                autoFocus
              />
            </div>
            <div className="command-palette-list">
              <div className="command-palette-item" onClick={() => { setLayout((p) => ({ ...p, sidebarOpen: !p.sidebarOpen })); setCommandPaletteOpen(false); }}>
                <span>Toggle Sidebar</span>
                <span className="ml-auto text-xs text-text-muted">⌘B</span>
              </div>
              <div className="command-palette-item" onClick={() => { setLayout((p) => ({ ...p, aiPanelOpen: !p.aiPanelOpen })); setCommandPaletteOpen(false); }}>
                <span>Toggle AI Panel</span>
                <span className="ml-auto text-xs text-text-muted">⌘J</span>
              </div>
              <div className="command-palette-item" onClick={() => { setLayout((p) => ({ ...p, bottomPanelOpen: !p.bottomPanelOpen })); setCommandPaletteOpen(false); }}>
                <span>Toggle Terminal</span>
                <span className="ml-auto text-xs text-text-muted">⌘`</span>
              </div>
              <div className="command-palette-item" onClick={() => { onGoHome(); setCommandPaletteOpen(false); }}>
                <span>Go Home</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IDEView;
