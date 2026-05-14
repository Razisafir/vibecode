import { ExecutionStep, StepExecutor } from '../execution-engine';
import { createFileWriteExecutor } from './file-write-executor';
import { createFileReadExecutor } from './file-read-executor';
import { createFileEditExecutor } from './file-edit-executor';
import { createCommandExecutor } from './command-executor';
import { createCodeGenerationExecutor } from './code-generation-executor';
import { createDiffApplyExecutor } from './diff-apply-executor';

// ─── Step Type Definition ─────────────────────────────────────────────────────

/**
 * The canonical set of step types that have real executors.
 * This must be kept in sync with ExecutionStep['type'] in execution-engine.ts.
 */
export type ExecutorStepType =
  | 'file_write'
  | 'file_read'
  | 'file_edit'
  | 'command'
  | 'code_generation'
  | 'code_edit'
  | 'diff_apply'
  | 'analysis'
  | 'generation'
  | 'review';

// ─── Fallback Executor ────────────────────────────────────────────────────────

/**
 * For step types that don't have a dedicated executor yet (analysis, review, etc.),
 * we provide a fallback that returns a descriptive result rather than silently
 * succeeding with fake data.
 */
const createFallbackExecutor = (typeName: string): StepExecutor => {
  return async (step: ExecutionStep) => {
    throw new Error(
      `No real executor implemented for step type "${typeName}". ` +
      `Step "${step.title}" (${step.id}) cannot be executed. ` +
      `Available executor types: file_write, file_read, file_edit, command, code_generation, diff_apply.`
    );
  };
};

// ─── Executor Registry ────────────────────────────────────────────────────────

/**
 * Creates a registry mapping each step type to its corresponding executor.
 *
 * @param workspaceRoot - The absolute path to the workspace root directory.
 *                        All relative file paths in step params will be resolved
 *                        relative to this directory.
 * @returns A Map from step type string to its StepExecutor function.
 */
export function createExecutorRegistry(workspaceRoot: string): Map<string, StepExecutor> {
  const registry = new Map<string, StepExecutor>();

  // ── Real executors ─────────────────────────────────────────────────────
  registry.set('file_write', createFileWriteExecutor(workspaceRoot));
  registry.set('file_read', createFileReadExecutor(workspaceRoot));
  registry.set('file_edit', createFileEditExecutor(workspaceRoot));
  registry.set('command', createCommandExecutor(workspaceRoot));
  registry.set('code_generation', createCodeGenerationExecutor(workspaceRoot));
  registry.set('code_edit', createCodeGenerationExecutor(workspaceRoot)); // code_edit reuses code_generation
  registry.set('diff_apply', createDiffApplyExecutor(workspaceRoot));

  // ── Stub executors that fail explicitly ────────────────────────────────
  registry.set('analysis', createFallbackExecutor('analysis'));
  registry.set('generation', createFallbackExecutor('generation'));
  registry.set('review', createFallbackExecutor('review'));

  return registry;
}
