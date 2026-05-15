import React, { useState, useEffect } from 'react';

interface StatusBarProps {
  activeProvider?: string;
  activeModel?: string;
  cursorLine?: number;
  cursorCol?: number;
  encoding?: string;
  language?: string;
  branch?: string;
  executionStatus?: string;
  executionMode?: string;
}

const StatusBar: React.FC<StatusBarProps> = ({
  activeProvider: _activeProvider,
  activeModel,
  cursorLine,
  cursorCol,
  encoding = 'UTF-8',
  language,
  branch,
  executionStatus,
  executionMode,
}) => {
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    const loadVersion = async () => {
      try {
        const v = await window.vibecode?.app.getVersion();
        if (v) setAppVersion(v);
      } catch {
        // Not available
      }
    };
    loadVersion();
  }, []);

  return (
    <div className="status-bar">
      {/* Left section */}
      <div className="status-bar-section">
        {/* Branch */}
        <div className="status-bar-item">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
            <path d="M3 1v6a2 2 0 002 2h1M7 1v3a1.5 1.5 0 01-1.5 1.5M3 5h4" />
          </svg>
          <span>{branch || 'main'}</span>
        </div>

        {/* Execution Status */}
        {executionStatus && (
          <div className="status-bar-item">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
            <span>{executionStatus}</span>
          </div>
        )}
      </div>

      {/* Center section */}
      <div className="status-bar-section">
        {(activeModel || executionMode) && (
          <div className="status-bar-item text-accent">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              <path d="M5 1L1 4l4 3 4-3-4-3z" />
              <path d="M1 7l4 3 4-3" />
            </svg>
            <span>{activeModel}{executionMode ? ` · ${executionMode}` : ''}</span>
          </div>
        )}
      </div>

      {/* Right section */}
      <div className="status-bar-section">
        {cursorLine !== undefined && cursorCol !== undefined && (
          <div className="status-bar-item">
            <span>Ln {cursorLine}, Col {cursorCol}</span>
          </div>
        )}

        {encoding && (
          <div className="status-bar-item">
            <span>{encoding}</span>
          </div>
        )}

        {language && (
          <div className="status-bar-item">
            <span>{language}</span>
          </div>
        )}

        {appVersion && (
          <div className="status-bar-item">
            <span>v{appVersion}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default StatusBar;
