import React, { useState, useEffect, useCallback } from 'react';
import type { FileInfo } from '../../types';

interface FileTreeNodeProps {
  item: FileInfo;
  depth: number;
  activeFilePath?: string;
  onFileOpen: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, path: string, isDir: boolean) => void;
}

const FILE_ICONS: Record<string, { icon: string; className: string }> = {
  ts: { icon: 'TS', className: 'file-icon-ts' },
  tsx: { icon: 'TX', className: 'file-icon-tsx' },
  js: { icon: 'JS', className: 'file-icon-js' },
  jsx: { icon: 'JX', className: 'file-icon-js' },
  py: { icon: 'PY', className: 'file-icon-py' },
  json: { icon: '{ }', className: 'file-icon-json' },
  md: { icon: 'M↓', className: 'file-icon-md' },
  css: { icon: '#', className: 'file-icon-css' },
  scss: { icon: '#', className: 'file-icon-css' },
  html: { icon: '</>', className: 'file-icon-html' },
  yml: { icon: 'Y', className: 'file-icon-json' },
  yaml: { icon: 'Y', className: 'file-icon-json' },
  rs: { icon: 'RS', className: 'file-icon-ts' },
  go: { icon: 'GO', className: 'file-icon-ts' },
  sql: { icon: 'DB', className: 'file-icon-py' },
  sh: { icon: '$_', className: 'file-icon-css' },
  gitignore: { icon: 'G', className: 'file-icon-folder' },
  env: { icon: 'E', className: 'file-icon-py' },
};

const getFileIcon = (name: string): { icon: string; className: string } => {
  if (name.startsWith('.')) {
    const ext = name.slice(1);
    return FILE_ICONS[ext] || { icon: name[1]?.toUpperCase() || '?', className: 'file-icon-ts' };
  }
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return FILE_ICONS[ext] || { icon: name[0]?.toUpperCase() || '?', className: '' };
};

const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  item,
  depth,
  activeFilePath,
  onFileOpen,
  onContextMenu,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const handleToggle = useCallback(async () => {
    if (!item.isDirectory) {
      onFileOpen(item.path);
      return;
    }

    setIsExpanded((prev) => !prev);

    if (!hasLoaded && item.isDirectory) {
      setIsLoading(true);
      try {
        const result = await window.vibecode?.fs.listDir(item.path);
        if (result?.success && result.data) {
          const sorted = result.data.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          });
          setChildren(sorted);
          setHasLoaded(true);
        }
      } catch {
        // Failed to load directory
      } finally {
        setIsLoading(false);
      }
    }
  }, [item, hasLoaded, onFileOpen]);

  const iconInfo = item.isDirectory
    ? { icon: '', className: 'file-icon-folder' }
    : getFileIcon(item.name);

  const isActive = item.path === activeFilePath;

  return (
    <div>
      <div
        className={`file-tree-item ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleToggle}
        onContextMenu={(e) => onContextMenu(e, item.path, item.isDirectory)}
      >
        {/* Chevron for directories */}
        <div className={`file-tree-chevron ${isExpanded ? 'expanded' : ''}`}>
          {item.isDirectory ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M4 2l4 4-4 4z" />
            </svg>
          ) : (
            <span style={{ width: 12 }} />
          )}
        </div>

        {/* File/Folder Icon */}
        <span className={`file-icon ${iconInfo.className}`}>
          {item.isDirectory ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M1.5 2.5a1 1 0 011-1h3l1.5 1.5h4.5a1 1 0 011 1v7a1 1 0 01-1 1h-9a1 1 0 01-1-1v-8.5z" />
            </svg>
          ) : (
            <span className="text-[9px] font-bold">{iconInfo.icon}</span>
          )}
        </span>

        {/* Name */}
        <span className="truncate flex-1">{item.name}</span>

        {/* Loading indicator */}
        {isLoading && (
          <span className="spinner spinner-sm ml-auto" />
        )}
      </div>

      {/* Children */}
      {isExpanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <FileTreeNode
              key={child.path}
              item={child}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              onFileOpen={onFileOpen}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}

      {/* Empty directory */}
      {isExpanded && hasLoaded && children.length === 0 && (
        <div
          className="py-2 text-xs text-text-muted italic"
          style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
        >
          Empty directory
        </div>
      )}
    </div>
  );
};

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  path: string;
  isDir: boolean;
}

const FileExplorer: React.FC = () => {
  const [rootItems, setRootItems] = useState<FileInfo[]>([]);
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('');
  const [activeFilePath, setActiveFilePath] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    path: '',
    isDir: false,
  });
  const [newItemName, setNewItemName] = useState('');
  const [isCreating, setIsCreating] = useState<'file' | 'folder' | null>(null);

  // Load workspace root
  useEffect(() => {
    const loadRoot = async () => {
      setIsLoading(true);
      try {
        const infoResult = await window.vibecode?.workspace.getInfo();
        if (infoResult?.success && infoResult.data?.workspace) {
          const rootPath = infoResult.data.workspace.rootPath;
          setWorkspaceRoot(rootPath);
          const result = await window.vibecode?.fs.listDir(rootPath);
          if (result?.success && result.data) {
            const sorted = result.data.sort((a, b) => {
              if (a.isDirectory && !b.isDirectory) return -1;
              if (!a.isDirectory && b.isDirectory) return 1;
              return a.name.localeCompare(b.name);
            });
            setRootItems(sorted);
          }
        } else {
          // Try default home directory
          const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
          const defaultPath = `${homeDir}/projects`;
          const result = await window.vibecode?.fs.listDir(defaultPath);
          if (result?.success && result.data) {
            setWorkspaceRoot(defaultPath);
            const sorted = result.data.sort((a, b) => {
              if (a.isDirectory && !b.isDirectory) return -1;
              if (!a.isDirectory && b.isDirectory) return 1;
              return a.name.localeCompare(b.name);
            });
            setRootItems(sorted);
          }
        }
      } catch {
        // Failed to load root
      } finally {
        setIsLoading(false);
      }
    };
    loadRoot();
  }, []);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu.visible) return;
    const handleClick = () => {
      setContextMenu((prev) => ({ ...prev, visible: false }));
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu.visible]);

  const handleFileOpen = useCallback((path: string) => {
    setActiveFilePath(path);
    window.dispatchEvent(
      new CustomEvent('vibecode:open-file', { detail: { path } }),
    );
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, path: string, isDir: boolean) => {
      e.preventDefault();
      setContextMenu({ visible: true, x: e.clientX, y: e.clientY, path, isDir });
    },
    [],
  );

  const handleRefresh = useCallback(async () => {
    if (!workspaceRoot) return;
    setIsLoading(true);
    try {
      const result = await window.vibecode?.fs.listDir(workspaceRoot);
      if (result?.success && result.data) {
        const sorted = result.data.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
        setRootItems(sorted);
      }
    } catch {
      // Refresh failed
    } finally {
      setIsLoading(false);
    }
  }, [workspaceRoot]);

  const handleCreateItem = useCallback(
    (type: 'file' | 'folder') => {
      setIsCreating(type);
      setNewItemName('');
    },
    [],
  );

  const confirmCreate = useCallback(async () => {
    if (!newItemName.trim() || !workspaceRoot) return;

    const parentPath = contextMenu.isDir ? contextMenu.path : workspaceRoot;
    const fullPath = `${parentPath}/${newItemName.trim()}`;

    try {
      if (isCreating === 'folder') {
        // ARC 16: Route through gateway
        const api = window.vibecode as any;
        if (api?.sm?.createFileMutationNode) {
          const gatewayResult = await api.sm.createFileMutationNode({
            action: 'create',
            filePath: fullPath,
            isAI: false,
          });
          if (!gatewayResult?.success) {
            console.error('[VibeCode/ARC16] Gateway blocked directory creation:', gatewayResult?.error);
            return;
          }
        }
        await window.vibecode?.fs.mkdir(fullPath);
      } else {
        // ARC 16: Route through gateway
        const api = window.vibecode as any;
        if (api?.sm?.createMonacoEditNode) {
          const gatewayResult = await api.sm.createMonacoEditNode({
            filePath: fullPath,
            originalContent: '',
            newContent: '',
            isAI: false,
          });
          if (!gatewayResult?.success) {
            console.error('[VibeCode/ARC16] Gateway blocked file creation:', gatewayResult?.error);
            return;
          }
        }
        await window.vibecode?.fs.writeFile(fullPath, '');
      }
      setNewItemName('');
      setIsCreating(null);
      handleRefresh();
    } catch {
      // Create failed
    }
  }, [newItemName, workspaceRoot, contextMenu, isCreating, handleRefresh]);

  const handleOpenFolder = useCallback(async () => {
    try {
      const result = await window.vibecode?.workspace.open('');
      if (result?.success && result.data?.workspace) {
        const ws = result.data.workspace;
        setWorkspaceRoot(ws.rootPath);
        const listResult = await window.vibecode?.fs.listDir(ws.rootPath);
        if (listResult?.success && listResult.data) {
          setRootItems(listResult.data.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          }));
        }
      }
    } catch {
      // Open failed
    }
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="truncate text-xs font-semibold uppercase tracking-wider text-text-muted">
          Explorer
        </span>
        <div className="flex items-center gap-0.5">
          <button
            className="btn-icon btn-ghost rounded p-1"
            onClick={() => handleCreateItem('file')}
            title="New File"
            aria-label="New File"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 3h4l1 1h5v8H2V3z" />
              <line x1="7" y1="6" x2="7" y2="9" />
              <line x1="5.5" y1="7.5" x2="8.5" y2="7.5" />
            </svg>
          </button>
          <button
            className="btn-icon btn-ghost rounded p-1"
            onClick={() => handleCreateItem('folder')}
            title="New Folder"
            aria-label="New Folder"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 3h4l1 1h5v7H2V3z" />
            </svg>
          </button>
          <button
            className="btn-icon btn-ghost rounded p-1"
            onClick={handleRefresh}
            title="Refresh"
            aria-label="Refresh file tree"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 7a5 5 0 019-2M12 7a5 5 0 01-9 2" />
              <polyline points="11,2 12,5 9,5.5" />
              <polyline points="3,12 2,9 5,8.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Workspace Name */}
      {workspaceRoot && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 text-xs text-text-secondary border-b border-border bg-bg-elevated/30">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M1.5 2.5a1 1 0 011-1h2.5l1 1h3.5a1 1 0 011 1v5a1 1 0 01-1 1h-7a1 1 0 01-1-1v-6z" />
          </svg>
          <span className="truncate font-medium">{workspaceRoot.split('/').pop()}</span>
        </div>
      )}

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
        {isLoading && rootItems.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="spinner" />
          </div>
        ) : rootItems.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2" className="mx-auto mb-3 text-text-muted opacity-40">
              <path d="M8 8h10l4 4h10a2 2 0 012 2v18a2 2 0 01-2 2H8a2 2 0 01-2-2V10a2 2 0 012-2z" />
            </svg>
            <p className="text-xs text-text-muted mb-3">No workspace open</p>
            <button
              className="btn btn-primary btn-sm rounded"
              onClick={handleOpenFolder}
            >
              Open Folder
            </button>
          </div>
        ) : (
          rootItems.map((item) => (
            <FileTreeNode
              key={item.path}
              item={item}
              depth={0}
              activeFilePath={activeFilePath}
              onFileOpen={handleFileOpen}
              onContextMenu={handleContextMenu}
            />
          ))
        )}
      </div>

      {/* New Item Input */}
      {isCreating && (
        <div className="border-t border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="input input-mono text-xs py-1"
              placeholder={`New ${isCreating} name...`}
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmCreate();
                if (e.key === 'Escape') setIsCreating(null);
              }}
              autoFocus
            />
            <button
              className="btn btn-primary btn-sm rounded px-2"
              onClick={confirmCreate}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="2,6 5,9 10,3" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="context-menu-item" onClick={() => { handleFileOpen(contextMenu.path); setContextMenu((p) => ({ ...p, visible: false })); }}>
            Open
          </div>
          <div className="context-menu-item" onClick={() => { setContextMenu((p) => ({ ...p, visible: false })); }}>
            Rename
          </div>
          <div className="context-menu-item" onClick={() => { handleCreateItem('file'); setContextMenu((p) => ({ ...p, visible: false })); }}>
            New File
          </div>
          <div className="context-menu-item" onClick={() => { handleCreateItem('folder'); setContextMenu((p) => ({ ...p, visible: false })); }}>
            New Folder
          </div>
          <div className="context-menu-separator" />
          <div className="context-menu-item context-menu-item-danger" onClick={() => { setContextMenu((p) => ({ ...p, visible: false })); }}>
            Delete
          </div>
        </div>
      )}
    </div>
  );
};

export default FileExplorer;
