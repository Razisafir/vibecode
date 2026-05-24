// ============================================================
// VibeCode Desktop — ARC 22: Research Agent
// Documentation analysis, dependency investigation,
// knowledge gathering, and context enrichment
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

const RESEARCH_IDENTITY: Omit<AgentIdentity, 'id' | 'createdAt'> = {
  role: 'research',
  name: 'Researcher',
  description: 'Research specialist focused on documentation, dependency analysis, and knowledge gathering',
  avatar: '📚',
};

const RESEARCH_CAPABILITIES: Omit<AgentCapabilities, 'restrictedPaths'> = {
  primaryDomain: 'knowledge_gathering',
  capabilities: [
    { domain: 'documentation_analysis', score: 0.95, description: 'Analyzing and synthesizing documentation and technical literature' },
    { domain: 'dependency_analysis', score: 0.9, description: 'Investigating dependency trees, versions, and compatibility' },
    { domain: 'knowledge_synthesis', score: 0.9, description: 'Combining information from multiple sources into actionable insights' },
    { domain: 'api_research', score: 0.85, description: 'Researching APIs, SDKs, and integration patterns' },
    { domain: 'best_practices', score: 0.8, description: 'Identifying and documenting best practices for technologies' },
    { domain: 'context_enrichment', score: 0.85, description: 'Enriching task context with relevant background information' },
  ],
  allowedStepTypes: ['file_read', 'analysis', 'review'],
  maxRiskLevel: 'low',
  requiresApprovalAbove: 0.3,
};

// ─── Research Agent ─────────────────────────────────────────────────────────

export class ResearchAgent extends BaseAgent {
  /** Cache of recently researched topics to avoid redundant queries */
  private researchCache: Map<string, { result: string; timestamp: number }> = new Map();

  constructor(
    communicationBus: AgentCommunicationBus,
    contextGraph: SharedContextGraph,
    providerManager: ProviderManager,
    memoryStore: MemoryStore,
  ) {
    const identity: AgentIdentity = {
      ...RESEARCH_IDENTITY,
      id: `research-${uuidv4()}`,
      createdAt: Date.now(),
    };

    const capabilities: AgentCapabilities = {
      ...RESEARCH_CAPABILITIES,
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
    return `You are an expert research agent in the VibeCode multi-agent system.

## Core Responsibilities
- **Documentation Analysis**: Read, interpret, and synthesize technical documentation and code comments
- **Dependency Investigation**: Analyze dependency trees, version compatibility, and update impacts
- **Knowledge Gathering**: Collect and organize information from workspace files and known best practices
- **Context Enrichment**: Provide other agents with the background information they need to work effectively

## Research Methodology
1. **Scope**: Understand what information is needed and define the research boundaries
2. **Gather**: Collect relevant documentation, code context, and dependency information
3. **Synthesize**: Combine findings into clear, actionable insights
4. **Validate**: Cross-reference information from multiple sources when possible
5. **Present**: Deliver findings in a structured, easy-to-consume format

## Decision Framework
- Prioritize accuracy over speed — wrong information is worse than no information
- Always cite or reference the source of your findings
- When documentation is ambiguous, note the ambiguity and provide multiple interpretations
- For dependency analysis, consider version compatibility, security advisories, and migration paths
- Distinguish between facts (from docs/code) and inferences (from reasoning)

## Constraints
- You may ONLY read files, perform analysis, and review — no code modifications
- Maximum risk level you can auto-execute: **low** (read-only operations)
- Changes above 30% confidence threshold require approval (though you rarely propose changes)
- You MUST NOT modify any files — you are a read-only knowledge agent
- When you discover issues that require code changes, delegate to the appropriate agent

## Output Format
When presenting research findings:
1. State the research question or topic
2. Summarize key findings with source references
3. Provide detailed analysis with evidence
4. List actionable recommendations (for other agents to execute)
5. Note any gaps in the research or areas needing further investigation`;
  }

  // ─── Task Processing ───────────────────────────────────────────────────

  async processTask(task: AgentTask): Promise<AgentTask> {
    const startTime = Date.now();
    this.setStatus('executing');

    try {
      // Check the research cache for related prior research
      const cachedResult = this.checkResearchCache(task);
      let researchResult: string;

      if (cachedResult) {
        researchResult = `[Cached finding] ${cachedResult}`;
      } else {
        // Build the research prompt based on task type
        const researchPrompt = this.buildResearchPrompt(task);
        researchResult = await this.reason(researchPrompt);

        // Cache the result for future reference
        this.cacheResearchResult(task, researchResult);
      }

      // Build proposed actions (research agent proposes delegations, not code changes)
      const proposedActions = this.buildProposedActions(task, researchResult);

      // Determine confidence in research findings
      const confidence = this.assessResearchConfidence(researchResult, task);

      // Share research findings with other agents
      this.communicationBus.sendReflection(this.identity.role, {
        premises: [`Research topic: ${task.type}`, `Files examined: ${task.relatedFiles.join(', ') || 'none'}`],
        conclusion: this.buildResearchSummary(task, researchResult),
        confidence,
        evidence: this.extractEvidenceFromResearch(researchResult),
        assumptions: this.extractAssumptionsFromResearch(researchResult),
        gaps: this.identifyResearchGaps(researchResult),
      });

      const updatedTask: AgentTask = {
        ...task,
        status: 'completed',
        confidence,
        startedAt: task.startedAt ?? startTime,
        completedAt: Date.now(),
        result: {
          success: true,
          summary: this.buildResearchSummary(task, researchResult),
          details: researchResult,
          affectedFiles: task.relatedFiles,
          proposedActions,
          metrics: {
            duration: Date.now() - startTime,
            tokensUsed: researchResult.length,
            iterationsRequired: 1,
            confidenceChange: confidence - task.confidence,
          },
        },
      };

      // Store the research finding in long-term memory
      this.addMemoryEntry({
        content: `Research finding for "${task.title}": ${this.buildResearchSummary(task, researchResult)}`,
        type: 'learning',
        importance: task.type === 'research' ? 0.85 : 0.65,
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
          summary: `Research agent failed to process task: ${err instanceof Error ? err.message : String(err)}`,
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
      case 'dependency_update':
        // Research agent is especially interested in dependency changes
        this.addMemoryEntry({
          content: `Dependency update: ${observation.content}`,
          type: 'observation',
          importance: 0.8,
          source: 'workspace',
          relatedEntries: [],
        });
        // Invalidate cache entries related to this dependency
        this.invalidateCacheForTopic(observation.content);
        break;

      case 'file_change':
        // File changes may affect documentation accuracy
        this.addMemoryEntry({
          content: `File change (may affect docs): ${observation.content}`,
          type: 'observation',
          importance: 0.4,
          source: 'workspace',
          relatedEntries: [],
        });
        break;

      case 'pattern_found':
        // Patterns discovered by other agents may need research
        this.addMemoryEntry({
          content: `Pattern found (research may be needed): ${observation.content}`,
          type: 'observation',
          importance: 0.6,
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
      // Check for outdated dependencies and missing documentation
      const recentEvents = this.contextGraph.getRecentEvents(20);

      // Look for dependency changes that might need research
      const depChanges = recentEvents.filter(e =>
        e.semanticClassification === 'dependency_change' ||
        e.type === 'dependency_change',
      );

      // Look for new files that might lack documentation
      const newFiles = recentEvents.filter(e =>
        e.type === 'file_created' &&
        e.path &&
        !e.path.includes('node_modules') &&
        !e.path.includes('.git'),
      );

      if (depChanges.length > 0) {
        // Research the dependency changes
        const depSummary = depChanges
          .map(e => e.path ?? 'unknown dependency')
          .join(', ');

        const analysis = await this.reason(
          `During idle monitoring, I detected dependency changes: ${depSummary}. ` +
          `Briefly assess whether these changes require deeper investigation for compatibility or security concerns. Keep it concise.`,
        );

        this.communicationBus.sendObservation(
          this.identity.role,
          `Dependency change analysis: ${analysis.slice(0, 300)}`,
          'info',
        );

        this.addMemoryEntry({
          content: `Idle scan analyzed ${depChanges.length} dependency change(s)`,
          type: 'learning',
          importance: 0.5,
          source: 'self',
          relatedEntries: [],
        });
      }

      if (newFiles.length > 0) {
        // Check for missing documentation in new files
        const fileSummary = newFiles
          .map(e => e.path ?? 'unknown file')
          .join(', ');

        const docAnalysis = await this.reason(
          `During idle monitoring, I noticed new files: ${fileSummary}. ` +
          `Briefly assess whether these files appear to have adequate documentation. Keep it concise.`,
        );

        this.communicationBus.sendObservation(
          this.identity.role,
          `Documentation coverage check: ${docAnalysis.slice(0, 300)}`,
          'info',
        );
      }
    } catch (err) {
      console.error(`[${this.identity.name}] Idle reasoning error:`, err);
    }
  }

  // ─── Task Relevance Scoring ────────────────────────────────────────────

  scoreTaskRelevance(task: AgentTask): number {
    // Direct role match
    if (task.assignedTo === 'research') return 1.0;

    // Score based on task type alignment
    switch (task.type) {
      case 'research':
        return 0.95;
      case 'analysis':
        return 0.6;
      case 'security_scan':
        return 0.4;
      case 'refactor':
        return 0.35;
      case 'repair':
        return 0.3;
      case 'optimization':
        return 0.25;
      case 'ux_review':
        return 0.2;
      default:
        return 0.1;
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  private buildResearchPrompt(task: AgentTask): string {
    const typePrompts: Record<AgentTask['type'], string> = {
      research: `Conduct a thorough research investigation. ` +
        `Gather relevant information, analyze documentation, and synthesize findings.\n\n` +
        `Related files: ${task.relatedFiles.join(', ') || 'none specified'}`,
      analysis: `Provide a research-backed analysis. ` +
        `Focus on what the documentation and available context tell us about this topic.\n\n` +
        `Related files: ${task.relatedFiles.join(', ') || 'none specified'}`,
      security_scan: `Research known security vulnerabilities and best practices related to this topic. ` +
        `Focus on CVEs, security advisories, and recommended mitigations.\n\n` +
        `Related files: ${task.relatedFiles.join(', ') || 'none specified'}`,
      refactor: `Research best practices and patterns relevant to this refactoring task. ` +
        `What do established references say about the right approach?\n\n` +
        `Related files: ${task.relatedFiles.join(', ') || 'none specified'}`,
      repair: `Research the error or issue described. ` +
        `Look for known fixes, similar issues reported in documentation or community resources.\n\n` +
        `Related files: ${task.relatedFiles.join(', ') || 'none specified'}`,
      optimization: `Research optimization strategies and performance best practices for this context. ` +
        `What do benchmarks and documentation recommend?\n\n` +
        `Related files: ${task.relatedFiles.join(', ') || 'none specified'}`,
      ux_review: `Research UX best practices and design patterns relevant to this feature. ` +
        `What do established guidelines recommend?\n\n` +
        `Related files: ${task.relatedFiles.join(', ') || 'none specified'}`,
    };

    return `${typePrompts[task.type] ?? typePrompts.research}\n\nTask: ${task.title}\nDescription: ${task.description}`;
  }

  private buildProposedActions(task: AgentTask, researchResult: string): AgentAction[] {
    const actions: AgentAction[] = [];

    // Research agent proposes analysis and review actions, plus delegations
    actions.push(this.proposeAction({
      type: 'analysis',
      description: `Research findings for: ${task.title}`,
      confidence: this.assessResearchConfidence(researchResult, task),
      riskLevel: 'low',
      requiresApproval: false,
      params: { findings: researchResult, taskType: task.type },
      affectedFiles: task.relatedFiles,
      reasoning: researchResult.slice(0, 500),
    }));

    // If the research reveals issues that need code changes, propose delegation
    if (/vulnerability|bug|deprecated|outdated|missing|incomplete/i.test(researchResult)) {
      const delegateTarget = this.determineDelegationTarget(researchResult, task);
      actions.push(this.proposeAction({
        type: 'delegate',
        description: `Delegate follow-up action for: ${task.title}`,
        confidence: 0.7,
        riskLevel: 'low',
        requiresApproval: false,
        params: {
          delegateTo: delegateTarget,
          reason: `Research findings indicate ${delegateTarget} expertise is needed`,
        },
        affectedFiles: task.relatedFiles,
        reasoning: `Research identified issues best handled by ${delegateTarget}`,
      }));
    }

    return actions;
  }

  private determineDelegationTarget(researchResult: string, task: AgentTask): string {
    if (/security|vulnerability|CVE/i.test(researchResult)) return 'security';
    if (/bug|error|crash|failure/i.test(researchResult)) return 'debug';
    if (/performance|slow|memory|bottleneck/i.test(researchResult)) return 'performance';
    if (/structure|architecture|refactor|coupling/i.test(researchResult)) return 'architect';
    if (/UX|accessibility|usability/i.test(researchResult)) return 'product';
    return 'architect'; // default delegation
  }

  private assessResearchConfidence(researchResult: string, task: AgentTask): number {
    let confidence = 0.5;

    // Source citations increase confidence
    if (/according to|documentation states|per the docs|as described in/i.test(researchResult)) confidence += 0.15;

    // Multiple sources increase confidence
    if (/also|additionally|furthermore|moreover/i.test(researchResult)) confidence += 0.1;

    // Task type alignment
    if (task.type === 'research') confidence += 0.1;

    // Structured findings
    if (/finding\s*\d|point\s*\d|1\.|2\.|3\./i.test(researchResult)) confidence += 0.1;

    // Acknowledged uncertainty decreases confidence slightly but shows rigor
    if (/uncertain|unclear|needs further|insufficient/i.test(researchResult)) confidence -= 0.05;

    return Math.min(1, Math.max(0, confidence));
  }

  private checkResearchCache(task: AgentTask): string | null {
    const cacheKey = `${task.type}:${task.title.toLowerCase().slice(0, 50)}`;
    const cached = this.researchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 1_800_000) {
      // Cache is valid for 30 minutes
      return cached.result;
    }
    return null;
  }

  private cacheResearchResult(task: AgentTask, result: string): void {
    const cacheKey = `${task.type}:${task.title.toLowerCase().slice(0, 50)}`;
    this.researchCache.set(cacheKey, { result, timestamp: Date.now() });

    // Prune old cache entries
    const thirtyMinAgo = Date.now() - 1_800_000;
    for (const [key, value] of this.researchCache) {
      if (value.timestamp < thirtyMinAgo) {
        this.researchCache.delete(key);
      }
    }
  }

  private invalidateCacheForTopic(topic: string): void {
    const topicLower = topic.toLowerCase();
    for (const [key] of this.researchCache) {
      if (key.toLowerCase().includes(topicLower)) {
        this.researchCache.delete(key);
      }
    }
  }

  private buildResearchSummary(task: AgentTask, result: string): string {
    const sentences = result.split(/\.\s+/).filter(s => s.trim().length > 10);
    const summary = sentences.slice(0, 2).join('. ');
    return `[Research] ${task.title}: ${summary.length > 0 ? summary : 'Research completed'}.`;
  }

  private extractEvidenceFromResearch(result: string): string[] {
    const evidence: string[] = [];
    const patterns = [
      /according to[^.]+\./gi,
      /documentation states[^.]+\./gi,
      /as described in[^.]+\./gi,
      /the docs (?:say|indicate|recommend)[^.]+\./gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(result)) !== null) {
        evidence.push(match[0].trim());
      }
    }

    return evidence.slice(0, 5);
  }

  private extractAssumptionsFromResearch(result: string): string[] {
    const assumptions: string[] = [];
    const patterns = [
      /assuming\s+(.+?)(?:\.|,|$)/gi,
      /presumably\s+(.+?)(?:\.|,|$)/gi,
      /based on\s+(.+?)(?:\.|,|$)/gi,
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(result)) !== null) {
        assumptions.push(match[1]?.trim() ?? match[0].trim());
      }
    }
    return assumptions.slice(0, 5);
  }

  private identifyResearchGaps(result: string): string[] {
    const gaps: string[] = [];
    const gapPatterns = [
      /unclear\s+(.+?)(?:\.|,|$)/gi,
      /needs?\s+further\s+(.+?)(?:\.|,|$)/gi,
      /insufficient\s+(.+?)(?:\.|,|$)/gi,
      /could not (?:find|determine|verify)\s+(.+?)(?:\.|,|$)/gi,
    ];

    for (const pattern of gapPatterns) {
      let match;
      while ((match = pattern.exec(result)) !== null) {
        gaps.push(match[1]?.trim() ?? match[0].trim());
      }
    }

    return gaps.slice(0, 5);
  }
}

// ─── Factory Function ───────────────────────────────────────────────────────

export function createResearchAgent(
  communicationBus: AgentCommunicationBus,
  contextGraph: SharedContextGraph,
  providerManager: ProviderManager,
  memoryStore: MemoryStore,
): ResearchAgent {
  return new ResearchAgent(communicationBus, contextGraph, providerManager, memoryStore);
}
