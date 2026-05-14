import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { SidebarTab, FileSearchResult } from '../types';

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

interface SearchResultItem {
  id: string;
  label: string;
  sublabel?: string;
  category: string;
  icon?: string;
  shortcut?: string;
  action: () => void;
}

type PaletteMode = 'commands' | 'files';

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
  const [mode, setMode] = useState<PaletteMode>('commands');
  const [fileResults, setFileResults] = useState<FileSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
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
        id: 'search-files',
        label: 'Search Files...',
        category: 'File',
        shortcut: 'Cmd+P',
        action: () => {
          setMode('files');
          setQuery('');
        },
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
        id: 'switch-workspace',
        label: 'Switch Workspace...',
        category: 'Workspace',
        action: () => {
          window.vibecode?.workspace.open('');
        },
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

  // Detect mode from query prefix
  useEffect(() => {
    if (query.startsWith('>')) {
      setMode('commands');
    } else if (query.length > 0 && !query.startsWith('>')) {
      setMode('files');
    } else if (query.length === 0) {
      setMode('commands');
    }
  }, [query]);

  // Search files when in file mode
  useEffect(() => {
    if (mode !== 'files' || query.length === 0) {
      setFileResults([]);
      return;
    }

    const searchQuery = query.trim();
    if (!searchQuery) {
      setFileResults([]);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const result = await window.vibecode?.workspace.fuzzySearch(searchQuery, 30);
        if (result?.success && result.data?.files) {
          setFileResults(result.data.files);
        } else {
          setFileResults([]);
        }
      } catch {
        setFileResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 150); // Debounce

    return () => clearTimeout(timer);
  }, [query, mode]);

  // Build the combined result list based on mode
  const results: SearchResultItem[] = useMemo(() => {
    if (mode === 'files') {
      return fileResults.map((file, idx) => ({
        id: `file-${idx}`,
        label: file.name,
        sublabel: file.relativePath,
        category: 'Files',
        icon: getFileIcon(file.extension),
        action: () => {
          // Open the file in the workspace
          // This would need to be wired up to the workspace component
          // For now, we'll close the palette and trigger the file open
          console.log(`Opening file: ${file.path}`);
          onClose();
        },
      }));
    }

    // Command mode
    const commandQuery = query.startsWith('>') ? query.slice(1).trim() : query;

    if (!commandQuery.trim()) return commands.map((cmd) => ({
      id: cmd.id,
      label: cmd.label,
      category: cmd.category,
      shortcut: cmd.shortcut,
      action: cmd.action,
    }));

    const lowerQuery = commandQuery.toLowerCase();
    const queryChars = lowerQuery.split('');

    return commands
      .filter((cmd) => {
        const lowerLabel = cmd.label.toLowerCase();
        const lowerCategory = cmd.category.toLowerCase();

        if (lowerLabel.includes(lowerQuery) || lowerCategory.includes(lowerQuery)) {
          return true;
        }

        let charIndex = 0;
        for (let i = 0; i < lowerLabel.length && charIndex < queryChars.length; i++) {
          if (lowerLabel[i] === queryChars[charIndex]) {
            charIndex++;
          }
        }
        return charIndex === queryChars.length;
      })
      .map((cmd) => ({
        id: cmd.id,
        label: cmd.label,
        category: cmd.category,
        shortcut: cmd.shortcut,
        action: cmd.action,
      }));
  }, [mode, fileResults, commands, query, onClose]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

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

  const executeItem = useCallback(
    (item: SearchResultItem) => {
      item.action();
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
            prev < results.length - 1 ? prev + 1 : 0,
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : results.length - 1,
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            executeItem(results[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'Backspace':
          // If in file mode and query is empty, switch back to command mode
          if (query.length === 0 && mode === 'files') {
            setMode('commands');
          }
          break;
      }
    },
    [results, selectedIndex, executeItem, onClose, query, mode],
  );

  // Group results by category
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResultItem[]> = {};
    results.forEach((item) => {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category].push(item);
    });
    return groups;
  }, [results]);

  let globalIndex = -1;

  const placeholder = mode === 'files'
    ? 'Search files by name...'
    : 'Type a command or search files...';

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
            {mode === 'files' ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="flex-shrink-0 text-accent"
              >
                <path d="M2 4h4l1.5 1.5H14v7H2V4z" />
              </svg>
            ) : (
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
            )}
            <input
              ref={inputRef}
              type="text"
              className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex items-center gap-2">
              {mode === 'files' && (
                <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
                  Files
                </span>
              )}
              <kbd className="rounded border border-border bg-bg-primary px-1.5 py-0.5 text-xs text-text-muted">
                Esc
              </kbd>
            </div>
          </div>
        </div>

        {/* Results List */}
        <div className="command-palette-list" ref={listRef}>
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-muted">
              {isSearching ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="spinner spinner-sm" />
                  <span>Searching...</span>
                </div>
              ) : mode === 'files' && query.length > 0 ? (
                <>
                  <p>No files found for &quot;{query}&quot;</p>
                  <p className="mt-1 text-xs">Open a workspace first to search files</p>
                </>
              ) : (
                <p>No commands found for &quot;{query}&quot;</p>
              )}
            </div>
          ) : (
            Object.entries(groupedResults).map(([category, items]) => (
              <div key={category}>
                <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {category}
                </div>
                {items.map((item) => {
                  globalIndex++;
                  const idx = globalIndex;
                  return (
                    <div
                      key={item.id}
                      data-command-index={idx}
                      className={`command-palette-item ${
                        idx === selectedIndex ? 'selected' : ''
                      }`}
                      onClick={() => executeItem(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {item.icon && (
                          <span className="flex-shrink-0 text-xs">{item.icon}</span>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="block truncate">{item.label}</span>
                          {item.sublabel && (
                            <span className="block truncate text-[10px] text-text-muted">
                              {item.sublabel}
                            </span>
                          )}
                        </div>
                      </div>
                      {item.shortcut && (
                        <kbd className="rounded border border-border bg-bg-primary px-1.5 py-0.5 text-xs text-text-muted flex-shrink-0">
                          {item.shortcut}
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
            <span>
              <kbd className="rounded border border-border bg-bg-primary px-1">Cmd+P</kbd>{' '}
              Files
            </span>
          </div>
          <span>
            {mode === 'files' ? `${results.length} file${results.length !== 1 ? 's' : ''}` : `${results.length} command${results.length !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── Helper: Get file icon ──────────────────────────────────────────────────

function getFileIcon(extension: string): string {
  const icons: Record<string, string> = {
    '.ts': '📘',
    '.tsx': '📘',
    '.js': '📙',
    '.jsx': '📙',
    '.py': '🐍',
    '.rs': '🦀',
    '.go': '🔵',
    '.java': '☕',
    '.json': '📋',
    '.md': '📝',
    '.css': '🎨',
    '.html': '🌐',
    '.yml': '⚙️',
    '.yaml': '⚙️',
    '.toml': '⚙️',
    '.sh': '📜',
    '.bash': '📜',
    '.sql': '🗃️',
  };
  return icons[extension] ?? '📄';
}

export default CommandPalette;
