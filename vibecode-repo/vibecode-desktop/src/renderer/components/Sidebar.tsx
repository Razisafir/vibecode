import React from 'react';
import type { SidebarTab } from '../types';
import FileExplorer from './sidebar/FileExplorer';
import TerminalPanel from './sidebar/TerminalPanel';
import MemoryPanel from './sidebar/MemoryPanel';
import SettingsPanel from './sidebar/SettingsPanel';

interface SidebarProps {
  isOpen: boolean;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onToggle: () => void;
}

interface SidebarIconProps {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}

const SidebarIcon: React.FC<SidebarIconProps> = ({ active, onClick, label, children }) => (
  <button
    className={`sidebar-icon-btn ${active ? 'active' : ''}`}
    onClick={onClick}
    aria-label={label}
    title={label}
  >
    {children}
  </button>
);

const TAB_CONFIG: { id: SidebarTab; label: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'memory', label: 'Memory' },
  { id: 'settings', label: 'Settings' },
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen, activeTab, onTabChange, onToggle }) => {
  const renderTabIcon = (tab: SidebarTab) => {
    switch (tab) {
      case 'files':
        return (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3h5l2 2h7a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" />
          </svg>
        );
      case 'terminal':
        return (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="16" height="14" rx="2" />
            <polyline points="6,8 9,11 6,14" />
            <line x1="11" y1="14" x2="14" y2="14" />
          </svg>
        );
      case 'memory':
        return (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 2a8 8 0 100 16 8 8 0 000-16z" />
            <path d="M10 6v4l3 3" />
          </svg>
        );
      case 'settings':
        return (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="10" cy="10" r="3" />
            <path d="M10 1v2m0 14v2m-9-9h2m14 0h2M3.5 3.5l1.4 1.4m10.2 10.2l1.4 1.4M3.5 16.5l1.4-1.4m10.2-10.2l1.4-1.4" />
          </svg>
        );
    }
  };

  const renderPanelContent = () => {
    switch (activeTab) {
      case 'files':
        return <FileExplorer />;
      case 'terminal':
        return <TerminalPanel />;
      case 'memory':
        return <MemoryPanel />;
      case 'settings':
        return <SettingsPanel />;
    }
  };

  return (
    <div className="sidebar-container">
      {/* Activity Bar */}
      <div className="sidebar-activity-bar">
        {TAB_CONFIG.map((tab) => (
          <SidebarIcon
            key={tab.id}
            active={activeTab === tab.id && isOpen}
            onClick={() => {
              if (activeTab === tab.id && isOpen) {
                onToggle();
              } else {
                onTabChange(tab.id);
              }
            }}
            label={tab.label}
          >
            {renderTabIcon(tab.id)}
          </SidebarIcon>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Collapse button */}
        <button
          className="sidebar-icon-btn"
          onClick={onToggle}
          aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          title={isOpen ? 'Collapse (Cmd+B)' : 'Expand (Cmd+B)'}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            style={{
              transform: isOpen ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 150ms ease',
            }}
          >
            <polyline points="12,4 6,10 12,16" />
          </svg>
        </button>
      </div>

      {/* Expandable Panel */}
      <div className={`sidebar-panel ${isOpen ? '' : 'collapsed'}`}>
        {/* Panel Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            {TAB_CONFIG.find((t) => t.id === activeTab)?.label}
          </h2>
        </div>

        {/* Panel Content */}
        <div className="flex-1 overflow-hidden">
          {renderPanelContent()}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
