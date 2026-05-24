// ============================================================
// VibeCode Desktop — ARC 22: Performance Agent
// Code profiling, memory analysis, runtime optimization,
// and performance anti-pattern detection
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

const PERFORMANCE_IDENTITY: Omit<AgentIdentity, 'id' | 'createdAt'> = {
  role: 'performance',
  name: 'Perf',
  description: 'Performance engineer focused on code optimization, memory profiling, and runtime efficiency',
  avatar: '⚡',
};

const PERFORMANCE_CAPABILITIES: Omit<AgentCapabilities, 'restrictedPaths'> = {
  primaryDomain: 'optimization',
  capabilities: [
    { domain: 'code_optimization', score: 0.95, description: 'Optimizing algorithms, data structures, and code paths for speed' },
    { domain: 'memory_profiling', score: 0.85, description: 'Identifying memory leaks, excessive allocations, and GC pressure' },
    { domain: 'runtime_efficiency', score: 0.9, description: 'Analyzing and improving runtime performance characteristics' },
    { domain: 'bottleneck_detection', score: 0.9, description: 'Identifying performance bottlenecks through profiling and analysis' },
    { domain: 'async_optimization', score: 0.8, description: 'Optimizing asynchronous patterns, concurrency, and parallelism' },
    { domain: 'bundle_optimization', score: 0.75, description: 'Reducing bundle size, tree-shaking, and lazy loading strategies' },
  ],
  allowedStepTypes: ['file_edit', 'analysis', 'command', 'diff_apply'],
  maxRiskLevel: 'medium',
  requiresApprovalAbove: 0.6,
};

// ─── Performance Anti-Pattern Catalog ───────────────────────────────────────

interface PerformanceAntiPattern {
  id: string;
  name: string;
  category: 'algorithmic' | 'memory' | 'async' | 'rendering' | 'network' | 'bundle';
  description: string;
  pattern: RegExp;
  impact: 'low' | 'medium' | 'high';
  recommendation: string;
}

const PERFORMANCE_ANTI_PATTERNS: PerformanceAntiPattern[] = [
  {
    id: 'PERF-001',
    name: 'O(n²) nested loop',
    category: 'algorithmic',
    description: 'Nested loops over the same collection suggest quadratic complexity',
    pattern: /for\s*\(.*\)\s*\{[\s\S]*?for\s*\(.*\)\s*\{/,
    impact: 'high',
    recommendation: 'Use a Map/Set for O(1) lookups instead of nested iteration',
  },
  {
    id: 'PERF-002',
    name: 'Synchronous file read',
    category: 'async',
    description: 'Synchronous file I/O blocks the event loop',
    pattern: /readFileSync|writeFileSync|existsSync|statSync|readdirSync/,
    impact: 'high',
    recommendation: 'Use async equivalents (readFile, writeFile, etc.) to avoid blocking',
  },
  {
    id: 'PERF-003',
    name: 'Unnecessary JSON parse/stringify',
    category: 'memory',
    description: 'Deep cloning via JSON round-trip is expensive and lossy',
    pattern: /JSON\.parse\s*\(\s*JSON\.stringify/,
    impact: 'medium',
    recommendation: 'Use structuredClone() or a targeted shallow/deep clone utility',
  },
  {
    id: 'PERF-004',
    name: 'Array.push in hot loop with spread',
    category: 'memory',
    description: 'Spreading arrays in a loop creates many intermediate arrays',
    pattern: /\.push\s*\(\s*\.\.\./,
    impact: 'medium',
    recommendation: 'Use Array.concat or push individual elements instead of spreading',
  },
  {
    id: 'PERF-005',
    name: 'Unnecessary re-render trigger',
    category: 'rendering',
    description: 'Creating new objects/arrays in render path causes unnecessary re-renders',
    pattern: /useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?set\w+\s*\(\s*\{[\s\S]*?\.\.\./,
    impact: 'medium',
    recommendation: 'Memoize objects/arrays with useMemo or use functional updates',
  },
  {
    id: 'PERF-006',
    name: 'Missing memoization',
    category: 'algorithmic',
    description: 'Expensive computation in render without memoization',
    pattern: /const\s+\w+\s*=\s*(?:compute|calculate|process|filter|map|sort|reduce)\w*\s*\([^)]*\)/,
    impact: 'medium',
    recommendation: 'Wrap expensive computations in useMemo with appropriate dependencies',
  },
  {
    id: 'PERF-007',
    name: 'Promise.all missing',
    category: 'async',
    description: 'Sequential awaits that could run in parallel',
    pattern: /await\s+\w+\([^)]*\)\s*;\s*await\s+\w+\([^)]*\)/,
    impact: 'high',
    recommendation: 'Use Promise.all() for independent async operations to run in parallel',
  },
  {
    id: 'PERF-008',
    name: 'Large dependency import',
    category: 'bundle',
    description: 'Importing entire library instead of specific modules',
    pattern: /import\s+\*\s+as\s+\w+\s+from\s+['"]lodash['"]|import\s+\w+\s+from\s+['"]lodash['"]/,
    impact: 'medium',
    recommendation: 'Import specific functions: import { debounce } from "lodash-es"',
  },
];

// ─── Performance Agent ───────────────────────────────────────────────────────

export class PerformanceAgent extends BaseAgent {
  /** Tracks known performance hotspots for ongoing monitoring */
  private performanceHotspots: Map<string, {
    description: string;
    impact: PerformanceAntiPattern['impact'];
    detectedAt: number;
    occurrences: number;
  }> = new Map();

  constructor(
    communicationBus: AgentCommunicationBus,
    contextGraph: SharedContextGraph,
    providerManager: ProviderManager,
    memoryStore: MemoryStore,
  ) {
    const identity: AgentIdentity = {
      ...PERFORMANCE_IDENTITY,
      id: `performance-${uuidv4()}`,
      createdAt: Date.now(),
    };

    const capabilities: AgentCapabilities = {
      ...PERFORMANCE_CAPABILITIES,
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
    return `You are an expert performance engineer agent in the VibeCode multi-agent system.

## Core Responsibilities
- **Code Optimization**: Identify and fix performance bottlenecks in algorithms and data structures
- **Memory Profiling**: Detect memory leaks, excessive allocations, and GC pressure points
- **Runtime Efficiency**: Analyze and improve overall runtime performance characteristics
- **Async Optimization**: Improve concurrency patterns, eliminate unnecessary blocking, optimize parallelism

## Analysis Framework
1. **Measure First**: Always establish a baseline before proposing optimizations
2. **Identify Bottlenecks**: Focus on the critical path — optimize what matters most
3. **Algorithmic Analysis**: Consider time/space complexity before micro-optimizing
4. **Profile, Don't Guess**: Use profiling data when available; avoid premature optimization
5. **Validate Impact**: Every optimization should include a way to measure the improvement

## Performance Categories
- **Algorithmic**: O(n²) loops, unnecessary recursion, poor data structure choice
- **Memory**: Leaks, excessive allocations, GC pressure, large object retention
- **Async**: Sequential awaits, blocking I/O, missing parallelization
- **Rendering**: Unnecessary re-renders, layout thrashing, missing memoization
- **Network**: Waterfall requests, missing caching, oversized payloads
- **Bundle**: Tree-shaking failures, large imports, missing code splitting

## Constraints
- You may propose file edits, run commands, apply diffs, and perform analysis
- Maximum risk level you can auto-execute: **medium**
- Changes above 60% confidence threshold require approval
- You MUST NOT modify lock files, secrets, or build artifacts
- Always measure before and after — "premature optimization is the root of all evil"
- When an optimization reduces readability significantly, flag the trade-off explicitly

## Output Format
When proposing optimizations:
1. State the current performance characteristic and its measurement
2. Identify the specific bottleneck with evidence
3. Propose the optimization with expected improvement
4. Document any trade-offs (readability vs speed, memory vs CPU, etc.)
5. Suggest how to validate the improvement (benchmarks, profiling, metrics)`;
  }

  // ─── Task Processing ───────────────────────────────────────────────────

  async processTask(task: AgentTask): Promise<AgentTask> {
    const startTime = Date.now();
    this.setStatus('executing');

    try {
      // Phase 1: Run static anti-pattern detection
      const antiPatternMatches = this.detectAntiPatterns(task);

      // Phase 2: Build and execute the analysis prompt
      const analysisPrompt = this.buildAnalysisPrompt(task, antiPatternMatches);
      const analysisResult = await this.reason(analysisPrompt);

      // Phase 3: If optimization task, generate specific fix proposals
      let optimizationPlan: string | null = null;
      if (task.type === 'optimization' && antiPatternMatches.length > 0) {
        const planPrompt = this.buildOptimizationPlanPrompt(task, analysisResult, antiPatternMatches);
        optimizationPlan = await this.reason(planPrompt);
      }

      // Phase 4: Combine findings and build result
      const combinedResult = optimizationPlan
        ? `${analysisResult}\n\n--- Optimization Plan ---\n${optimizationPlan}`
        : analysisResult;

      // Update performance hotspots tracking
      this.updateHotspots(antiPatternMatches);

      // Build proposed actions
      const proposedActions = this.buildProposedActions(task, combinedResult, antiPatternMatches);

      // Determine confidence
      const confidence = this.assessPerformanceConfidence(combinedResult, task, antiPatternMatches);

      // Share performance findings with other agents
      this.communicationBus.sendReflection(this.identity.role, {
        premises: [
          `Analysis type: ${task.type}`,
          `Files analyzed: ${task.relatedFiles.join(', ') || 'none'}`,
          `Anti-patterns detected: ${antiPatternMatches.length}`,
        ],
        conclusion: this.buildPerformanceSummary(task, combinedResult, antiPatternMatches),
        confidence,
        evidence: antiPatternMatches.map(m => `${m.name}: ${m.description}`),
        assumptions: this.extractAssumptionsFromAnalysis(combinedResult),
        gaps: this.identifyAnalysisGaps(antiPatternMatches),
      });

      const updatedTask: AgentTask = {
        ...task,
        status: 'completed',
        confidence,
        startedAt: task.startedAt ?? startTime,
        completedAt: Date.now(),
        result: {
          success: true,
          summary: this.buildPerformanceSummary(task, combinedResult, antiPatternMatches),
          details: combinedResult,
          affectedFiles: task.relatedFiles,
          proposedActions,
          metrics: {
            duration: Date.now() - startTime,
            tokensUsed: combinedResult.length,
            iterationsRequired: optimizationPlan ? 2 : 1,
            confidenceChange: confidence - task.confidence,
          },
        },
      };

      // Store the performance finding in memory
      this.addMemoryEntry({
        content: `Performance analysis for "${task.title}": ${this.buildPerformanceSummary(task, combinedResult, antiPatternMatches)}`,
        type: 'decision',
        importance: antiPatternMatches.some(m => m.impact === 'high') ? 0.85 : 0.6,
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
          summary: `Performance agent failed to process task: ${err instanceof Error ? err.message : String(err)}`,
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
      case 'performance_issue':
        // Performance issues are the primary input for this agent
        this.addMemoryEntry({
          content: `Performance issue: ${observation.content}`,
          type: 'observation',
          importance: observation.severity === 'critical' ? 0.9 : observation.severity === 'warning' ? 0.75 : 0.5,
          source: observation.agentId === this.identity.role ? 'self' : 'peer_agent',
          relatedEntries: [],
        });

        // Form a hypothesis about the performance bottleneck
        this.addHypothesis({
          id: uuidv4(),
          description: `Performance bottleneck: ${observation.content.slice(0, 200)}`,
          confidence: 0.5,
          evidence: [observation.source],
          testable: true,
          createdAt: Date.now(),
        });
        break;

      case 'file_change':
        // File changes might affect performance
        this.addMemoryEntry({
          content: `File change (may affect performance): ${observation.content}`,
          type: 'observation',
          importance: 0.35,
          source: 'workspace',
          relatedEntries: [],
        });
        break;

      case 'error_detected':
        // Some errors are performance-related (timeouts, OOM)
        if (/timeout|out of memory|heap|slow|performance/i.test(observation.content)) {
          this.addMemoryEntry({
            content: `Error with performance implications: ${observation.content}`,
            type: 'observation',
            importance: 0.8,
            source: 'workspace',
            relatedEntries: [],
          });
        }
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
      // Look for performance anti-patterns in recent workspace changes
      const recentEvents = this.contextGraph.getRecentEvents(25);

      // Focus on source changes that might affect performance
      const sourceChanges = recentEvents.filter(e =>
        e.semanticClassification === 'source_change' ||
        e.type === 'file_modified' ||
        e.type === 'file_created',
      );

      if (sourceChanges.length === 0) {
        return;
      }

      // Check existing hotspots for patterns that have recurred
      const recurringHotspots = Array.from(this.performanceHotspots.entries())
        .filter(([, hs]) => hs.occurrences >= 2 && Date.now() - hs.detectedAt < 3_600_000)
        .map(([id, hs]) => ({ id, ...hs }));

      if (recurringHotspots.length > 0) {
        const hotspotSummary = recurringHotspots
          .map(hs => `${hs.description} (${hs.impact} impact, seen ${hs.occurrences}x)`)
          .join('; ');

        const analysis = await this.reason(
          `During idle monitoring, I noticed recurring performance hotspots: ${hotspotSummary}. ` +
          `Briefly suggest whether these warrant a dedicated optimization task. Keep it concise.`,
        );

        this.communicationBus.sendObservation(
          this.identity.role,
          `Recurring performance hotspot(s) detected: ${analysis.slice(0, 300)}`,
          'info',
        );

        this.addMemoryEntry({
          content: `Idle scan found ${recurringHotspots.length} recurring hotspot(s)`,
          type: 'learning',
          importance: 0.5,
          source: 'self',
          relatedEntries: [],
        });
      }

      // Prune stale hotspots
      this.pruneStaleHotspots();
    } catch (err) {
      console.error(`[${this.identity.name}] Idle reasoning error:`, err);
    }
  }

  // ─── Task Relevance Scoring ────────────────────────────────────────────

  scoreTaskRelevance(task: AgentTask): number {
    // Direct role match
    if (task.assignedTo === 'performance') return 1.0;

    // Score based on task type alignment
    switch (task.type) {
      case 'optimization':
        return 0.95;
      case 'analysis':
        return 0.6;
      case 'repair':
        return 0.4;
      case 'refactor':
        return 0.35;
      case 'research':
        return 0.3;
      case 'security_scan':
        return 0.15;
      case 'ux_review':
        return 0.1;
      default:
        return 0.1;
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  private detectAntiPatterns(task: AgentTask): PerformanceAntiPatternMatch[] {
    const matches: PerformanceAntiPatternMatch[] = [];

    // Scan task description and related file context
    const contentToScan = [
      task.description,
      task.title,
    ].join('\n');

    for (const pattern of PERFORMANCE_ANTI_PATTERNS) {
      if (pattern.pattern.test(contentToScan)) {
        matches.push({
          id: pattern.id,
          name: pattern.name,
          category: pattern.category,
          description: pattern.description,
          impact: pattern.impact,
          recommendation: pattern.recommendation,
        });
      }
    }

    return matches;
  }

  private buildAnalysisPrompt(task: AgentTask, antiPatternMatches: PerformanceAntiPatternMatch[]): string {
    const antiPatternContext = antiPatternMatches.length > 0
      ? `\n\nDetected anti-patterns:\n${antiPatternMatches.map(m =>
          `[${m.impact.toUpperCase()} IMPACT] ${m.name}: ${m.description}\n  Recommendation: ${m.recommendation}`,
        ).join('\n')}`
      : '\n\nNo known anti-patterns detected in static scan.';

    const typePrompts: Record<AgentTask['type'], string> = {
      optimization: `Perform a thorough performance analysis and optimization proposal. ${antiPatternContext}\n\n` +
        `Analyze for:\n` +
        `1. Algorithmic complexity issues (O(n²), unnecessary recursion)\n` +
        `2. Memory inefficiencies (leaks, excessive allocations, GC pressure)\n` +
        `3. Async/concurrency issues (blocking I/O, sequential awaits)\n` +
        `4. Rendering performance (unnecessary re-renders, missing memoization)\n` +
        `5. Network/bundle inefficiencies`,
      analysis: `Analyze the performance characteristics of this code. ${antiPatternContext}`,
      repair: `Check if the bug is related to a performance issue (timeout, OOM, race condition). ${antiPatternContext}`,
      refactor: `Ensure the refactoring maintains or improves performance. ${antiPatternContext}`,
      research: `Research performance best practices relevant to this context. ${antiPatternContext}`,
      security_scan: `Check if security measures have significant performance overhead. ${antiPatternContext}`,
      ux_review: `Identify performance issues that affect user experience (slow renders, jank). ${antiPatternContext}`,
    };

    return `${typePrompts[task.type] ?? typePrompts.optimization}\n\n` +
      `Task: ${task.title}\nDescription: ${task.description}\n` +
      `Related files: ${task.relatedFiles.join(', ') || 'none specified'}`;
  }

  private buildOptimizationPlanPrompt(
    task: AgentTask,
    analysisResult: string,
    antiPatternMatches: PerformanceAntiPatternMatch[],
  ): string {
    return `Based on this performance analysis:\n${analysisResult.slice(0, 1000)}\n\n` +
      `And these detected anti-patterns:\n${antiPatternMatches.map(m => `- ${m.name}: ${m.recommendation}`).join('\n')}\n\n` +
      `Create a specific optimization plan for: ${task.title}\n` +
      `Related files: ${task.relatedFiles.join(', ')}\n\n` +
      `For each optimization:\n` +
      `1. Describe the change precisely\n` +
      `2. Estimate the expected performance improvement\n` +
      `3. Note any trade-offs (readability, maintainability, memory vs CPU)\n` +
      `4. Suggest how to benchmark before/after`;
  }

  private updateHotspots(antiPatternMatches: PerformanceAntiPatternMatch[]): void {
    for (const match of antiPatternMatches) {
      const existing = this.performanceHotspots.get(match.id);
      if (existing) {
        existing.occurrences++;
        existing.detectedAt = Date.now();
      } else {
        this.performanceHotspots.set(match.id, {
          description: `${match.name}: ${match.description}`,
          impact: match.impact,
          detectedAt: Date.now(),
          occurrences: 1,
        });
      }
    }
  }

  private pruneStaleHotspots(): void {
    const oneHourAgo = Date.now() - 3_600_000;
    for (const [id, hotspot] of this.performanceHotspots) {
      if (hotspot.detectedAt < oneHourAgo) {
        this.performanceHotspots.delete(id);
      }
    }
  }

  private buildProposedActions(
    task: AgentTask,
    result: string,
    antiPatternMatches: PerformanceAntiPatternMatch[],
  ): AgentAction[] {
    const actions: AgentAction[] = [];

    // Always propose the analysis action
    actions.push(this.proposeAction({
      type: 'analysis',
      description: `Performance analysis for: ${task.title}`,
      confidence: this.assessPerformanceConfidence(result, task, antiPatternMatches),
      riskLevel: 'low',
      requiresApproval: false,
      params: { result, antiPatternCount: antiPatternMatches.length, taskType: task.type },
      affectedFiles: task.relatedFiles,
      reasoning: result.slice(0, 500),
    }));

    // If optimization is needed and we have anti-pattern matches, propose a fix
    if (task.type === 'optimization' && antiPatternMatches.length > 0) {
      const highImpactCount = antiPatternMatches.filter(m => m.impact === 'high').length;
      const riskLevel: 'low' | 'medium' = highImpactCount > 2 ? 'medium' : 'low';

      actions.push(this.proposeAction({
        type: 'diff_apply',
        description: `Apply performance optimizations for: ${task.title}`,
        confidence: Math.max(0.4, this.assessPerformanceConfidence(result, task, antiPatternMatches) - 0.1),
        riskLevel,
        requiresApproval: riskLevel === 'medium',
        params: {
          optimizationCount: antiPatternMatches.length,
          highImpactCount,
          taskType: task.type,
        },
        affectedFiles: task.relatedFiles,
        reasoning: `Optimization plan based on ${antiPatternMatches.length} anti-pattern(s) detected`,
      }));
    }

    // If we need to run profiling commands, propose that
    if (task.type === 'optimization') {
      actions.push(this.proposeAction({
        type: 'command',
        description: `Run performance profiling for: ${task.title}`,
        confidence: 0.8,
        riskLevel: 'low',
        requiresApproval: false,
        params: { command: 'profile', taskType: task.type },
        affectedFiles: task.relatedFiles,
        reasoning: 'Establish performance baseline before and after optimization',
      }));
    }

    return actions;
  }

  private assessPerformanceConfidence(
    result: string,
    task: AgentTask,
    antiPatternMatches: PerformanceAntiPatternMatch[],
  ): number {
    let confidence = 0.5;

    // Anti-pattern detection increases confidence
    if (antiPatternMatches.length > 0) confidence += 0.15;

    // High-impact findings increase confidence
    if (antiPatternMatches.some(m => m.impact === 'high')) confidence += 0.1;

    // Task type alignment
    if (task.type === 'optimization') confidence += 0.1;

    // Measurement recommendations increase confidence
    if (/benchmark|measure|profile|baseline|before.*after/i.test(result)) confidence += 0.1;

    // Trade-off awareness increases confidence
    if (/trade.?off|readability|maintainability|premature/i.test(result)) confidence += 0.05;

    return Math.min(1, Math.max(0, confidence));
  }

  private buildPerformanceSummary(
    task: AgentTask,
    result: string,
    antiPatternMatches: PerformanceAntiPatternMatch[],
  ): string {
    const parts: string[] = [`[Performance] ${task.title}: `];

    if (antiPatternMatches.length > 0) {
      const byImpact = {
        high: antiPatternMatches.filter(m => m.impact === 'high').length,
        medium: antiPatternMatches.filter(m => m.impact === 'medium').length,
        low: antiPatternMatches.filter(m => m.impact === 'low').length,
      };
      if (byImpact.high > 0) parts.push(`${byImpact.high} high-impact,`);
      if (byImpact.medium > 0) parts.push(`${byImpact.medium} medium-impact,`);
      if (byImpact.low > 0) parts.push(`${byImpact.low} low-impact`);
      parts.push('anti-pattern(s) detected.');
    } else {
      const sentences = result.split(/\.\s+/).filter(s => s.trim().length > 10);
      const summary = sentences.slice(0, 2).join('. ');
      parts.push(summary.length > 0 ? summary : 'Analysis completed.');
    }

    return parts.join(' ');
  }

  private extractAssumptionsFromAnalysis(result: string): string[] {
    const assumptions: string[] = [];
    const patterns = [
      /assuming\s+(.+?)(?:\.|,|$)/gi,
      /presumably\s+(.+?)(?:\.|,|$)/gi,
      /estimated\s+(.+?)(?:\.|,|$)/gi,
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(result)) !== null) {
        assumptions.push(match[1]?.trim() ?? match[0].trim());
      }
    }
    return assumptions.slice(0, 5);
  }

  private identifyAnalysisGaps(antiPatternMatches: PerformanceAntiPatternMatch[]): string[] {
    const gaps: string[] = [];

    if (antiPatternMatches.length === 0) {
      gaps.push('No static anti-patterns detected — runtime profiling may reveal issues not visible in code');
    }

    // Check for categories not covered
    const detectedCategories = new Set(antiPatternMatches.map(m => m.category));
    const allCategories: PerformanceAntiPattern['category'][] = ['algorithmic', 'memory', 'async', 'rendering', 'network', 'bundle'];

    for (const cat of allCategories) {
      if (!detectedCategories.has(cat)) {
        gaps.push(`${cat} performance category not assessed — may need targeted analysis`);
      }
    }

    return gaps.slice(0, 5);
  }
}

// ─── Internal Types ─────────────────────────────────────────────────────────

interface PerformanceAntiPatternMatch {
  id: string;
  name: string;
  category: 'algorithmic' | 'memory' | 'async' | 'rendering' | 'network' | 'bundle';
  description: string;
  impact: 'low' | 'medium' | 'high';
  recommendation: string;
}

// ─── Factory Function ───────────────────────────────────────────────────────

export function createPerformanceAgent(
  communicationBus: AgentCommunicationBus,
  contextGraph: SharedContextGraph,
  providerManager: ProviderManager,
  memoryStore: MemoryStore,
): PerformanceAgent {
  return new PerformanceAgent(communicationBus, contextGraph, providerManager, memoryStore);
}
