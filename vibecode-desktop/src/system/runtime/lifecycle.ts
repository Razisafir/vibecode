// Lifecycle - the ONLY src/system file allowed to import from src/main/
// Documented exception to the import wall

export interface LifecycleHook {
  onStartup(): Promise<void>;
  onShutdown(): Promise<void>;
}

let lifecycleHooks: LifecycleHook[] = [];

export function registerLifecycleHook(hook: LifecycleHook): void {
  lifecycleHooks.push(hook);
}

export async function executeStartup(): Promise<void> {
  for (const hook of lifecycleHooks) {
    await hook.onStartup();
  }
}

export async function executeShutdown(): Promise<void> {
  for (const hook of [...lifecycleHooks].reverse()) {
    await hook.onShutdown();
  }
}

export function clearLifecycleHooks(): void {
  lifecycleHooks = [];
}

/**
 * Boot the lifecycle system. Called at application startup.
 * Initializes all registered hooks and executes their onStartup callbacks.
 */
export async function boot(): Promise<void> {
  await executeStartup();
}

/**
 * Gracefully shut down the lifecycle system and quit.
 * Executes all shutdown hooks in reverse order, then clears them.
 */
export async function cleanupAndQuit(): Promise<void> {
  await executeShutdown();
  clearLifecycleHooks();
}
