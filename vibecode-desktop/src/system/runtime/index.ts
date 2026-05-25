// Runtime barrel export
export { PluginManager } from './plugin-manager';
export { PluginSandbox, ScopedLogger } from './plugin-sandbox';
export { PluginAPI } from './plugin-api';
export { PluginRegistry } from './plugin-registry';
export { registerLifecycleHook, executeStartup, executeShutdown } from './lifecycle';
export type { LifecycleHook } from './lifecycle';
