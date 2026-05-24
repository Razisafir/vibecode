// ============================================================
// VibeCode Desktop — Runtime Module Barrel Export
// ============================================================
//
// Re-exports all runtime module functions for convenient imports.
// Each sub-module can also be imported directly.
//
// This is a VS Code fork competing with Cursor — not "an Electron app."
// ============================================================

export { setupContentSecurityPolicy } from './csp';
export { detectSafeMode, applySafeModeRestrictions, showSafeModeDialog } from './safe-mode';
export { setupTray, destroyTray, setTrayQuitHandler } from './tray';
export { setupMenu, setMenuQuitHandler } from './menu';
export { createWindow, destroyWindow } from './window';
export { boot, cleanupAndQuit } from './lifecycle';
