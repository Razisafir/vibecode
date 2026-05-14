import React, { useCallback } from 'react';
import type { SidebarTab } from '../types';

interface TitleBarProps {
  onToggleSidebar: () => void;
  onToggleAIPanel: () => void;
  sidebarOpen: boolean;
  aiPanelOpen: boolean;
}

const TitleBar: React.FC<TitleBarProps> = ({
  onToggleSidebar,
  onToggleAIPanel,
  sidebarOpen,
  aiPanelOpen,
}) => {
  const handleClose = useCallback(() => {
    window.vibecode?.app.close();
  }, []);

  const handleMinimize = useCallback(() => {
    window.vibecode?.app.minimize();
  }, []);

  const handleMaximize = useCallback(() => {
    window.vibecode?.app.maximize();
  }, []);

  const handleDoubleClick = useCallback(() => {
    window.vibecode?.app.maximize();
  }, []);

  return (
    <div className="titlebar" onDoubleClick={handleDoubleClick}>
      {/* Traffic Lights / Window Controls */}
      <div className="traffic-lights flex items-center gap-2 no-drag">
        <button
          className="traffic-light traffic-light-close group"
          onClick={handleClose}
          aria-label="Close window"
          title="Close"
        >
          <svg className="absolute inset-0 m-auto opacity-0 group-hover:opacity-100 transition-opacity duration-150" width="6" height="6" viewBox="0 0 6 6" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" strokeLinecap="round">
            <path d="M0.5 0.5l5 5M5.5 0.5l-5 5" />
          </svg>
        </button>
        <button
          className="traffic-light traffic-light-minimize group"
          onClick={handleMinimize}
          aria-label="Minimize window"
          title="Minimize"
        >
          <svg className="absolute inset-0 m-auto opacity-0 group-hover:opacity-100 transition-opacity duration-150" width="6" height="1" viewBox="0 0 6 1" fill="rgba(0,0,0,0.5)">
            <rect width="6" height="1" />
          </svg>
        </button>
        <button
          className="traffic-light traffic-light-maximize group"
          onClick={handleMaximize}
          aria-label="Maximize window"
          title="Maximize"
        >
          <svg className="absolute inset-0 m-auto opacity-0 group-hover:opacity-100 transition-opacity duration-150" width="6" height="6" viewBox="0 0 6 6" fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="1.2">
            <rect x="0.6" y="0.6" width="4.8" height="4.8" />
          </svg>
        </button>
      </div>

      {/* Center Title */}
      <div className="titlebar-title no-drag">
        VibeCode
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1 no-drag">
        <button
          className="titlebar-action-btn"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          title={sidebarOpen ? 'Close sidebar (Cmd+B)' : 'Open sidebar (Cmd+B)'}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <rect x="1" y="1" width="14" height="14" rx="2" />
            <line x1="5.5" y1="1" x2="5.5" y2="15" />
          </svg>
        </button>
        <button
          className="titlebar-action-btn"
          onClick={onToggleAIPanel}
          aria-label={aiPanelOpen ? 'Close AI panel' : 'Open AI panel'}
          title={aiPanelOpen ? 'Close AI panel (Cmd+J)' : 'Open AI panel (Cmd+J)'}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <circle cx="8" cy="8" r="5" />
            <path d="M8 5v3l2 2" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
