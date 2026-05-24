// ============================================================
// VibeCode Desktop — ARC 22: Debug Agent
// Failure diagnosis, root cause analysis, error tracing,
// and automated repair strategies
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
  AgentIdentity,
  AgentCapabilities,
  AgentTask,
  AgentTaskResult,
  AgentObservation,
  AgentAction,
} from '../types';
import { BaseAgent } from './base-agent';
import { AgentCommunicationBus } from '../agent-communication-bus';
import { SharedContextGraph } from '../shared-context-graph';
import { ProviderManager } from '../../services/provider-manager';
import { MemoryStore } from '../../services/memory-store';

// ─── Agent Identity & Capabilities ──────────────────────────────────────────

const DEBUG_IDENTITY: Omit<AgentIdentity, 'id' | 'createdAt'> = {
  role: 'debug',
  name: 'Debugger',
  description: 'Expert debugger focused on error analysis, root cause diagnosis, and automated repair',
  avatar: '🔍',
};

const DEBUG_CAPABILITIES: Omit<AgentCapabilities, 'restrictedPaths'> = {
  primaryDomain: 'failure_diagnosis',
  capabilities: [
    { domain: 'error_analysis', score: 0.95, description: 'Analyzing errors, stack traces, and failure modes' },
    { domain: 'root_cause_diagnosis', score: 0.95, description: 'Identifying root causes through systematic investigation' },
    { domain: 'automated_repair', score: 0.85, description: 'Proposing and applying fixes for identified issues' },
    { domain: 'stack_trace_analysis', score: 0.9, description: 'Reading and interpreting stack traces and error chains' },
    { domain: 'test_failure_diagnosis', score: 0.85, description: 'Diagnosing test failures and assertion errors' },
    { domain: 'regression_detection', score: 0.75, description: 'Identifying regressions by comparing with known-good states' },
  ],
  allowedStepTypes: ['file_edit', 'command', 'diff_apply', 'analysis'],
  maxRiskLevel: 'high',
  requiresApprovalAbove: 0.5,
};

// ─── Debug Agent ────────────────────────────────────────────────────────────

export class DebugAgent extends BaseAgent {
  /** Tracks error signatures we've seen to detect recurring issues */
  private knownErrorSignatures: Map<string, { count: number; lastSeen: number }> = new Map();

  constructor(
    communicationBus: AgentCommunicationBus,
    contextGraph: SharedContextGraph,
    providerManager: ProviderManager,
    memoryStore: MemoryStore,
  ) {
    const identity: AgentIdentity = {
      ...DEBUG_IDENTITY,
      id: `debug-${uuidv4()}`,
      createdAt: Date.now(),
    };

    const capabilities: AgentCapabilities = {
      ...DEBUG_CAPABILITIES,
      restrictedPaths: [
        '**/.env*',
        '**/secrets/**',
        '**/credentials/**',
        '**/.git/**',
        '**/node_modules/**',
      ],
    };

    super(identity, capabilities, communicationBus, contextGraph, providerManager, memoryStore);
  }

  // ─── System Prompt ─────────────────────────────────────────────────────

  getSystemPrompt(): string {
    return `You are an expert debugger agent in the VibeCode multi-agent system.

## Core Responsibilities
- **Error Analysis**: Parse and interpret error messages, stack traces, and failure conditions
- **Root Cause Diagnosis**: Systematically investigate bugs to find their true origin, not just symptoms
- **Automated Repair**: Propose and apply targeted fixes that address root causes
- **Regression Prevention**: Identify patterns that lead to recurring failures

## Debugging Methodology
1. **Reproduce**: Understand the exact conditions that trigger the error
2. **Isolate**: Narrow down the scope — identify the minimal reproduction case
3. **Diagnose**: Trace the error from symptom to root cause through the call stack
4. **Fix**: Propose a minimal, targeted fix that addresses the root cause
5. **Verify**: Suggest test cases or verification steps to confirm the fix

## Decision Framework
- Always distinguish between symptoms and root causes
- Prefer minimal fixes over broad refactors — do one thing and do it well
- When a fix could have side effects, document them explicitly
- For race conditions or timing issues, note the non-deterministic nature
- If the error might be in a dependency, flag it for the research agent

## Constraints
- You may propose file edits, run commands, apply diffs, and perform analysis
- Maximum risk level you can auto-execute: **high** (debugging often requires bold action)
- Changes above 50% confidence threshold require approval
- You MUST NOT modify secrets, credentials, or git internals
- When a fix is uncertain, propose it as a hypothesis and suggest verification steps

## Output Format
When diagnosing issues:
1. State the observed error and its immediate context
2. Walk through the diagnosis chain from symptom to root cause
3. Propose the fix with clear explanation of why it works
4. List potential side effects and how to mitigate them
5. Suggest verification steps (tests, manual checks)`;
  }

  // ─── Task Processing ───────────────────────────────────────────────────

  async processTask(task: AgentTask): Promise<AgentTask> {
    const startTime = Date.now();
    this.setStatus('executing');

    try {
      // Gather error context from observations and related files
      const errorContext = this.gatherErrorContext(task);

      // Build the diagnostic prompt
      const diagnosticPrompt = this.buildDiagnosticPrompt(task, errorContext);

      // Phase 1: Diagnose the root cause
      const diagnosisResult = await this.reason(diagnosticPrompt);

      // Phase 2: If it's a repair task, propose a fix
      let fixResult: string | null = null;
      if (task.type === 'repair') {
        const fixPrompt = this.buildFixPrompt(task, diagnosisResult);
        fixResult = await this.reason(fixPrompt);
      }

      // Track the error signature for regression detection
      this.trackErrorSignature(task, diagnosisResult);

      // Build proposed actions
      const proposedActions = this.buildProposedActions(task, diagnosisResult, fixResult);

      // Determine final confidence
      const confidence = this.assessDiagnosticConfidence(diagnosisResult, task);

      // Share diagnosis with other agents
      this.communicationBus.sendReflection(this.identity.role, {
        premises: [`Error type: ${task.type}`, `Files: ${task.relatedFiles.join(', ')}`],
        conclusion: this.buildDiagnosticSummary(task, diagnosisResult),
        confidence,
        evidence: this.extractEvidenceFromDiagnosis(diagnosisResult),
        assumptions: this.extractAssumptionsFromDiagnosis(diagnosisResult),
        gaps: fixResult ? [] : ['Fix not yet proposed — may require additional investigation'],
      });

      const updatedTask: AgentTask = {
        ...task,
        status: 'completed',
        confidence,
        startedAt: task.startedAt ?? startTime,
        completedAt: Date.now(),
        result: {
          success: true,
          summary: this.buildDiagnosticSummary(task, diagnosisResult),
          details: fixResult ?? diagnosisResult,
          affectedFiles: task.relatedFiles,
          proposedActions,
          metrics: {
            duration: Date.now() - startTime,
            tokensUsed: diagnosisResult.length + (fixResult?.length ?? 0),
            iterationsRequired: fixResult ? 2 : 1,
            confidenceChange: confidence - task.confidence,
          },
        },
      };

      // Store the diagnostic learning in memory
      this.addMemoryEntry({
        content: `Diagnosed "${task.title}": ${this.buildDiagnosticSummary(task, diagnosisResult)}`,
        type: 'learning',
        importance: task.priority > 70 ? 0.9 : 0.7,
        source: 'self',
        relatedEntries: [],
      });

      return updatedTask;
    } catch (err) {
      const updatedTask: AgentTask = {
        ...task,
        status: 'failed',
        startedAt: task.startedAt ?? startTime,
        completedAt: Date.now(),
        result: {
          success: false,
          summary: `Debug agent failed to process task: ${err instanceof Error ? err.message : String(err)}`,
          details: err instanceof Error ? err.stack ?? err.message : String(err),
          affectedFiles: task.relatedFiles,
          proposedActions: [],
          metrics: {
            duration: Date.now() - startTime,
            tokensUsed: 0,
            iterationsRequired: 1,
            confidenceChange: -0.3,
          },
        },
      };
      return updatedTask;
    }
  }

  // ─── Observation Handling ───────────────────────────────────────────────

  handleObservation(observation: AgentObservation): void {
    switch (observation.type) {
      case 'error_detected':
        // Debug agent is the primary consumer of error observations
        this.addMemoryEntry({
          content: `Error detected: ${observation.content}`,
          type: 'observation',
          importance: observation.severity === 'critical' ? 0.95 : observation.severity === 'warning' ? 0.8 : 0.6,
          source: observation.agentId === this.identity.role ? 'self' : 'workspace',
          relatedEntries: [],
        });

        // Form a hypothesis about the error
        this.addHypothesis({
          id: uuidv4(),
          description: `Potential root cause: ${observation.content.slice(0, 200)}`,
          confidence: 0.5,
          evidence: [observation.source],
          testable: true,
          createdAt: Date.now(),
        });

        // Notify other agents of critical errors
        if (observation.severity === 'critical') {
          this.communicationBus.sendObservation(
            this.identity.role,
            `Critical error requires attention: ${observation.content}`,
            'critical',
          );
        }
        break;

      case 'test_failure':
        this.addMemoryEntry({
          content: `Test failure: ${observation.content}`,
          type: 'observation',
          importance: 0.85,
          source: 'workspace',
          relatedEntries: [],
        });
        // Track test failures as potential regression indicators
        this.trackErrorSignature(
          { type: 'repair', title: 'Test failure', description: observation.content } as AgentTask,
          observation.content,
        );
        break;

      case 'file_change':
        // File changes after a fix may indicate the fix is working or needs adjustment
        this.addMemoryEntry({
          content: `File change after potential fix: ${observation.content}`,
          type: 'observation',
          importance: 0.4,
          source: 'workspace',
          relatedEntries: [],
        });
        break;

      case 'performance_issue':
        // Performance issues may have root causes similar to bugs
        this.addMemoryEntry({
          content: `Performance issue (may have debugging relevance): ${observation.content}`,
          type: 'observation',
          importance: 0.5,
          source: 'peer_agent',
          relatedEntries: [],
        });
        break;

      default:
        this.addMemoryEntry({
          content: `[${observation.type}] ${observation.content}`,
          type: 'observation',
          importance: 0.3,
          source: observation.agentId === this.identity.role ? 'self' : 'peer_agent',
          relatedEntries: [],
        });
        break;
    }
  }

  // ─── Idle Reasoning ────────────────────────────────────────────────────

  async idleReasoning(): Promise<void> {
    try {
      // Check for unhandled errors in the workspace
      const recentEvents = this.contextGraph.getRecentEvents(30);

      // Look for error-related events
      const errorEvents = recentEvents.filter(e =>
        e.semanticClassification === 'error_state' ||
        e.type === 'error_occurred' ||
        e.type === 'test_run',
      );

      // Look for test failures
      const testFailures = recentEvents.filter(e =>
        e.type === 'test_run' && e.metadata.success === false,
      );

      if (errorEvents.length === 0 && testFailures.length === 0) {
        // No errors detected — check for recurring patterns
        const recurringErrors = this.findRecurringErrorSignatures();
        if (recurringErrors.length > 0) {
          const analysis = await this.reason(
            `During idle analysis, I noticed ${recurringErrors.length} recurring error pattern(s): ` +
            `${recurringErrors.map(e => `"${e.signature}" seen ${e.count} times`).join('; ')}. ` +
            `Briefly suggest why these errors keep recurring and what systemic fix might help. Keep it concise.`,
          );

          this.communicationBus.sendObservation(
            this.identity.role,
            `Recurring error patterns detected: ${analysis.slice(0, 300)}`,
            'warning',
          );
        }
        return;
      }

      // There are unhandled errors — perform lightweight analysis
      const errorSummary = errorEvents
        .map(e => `${e.type}: ${e.content ?? e.path ?? 'unknown'}`)
        .join('\n');

      const testSummary = testFailures
        .map(e => `Test failure in: ${e.path ?? 'unknown'}`)
        .join('\n');

      const analysis = await this.reason(
        `During idle monitoring, I detected these issues:\n${errorSummary}\n${testSummary}\n\n` +
        `Provide a brief initial diagnosis and suggest whether a dedicated debug task should be created. Keep it concise.`,
      );

      this.addMemoryEntry({
        content: `Idle scan detected ${errorEvents.length} error(s) and ${testFailures.length} test failure(s)`,
        type: 'observation',
        importance: 0.6,
        source: 'self',
        relatedEntries: [],
      });

      // Broadcast the finding
      this.communicationBus.sendObservation(
        this.identity.role,
        `Idle error scan: ${analysis.slice(0, 300)}`,
        errorEvents.some(e => e.semanticClassification === 'error_state') ? 'warning' : 'info',
      );
    } catch (err) {
      console.error(`[${this.identity.name}] Idle reasoning error:`, err);
    }
  }

  // ─── Task Relevance Scoring ────────────────────────────────────────────

  scoreTaskRelevance(task: AgentTask): number {
    // Direct role match
    if (task.assignedTo === 'debug') return 1.0;

    // Score based on task type alignment
    switch (task.type) {
      case 'repair':
        return 0.95;
      case 'analysis':
        return 0.7;
      case 'security_scan':
        return 0.4;
      case 'optimization':
        return 0.35;
      case 'refactor':
        return 0.3;
      case 'research':
        return 0.2;
      case 'ux_review':
        return 0.1;
      default:
        return 0.1;
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  private gatherErrorContext(task: AgentTask): string {
    const parts: string[] = [];

    // Add related file information
    if (task.relatedFiles.length > 0) {
      parts.push(`Related files: ${task.relatedFiles.join(', ')}`);
    }

    // Add relevant memory entries about similar errors
    const recentErrorMemories = this.memory.shortTerm
      .filter(m => m.type === 'observation' && m.content.toLowerCase().includes('error'))
      .slice(-3);

    if (recentErrorMemories.length > 0) {
      parts.push(`Recent error observations:\n${recentErrorMemories.map(m => `- ${m.content}`).join('\n')}`);
    }

    // Check for recurring patterns
    const recurring = this.findRecurringErrorSignatures();
    if (recurring.length > 0) {
      parts.push(`Known recurring patterns: ${recurring.map(r => r.signature).join(', ')}`);
    }

    return parts.join('\n\n');
  }

  private buildDiagnosticPrompt(task: AgentTask, errorContext: string): string {
    const typePrompts: Record<AgentTask['type'], string> = {
      repair: `Diagnose the root cause of this error. ${errorContext}\n\n` +
        `Follow this methodology:\n` +
        `1. Identify the error type and its immediate context\n` +
        `2. Trace the error back through the call stack or data flow\n` +
        `3. Identify the root cause (distinguish from symptoms)\n` +
        `4. Assess the impact and urgency of the fix`,
      analysis: `Analyze this issue for potential root causes. ${errorContext}\n\n` +
        `Provide a systematic analysis of what might be going wrong.`,
      optimization: `This is an optimization request, but check if performance issues stem from bugs. ${errorContext}`,
      refactor: `Check if the refactoring request is motivated by error-prone patterns. ${errorContext}`,
      research: `Research the error patterns described. ${errorContext}`,
      security_scan: `Check if there are error conditions that could be exploited. ${errorContext}`,
      ux_review: `Check if UX issues are caused by underlying errors. ${errorContext}`,
    };

    return `${typePrompts[task.type] ?? typePrompts.repair}\n\nTask: ${task.title}\nDescription: ${task.description}`;
  }

  private buildFixPrompt(task: AgentTask, diagnosis: string): string {
    return `Based on this diagnosis:\n${diagnosis}\n\n` +
      `Propose a targeted fix for: ${task.title}\n` +
      `Description: ${task.description}\n` +
      `Related files: ${task.relatedFiles.join(', ')}\n\n` +
      `The fix should:\n` +
      `1. Address the root cause, not just the symptom\n` +
      `2. Be minimal — don't change more than necessary\n` +
      `3. Include clear explanation of what was wrong and why the fix works\n` +
      `4. Note any potential side effects\n` +
      `5. Suggest verification steps`;
  }

  private buildProposedActions(task: AgentTask, diagnosis: string, fix: string | null): AgentAction[] {
    const actions: AgentAction[] = [];

    // Always propose the diagnosis as an analysis action
    actions.push(this.proposeAction({
      type: 'analysis',
      description: `Root cause diagnosis for: ${task.title}`,
      confidence: this.assessDiagnosticConfidence(diagnosis, task),
      riskLevel: 'low',
      requiresApproval: false,
      params: { diagnosis, taskType: task.type },
      affectedFiles: task.relatedFiles,
      reasoning: diagnosis.slice(0, 500),
    }));

    // If a fix was proposed, create a repair action
    if (fix) {
      const riskLevel = this.assessFixRisk(task, fix);
      actions.push(this.proposeAction({
        type: 'diff_apply',
        description: `Apply fix for: ${task.title}`,
        confidence: Math.max(0.3, this.assessDiagnosticConfidence(diagnosis, task) - 0.15),
        riskLevel,
        requiresApproval: riskLevel !== 'low',
        params: { diff: fix, taskType: task.type },
        affectedFiles: task.relatedFiles,
        reasoning: `Fix based on root cause diagnosis: ${diagnosis.slice(0, 200)}`,
      }));
    }

    return actions;
  }

  private assessDiagnosticConfidence(diagnosis: string, task: AgentTask): number {
    let confidence = 0.4;

    // Root cause identification
    if (/root cause|caused by|the issue is|the problem is/i.test(diagnosis)) confidence += 0.15;

    // Stack trace analysis
    if (/stack trace|call stack|at\s+\S+\s+\(/i.test(diagnosis)) confidence += 0.1;

    // Evidence-based reasoning
    if (/because|since|due to|evidence|indicates/i.test(diagnosis)) confidence += 0.1;

    // Specific line references
    if (/line\s+\d+|:\d+:\d+|L\d+/i.test(diagnosis)) confidence += 0.1;

    // Task type alignment
    if (task.type === 'repair') confidence += 0.1;

    // Side effects considered
    if (/side effect|breaking change|backward/i.test(diagnosis)) confidence += 0.05;

    return Math.min(1, Math.max(0, confidence));
  }

  private assessFixRisk(task: AgentTask, fix: string): 'low' | 'medium' | 'high' {
    // More affected files = higher risk
    if (task.relatedFiles.length > 5) return 'high';
    if (task.relatedFiles.length > 2) return 'medium';

    // Broad changes = higher risk
    if (/rewrite|restructure|refactor/i.test(fix)) return 'high';
    if (/multiple|several|various/i.test(fix)) return 'medium';

    return 'low';
  }

  private trackErrorSignature(task: AgentTask, diagnosisOrContent: string): void {
    // Extract a simplified error signature from the content
    const signature = this.extractErrorSignature(task.title + ' ' + diagnosisOrContent);
    if (!signature) return;

    const existing = this.knownErrorSignatures.get(signature);
    if (existing) {
      existing.count++;
      existing.lastSeen = Date.now();
    } else {
      this.knownErrorSignatures.set(signature, { count: 1, lastSeen: Date.now() });
    }

    // Prune old signatures
    const oneHourAgo = Date.now() - 3_600_000;
    for (const [key, value] of this.knownErrorSignatures) {
      if (value.lastSeen < oneHourAgo) {
        this.knownErrorSignatures.delete(key);
      }
    }
  }

  private extractErrorSignature(content: string): string | null {
    // Extract error type patterns
    const errorPatterns = [
      /TypeError:\s*(\w+)/,
      /ReferenceError:\s*(\w+)/,
      /SyntaxError:\s*(\w+)/,
      /Error:\s*(\w+)/,
      /ENOENT.*?['"]([^'"]+)['"]/,
      /EPERM/,
      /ETIMEDOUT/,
      /Cannot read propert(?:y|ies) of (\w+)/,
      /is not (?:a|an) (\w+)/,
      /is not defined/,
      /Unexpected token/,
    ];

    for (const pattern of errorPatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[0].slice(0, 80);
      }
    }

    return null;
  }

  private findRecurringErrorSignatures(): { signature: string; count: number }[] {
    return Array.from(this.knownErrorSignatures.entries())
      .filter(([, value]) => value.count >= 2)
      .map(([signature, value]) => ({ signature, count: value.count }))
      .sort((a, b) => b.count - a.count)
      .slice(5);
  }

  private buildDiagnosticSummary(task: AgentTask, diagnosis: string): string {
    const sentences = diagnosis.split(/\.\s+/).filter(s => s.trim().length > 10);
    const summary = sentences.slice(0, 2).join('. ');
    return `[Debug] ${task.title}: ${summary.length > 0 ? summary : 'Diagnosis completed'}.`;
  }

  private extractEvidenceFromDiagnosis(diagnosis: string): string[] {
    const evidence: string[] = [];
    const lines = diagnosis.split('\n');
    for (const line of lines) {
      if (/evidence|indicates|proves|confirms|shows/i.test(line)) {
        evidence.push(line.trim());
      }
    }
    return evidence.slice(0, 5);
  }

  private extractAssumptionsFromDiagnosis(diagnosis: string): string[] {
    const assumptions: string[] = [];
    const patterns = [
      /assuming\s+(.+?)(?:\.|,|$)/gi,
      /presumably\s+(.+?)(?:\.|,|$)/gi,
      /likely\s+(.+?)(?:\.|,|$)/gi,
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(diagnosis)) !== null) {
        assumptions.push(match[1].trim());
      }
    }
    return assumptions.slice(0, 5);
  }
}

// ─── Factory Function ───────────────────────────────────────────────────────

export function createDebugAgent(
  communicationBus: AgentCommunicationBus,
  contextGraph: SharedContextGraph,
  providerManager: ProviderManager,
  memoryStore: MemoryStore,
): DebugAgent {
  return new DebugAgent(communicationBus, contextGraph, providerManager, memoryStore);
}
