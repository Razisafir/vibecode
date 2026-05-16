// ============================================================
// VibeCode Desktop — ARC 22: Product Agent
// UX quality, feature completeness, usability review,
// and user-centric design enforcement
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

const PRODUCT_IDENTITY: Omit<AgentIdentity, 'id' | 'createdAt'> = {
  role: 'product',
  name: 'Product',
  description: 'Product-focused engineer who ensures features meet user needs and maintains UX quality',
  avatar: '✨',
};

const PRODUCT_CAPABILITIES: Omit<AgentCapabilities, 'restrictedPaths'> = {
  primaryDomain: 'ux_quality',
  capabilities: [
    { domain: 'ux_review', score: 0.95, description: 'Reviewing user experience, usability, and accessibility' },
    { domain: 'feature_completeness', score: 0.9, description: 'Validating that features fully meet user requirements' },
    { domain: 'accessibility', score: 0.85, description: 'Ensuring WCAG compliance and inclusive design' },
    { domain: 'interaction_design', score: 0.85, description: 'Evaluating interaction patterns and user flows' },
    { domain: 'consistency_analysis', score: 0.8, description: 'Identifying inconsistencies in UI/UX patterns' },
    { domain: 'user_feedback_synthesis', score: 0.75, description: 'Synthesizing user feedback into actionable improvements' },
  ],
  allowedStepTypes: ['file_write', 'file_edit', 'code_generation', 'analysis', 'review'],
  maxRiskLevel: 'medium',
  requiresApprovalAbove: 0.5,
};

// ─── UX Heuristic Catalog ───────────────────────────────────────────────────

interface UXHeuristic {
  id: string;
  category: string;
  name: string;
  description: string;
  checkPattern: RegExp;
  severity: 'info' | 'warning' | 'critical';
  suggestion: string;
}

const UX_HEURISTICS: UXHeuristic[] = [
  {
    id: 'UX-001',
    category: 'accessibility',
    name: 'Missing alt text on images',
    description: 'Images without alt text are inaccessible to screen readers',
    checkPattern: /<img[^>]*(?!alt=)[^>]*>/,
    severity: 'warning',
    suggestion: 'Add descriptive alt text to all meaningful images; use alt="" for decorative ones',
  },
  {
    id: 'UX-002',
    category: 'accessibility',
    name: 'Missing aria-label on interactive elements',
    description: 'Interactive elements without accessible labels',
    checkPattern: /<button[^>]*>(?:\s*<\/button>)/,
    severity: 'warning',
    suggestion: 'Add aria-label or visible text content to buttons',
  },
  {
    id: 'UX-003',
    category: 'interaction',
    name: 'Missing loading states',
    description: 'Async operations without loading indicators',
    checkPattern: /await\s+\w+\([^)]*\)[^;]*;(?:\s*(?!setLoading|setIsLoading|showSpinner|isLoading))/,
    severity: 'info',
    suggestion: 'Add loading states for async operations to provide user feedback',
  },
  {
    id: 'UX-004',
    category: 'interaction',
    name: 'Missing error states',
    description: 'Try-catch blocks without user-facing error handling',
    checkPattern: /catch\s*\(\s*\w+\s*\)\s*\{\s*(?:\/\/|\/\*|console\.(log|error)|\})/,
    severity: 'warning',
    suggestion: 'Show user-friendly error messages and recovery options',
  },
  {
    id: 'UX-005',
    category: 'consistency',
    name: 'Hardcoded strings without i18n',
    description: 'User-facing text hardcoded instead of internationalized',
    checkPattern: /(?:placeholder|title|label|heading)\s*[:=]\s*['"][A-Z][a-zA-Z\s]+['"]/,
    severity: 'info',
    suggestion: 'Use i18n keys for user-facing text to support localization',
  },
  {
    id: 'UX-006',
    category: 'accessibility',
    name: 'Low color contrast indicator',
    description: 'Potential low contrast in UI elements',
    checkPattern: /color:\s*#(?:[8-9a-f]{2}|[a-f]{2})[0-9a-f]{4}|color:\s*(?:light|white|gray)/i,
    severity: 'warning',
    suggestion: 'Ensure text meets WCAG AA contrast ratio (4.5:1 for normal text)',
  },
  {
    id: 'UX-007',
    category: 'interaction',
    name: 'Missing keyboard navigation',
    description: 'Clickable divs without keyboard handlers',
    checkPattern: /<div[^>]*onClick[^>]*(?!onKeyDown)(?!role)/,
    severity: 'warning',
    suggestion: 'Add role="button", tabIndex, and onKeyDown handler for keyboard accessibility',
  },
  {
    id: 'UX-008',
    category: 'feedback',
    name: 'Missing form validation feedback',
    description: 'Form inputs without validation or error display',
    checkPattern: /<input[^>]*(?!required)(?!pattern)(?!aria-invalid)/,
    severity: 'info',
    suggestion: 'Add validation attributes and associated error messages',
  },
];

// ─── Product Agent ──────────────────────────────────────────────────────────

export class ProductAgent extends BaseAgent {
  /** Tracks UX inconsistencies across the workspace */
  private uxInconsistencies: Map<string, {
    category: string;
    description: string;
    occurrences: number;
    lastSeen: number;
  }> = new Map();

  constructor(
    communicationBus: AgentCommunicationBus,
    contextGraph: SharedContextGraph,
    providerManager: ProviderManager,
    memoryStore: MemoryStore,
  ) {
    const identity: AgentIdentity = {
      ...PRODUCT_IDENTITY,
      id: `product-${uuidv4()}`,
      createdAt: Date.now(),
    };

    const capabilities: AgentCapabilities = {
      ...PRODUCT_CAPABILITIES,
      restrictedPaths: [
        '**/.env*',
        '**/secrets/**',
        '**/credentials/**',
        '**/.git/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/package-lock.json',
      ],
    };

    super(identity, capabilities, communicationBus, contextGraph, providerManager, memoryStore);
  }

  // ─── System Prompt ─────────────────────────────────────────────────────

  getSystemPrompt(): string {
    return `You are an expert product-focused engineer agent in the VibeCode multi-agent system.

## Core Responsibilities
- **UX Review**: Evaluate user experience, usability, and accessibility of features
- **Feature Completeness**: Validate that features fully meet user requirements and edge cases
- **Consistency Analysis**: Identify inconsistencies in UI patterns, interactions, and terminology
- **Accessibility**: Ensure WCAG compliance and inclusive design practices

## UX Evaluation Framework
1. **Usability**: Can users accomplish their goals efficiently and without confusion?
2. **Accessibility**: Is the feature usable by people with disabilities?
3. **Consistency**: Does the feature follow established patterns in the application?
4. **Feedback**: Are users informed of system state (loading, errors, success)?
5. **Error Recovery**: Can users recover from mistakes easily?
6. **Edge Cases**: Are edge cases and boundary conditions handled gracefully?

## Heuristic Categories
- **Accessibility**: Screen reader support, keyboard navigation, color contrast, ARIA attributes
- **Interaction**: Loading states, error states, empty states, transitions, responsive behavior
- **Consistency**: Terminology, visual patterns, interaction patterns, naming conventions
- **Feedback**: Status messages, progress indicators, confirmation dialogs, undo support
- **Completeness**: Edge cases, empty states, offline behavior, permission handling

## Decision Framework
- Always advocate for the user's perspective
- Balance perfection with pragmatism — flag critical issues, suggest improvements for others
- When UX and performance conflict, propose solutions that address both
- Consider diverse user contexts: different devices, network conditions, abilities
- Prioritize accessibility issues — they affect real users

## Constraints
- You may propose file writes, edits, code generation, analysis, and reviews
- Maximum risk level you can auto-execute: **medium**
- Changes above 50% confidence threshold require approval
- You MUST NOT modify secrets, credentials, or git internals
- When suggesting UX changes that affect architecture, coordinate with the architect agent
- Always explain the user impact of any proposed change

## Output Format
When reviewing UX:
1. State the feature/area being reviewed
2. List findings by severity (Critical UX blocker → Minor improvement)
3. For each finding, describe the user impact
4. Propose a specific, implementable fix
5. Note any accessibility compliance requirements (WCAG level)`;
  }

  // ─── Task Processing ───────────────────────────────────────────────────

  async processTask(task: AgentTask): Promise<AgentTask> {
    const startTime = Date.now();
    this.setStatus('executing');

    try {
      // Phase 1: Run UX heuristic checks
      const heuristicResults = this.runUXHeuristics(task);

      // Phase 2: Perform LLM-powered UX analysis
      const analysisPrompt = this.buildUXAnalysisPrompt(task, heuristicResults);
      const analysisResult = await this.reason(analysisPrompt);

      // Phase 3: If UX review task, generate improvement proposals
      let improvementPlan: string | null = null;
      if (task.type === 'ux_review') {
        const planPrompt = this.buildImprovementPlanPrompt(task, analysisResult, heuristicResults);
        improvementPlan = await this.reason(planPrompt);
      }

      // Combine results
      const combinedResult = improvementPlan
        ? `${analysisResult}\n\n--- Improvement Plan ---\n${improvementPlan}`
        : analysisResult;

      // Update inconsistency tracking
      this.updateInconsistencyTracking(heuristicResults);

      // Build proposed actions
      const proposedActions = this.buildProposedActions(task, combinedResult, heuristicResults);

      // Determine confidence
      const confidence = this.assessUXConfidence(combinedResult, task, heuristicResults);

      // Share UX findings with other agents
      this.communicationBus.sendReflection(this.identity.role, {
        premises: [
          `Review type: ${task.type}`,
          `Files reviewed: ${task.relatedFiles.join(', ') || 'none'}`,
          `UX issues found: ${heuristicResults.length}`,
        ],
        conclusion: this.buildUXSummary(task, combinedResult, heuristicResults),
        confidence,
        evidence: heuristicResults.slice(0, 5).map(h => `${h.name}: ${h.description}`),
        assumptions: this.extractAssumptionsFromAnalysis(combinedResult),
        gaps: this.identifyReviewGaps(heuristicResults),
      });

      const updatedTask: AgentTask = {
        ...task,
        status: 'completed',
        confidence,
        startedAt: task.startedAt ?? startTime,
        completedAt: Date.now(),
        result: {
          success: true,
          summary: this.buildUXSummary(task, combinedResult, heuristicResults),
          details: combinedResult,
          affectedFiles: task.relatedFiles,
          proposedActions,
          metrics: {
            duration: Date.now() - startTime,
            tokensUsed: combinedResult.length,
            iterationsRequired: improvementPlan ? 2 : 1,
            confidenceChange: confidence - task.confidence,
          },
        },
      };

      // Store the UX review finding in memory
      this.addMemoryEntry({
        content: `UX review for "${task.title}": ${this.buildUXSummary(task, combinedResult, heuristicResults)}`,
        type: 'decision',
        importance: heuristicResults.some(h => h.severity === 'critical') ? 0.9 : 0.65,
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
          summary: `Product agent failed to process task: ${err instanceof Error ? err.message : String(err)}`,
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
    switch (observation.type) {
      case 'file_change':
        // File changes may affect UX — especially UI-related files
        const isUIFile = observation.source.match(/\.(tsx|jsx|vue|svelte|css|scss|html)$/i);
        this.addMemoryEntry({
          content: `File change ${isUIFile ? '(UI-related)' : ''}: ${observation.content}`,
          type: 'observation',
          importance: isUIFile ? 0.6 : 0.3,
          source: 'workspace',
          relatedEntries: [],
        });

        // UI file changes may need UX review
        if (isUIFile && observation.severity !== 'info') {
          this.communicationBus.sendObservation(
            this.identity.role,
            `UI file changed, may need UX review: ${observation.content}`,
            'info',
          );
        }
        break;

      case 'pattern_found':
        // Patterns found by other agents may indicate UX inconsistencies
        if (/inconsistent|pattern|variant|different/i.test(observation.content)) {
          this.addMemoryEntry({
            content: `Potential UX inconsistency: ${observation.content}`,
            type: 'observation',
            importance: 0.7,
            source: 'peer_agent',
            relatedEntries: [],
          });

          this.addHypothesis({
            id: uuidv4(),
            description: `UX inconsistency: ${observation.content.slice(0, 200)}`,
            confidence: 0.5,
            evidence: [observation.source],
            testable: true,
            createdAt: Date.now(),
          });
        }
        break;

      case 'error_detected':
        // Errors that users might see are UX concerns
        if (/render|display|layout|component|UI|visual/i.test(observation.content)) {
          this.addMemoryEntry({
            content: `UI-related error: ${observation.content}`,
            type: 'observation',
            importance: 0.6,
            source: 'workspace',
            relatedEntries: [],
          });
        }
        break;

      case 'performance_issue':
        // Performance issues that affect UX (slow renders, jank)
        this.addMemoryEntry({
          content: `Performance issue affecting UX: ${observation.content}`,
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
      // Look for UX inconsistencies in the workspace
      const recentEvents = this.contextGraph.getRecentEvents(25);

      // Focus on UI-related changes
      const uiEvents = recentEvents.filter(e => {
        if (!e.path) return false;
        return /\.(tsx|jsx|vue|svelte|css|scss|html)$/i.test(e.path) &&
          !e.path.includes('node_modules') &&
          !e.path.includes('dist');
      });

      if (uiEvents.length === 0) {
        // Check for tracked inconsistencies
        const activeInconsistencies = Array.from(this.uxInconsistencies.entries())
          .filter(([, inc]) => inc.occurrences >= 2 && Date.now() - inc.lastSeen < 3_600_000)
          .map(([id, inc]) => ({ id, ...inc }));

        if (activeInconsistencies.length > 0) {
          const incSummary = activeInconsistencies
            .map(inc => `${inc.category}: ${inc.description} (${inc.occurrences}x)`)
            .join('; ');

          const analysis = await this.reason(
            `During idle monitoring, I noticed recurring UX inconsistencies: ${incSummary}. ` +
            `Briefly suggest how to resolve these inconsistencies. Keep it concise.`,
          );

          this.communicationBus.sendObservation(
            this.identity.role,
            `UX inconsistency pattern: ${analysis.slice(0, 300)}`,
            'info',
          );
        }
        return;
      }

      // Analyze recent UI changes for patterns
      const uiPaths = uiEvents.map(e => e.path!).filter(Boolean);
      const uniquePaths = [...new Set(uiPaths)];

      if (uniquePaths.length >= 2) {
        const analysis = await this.reason(
          `During idle monitoring, I noticed UI changes in: ${uniquePaths.join(', ')}. ` +
          `Briefly assess whether these changes maintain UX consistency across the application. Keep it concise.`,
        );

        this.communicationBus.sendObservation(
          this.identity.role,
          `UX consistency check: ${analysis.slice(0, 300)}`,
          'info',
        );

        this.addMemoryEntry({
          content: `Idle scan reviewed ${uniquePaths.length} UI file(s) for consistency`,
          type: 'learning',
          importance: 0.4,
          source: 'self',
          relatedEntries: [],
        });
      }

      // Prune stale inconsistencies
      this.pruneStaleInconsistencies();
    } catch (err) {
      console.error(`[${this.identity.name}] Idle reasoning error:`, err);
    }
  }

  // ─── Task Relevance Scoring ────────────────────────────────────────────

  scoreTaskRelevance(task: AgentTask): number {
    // Direct role match
    if (task.assignedTo === 'product') return 1.0;

    // Score based on task type alignment
    switch (task.type) {
      case 'ux_review':
        return 0.95;
      case 'analysis':
        return 0.5;
      case 'refactor':
        return 0.35;
      case 'research':
        return 0.3;
      case 'repair':
        return 0.25;
      case 'optimization':
        return 0.2;
      case 'security_scan':
        return 0.1;
      default:
        return 0.1;
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  private runUXHeuristics(task: AgentTask): UXHeuristicResult[] {
    const results: UXHeuristicResult[] = [];

    // Scan task description and context for UX patterns
    const contentToScan = [
      task.description,
      task.title,
    ].join('\n');

    for (const heuristic of UX_HEURISTICS) {
      if (heuristic.checkPattern.test(contentToScan)) {
        results.push({
          id: heuristic.id,
          category: heuristic.category,
          name: heuristic.name,
          description: heuristic.description,
          severity: heuristic.severity,
          suggestion: heuristic.suggestion,
        });
      }
    }

    return results;
  }

  private buildUXAnalysisPrompt(task: AgentTask, heuristicResults: UXHeuristicResult[]): string {
    const heuristicContext = heuristicResults.length > 0
      ? `\n\nUX heuristic findings:\n${heuristicResults.map(h =>
          `[${h.severity.toUpperCase()}] ${h.name}: ${h.description}\n  Suggestion: ${h.suggestion}`,
        ).join('\n')}`
      : '\n\nNo heuristic violations detected in static scan.';

    const typePrompts: Record<AgentTask['type'], string> = {
      ux_review: `Perform a comprehensive UX review. ${heuristicContext}\n\n` +
        `Evaluate for:\n` +
        `1. Usability: Can users accomplish their goals efficiently?\n` +
        `2. Accessibility: WCAG compliance, keyboard navigation, screen reader support\n` +
        `3. Consistency: Does the feature follow established patterns?\n` +
        `4. Feedback: Are loading, error, and success states properly handled?\n` +
        `5. Edge cases: Are empty states, offline, and error scenarios covered?\n` +
        `6. Responsiveness: Does the feature work across screen sizes?`,
      analysis: `Analyze the user experience implications. ${heuristicContext}`,
      refactor: `Ensure the refactoring maintains or improves UX quality. ${heuristicContext}`,
      repair: `Check if the fix properly handles user-facing error states. ${heuristicContext}`,
      research: `Research UX best practices relevant to this feature. ${heuristicContext}`,
      optimization: `Ensure optimizations don't degrade user experience (e.g., removing loading states for speed). ${heuristicContext}`,
      security_scan: `Check if security measures negatively impact UX (e.g., overly restrictive validation). ${heuristicContext}`,
    };

    return `${typePrompts[task.type] ?? typePrompts.ux_review}\n\n` +
      `Task: ${task.title}\nDescription: ${task.description}\n` +
      `Related files: ${task.relatedFiles.join(', ') || 'none specified'}`;
  }

  private buildImprovementPlanPrompt(
    task: AgentTask,
    analysisResult: string,
    heuristicResults: UXHeuristicResult[],
  ): string {
    return `Based on this UX analysis:\n${analysisResult.slice(0, 1000)}\n\n` +
      `And these heuristic findings:\n${heuristicResults.map(h => `- [${h.severity}] ${h.name}: ${h.suggestion}`).join('\n')}\n\n` +
      `Create a specific UX improvement plan for: ${task.title}\n` +
      `Related files: ${task.relatedFiles.join(', ')}\n\n` +
      `For each improvement:\n` +
      `1. Describe the UX issue from the user's perspective\n` +
      `2. Propose a specific, implementable fix\n` +
      `3. Note any accessibility requirements (WCAG level)\n` +
      `4. Consider impact on existing patterns and consistency\n` +
      `5. Prioritize by user impact`;
  }

  private updateInconsistencyTracking(heuristicResults: UXHeuristicResult[]): void {
    for (const result of heuristicResults) {
      const existing = this.uxInconsistencies.get(result.id);
      if (existing) {
        existing.occurrences++;
        existing.lastSeen = Date.now();
      } else {
        this.uxInconsistencies.set(result.id, {
          category: result.category,
          description: `${result.name}: ${result.description}`,
          occurrences: 1,
          lastSeen: Date.now(),
        });
      }
    }
  }

  private pruneStaleInconsistencies(): void {
    const oneHourAgo = Date.now() - 3_600_000;
    for (const [id, inc] of this.uxInconsistencies) {
      if (inc.lastSeen < oneHourAgo) {
        this.uxInconsistencies.delete(id);
      }
    }
  }

  private buildProposedActions(
    task: AgentTask,
    result: string,
    heuristicResults: UXHeuristicResult[],
  ): AgentAction[] {
    const actions: AgentAction[] = [];

    // Always propose the UX analysis action
    actions.push(this.proposeAction({
      type: 'analysis',
      description: `UX analysis for: ${task.title}`,
      confidence: this.assessUXConfidence(result, task, heuristicResults),
      riskLevel: 'low',
      requiresApproval: false,
      params: { result, heuristicCount: heuristicResults.length, taskType: task.type },
      affectedFiles: task.relatedFiles,
      reasoning: result.slice(0, 500),
    }));

    // If UX improvements are needed, propose code changes
    if (task.type === 'ux_review' && heuristicResults.length > 0) {
      const criticalCount = heuristicResults.filter(h => h.severity === 'critical' || h.severity === 'warning').length;
      const riskLevel: 'low' | 'medium' = criticalCount > 3 ? 'medium' : 'low';

      actions.push(this.proposeAction({
        type: 'code_generation',
        description: `Generate UX improvements for: ${task.title}`,
        confidence: Math.max(0.4, this.assessUXConfidence(result, task, heuristicResults) - 0.1),
        riskLevel,
        requiresApproval: riskLevel === 'medium',
        params: {
          heuristicResults: heuristicResults.map(h => ({ id: h.id, name: h.name, suggestion: h.suggestion })),
          taskType: task.type,
        },
        affectedFiles: task.relatedFiles,
        reasoning: `UX improvements based on ${heuristicResults.length} heuristic finding(s)`,
      }));
    }

    // If accessibility issues found, flag for review
    const accessibilityIssues = heuristicResults.filter(h => h.category === 'accessibility');
    if (accessibilityIssues.length > 0) {
      actions.push(this.proposeAction({
        type: 'review',
        description: `Accessibility review required for: ${task.title}`,
        confidence: 0.85,
        riskLevel: 'low',
        requiresApproval: false,
        params: {
          accessibilityIssueCount: accessibilityIssues.length,
          wcagLevel: 'AA',
        },
        affectedFiles: task.relatedFiles,
        reasoning: `${accessibilityIssues.length} accessibility issue(s) require review`,
      }));
    }

    // If the changes involve architecture, coordinate with architect
    if (/component structure|state management|routing|layout system/i.test(result)) {
      actions.push(this.proposeAction({
        type: 'delegate',
        description: `Coordinate architectural changes for: ${task.title}`,
        confidence: 0.6,
        riskLevel: 'low',
        requiresApproval: false,
        params: {
          delegateTo: 'architect',
          reason: 'UX changes may require architectural coordination',
        },
        affectedFiles: task.relatedFiles,
        reasoning: 'UX improvements involve structural changes requiring architect review',
      }));
    }

    return actions;
  }

  private assessUXConfidence(
    result: string,
    task: AgentTask,
    heuristicResults: UXHeuristicResult[],
  ): number {
    let confidence = 0.5;

    // Heuristic findings increase confidence (they're evidence-based)
    if (heuristicResults.length > 0) confidence += 0.1;

    // Critical findings increase confidence in the assessment
    if (heuristicResults.some(h => h.severity === 'critical')) confidence += 0.15;

    // Task type alignment
    if (task.type === 'ux_review') confidence += 0.15;

    // User-centric reasoning
    if (/user|ux|usability|accessibility|experience/i.test(result)) confidence += 0.1;

    // WCAG reference
    if (/wcag|aria|screen reader|keyboard/i.test(result)) confidence += 0.05;

    return Math.min(1, Math.max(0, confidence));
  }

  private buildUXSummary(
    task: AgentTask,
    result: string,
    heuristicResults: UXHeuristicResult[],
  ): string {
    const parts: string[] = [`[Product] ${task.title}: `];

    if (heuristicResults.length > 0) {
      const bySeverity = {
        critical: heuristicResults.filter(h => h.severity === 'critical').length,
        warning: heuristicResults.filter(h => h.severity === 'warning').length,
        info: heuristicResults.filter(h => h.severity === 'info').length,
      };

      const categories = [...new Set(heuristicResults.map(h => h.category))];

      if (bySeverity.critical > 0) parts.push(`${bySeverity.critical} critical,`);
      if (bySeverity.warning > 0) parts.push(`${bySeverity.warning} warning,`);
      if (bySeverity.info > 0) parts.push(`${bySeverity.info} info`);
      parts.push(`UX finding(s) in ${categories.join(', ')}.`);
    } else {
      const sentences = result.split(/\.\s+/).filter(s => s.trim().length > 10);
      const summary = sentences.slice(0, 2).join('. ');
      parts.push(summary.length > 0 ? summary : 'UX review completed, no major issues found.');
    }

    return parts.join(' ');
  }

  private extractAssumptionsFromAnalysis(result: string): string[] {
    const assumptions: string[] = [];
    const patterns = [
      /assuming\s+(?:users?|the user)\s+(.+?)(?:\.|,|$)/gi,
      /presumably\s+(.+?)(?:\.|,|$)/gi,
      /likely\s+(?:expect|want|need)\s+(.+?)(?:\.|,|$)/gi,
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(result)) !== null) {
        assumptions.push(match[1]?.trim() ?? match[0].trim());
      }
    }
    return assumptions.slice(0, 5);
  }

  private identifyReviewGaps(heuristicResults: UXHeuristicResult[]): string[] {
    const gaps: string[] = [];

    // Check for categories not covered
    const reviewedCategories = new Set(heuristicResults.map(h => h.category));
    const allCategories = ['accessibility', 'interaction', 'consistency', 'feedback', 'completeness'];

    for (const cat of allCategories) {
      if (!reviewedCategories.has(cat)) {
        gaps.push(`${cat} category not specifically assessed — may need targeted review`);
      }
    }

    if (heuristicResults.length === 0) {
      gaps.push('No heuristic violations found — manual usability testing recommended');
      gaps.push('Consider testing with assistive technologies for accessibility validation');
    }

    return gaps.slice(0, 5);
  }
}

// ─── Internal Types ─────────────────────────────────────────────────────────

interface UXHeuristicResult {
  id: string;
  category: string;
  name: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  suggestion: string;
}

// ─── Factory Function ───────────────────────────────────────────────────────

export function createProductAgent(
  communicationBus: AgentCommunicationBus,
  contextGraph: SharedContextGraph,
  providerManager: ProviderManager,
  memoryStore: MemoryStore,
): ProductAgent {
  return new ProductAgent(communicationBus, contextGraph, providerManager, memoryStore);
}
