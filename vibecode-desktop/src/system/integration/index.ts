// VibeCode System Integration - Barrel Export v11.0
// Exports all integration layer modules.

export {
  IVSCodeForkBridge,
  IServiceAdapter,
  IIPCBridgeAdapter,
  IWindowBridgeAdapter,
  IStorageBridgeAdapter,
  ICommandBridgeAdapter,
  IProductConfig,
  BridgeAdapterFactory,
  BRIDGE_NOT_AVAILABLE,
  isBridgeAvailable,
} from './vscode-fork-bridge';

export {
  ModulePriority,
  ModuleDescriptor,
  getSystemModules,
  getModulesByLayer,
  getModuleDescriptor,
  getModuleCount,
  getInitializationOrder,
  validateDependencies,
} from './module-registry';

export {
  ShellMode,
  ShellDetectionResult,
  detectShellMode,
  isDevelopmentMode,
  isProductionMode,
} from './shell-detector';
