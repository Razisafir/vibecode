// ─── VibeCode Desktop — ARC 20 IPC Handlers ───────────────────────────────────
// Registers IPC channels for:
//   - Workspace Context Engine (P0-1)
//   - Agent Runtime (P0-2)
//   - Terminal Intelligence (P0-4)
//   - Session Memory (P0-5)
//   - Execution Replay (P0-8)
// ──────────────────────────────────────────────────────────────────────────────

import { ipcMain } from 'electron';
import { getWorkspaceContextService } from '../services/workspace-context-service';
import { getAgentRuntime } from '../services/agent-runtime';
import { getTerminalIntelligence } from '../services/terminal-intelligence';
import { getSessionMemoryService } from '../services/session-memory';
import { getExecutionReplayService } from '../services/execution-replay';
import { logger } from '../utils/logger';

export function registerARC20Handlers(): void {
  // ═══════════════════════════════════════════════════════════════════════
  // P0-1: Workspace Context
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('workspace:context', async () => {
    try {
      const svc = getWorkspaceContextService();
      return { success: true, data: svc.assembleContext() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('workspace:compressedContext', async (_e, maxTokens?: number) => {
    try {
      const svc = getWorkspaceContextService();
      return { success: true, data: svc.assembleCompressedContext(maxTokens) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('workspace:systemPrompt', async () => {
    try {
      const svc = getWorkspaceContextService();
      return { success: true, data: svc.formatAsSystemPrompt() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('workspace:updateOpenFiles', async (_e, filePaths: string[], activeFile?: string) => {
    try {
      const svc = getWorkspaceContextService();
      svc.updateOpenFiles(filePaths, activeFile);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('workspace:updateCursor', async (_e, filePath: string, line: number, selectedText?: string, visibleRange?: { startLine: number; endLine: number }) => {
    try {
      const svc = getWorkspaceContextService();
      svc.updateCursorPosition(filePath, line, selectedText, visibleRange);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('workspace:recordEdit', async (_e, filePath: string) => {
    try {
      const svc = getWorkspaceContextService();
      svc.recordFileEdit(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('workspace:recordSave', async (_e, filePath: string) => {
    try {
      const svc = getWorkspaceContextService();
      svc.recordFileSave(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // P0-2: Agent Runtime
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('agent:getState', async () => {
    try {
      const runtime = getAgentRuntime();
      return {
        success: true,
        data: {
          lifecycleState: runtime.getLifecycleState(),
          activePlan: runtime.getActivePlan(),
          activePlans: runtime.getActivePlans(),
          completedPlans: runtime.getCompletedPlans(),
        },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('agent:approveStep', async (_e, planId: string, stepId: string) => {
    try {
      const runtime = getAgentRuntime();
      runtime.approveStep(planId, stepId);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('agent:rejectPlan', async (_e, planId: string) => {
    try {
      const runtime = getAgentRuntime();
      runtime.rejectPlan(planId);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('agent:cancelPlan', async (_e, planId: string) => {
    try {
      const runtime = getAgentRuntime();
      runtime.cancelPlan(planId);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // P0-4: Terminal Intelligence
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('terminal:analyzeCommand', async (_e, command: string) => {
    try {
      const intel = getTerminalIntelligence();
      const analysis = intel.analyzeCommand(command);
      return { success: true, data: analysis };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('terminal:diagnoseFailure', async (_e, command: string, exitCode: number, stderr: string, stdout: string) => {
    try {
      const intel = getTerminalIntelligence();
      const diagnosis = intel.diagnoseFailure(command, exitCode, stderr, stdout);
      return { success: true, data: diagnosis };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('terminal:getRecommendations', async (_e, context: any) => {
    try {
      const intel = getTerminalIntelligence();
      const recommendations = intel.getRecommendations(context);
      return { success: true, data: recommendations };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('terminal:recordCommand', async (_e, command: string, exitCode: number | null) => {
    try {
      const intel = getTerminalIntelligence();
      intel.recordCommand(command, exitCode);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // P0-5: Session Memory
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('memory:getObjectives', async () => {
    try {
      const svc = getSessionMemoryService();
      return { success: true, data: svc.getActiveObjectives() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('memory:trackObjective', async (_e, description: string, relatedFiles?: string[]) => {
    try {
      const svc = getSessionMemoryService();
      const obj = svc.trackObjective(description, relatedFiles);
      return { success: true, data: obj };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('memory:updateObjectiveProgress', async (_e, objectiveId: string, progress: number, note?: string) => {
    try {
      const svc = getSessionMemoryService();
      svc.updateObjectiveProgress(objectiveId, progress, note);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('memory:getUnfinishedTasks', async () => {
    try {
      const svc = getSessionMemoryService();
      return { success: true, data: svc.getUnfinishedTasks() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('memory:getPatterns', async (_e, type?: string) => {
    try {
      const svc = getSessionMemoryService();
      return { success: true, data: svc.getPatterns(type as any) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('memory:getResumeContext', async () => {
    try {
      const svc = getSessionMemoryService();
      return { success: true, data: svc.generateResumeContext() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('memory:getRecentWorkspaces', async (_e, limit?: number) => {
    try {
      const svc = getSessionMemoryService();
      return { success: true, data: svc.getRecentWorkspaces(limit) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('memory:observePattern', async (_e, type: string, description: string, example?: string) => {
    try {
      const svc = getSessionMemoryService();
      svc.observePattern(type as any, description, example);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // P0-8: Execution Replay
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('replay:createCheckpoint', async (_e, label: string) => {
    try {
      const svc = getExecutionReplayService();
      const cp = svc.createCheckpoint(label);
      return { success: true, data: cp };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('replay:getCheckpoints', async () => {
    try {
      const svc = getExecutionReplayService();
      return { success: true, data: svc.getCheckpoints() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('replay:createBranch', async (_e, name: string, fromCheckpointId: string) => {
    try {
      const svc = getExecutionReplayService();
      const branch = svc.createBranch(name, fromCheckpointId);
      return { success: true, data: branch };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('replay:switchBranch', async (_e, branchId: string) => {
    try {
      const svc = getExecutionReplayService();
      svc.switchBranch(branchId);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('replay:mergeBranch', async (_e, branchId: string) => {
    try {
      const svc = getExecutionReplayService();
      svc.mergeBranch(branchId);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('replay:abandonBranch', async (_e, branchId: string) => {
    try {
      const svc = getExecutionReplayService();
      svc.abandonBranch(branchId);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('replay:getBranches', async () => {
    try {
      const svc = getExecutionReplayService();
      return { success: true, data: svc.getBranches() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('replay:startReplay', async (_e, branchId?: string, speed?: number) => {
    try {
      const svc = getExecutionReplayService();
      const state = svc.startReplay(branchId, speed);
      return { success: true, data: state };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('replay:stopReplay', async () => {
    try {
      const svc = getExecutionReplayService();
      svc.stopReplay();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('replay:rollbackToCheckpoint', async (_e, checkpointId: string) => {
    try {
      const svc = getExecutionReplayService();
      const success = await svc.rollbackToCheckpoint(checkpointId);
      return { success, data: { checkpointId } };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('replay:getTimelineVisualization', async () => {
    try {
      const svc = getExecutionReplayService();
      return { success: true, data: svc.getTimelineVisualization() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  logger.info('arc20-ipc', 'ARC 20 IPC handlers registered');
}
