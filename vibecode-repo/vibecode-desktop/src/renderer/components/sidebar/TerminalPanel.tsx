import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { TerminalInstance } from '../../types';

const ANSI_COLORS: Record<string, string> = {
  '30': '#555570',   // black
  '31': '#ef4444',   // red
  '32': '#22c55e',   // green
  '33': '#eab308',   // yellow
  '34': '#3b82f6',   // blue
  '35': '#a855f7',   // magenta
  '36': '#06b6d4',   // cyan
  '37': '#e8e8f0',   // white
  '90': '#8888a0',   // bright black
  '91': '#f87171',   // bright red
  '92': '#4ade80',   // bright green
  '93': '#facc15',   // bright yellow
  '94': '#60a5fa',   // bright blue
  '95': '#c084fc',   // bright magenta
  '96': '#22d3ee',   // bright cyan
  '97': '#f8f8f8',   // bright white
};

const parseAnsi = (text: string): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  const regex = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let currentColor = '';
  let partIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    // Add text before this escape
    if (match.index > lastIndex) {
      const segment = text.slice(lastIndex, match.index);
      parts.push(
        <span key={partIndex++} style={currentColor ? { color: currentColor } : undefined}>
          {segment}
        </span>,
      );
    }

    // Parse the color code
    const codes = match[1].split(';');
    const mainCode = codes[codes.length - 1];

    if (mainCode === '0' || mainCode === '') {
      currentColor = ''; // Reset
    } else if (ANSI_COLORS[mainCode]) {
      currentColor = ANSI_COLORS[mainCode];
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const segment = text.slice(lastIndex);
    parts.push(
      <span key={partIndex++} style={currentColor ? { color: currentColor } : undefined}>
        {segment}
      </span>,
    );
  }

  return parts.length > 0 ? parts : [text];
};

const TerminalPanel: React.FC = () => {
  const [terminals, setTerminals] = useState<TerminalInstance[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string>('');
  const [inputValue, setInputValue] = useState('');
  const terminalOutputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeTerminal = terminals.find((t) => t.id === activeTerminalId);

  // Auto-scroll on new output
  useEffect(() => {
    if (terminalOutputRef.current) {
      terminalOutputRef.current.scrollTop = terminalOutputRef.current.scrollHeight;
    }
  }, [terminals]);

  // Create a default terminal on mount
  useEffect(() => {
    createTerminal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for terminal data
  useEffect(() => {
    if (!window.vibecode?.terminal) return;

    window.vibecode.terminal.onData((id: string, data: string) => {
      setTerminals((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, history: [...t.history, data] }
            : t,
        ),
      );
    });
  }, []);

  const createTerminal = useCallback(async () => {
    try {
      const result = await window.vibecode?.terminal.create();
      if (result?.success && result.id) {
        const newTerminal: TerminalInstance = {
          id: result.id,
          cwd: process.env.HOME || '~',
          history: [`\x1b[32m$ Terminal ready (${result.id.slice(0, 6)})\x1b[0m\n`],
          active: true,
        };
        setTerminals((prev) => [...prev, newTerminal]);
        setActiveTerminalId(result.id);
      }
    } catch {
      // Create a mock terminal if IPC is not available
      const mockId = `term-${Date.now()}`;
      const newTerminal: TerminalInstance = {
        id: mockId,
        cwd: '~',
        history: ['\x1b[32m$ Terminal ready (local)\x1b[0m\n'],
        active: true,
      };
      setTerminals((prev) => [...prev, newTerminal]);
      setActiveTerminalId(mockId);
    }
  }, []);

  const closeTerminal = useCallback(
    (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      setTerminals((prev) => {
        const filtered = prev.filter((t) => t.id !== id);
        if (activeTerminalId === id && filtered.length > 0) {
          setActiveTerminalId(filtered[filtered.length - 1].id);
        } else if (filtered.length === 0) {
          setActiveTerminalId('');
        }
        return filtered;
      });
      try {
        window.vibecode?.terminal.kill(id);
      } catch {
        // Kill failed
      }
    },
    [activeTerminalId],
  );

  const handleCommand = useCallback(async () => {
    if (!inputValue.trim() || !activeTerminal) return;

    const command = inputValue.trim();
    setInputValue('');

    // Add command to output
    const commandLine = `\x1b[90m${activeTerminal.cwd}\x1b[0m $ ${command}\n`;

    setTerminals((prev) =>
      prev.map((t) =>
        t.id === activeTerminalId
          ? { ...t, history: [...t.history, commandLine] }
          : t,
      ),
    );

    // Process some basic commands locally for demo
    if (command === 'clear') {
      setTerminals((prev) =>
        prev.map((t) =>
          t.id === activeTerminalId ? { ...t, history: [] } : t,
        ),
      );
      return;
    }

    if (command === 'help') {
      const helpText = [
        '\x1b[33mAvailable commands:\x1b[0m',
        '  clear   - Clear the terminal',
        '  help    - Show this help message',
        '  pwd     - Print working directory',
        '  ls      - List files',
        '  echo    - Print text',
        '\n',
      ].join('\n');
      setTerminals((prev) =>
        prev.map((t) =>
          t.id === activeTerminalId
            ? { ...t, history: [...t.history, helpText] }
            : t,
        ),
      );
      return;
    }

    if (command === 'pwd') {
      setTerminals((prev) =>
        prev.map((t) =>
          t.id === activeTerminalId
            ? { ...t, history: [...t.history, `${t.cwd}\n`] }
            : t,
        ),
      );
      return;
    }

    if (command.startsWith('echo ')) {
      const text = command.slice(5);
      setTerminals((prev) =>
        prev.map((t) =>
          t.id === activeTerminalId
            ? { ...t, history: [...t.history, `${text}\n`] }
            : t,
        ),
      );
      return;
    }

    // Try to send to IPC
    try {
      if (window.vibecode?.terminal) {
        await window.vibecode.terminal.write(activeTerminalId, command + '\n');
      } else {
        // Mock response
        setTerminals((prev) =>
          prev.map((t) =>
            t.id === activeTerminalId
              ? {
                  ...t,
                  history: [
                    ...t.history,
                    `\x1b[31mcommand not found: ${command.split(' ')[0]}\x1b[0m\n`,
                  ],
                }
              : t,
          ),
        );
      }
    } catch {
      setTerminals((prev) =>
        prev.map((t) =>
          t.id === activeTerminalId
            ? {
                ...t,
                history: [
                  ...t.history,
                  '\x1b[31mFailed to execute command\x1b[0m\n',
                ],
              }
            : t,
        ),
      );
    }
  }, [inputValue, activeTerminal, activeTerminalId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCommand();
      }
    },
    [handleCommand],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Terminal Tabs */}
      <div className="flex items-center border-b border-border bg-bg-primary px-2 py-1">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hidden">
          {terminals.map((term) => (
            <div
              key={term.id}
              className={`terminal-tab flex items-center gap-1 ${
                term.id === activeTerminalId ? 'active' : ''
              }`}
              onClick={() => setActiveTerminalId(term.id)}
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
                <polyline points="2,3 5,5 2,7" />
                <line x1="6" y1="7" x2="8" y2="7" />
              </svg>
              <span className="text-xs">
                {term.id.slice(0, 8)}
              </span>
              <button
                className="ml-1 rounded p-0.5 opacity-0 hover:bg-bg-hover group-hover:opacity-100"
                style={{ opacity: terminals.length > 1 ? 0.5 : 0 }}
                onClick={(e) => closeTerminal(term.id, e)}
                aria-label={`Close terminal ${term.id}`}
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M1 1l6 6M7 1l-6 6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <button
          className="btn-icon btn-ghost ml-1 rounded p-1"
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

      {/* Terminal Output */}
      <div
        className="terminal-container flex-1 scrollbar-custom"
        ref={terminalOutputRef}
        onClick={() => inputRef.current?.focus()}
      >
        {activeTerminal ? (
          activeTerminal.history.map((line, index) => (
            <div key={index} className="terminal-line">
              {parseAnsi(line)}
            </div>
          ))
        ) : (
          <div className="flex h-full items-center justify-center text-text-muted">
            No terminal open
          </div>
        )}
      </div>

      {/* Terminal Input */}
      <div className="flex items-center border-t border-border bg-bg-primary px-3 py-1.5">
        <span className="mr-2 text-xs text-success">$</span>
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent font-mono text-xs text-text-primary outline-none placeholder:text-text-muted"
          placeholder="Type a command..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </div>
    </div>
  );
};

export default TerminalPanel;
