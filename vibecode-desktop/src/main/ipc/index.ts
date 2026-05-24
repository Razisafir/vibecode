import { ipcMain } from 'electron';
import { registerFsHandlers } from './fs-handlers';
import { registerTerminalHandlers } from './terminal-handlers';
import { registerProviderHandlers } from './provider-handlers';
import { registerMemoryHandlers } from './memory-handlers';
import { registerSessionHandlers } from './session-handlers';
// ARC 12: Legacy ExecutionEngine handlers REMOVED — all execution flows through ExecutionStateMachine
// import { registerExecutionHandlers } from './execution-handlers';
import { registerAppHandlers } from './app-handlers';
import { registerWorkspaceHandlers } from './workspace-handlers';
import { registerProposalHandlers } from './proposal-handlers';
import { registerTelemetryHandlers } from './telemetry-handlers';
import { registerUpdaterHandlers } from './updater-handlers';
import { registerAnalyticsHandlers } from './analytics-handlers';
import { registerStateMachineHandlers } from './state-machine-handlers';
import { registerARC20Handlers } from './arc20-handlers';
import { registerARC21Handlers } from './arc21-handlers';
import { registerAgentHandlers } from './agent-handlers';
import { telemetry } from '../services/telemetry';
import { rateLimiter } from '../utils/rate-limiter';

// ─── IPC Latency + Rate Limiting Middleware ───────────────────────────────────
// Wraps ipcMain.handle with timing measurement and rate limiting.

const originalHandle = ipcMain.handle.bind(ipcMain);

/** Track whether the middleware has been installed */
let middlewareInstalled = false;

/**
 * Install IPC latency middleware that wraps all handle registrations
 * with timing measurement and rate limiting, recording each call to
 * the telemetry service and enforcing per-channel rate limits.
 */
function installIpcLatencyMiddleware(): void {
  if (middlewareInstalled) return;
  middlewareInstalled = true;

  ipcMain.handle = (channel: string, handler: (...args: any[]) => any) => {
    const wrappedHandler = async (event: Electron.IpcMainInvokeEvent, ...args: any[]) => {
      // ── Rate Limiting ───────────────────────────────────────────────────
      const rateLimitResult = rateLimiter.checkRateLimit(channel, event.sender.id);
      if (!rateLimitResult.allowed) {
        const retrySec = Math.ceil((rateLimitResult.retryAfterMs ?? 60000) / 1000);
        throw new Error(`Rate limit exceeded for "${channel}". Please retry after ${retrySec}s.`);
      }

      // ── Latency Measurement ─────────────────────────────────────────────
      const startTime = performance.now();
      try {
        const result = await handler(event, ...args);
        const durationMs = performance.now() - startTime;
        telemetry.recordIpcCall(channel, durationMs);
        return result;
      } catch (error) {
        const durationMs = performance.now() - startTime;
        telemetry.recordIpcCall(channel, durationMs);
        throw error;
      }
    };

    return originalHandle(channel, wrappedHandler);
  };
}

/**
 * Register all IPC handlers for the main process.
 *
 * This is the single entry point for wiring up all renderer ↔ main
 * communication channels. Called once during app initialization.
 */
export function registerAllIpcHandlers(): void {
  // Install IPC latency middleware before any handlers are registered
  installIpcLatencyMiddleware();

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

  // ARC 12: Legacy ExecutionEngine handlers REMOVED — all execution routes through ESM
  // registerExecutionHandlers();

  // Workspace analysis & management
  registerWorkspaceHandlers();

  // Proposal generation from AI responses
  registerProposalHandlers();

  // Telemetry & diagnostics
  registerTelemetryHandlers();

  // Auto-update system
  registerUpdaterHandlers();

  // Analytics (opt-in, privacy-first)
  registerAnalyticsHandlers();

  // Execution State Machine (ARC 12 — ONLY execution system)
  registerStateMachineHandlers(null);

  // ARC 20: Product UX + AI Intelligence
  registerARC20Handlers();

  // ARC 21: Real-Time Autonomy + Self-Improving Agent Loop
  registerARC21Handlers();

  // ARC 22: Multi-Agent Orchestration System
  registerAgentHandlers();

  console.log('[IPC] All IPC handlers registered successfully');
}

/**
 * Export the PathSandbox instance so other modules (execution engine,
 * workspace handlers, etc.) can validate paths or update the workspace root.
 */
export { pathSandbox } from './fs-handlers';
export { initializeAgentSystem, setAgentMainWindow } from './agent-handlers';
