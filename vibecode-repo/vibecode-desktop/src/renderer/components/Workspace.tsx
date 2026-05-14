import React, { useState, useCallback } from 'react';

interface WorkspaceProps {
  className?: string;
}

interface OpenFile {
  path: string;
  name: string;
  content: string;
  language: string;
  modified: boolean;
}

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  json: 'json',
  md: 'markdown',
  css: 'css',
  html: 'html',
  yml: 'yaml',
  yaml: 'yaml',
  rs: 'rust',
  go: 'go',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  txt: 'text',
};

const getLanguage = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return LANGUAGE_MAP[ext] || 'text';
};

const SYNTAX_COLORS: Record<string, string> = {
  keyword: '#c792ea',
  string: '#c3e88d',
  number: '#f78c6c',
  comment: '#546e7a',
  function: '#82aaff',
  type: '#ffcb6b',
  operator: '#89ddff',
  tag: '#f07178',
  attribute: '#ffcb6b',
  default: '#e8e8f0',
};

const highlightSyntax = (content: string, language: string): string => {
  if (language === 'text' || !content) {
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  let escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Comments (single-line)
  escaped = escaped.replace(
    /(\/\/.*$)/gm,
    `<span style="color:${SYNTAX_COLORS.comment}">$1</span>`,
  );

  // Comments (multi-line)
  escaped = escaped.replace(
    /(\/\*[\s\S]*?\*\/)/g,
    `<span style="color:${SYNTAX_COLORS.comment}">$1</span>`,
  );

  // Strings (double-quoted)
  escaped = escaped.replace(
    /("(?:[^"\\]|\\.)*")/g,
    `<span style="color:${SYNTAX_COLORS.string}">$1</span>`,
  );

  // Strings (single-quoted)
  escaped = escaped.replace(
    /('(?:[^'\\]|\\.)*')/g,
    `<span style="color:${SYNTAX_COLORS.string}">$1</span>`,
  );

  // Template literals
  escaped = escaped.replace(
    /(`(?:[^`\\]|\\.)*`)/g,
    `<span style="color:${SYNTAX_COLORS.string}">$1</span>`,
  );

  // Keywords
  const keywords = [
    'import',
    'export',
    'default',
    'from',
    'const',
    'let',
    'var',
    'function',
    'return',
    'if',
    'else',
    'for',
    'while',
    'do',
    'switch',
    'case',
    'break',
    'continue',
    'class',
    'extends',
    'new',
    'this',
    'super',
    'try',
    'catch',
    'finally',
    'throw',
    'async',
    'await',
    'yield',
    'type',
    'interface',
    'enum',
    'implements',
    'abstract',
    'private',
    'protected',
    'public',
    'static',
    'readonly',
    'declare',
    'as',
    'is',
    'in',
    'of',
    'true',
    'false',
    'null',
    'undefined',
    'void',
    'never',
    'def',
    'self',
    'print',
    'lambda',
    'elif',
    'pass',
    'raise',
    'with',
    'fn',
    'impl',
    'pub',
    'mod',
    'use',
    'mut',
    'struct',
    'trait',
    'match',
    'loop',
  ];

  const kwPattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
  escaped = escaped.replace(
    kwPattern,
    `<span style="color:${SYNTAX_COLORS.keyword}">$1</span>`,
  );

  // Numbers
  escaped = escaped.replace(
    /\b(\d+\.?\d*)\b/g,
    `<span style="color:${SYNTAX_COLORS.number}">$1</span>`,
  );

  return escaped;
};

const Workspace: React.FC<WorkspaceProps> = ({ className }) => {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState<number>(-1);

  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;

  const openFile = useCallback(
    async (filePath: string) => {
      const existingIndex = openFiles.findIndex((f) => f.path === filePath);
      if (existingIndex >= 0) {
        setActiveFileIndex(existingIndex);
        return;
      }

      try {
        const result = await window.vibecode?.fs.readFile(filePath);
        if (result?.success && result.data !== undefined) {
          const fileName = filePath.split('/').pop() || filePath;
          const newFile: OpenFile = {
            path: filePath,
            name: fileName,
            content: result.data,
            language: getLanguage(fileName),
            modified: false,
          };
          setOpenFiles((prev) => [...prev, newFile]);
          setActiveFileIndex(openFiles.length);
        }
      } catch {
        // File read failed
      }
    },
    [openFiles],
  );

  const closeFile = useCallback(
    (index: number, e?: React.MouseEvent) => {
      e?.stopPropagation();
      setOpenFiles((prev) => prev.filter((_, i) => i !== index));
      setActiveFileIndex((prev) => {
        if (prev >= index && prev > 0) return prev - 1;
        return prev;
      });
    },
    [],
  );

  const handleFileSave = useCallback(async () => {
    if (!activeFile) return;
    try {
      await window.vibecode?.fs.writeFile(activeFile.path, activeFile.content);
      setOpenFiles((prev) =>
        prev.map((f, i) =>
          i === activeFileIndex ? { ...f, modified: false } : f,
        ),
      );
    } catch {
      // Save failed
    }
  }, [activeFile, activeFileIndex]);

  // Keyboard shortcut for save
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleFileSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFileSave]);

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (activeFileIndex < 0) return;
      setOpenFiles((prev) =>
        prev.map((f, i) =>
          i === activeFileIndex
            ? { ...f, content: e.target.value, modified: true }
            : f,
        ),
      );
    },
    [activeFileIndex],
  );

  const renderBreadcrumb = () => {
    if (!activeFile) return null;
    const parts = activeFile.path.split('/');
    return (
      <div className="flex items-center gap-1 px-4 py-1.5 text-xs text-text-muted">
        {parts.map((part, index) => (
          <React.Fragment key={index}>
            {index > 0 && (
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-text-muted opacity-50"
              >
                <polyline points="3,2 7,5 3,8" />
              </svg>
            )}
            <span
              className={
                index === parts.length - 1
                  ? 'text-text-secondary'
                  : 'hover:text-text-primary cursor-pointer'
              }
            >
              {part}
            </span>
          </React.Fragment>
        ))}
      </div>
    );
  };

  const renderEmptyState = () => (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-bg-tertiary">
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-text-muted"
        >
          <path d="M8 8h10l4 4h10a2 2 0 012 2v18a2 2 0 01-2 2H8a2 2 0 01-2-2V10a2 2 0 012-2z" />
          <path d="M16 22h8M20 18v8" />
        </svg>
      </div>
      <h2 className="mb-2 text-xl font-semibold text-text-primary">
        Open a file or ask AI to create one
      </h2>
      <p className="mb-8 max-w-sm text-center text-sm text-text-muted">
        Use the file explorer on the left, or ask the AI assistant to generate code for you.
      </p>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <button
          className="btn btn-secondary rounded-lg"
          onClick={() => {
            /* Trigger file open dialog via IPC */
            window.vibecode?.workspace.open('').catch(() => {});
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M2 4h4l1.5 1.5H14v7H2V4z" />
          </svg>
          Open Project
        </button>
        <button
          className="btn btn-primary rounded-lg"
          onClick={() => {
            const aiInput = document.querySelector<HTMLTextAreaElement>('[data-ai-input]');
            aiInput?.focus();
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M14 2L7 9M14 2l-4 12-3-5-5-3 12-4z" />
          </svg>
          Ask AI
        </button>
      </div>

      {/* Recent Files (placeholder) */}
      <div className="mt-12 w-full max-w-md">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
          Recent
        </h3>
        <div className="space-y-1">
          {['src/App.tsx', 'lib/engine.ts', 'README.md'].map((file) => (
            <button
              key={file}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              onClick={() => openFile(file)}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-text-muted"
              >
                <path d="M2 2h4l1.5 1.5H12a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V3a1 1 0 011-1z" />
              </svg>
              {file}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className={`flex h-full flex-col bg-bg-primary ${className || ''}`}>
      {/* Tab Bar */}
      {openFiles.length > 0 && (
        <div className="flex items-center border-b border-border bg-bg-secondary overflow-x-auto scrollbar-hidden">
          {openFiles.map((file, index) => (
            <div
              key={`${file.path}-${index}`}
              className={`workspace-tab ${index === activeFileIndex ? 'active' : ''}`}
              onClick={() => setActiveFileIndex(index)}
            >
              <span className="truncate max-w-[120px]">
                {file.name}
              </span>
              {file.modified && (
                <span className="ml-1 h-2 w-2 rounded-full bg-accent" />
              )}
              <button
                className="workspace-tab-close"
                onClick={(e) => closeFile(index, e)}
                aria-label={`Close ${file.name}`}
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
                  <path d="M2 2l6 6M8 2l-6 6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Breadcrumb */}
      {renderBreadcrumb()}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeFile ? (
          <div className="flex h-full">
            {/* Line Numbers */}
            <div className="flex-shrink-0 select-none border-r border-border bg-bg-secondary px-3 py-4 text-right font-mono text-xs leading-6 text-text-muted">
              {activeFile.content.split('\n').map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>

            {/* Code Area */}
            <div className="relative flex-1 overflow-auto">
              {/* Syntax highlighted display */}
              <pre className="absolute inset-0 overflow-auto p-4 font-mono text-sm leading-6 text-text-primary">
                <code
                  dangerouslySetInnerHTML={{
                    __html: highlightSyntax(activeFile.content, activeFile.language),
                  }}
                />
              </pre>
              {/* Editable textarea overlay */}
              <textarea
                className="absolute inset-0 resize-none bg-transparent p-4 font-mono text-sm leading-6 text-transparent caret-accent outline-none"
                value={activeFile.content}
                onChange={handleContentChange}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </div>
          </div>
        ) : (
          renderEmptyState()
        )}
      </div>

      {/* Status Bar */}
      {activeFile && (
        <div className="flex items-center justify-between border-t border-border bg-bg-secondary px-4 py-1 text-xs text-text-muted">
          <div className="flex items-center gap-4">
            <span>{activeFile.language}</span>
            <span>UTF-8</span>
            <span>LF</span>
          </div>
          <div className="flex items-center gap-4">
            {activeFile.modified && <span className="text-warning">Modified</span>}
            <span>
              Ln {activeFile.content.split('\n').length}, Col 1
            </span>
            <span>{activeFile.content.length} chars</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Workspace;
