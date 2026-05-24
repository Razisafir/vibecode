// ============================================================
// VibeCode Desktop — Application Menu
// ============================================================
//
// Extracted from main.ts during Phase 1 refactoring.
// Sets up the application menu bar with production/development
// variants.
//
// This is a VS Code fork competing with Cursor — not "an Electron app."
// ============================================================

import { app, Menu, shell } from 'electron';
import { getMainWindow, getIsDev, setIsQuitting } from '../kernel/state';
import { logger } from '../../main/utils/logger';

// ─── Quit Handler Callback ──────────────────────────────────────────────────

/**
 * Callback registered by lifecycle module to handle quit requests
 * from the menu. This avoids a circular dependency between
 * menu.ts and lifecycle.ts.
 */
let _quitHandler: (() => void) | null = null;

/**
 * Register a quit handler callback. Called by lifecycle.ts during boot.
 */
export function setMenuQuitHandler(handler: () => void): void {
  _quitHandler = handler;
}

// ─── Menu Setup ─────────────────────────────────────────────────────────────

/**
 * Set up the application menu bar.
 * Production: minimal menu (app name, edit).
 * Development: full menu with DevTools, View, Window, Help.
 */
export function setupMenu(): void {
  const isDev = getIsDev();

  if (!isDev) {
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
              setIsQuitting(true);
              if (_quitHandler) {
                _quitHandler();
              }
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
  const mainWindow = getMainWindow();
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
            setIsQuitting(true);
            if (_quitHandler) {
              _quitHandler();
            }
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
