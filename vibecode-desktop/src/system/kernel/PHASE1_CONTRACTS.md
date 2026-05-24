# Phase 1 Extraction Contracts

**Author:** Agent Alpha — The Architect
**Date:** 2026-05-24
**Phase:** 1 — Extract Runtime (window, lifecycle, CSP, safe-mode, tray, menu)
**Previous:** STEP 1 done (commit 0c3881f — SystemKernel health-server start/stop)

---

## Overview

Phase 1 extracts the "Runtime" layer from `main.ts` (759 lines → <50 lines).
The extraction order is determined by dependency analysis: each file must be
extractable without depending on files that haven't been extracted yet.

### Dependency Graph (Phase 1)

```
state.ts ─────────────────────────────────────────┐
  (no deps, bottom of graph)                      │
                                                  ▼
types.ts ──────► state.ts (KernelLogger type)     │
                                                  │
csp.ts ────────► state.ts (isDev)                 │
                                                  │
safe-mode.ts ──► state.ts (isSafeMode, mainWindow)│
                  crash-dump service               │
                                                  │
tray.ts ───────► state.ts (mainWindow, tray)      │
                  branding service                 │
                  state.ts (isQuitting + cleanup)  │
                                                  │
menu.ts ───────► state.ts (mainWindow, isQuitting) │
                  state.ts (cleanup via lifecycle) │
                                                  │
window.ts ─────► state.ts (mainWindow, isDev)      │
                  safe-mode (for crash recovery)   │
                  crash-dump service               │
                  session-manager                  │
                                                  │
lifecycle.ts ──► ALL of the above                  │
                  (orchestrates init and shutdown)  │
                                                   │
└──────────────────────────────────────────────────┘
```

### Extraction Order (bottom-up, safe to extract first)

1. **state.ts** — Already created (this phase's design deliverable)
2. **types.ts** — Already created (this phase's design deliverable)
3. **csp.ts** — No deps on other Phase 1 files
4. **safe-mode.ts** — Depends on state.ts + crash-dump service
5. **tray.ts** — Depends on state.ts + branding service
6. **menu.ts** — Depends on state.ts + lifecycle (cleanupAndQuit)
7. **window.ts** — Depends on state.ts + crash-dump + session-manager
8. **lifecycle.ts** — Depends on ALL above; extracted LAST

---

## Contract: `src/system/runtime/csp.ts`

**Risk Level:** LOW
**Lines to Extract:** ~50 (lines 212-261 of main.ts)

### What It Exports

```ts
/**
 * Set strict Content Security Policy headers for the renderer process.
 *
 * In production: strict CSP that only allows 'self' resources.
 * In development: relaxed CSP that allows Vite HMR and dev tools.
 */
export function setupContentSecurityPolicy(): void;
```

### What It Imports

| From | What |
|------|------|
| `electron` | `session` |
| `src/system/kernel/state.ts` | `getIsDev()` |
| `src/system/kernel/types.ts` | `KernelLogger` (via state logger) |

### Dependency Notes

- Currently uses a LOCAL `isDev` recompute: `const isDev = !app.isPackaged || !!process.env.VIBECODE_DEV`
- After extraction, will use `getIsDev()` from state.ts instead
- No other Phase 1 file depends on this module
- This is the simplest extraction — pure function, no state mutation

### Extraction Steps

1. Create `src/system/runtime/csp.ts`
2. Move `setupContentSecurityPolicy()` function (lines 220-261)
3. Replace local `isDev` variable with `getIsDev()` from state
4. Replace `logger.info(...)` with `state logger access`
5. Add unit test for CSP policy generation

---

## Contract: `src/system/runtime/safe-mode.ts`

**Risk Level:** LOW
**Lines to Extract:** ~70 (lines 30-62 + 265-300 of main.ts)

### What It Exports

```ts
/** Check if the app should start in safe mode (crash dumps, CLI flag) */
export function detectSafeMode(): boolean;

/** Apply safe mode restrictions (disable streaming, limit memory, etc.) */
export function applySafeModeRestrictions(): void;

/** Show safe mode dialog with option to clear crash data and restart */
export function showSafeModeDialog(): void;
```

### What It Imports

| From | What |
|------|------|
| `electron` | `app`, `dialog` |
| `src/system/kernel/state.ts` | `getMainWindow()`, `setIsSafeMode()`, `getIsSafeMode()` |
| `src/main/services/crash-dump.ts` | `crashDumpService` |
| `src/system/kernel/types.ts` | `KernelLogger` (via state logger) |

### Dependency Notes

- `detectSafeMode()` calls `crashDumpService.hasCrashDumps()` — this creates a dependency on the crash-dump service, which is a Phase 2 (Supervision) module
- `showSafeModeDialog()` accesses `mainWindow` — will use `getMainWindow()` from state
- `showSafeModeDialog()` can clear safe mode — will use `setIsSafeMode(false)`
- The `isSafeMode` closure variable is replaced by `getIsSafeMode()` / `setIsSafeMode()`

### Extraction Steps

1. Create `src/system/runtime/safe-mode.ts`
2. Move `detectSafeMode()`, `applySafeModeRestrictions()`, `showSafeModeDialog()`
3. Replace `mainWindow` references with `getMainWindow()`
4. Replace `isSafeMode` reads/writes with state accessors
5. Replace `logger` with state logger
6. Test: detectSafeMode with --safe-mode flag
7. Test: detectSafeMode with crash dumps
8. Test: applySafeModeRestrictions sets env vars
9. Test: showSafeModeDialog clears crash data on user choice

---

## Contract: `src/system/runtime/tray.ts`

**Risk Level:** MEDIUM
**Lines to Extract:** ~65 (lines 431-496 of main.ts)

### What It Exports

```ts
/**
 * Set up the system tray icon with context menu.
 * Only creates the tray if a valid icon asset is found.
 * Silently skips if no tray icon asset is available.
 */
export function setupTray(): void;

/**
 * Destroy the system tray icon (called during cleanup).
 */
export function destroyTray(): void;
```

### What It Imports

| From | What |
|------|------|
| `electron` | `Tray`, `Menu`, `nativeImage` |
| `src/system/kernel/state.ts` | `getMainWindow()`, `setTrayIcon()`, `getTrayIcon()`, `setIsQuitting()` |
| `src/main/services/branding.ts` | `getTrayIconPath()`, `getAppMetadata()` |
| `src/system/runtime/lifecycle.ts` | `cleanupAndQuit()` (for Quit menu item) |

### Dependency Notes

- **CIRCULAR DEPENDENCY RISK:** tray.ts needs `cleanupAndQuit` from lifecycle.ts, and lifecycle.ts will import tray.ts's `destroyTray()`. This MUST be broken.
- **Resolution:** tray.ts should NOT import `cleanupAndQuit` directly. Instead, the tray menu's Quit handler should:
  1. Call `setIsQuitting(true)` from state.ts
  2. Emit a kernel event `kernel:quit-requested`
  3. The kernel (or lifecycle) listens for this event and calls `cleanupAndQuit()`
- This event-based decoupling is cleaner and avoids circular imports
- `mainWindow` references → `getMainWindow()` from state
- `tray` local variable → `setTrayIcon()` / `getTrayIcon()` from state

### Extraction Steps

1. Create `src/system/runtime/tray.ts`
2. Move `setupTray()` function
3. Add `destroyTray()` function (extract from cleanupAndQuit's implicit tray cleanup)
4. Replace `mainWindow` with `getMainWindow()`
5. Replace `tray` variable with `setTrayIcon()` / `getTrayIcon()`
6. Replace `setQuitting(true); cleanupAndQuit()` in Quit handler with:
   - `setIsQuitting(true)` from state
   - Kernel event emission (or callback registration)
7. **IMPORTANT:** Add a `onQuitRequest` callback mechanism:
   ```ts
   let _quitHandler: (() => void) | null = null;
   export function setQuitHandler(handler: () => void): void { _quitHandler = handler; }
   ```
   The lifecycle module registers the handler during init.
8. Test: tray setup with valid icon
9. Test: tray setup with no icon (skip)
10. Test: tray Quit handler calls registered callback

---

## Contract: `src/system/runtime/menu.ts`

**Risk Level:** MEDIUM
**Lines to Extract:** ~165 (lines 498-664 of main.ts)

### What It Exports

```ts
/**
 * Set up the application menu bar.
 * Production: minimal menu (app name, edit).
 * Development: full menu with DevTools, View, Window, Help.
 */
export function setupMenu(): void;
```

### What It Imports

| From | What |
|------|------|
| `electron` | `app`, `Menu`, `shell` |
| `src/system/kernel/state.ts` | `getMainWindow()`, `getIsDev()`, `setIsQuitting()` |
| `src/system/runtime/tray.ts` | `setQuitHandler` pattern (same quit callback as tray) |

### Dependency Notes

- **Same circular dependency risk as tray.ts:** menu.ts needs `cleanupAndQuit`
- **Resolution:** Same pattern — menu registers a quit handler callback
- Currently has TWO separate menu templates: production and development
- Both templates contain Quit items that call `setQuitting(true); cleanupAndQuit()`
- After extraction, both Quit items will call `setIsQuitting(true)` + quit callback
- Dev menu items (Reload, DevTools, Zoom) access `mainWindow` → use `getMainWindow()`
- `IS_DEV` constant → `getIsDev()` from state

### Extraction Steps

1. Create `src/system/runtime/menu.ts`
2. Move `setupMenu()` function with both templates
3. Replace `IS_DEV` with `getIsDev()`
4. Replace `mainWindow` references with `getMainWindow()`
5. Add `setQuitHandler()` callback (same pattern as tray.ts)
6. Replace `setQuitting(true); cleanupAndQuit()` with callback
7. Test: production menu structure
8. Test: development menu structure
9. Test: Quit menu item invokes callback

---

## Contract: `src/system/runtime/window.ts`

**Risk Level:** HIGH
**Lines to Extract:** ~130 (lines 302-429 of main.ts)

### What It Exports

```ts
/**
 * Create the main BrowserWindow with all event handlers.
 * Handles: ready-to-show, closed, external links,
 * render-process-gone (crash recovery), unresponsive/responsive,
 * and GPU process crash.
 */
export function createWindow(): void;

/**
 * Destroy the main window if it exists (for cleanup).
 */
export function destroyWindow(): void;
```

### What It Imports

| From | What |
|------|------|
| `electron` | `BrowserWindow`, `shell`, `app` |
| `path` | `path.join` |
| `src/system/kernel/state.ts` | `getMainWindow()`, `setMainWindow()`, `getIsDev()`, `isMainWindowValid()` |
| `src/main/services/crash-dump.ts` | `crashDumpService` |
| `src/main/ipc/session-handlers.ts` | `sessionManager` |
| `src/system/kernel/types.ts` | `KernelLogger` (via state logger) |

### Detailed Breakdown: What Moves Where

#### Lines 304-321: BrowserWindow constructor
- Moves to `window.ts::createWindow()`
- `mainWindow = new BrowserWindow({...})` → `setMainWindow(new BrowserWindow({...}))`
- Preload path: `path.join(__dirname, '..', 'preload', 'preload.js')` — unchanged
- `frame: false` (custom titlebar) — unchanged
- `show: false` (prevent flash) — unchanged

#### Lines 323-334: Load content (dev vs prod)
- Moves to `window.ts::createWindow()`
- `IS_DEV` → `getIsDev()`
- `VITE_DEV_SERVER_URL` constant → local constant or from config
- `mainWindow.loadURL()` → `getMainWindow()!.loadURL()` (safe: just created)
- `mainWindow.webContents.openDevTools()` → same pattern

#### Lines 338-342: ready-to-show event
- Moves to `window.ts::createWindow()`
- `mainWindow.once('ready-to-show', ...)` → local variable after `setMainWindow()`
- Better: capture `const win = new BrowserWindow(...)` before `setMainWindow(win)`,
  then attach events to `win`. This avoids the `getMainWindow()!` assertion.

#### Lines 345-347: closed event
- Moves to `window.ts::createWindow()`
- `mainWindow.on('closed', () => { mainWindow = null })` → `win.on('closed', () => { setMainWindow(null) })`

#### Lines 349-355: External links handler
- Moves to `window.ts::createWindow()`
- `shell.openExternal(url)` — unchanged
- `mainWindow.webContents.setWindowOpenHandler(...)` → `win.webContents.setWindowOpenHandler(...)`

#### Lines 358-403: CRASH RECOVERY (render-process-gone)
- Moves to `window.ts::createWindow()`
- **This is the highest-risk part of the extraction**
- References `crashDumpService.generateCrashDump()` — imported from services
- References `sessionManager.markCrash()` — imported from IPC
- Calls `createWindow()` recursively for crash recovery (line 395, 399)
  - After extraction, this is a self-reference within window.ts — safe
- Uses `mainWindow` in setTimeout closure → will use `getMainWindow()` from state
- `mainWindow.destroy()` → `getMainWindow()?.destroy()` + `setMainWindow(null)`
- `mainWindow.reload()` → `getMainWindow()?.reload()`

#### Lines 406-412: Unresponsive/responsive events
- Moves to `window.ts::createWindow()`
- Simple event handlers — no complex dependencies

#### Lines 414-428: GPU process crash handler
- Moves to `window.ts` BUT with a twist:
- This registers on `app.on('child-process-gone', ...)` — a GLOBAL app event
- Should be registered in lifecycle.ts, not window.ts
- OR: window.ts provides a `registerGpuCrashHandler()` function called by lifecycle
- **Decision:** Keep in window.ts for now (it references sessionManager and is
  closely related to the crash recovery flow). Move to supervision/crash-recovery
  in Phase 2.

### How mainWindow Reference Will Be Handled

**Current state (main.ts):**
```ts
let mainWindow: BrowserWindow | null = null;
// Referenced by: createWindow, setupTray, setupMenu, crash recovery,
//                cleanupAndQuit, before-quit handler, activate handler,
//                window-all-closed handler, watchdog:failed handler
```

**After extraction:**
```ts
// In window.ts::createWindow():
const win = new BrowserWindow({...});
setMainWindow(win);  // Store in centralized state

// Attach all event handlers to local `win` variable
// (avoids repeated getMainWindow() calls within createWindow)

win.on('closed', () => { setMainWindow(null); });
win.once('ready-to-show', () => { win.show(); win.focus(); });
// ... etc

// In crash recovery setTimeout:
setTimeout(() => {
  const currentWin = getMainWindow();
  if (currentWin && !currentWin.isDestroyed()) {
    try { currentWin.reload(); }
    catch { createWindow(); }  // Recursive — creates new window
  } else {
    createWindow();  // Window destroyed — recreate
  }
}, 2000);
```

**In other modules (tray, menu):**
```ts
// Instead of: if (mainWindow) { mainWindow.show(); }
const win = getMainWindow();
if (win && !win.isDestroyed()) { win.show(); }
// OR use the convenience:
if (isMainWindowValid()) { getMainWindow()!.show(); }
```

### How Crash Recovery Handlers Reference State

The crash recovery flow currently lives as an event handler inside
`createWindow()`. After extraction:

1. `render-process-gone` handler remains in `window.ts` — it's tightly coupled
   to the window lifecycle
2. The handler accesses shared state through `state.ts` accessors:
   - `getMainWindow()` to check if window still exists
   - `setMainWindow(null)` when destroying a broken window
   - `crashDumpService.generateCrashDump()` via direct import (Phase 2 will
     move this to supervision module)
   - `sessionManager.markCrash()` via direct import (stays as-is until Phase 2)
3. Recursive `createWindow()` call is valid — it's within the same module

### Extraction Steps

1. Create `src/system/runtime/window.ts`
2. Move `createWindow()` function (lines 304-429)
3. Capture `const win = new BrowserWindow(...)` as local variable
4. Replace `mainWindow = ...` with `setMainWindow(win)`
5. Replace `mainWindow = null` with `setMainWindow(null)`
6. Replace `IS_DEV` with `getIsDev()`
7. Keep crash recovery in `window.ts` for now (Phase 2 will extract further)
8. Keep GPU crash handler in `window.ts` for now
9. Add `destroyWindow()` helper for cleanup
10. Test: window creation
11. Test: window events (ready-to-show, closed, external links)
12. Test: crash recovery flow (mock render-process-gone)
13. Test: recursive window recreation on fatal crash

---

## Contract: `src/system/runtime/lifecycle.ts`

**Risk Level:** HIGH
**Lines to Extract:** ~90 (lines 64-210 + 666-750 of main.ts)

### What It Exports

```ts
/**
 * Initialize the application lifecycle.
 * Registers all app event handlers: ready, window-all-closed,
 * activate, before-quit. Orchestrates service initialization.
 *
 * This is called from the thin main.ts boot file.
 */
export function boot(): void;

/**
 * Perform cleanup and quit the application.
 * Stops all services, flushes state, destroys window, and calls app.quit().
 * Must be safe to call multiple times (idempotent).
 */
export function cleanupAndQuit(): void;
```

### What It Imports

| From | What |
|------|------|
| `electron` | `app`, `dialog`, `BrowserWindow` |
| `src/system/kernel/state.ts` | `getMainWindow()`, `setIsQuitting()`, `getIsQuitting()`, `setIsDev()`, `setIsSafeMode()`, `setAppStartTime()`, `setLogger()` |
| `src/system/runtime/csp.ts` | `setupContentSecurityPolicy()` |
| `src/system/runtime/safe-mode.ts` | `detectSafeMode()`, `applySafeModeRestrictions()`, `showSafeModeDialog()` |
| `src/system/runtime/window.ts` | `createWindow()`, `destroyWindow()` |
| `src/system/runtime/tray.ts` | `setupTray()`, `destroyTray()`, `setQuitHandler()` |
| `src/system/runtime/menu.ts` | `setupMenu()`, `setQuitHandler()` (same callback) |
| `src/main/ipc/index.ts` | `registerAllIpcHandlers()` |
| `src/main/ipc/app-handlers.ts` | (isQuitting migration — will be replaced by state.ts) |
| `src/main/ipc/memory-handlers.ts` | `memoryStore` |
| `src/main/ipc/session-handlers.ts` | `sessionManager` |
| `src/main/services/telemetry.ts` | `telemetry` |
| `src/main/services/watchdog.ts` | `watchdog` |
| `src/main/services/crash-dump.ts` | `crashDumpService` |
| `src/main/services/auto-updater.ts` | `autoUpdateService` |
| `src/main/services/analytics.ts` | `analyticsService` |
| `src/main/services/health-server.ts` | `startHealthServer`, `stopHealthServer` |
| `src/main/utils/logger.ts` | `logger` |
| `src/main/utils/audit-log.ts` | `auditLog` |

### Detailed Breakdown

#### Lines 64-78: Single instance lock + second-instance handler
- Moves to `lifecycle.ts::boot()`
- `app.requestSingleInstanceLock()` — must be called before app.ready
- `mainWindow` reference → `getMainWindow()`

#### Lines 82-159: app.on('ready') handler
- Moves to `lifecycle.ts::boot()`
- This is the MAIN initialization sequence:
  1. `isSafeMode = detectSafeMode()` → `setIsSafeMode(detectSafeMode())`
  2. `crashDumpService.initialize()` → direct call
  3. `telemetry.startMonitoring()` → direct call
  4. `analyticsService.startSession()` → conditional call
  5. `sessionManager.wasCrashed()` → check
  6. `applySafeModeRestrictions()` → conditional call
  7. `setupContentSecurityPolicy()` → direct call
  8. `createWindow()` → direct call
  9. `registerAllIpcHandlers()` → direct call
  10. `setupMenu()` → direct call
  11. `setupTray()` → direct call
  12. `autoUpdateService.initialize()` → conditional on mainWindow
  13. `watchdog.startWatching()` → conditional on mainWindow
  14. `startHealthServer()` → direct call
  15. `showSafeModeDialog()` → conditional on isSafeMode + mainWindow

- **IMPORTANT:** Steps 8-14 will eventually become kernel service init calls.
  For Phase 1, they remain as direct function calls within lifecycle.ts.
  The SystemKernel will be wired in Phase 4.

#### Lines 161-167: window-all-closed handler
- Moves to `lifecycle.ts::boot()`
- `setQuitting(true)` → `setIsQuitting(true)` from state

#### Lines 169-176: activate handler (macOS)
- Moves to `lifecycle.ts::boot()`
- `mainWindow` → `getMainWindow()`
- `createWindow()` → direct call

#### Lines 180-209: before-quit handler (death bug prevention)
- Moves to `lifecycle.ts::boot()`
- `isQuitting` → `getIsQuitting()` from state
- `mainWindow` → `getMainWindow()`
- `setQuitting(true)` → `setIsQuitting(true)`
- `cleanupAndQuit()` → direct call (same module)
- `sessionManager.markSafeShutdown()` → direct call

#### Lines 668-750: cleanupAndQuit function
- Moves to `lifecycle.ts::cleanupAndQuit()`
- Stops all services in reverse initialization order:
  1. autoUpdateService.stopPeriodicChecks()
  2. analyticsService.stopSession()
  3. telemetry.stopMonitoring()
  4. watchdog.stopWatching()
  5. sessionManager.markSafeShutdown()
  6. stopHealthServer()
  7. memoryStore.flush()
  8. sessionManager.dispose()
  9. logger.flush()
  10. auditLog.forceFlush()
  11. destroyWindow() (new helper from window.ts)
  12. app.quit()

### Quit Handler Callback Pattern

Both `tray.ts` and `menu.ts` need to trigger `cleanupAndQuit()` without
importing it directly (to avoid circular deps). The lifecycle module
registers a quit handler callback:

```ts
// In lifecycle.ts::boot():
const quitHandler = () => {
  setIsQuitting(true);
  cleanupAndQuit();
};

setTrayQuitHandler(quitHandler);   // from tray.ts
setMenuQuitHandler(quitHandler);   // from menu.ts
```

### Extraction Steps

1. Create `src/system/runtime/lifecycle.ts`
2. Move `boot()` function from lines 64-210
3. Move `cleanupAndQuit()` from lines 668-750
4. Replace ALL `isQuitting` / `setQuitting` with state accessors
5. Replace ALL `mainWindow` references with state accessors
6. Replace `IS_DEV` with `getIsDev()`
7. Register quit handler callbacks for tray and menu
8. The `gotTheLock` / `app.requestSingleInstanceLock()` stays in boot()
9. Test: boot sequence initializes all modules
10. Test: cleanupAndQuit stops all services
11. Test: before-quit handler prevents accidental quit
12. Test: second-instance focuses existing window

---

## Resulting main.ts (<50 lines)

After Phase 1 extraction, main.ts becomes a thin boot file:

```ts
// src/main/main.ts — Thin boot file
import { boot } from '../system/runtime/lifecycle';

// That's it. The lifecycle module owns everything.
boot();
```

---

## Risk Summary

| File | Risk | Reason |
|------|------|--------|
| `csp.ts` | LOW | Pure function, no state mutation, no circular deps |
| `safe-mode.ts` | LOW | Simple logic, state goes through accessors |
| `tray.ts` | MEDIUM | Circular dep risk with lifecycle (mitigated by callback pattern) |
| `menu.ts` | MEDIUM | Same circular dep risk as tray + complex template logic |
| `window.ts` | HIGH | Crash recovery is recursive + references 3 external services |
| `lifecycle.ts` | HIGH | Orchestrates everything + must handle partial init failure |

---

## isQuitting Migration Plan

**Current state:**
- `src/main/ipc/app-handlers.ts` exports `isQuitting` (mutable) + `setQuitting()`
- `src/main/main.ts` imports `isQuitting` + `setQuitting` from app-handlers
- Multiple modules call `setQuitting(true)` before quit

**After Phase 1:**
- `src/system/kernel/state.ts` exports `getIsQuitting()` + `setIsQuitting()`
- `app-handlers.ts` re-exports from state.ts for backward compatibility:
  ```ts
  // src/main/ipc/app-handlers.ts
  export { getIsQuitting as isQuitting, setIsQuitting as setQuitting } from '../../system/kernel/state';
  ```
  Wait — `isQuitting` was a boolean export, not a function. This is a breaking change
  for any module that reads `isQuitting` directly instead of calling `isQuitting()`.

**Migration strategy (Phase 1):**
1. Add `import { getIsQuitting, setIsQuitting } from '../../system/kernel/state'` to app-handlers.ts
2. Change app-handlers.ts to:
   ```ts
   export function isQuitting(): boolean { return getIsQuitting(); }
   export function setQuitting(value: boolean): void { setIsQuitting(value); }
   ```
3. Update all call sites from `isQuitting` (variable) to `isQuitting()` (function call)
4. This is a BREAKING CHANGE for any code that reads `isQuitting` as a boolean
5. **Alternative (safer):** Keep the mutable export in app-handlers.ts for Phase 1,
   and have both state.ts and app-handlers.ts sync. Migrate fully in Phase 4.

**Decision:** Use the safer alternative. In Phase 1:
- `app-handlers.ts` keeps its `isQuitting` export
- `state.ts` provides the canonical `getIsQuitting()` / `setIsQuitting()`
- During boot, lifecycle.ts syncs both: when setting isQuitting, it calls both
  `setQuitting(true)` (app-handlers) and `setIsQuitting(true)` (state)
- In Phase 4, app-handlers.ts is fully migrated to use state.ts

---

## TypeScript Configuration Note

The `src/system/` directory is NOT currently included in `tsconfig.main.json`
(which has `rootDir: "src/main"` and `include: ["src/main/**/*"]`).

A new `tsconfig.system.json` must be created:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "lib": ["ES2020"],
    "outDir": "dist/system",
    "rootDir": "src/system",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "composite": true,
    "moduleResolution": "node"
  },
  "include": ["src/system/**/*"],
  "references": []
}
```

And `tsconfig.json` must add it as a project reference:
```json
{
  "references": [
    { "path": "./tsconfig.main.json" },
    { "path": "./tsconfig.preload.json" },
    { "path": "./tsconfig.system.json" }
  ]
}
```

Additionally, `tsconfig.main.json` must add a reference to `tsconfig.system.json`
so that `src/main/` files can import from `src/system/`:
```json
{
  "references": [{ "path": "./tsconfig.system.json" }]
}
```
