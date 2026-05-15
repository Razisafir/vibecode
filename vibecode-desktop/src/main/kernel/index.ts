// ─── VibeCode Desktop — Kernel Zone Index (ARC 17) ──────────────────────────
// KERNEL ISOLATION + IMPORT WALL ENFORCEMENT
//
// This is the public API of the Kernel Zone. All non-kernel code imports
// from THIS file (or directly from the kernel-* files).
//
// FORBIDDEN: Any code outside /kernel/ importing fs, fs/promises,
// child_process, or node-pty directly. The import-firewall enforces this
// at build time.
//
// Architecture:
//   ┌─────────────────────────────────────────────────┐
//   │                 APPLICATION CODE                 │
//   │   (services/, ipc/, utils/, core/gateway, etc.)  │
//   └──────────────────────┬──────────────────────────┘
//                          │ imports ONLY from /kernel/
//   ┌──────────────────────▼──────────────────────────┐
//   │              KERNEL BOUNDARY LAYER               │
//   │  kernel-fs.ts  │  kernel-process.ts  │  kernel-terminal.ts  │
//   │  (fs/promises)  │  (child_process)   │  (node-pty)          │
//   └──────────────────────┬──────────────────────────┘
//                          │ THE ONLY import of these modules
//   ┌──────────────────────▼──────────────────────────┐
//   │            OPERATING SYSTEM / RUNTIME             │
//   │         Node.js fs, child_process, node-pty      │
//   └─────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

// ─── Re-export ALL public API from kernel modules ────────────────────────────

// Kernel FS — filesystem operations
export {
  // Types
  type ExecutionNodeId,
  type KernelFsWriteOptions,
  type KernelFsDeleteOptions,
  type KernelFsRenameOptions,
  type KernelFsMkdirOptions,
  type KernelFsChmodOptions,
  // Gated workspace mutations (require executionNodeId)
  kernelFsWrite,
  kernelFsWriteSync,
  kernelFsDelete,
  kernelFsDeleteSync,
  kernelFsRename,
  kernelFsRenameSync,
  kernelFsMkdir,
  kernelFsMkdirSync,
  kernelFsChmod,
  kernelFsCopyFile,
  // Read-only operations (not gated)
  kernelFsRead,
  kernelFsReadSync,
  kernelFsReadBuffer,
  kernelFsStat,
  kernelFsStatSync,
  kernelFsExists,
  kernelFsExistsAsync,
  kernelFsReaddir,
  kernelFsReaddirSync,
  kernelFsRealpath,
  kernelFsRealpathSync,
  kernelFsWatch,
  kernelFsAccess,
  // Internal app operations (not gated, but centralized)
  kernelFsWriteInternal,
  kernelFsWriteInternalSync,
  kernelFsReadInternal,
  kernelFsDeleteInternal,
  kernelFsMkdirInternal,
  kernelFsMkdirInternalSync,
  kernelFsExistsInternal,
  kernelFsReaddirInternal,
  kernelFsReaddirInternalSync,
  kernelFsWriteInternalJson,
  kernelFsReadInternalJson,
  kernelFsCopyInternal,
  kernelFsAppendInternal,
  kernelFsRenameInternal,
} from './kernel-fs';

// Kernel Process — child_process operations
export {
  // Types
  type KernelSpawnOptions,
  type KernelExecOptions,
  type KernelInternalSpawnOptions,
  type ChildProcess,
  // Gated workspace execution (requires executionNodeId)
  kernelSpawn,
  kernelExec,
  kernelExecSync,
  // Internal app execution (not gated)
  kernelSpawnInternal,
  kernelExecInternal,
  kernelExecInternalSync,
} from './kernel-process';

// Kernel Terminal — node-pty operations
export {
  // Types
  type TerminalType,
  type TerminalSession,
  type CreateTerminalOptions,
  // Terminal management
  isPtyAvailable,
  kernelTerminalCreate,
  kernelTerminalWrite,
  kernelTerminalResize,
  kernelTerminalKill,
  kernelTerminalOnData,
  kernelTerminalOnExit,
  kernelTerminalExecuteCommand,
} from './kernel-terminal';
