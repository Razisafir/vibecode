// ============================================================
// VibeCode Desktop — ARC 22: Security Agent
// Vulnerability detection, code safety analysis,
// security best practices, and veto power on risky proposals
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
  AgentIdentity,
  AgentCapabilities,
  AgentTask,
  AgentTaskResult,
  AgentObservation,
  AgentAction,
  AgentHypothesis,
} from '../types';
import { BaseAgent } from './base-agent';
import { AgentCommunicationBus } from '../agent-communication-bus';
import { SharedContextGraph } from '../shared-context-graph';
import { ProviderManager } from '../../services/provider-manager';
import { MemoryStore } from '../../services/memory-store';

// ─── Agent Identity & Capabilities ──────────────────────────────────────────

const SECURITY_IDENTITY: Omit<AgentIdentity, 'id' | 'createdAt'> = {
  role: 'security',
  name: 'Security',
  description: 'Security specialist focused on vulnerability detection, code safety analysis, and security best practices',
  avatar: '🛡️',
};

const SECURITY_CAPABILITIES: Omit<AgentCapabilities, 'restrictedPaths'> = {
  primaryDomain: 'security_analysis',
  capabilities: [
    { domain: 'vulnerability_detection', score: 0.95, description: 'Detecting OWASP Top 10 vulnerabilities and common attack vectors' },
    { domain: 'code_safety_analysis', score: 0.9, description: 'Analyzing code for unsafe patterns, injection risks, and permission issues' },
    { domain: 'dependency_security', score: 0.85, description: 'Evaluating dependency security, known CVEs, and supply chain risks' },
    { domain: 'permission_auditing', score: 0.85, description: 'Auditing file permissions, API access controls, and privilege boundaries' },
    { domain: 'security_best_practices', score: 0.9, description: 'Enforcing security best practices and coding standards' },
    { domain: 'threat_modeling', score: 0.75, description: 'Basic threat modeling and attack surface analysis' },
  ],
  allowedStepTypes: ['analysis', 'review', 'file_read'],
  maxRiskLevel: 'low',
  requiresApprovalAbove: 0.4,
};

// ─── Security Rule Catalog ──────────────────────────────────────────────────

interface SecurityRule {
  id: string;
  category: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  pattern: RegExp;
  recommendation: string;
}

const SECURITY_RULES: SecurityRule[] = [
  {
    id: 'SEC-001',
    category: 'injection',
    description: 'Potential SQL injection via string concatenation',
    severity: 'critical',
    pattern: /(?:query|execute|raw)\s*\(\s*[`'"].*\+\s*\w+/,
    recommendation: 'Use parameterized queries instead of string concatenation',
  },
  {
    id: 'SEC-002',
    category: 'injection',
    description: 'Potential command injection via unsanitized input',
    severity: 'critical',
    pattern: /(?:exec|execSync|spawn)\s*\(\s*[`'"].*\$\{/,
    recommendation: 'Sanitize all inputs and use argument arrays instead of shell strings',
  },
  {
    id: 'SEC-003',
    category: 'secrets',
    description: 'Hardcoded secret or API key',
    severity: 'high',
    pattern: /(?:api_?key|secret|password|token|auth)\s*[:=]\s*['"][^'"]{8,}['"]/i,
    recommendation: 'Move secrets to environment variables or a secrets manager',
  },
  {
    id: 'SEC-004',
    category: 'xss',
    description: 'Potential XSS via innerHTML or dangerouslySetInnerHTML',
    severity: 'high',
    pattern: /(?:innerHTML|dangerouslySetInnerHTML)\s*=\s*/,
    recommendation: 'Use textContent or React JSX rendering instead of innerHTML',
  },
  {
    id: 'SEC-005',
    category: 'crypto',
    description: 'Weak cryptographic algorithm',
    severity: 'medium',
    pattern: /(?:createHash|createCipher|createDecipher)\s*\(\s*['"](?:md5|sha1|des|rc4)['"]/,
    recommendation: 'Use strong algorithms: sha256/sha512 for hashing, aes-256 for encryption',
  },
  {
    id: 'SEC-006',
    category: 'permissions',
    description: 'Overly permissive file access',
    severity: 'medium',
    pattern: /chmod\s*\(\s*\S+\s*,\s*0?777/,
    recommendation: 'Use minimal necessary permissions (e.g., 0o644 for files, 0o755 for directories)',
  },
  {
    id: 'SEC-007',
    category: 'proto_pollution',
    description: 'Potential prototype pollution',
    severity: 'high',
    pattern: /(?:merge|extend|assign|defaults)\s*\(\s*(?:null|undefined)?\s*,?\s*\w+\s*,/,
    recommendation: 'Use Object.create(null) or deep clone before merging untrusted data',
  },
  {
    id: 'SEC-008',
    category: 'path_traversal',
    description: 'Potential path traversal via unsanitized user input',
    severity: 'high',
    pattern: /(?:readFile|writeFile|createReadStream)\s*\(\s*(?:path\.)?join\s*\(\s*[^)]*\+|req\.(?:params|query|body)/,
    recommendation: 'Sanitize paths and validate against allowed directories',
  },
];

// ─── Security Agent ─────────────────────────────────────────────────────────

export class SecurityAgent extends BaseAgent {
  /** Tracks active security concerns for veto decisions */
  private activeSecurityConcerns: Map<string, {
    severity: SecurityRule['severity'];
    description: string;
    detectedAt: number;
  }> = new Map();

  constructor(
    communicationBus: AgentCommunicationBus,
    contextGraph: SharedContextGraph,
    providerManager: ProviderManager,
    memoryStore: MemoryStore,
  ) {
    const identity: AgentIdentity = {
      ...SECURITY_IDENTITY,
      id: `security-${uuidv4()}`,
      createdAt: Date.now(),
    };

    const capabilities: AgentCapabilities = {
      ...SECURITY_CAPABILITIES,
      restrictedPaths: [
        '**/.env*',
        '**/secrets/**',
        '**/credentials/**',
        '**/.git/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
      ],
    };

    super(identity, capabilities, communicationBus, contextGraph, providerManager, memoryStore);
  }

  // ─── System Prompt ─────────────────────────────────────────────────────

  getSystemPrompt(): string {
    return `You are an expert security agent in the VibeCode multi-agent system.

## Core Responsibilities
- **Vulnerability Detection**: Scan code for OWASP Top 10 vulnerabilities and common attack vectors
- **Code Safety Analysis**: Identify unsafe patterns, injection risks, and permission issues
- **Security Review**: Review code changes for security implications before they are applied
- **Veto Power**: Block or flag high-risk proposals that could introduce security vulnerabilities

## Security Analysis Framework
1. **Input Validation**: Check all user inputs are validated and sanitized
2. **Authentication & Authorization**: Verify proper access controls are in place
3. **Data Protection**: Ensure sensitive data is encrypted and properly handled
4. **Dependency Security**: Flag known vulnerable dependencies
5. **Configuration Security**: Check for insecure default configurations
6. **Error Handling**: Verify errors don't leak sensitive information

## Severity Classification
- **Critical**: Remote code execution, data exfiltration, authentication bypass
- **High**: SQL injection, XSS, CSRF, path traversal, privilege escalation
- **Medium**: Information disclosure, weak crypto, missing rate limiting
- **Low**: Missing security headers, verbose error messages, TODO security items

## Veto Authority
You have **veto power** over any proposal that:
- Introduces a critical or high severity vulnerability
- Reduces security controls without adequate replacement
- Exposes sensitive data without proper protection
- Uses deprecated or known-vulnerable dependencies

## Constraints
- You may ONLY read files, perform analysis, and review — no code modifications
- Maximum risk level you can auto-execute: **low** (read-only operations)
- Changes above 40% confidence threshold require approval
- You MUST NOT modify any files — you are a security review agent
- When you veto a proposal, you MUST provide clear justification and alternatives

## Output Format
When reporting security findings:
1. Classify the finding by severity (Critical/High/Medium/Low)
2. Describe the vulnerability and its potential impact
3. Identify the specific code location
4. Recommend a fix or mitigation
5. Assess the risk of exploitation in the current context`;
  }

  // ─── Task Processing ───────────────────────────────────────────────────

  async processTask(task: AgentTask): Promise<AgentTask> {
    const startTime = Date.now();
    this.setStatus('executing');

    try {
      // Phase 1: Run static security rules against related files
      const staticFindings = this.runStaticSecurityRules(task);

      // Phase 2: Perform LLM-powered deep security analysis
      const securityPrompt = this.buildSecurityPrompt(task, staticFindings);
      const analysisResult = await this.reason(securityPrompt);

      // Phase 3: Combine static and dynamic findings
      const combinedFindings = this.combineFindings(staticFindings, analysisResult);

      // Phase 4: Determine if any veto actions are needed
      const vetoActions = this.assessVetoNeeds(combinedFindings, task);
      if (vetoActions.length > 0) {
        this.executeVetoActions(vetoActions);
      }

      // Build proposed actions
      const proposedActions = this.buildProposedActions(task, combinedFindings);

      // Determine confidence
      const confidence = this.assessSecurityConfidence(combinedFindings, task);

      // Update active security concerns
      this.updateSecurityConcerns(combinedFindings);

      // Share security findings with other agents
      this.communicationBus.sendReflection(this.identity.role, {
        premises: [`Scan type: ${task.type}`, `Files scanned: ${task.relatedFiles.join(', ') || 'none'}`],
        conclusion: this.buildSecuritySummary(task, combinedFindings),
        confidence,
        evidence: this.extractEvidenceFromFindings(combinedFindings),
        assumptions: [],
        gaps: this.identifyScanGaps(combinedFindings),
      });

      const updatedTask: AgentTask = {
        ...task,
        status: 'completed',
        confidence,
        startedAt: task.startedAt ?? startTime,
        completedAt: Date.now(),
        result: {
          success: true,
          summary: this.buildSecuritySummary(task, combinedFindings),
          details: analysisResult,
          affectedFiles: task.relatedFiles,
          proposedActions,
          metrics: {
            duration: Date.now() - startTime,
            tokensUsed: analysisResult.length,
            iterationsRequired: 1,
            confidenceChange: confidence - task.confidence,
          },
        },
      };

      // Store the security finding in memory
      this.addMemoryEntry({
        content: `Security scan for "${task.title}": ${this.buildSecuritySummary(task, combinedFindings)}`,
        type: 'decision',
        importance: combinedFindings.critical > 0 ? 0.95 : combinedFindings.high > 0 ? 0.85 : 0.6,
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
          summary: `Security agent failed to process task: ${err instanceof Error ? err.message : String(err)}`,
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
      case 'security_concern':
        // Security concerns are the primary input for this agent
        this.addMemoryEntry({
          content: `Security concern: ${observation.content}`,
          type: 'observation',
          importance: observation.severity === 'critical' ? 0.95 : observation.severity === 'warning' ? 0.8 : 0.6,
          source: observation.agentId === this.identity.role ? 'self' : 'peer_agent',
          relatedEntries: [],
        });

        // Add a hypothesis about the concern
        this.addHypothesis({
          id: uuidv4(),
          description: `Security concern: ${observation.content.slice(0, 200)}`,
          confidence: 0.6,
          evidence: [observation.source],
          testable: true,
          createdAt: Date.now(),
        });
        break;

      case 'dependency_update':
        // Dependency changes may introduce vulnerabilities
        this.addMemoryEntry({
          content: `Dependency update (security review needed): ${observation.content}`,
          type: 'observation',
          importance: 0.7,
          source: 'workspace',
          relatedEntries: [],
        });

        // Flag for potential security review
        if (observation.severity !== 'info') {
          this.communicationBus.sendObservation(
            this.identity.role,
            `Dependency change may require security review: ${observation.content}`,
            'warning',
          );
        }
        break;

      case 'file_change':
        // File changes may affect security posture
        this.addMemoryEntry({
          content: `File change (security review may be needed): ${observation.content}`,
          type: 'observation',
          importance: 0.4,
          source: 'workspace',
          relatedEntries: [],
        });
        break;

      case 'error_detected':
        // Errors might indicate security issues
        this.addMemoryEntry({
          content: `Error detected (may have security implications): ${observation.content}`,
          type: 'observation',
          importance: 0.5,
          source: 'workspace',
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
      // Scan for new security concerns in the workspace
      const recentEvents = this.contextGraph.getRecentEvents(30);

      // Look for events that might introduce security issues
      const securityRelevantEvents = recentEvents.filter(e =>
        e.semanticClassification === 'source_change' ||
        e.semanticClassification === 'dependency_change' ||
        e.semanticClassification === 'config_change' ||
        e.type === 'dependency_change',
      );

      if (securityRelevantEvents.length === 0) {
        return;
      }

      // Check for changes in security-sensitive paths
      const sensitiveChanges = securityRelevantEvents.filter(e =>
        e.path && (
          e.path.includes('auth') ||
          e.path.includes('security') ||
          e.path.includes('middleware') ||
          e.path.includes('config') ||
          e.path.includes('permission') ||
          e.path.includes('.env') ||
          e.path.includes('secret')
        ),
      );

      if (sensitiveChanges.length > 0) {
        const pathsSummary = sensitiveChanges
          .map(e => e.path ?? 'unknown')
          .join(', ');

        const analysis = await this.reason(
          `During idle monitoring, I detected changes in security-sensitive files: ${pathsSummary}. ` +
          `Briefly assess potential security implications. Keep it concise.`,
        );

        this.communicationBus.sendObservation(
          this.identity.role,
          `Security-sensitive file changes detected: ${analysis.slice(0, 300)}`,
          'warning',
        );

        this.addMemoryEntry({
          content: `Idle scan detected ${sensitiveChanges.length} security-sensitive change(s)`,
          type: 'observation',
          importance: 0.7,
          source: 'self',
          relatedEntries: [],
        });
      }

      // Also check for stale security concerns
      this.pruneStaleSecurityConcerns();
    } catch (err) {
      console.error(`[${this.identity.name}] Idle reasoning error:`, err);
    }
  }

  // ─── Task Relevance Scoring ────────────────────────────────────────────

  scoreTaskRelevance(task: AgentTask): number {
    // Direct role match — security agent has highest relevance for security scans
    if (task.assignedTo === 'security') return 1.0;

    // Score based on task type alignment
    switch (task.type) {
      case 'security_scan':
        return 0.95;
      case 'analysis':
        return 0.5;
      case 'repair':
        return 0.4;
      case 'refactor':
        return 0.3;
      case 'research':
        return 0.25;
      case 'optimization':
        return 0.2;
      case 'ux_review':
        return 0.1;
      default:
        return 0.1;
    }
  }

  // ─── Veto Mechanism ────────────────────────────────────────────────────

  /**
   * Check if a proposed action should be vetoed on security grounds.
   * The security agent has veto power over high-risk proposals.
   */
  shouldVeto(action: AgentAction): { veto: boolean; reason: string } {
    // Check against active security concerns
    for (const concern of this.activeSecurityConcerns.values()) {
      // Veto if the action affects a file with an active critical concern
      if (
        (concern.severity === 'critical' || concern.severity === 'high') &&
        action.affectedFiles.some(f => action.description.toLowerCase().includes(f.toLowerCase()))
      ) {
        return {
          veto: true,
          reason: `Action affects file with active ${concern.severity} security concern: ${concern.description}`,
        };
      }
    }

    // Check if the action itself introduces security risks
    if (action.riskLevel === 'high' && action.type !== 'analysis' && action.type !== 'review') {
      return {
        veto: true,
        reason: `High-risk action (${action.type}) requires security review before execution`,
      };
    }

    // Check if the action involves security-sensitive operations
    const actionDesc = action.description.toLowerCase();
    const sensitivePatterns = [
      'password', 'secret', 'token', 'api_key', 'credential',
      'auth', 'permission', 'chmod', 'exec', 'eval',
    ];

    for (const pattern of sensitivePatterns) {
      if (actionDesc.includes(pattern) && action.confidence < 0.8) {
        return {
          veto: true,
          reason: `Action involves security-sensitive operation "${pattern}" with insufficient confidence (${action.confidence.toFixed(2)})`,
        };
      }
    }

    return { veto: false, reason: '' };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────

  private runStaticSecurityRules(task: AgentTask): SecurityRuleMatch[] {
    const matches: SecurityRuleMatch[] = [];

    // Note: In a real implementation, we would read the file content and scan it.
    // For now, we check the task description and related file paths for patterns.
    const contentToScan = [
      task.description,
      task.title,
      ...task.relatedFiles,
    ].join('\n');

    for (const rule of SECURITY_RULES) {
      if (rule.pattern.test(contentToScan)) {
        matches.push({
          ruleId: rule.id,
          category: rule.category,
          description: rule.description,
          severity: rule.severity,
          recommendation: rule.recommendation,
          context: contentToScan.slice(0, 100),
        });
      }
    }

    return matches;
  }

  private buildSecurityPrompt(task: AgentTask, staticFindings: SecurityRuleMatch[]): string {
    const findingsContext = staticFindings.length > 0
      ? `\n\nStatic analysis findings:\n${staticFindings.map(f =>
          `[${f.severity.toUpperCase()}] ${f.ruleId}: ${f.description}\n  Recommendation: ${f.recommendation}`,
        ).join('\n')}`
      : '\n\nNo static analysis findings detected.';

    const typePrompts: Record<AgentTask['type'], string> = {
      security_scan: `Perform a comprehensive security scan. ${findingsContext}\n\n` +
        `Analyze for:\n` +
        `1. Injection vulnerabilities (SQL, command, XSS)\n` +
        `2. Authentication and authorization flaws\n` +
        `3. Sensitive data exposure\n` +
        `4. Security misconfiguration\n` +
        `5. Dependency vulnerabilities\n` +
        `6. Path traversal and file access issues`,
      analysis: `Analyze the security implications of this request. ${findingsContext}`,
      repair: `Check if this fix introduces any new security vulnerabilities. ${findingsContext}`,
      refactor: `Verify that this refactoring maintains or improves security posture. ${findingsContext}`,
      research: `Research security best practices relevant to this topic. ${findingsContext}`,
      optimization: `Check if optimization changes affect security (e.g., removing validation for speed). ${findingsContext}`,
      ux_review: `Check for security implications of UX changes (e.g., revealing info in error messages). ${findingsContext}`,
    };

    return `${typePrompts[task.type] ?? typePrompts.security_scan}\n\n` +
      `Task: ${task.title}\nDescription: ${task.description}\n` +
      `Related files: ${task.relatedFiles.join(', ') || 'none specified'}`;
  }

  private combineFindings(staticFindings: SecurityRuleMatch[], analysisResult: string): SecurityFindings {
    const findings: SecurityFindings = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      details: [],
      analysis: analysisResult,
    };

    // Count static findings by severity
    for (const match of staticFindings) {
      findings[match.severity]++;
      findings.details.push({
        source: 'static',
        severity: match.severity,
        description: match.description,
        recommendation: match.recommendation,
      });
    }

    // Parse LLM analysis for severity indicators
    const criticalMatches = (analysisResult.match(/\bcritical\b/gi) ?? []).length;
    const highMatches = (analysisResult.match(/\bhigh\s+(?:severity|risk|priority)\b/gi) ?? []).length;
    const mediumMatches = (analysisResult.match(/\bmedium\s+(?:severity|risk|priority)\b/gi) ?? []).length;
    const lowMatches = (analysisResult.match(/\blow\s+(?:severity|risk|priority)\b/gi) ?? []).length;

    findings.critical += criticalMatches;
    findings.high += highMatches;
    findings.medium += mediumMatches;
    findings.low += lowMatches;

    return findings;
  }

  private assessVetoNeeds(findings: SecurityFindings, task: AgentTask): VetoAction[] {
    const vetoes: VetoAction[] = [];

    // Auto-veto if critical findings detected in non-security tasks
    if (findings.critical > 0 && task.type !== 'security_scan') {
      vetoes.push({
        targetTaskType: task.type,
        reason: `${findings.critical} critical security finding(s) detected — blocking execution`,
        severity: 'critical',
      });
    }

    return vetoes;
  }

  private executeVetoActions(vetoes: VetoAction[]): void {
    for (const veto of vetoes) {
      this.communicationBus.send({
        from: this.identity.role,
        to: 'orchestrator',
        type: 'veto',
        priority: 'critical',
        content: `SECURITY VETO: ${veto.reason}`,
        structuredData: {
          voteData: {
            proposalId: `veto-${Date.now()}`,
            vote: 'reject',
            confidence: 0.95,
            reasoning: veto.reason,
          },
        },
      });

      this.addMemoryEntry({
        content: `VETO executed: ${veto.reason}`,
        type: 'decision',
        importance: 0.95,
        source: 'self',
        relatedEntries: [],
      });
    }
  }

  private buildProposedActions(task: AgentTask, findings: SecurityFindings): AgentAction[] {
    const actions: AgentAction[] = [];

    // Always propose the security analysis as an action
    actions.push(this.proposeAction({
      type: 'analysis',
      description: `Security analysis for: ${task.title}`,
      confidence: this.assessSecurityConfidence(findings, task),
      riskLevel: 'low',
      requiresApproval: false,
      params: { findings, taskType: task.type },
      affectedFiles: task.relatedFiles,
      reasoning: findings.analysis.slice(0, 500),
    }));

    // If vulnerabilities are found, propose review action
    if (findings.critical > 0 || findings.high > 0) {
      actions.push(this.proposeAction({
        type: 'review',
        description: `Security review required for: ${task.title}`,
        confidence: 0.9,
        riskLevel: 'low',
        requiresApproval: false,
        params: {
          findingCount: findings.critical + findings.high,
          severity: findings.critical > 0 ? 'critical' : 'high',
        },
        affectedFiles: task.relatedFiles,
        reasoning: `${findings.critical} critical and ${findings.high} high severity findings require review`,
      }));
    }

    // If issues are found that need fixing, delegate to debug agent
    if (findings.critical > 0 || findings.high > 0) {
      actions.push(this.proposeAction({
        type: 'delegate',
        description: `Delegate security fix for: ${task.title}`,
        confidence: 0.7,
        riskLevel: 'low',
        requiresApproval: false,
        params: {
          delegateTo: 'debug',
          reason: 'Security vulnerability requires code fix',
          securityContext: findings.details.slice(0, 5),
        },
        affectedFiles: task.relatedFiles,
        reasoning: `Security findings require debug agent to apply fixes`,
      }));
    }

    return actions;
  }

  private assessSecurityConfidence(findings: SecurityFindings, task: AgentTask): number {
    let confidence = 0.6;

    // Task type alignment
    if (task.type === 'security_scan') confidence += 0.15;

    // Static findings increase confidence (they're rule-based)
    if (findings.details.some(d => d.source === 'static')) confidence += 0.1;

    // Consistent findings increase confidence
    if (findings.critical > 0 || findings.high > 0) confidence += 0.05;

    // Clean scan (no findings) slightly reduces confidence (might have missed something)
    if (findings.critical === 0 && findings.high === 0 && findings.medium === 0) confidence -= 0.1;

    return Math.min(1, Math.max(0, confidence));
  }

  private updateSecurityConcerns(findings: SecurityFindings): void {
    for (const detail of findings.details) {
      if (detail.severity === 'critical' || detail.severity === 'high') {
        const concernId = uuidv4();
        this.activeSecurityConcerns.set(concernId, {
          severity: detail.severity,
          description: detail.description,
          detectedAt: Date.now(),
        });
      }
    }
  }

  private pruneStaleSecurityConcerns(): void {
    const oneHourAgo = Date.now() - 3_600_000;
    for (const [id, concern] of this.activeSecurityConcerns) {
      if (concern.detectedAt < oneHourAgo) {
        this.activeSecurityConcerns.delete(id);
      }
    }
  }

  private buildSecuritySummary(task: AgentTask, findings: SecurityFindings): string {
    const parts: string[] = [`[Security] ${task.title}: `];

    if (findings.critical > 0) parts.push(`${findings.critical} critical,`);
    if (findings.high > 0) parts.push(`${findings.high} high,`);
    if (findings.medium > 0) parts.push(`${findings.medium} medium,`);
    if (findings.low > 0) parts.push(`${findings.low} low`);

    if (findings.critical === 0 && findings.high === 0 && findings.medium === 0 && findings.low === 0) {
      parts.push('No security issues detected.');
    } else {
      parts.push('severity finding(s).');
    }

    return parts.join(' ');
  }

  private extractEvidenceFromFindings(findings: SecurityFindings): string[] {
    return findings.details.slice(0, 5).map(d =>
      `[${d.severity.toUpperCase()}] ${d.description}${d.recommendation ? ` → ${d.recommendation}` : ''}`,
    );
  }

  private identifyScanGaps(findings: SecurityFindings): string[] {
    const gaps: string[] = [];

    if (findings.details.filter(d => d.source === 'static').length === 0) {
      gaps.push('Static analysis did not detect patterns — may need deeper dynamic analysis');
    }

    if (findings.critical === 0 && findings.high === 0 && findings.medium === 0) {
      gaps.push('No findings detected — scan may not have covered all attack surfaces');
    }

    return gaps;
  }
}

// ─── Internal Types ─────────────────────────────────────────────────────────

interface SecurityRuleMatch {
  ruleId: string;
  category: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
  context: string;
}

interface SecurityFindings {
  critical: number;
  high: number;
  medium: number;
  low: number;
  details: Array<{
    source: 'static' | 'dynamic';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation?: string;
  }>;
  analysis: string;
}

interface VetoAction {
  targetTaskType: string;
  reason: string;
  severity: 'critical' | 'high';
}

// ─── Factory Function ───────────────────────────────────────────────────────

export function createSecurityAgent(
  communicationBus: AgentCommunicationBus,
  contextGraph: SharedContextGraph,
  providerManager: ProviderManager,
  memoryStore: MemoryStore,
): SecurityAgent {
  return new SecurityAgent(communicationBus, contextGraph, providerManager, memoryStore);
}
