import React, { useState, useEffect, useCallback } from 'react';
import type { RecentWorkspaceInfo, CurrentWorkspaceInfo } from '../types';

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
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', json: 'json', md: 'markdown', css: 'css', html: 'html',
  yml: 'yaml', yaml: 'yaml', rs: 'rust', go: 'go', sql: 'sql',
  sh: 'bash', bash: 'bash', txt: 'text',
};

const getLanguage = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return LANGUAGE_MAP[ext] || 'text';
};

const PROJECT_TYPE_ICONS: Record<string, string> = {
  node: '🟢', python: '🐍', rust: '🦀', go: '🔵', java: '☕', generic: '📁',
};

const Workspace: React.FC<WorkspaceProps> = ({ className }) => {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState<number>(-1);
  const [currentWorkspace, setCurrentWorkspace] = useState<CurrentWorkspaceInfo | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspaceInfo[]>([]);
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;

  useEffect(() => {
    const loadWorkspaceInfo = async () => {
      try {
        const infoResult = await window.vibecode?.workspace.getInfo();
        if (infoResult?.success && infoResult.data?.workspace) {
          setCurrentWorkspace(infoResult.data.workspace);
        }
      } catch {
        // Not available
      }

      try {
        const recentResult = await window.vibecode?.workspace.recent(5);
        if (recentResult?.success && recentResult.data?.workspaces) {
          setRecentWorkspaces(recentResult.data.workspaces);
        }
      } catch {
        // Not available
      }
    };
    loadWorkspaceInfo();
  }, []);

  const openFile = useCallback(
    async (filePath: string) => {
      const existingIndex = openFiles.findIndex((f) => f.path === filePath);
      if (existingIndex >= 0) {
        setActiveFileIndex(existingIndex);
        return;
      }

      setIsLoadingFile(true);
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
      } finally {
        setIsLoadingFile(false);
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
      // ARC 16: "No Node → No Action" — Gateway MUST create the execution node FIRST
      // Only route through the gateway when the file was actually modified
      if (activeFile.modified) {
        const api = window.vibecode as any;
        if (api?.sm?.createMonacoEditNode) {
          // ARC 16: This goes through ExecutionGateway on the main process.
          // The Gateway creates the node, runs safety checks, and AUTHORIZES
          // the subsequent fs:writeFile call. If the Gateway blocks the edit,
          // the file save is also blocked.
          const gatewayResult = await api.sm.createMonacoEditNode({
            filePath: activeFile.path,
            originalContent: '',  // Workspace doesn't track original content
            newContent: activeFile.content,
            isAI: false,
          });

          if (!gatewayResult?.success) {
            // Gateway BLOCKED this edit — do NOT save the file
            console.error('[VibeCode/ARC16] Gateway blocked file save:', gatewayResult?.error);
            return;
          }
        } else {
          // No gateway available — this is a bypass; log warning
          console.warn('[VibeCode/ARC16] No gateway available for Workspace edit tracking');
        }
      }
      await window.vibecode?.fs.writeFile(activeFile.path, activeFile.content);
      setOpenFiles((prev) =>
        prev.map((f, i) =>
          i === activeFileIndex ? { ...f, modified: false } : f,
        ),
      );
    } catch (e) {
      // Gateway threw or save failed — safety block
      console.error('[VibeCode/ARC16] File save rejected:', e);
    }
  }, [activeFile, activeFileIndex]);

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

  const handleOpenWorkspace = useCallback(async () => {
    try {
      const result = await window.vibecode?.workspace.open('');
      if (result?.success && result.data?.workspace) {
        const ws = result.data.workspace;
        setCurrentWorkspace({
          rootPath: ws.rootPath,
          name: ws.name,
          type: ws.type,
          hasGit: ws.hasGit,
          totalFiles: ws.totalFiles,
          languages: ws.languages,
        });
        setOpenFiles([]);
        setActiveFileIndex(-1);
        const recentResult = await window.vibecode?.workspace.recent(5);
        if (recentResult?.success && recentResult.data?.workspaces) {
          setRecentWorkspaces(recentResult.data.workspaces);
        }
      }
    } catch {
      // Open failed
    }
  }, []);

  const formatTimeAgo = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const renderBreadcrumb = () => {
    if (!activeFile) return null;
    const parts = activeFile.path.split('/');
    return (
      <div className="flex items-center gap-1 px-4 py-1.5 text-xs text-text-muted bg-bg-base/50">
        {parts.map((part, index) => (
          <React.Fragment key={index}>
            {index > 0 && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted opacity-40">
                <polyline points="3,2 7,5 3,8" />
              </svg>
            )}
            <span className={index === parts.length - 1 ? 'text-text-primary font-medium' : 'text-text-muted hover:text-text-secondary cursor-pointer transition-colors'}>
              {part}
            </span>
          </React.Fragment>
        ))}
      </div>
    );
  };

  const renderEmptyState = () => (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-bg-elevated">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-text-muted">
          <path d="M8 8h10l4 4h10a2 2 0 012 2v18a2 2 0 01-2 2H8a2 2 0 01-2-2V10a2 2 0 012-2z" />
          <path d="M16 22h8M20 18v8" />
        </svg>
      </div>
      <h2 className="mb-2 text-sm font-semibold text-text-primary">
        {currentWorkspace ? currentWorkspace.name : 'Open a workspace to get started'}
      </h2>
      <p className="mb-6 max-w-sm text-center text-xs text-text-muted">
        {currentWorkspace
          ? 'Use the file explorer on the left, or ask the AI assistant to generate code.'
          : 'Choose a project directory to start coding with AI assistance.'}
      </p>

      <div className="flex gap-2">
        <button className="btn btn-secondary rounded-md btn-sm" onClick={handleOpenWorkspace}>
          {currentWorkspace ? 'Switch Workspace' : 'Open Project'}
        </button>
        <button
          className="btn btn-primary rounded-md btn-sm"
          onClick={() => {
            const aiInput = document.querySelector<HTMLTextAreaElement>('[data-ai-input]');
            aiInput?.focus();
          }}
        >
          Ask AI
        </button>
      </div>

      {recentWorkspaces.length > 0 && (
        <div className="mt-8 w-full max-w-md">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Recent Workspaces
          </h3>
          <div className="space-y-1">
            {recentWorkspaces.map((ws) => (
              <button
                key={ws.path}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                onClick={async () => {
                  try {
                    const result = await window.vibecode?.workspace.switchWorkspace(ws.path);
                    if (result?.success && result.data?.workspace) {
                      setCurrentWorkspace(result.data.workspace);
                      setOpenFiles([]);
                      setActiveFileIndex(-1);
                    }
                  } catch {
                    // Switch failed
                  }
                }}
              >
                <span className="flex-shrink-0 text-sm">{PROJECT_TYPE_ICONS[ws.projectType] ?? '📁'}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{ws.name}</div>
                  <div className="truncate text-[10px] text-text-muted">{ws.path}</div>
                </div>
                <span className="flex-shrink-0 text-[10px] text-text-muted">{formatTimeAgo(ws.lastOpened)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className={`flex h-full flex-col bg-bg-base ${className || ''}`}>
      {openFiles.length > 0 && (
        <div className="flex items-center border-b border-border bg-bg-deep overflow-x-auto scrollbar-hidden" style={{ height: '35px' }}>
          {openFiles.map((file, index) => (
            <div
              key={`${file.path}-${index}`}
              className={`editor-tab ${index === activeFileIndex ? 'active' : ''}`}
              onClick={() => setActiveFileIndex(index)}
            >
              <span className="truncate max-w-[120px]">{file.name}</span>
              {file.modified && (
                <span className="ml-1 h-2 w-2 rounded-full bg-accent" />
              )}
              <button className="editor-tab-close" onClick={(e) => closeFile(index, e)} aria-label={`Close ${file.name}`}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 2l6 6M8 2l-6 6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {renderBreadcrumb()}

      <div className="flex-1 overflow-hidden">
        {activeFile ? (
          <div className="flex h-full">
            <div className="flex-shrink-0 select-none border-r border-border bg-bg-deep px-3 py-4 text-right font-mono text-xs leading-6 text-text-muted">
              {activeFile.content.split('\n').map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>

            <div className="relative flex-1 overflow-auto">
              <pre className="absolute inset-0 overflow-auto p-4 font-mono text-xs leading-6 text-text-primary whitespace-pre">
                {activeFile.content}
              </pre>
              <textarea
                className="absolute inset-0 resize-none bg-transparent p-4 font-mono text-xs leading-6 text-transparent caret-accent outline-none"
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

      {activeFile && (
        <div className="status-bar">
          <div className="status-bar-section">
            <span className="status-bar-item">{activeFile.language}</span>
            <span className="status-bar-item">UTF-8</span>
            <span className="status-bar-item">LF</span>
          </div>
          <div className="status-bar-section">
            {activeFile.modified && <span className="status-bar-item" style={{ color: 'var(--warning)' }}>Modified</span>}
            <span className="status-bar-item">Ln {activeFile.content.split('\n').length}, Col 1</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Workspace;
