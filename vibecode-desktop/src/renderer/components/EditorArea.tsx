import React, { useState, useEffect, useCallback, useRef } from 'react';
import Editor, { type OnMount, type OnChange, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import type { editor as MonacoEditor } from 'monaco-editor';
import type { CurrentWorkspaceInfo, DiffResult } from '../types';

// ─── AI Integration Imports ──────────────────────────────────────────────────
import {
  attachAIIntegration,
  showInlineDiff,
  clearInlineDiffs,
  showGhostText,
  clearGhostText,
  highlightEditRegion,
  clearEditRegion,
  scrollToEdit,
  acceptAllChanges,
  rejectAllChanges,
  getTrackedChangesList,
  acceptChange,
  rejectChange,
} from './editor/MonacoAIIntegration';
import AIEditorOverlay from './editor/AIEditorOverlay';

// ─── Configure Monaco to use local install (not CDN) ─────────────────────────
// This is essential for Electron where CSP blocks CDN and offline support is needed.

loader.config({ monaco });

// ─── Worker setup ─────────────────────────────────────────────────────────────
// Vite provides ?worker import syntax for web workers

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') {
      return new JsonWorker();
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new CssWorker();
    }
    if (label === 'typescript' || label === 'javascript') {
      return new TsWorker();
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new HtmlWorker();
    }
    return new EditorWorker();
  },
};

// ─── Open File Model ──────────────────────────────────────────────────────────

interface OpenFile {
  path: string;
  name: string;
  content: string;
  language: string;
  modified: boolean;
  originalContent: string;
  model: MonacoEditor.ITextModel | null;
  viewState: MonacoEditor.ICodeEditorViewState | null;
}

// ─── Language Map ──────────────────────────────────────────────────────────────

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  json: 'json',
  md: 'markdown',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  yml: 'yaml',
  yaml: 'yaml',
  rs: 'rust',
  go: 'go',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  txt: 'plaintext',
  xml: 'xml',
  svg: 'xml',
  dockerfile: 'dockerfile',
  gitignore: 'plaintext',
  env: 'plaintext',
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  vue: 'html',
  svelte: 'html',
  graphql: 'graphql',
  gql: 'graphql',
  dart: 'dart',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  rb: 'ruby',
  php: 'php',
  lua: 'lua',
  r: 'r',
  zig: 'zig',
};

const getLanguage = (filename: string): string => {
  const lower = filename.toLowerCase();
  // Handle special filenames
  if (lower === 'dockerfile') return 'dockerfile';
  if (lower === '.gitignore') return 'plaintext';
  if (lower === '.env' || lower.startsWith('.env.')) return 'plaintext';
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return LANGUAGE_MAP[ext] || 'plaintext';
};

// ─── File Icon Colors ─────────────────────────────────────────────────────────

const FILE_ICON_COLORS: Record<string, string> = {
  ts: '#3178c6',
  tsx: '#3178c6',
  js: '#f7df1e',
  jsx: '#f7df1e',
  py: '#3776ab',
  json: '#f7df1e',
  css: '#1572b6',
  html: '#e34c26',
  md: '#e4e4e9',
  rs: '#dea584',
  go: '#00add8',
  sql: '#e38c00',
};

// ─── Custom Monaco Theme ──────────────────────────────────────────────────────

const vibecodeDarkTheme = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [
    { token: 'comment', foreground: '65657a', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c792ea' },
    { token: 'string', foreground: 'c3e88d' },
    { token: 'number', foreground: 'f78c6c' },
    { token: 'regexp', foreground: '89ddff' },
    { token: 'type', foreground: 'ffcb6b' },
    { token: 'class', foreground: 'ffcb6b' },
    { token: 'function', foreground: '82aaff' },
    { token: 'variable', foreground: 'e4e4e9' },
    { token: 'variable.predefined', foreground: '82aaff' },
    { token: 'constant', foreground: 'f78c6c' },
    { token: 'tag', foreground: 'f07178' },
    { token: 'attribute.name', foreground: 'c792ea' },
    { token: 'attribute.value', foreground: 'c3e88d' },
    { token: 'delimiter', foreground: '89ddff' },
    { token: 'delimiter.html', foreground: '89ddff' },
    { token: 'meta.tag', foreground: 'f07178' },
  ],
  colors: {
    'editor.background': '#0a0a0f',
    'editor.foreground': '#e4e4e9',
    'editor.lineHighlightBackground': '#0f0f1520',
    'editor.selectionBackground': '#6366f130',
    'editor.inactiveSelectionBackground': '#6366f115',
    'editorLineNumber.foreground': '#65657a',
    'editorLineNumber.activeForeground': '#a0a0ae',
    'editorCursor.foreground': '#6366f1',
    'editor.findMatchBackground': '#6366f130',
    'editor.findMatchHighlightBackground': '#6366f115',
    'editorIndentGuide.background': '#ffffff08',
    'editorIndentGuide.activeBackground': '#ffffff12',
    'editorBracketMatch.background': '#6366f120',
    'editorBracketMatch.border': '#6366f150',
    'editorOverviewRuler.border': '#00000000',
    'scrollbarSlider.background': '#ffffff10',
    'scrollbarSlider.hoverBackground': '#ffffff20',
    'scrollbarSlider.activeBackground': '#ffffff30',
  },
};

// ─── Editor Area Component ────────────────────────────────────────────────────

interface EditorAreaProps {
  className?: string;
}

const EditorArea: React.FC<EditorAreaProps> = ({ className }) => {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState<number>(-1);
  const [currentWorkspace, setCurrentWorkspace] = useState<CurrentWorkspaceInfo | null>(null);
  const [themeRegistered, setThemeRegistered] = useState(false);

  // ─── AI State ────────────────────────────────────────────────────────────
  const [aiStatus, setAiStatus] = useState<'idle' | 'thinking' | 'streaming' | 'editing' | 'error'>('idle');
  const [hasDiffs, setHasDiffs] = useState(false);
  const [diffCount, setDiffCount] = useState(0);
  const [aiProgress, setAiProgress] = useState(0);

  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const openFilesRef = useRef<OpenFile[]>(openFiles);
  const activeFileIndexRef = useRef<number>(activeFileIndex);
  const aiIntegrationRef = useRef<{ dispose: () => void; codeActions: monaco.IDisposable } | null>(null);

  // Keep refs in sync
  useEffect(() => {
    openFilesRef.current = openFiles;
  }, [openFiles]);
  useEffect(() => {
    activeFileIndexRef.current = activeFileIndex;
  }, [activeFileIndex]);

  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;

  // ─── Load workspace info ──────────────────────────────────────────────────

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
    };
    loadWorkspaceInfo();
  }, []);

  // ─── Listen for file open events ──────────────────────────────────────────

  useEffect(() => {
    const handleOpenFile = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const filePath = customEvent.detail?.path;
      if (!filePath) return;

      const existingIndex = openFilesRef.current.findIndex(
        (f) => f.path === filePath,
      );
      if (existingIndex >= 0) {
        setActiveFileIndex(existingIndex);
        return;
      }

      try {
        const result = await window.vibecode?.fs.readFile(filePath);
        if (result?.success && result.data !== undefined) {
          const fileName = filePath.split('/').pop() || filePath;
          const content = result.data;
          const newFile: OpenFile = {
            path: filePath,
            name: fileName,
            content,
            language: getLanguage(fileName),
            modified: false,
            originalContent: content,
            model: null,
            viewState: null,
          };
          setOpenFiles((prev) => [...prev, newFile]);
          setActiveFileIndex(openFilesRef.current.length);
        }
      } catch {
        // File read failed
      }
    };

    window.addEventListener('vibecode:open-file', handleOpenFile);
    return () => window.removeEventListener('vibecode:open-file', handleOpenFile);
  }, []);

  // ─── Close file ────────────────────────────────────────────────────────────

  const closeFile = useCallback(
    (index: number, e?: React.MouseEvent) => {
      e?.stopPropagation();

      // Save view state of active file before closing
      if (editorRef.current && activeFileIndexRef.current >= 0) {
        const vs = editorRef.current.saveViewState();
        setOpenFiles((prev) =>
          prev.map((f, i) =>
            i === activeFileIndexRef.current ? { ...f, viewState: vs } : f,
          ),
        );
      }

      setOpenFiles((prev) => {
        const closed = prev.filter((_, i) => i !== index);
        // Dispose models
        const removed = prev[index];
        if (removed?.model) {
          removed.model.dispose();
        }
        return closed;
      });
      setActiveFileIndex((prev) => {
        if (prev >= index && prev > 0) return prev - 1;
        if (prev >= index && prev === 0) return -1;
        return prev;
      });
    },
    [],
  );

  // ─── Save file ─────────────────────────────────────────────────────────────

  const handleFileSave = useCallback(async () => {
    const file = openFilesRef.current[activeFileIndexRef.current];
    if (!file) return;

    try {
      await window.vibecode?.fs.writeFile(file.path, file.content);
      setOpenFiles((prev) =>
        prev.map((f, i) =>
          i === activeFileIndexRef.current
            ? { ...f, modified: false, originalContent: f.content }
            : f,
        ),
      );
    } catch {
      // Save failed
    }
  }, []);

  // ─── Keyboard shortcut for save ────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleFileSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFileSave]);

  // ─── Listen for vibecode:save-file event (from IDEView) ────────────────────

  useEffect(() => {
    const handleSave = () => {
      handleFileSave();
    };
    window.addEventListener('vibecode:save-file', handleSave);
    return () => window.removeEventListener('vibecode:save-file', handleSave);
  }, [handleFileSave]);

  // ─── AI Event Handlers ─────────────────────────────────────────────────────

  // Helper to update diff state from the editor
  const refreshDiffState = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const changes = getTrackedChangesList(editor);
    const count = changes.length;
    setDiffCount(count);
    setHasDiffs(count > 0);
  }, []);

  // Accept all changes handler
  const handleAcceptAll = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    acceptAllChanges(editor);
    setHasDiffs(false);
    setDiffCount(0);
  }, []);

  // Reject all changes handler
  const handleRejectAll = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    rejectAllChanges(editor);
    setHasDiffs(false);
    setDiffCount(0);
  }, []);

  // Accept single change handler
  const handleAcceptChange = useCallback((id: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    acceptChange(editor, id);
    refreshDiffState();
  }, [refreshDiffState]);

  // Reject single change handler
  const handleRejectChange = useCallback((id: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    rejectChange(editor, id);
    refreshDiffState();
  }, [refreshDiffState]);

  // ─── Listen for AI custom events ───────────────────────────────────────────

  useEffect(() => {
    // vibecode:ai-action — forward AI code actions to the AI panel
    const handleAIAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      // Re-dispatch so the AIPanel (or other consumers) can pick it up
      window.dispatchEvent(
        new CustomEvent('vibecode:ai-panel-action', {
          detail: customEvent.detail,
        }),
      );
    };

    // vibecode:ai-status-change — update the overlay status
    const handleAIStatusChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      const newStatus = customEvent.detail?.status;
      if (newStatus && ['idle', 'thinking', 'streaming', 'editing', 'error'].includes(newStatus)) {
        setAiStatus(newStatus);
      }
      const newProgress = customEvent.detail?.progress;
      if (typeof newProgress === 'number') {
        setAiProgress(newProgress);
      }
    };

    // vibecode:show-diff — show diff decorations in the editor
    const handleShowDiff = (e: Event) => {
      const customEvent = e as CustomEvent;
      const diffResult = customEvent.detail?.diffResult as DiffResult | undefined;
      const editor = editorRef.current;
      if (!editor || !diffResult) return;
      showInlineDiff(editor, diffResult);
      refreshDiffState();
      scrollToEdit(editor);
    };

    // vibecode:clear-diffs — clear all diff decorations
    const handleClearDiffs = () => {
      const editor = editorRef.current;
      if (!editor) return;
      clearInlineDiffs(editor);
      setHasDiffs(false);
      setDiffCount(0);
    };

    // vibecode:show-ghost-text — show ghost text suggestion
    const handleShowGhostText = (e: Event) => {
      const customEvent = e as CustomEvent;
      const text = customEvent.detail?.text as string | undefined;
      const position = customEvent.detail?.position as monaco.IPosition | undefined;
      const editor = editorRef.current;
      if (!editor || !text || !position) return;
      showGhostText(editor, text, position);
    };

    // vibecode:clear-ghost-text — clear ghost text
    const handleClearGhostText = () => {
      const editor = editorRef.current;
      if (!editor) return;
      clearGhostText(editor);
    };

    window.addEventListener('vibecode:ai-action', handleAIAction);
    window.addEventListener('vibecode:ai-status-change', handleAIStatusChange);
    window.addEventListener('vibecode:show-diff', handleShowDiff);
    window.addEventListener('vibecode:clear-diffs', handleClearDiffs);
    window.addEventListener('vibecode:show-ghost-text', handleShowGhostText);
    window.addEventListener('vibecode:clear-ghost-text', handleClearGhostText);

    return () => {
      window.removeEventListener('vibecode:ai-action', handleAIAction);
      window.removeEventListener('vibecode:ai-status-change', handleAIStatusChange);
      window.removeEventListener('vibecode:show-diff', handleShowDiff);
      window.removeEventListener('vibecode:clear-diffs', handleClearDiffs);
      window.removeEventListener('vibecode:show-ghost-text', handleShowGhostText);
      window.removeEventListener('vibecode:clear-ghost-text', handleClearGhostText);
    };
  }, [refreshDiffState]);

  // ─── Cleanup AI integration on unmount ─────────────────────────────────────

  useEffect(() => {
    return () => {
      if (aiIntegrationRef.current) {
        aiIntegrationRef.current.dispose();
        aiIntegrationRef.current = null;
      }
    };
  }, []);

  // ─── Monaco editor mount ───────────────────────────────────────────────────

  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Register custom theme
      monaco.editor.defineTheme('vibecode-dark', vibecodeDarkTheme as any);
      monaco.editor.setTheme('vibecode-dark');
      setThemeRegistered(true);

      // Configure editor settings
      editor.updateOptions({
        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
        fontSize: 13,
        lineHeight: 20,
        fontLigatures: true,
        minimap: { enabled: true, scale: 1, showSlider: 'mouseover' },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        renderLineHighlight: 'line',
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
        padding: { top: 8, bottom: 8 },
        scrollbar: {
          verticalScrollbarSize: 6,
          horizontalScrollbarSize: 6,
          useShadows: false,
        },
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        automaticLayout: true,
        wordWrap: 'off',
        tabSize: 2,
      });

      // Cmd+S / Ctrl+S inside Monaco
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        handleFileSave();
      });

      // Restore view state for the active file if available
      const currentFile = openFilesRef.current[activeFileIndexRef.current];
      if (currentFile?.viewState) {
        editor.restoreViewState(currentFile.viewState);
      }

      // ── Attach AI integration ───────────────────────────────────────────
      // Dispose previous integration if editor is re-mounted
      if (aiIntegrationRef.current) {
        aiIntegrationRef.current.dispose();
      }
      aiIntegrationRef.current = attachAIIntegration(editor);
    },
    [handleFileSave],
  );

  // ─── Handle content changes from Monaco ────────────────────────────────────

  const handleContentChange: OnChange = useCallback(
    (value) => {
      if (activeFileIndexRef.current < 0) return;
      const newValue = value ?? '';
      setOpenFiles((prev) =>
        prev.map((f, i) =>
          i === activeFileIndexRef.current
            ? {
                ...f,
                content: newValue,
                modified: newValue !== f.originalContent,
              }
            : f,
        ),
      );
    },
    [],
  );

  // ─── Switch file: save view state, restore new one ─────────────────────────

  useEffect(() => {
    if (!editorRef.current) return;

    // When switching away from a previous file, save its view state
    // This is handled implicitly because the editor's model changes

    // Restore view state for the new active file
    const file = openFiles[activeFileIndex];
    if (file?.viewState) {
      editorRef.current.restoreViewState(file.viewState);
    }
    editorRef.current.focus();
  }, [activeFileIndex, openFiles]);

  // ─── Open workspace button ─────────────────────────────────────────────────

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
        // Clean up all open file models
        openFiles.forEach((f) => f.model?.dispose());
        setOpenFiles([]);
        setActiveFileIndex(-1);
      }
    } catch {
      // Open failed
    }
  }, [openFiles]);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const getFileIconColor = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    return FILE_ICON_COLORS[ext] || '#a0a0ae';
  };

  // ─── Breadcrumbs ───────────────────────────────────────────────────────────

  const renderBreadcrumb = () => {
    if (!activeFile) return null;
    const parts = activeFile.path.split('/');
    return (
      <div className="flex items-center gap-1 px-4 py-1 text-xs text-text-muted bg-bg-base/50 border-b border-border">
        {parts.map((part, index) => (
          <React.Fragment key={index}>
            {index > 0 && (
              <svg
                width="8"
                height="8"
                viewBox="0 0 8 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-text-muted opacity-30"
              >
                <polyline points="2,1 6,4 2,7" />
              </svg>
            )}
            <span
              className={
                index === parts.length - 1
                  ? 'text-text-primary font-medium'
                  : 'text-text-muted hover:text-text-secondary cursor-pointer transition-colors'
              }
            >
              {part}
            </span>
          </React.Fragment>
        ))}
      </div>
    );
  };

  // ─── Empty state ───────────────────────────────────────────────────────────

  const renderEmptyState = () => (
    <div className="flex h-full flex-col items-center justify-center bg-bg-base">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-bg-elevated">
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          className="text-text-muted opacity-50"
        >
          <path d="M8 8h10l4 4h10a2 2 0 012 2v18a2 2 0 01-2 2H8a2 2 0 01-2-2V10a2 2 0 012-2z" />
          <path d="M16 22h8M20 18v8" />
        </svg>
      </div>
      <h2 className="mb-1 text-sm font-semibold text-text-primary">
        {currentWorkspace ? currentWorkspace.name : 'Open a workspace to get started'}
      </h2>
      <p className="mb-6 max-w-sm text-center text-xs text-text-muted">
        {currentWorkspace
          ? 'Use the file explorer or ask the AI assistant to generate code.'
          : 'Choose a project directory to start coding with AI assistance.'}
      </p>

      <div className="flex gap-2">
        <button
          className="btn btn-secondary rounded-md btn-sm"
          onClick={handleOpenWorkspace}
        >
          Open Project
        </button>
        <button
          className="btn btn-primary rounded-md btn-sm"
          onClick={() => {
            const aiInput =
              document.querySelector<HTMLTextAreaElement>('[data-ai-input]');
            aiInput?.focus();
          }}
        >
          Ask AI
        </button>
      </div>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={`flex h-full flex-col bg-bg-base ${className || ''}`}>
      {/* Tab Bar */}
      {openFiles.length > 0 && (
        <div
          className="flex items-center bg-bg-deep border-b border-border overflow-x-auto scrollbar-hidden"
          style={{ height: '35px' }}
        >
          {openFiles.map((file, index) => (
            <div
              key={`${file.path}-${index}`}
              className={`editor-tab ${index === activeFileIndex ? 'active' : ''}`}
              onClick={() => setActiveFileIndex(index)}
            >
              <span
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{
                  backgroundColor: getFileIconColor(file.name),
                  opacity: 0.6,
                }}
              />
              <span className="truncate max-w-[120px] text-xs">
                {file.name}
              </span>
              {file.modified && (
                <span className="ml-1 h-2 w-2 rounded-full bg-accent flex-shrink-0" />
              )}
              <button
                className="editor-tab-close"
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
          /* Editor container must be position: relative for the overlay */
          <div className="relative h-full w-full">
            <Editor
              height="100%"
              language={activeFile.language}
              value={activeFile.content}
              onChange={handleContentChange}
              onMount={handleEditorMount}
              theme={themeRegistered ? 'vibecode-dark' : 'vs-dark'}
              loading={
                <div className="flex h-full items-center justify-center bg-bg-base">
                  <div className="flex flex-col items-center gap-2">
                    <div className="spinner spinner-lg" />
                    <span className="text-xs text-text-muted">
                      Loading editor...
                    </span>
                  </div>
                </div>
              }
              options={{
                readOnly: false,
                minimap: { enabled: true, scale: 1 },
                fontSize: 13,
                lineHeight: 20,
                fontFamily:
                  "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                fontLigatures: true,
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                renderLineHighlight: 'line',
                renderWhitespace: 'selection',
                bracketPairColorization: { enabled: true },
                padding: { top: 8, bottom: 8 },
                scrollbar: {
                  verticalScrollbarSize: 6,
                  horizontalScrollbarSize: 6,
                  useShadows: false,
                },
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
                automaticLayout: true,
                tabSize: 2,
              }}
            />
            {/* AI Editor Overlay — absolutely positioned inside the relative container */}
            <AIEditorOverlay
              aiStatus={aiStatus}
              hasDiffs={hasDiffs}
              diffCount={diffCount}
              progress={aiProgress}
              onAcceptAll={handleAcceptAll}
              onRejectAll={handleRejectAll}
              onAcceptChange={handleAcceptChange}
              onRejectChange={handleRejectChange}
            />
          </div>
        ) : (
          renderEmptyState()
        )}
      </div>
    </div>
  );
};

export default EditorArea;
