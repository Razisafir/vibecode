import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { SidebarTab } from '../types';

interface CommandPaletteProps {
  onClose: () => void;
  onToggleSidebar: () => void;
  onToggleAIPanel: () => void;
  onTabChange: (tab: SidebarTab) => void;
  sidebarOpen: boolean;
  aiPanelOpen: boolean;
}

interface CommandItem {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  action: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({
  onClose,
  onToggleSidebar,
  onToggleAIPanel,
  onTabChange,
  sidebarOpen,
  aiPanelOpen,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands: CommandItem[] = useMemo(
    () => [
      {
        id: 'open-file',
        label: 'Open File...',
        category: 'File',
        shortcut: 'Cmd+O',
        action: () => {
          window.vibecode?.workspace.open('');
        },
      },
      {
        id: 'new-file',
        label: 'New File',
        category: 'File',
        shortcut: 'Cmd+N',
        action: () => {},
      },
      {
        id: 'save-file',
        label: 'Save File',
        category: 'File',
        shortcut: 'Cmd+S',
        action: () => {},
      },
      {
        id: 'toggle-sidebar',
        label: sidebarOpen ? 'Close Sidebar' : 'Open Sidebar',
        category: 'View',
        shortcut: 'Cmd+B',
        action: onToggleSidebar,
      },
      {
        id: 'toggle-ai-panel',
        label: aiPanelOpen ? 'Close AI Panel' : 'Open AI Panel',
        category: 'View',
        shortcut: 'Cmd+J',
        action: onToggleAIPanel,
      },
      {
        id: 'toggle-terminal',
        label: 'Toggle Terminal',
        category: 'View',
        shortcut: 'Cmd+`',
        action: () => onTabChange('terminal'),
      },
      {
        id: 'focus-files',
        label: 'Show File Explorer',
        category: 'View',
        action: () => onTabChange('files'),
      },
      {
        id: 'focus-memory',
        label: 'Show Memory Panel',
        category: 'View',
        action: () => onTabChange('memory'),
      },
      {
        id: 'focus-settings',
        label: 'Show Settings',
        category: 'View',
        action: () => onTabChange('settings'),
      },
      {
        id: 'switch-provider',
        label: 'Switch AI Provider',
        category: 'AI',
        action: () => onTabChange('settings'),
      },
      {
        id: 'clear-chat',
        label: 'Clear AI Conversation',
        category: 'AI',
        action: () => {},
      },
      {
        id: 'zoom-in',
        label: 'Zoom In',
        category: 'View',
        shortcut: 'Cmd+=',
        action: () => {},
      },
      {
        id: 'zoom-out',
        label: 'Zoom Out',
        category: 'View',
        shortcut: 'Cmd+-',
        action: () => {},
      },
      {
        id: 'zoom-reset',
        label: 'Reset Zoom',
        category: 'View',
        shortcut: 'Cmd+0',
        action: () => {},
      },
      {
        id: 'reload-window',
        label: 'Reload Window',
        category: 'Developer',
        action: () => window.location.reload(),
      },
    ],
    [sidebarOpen, aiPanelOpen, onToggleSidebar, onToggleAIPanel, onTabChange],
  );

  // Fuzzy search filter
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;

    const lowerQuery = query.toLowerCase();
    const queryChars = lowerQuery.split('');

    return commands.filter((cmd) => {
      const lowerLabel = cmd.label.toLowerCase();
      const lowerCategory = cmd.category.toLowerCase();

      // Direct substring match
      if (lowerLabel.includes(lowerQuery) || lowerCategory.includes(lowerQuery)) {
        return true;
      }

      // Fuzzy character match
      let charIndex = 0;
      for (let i = 0; i < lowerLabel.length && charIndex < queryChars.length; i++) {
        if (lowerLabel[i] === queryChars[charIndex]) {
          charIndex++;
        }
      }
      return charIndex === queryChars.length;
    });
  }, [commands, query]);

  // Reset selected index when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    const selectedEl = listRef.current?.querySelector(
      `[data-command-index="${selectedIndex}"]`,
    );
    selectedEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const executeCommand = useCallback(
    (command: CommandItem) => {
      command.action();
      onClose();
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredCommands.length - 1 ? prev + 1 : 0,
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredCommands.length - 1,
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            executeCommand(filteredCommands[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredCommands, selectedIndex, executeCommand, onClose],
  );

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    filteredCommands.forEach((cmd) => {
      if (!groups[cmd.category]) {
        groups[cmd.category] = [];
      }
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  let globalIndex = -1;

  return (
    <div
      className="command-palette-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="command-palette" onKeyDown={handleKeyDown}>
        {/* Search Input */}
        <div className="command-palette-input">
          <div className="flex items-center gap-3">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="flex-shrink-0 text-text-muted"
            >
              <circle cx="7" cy="7" r="5" />
              <line x1="10.5" y1="10.5" x2="14" y2="14" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
              placeholder="Type a command..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd className="rounded border border-border bg-bg-primary px-1.5 py-0.5 text-xs text-text-muted">
              Esc
            </kbd>
          </div>
        </div>

        {/* Command List */}
        <div className="command-palette-list" ref={listRef}>
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-muted">
              No commands found for &quot;{query}&quot;
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, cmds]) => (
              <div key={category}>
                <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {category}
                </div>
                {cmds.map((cmd) => {
                  globalIndex++;
                  const idx = globalIndex;
                  return (
                    <div
                      key={cmd.id}
                      data-command-index={idx}
                      className={`command-palette-item ${
                        idx === selectedIndex ? 'selected' : ''
                      }`}
                      onClick={() => executeCommand(cmd)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <span className="flex-1">{cmd.label}</span>
                      {cmd.shortcut && (
                        <kbd className="rounded border border-border bg-bg-primary px-1.5 py-0.5 text-xs text-text-muted">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-text-muted">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded border border-border bg-bg-primary px-1">&uarr;&darr;</kbd>{' '}
              Navigate
            </span>
            <span>
              <kbd className="rounded border border-border bg-bg-primary px-1">&crarr;</kbd>{' '}
              Select
            </span>
            <span>
              <kbd className="rounded border border-border bg-bg-primary px-1">Esc</kbd>{' '}
              Close
            </span>
          </div>
          <span>{filteredCommands.length} command{filteredCommands.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
