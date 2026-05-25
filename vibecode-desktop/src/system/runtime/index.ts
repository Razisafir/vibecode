// Runtime barrel export
export { PluginManager } from './plugin-manager';
export { PluginSandbox, ScopedLogger } from './plugin-sandbox';
export { PluginAPI } from './plugin-api';
export { PluginRegistry } from './plugin-registry';
export { WindowManager } from './window-manager';
export { WindowHandle } from './window-handle';
export { IPCRouter } from './ipc-router';
export { WindowSession } from './window-session';
export { registerLifecycleHook, executeStartup, executeShutdown, clearLifecycleHooks } from './lifecycle';
export type { LifecycleHook } from './lifecycle';
