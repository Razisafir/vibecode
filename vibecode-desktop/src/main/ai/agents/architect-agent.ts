// ============================================================
// VibeCode Desktop — ARC 22: Architect Agent
// System design, code organization, dependency management,
// refactoring strategies, and module boundary enforcement
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

const ARCHITECT_IDENTITY: Omit<AgentIdentity, 'id' | 'createdAt'> = {
  role: 'architect',
  name: 'Architect',
  description: 'Expert software architect focused on system design, code organization, dependency management, and refactoring strategies',
  avatar: '🏗️',
};

const ARCHITECT_CAPABILITIES: Omit<AgentCapabilities, 'restrictedPaths'> = {
  primaryDomain: 'system_design',
  capabilities: [
    { domain: 'system_design', score: 0.95, description: 'Designing system architecture, module boundaries, and dependency graphs' },
    { domain: 'refactoring', score: 0.9, description: 'Planning and executing code refactoring strategies' },
    { domain: 'code_organization', score: 0.9, description: 'Organizing code structure, layers, and separation of concerns' },
    { domain: 'dependency_management', score: 0.85, description: 'Analyzing and optimizing dependency relationships' },
    { domain: 'pattern_recognition', score: 0.8, description: 'Identifying architectural patterns and anti-patterns' },
    { domain: 'analysis', score: 0.75, description: 'Analyzing code structure and proposing improvements' },
  ],
  allowedStepTypes: ['file_write', 'file_edit', 'code_generation', 'diff_apply', 'analysis'],
  maxRiskLevel: 'medium',
  requiresApprovalAbove: 0.7,
};

// ─── Architect Agent ────────────────────────────────────────────────────────

export class ArchitectAgent extends BaseAgent {
  constructor(
    communicationBus: AgentCommunicationBus,
    contextGraph: SharedContextGraph,
    providerManager: ProviderManager,
    memoryStore: MemoryStore,
  ) {
    const identity: AgentIdentity = {
      ...ARCHITECT_IDENTITY,
      id: `architect-${uuidv4()}`,
      createdAt: Date.now(),
    };

    const capabilities: AgentCapabilities = {
      ...ARCHITECT_CAPABILITIES,
      restrictedPaths: [
        '**/.env*',
        '**/secrets/**',
        '**/credentials/**',
        '**/.git/**',
      ],
    };

    super(identity, capabilities, communicationBus, contextGraph, providerManager, memoryStore);
  }

  // ─── System Prompt ─────────────────────────────────────────────────────

  getSystemPrompt(): string {
    return `You are an expert software architect agent in the VibeCode multi-agent system.

## Core Responsibilities
- **System Design**: Analyze and propose architectural patterns, module boundaries, and dependency structures
- **Refactoring**: Plan and execute code refactoring strategies that improve maintainability without changing behavior
- **Code Organization**: Ensure clear separation of concerns, proper layering, and logical file/module structure
- **Dependency Management**: Analyze dependency graphs, detect circular dependencies, and propose decoupling strategies

## Decision Framework
1. Always consider the **impact radius** of any proposed change — prefer small, incremental refactors
2. Validate that refactoring preserves existing behavior — propose test strategies alongside structural changes
3. Consider backward compatibility when modifying public APIs or module boundaries
4. Identify and flag architectural anti-patterns: circular dependencies, god objects, leaky abstractions
5. Document architectural decisions with rationale, trade-offs, and alternatives considered

## Constraints
- You may propose file writes, edits, code generation, diffs, and analysis
- Maximum risk level you can auto-execute: **medium**
- Changes above 70% confidence threshold require approval
- You MUST NOT modify secrets, credentials, or git internals
- When uncertain about a refactor's safety, propose it as an analysis task first

## Output Format
When proposing architectural changes:
1. Describe the current state and its issues
2. Propose the target architecture with clear module boundaries
3. List the steps to transition from current to target state
4. Identify risks and mitigation strategies
5. Specify which files are affected and how`;
  }

  // ─── Task Processing ───────────────────────────────────────────────────

  async processTask(task: AgentTask): Promise<AgentTask> {
    const startTime = Date.now();
    this.setStatus('executing');

    try {
      // Build context from the task's related files
      const fileContext = task.relatedFiles.length > 0
        ? `Related files: ${task.relatedFiles.join(', ')}`
        : 'No specific files provided.';

      // Determine the reasoning prompt based on task type
      const reasoningPrompt = this.buildReasoningPrompt(task, fileContext);

      // Perform LLM reasoning
      const reasoningResult = await this.reason(reasoningPrompt);

      // Parse the reasoning result into structured actions
      const proposedActions = this.parseReasoningToActions(task, reasoningResult);

      // Update the task with results
      const updatedTask: AgentTask = {
        ...task,
        status: 'completed',
        confidence: this.assessConfidence(reasoningResult, task),
        startedAt: task.startedAt ?? startTime,
        completedAt: Date.now(),
        result: {
          success: true,
          summary: this.buildSummary(task, reasoningResult),
          details: reasoningResult,
          affectedFiles: task.relatedFiles,
          proposedActions,
          metrics: {
            duration: Date.now() - startTime,
            tokensUsed: reasoningResult.length,
            iterationsRequired: 1,
            confidenceChange: this.assessConfidence(reasoningResult, task) - task.confidence,
          },
        },
      };

      // Share the architectural decision with other agents
      this.communicationBus.sendReflection(this.identity.role, {
        premises: [fileContext, `Task type: ${task.type}`],
        conclusion: this.buildSummary(task, reasoningResult),
        confidence: updatedTask.confidence,
        evidence: proposedActions.map(a => a.description),
        assumptions: this.extractAssumptions(reasoningResult),
        gaps: [],
      });

      // Store the decision in agent memory for future reference
      this.addMemoryEntry({
        content: `Architectural decision for "${task.title}": ${this.buildSummary(task, reasoningResult)}`,
        type: 'decision',
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
          summary: `Architect agent failed to process task: ${err instanceof Error ? err.message : String(err)}`,
          details: err instanceof Error ? err.stack ?? err.message : String(err),
          affectedFiles: task.relatedFiles,
          proposedActions: [],
          metrics: {
            duration: Date.now() - startTime,
            tokensUsed: 0,
            iterationsRequired: 1,
            confidenceChange: -0.2,
          },
        },
      };
      return updatedTask;
    }
  }

  // ─── Observation Handling ───────────────────────────────────────────────

  handleObservation(observation: AgentObservation): void {
    // Architect cares about structural changes and patterns
    switch (observation.type) {
      case 'file_change':
        this.addMemoryEntry({
          content: `File change detected: ${observation.content}`,
          type: 'observation',
          importance: 0.5,
          source: 'workspace',
          relatedEntries: [],
        });
        break;

      case 'pattern_found':
        // Architect agents are particularly interested in patterns
        this.addMemoryEntry({
          content: `Pattern detected: ${observation.content}`,
          type: 'learning',
          importance: observation.severity === 'warning' ? 0.8 : 0.6,
          source: 'peer_agent',
          relatedEntries: [],
        });
        // Form a hypothesis about the pattern
        this.addHypothesis({
          id: uuidv4(),
          description: `Architectural pattern: ${observation.content}`,
          confidence: 0.6,
          evidence: [observation.source],
          testable: true,
          createdAt: Date.now(),
        });
        break;

      case 'dependency_update':
        this.addMemoryEntry({
          content: `Dependency update: ${observation.content}`,
          type: 'observation',
          importance: 0.7,
          source: 'workspace',
          relatedEntries: [],
        });
        // Dependency changes may require architectural review
        if (observation.severity === 'warning' || observation.severity === 'critical') {
          this.communicationBus.sendObservation(
            this.identity.role,
            `Dependency change may require architectural review: ${observation.content}`,
            'warning',
          );
        }
        break;

      default:
        // Store other observations at lower priority
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
      // Lightweight scan: look for architectural improvements in the workspace
      const recentEvents = this.contextGraph.getRecentEvents(20);

      // Filter for events that might indicate architectural concerns
      const structuralEvents = recentEvents.filter(e =>
        e.semanticClassification === 'source_change' ||
        e.semanticClassification === 'dependency_change' ||
        e.semanticClassification === 'config_change',
      );

      if (structuralEvents.length < 3) {
        // Not enough activity to justify deep reasoning
        return;
      }

      // Check for patterns that suggest architectural issues
      const fileChangeCounts = new Map<string, number>();
      for (const event of structuralEvents) {
        if (event.path) {
          fileChangeCounts.set(event.path, (fileChangeCounts.get(event.path) ?? 0) + 1);
        }
      }

      // Files changed frequently may indicate poor separation of concerns
      const hotspots = Array.from(fileChangeCounts.entries())
        .filter(([, count]) => count >= 3)
        .map(([path, count]) => `${path} (${count} changes)`);

      if (hotspots.length > 0) {
        const analysis = await this.reason(
          `During idle analysis, I noticed these files are frequently modified: ${hotspots.join(', ')}. ` +
          `This may indicate a separation of concerns issue. Briefly analyze whether these hotspots suggest ` +
          `architectural problems and propose improvements. Keep the response concise.`,
        );

        // Propose a lightweight observation, not a full task
        this.communicationBus.sendObservation(
          this.identity.role,
          `Idle analysis: ${hotspots.length} file(s) modified frequently, possible architectural concern. ${analysis.slice(0, 200)}`,
          'info',
        );

        this.addMemoryEntry({
          content: `Idle scan detected ${hotspots.length} change hotspots: ${hotspots.join(', ')}`,
          type: 'learning',
          importance: 0.5,
          source: 'self',
          relatedEntries: [],
        });
      }
    } catch (err) {
      // Idle reasoning should never throw — log and continue
      console.error(`[${this.identity.name}] Idle reasoning error:`, err);
    }
  }

  // ─── Task Relevance Scoring ────────────────────────────────────────────

  scoreTaskRelevance(task: AgentTask): number {
    // Direct role match
    if (task.assignedTo === 'architect') return 1.0;

    // Score based on task type alignment
    switch (task.type) {
      case 'refactor':
        return 0.95;
      case 'analysis':
        return 0.85;
      case 'research':
        return 0.4;
      case 'optimization':
        return 0.3;
      case 'repair':
        return 0.25;
      case 'ux_review':
        return 0.15;
      case 'security_scan':
        return 0.1;
      default:
        return 0.1;
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  private buildReasoningPrompt(task: AgentTask, fileContext: string): string {
    const typePrompts: Record<AgentTask['type'], string> = {
      refactor: `Analyze the current code structure and propose a refactoring strategy. ${fileContext}. ` +
        `Identify specific code smells, coupling issues, or architectural violations. ` +
        `Propose a step-by-step refactoring plan with clear before/after descriptions.`,
      analysis: `Perform an architectural analysis. ${fileContext}. ` +
        `Evaluate module boundaries, dependency direction, separation of concerns, and adherence to SOLID principles. ` +
        `Highlight strengths and areas for improvement.`,
      research: `Research architectural patterns and best practices relevant to this task. ${fileContext}. ` +
        `Consider established design patterns that could improve the codebase structure.`,
      optimization: `Evaluate the structural aspects of this optimization request. ${fileContext}. ` +
        `Consider whether the optimization requires architectural changes or can be localized.`,
      repair: `Assess whether this bug has architectural roots — e.g., poor separation of concerns, tight coupling, or missing abstractions. ${fileContext}`,
      security_scan: `From an architectural perspective, identify any structural patterns that may create security vulnerabilities. ${fileContext}`,
      ux_review: `Evaluate whether the architecture supports the UX requirements. ${fileContext}. ` +
        `Consider if the current module structure enables the desired user experience.`,
    };

    return `${typePrompts[task.type] ?? typePrompts.analysis}\n\nTask: ${task.title}\nDescription: ${task.description}`;
  }

  private parseReasoningToActions(task: AgentTask, reasoning: string): AgentAction[] {
    const actions: AgentAction[] = [];

    // Propose analysis action for the reasoning output
    actions.push(this.proposeAction({
      type: 'analysis',
      description: `Architectural analysis for: ${task.title}`,
      confidence: this.assessConfidence(reasoning, task),
      riskLevel: 'low',
      requiresApproval: false,
      params: { reasoning, taskType: task.type },
      affectedFiles: task.relatedFiles,
      reasoning: reasoning.slice(0, 500),
    }));

    // If the task involves refactoring or structural changes, propose an action
    if (task.type === 'refactor' || task.type === 'analysis') {
      const riskLevel = task.relatedFiles.length > 5 ? 'medium' : 'low';
      actions.push(this.proposeAction({
        type: 'diff_apply',
        description: `Apply architectural changes for: ${task.title}`,
        confidence: Math.max(0.3, this.assessConfidence(reasoning, task) - 0.1),
        riskLevel,
        requiresApproval: riskLevel === 'medium',
        params: { diff: reasoning, taskType: task.type },
        affectedFiles: task.relatedFiles,
        reasoning: `Architectural improvement based on analysis of ${task.relatedFiles.length} file(s)`,
      }));
    }

    return actions;
  }

  private assessConfidence(reasoning: string, task: AgentTask): number {
    // Base confidence from the reasoning quality indicators
    let confidence = 0.5;

    // More detailed reasoning suggests higher confidence
    if (reasoning.length > 500) confidence += 0.1;
    if (reasoning.length > 1000) confidence += 0.1;

    // Presence of structured analysis indicators
    const hasStructure = /step\s*\d|first|second|then|finally/i.test(reasoning);
    if (hasStructure) confidence += 0.1;

    // Presence of trade-off analysis
    const hasTradeoffs = /trade.?off|however|on the other hand|alternatively/i.test(reasoning);
    if (hasTradeoffs) confidence += 0.1;

    // Task type alignment — architect is most confident with analysis/refactor
    if (task.type === 'refactor' || task.type === 'analysis') confidence += 0.1;

    // Clamp to [0, 1]
    return Math.min(1, Math.max(0, confidence));
  }

  private buildSummary(task: AgentTask, reasoning: string): string {
    // Extract the first meaningful sentence or two from the reasoning
    const sentences = reasoning.split(/\.\s+/).filter(s => s.trim().length > 10);
    const summary = sentences.slice(0, 2).join('. ');
    return `[Architect] ${task.title}: ${summary.length > 0 ? summary : 'Analysis completed'}.`;
  }

  private extractAssumptions(reasoning: string): string[] {
    const assumptions: string[] = [];
    const assumptionPatterns = [
      /assuming\s+(.+?)(?:\.|,|$)/gi,
      /presupposes?\s+(.+?)(?:\.|,|$)/gi,
      /expect(?:s|ed)?\s+(.+?)(?:\.|,|$)/gi,
    ];

    for (const pattern of assumptionPatterns) {
      let match;
      while ((match = pattern.exec(reasoning)) !== null) {
        assumptions.push(match[1].trim());
      }
    }

    return assumptions.slice(0, 5);
  }
}

// ─── Factory Function ───────────────────────────────────────────────────────

export function createArchitectAgent(
  communicationBus: AgentCommunicationBus,
  contextGraph: SharedContextGraph,
  providerManager: ProviderManager,
  memoryStore: MemoryStore,
): ArchitectAgent {
  return new ArchitectAgent(communicationBus, contextGraph, providerManager, memoryStore);
}
