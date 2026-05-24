// ─── VibeCode Desktop — ARC 21 IPC Handlers ───────────────────────────────────
// Registers IPC channels for:
//   - Autonomous Loop Engine (P0-1)
//   - Agent Self-Improvement (P0-2)
//   - Workspace Observer (P0-3)
//   - Proactive Actions (P0-4)
//   - Memory Compression (P0-5)
//   - Agent Metrics (P0-6)
// ──────────────────────────────────────────────────────────────────────────────

import { ipcMain } from 'electron';
import { getAutonomousLoopEngine } from '../services/autonomous-loop-engine';
import { getAgentSelfImprovement } from '../services/agent-self-improvement';
import { getWorkspaceObserver } from '../services/workspace-observer';
import { getProactiveActionsService } from '../services/proactive-actions';
import { getMemoryCompressionEngine } from '../services/memory-compression-engine';
import { getAgentMetricsService } from '../services/agent-metrics';
import { logger } from '../utils/logger';

export function registerARC21Handlers(): void {
  // ═══════════════════════════════════════════════════════════════════════
  // P0-1: Autonomous Loop Engine
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('loop:start', async () => {
    try {
      const engine = getAutonomousLoopEngine();
      engine.start();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('loop:stop', async () => {
    try {
      const engine = getAutonomousLoopEngine();
      engine.stop();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('loop:pause', async () => {
    try {
      const engine = getAutonomousLoopEngine();
      engine.pause();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('loop:resume', async () => {
    try {
      const engine = getAutonomousLoopEngine();
      engine.resume();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('loop:getState', async () => {
    try {
      const engine = getAutonomousLoopEngine();
      return { success: true, data: { state: engine.getState(), config: engine.getConfig(), metrics: engine.getMetrics() } };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('loop:getMetrics', async () => {
    try {
      const engine = getAutonomousLoopEngine();
      return { success: true, data: engine.getMetrics() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('loop:getCycleHistory', async (_e, limit?: number) => {
    try {
      const engine = getAutonomousLoopEngine();
      return { success: true, data: engine.getCycleHistory(limit) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('loop:updateConfig', async (_e, updates: any) => {
    try {
      const engine = getAutonomousLoopEngine();
      engine.updateConfig(updates);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('loop:notifyUserActivity', async () => {
    try {
      const engine = getAutonomousLoopEngine();
      engine.notifyUserActivity();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('loop:notifyFileChange', async (_e, filePath: string, changeType: string) => {
    try {
      const engine = getAutonomousLoopEngine();
      engine.notifyFileChange(filePath, changeType as any);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('loop:notifyError', async (_e, source: string, message: string, filePath?: string) => {
    try {
      const engine = getAutonomousLoopEngine();
      engine.notifyError(source, message, filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('loop:triggerManualCycle', async () => {
    try {
      const engine = getAutonomousLoopEngine();
      const cycle = await engine.triggerManualCycle();
      return { success: true, data: cycle };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // P0-2: Agent Self-Improvement
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('selfImprove:analyze', async () => {
    try {
      const svc = getAgentSelfImprovement();
      const opportunities = svc.analyze();
      return { success: true, data: opportunities };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('selfImprove:optimizeGraph', async () => {
    try {
      const svc = getAgentSelfImprovement();
      const report = svc.optimizeGraph();
      return { success: true, data: report };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('selfImprove:getOpportunities', async () => {
    try {
      const svc = getAgentSelfImprovement();
      return { success: true, data: svc.getPendingOpportunities() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('selfImprove:getMetrics', async () => {
    try {
      const svc = getAgentSelfImprovement();
      return { success: true, data: svc.getMetrics() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('selfImprove:dismissOpportunity', async (_e, id: string) => {
    try {
      const svc = getAgentSelfImprovement();
      svc.dismissOpportunity(id);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('selfImprove:forceApply', async (_e, id: string) => {
    try {
      const svc = getAgentSelfImprovement();
      const result = svc.forceApplyImprovement(id);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('selfImprove:getRegressionAlerts', async () => {
    try {
      const svc = getAgentSelfImprovement();
      return { success: true, data: svc.getRegressionAlerts() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // P0-3: Workspace Observer
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('observer:getRecentChanges', async (_e, limit?: number) => {
    try {
      const observer = getWorkspaceObserver();
      return { success: true, data: observer.getRecentChanges(limit) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('observer:getMetrics', async () => {
    try {
      const observer = getWorkspaceObserver();
      return { success: true, data: observer.getMetrics() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('observer:getCurrentIntent', async () => {
    try {
      const observer = getWorkspaceObserver();
      return { success: true, data: observer.getCurrentIntent() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('observer:getActiveBatches', async () => {
    try {
      const observer = getWorkspaceObserver();
      return { success: true, data: observer.getActiveBatches() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // P0-4: Proactive Actions
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('proactive:scan', async () => {
    try {
      const svc = getProactiveActionsService();
      const actions = svc.scan();
      return { success: true, data: actions };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('proactive:getPending', async () => {
    try {
      const svc = getProactiveActionsService();
      return { success: true, data: svc.getPendingActions() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('proactive:accept', async (_e, actionId: string) => {
    try {
      const svc = getProactiveActionsService();
      svc.acceptAction(actionId);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('proactive:dismiss', async (_e, actionId: string) => {
    try {
      const svc = getProactiveActionsService();
      svc.dismissAction(actionId);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('proactive:getMetrics', async () => {
    try {
      const svc = getProactiveActionsService();
      return { success: true, data: svc.getMetrics() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('proactive:updateConfig', async (_e, updates: any) => {
    try {
      const svc = getProactiveActionsService();
      svc.updateConfig(updates);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // P0-5: Memory Compression
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('memoryCompress:compress', async () => {
    try {
      const engine = getMemoryCompressionEngine();
      const result = engine.compress();
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('memoryCompress:getMetrics', async () => {
    try {
      const engine = getMemoryCompressionEngine();
      return { success: true, data: engine.getMetrics() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('memoryCompress:getMemoriesByLayer', async (_e, layer: string) => {
    try {
      const engine = getMemoryCompressionEngine();
      return { success: true, data: engine.getMemoriesByLayer(layer as any) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('memoryCompress:getRelevantContext', async (_e, maxTokens?: number) => {
    try {
      const engine = getMemoryCompressionEngine();
      return { success: true, data: engine.getRelevantContext(maxTokens) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('memoryCompress:searchByTag', async (_e, tag: string) => {
    try {
      const engine = getMemoryCompressionEngine();
      return { success: true, data: engine.searchByTag(tag) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // P0-6: Agent Metrics
  // ═══════════════════════════════════════════════════════════════════════

  ipcMain.handle('metrics:getSummary', async () => {
    try {
      const svc = getAgentMetricsService();
      return { success: true, data: svc.generateSummary() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('metrics:getDecisions', async (_e, limit?: number) => {
    try {
      const svc = getAgentMetricsService();
      return { success: true, data: svc.getRecentDecisions(limit) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('metrics:getExecutions', async (_e, limit?: number) => {
    try {
      const svc = getAgentMetricsService();
      return { success: true, data: svc.getRecentExecutions(limit) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('metrics:getCycles', async (_e, limit?: number) => {
    try {
      const svc = getAgentMetricsService();
      return { success: true, data: svc.getRecentCycles(limit) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('metrics:getTimeSeries', async (_e, metric: string, intervalMs?: number, since?: number) => {
    try {
      const svc = getAgentMetricsService();
      return { success: true, data: svc.getMetricTimeSeries(metric, intervalMs, since) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  logger.info('arc21-ipc', 'ARC 21 IPC handlers registered');
}
