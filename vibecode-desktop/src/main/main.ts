import { app, BrowserWindow, Menu, shell, dialog, session, Tray, nativeImage } from 'electron';
import * as path from 'path';
import { registerAllIpcHandlers } from './ipc/index';
import { setQuitting, isQuitting } from './ipc/app-handlers';
import { memoryStore } from './ipc/memory-handlers';
import { sessionManager } from './ipc/session-handlers';
import { telemetry } from './services/telemetry';
import { watchdog } from './services/watchdog';
import { crashDumpService } from './services/crash-dump';
import { getTrayIconPath, getAppMetadata } from './services/branding';
import { autoUpdateService } from './services/auto-updater';
import { analyticsService } from './services/analytics';
import { logger } from './utils/logger';
import { auditLog } from './utils/audit-log';
import { startHealthServer, stopHealthServer } from './services/health-server';

// ─── Constants ──────────────────────────────────────────────────────────────

const IS_DEV = !app.isPackaged || !!process.env.VIBECODE_DEV;
const VITE_DEV_SERVER_URL = 'http://localhost:5173';

// ─── State ──────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isSafeMode: boolean = false;

// ─── Safe Mode Detection ────────────────────────────────────────────────────

/** Check if the app should start in safe mode */
function detectSafeMode(): boolean {
  // Check for --safe-mode command line flag
  if (process.argv.includes('--safe-mode')) {
    logger.info('general', 'Safe mode requested via --safe-mode flag');
    return true;
  }

  // Check for existing crash dumps
  if (crashDumpService.hasCrashDumps()) {
    logger.warn('general', 'Crash dumps detected — safe mode recommended');
    return true;
  }

  return false;
}

/** Apply safe mode restrictions */
function applySafeModeRestrictions(): void {
  logger.info('general', 'Applying safe mode restrictions');

  // Disable streaming by default (set environment variable for providers to check)
  process.env.VIBECODE_SAFE_MODE = 'true';
  process.env.VIBECODE_NO_STREAMING = 'true';

  // Reduce memory limits
  process.env.VIBECODE_MAX_MEMORY_MB = '256';

  // Disable auto-save
  process.env.VIBECODE_NO_AUTO_SAVE = 'true';

  logger.info('general', 'Safe mode restrictions applied: streaming disabled, memory limited, auto-save disabled');
}

// ─── App Lock ───────────────────────────────────────────────────────────────

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // Second instance: focus the existing window
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // ─── App Lifecycle ──────────────────────────────────────────────────────

  app.on('ready', () => {
    // Detect safe mode before anything else
    isSafeMode = detectSafeMode();

    // Initialize crash dump service (register global error handlers)
    crashDumpService.initialize();

    // Initialize telemetry monitoring
    telemetry.startMonitoring();

    // Initialize analytics service (only starts tracking if user has opted in)
    if (analyticsService.getConfig().enabled) {
      analyticsService.startSession();
    }

    // Check for crashed sessions BEFORE creating the window
    const crashed = sessionManager.wasCrashed();
    if (crashed) {
      logger.info('session', 'Previous session crashed — recovery will be offered');
    }

    // Apply safe mode restrictions if needed
    if (isSafeMode) {
      applySafeModeRestrictions();
    }

    // ── Content Security Policy ─────────────────────────────────────────────
    setupContentSecurityPolicy();

    createWindow();
    registerAllIpcHandlers();
    setupMenu();
    setupTray();

    // Initialize auto-updater after window is created
    if (mainWindow) {
      autoUpdateService.initialize(mainWindow);
      // Start periodic update checks (every 4 hours) in production
      if (!IS_DEV) {
        autoUpdateService.startPeriodicChecks();
      }
    }

    // Start watchdog monitoring after window is created
    if (mainWindow) {
      watchdog.startWatching();

      watchdog.on('watchdog:unresponsive', (data) => {
        logger.warn('watchdog', 'Renderer unresponsive detected', data);
      });

      watchdog.on('watchdog:recovered', (data) => {
        logger.info('watchdog', 'Renderer recovered', data);
      });

      watchdog.on('watchdog:failed', (data) => {
        logger.error('watchdog', 'Watchdog recovery failed — recreating window', data);
        // Last resort: destroy and recreate window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.destroy();
          mainWindow = null;
        }
        createWindow();
      });
    }

    // Start health server (NO-OP unless VIBECODE_HEALTH_PORT is set)
    startHealthServer();

    if (IS_DEV) {
      logger.info('general', 'Running in development mode');
    }

    // Show safe mode dialog if crash dumps exist
    if (isSafeMode && mainWindow) {
      showSafeModeDialog();
    }
  });

  app.on('window-all-closed', () => {
    // On macOS, apps typically stay active until the user explicitly quits
    if (process.platform !== 'darwin') {
      setQuitting(true);
      app.quit();
    }
  });

  app.on('activate', () => {
    // On macOS, re-create a window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });

  // ─── Death Bug Prevention ─────────────────────────────────────────────
  // Prevent accidental quits — only allow quit when the isQuitting flag is set
  app.on('before-quit', (event) => {
    if (!isQuitting) {
      event.preventDefault();

      // Ask the user to confirm
      const choice = dialog.showMessageBoxSync(mainWindow!, {
        type: 'question',
        title: 'Quit VibeCode?',
        message: 'Are you sure you want to quit VibeCode?',
        detail: 'Unsaved changes will be preserved in your session.',
        buttons: ['Cancel', 'Quit'],
        defaultId: 0,
        cancelId: 0,
      });

      if (choice === 1) {
        // User confirmed quit
        setQuitting(true);
        cleanupAndQuit();
      }
    } else {
      // Mark safe shutdown before quitting
      try {
        sessionManager.markSafeShutdown();
        logger.info('general', 'Marked safe shutdown');
      } catch (err) {
        logger.error('general', 'Failed to mark safe shutdown', { error: String(err) });
      }
    }
  });
}

// ─── Content Security Policy ─────────────────────────────────────────────────

/**
 * Set strict Content Security Policy headers for the renderer process.
 *
 * In production: strict CSP that only allows 'self' resources.
 * In development: relaxed CSP that allows Vite HMR and dev tools.
 */
function setupContentSecurityPolicy(): void {
  const isDev = !app.isPackaged || !!process.env.VIBECODE_DEV;

  const productionPolicy = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com http://localhost:11434 http://localhost:1234`,
    `font-src 'self'`,
    `media-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');

  const developmentPolicy = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: http://localhost:5173`,
    `connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com http://localhost:11434 http://localhost:1234 http://localhost:5173 ws://localhost:5173`,
    `font-src 'self' http://localhost:5173`,
    `media-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');

  const policy = isDev ? developmentPolicy : productionPolicy;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    });
  });

  logger.info('general', `Content Security Policy configured (${isDev ? 'development' : 'production'} mode)`);
}

// ─── Safe Mode Dialog ───────────────────────────────────────────────────────

function showSafeModeDialog(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const crashDumps = crashDumpService.listCrashDumps();
  const recentCrash = crashDumps[0];

  const message = recentCrash
    ? `VibeCode detected a previous crash:\n\n${recentCrash.error.message}\n\nSafe mode has been enabled with reduced functionality. You can restart normally after this session.`
    : 'VibeCode is starting in safe mode with reduced functionality.';

  dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Safe Mode',
    message: 'VibeCode — Safe Mode',
    detail: message,
    buttons: ['OK', 'Clear Crash Data & Restart Normally'],
    defaultId: 0,
    cancelId: 0,
  }).then((result) => {
    if (result.response === 1) {
      // Clear crash data and restart normally
      crashDumpService.clearCrashDumps().then(() => {
        isSafeMode = false;
        delete process.env.VIBECODE_SAFE_MODE;
        delete process.env.VIBECODE_NO_STREAMING;
        delete process.env.VIBECODE_MAX_MEMORY_MB;
        delete process.env.VIBECODE_NO_AUTO_SAVE;
        // Restart the app
        app.relaunch();
        app.exit(0);
      });
    }
  }).catch(() => {
    // Dialog may fail if window is destroyed
  });
}

// ─── Window Creation ────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: 'VibeCode',
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    frame: false, // Custom titlebar
    backgroundColor: '#0a0a0f', // Deep dark
    show: false, // Don't show until ready
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false,
    },
  });

  // ─── Load Content ─────────────────────────────────────────────────────

  if (IS_DEV) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);

    // Open DevTools in dev mode
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production: load from built files
    const indexPath = path.join(__dirname, '..', 'renderer', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  // ─── Window Events ────────────────────────────────────────────────────

  // Show window when content is ready (prevents flash of white/background)
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // Clean up reference on close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links — open in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // ─── Crash Recovery ───────────────────────────────────────────────────

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.error('general', 'Render process gone', {
      reason: details.reason,
      exitCode: details.exitCode,
    });

    // Generate crash dump
    const error = new Error(`render-process-gone: ${details.reason || 'unknown'}`);
    crashDumpService.generateCrashDump(error, {
      source: 'render-process-gone',
      reason: details.reason,
      exitCode: details.exitCode,
    }).catch(() => {
      // Best-effort crash dump
    });

    // Mark the session as crashed
    try {
      sessionManager.markCrash(`render-process-gone: ${details.reason}`);
    } catch (err) {
      logger.error('general', 'Failed to mark crash', { error: String(err) });
    }

    if (details.reason === 'crashed' || details.reason === 'oom') {
      // Attempt recovery by reloading
      const recoveryDelay = 2000;
      logger.info('general', `Attempting crash recovery in ${recoveryDelay}ms...`);

      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            mainWindow.reload();
            logger.info('general', 'Crash recovery: window reloaded');
          } catch (err) {
            logger.error('general', 'Crash recovery failed', { error: String(err) });
            // Last resort: recreate window
            createWindow();
          }
        } else {
          // Window was destroyed, recreate
          createWindow();
        }
      }, recoveryDelay);
    }
  });

  // Handle unresponsive renderer
  mainWindow.on('unresponsive', () => {
    logger.warn('general', 'Renderer is unresponsive');
  });

  mainWindow.on('responsive', () => {
    logger.info('general', 'Renderer is responsive again');
  });

  // Handle GPU process crash (Electron 33+ uses 'child-process-gone' instead)
  try {
    app.on('child-process-gone', (_event, details) => {
      if (details.type === 'GPU' && details.reason !== 'killed') {
        logger.error('general', 'GPU process crashed', { reason: details.reason });
        try {
          sessionManager.markCrash(`gpu-process-crashed: ${details.reason}`);
        } catch {
          // Best-effort
        }
      }
    });
  } catch {
    // Older Electron versions may not support this event
  }
}

// ─── Tray Icon Setup ─────────────────────────────────────────────────────────

/**
 * Sets up the system tray icon with context menu.
 * Only creates the tray if a valid icon asset is found.
 * This function is ready to be called — it will silently skip
 * if no tray icon asset is available yet.
 */
function setupTray(): void {
  const trayIconPath = getTrayIconPath();
  if (!trayIconPath) {
    logger.info('general', 'No tray icon available — skipping tray setup');
    return;
  }

  try {
    const icon = nativeImage.createFromPath(trayIconPath);
    if (icon.isEmpty()) {
      logger.warn('general', 'Tray icon image is empty — skipping tray setup');
      return;
    }

    const metadata = getAppMetadata();

    tray = new Tray(icon.resize({ width: 16, height: 16 }));
    tray.setToolTip(metadata.name);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Show ${metadata.name}`,
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        accelerator: 'CmdOrCtrl+Q',
        click: () => {
          setQuitting(true);
          cleanupAndQuit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);

    // On Windows/Linux, clicking the tray shows the window
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });

    logger.info('general', 'System tray icon created successfully');
  } catch (err) {
    logger.error('general', 'Failed to create tray icon', { error: String(err) });
    tray = null;
  }
}

// ─── Menu Setup ─────────────────────────────────────────────────────────────

function setupMenu(): void {
  if (!IS_DEV) {
    // Minimal menu in production
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: app.getName(),
        submenu: [
          { role: 'about', label: `About ${app.getName()}` },
          { type: 'separator' },
          { role: 'hide', label: 'Hide' },
          { role: 'hideOthers', label: 'Hide Others' },
          { role: 'unhide', label: 'Unhide' },
          { type: 'separator' },
          {
            label: 'Quit',
            accelerator: 'CmdOrCtrl+Q',
            click: () => {
              setQuitting(true);
              cleanupAndQuit();
            },
          },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    return;
  }

  // Development menu with useful shortcuts
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.getName(),
      submenu: [
        { role: 'about', label: `About ${app.getName()}` },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow?.webContents.reload();
          },
        },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            mainWindow?.webContents.reloadIgnoringCache();
          },
        },
        {
          label: 'Toggle DevTools',
          accelerator: 'Alt+CmdOrCtrl+I',
          click: () => {
            mainWindow?.webContents.toggleDevTools();
          },
        },
        { type: 'separator' },
        { role: 'hide', label: 'Hide' },
        { role: 'hideOthers', label: 'Hide Others' },
        { role: 'unhide', label: 'Unhide' },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            setQuitting(true);
            cleanupAndQuit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle DevTools',
          accelerator: 'F12',
          click: () => {
            mainWindow?.webContents.toggleDevTools();
          },
        },
        { role: 'togglefullscreen' },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            mainWindow?.webContents.setZoomLevel(
              mainWindow.webContents.getZoomLevel() + 0.5
            );
          },
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            mainWindow?.webContents.setZoomLevel(
              mainWindow.webContents.getZoomLevel() - 0.5
            );
          },
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            mainWindow?.webContents.setZoomLevel(0);
          },
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://vibecode.dev/docs');
          },
        },
        {
          label: 'Report Issue',
          click: () => {
            shell.openExternal('https://github.com/vibecode/vibecode-desktop/issues');
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Cleanup & Quit ─────────────────────────────────────────────────────────

function cleanupAndQuit(): void {
  logger.info('general', 'Performing cleanup before quit...');

  // Stop auto-updater
  try {
    autoUpdateService.stopPeriodicChecks();
    logger.info('general', 'Auto-updater stopped');
  } catch (err) {
    logger.error('general', 'Failed to stop auto-updater', { error: String(err) });
  }

  // Stop analytics
  try {
    analyticsService.stopSession();
    logger.info('general', 'Analytics stopped');
  } catch (err) {
    logger.error('general', 'Failed to stop analytics', { error: String(err) });
  }

  // Stop telemetry monitoring
  try {
    telemetry.stopMonitoring();
    logger.info('general', 'Telemetry monitoring stopped');
  } catch (err) {
    logger.error('general', 'Failed to stop telemetry', { error: String(err) });
  }

  // Stop watchdog
  try {
    watchdog.stopWatching();
    logger.info('general', 'Watchdog stopped');
  } catch (err) {
    logger.error('general', 'Failed to stop watchdog', { error: String(err) });
  }

  // Mark safe shutdown FIRST
  try {
    sessionManager.markSafeShutdown();
    logger.info('general', 'Marked safe shutdown');
  } catch (err) {
    logger.error('general', 'Failed to mark safe shutdown', { error: String(err) });
  }

  // Stop health server if running
  stopHealthServer();

  // Flush memory store to disk
  try {
    memoryStore.flush();
    logger.info('general', 'Memory store flushed');
  } catch (err) {
    logger.error('general', 'Failed to flush memory store', { error: String(err) });
  }

  // Dispose session manager (stop auto-save timers, flush current state)
  try {
    sessionManager.dispose();
    logger.info('general', 'Session manager disposed');
  } catch (err) {
    logger.error('general', 'Failed to dispose session manager', { error: String(err) });
  }

  // Flush logger
  try {
    logger.flush();
  } catch {
    // Best-effort
  }

  // Flush audit log
  try {
    auditLog.forceFlush();
  } catch {
    // Best-effort
  }

  // Destroy window if it exists
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }

  app.quit();
}
