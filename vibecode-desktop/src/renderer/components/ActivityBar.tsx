import React from 'react';
import type { ActivityTab } from '../types';

interface ActivityBarProps {
  activeTab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  aiPanelOpen: boolean;
  onToggleAIPanel: () => void;
  bottomPanelOpen: boolean;
  onToggleBottomPanel: () => void;
}

const TAB_CONFIG: { id: ActivityTab; label: string; shortcut: string }[] = [
  { id: 'files', label: 'Explorer', shortcut: '⌘⇧E' },
  { id: 'search', label: 'Search', shortcut: '⌘⇧F' },
  { id: 'ai', label: 'AI Assistant', shortcut: '⌘L' },
  { id: 'terminal', label: 'Terminal', shortcut: '⌘`' },
  { id: 'memory', label: 'Memory', shortcut: '⌘⇧M' },
  { id: 'settings', label: 'Settings', shortcut: '⌘,' },
];

const renderIcon = (tab: ActivityTab) => {
  const props = { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  switch (tab) {
    case 'files':
      return (
        <svg {...props}>
          <path d="M3 3h5l2 2h7a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" />
        </svg>
      );
    case 'search':
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="5" />
          <line x1="12" y1="12" x2="17" y2="17" />
        </svg>
      );
    case 'ai':
      return (
        <svg {...props}>
          <path d="M10 2L3 6l7 4 7-4-7-4z" />
          <path d="M3 10l7 4 7-4" />
          <path d="M3 14l7 4 7-4" />
        </svg>
      );
    case 'terminal':
      return (
        <svg {...props}>
          <rect x="2" y="3" width="16" height="14" rx="2" />
          <polyline points="6,8 9,11 6,14" />
          <line x1="11" y1="14" x2="14" y2="14" />
        </svg>
      );
    case 'memory':
      return (
        <svg {...props}>
          <path d="M10 2a8 8 0 100 16 8 8 0 000-16z" />
          <path d="M10 6v4l3 3" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...props}>
          <circle cx="10" cy="10" r="3" />
          <path d="M10 1v2m0 14v2m-9-9h2m14 0h2M3.5 3.5l1.4 1.4m10.2 10.2l1.4 1.4M3.5 16.5l1.4-1.4m10.2-10.2l1.4-1.4" />
        </svg>
      );
  }
};

const ActivityBar: React.FC<ActivityBarProps> = ({
  activeTab,
  onTabChange,
  sidebarOpen,
  onToggleSidebar,
  aiPanelOpen,
  onToggleAIPanel,
  bottomPanelOpen,
  onToggleBottomPanel,
}) => {
  const handleTabClick = (tab: ActivityTab) => {
    if (tab === 'ai') {
      onToggleAIPanel();
      return;
    }
    if (tab === 'terminal') {
      onToggleBottomPanel();
      return;
    }
    if (activeTab === tab && sidebarOpen) {
      onToggleSidebar();
    } else {
      onTabChange(tab);
    }
  };

  const isActive = (tab: ActivityTab): boolean => {
    if (tab === 'ai') return aiPanelOpen;
    if (tab === 'terminal') return bottomPanelOpen;
    return activeTab === tab && sidebarOpen;
  };

  return (
    <div className="activity-bar">
      {TAB_CONFIG.map((tab) => (
        <button
          key={tab.id}
          className={`activity-bar-btn ${isActive(tab.id) ? 'active' : ''}`}
          onClick={() => handleTabClick(tab.id)}
          aria-label={tab.label}
          title={`${tab.label} (${tab.shortcut})`}
        >
          {renderIcon(tab.id)}
        </button>
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Account / User */}
      <button
        className="activity-bar-btn"
        aria-label="Account"
        title="Account"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="7" r="4" />
          <path d="M3 17c0-3.3 3.1-6 7-6s7 2.7 7 6" />
        </svg>
      </button>
    </div>
  );
};

export default ActivityBar;
