import { useState, useEffect, useCallback, useRef } from 'react';
import type { FileInfo, FileStats, WorkspaceAnalysis } from '../types';

const RECENT_FILES_KEY = 'vibecode:recent-files';
const MAX_RECENT_FILES = 20;

interface UseWorkspaceReturn {
  workspacePath: string;
  isWorkspaceOpen: boolean;
  rootFiles: FileInfo[];
  recentFiles: string[];
  isLoading: boolean;
  error: string | null;
  openWorkspace: (path: string) => Promise<void>;
  closeWorkspace: () => Promise<void>;
  readFile: (path: string) => Promise<string | null>;
  writeFile: (path: string, content: string) => Promise<boolean>;
  listDir: (path: string) => Promise<FileInfo[]>;
  getFileStats: (path: string) => Promise<FileStats | null>;
  createDirectory: (path: string) => Promise<boolean>;
  deleteItem: (path: string) => Promise<boolean>;
  renameItem: (oldPath: string, newPath: string) => Promise<boolean>;
  analyzeWorkspace: () => Promise<WorkspaceAnalysis | null>;
  refreshFiles: () => Promise<void>;
}

export function useWorkspace(): UseWorkspaceReturn {
  const [workspacePath, setWorkspacePath] = useState('');
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [rootFiles, setRootFiles] = useState<FileInfo[]>([]);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watcherCleanupRef = useRef<(() => void) | null>(null);

  // Load recent files from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_FILES_KEY);
      if (stored) {
        setRecentFiles(JSON.parse(stored));
      }
    } catch {
      // localStorage unavailable or corrupt
    }
  }, []);

  // Cleanup watcher on unmount
  useEffect(() => {
    return () => {
      watcherCleanupRef.current?.();
    };
  }, []);

  const addToRecentFiles = useCallback((path: string) => {
    setRecentFiles((prev) => {
      const updated = [path, ...prev.filter((p) => p !== path)].slice(
        0,
        MAX_RECENT_FILES,
      );
      try {
        localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(updated));
      } catch {
        // localStorage full or unavailable
      }
      return updated;
    });
  }, []);

  const openWorkspace = useCallback(
    async (path: string) => {
      setIsLoading(true);
      setError(null);

      try {
        // Validate the path exists
        if (window.vibecode?.fs) {
          const stat = await window.vibecode.fs.stat(path);
          if (!stat.success) {
            setError('Directory does not exist');
            setIsLoading(false);
            return;
          }
          if (stat.data && !stat.data.isDirectory) {
            setError('Path is not a directory');
            setIsLoading(false);
            return;
          }
        }

        // Open via IPC
        if (window.vibecode?.workspace) {
          await window.vibecode.workspace.open(path);
        }

        setWorkspacePath(path);
        setIsWorkspaceOpen(true);

        // Load root files
        const files = await listDirInternal(path);
        setRootFiles(files);

        addToRecentFiles(path);

        // Set up file watcher
        if (window.vibecode?.fs) {
          window.vibecode.fs.watch(path, (event: string, _file: string) => {
            // Refresh files on changes
            if (event === 'rename' || event === 'change') {
              listDirInternal(path).then(setRootFiles);
            }
          });
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to open workspace',
        );
      } finally {
        setIsLoading(false);
      }
    },
    [addToRecentFiles],
  );

  const closeWorkspace = useCallback(async () => {
    try {
      if (window.vibecode?.workspace) {
        await window.vibecode.workspace.close();
      }
    } catch {
      // Close failed
    }

    watcherCleanupRef.current?.();
    watcherCleanupRef.current = null;

    setWorkspacePath('');
    setIsWorkspaceOpen(false);
    setRootFiles([]);
  }, []);

  const listDirInternal = async (path: string): Promise<FileInfo[]> => {
    try {
      if (window.vibecode?.fs) {
        const result = await window.vibecode.fs.listDir(path);
        if (result.success && result.data) {
          return result.data.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          });
        }
      }
    } catch {
      // List failed
    }
    return [];
  };

  const readFile = useCallback(async (path: string): Promise<string | null> => {
    try {
      if (window.vibecode?.fs) {
        const result = await window.vibecode.fs.readFile(path);
        if (result.success && result.data !== undefined) {
          addToRecentFiles(path);
          return result.data;
        }
        setError(result.error || 'Failed to read file');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file');
    }
    return null;
  }, [addToRecentFiles]);

  const writeFile = useCallback(
    async (path: string, content: string): Promise<boolean> => {
      try {
        // ARC 16: Route through gateway — "No Node → No Action"
        const api = window.vibecode as any;
        if (api?.sm?.createMonacoEditNode) {
          const gatewayResult = await api.sm.createMonacoEditNode({
            filePath: path,
            originalContent: '',
            newContent: content,
            isAI: false,
          });
          if (!gatewayResult?.success) {
            setError(gatewayResult?.error || 'File write blocked by gateway');
            return false;
          }
        }
        if (window.vibecode?.fs) {
          const result = await window.vibecode.fs.writeFile(path, content);
          if (result.success) {
            addToRecentFiles(path);
            return true;
          }
          setError(result.error || 'Failed to write file');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to write file');
      }
      return false;
    },
    [addToRecentFiles],
  );

  const listDir = useCallback(async (path: string): Promise<FileInfo[]> => {
    return listDirInternal(path);
  }, []);

  const getFileStats = useCallback(
    async (path: string): Promise<FileStats | null> => {
      try {
        if (window.vibecode?.fs) {
          const result = await window.vibecode.fs.stat(path);
          if (result.success && result.data) {
            return result.data;
          }
        }
      } catch {
        // Stat failed
      }
      return null;
    },
    [],
  );

  const createDirectory = useCallback(
    async (path: string): Promise<boolean> => {
      try {
        // ARC 16: Route through gateway — "No Node → No Action"
        const api = window.vibecode as any;
        if (api?.sm?.createFileMutationNode) {
          const gatewayResult = await api.sm.createFileMutationNode({
            action: 'create',
            filePath: path,
            isAI: false,
          });
          if (!gatewayResult?.success) {
            setError(gatewayResult?.error || 'Directory creation blocked by gateway');
            return false;
          }
        }
        if (window.vibecode?.fs) {
          const result = await window.vibecode.fs.mkdir(path);
          return result.success;
        }
      } catch {
        // Create failed
      }
      return false;
    },
    [],
  );

  const deleteItem = useCallback(async (path: string): Promise<boolean> => {
    try {
      // ARC 16: Route through gateway — "No Node → No Action"
      const api = window.vibecode as any;
      if (api?.sm?.createFileMutationNode) {
        const gatewayResult = await api.sm.createFileMutationNode({
          action: 'delete',
          filePath: path,
          isAI: false,
        });
        if (!gatewayResult?.success) {
          setError(gatewayResult?.error || 'Delete blocked by gateway');
          return false;
        }
      }
      if (window.vibecode?.fs) {
        const result = await window.vibecode.fs.delete(path);
        return result.success;
      }
    } catch {
      // Delete failed
    }
    return false;
  }, []);

  const renameItem = useCallback(
    async (oldPath: string, newPath: string): Promise<boolean> => {
      try {
        // ARC 16: Route through gateway — "No Node → No Action"
        const api = window.vibecode as any;
        if (api?.sm?.createFileMutationNode) {
          const gatewayResult = await api.sm.createFileMutationNode({
            action: 'move',
            filePath: oldPath,
            destinationPath: newPath,
            isAI: false,
          });
          if (!gatewayResult?.success) {
            setError(gatewayResult?.error || 'Rename blocked by gateway');
            return false;
          }
        }
        if (window.vibecode?.fs) {
          const result = await window.vibecode.fs.rename(oldPath, newPath);
          return result.success;
        }
      } catch {
        // Rename failed
      }
      return false;
    },
    [],
  );

  const analyzeWorkspace = useCallback(async (): Promise<WorkspaceAnalysis | null> => {
    if (!workspacePath) return null;
    try {
      if (window.vibecode?.workspace) {
        return await window.vibecode.workspace.analyze(workspacePath);
      }
    } catch {
      // Analysis failed
    }
    return null;
  }, [workspacePath]);

  const refreshFiles = useCallback(async () => {
    if (!workspacePath) return;
    const files = await listDirInternal(workspacePath);
    setRootFiles(files);
  }, [workspacePath]);

  return {
    workspacePath,
    isWorkspaceOpen,
    rootFiles,
    recentFiles,
    isLoading,
    error,
    openWorkspace,
    closeWorkspace,
    readFile,
    writeFile,
    listDir,
    getFileStats,
    createDirectory,
    deleteItem,
    renameItem,
    analyzeWorkspace,
    refreshFiles,
  };
}
