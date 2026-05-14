import { registerFsHandlers } from './fs-handlers';
import { registerTerminalHandlers } from './terminal-handlers';
import { registerProviderHandlers } from './provider-handlers';
import { registerMemoryHandlers } from './memory-handlers';
import { registerSessionHandlers } from './session-handlers';
import { registerExecutionHandlers } from './execution-handlers';
import { registerAppHandlers } from './app-handlers';
import { registerWorkspaceHandlers } from './workspace-handlers';

/**
 * Register all IPC handlers for the main process.
 *
 * This is the single entry point for wiring up all renderer ↔ main
 * communication channels. Called once during app initialization.
 */
export function registerAllIpcHandlers(): void {
  console.log('[IPC] Registering all IPC handlers...');

  // Core system handlers
  registerAppHandlers();

  // File system operations
  registerFsHandlers();

  // Terminal / PTY management
  registerTerminalHandlers();

  // AI provider management & chat
  registerProviderHandlers();

  // Memory & context system
  registerMemoryHandlers();

  // Session persistence
  registerSessionHandlers();

  // Execution engine (plans, steps, approvals)
  registerExecutionHandlers();

  // Workspace analysis & management
  registerWorkspaceHandlers();

  console.log('[IPC] All IPC handlers registered successfully');
}
