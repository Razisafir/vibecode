/**
 * VibeCode Desktop — Update Notification Component
 *
 * Handles update available modal, download progress,
 * restart & install flow, and silent background checks.
 */

import React, { useState, useEffect, useCallback } from 'react';

interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes?: string;
}

interface UpdateProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

type UpdateView = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';

export const UpdateNotification: React.FC = () => {
  const [view, setView] = useState<UpdateView>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // ── Listen for Update Events ──────────────────────────────

  useEffect(() => {
    if (!window.vibecode?.updater) return;

    // Listen for update available
    window.vibecode.updater.onAvailable((info: UpdateInfo) => {
      setUpdateInfo(info);
      setView('available');
      setDismissed(false);
    });

    // Listen for download progress
    window.vibecode.updater.onProgress((p: UpdateProgress) => {
      setProgress(p);
      setView('downloading');
    });

    // Listen for update downloaded
    window.vibecode.updater.onDownloaded((info: UpdateInfo) => {
      setUpdateInfo(info);
      setProgress(null);
      setView('downloaded');
    });

    // Listen for errors
    window.vibecode.updater.onError((err: { message: string }) => {
      setError(err.message);
      setView('error');
    });
  }, []);

  // ── Actions ───────────────────────────────────────────────

  const handleDownload = useCallback(async () => {
    try {
      setView('downloading');
      await window.vibecode?.updater?.download();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
      setView('error');
    }
  }, []);

  const handleInstall = useCallback(async () => {
    try {
      await window.vibecode?.updater?.install();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed');
      setView('error');
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setView('idle');
  }, []);

  const handleRetry = useCallback(async () => {
    setError(null);
    try {
      await window.vibecode?.updater?.check(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed');
    }
  }, []);

  // ── Render ────────────────────────────────────────────────

  if (dismissed || view === 'idle') return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      {/* Update Available */}
      {view === 'available' && updateInfo && (
        <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-white">Update Available</h3>
              <p className="text-xs text-gray-400 mt-1">
                VibeCode v{updateInfo.version} is ready to download
              </p>
              {updateInfo.releaseNotes && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{updateInfo.releaseNotes}</p>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleDownload}
                  className="px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors"
                >
                  Download Update
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-300 transition-colors"
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Downloading */}
      {view === 'downloading' && progress && (
        <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-0.5 animate-spin">
              <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-white">Downloading Update</h3>
              <div className="mt-2 w-full bg-gray-700/50 rounded-full h-1.5">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(progress.percent, 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-xs text-gray-400">{Math.round(progress.percent)}%</span>
                <span className="text-xs text-gray-500">
                  {(progress.transferred / 1048576).toFixed(1)} / {(progress.total / 1048576).toFixed(1)} MB
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ready to Install */}
      {view === 'downloaded' && updateInfo && (
        <div className="bg-[#1a1a2e] border border-green-500/30 rounded-lg p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-white">Update Ready</h3>
              <p className="text-xs text-gray-400 mt-1">
                VibeCode v{updateInfo.version} is ready to install. Restart to apply.
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleInstall}
                  className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-500 text-white rounded-md transition-colors"
                >
                  Restart & Install
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-300 transition-colors"
                >
                  On Next Launch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {view === 'error' && error && (
        <div className="bg-[#1a1a2e] border border-red-500/30 rounded-lg p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-white">Update Failed</h3>
              <p className="text-xs text-gray-400 mt-1">{error}</p>
              <button
                onClick={handleRetry}
                className="mt-3 px-3 py-1.5 text-xs font-medium bg-red-600/50 hover:bg-red-600 text-white rounded-md transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UpdateNotification;
