// ─── VibeCode Desktop — ARC 21 Integration Layer ──────────────────────────────
// Wires all ARC 21 services into the ARC 20 runtime and ESM.
//
// The agent is no longer called. It is always running in the background,
// improving the system continuously within strict safety boundaries.
//
// This module:
//   1. Initializes all ARC 21 services
//   2. Injects dependencies between services
//   3. Connects the autonomous loop to ESM events
//   4. Wires the workspace observer to file system events
//   5. Connects proactive actions to the loop engine
//   6. Starts the autonomous loop with safe defaults
// ──────────────────────────────────────────────────────────────────────────────

import type { ExecutionStateMachine } from './execution-state-machine';
import { getAgentRuntime, resetAgentRuntime } from './agent-runtime';
import { getWorkspaceContextService, resetWorkspaceContextService } from './workspace-context-service';
import { getSessionMemoryService } from './session-memory';
import { getTerminalIntelligence } from './terminal-intelligence';
import { getExecutionReplayService } from './execution-replay';
import { ExecutionGateway } from '../core/execution-gateway';

import { AutonomousLoopEngine, getAutonomousLoopEngine, resetAutonomousLoopEngine } from './autonomous-loop-engine';
import { AgentSelfImprovement, getAgentSelfImprovement, resetAgentSelfImprovement } from './agent-self-improvement';
import { WorkspaceObserver, getWorkspaceObserver, resetWorkspaceObserver } from './workspace-observer';
import { ProactiveActionsService, getProactiveActionsService, resetProactiveActionsService } from './proactive-actions';
import { MemoryCompressionEngine, getMemoryCompressionEngine, resetMemoryCompressionEngine } from './memory-compression-engine';
import { AgentMetricsService, getAgentMetricsService, resetAgentMetricsService } from './agent-metrics';

import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

let integrated = false;

/**
 * Initialize all ARC 21 services and wire them together.
 * Call this once during app startup after the ESM is initialized.
 *
 * @param esm The ExecutionStateMachine instance (single source of truth)
 * @param workspaceRoot The workspace root path
 */
export function initializeARC21(esm: ExecutionStateMachine, workspaceRoot: string): void {
  if (integrated) {
    logger.warn('arc21-integration', 'ARC 21 already integrated — skipping');
    return;
  }

  logger.info('arc21-integration', 'Initializing ARC 21 — Real-Time Autonomy + Self-Improving Agent Loop');

  // ── Step 1: Initialize core ARC 21 services ──────────────────────────

  const loopEngine = resetAutonomousLoopEngine(esm, {
    autonomousMode: 'suggest', // Safe default: observe and suggest only
    idleThreshold: 30_000,
    activeCycleInterval: 5_000,
    idleCycleInterval: 60_000,
    maxComputeBudget: 40,
    maxActionsPerHour: 30,
    actionCooldown: 10_000,
  });

  const selfImprovement = resetAgentSelfImprovement(esm);

  const observer = resetWorkspaceObserver(esm, workspaceRoot);

  const proactiveActions = resetProactiveActionsService(esm, {
    autonomyMode: 'suggest', // Safe default
    suggestConfidenceThreshold: 0.4,
    assistConfidenceThreshold: 0.7,
    autonomousConfidenceThreshold: 0.85,
  });

  const memoryCompression = resetMemoryCompressionEngine();

  const metrics = resetAgentMetricsService({
    persist: true,
    autoSummarizeInterval: 300_000, // 5 minutes
  });

  // ── Step 2: Inject dependencies ──────────────────────────────────────

  // Initialize ARC 20 services (may already exist)
  let agentRuntime;
  try { agentRuntime = getAgentRuntime(esm); } catch { agentRuntime = resetAgentRuntime(esm); }

  let workspaceContext;
  try { workspaceContext = getWorkspaceContextService(workspaceRoot); } catch {
    workspaceContext = resetWorkspaceContextService(workspaceRoot);
  }

  const sessionMemory = getSessionMemoryService();
  const terminalIntelligence = getTerminalIntelligence();

  // Loop engine needs all ARC 20 services
  loopEngine.injectDependencies({
    agentRuntime,
    workspaceContext,
    sessionMemory,
  });

  // Observer needs workspace context and session memory
  observer.injectDependencies({
    workspaceContext,
    sessionMemory,
  });

  // Proactive actions needs everything
  proactiveActions.injectDependencies({
    agentRuntime,
    workspaceContext,
    terminalIntelligence,
    sessionMemory,
    loopEngine,
  });

  // Memory compression needs session memory
  memoryCompression.injectDependencies({
    sessionMemory,
    workspaceContext,
    esm,
  });

  // ── Step 3: Wire event streams ──────────────────────────────────────

  // Loop engine → Proactive Actions
  loopEngine.on('suggestion', (data) => {
    logger.debug('arc21-integration', `Loop suggestion: ${data.description}`);
    proactiveActions.scan();
  });

  loopEngine.on('autonomous:action', (data) => {
    logger.info('arc21-integration', `Autonomous action requested: ${data.action} — ${data.description}`);
    metrics.recordDecision({
      action: data.action,
      confidence: data.confidence,
      wasCorrect: null,
      userIntervened: false,
      decisionLatency: 0,
    });
  });

  loopEngine.on('autonomous:debug', (data) => {
    logger.info('arc21-integration', `Autonomous debug requested: ${data.description}`);
  });

  loopEngine.on('autonomous:compress', () => {
    memoryCompression.compress();
  });

  loopEngine.on('autonomous:optimize', () => {
    selfImprovement.optimizeGraph();
  });

  // ESM events → Loop engine
  esm.onEvent((event) => {
    if (event.type === 'node_created' || event.type === 'node_transitioned') {
      loopEngine.notifyGraphMutation(event.nodeId, String(event.data ?? ''));
      metrics.recordGraphMutation(
        event.type === 'node_created' ? 'create' : 'transition'
      );
    }
    if (event.type === 'node_transitioned') {
      const data = event.data as any;
      if (data?.newState === 'failed') {
        loopEngine.notifyError('execution', `Node failed: ${event.nodeId}`);
      }
    }
  });

  // Observer → Loop engine (file changes)
  observer.on('change:semantic', (change) => {
    loopEngine.notifyFileChange(change.filePath, change.changeType);
  });

  // Observer → Session memory (batch patterns)
  observer.on('batch:completed', (batch) => {
    sessionMemory.observePattern(
      'workflow',
      `${batch.intent}: ${batch.affectedFiles.length} files`,
      batch.affectedFiles.join(', '),
    );
  });

  // Proactive Actions → Metrics
  proactiveActions.on('action:proposed', (action) => {
    metrics.recordDecision({
      action: action.type,
      confidence: action.confidence,
      wasCorrect: null,
      userIntervened: false,
      decisionLatency: 0,
    });
  });

  proactiveActions.on('action:completed', (action) => {
    if (action.result) {
      metrics.recordExecution({
        nodeId: action.result.nodeIds[0] ?? action.id,
        type: action.type,
        success: action.result.success,
        duration: action.result.duration,
        wasRetried: false,
        retryCount: 0,
      });
    }
  });

  // Self-improvement → Metrics
  selfImprovement.on('opportunity:identified', (opp) => {
    metrics.recordDataPoint('self_improvement.opportunity', 1, { type: opp.type });
  });

  // ── Step 4: Start the autonomous loop ──────────────────────────────

  loopEngine.start();

  // ── Step 5: Run initial analysis ──────────────────────────────────

  // Run self-improvement analysis on startup
  setTimeout(() => {
    try {
      selfImprovement.analyze();
      logger.info('arc21-integration', 'Initial self-improvement analysis completed');
    } catch (err) {
      logger.warn('arc21-integration', `Initial analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, 10_000); // 10 seconds after startup

  // Run memory compression on startup
  setTimeout(() => {
    try {
      memoryCompression.compress();
      logger.info('arc21-integration', 'Initial memory compression completed');
    } catch (err) {
      logger.warn('arc21-integration', `Initial compression failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, 30_000); // 30 seconds after startup

  integrated = true;
  logger.info('arc21-integration', 'ARC 21 integration complete — autonomous agent loop is running');
}

/**
 * Gracefully shut down all ARC 21 services.
 * Call this during app shutdown.
 */
export function shutdownARC21(): void {
  if (!integrated) return;

  logger.info('arc21-integration', 'Shutting down ARC 21 services');

  try {
    const loopEngine = getAutonomousLoopEngine();
    loopEngine.stop();
  } catch { /* may not be initialized */ }

  try {
    const observer = getWorkspaceObserver();
    observer.flushBatches();
  } catch { /* may not be initialized */ }

  try {
    const memoryCompression = getMemoryCompressionEngine();
    memoryCompression.flush();
  } catch { /* may not be initialized */ }

  try {
    const metrics = getAgentMetricsService();
    metrics.flush();
    metrics.dispose();
  } catch { /* may not be initialized */ }

  integrated = false;
  logger.info('arc21-integration', 'ARC 21 shutdown complete');
}

/**
 * Get the integration status.
 */
export function isARC21Integrated(): boolean {
  return integrated;
}
