// ============================================================
// VibeCode Desktop — System Kernel Type Definitions
// ============================================================
//
// This module defines the core contracts for the SystemKernel
// service architecture. Every kernel-managed subsystem implements
// the Service interface and receives a ServiceContext during init.
//
// DESIGN PRINCIPLES:
//   - No circular dependencies: types depend ONLY on Electron
//     types and basic TypeScript. Never import from service files.
//   - Sync + async: init/shutdown return Promise<void> | void so
//     both synchronous and asynchronous services are supported.
//   - Defensive: error propagation is explicit via ServiceState
//     and ServiceError types.
//   - VS Code-class: designed for 70+ IPC channels, crash
//     recovery, multi-process coordination.
//
// This is a VS Code fork competing with Cursor — not "an Electron app."
// ============================================================

import type { BrowserWindow } from 'electron';

// ─── Service State ─────────────────────────────────────────────────────────

/**
 * Tracks the lifecycle state of a single kernel-managed service.
 *
 * State transitions:
 *   idle → initializing → active
 *   active → shutting-down → idle
 *   initializing → errored (init failed)
 *   active → errored (runtime failure)
 *   errored → initializing (retry)
 *   shutting-down → errored (shutdown failed)
 */
export type ServiceState =
  | 'idle'
  | 'initializing'
  | 'active'
  | 'shutting-down'
  | 'errored';

// ─── Service Error ─────────────────────────────────────────────────────────

/**
 * Structured error information captured when a service enters the
 * `errored` state. Stored in KernelState for diagnostics and
 * exposed via the health server.
 */
export interface ServiceError {
  /** The service that errored */
  serviceName: string;
  /** When the error occurred (ISO 8601) */
  timestamp: string;
  /** Human-readable error message */
  message: string;
  /** Optional stack trace */
  stack?: string;
  /** Phase when the error occurred */
  phase: 'init' | 'runtime' | 'shutdown';
}

// ─── Service Context ───────────────────────────────────────────────────────

/**
 * Context object passed to each Service during init().
 *
 * IMPORTANT: This interface provides accessor functions and read-only
 * references — NOT direct mutable state. This prevents circular
 * dependencies because services receive interfaces rather than
 * importing from concrete modules.
 *
 * The context reads from the centralized state module
 * (src/system/kernel/state.ts) which is the single source of truth
 * for shared mutable state.
 */
export interface ServiceContext {
  /** Get the current main window reference (may be null during init) */
  getWindow(): BrowserWindow | null;

  /** Whether the app is running in development mode */
  isDev(): boolean;

  /** Whether the app is in safe mode (crash recovery / restricted) */
  isSafeMode(): boolean;

  /** Whether the app is currently in the quit sequence */
  isQuitting(): boolean;

  /**
   * Structured logger instance.
   * Typed as a subset of the logger interface to avoid importing
   * the full logger module (which would create a circular dep
   * through kernel-fs). Services should use this for all logging.
   */
  readonly logger: KernelLogger;
}

/**
 * Minimal logger interface for services.
 *
 * This is a PURPOSEFULLY NARROW interface that mirrors the public
 * methods of StructuredLogger. It avoids importing the actual logger
 * module which depends on kernel-fs, which would create a circular
 * dependency chain:
 *   state.ts → logger → kernel-fs → (back to state)
 *
 * The SystemKernel will provide the real implementation at init time.
 */
export interface KernelLogger {
  debug(module: string, message: string, data?: Record<string, unknown>): void;
  info(module: string, message: string, data?: Record<string, unknown>): void;
  warn(module: string, message: string, data?: Record<string, unknown>): void;
  error(module: string, message: string, data?: Record<string, unknown>): void;
}

// ─── Service Interface ─────────────────────────────────────────────────────

/**
 * The contract every kernel-managed service must implement.
 *
 * Services are the fundamental unit of modularity in the
 * SystemKernel architecture. Each service:
 *   - Has a unique name (used for dependency resolution and logging)
 *   - May declare dependencies on other services by name
 *   - Initializes after its dependencies have initialized
 *   - Shuts down in reverse dependency order
 *   - Can be independently queried for state
 *
 * IMPLEMENTATION NOTES:
 *   - init() receives a ServiceContext and MUST NOT import state.ts
 *     directly for reads — use the context accessors instead.
 *   - init() may be synchronous or asynchronous.
 *   - shutdown() must be idempotent: safe to call multiple times.
 *   - If init() throws, the service enters `errored` state and the
 *     kernel logs the error but does NOT crash the app. Other
 *     services that depend on the failed service will NOT be
 *     initialized (they remain `idle` with a dependency error).
 *   - If shutdown() throws, the error is logged but the kernel
 *     continues shutting down remaining services.
 */
export interface Service {
  /** Unique identifier for this service (e.g., "runtime:window") */
  readonly name: string;

  /**
   * Names of services that must be initialized before this one.
   * The kernel uses this to determine initialization order.
   * An empty array (or undefined) means no dependencies.
   *
   * IMPORTANT: Dependency names must match the `name` property of
   * other registered services EXACTLY. A name that doesn't match
   * any registered service will cause an init-time error.
   */
  readonly dependencies?: string[];

  /**
   * Initialize the service.
   *
   * Called by the kernel after all declared dependencies have
   * successfully initialized. The ServiceContext provides access
   * to shared state (window, flags, logger) without creating
   * import-time circular dependencies.
   *
   * If this method throws or rejects, the service enters `errored`
   * state. Services that depend on this one will NOT be initialized.
   */
  init(context: ServiceContext): Promise<void> | void;

  /**
   * Shut down the service gracefully.
   *
   * Called by the kernel during the quit sequence in reverse
   * dependency order. Must be idempotent.
   *
   * If this method throws or rejects, the error is logged but
   * does NOT prevent other services from shutting down.
   */
  shutdown(): Promise<void> | void;
}

// ─── Kernel State ──────────────────────────────────────────────────────────

/**
 * Full kernel state snapshot for health checks and diagnostics.
 *
 * This is the data structure returned by the health server and
 * consumed by the status-provider module. It provides a point-in-time
 * view of all registered services and their states.
 */
export interface KernelState {
  /** When this snapshot was taken (ISO 8601) */
  timestamp: string;

  /** App version from package.json */
  version: string;

  /** Whether the app is in development mode */
  isDev: boolean;

  /** Whether the app is in safe mode */
  isSafeMode: boolean;

  /** Whether the quit sequence has been initiated */
  isQuitting: boolean;

  /** Whether the main window exists and is not destroyed */
  hasMainWindow: boolean;

  /** Per-service state map */
  services: Record<string, ServiceSnapshot>;

  /** Any errors that have been captured */
  errors: ServiceError[];

  /** Process uptime in seconds */
  uptimeSeconds: number;
}

/**
 * Snapshot of a single service's state within the kernel.
 */
export interface ServiceSnapshot {
  /** The service's unique name */
  name: string;

  /** Current lifecycle state */
  state: ServiceState;

  /** When the service was initialized (ISO 8601), null if not yet init'd */
  initializedAt: string | null;

  /** When the service was last shut down (ISO 8601), null if never */
  shutdownAt: string | null;

  /** Names of services this service depends on */
  dependencies: string[];

  /** Last error for this service, if any */
  lastError: ServiceError | null;
}

// ─── Service Registration ──────────────────────────────────────────────────

/**
 * Configuration for registering a service with the kernel.
 *
 * This extends the Service interface with optional registration-
 * time configuration that the kernel uses for startup orchestration.
 */
export interface ServiceRegistration {
  /** The service instance to register */
  service: Service;

  /**
   * Whether this service is critical for app operation.
   * If a critical service fails to initialize, the kernel will
   * attempt safe mode recovery. Non-critical service failures
   * are logged but do not trigger recovery.
   *
   * Default: false
   */
  critical?: boolean;

  /**
   * Whether this service should be initialized lazily (on first
   * access) rather than eagerly during kernel startup.
   *
   * Default: false (eager init)
   */
  lazy?: boolean;
}

// ─── Kernel Events ─────────────────────────────────────────────────────────

/**
 * Events emitted by the SystemKernel for observability.
 * These follow the Event Emitter pattern and are consumed by
 * the telemetry and analytics services.
 */
export type KernelEvent =
  | { type: 'service:initializing'; serviceName: string }
  | { type: 'service:initialized'; serviceName: string; durationMs: number }
  | { type: 'service:error'; serviceName: string; error: ServiceError }
  | { type: 'service:shutting-down'; serviceName: string }
  | { type: 'service:shutdown'; serviceName: string; durationMs: number }
  | { type: 'kernel:ready'; serviceCount: number; totalInitMs: number }
  | { type: 'kernel:shutdown-start' }
  | { type: 'kernel:shutdown-complete'; totalShutdownMs: number };

/**
 * Callback type for kernel event listeners.
 */
export type KernelEventListener = (event: KernelEvent) => void;
