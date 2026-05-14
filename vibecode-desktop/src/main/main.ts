import { app, BrowserWindow, Menu, shell, dialog } from 'electron';
import * as path from 'path';
import { registerAllIpcHandlers } from './ipc/index';
import { setQuitting, isQuitting } from './ipc/app-handlers';
import { memoryStore } from './ipc/memory-handlers';
import { sessionManager } from './ipc/session-handlers';

// ─── Constants ──────────────────────────────────────────────────────────────

const IS_DEV = !app.isPackaged || !!process.env.VIBECODE_DEV;
const VITE_DEV_SERVER_URL = 'http://localhost:5173';

// ─── State ──────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

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
    createWindow();
    registerAllIpcHandlers();
    setupMenu();

    if (IS_DEV) {
      console.log('[VibeCode] Running in development mode');
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
    }
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
    console.error('[VibeCode] Render process gone:', details);

    if (details.reason === 'crashed' || details.reason === 'oom') {
      // Attempt recovery by reloading
      const recoveryDelay = 2000;
      console.log(`[VibeCode] Attempting crash recovery in ${recoveryDelay}ms...`);

      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            mainWindow.reload();
            console.log('[VibeCode] Crash recovery: window reloaded');
          } catch (err) {
            console.error('[VibeCode] Crash recovery failed:', err);
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
    console.warn('[VibeCode] Renderer is unresponsive');
  });

  mainWindow.on('responsive', () => {
    console.log('[VibeCode] Renderer is responsive again');
  });
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
  console.log('[VibeCode] Performing cleanup before quit...');

  // Flush memory store to disk
  try {
    memoryStore.flush();
    console.log('[VibeCode] Memory store flushed');
  } catch (err) {
    console.error('[VibeCode] Failed to flush memory store:', err);
  }

  // Dispose session manager (stop auto-save timers)
  try {
    sessionManager.dispose();
    console.log('[VibeCode] Session manager disposed');
  } catch (err) {
    console.error('[VibeCode] Failed to dispose session manager:', err);
  }

  // Destroy window if it exists
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }

  app.quit();
}
