import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TerminalTab {
  /** Stable UI identifier for the tab (never changes) */
  id: string;
  /** PTY session identifier used for IPC calls (changes on restart) */
  ptyId: string;
  name: string;
  shell: string;
  cwd: string;
  exitCode: number | null;
  isRunning: boolean;
  hasExited: boolean;
}

interface TerminalState {
  terminal: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  webLinksAddon: WebLinksAddon;
  container: HTMLDivElement | null;
  commandHistory: string[];
  historyIndex: number;
  disposables: { dispose(): void }[];
}

// ─── Theme ──────────────────────────────────────────────────────────────────

const VIBECODE_TERMINAL_THEME = {
  background: '#0a0a0f',
  foreground: '#e4e4e9',
  cursor: '#6366f1',
  cursorAccent: '#0a0a0f',
  selectionBackground: 'rgba(99, 102, 241, 0.3)',
  selectionForeground: '#e4e4e9',
  selectionInactiveBackground: 'rgba(99, 102, 241, 0.15)',
  black: '#555570',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e8e8f0',
  brightBlack: '#8888a0',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#f8f8f8',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getShellName(shellPath: string): string {
  if (!shellPath) return 'shell';
  const base = shellPath.split('/').pop() ?? shellPath.split('\\').pop() ?? shellPath;
  const names: Record<string, string> = {
    bash: 'bash',
    zsh: 'zsh',
    fish: 'fish',
    sh: 'sh',
    dash: 'dash',
    ksh: 'ksh',
    powershell: 'pwsh',
    'pwsh.exe': 'pwsh',
    'cmd.exe': 'cmd',
    nu: 'nu',
    elvish: 'elv',
  };
  return names[base] ?? base;
}

let terminalCounter = 0;

/** Generate a stable tab ID */
function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

const TerminalPanel: React.FC = () => {
  // ── State ──
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // ── Refs ──
  const terminalsRef = useRef<Map<string, TerminalState>>(new Map());
  const containerWrapperRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const dataListenerRegisteredRef = useRef(false);
  const exitListenerRegisteredRef = useRef(false);
  const isCreatingRef = useRef(false);
  const searchTermRef = useRef<HTMLInputElement>(null);

  // Map PTY session IDs to tab IDs for routing data/exit events
  const ptyToTabRef = useRef<Map<string, string>>(new Map());

  // ────────────────────────────────────────────────────────────────────────
  // Resize handling
  // ────────────────────────────────────────────────────────────────────────

  const fitTerminal = useCallback((tabId: string) => {
    const state = terminalsRef.current.get(tabId);
    if (!state || !state.container) return;

    try {
      state.fitAddon.fit();
      const cols = state.terminal.cols;
      const rows = state.terminal.rows;
      const tab = tabs.find((t) => t.id === tabId);
      if (cols > 0 && rows > 0 && tab?.ptyId) {
        window.vibecode?.terminal.resize(tab.ptyId, cols, rows).catch(() => {
          // Resize might fail for spawn-based terminals
        });
      }
    } catch {
      // fitAddon.fit() can fail if terminal is not visible
    }
  }, [tabs]);

  const fitActiveTerminal = useCallback(() => {
    if (activeTabId) {
      requestAnimationFrame(() => {
        fitTerminal(activeTabId);
      });
    }
  }, [activeTabId, fitTerminal]);

  // ────────────────────────────────────────────────────────────────────────
  // Terminal instance creation (xterm.js + addons)
  // ────────────────────────────────────────────────────────────────────────

  const createTerminalState = useCallback(
    (tabId: string, container: HTMLDivElement): TerminalState => {
      const terminal = new Terminal({
        theme: VIBECODE_TERMINAL_THEME,
        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace",
        fontSize: 13,
        lineHeight: 1.4,
        cursorStyle: 'bar',
        cursorBlink: true,
        cursorWidth: 2,
        scrollback: 10000,
        allowProposedApi: true,
        allowTransparency: false,
        drawBoldTextInBrightColors: true,
        minimumContrastRatio: 1,
        smoothScrollDuration: 80,
        convertEol: false,
        wordSeparator: ' ()[]{}\'\"`,;:|',
      });

      const fitAddon = new FitAddon();
      const searchAddon = new SearchAddon();
      const webLinksAddon = new WebLinksAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(searchAddon);
      terminal.loadAddon(webLinksAddon);
      terminal.open(container);

      // Initial fit after opening
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
        } catch {
          // May fail if not visible yet
        }
      });

      const disposables: { dispose(): void }[] = [];

      // ── User input → PTY ──
      const onDataDisposable = terminal.onData((data: string) => {
        // Find the current PTY session ID for this tab
        const tab = tabs.find((t) => t.id === tabId);
        const ptyId = tab?.ptyId;
        if (!ptyId) return;

        // Forward all input to the PTY (including arrow keys for shell history)
        window.vibecode?.terminal.write(ptyId, data).catch(() => {
          // Write failed - terminal may have exited
        });

        // Track command history locally (supplementary to shell's own history)
        if (data === '\r') {
          const state = terminalsRef.current.get(tabId);
          if (state) {
            // We don't track currentLine here because the PTY shell handles
            // line editing. Our command history is just for reference.
            state.historyIndex = state.commandHistory.length;
          }
        }
      });
      disposables.push(onDataDisposable);

      // ── Copy on selection ──
      const onSelectionDisposable = terminal.onSelectionChange(() => {
        if (terminal.hasSelection()) {
          const selection = terminal.getSelection();
          if (selection) {
            navigator.clipboard.writeText(selection).catch(() => {
              // Clipboard write failed
            });
          }
        }
      });
      disposables.push(onSelectionDisposable);

      // ── Custom key bindings ──
      const onKeyDisposable = terminal.onKey(({ domEvent }: { domEvent: KeyboardEvent }) => {
        const tab = tabs.find((t) => t.id === tabId);
        const ptyId = tab?.ptyId;

        // Ctrl+Shift+C — Copy
        if (domEvent.ctrlKey && domEvent.shiftKey && domEvent.key === 'C') {
          domEvent.preventDefault();
          const selection = terminal.getSelection();
          if (selection) {
            navigator.clipboard.writeText(selection).catch(() => {});
          }
          return;
        }

        // Ctrl+Shift+V — Paste
        if (domEvent.ctrlKey && domEvent.shiftKey && domEvent.key === 'V') {
          domEvent.preventDefault();
          navigator.clipboard.readText().then((text) => {
            if (text && ptyId) {
              window.vibecode?.terminal.write(ptyId, text).catch(() => {});
            }
          }).catch(() => {});
          return;
        }

        // Ctrl+V — Paste
        if (domEvent.ctrlKey && !domEvent.shiftKey && domEvent.key === 'v') {
          domEvent.preventDefault();
          navigator.clipboard.readText().then((text) => {
            if (text && ptyId) {
              window.vibecode?.terminal.write(ptyId, text).catch(() => {});
            }
          }).catch(() => {});
          return;
        }

        // Ctrl+F — Search
        if (domEvent.ctrlKey && domEvent.key === 'f') {
          domEvent.preventDefault();
          setShowSearch(true);
          return;
        }
      });
      disposables.push(onKeyDisposable);

      return {
        terminal,
        fitAddon,
        searchAddon,
        webLinksAddon,
        container,
        commandHistory: [],
        historyIndex: 0,
        disposables,
      };
    },
    [tabs],
  );

  // ────────────────────────────────────────────────────────────────────────
  // Create a new terminal tab
  // ────────────────────────────────────────────────────────────────────────

  const createTerminal = useCallback(async () => {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;

    try {
      terminalCounter++;
      const name = `Terminal ${terminalCounter}`;
      const tabId = generateTabId();

      let ptyId = '';
      let shell = '/bin/bash';
      let cwd = '~';

      try {
        if (window.vibecode?.terminal) {
          const result = await window.vibecode.terminal.create();
          if (result?.success) {
            if (result.data) {
              ptyId = result.data.sessionId;
              shell = result.data.shell ?? '/bin/bash';
              cwd = result.data.cwd ?? '~';
            } else if (result.id) {
              ptyId = result.id;
            }
          }
        }
      } catch {
        // IPC not available
      }

      // Fallback: local mock
      if (!ptyId) {
        ptyId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      }

      // Register PTY→tab mapping
      ptyToTabRef.current.set(ptyId, tabId);

      const newTab: TerminalTab = {
        id: tabId,
        ptyId,
        name,
        shell: getShellName(shell),
        cwd,
        exitCode: null,
        isRunning: true,
        hasExited: false,
      };

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(tabId);
    } finally {
      isCreatingRef.current = false;
    }
  }, []);

  // ────────────────────────────────────────────────────────────────────────
  // Terminal container ref callback — attaches xterm.js to DOM
  // ────────────────────────────────────────────────────────────────────────

  const terminalContainerRef = useCallback(
    (tabId: string, element: HTMLDivElement | null) => {
      if (!element) return;

      const existing = terminalsRef.current.get(tabId);
      if (existing) {
        // Already initialized — just update container ref if needed
        if (existing.container !== element) {
          existing.container = element;
        }
        return;
      }

      // Create xterm.js terminal and attach to this container
      const state = createTerminalState(tabId, element);
      terminalsRef.current.set(tabId, state);

      // Fit after a short delay to ensure container has dimensions
      requestAnimationFrame(() => {
        fitTerminal(tabId);
      });
    },
    [createTerminalState, fitTerminal],
  );

  // ────────────────────────────────────────────────────────────────────────
  // Close terminal
  // ────────────────────────────────────────────────────────────────────────

  const closeTerminal = useCallback(
    (tabId: string, e?: React.MouseEvent) => {
      e?.stopPropagation();

      // Find the tab
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;

      // Clean up xterm.js instance
      const state = terminalsRef.current.get(tabId);
      if (state) {
        state.disposables.forEach((d) => d.dispose());
        state.terminal.dispose();
        terminalsRef.current.delete(tabId);
      }

      // Remove PTY→tab mapping
      ptyToTabRef.current.delete(tab.ptyId);

      // Kill PTY session
      try {
        window.vibecode?.terminal.kill(tab.ptyId).catch(() => {});
      } catch {
        // Kill failed
      }

      // Compute remaining tabs and new active tab
      const remainingTabs = tabs.filter((t) => t.id !== tabId);
      const newActiveTabId =
        activeTabId === tabId
          ? remainingTabs.length > 0
            ? remainingTabs[remainingTabs.length - 1].id
            : ''
          : activeTabId;

      setTabs(remainingTabs);
      setActiveTabId(newActiveTabId);
    },
    [tabs, activeTabId],
  );

  // ────────────────────────────────────────────────────────────────────────
  // Restart a terminal that has exited
  // ────────────────────────────────────────────────────────────────────────

  const restartTerminal = useCallback(
    async (tabId: string) => {
      // Remove old PTY→tab mapping
      const oldTab = tabs.find((t) => t.id === tabId);
      if (oldTab?.ptyId) {
        ptyToTabRef.current.delete(oldTab.ptyId);
      }

      // Clear the terminal buffer
      const state = terminalsRef.current.get(tabId);
      if (state) {
        state.terminal.reset();
      }

      // Create a new PTY session
      let ptyId = '';
      let shell = '/bin/bash';
      let cwd = '~';

      try {
        if (window.vibecode?.terminal) {
          const result = await window.vibecode.terminal.create();
          if (result?.success) {
            if (result.data) {
              ptyId = result.data.sessionId;
              shell = result.data.shell ?? '/bin/bash';
              cwd = result.data.cwd ?? '~';
            } else if (result.id) {
              ptyId = result.id;
            }
          }
        }
      } catch {
        // IPC not available
      }

      if (!ptyId) {
        ptyId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      }

      // Register new PTY→tab mapping
      ptyToTabRef.current.set(ptyId, tabId);

      // Update the tab with new PTY session
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? {
                ...t,
                ptyId,
                shell: getShellName(shell),
                cwd,
                exitCode: null,
                isRunning: true,
                hasExited: false,
              }
            : t,
        ),
      );

      // Focus the terminal
      if (state) {
        state.terminal.focus();
      }
    },
    [tabs],
  );

  // ────────────────────────────────────────────────────────────────────────
  // Search
  // ────────────────────────────────────────────────────────────────────────

  const performSearch = useCallback(
    (query: string, direction: 'next' | 'prev' = 'next') => {
      const state = terminalsRef.current.get(activeTabId);
      if (!state || !query) return;

      const options = {
        regex: false,
        wholeWord: false,
        caseSensitive: false,
        incremental: true,
      };

      if (direction === 'next') {
        state.searchAddon.findNext(query, options);
      } else {
        state.searchAddon.findPrevious(query, options);
      }
    },
    [activeTabId],
  );

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    const state = terminalsRef.current.get(activeTabId);
    if (state) {
      state.searchAddon.clearDecorations();
      state.searchAddon.clearActiveDecoration();
    }
  }, [activeTabId]);

  // ────────────────────────────────────────────────────────────────────────
  // Context menu
  // ────────────────────────────────────────────────────────────────────────

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleCopy = useCallback(() => {
    const state = terminalsRef.current.get(activeTabId);
    if (state) {
      const selection = state.terminal.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection).catch(() => {});
      }
    }
    setContextMenu(null);
  }, [activeTabId]);

  const handlePaste = useCallback(() => {
    const tab = tabs.find((t) => t.id === activeTabId);
    navigator.clipboard.readText().then((text) => {
      if (text && tab?.ptyId) {
        window.vibecode?.terminal.write(tab.ptyId, text).catch(() => {});
      }
    }).catch(() => {});
    setContextMenu(null);
  }, [activeTabId, tabs]);

  const handleSelectAll = useCallback(() => {
    const state = terminalsRef.current.get(activeTabId);
    if (state) {
      state.terminal.selectAll();
    }
    setContextMenu(null);
  }, [activeTabId]);

  const handleClear = useCallback(() => {
    const state = terminalsRef.current.get(activeTabId);
    if (state) {
      state.terminal.clear();
    }
    setContextMenu(null);
  }, [activeTabId]);

  // ────────────────────────────────────────────────────────────────────────
  // Effects
  // ────────────────────────────────────────────────────────────────────────

  // Create a default terminal on mount
  useEffect(() => {
    createTerminal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Register IPC data listener once
  useEffect(() => {
    if (dataListenerRegisteredRef.current) return;
    dataListenerRegisteredRef.current = true;

    if (!window.vibecode?.terminal) return;

    window.vibecode.terminal.onData((ptyId: string, data: string) => {
      // Route data from PTY to the correct terminal tab
      const tabId = ptyToTabRef.current.get(ptyId);
      if (!tabId) return;

      const state = terminalsRef.current.get(tabId);
      if (state) {
        state.terminal.write(data);
      }
    });
  }, []);

  // Register IPC exit listener once
  useEffect(() => {
    if (exitListenerRegisteredRef.current) return;
    exitListenerRegisteredRef.current = true;

    if (!window.vibecode?.terminal?.onExit) return;

    window.vibecode.terminal.onExit((ptyId: string, exitCode: number) => {
      // Route exit event from PTY to the correct terminal tab
      const tabId = ptyToTabRef.current.get(ptyId);
      if (!tabId) return;

      const state = terminalsRef.current.get(tabId);
      if (state) {
        // Show exit message in terminal
        state.terminal.write(
          `\r\n\x1b[90m━━━ Process exited with code ${exitCode} ━━━\x1b[0m\r\n\x1b[90mClick "Restart" to create a new session.\x1b[0m\r\n`,
        );
      }

      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? { ...t, exitCode, isRunning: false, hasExited: true }
            : t,
        ),
      );
    });
  }, []);

  // ResizeObserver for container size changes
  useEffect(() => {
    if (!containerWrapperRef.current) return;

    resizeObserverRef.current = new ResizeObserver(() => {
      fitActiveTerminal();
    });

    resizeObserverRef.current.observe(containerWrapperRef.current);

    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, [fitActiveTerminal]);

  // Re-fit when active tab changes
  useEffect(() => {
    if (activeTabId) {
      const timer = setTimeout(() => {
        fitTerminal(activeTabId);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeTabId, fitTerminal]);

  // Focus active terminal on tab change
  useEffect(() => {
    if (activeTabId) {
      const state = terminalsRef.current.get(activeTabId);
      if (state) {
        state.terminal.focus();
      }
    }
  }, [activeTabId]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;

    const handleClick = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  // Cleanup all terminals on unmount
  useEffect(() => {
    return () => {
      terminalsRef.current.forEach((state) => {
        state.disposables.forEach((d) => d.dispose());
        state.terminal.dispose();
      });
      terminalsRef.current.clear();
    };
  }, []);

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col" onContextMenu={handleContextMenu}>
      {/* ── Tab Bar ── */}
      <div className="flex items-center border-b border-[var(--border)] bg-[var(--bg-deep)] px-1 py-0 select-none">
        <div className="flex items-center gap-0 overflow-x-auto scrollbar-hidden flex-1 min-w-0">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`
                terminal-tab group flex items-center gap-1.5 px-3 h-[32px] cursor-pointer
                text-xs transition-colors duration-150 border-r border-[var(--border)]
                ${tab.id === activeTabId
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-b-2 border-b-[var(--accent)]'
                  : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }
              `}
              onClick={() => setActiveTabId(tab.id)}
              title={`${tab.shell} — ${tab.cwd}`}
            >
              {/* Running indicator */}
              {tab.isRunning ? (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--success)] flex-shrink-0" />
              ) : (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] flex-shrink-0" />
              )}

              {/* Terminal icon */}
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                className="flex-shrink-0"
              >
                <polyline points="2,3.5 5.5,6 2,8.5" />
                <line x1="7" y1="8.5" x2="10" y2="8.5" />
              </svg>

              {/* Tab name */}
              <span className="truncate max-w-[120px]">{tab.name}</span>

              {/* Shell badge */}
              <span className="text-[10px] text-[var(--text-muted)] opacity-60">
                {tab.shell}
              </span>

              {/* Close button */}
              {tabs.length > 1 && (
                <button
                  className="ml-0.5 rounded p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-[var(--bg-active)] transition-opacity"
                  onClick={(e) => closeTerminal(tab.id, e)}
                  aria-label={`Close terminal ${tab.name}`}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* New terminal button */}
        <button
          className="btn-icon btn-ghost ml-1 rounded p-1.5 flex-shrink-0"
          onClick={createTerminal}
          title="New Terminal"
          aria-label="Create new terminal"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <line x1="7" y1="3" x2="7" y2="11" />
            <line x1="3" y1="7" x2="11" y2="7" />
          </svg>
        </button>
      </div>

      {/* ── Search Bar ── */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-elevated)] border-b border-[var(--border)]">
          <input
            ref={searchTermRef}
            type="text"
            className="input input-mono text-xs flex-1"
            placeholder="Find in terminal..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              performSearch(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                performSearch(searchQuery, e.shiftKey ? 'prev' : 'next');
              } else if (e.key === 'Escape') {
                closeSearch();
              }
            }}
            autoFocus
          />
          <button
            className="btn-icon btn-ghost rounded p-1"
            onClick={() => performSearch(searchQuery, 'prev')}
            title="Previous match (Shift+Enter)"
            aria-label="Previous match"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="2,8 6,4 10,8" />
            </svg>
          </button>
          <button
            className="btn-icon btn-ghost rounded p-1"
            onClick={() => performSearch(searchQuery, 'next')}
            title="Next match (Enter)"
            aria-label="Next match"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="2,4 6,8 10,4" />
            </svg>
          </button>
          <button
            className="btn-icon btn-ghost rounded p-1"
            onClick={closeSearch}
            title="Close search (Escape)"
            aria-label="Close search"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 1l8 8M9 1l-8 8" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Terminal Containers ── */}
      <div ref={containerWrapperRef} className="flex-1 relative overflow-hidden">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            ref={(el) => terminalContainerRef(tab.id, el)}
            className="absolute inset-0"
            style={{
              display: tab.id === activeTabId ? 'block' : 'none',
              backgroundColor: '#0a0a0f',
            }}
          >
            {/* xterm.js Terminal is attached to this div */}

            {/* Exit overlay */}
            {tab.hasExited && (
              <div className="absolute inset-0 flex items-center justify-center bg-[rgba(10,10,15,0.7)] z-10">
                <div className="flex flex-col items-center gap-3 p-6 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]">
                  <div className="text-sm text-[var(--text-primary)] font-medium">
                    Terminal process exited
                    {tab.exitCode !== null && (
                      <span className="text-[var(--text-muted)]"> (code: {tab.exitCode})</span>
                    )}
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => restartTerminal(tab.id)}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M2 6a4 4 0 0 1 7-2.5M10 6a4 4 0 0 1-7 2.5" />
                      <polyline points="10,1.5 10,4 7.5,4" />
                    </svg>
                    Restart Terminal
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Empty state */}
        {tabs.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-[var(--text-muted)]">
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity={0.4}
              >
                <rect x="4" y="6" width="24" height="20" rx="2" />
                <polyline points="10,14 14,17 10,20" />
                <line x1="17" y1="20" x2="22" y2="20" />
              </svg>
              <span className="text-xs">No terminal open</span>
              <button className="btn btn-secondary btn-sm" onClick={createTerminal}>
                Open Terminal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Context Menu ── */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="context-menu-item" onClick={handleCopy}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="4" y="4" width="6" height="6" rx="1" />
              <path d="M8 4V2.5A1 1 0 0 0 7 1.5H2.5A1 1 0 0 0 1.5 2.5V7a1 1 0 0 0 1 1H4" />
            </svg>
            <span>Copy</span>
            <span className="ml-auto text-[10px] text-[var(--text-muted)]">Ctrl+Shift+C</span>
          </div>
          <div className="context-menu-item" onClick={handlePaste}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 1h4v2H4zM3 3h6v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3z" />
            </svg>
            <span>Paste</span>
            <span className="ml-auto text-[10px] text-[var(--text-muted)]">Ctrl+V</span>
          </div>
          <div className="context-menu-separator" />
          <div className="context-menu-item" onClick={handleSelectAll}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="1" y="1" width="10" height="10" rx="1" />
              <line x1="1" y1="4" x2="11" y2="4" />
            </svg>
            <span>Select All</span>
          </div>
          <div className="context-menu-item" onClick={handleClear}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="2" x2="10" y2="10" />
              <line x1="10" y1="2" x2="2" y2="10" />
            </svg>
            <span>Clear</span>
          </div>
          <div className="context-menu-separator" />
          <div
            className="context-menu-item"
            onClick={() => {
              setShowSearch(true);
              setContextMenu(null);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="5" cy="5" r="3.5" />
              <line x1="7.5" y1="7.5" x2="10.5" y2="10.5" />
            </svg>
            <span>Find</span>
            <span className="ml-auto text-[10px] text-[var(--text-muted)]">Ctrl+F</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TerminalPanel;
