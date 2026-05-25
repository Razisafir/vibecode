// VibeCode System Integration - Module Registry v11.0
// Defines module priority and initialization ordering for all 31 system modules.
// Used by both development mode and VS Code fork production mode.

/**
 * Module initialization priority levels.
 * Lower numbers initialize first.
 */
export enum ModulePriority {
  /** Core kernel types and state — must init first */
  CRITICAL = 0,
  /** Kernel providers — needed before any service can function */
  HIGH = 1,
  /** Runtime services — plugin, window, IPC */
  NORMAL = 2,
  /** Observability — health, telemetry, audit */
  LOW = 3,
  /** Supervision — watchdog, crash recovery (lazy init) */
  DEFERRED = 4,
}

/**
 * Module descriptor for the system module registry.
 */
export interface ModuleDescriptor {
  /** Fully qualified module ID (e.g., 'kernel.state') */
  id: string;
  /** Layer this module belongs to */
  layer: 'kernel' | 'runtime' | 'observability' | 'supervision' | 'integration';
  /** Initialization priority */
  priority: ModulePriority;
  /** Module dependencies (must be initialized before this module) */
  dependencies: string[];
  /** Whether this module supports lazy initialization */
  lazyInit: boolean;
  /** Whether this module is required for boot */
  required: boolean;
}

/**
 * Complete registry of all 31 system modules with their priorities.
 */
const SYSTEM_MODULES: ModuleDescriptor[] = [
  // === KERNEL (5 modules) — CRITICAL/HIGH ===
  {
    id: 'kernel.types',
    layer: 'kernel',
    priority: ModulePriority.CRITICAL,
    dependencies: [],
    lazyInit: false,
    required: true,
  },
  {
    id: 'kernel.state',
    layer: 'kernel',
    priority: ModulePriority.CRITICAL,
    dependencies: ['kernel.types'],
    lazyInit: false,
    required: true,
  },
  {
    id: 'kernel.fs-provider',
    layer: 'kernel',
    priority: ModulePriority.HIGH,
    dependencies: ['kernel.logger-provider'],
    lazyInit: false,
    required: true,
  },
  {
    id: 'kernel.logger-provider',
    layer: 'kernel',
    priority: ModulePriority.HIGH,
    dependencies: ['kernel.state'],
    lazyInit: false,
    required: true,
  },
  {
    id: 'kernel.session-provider',
    layer: 'kernel',
    priority: ModulePriority.HIGH,
    dependencies: ['kernel.state'],
    lazyInit: false,
    required: true,
  },

  // === RUNTIME (14 modules) — NORMAL ===
  {
    id: 'runtime.lifecycle',
    layer: 'runtime',
    priority: ModulePriority.NORMAL,
    dependencies: ['kernel.state'],
    lazyInit: false,
    required: true,
  },
  {
    id: 'runtime.plugin-registry',
    layer: 'runtime',
    priority: ModulePriority.NORMAL,
    dependencies: ['kernel.state', 'kernel.logger-provider'],
    lazyInit: false,
    required: false,
  },
  {
    id: 'runtime.plugin-sandbox',
    layer: 'runtime',
    priority: ModulePriority.NORMAL,
    dependencies: ['kernel.logger-provider'],
    lazyInit: false,
    required: false,
  },
  {
    id: 'runtime.plugin-api',
    layer: 'runtime',
    priority: ModulePriority.NORMAL,
    dependencies: ['kernel.state'],
    lazyInit: false,
    required: false,
  },
  {
    id: 'runtime.plugin-manager',
    layer: 'runtime',
    priority: ModulePriority.NORMAL,
    dependencies: ['runtime.plugin-registry', 'runtime.plugin-sandbox', 'runtime.plugin-api'],
    lazyInit: false,
    required: false,
  },
  {
    id: 'runtime.window-handle',
    layer: 'runtime',
    priority: ModulePriority.NORMAL,
    dependencies: [],
    lazyInit: false,
    required: true,
  },
  {
    id: 'runtime.window-session',
    layer: 'runtime',
    priority: ModulePriority.NORMAL,
    dependencies: ['kernel.fs-provider'],
    lazyInit: false,
    required: false,
  },
  {
    id: 'runtime.window-manager',
    layer: 'runtime',
    priority: ModulePriority.NORMAL,
    dependencies: ['runtime.window-handle', 'runtime.window-session'],
    lazyInit: false,
    required: true,
  },
  {
    id: 'runtime.ipc-router',
    layer: 'runtime',
    priority: ModulePriority.NORMAL,
    dependencies: ['runtime.window-manager'],
    lazyInit: false,
    required: true,
  },
  {
    id: 'runtime.csp',
    layer: 'runtime',
    priority: ModulePriority.NORMAL,
    dependencies: [],
    lazyInit: false,
    required: true,
  },
  {
    id: 'runtime.safe-mode',
    layer: 'runtime',
    priority: ModulePriority.NORMAL,
    dependencies: ['kernel.state'],
    lazyInit: false,
    required: false,
  },
  {
    id: 'runtime.menu',
    layer: 'runtime',
    priority: ModulePriority.NORMAL,
    dependencies: [],
    lazyInit: false,
    required: false,
  },
  {
    id: 'runtime.tray',
    layer: 'runtime',
    priority: ModulePriority.NORMAL,
    dependencies: [],
    lazyInit: false,
    required: false,
  },
  {
    id: 'runtime.window',
    layer: 'runtime',
    priority: ModulePriority.NORMAL,
    dependencies: ['runtime.window-handle'],
    lazyInit: false,
    required: true,
  },

  // === OBSERVABILITY (5 modules) — LOW ===
  {
    id: 'observability.failure-map',
    layer: 'observability',
    priority: ModulePriority.LOW,
    dependencies: [],
    lazyInit: false,
    required: true,
  },
  {
    id: 'observability.telemetry',
    layer: 'observability',
    priority: ModulePriority.LOW,
    dependencies: ['kernel.logger-provider'],
    lazyInit: true,
    required: false,
  },
  {
    id: 'observability.health-server',
    layer: 'observability',
    priority: ModulePriority.LOW,
    dependencies: ['kernel.state'],
    lazyInit: true,
    required: false,
  },
  {
    id: 'observability.audit-log',
    layer: 'observability',
    priority: ModulePriority.LOW,
    dependencies: ['kernel.fs-provider'],
    lazyInit: true,
    required: false,
  },
  {
    id: 'observability.status-provider',
    layer: 'observability',
    priority: ModulePriority.LOW,
    dependencies: ['kernel.state'],
    lazyInit: false,
    required: false,
  },

  // === SUPERVISION (5 modules) — DEFERRED ===
  {
    id: 'supervision.watchdog',
    layer: 'supervision',
    priority: ModulePriority.DEFERRED,
    dependencies: ['kernel.logger-provider'],
    lazyInit: true,
    required: false,
  },
  {
    id: 'supervision.crash-dump',
    layer: 'supervision',
    priority: ModulePriority.DEFERRED,
    dependencies: ['kernel.fs-provider'],
    lazyInit: true,
    required: false,
  },
  {
    id: 'supervision.crash-recovery',
    layer: 'supervision',
    priority: ModulePriority.DEFERRED,
    dependencies: ['supervision.crash-dump'],
    lazyInit: true,
    required: false,
  },
  {
    id: 'supervision.session-recovery',
    layer: 'supervision',
    priority: ModulePriority.DEFERRED,
    dependencies: ['kernel.session-provider'],
    lazyInit: true,
    required: false,
  },
  {
    id: 'supervision.auto-updater',
    layer: 'supervision',
    priority: ModulePriority.DEFERRED,
    dependencies: [],
    lazyInit: true,
    required: false,
  },

  // === INTEGRATION (2 modules) — NORMAL ===
  {
    id: 'integration.vscode-fork-bridge',
    layer: 'integration',
    priority: ModulePriority.NORMAL,
    dependencies: ['kernel.state'],
    lazyInit: false,
    required: false,
  },
  {
    id: 'integration.shell-detector',
    layer: 'integration',
    priority: ModulePriority.CRITICAL,
    dependencies: [],
    lazyInit: false,
    required: true,
  },
];

/**
 * Get all registered module descriptors.
 */
export function getSystemModules(): ModuleDescriptor[] {
  return [...SYSTEM_MODULES];
}

/**
 * Get modules for a specific layer.
 */
export function getModulesByLayer(layer: ModuleDescriptor['layer']): ModuleDescriptor[] {
  return SYSTEM_MODULES.filter(m => m.layer === layer);
}

/**
 * Get a specific module descriptor by ID.
 */
export function getModuleDescriptor(id: string): ModuleDescriptor | undefined {
  return SYSTEM_MODULES.find(m => m.id === id);
}

/**
 * Get the total number of registered modules.
 */
export function getModuleCount(): number {
  return SYSTEM_MODULES.length;
}

/**
 * Get modules in initialization order (sorted by priority, then dependencies).
 */
export function getInitializationOrder(): ModuleDescriptor[] {
  return [...SYSTEM_MODULES].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    // Within same priority, ensure dependencies come first
    if (a.dependencies.includes(b.id)) return 1;
    if (b.dependencies.includes(a.id)) return -1;
    return 0;
  });
}

/**
 * Validate that all dependency references are valid.
 * Returns an array of invalid dependency references.
 */
export function validateDependencies(): string[] {
  const moduleIds = new Set(SYSTEM_MODULES.map(m => m.id));
  const invalid: string[] = [];
  for (const mod of SYSTEM_MODULES) {
    for (const dep of mod.dependencies) {
      if (!moduleIds.has(dep)) {
        invalid.push(`${mod.id} → ${dep}`);
      }
    }
  }
  return invalid;
}
