import { registerFsHandlers } from './fs-handlers';
import { registerTerminalHandlers } from './terminal-handlers';
import { registerProviderHandlers } from './provider-handlers';
import { registerMemoryHandlers } from './memory-handlers';
import { registerSessionHandlers } from './session-handlers';
import { registerExecutionHandlers } from './execution-handlers';
import { registerAppHandlers } from './app-handlers';
import { registerWorkspaceHandlers } from './workspace-handlers';
import { registerProposalHandlers } from './proposal-handlers';

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

  // File system operations (includes PathSandbox validation)
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

  // Proposal generation from AI responses
  registerProposalHandlers();

  console.log('[IPC] All IPC handlers registered successfully');
}

/**
 * Export the PathSandbox instance so other modules (execution engine,
 * workspace handlers, etc.) can validate paths or update the workspace root.
 */
export { pathSandbox } from './fs-handlers';
