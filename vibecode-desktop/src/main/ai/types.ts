// ============================================================
// VibeCode Desktop — ARC 22: Multi-Agent Orchestration Types
// Shared type definitions for the entire agent system
// ============================================================

import { ExecutionPlan, ExecutionStep } from '../services/execution-engine';
import { MemoryEntry } from '../services/memory-store';
import { ChatMessage } from '../services/provider-manager';

// ─── Agent Identity ─────────────────────────────────────────────────────────

export type AgentRole = 'architect' | 'debug' | 'research' | 'security' | 'performance' | 'product';

export type AgentStatus = 'idle' | 'thinking' | 'planning' | 'executing' | 'waiting_approval' | 'error' | 'suspended';

export interface AgentIdentity {
  id: string;
  role: AgentRole;
  name: string;
  description: string;
  avatar: string; // emoji identifier for dashboard
  createdAt: number;
}

// ─── Agent Capabilities ─────────────────────────────────────────────────────

export interface AgentCapability {
  domain: string;
  score: number; // 0-1, how competent the agent is in this domain
  description: string;
}

export interface AgentCapabilities {
  primaryDomain: string;
  capabilities: AgentCapability[];
  allowedStepTypes: ExecutionStep['type'][];
  restrictedPaths: string[]; // paths this agent cannot modify
  maxRiskLevel: 'low' | 'medium' | 'high'; // max risk this agent can auto-execute
  requiresApprovalAbove: number; // confidence threshold below which approval is needed
}

// ─── Agent Memory Scope ─────────────────────────────────────────────────────

export interface AgentMemoryScope {
  agentId: string;
  shortTerm: AgentMemoryEntry[];   // current conversation/context
  longTerm: AgentMemoryEntry[];    // compressed historical knowledge
  working: AgentWorkingMemory;      // current task state
}

export interface AgentMemoryEntry {
  id: string;
  content: string;
  type: 'observation' | 'decision' | 'action' | 'learning' | 'constraint';
  importance: number; // 0-1
  timestamp: number;
  source: 'self' | 'workspace' | 'user' | 'peer_agent';
  relatedEntries: string[];
}

export interface AgentWorkingMemory {
  currentTask: AgentTask | null;
  pendingObservations: AgentObservation[];
  activeHypotheses: AgentHypothesis[];
  constraints: string[];
}

// ─── Agent Task ──────────────────────────────────────────────────────────────

export interface AgentTask {
  id: string;
  type: 'analysis' | 'repair' | 'optimization' | 'research' | 'refactor' | 'security_scan' | 'ux_review';
  title: string;
  description: string;
  priority: number; // 0-100, higher = more urgent
  assignedTo: AgentRole;
  createdBy: 'orchestrator' | 'user' | 'peer_agent' | 'self';
  status: AgentTaskStatus;
  confidence: number; // 0-1, agent's confidence in approach
  dependencies: string[]; // task IDs that must complete first
  relatedFiles: string[];
  parentTaskId?: string;
  subtaskIds: string[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: AgentTaskResult;
  executionPlanId?: string;
}

export type AgentTaskStatus = 'queued' | 'assigned' | 'in_progress' | 'reviewing' | 'completed' | 'failed' | 'cancelled' | 'delegated';

export interface AgentTaskResult {
  success: boolean;
  summary: string;
  details: string;
  affectedFiles: string[];
  proposedActions: AgentAction[];
  metrics?: AgentTaskMetrics;
}

export interface AgentTaskMetrics {
  duration: number;
  tokensUsed: number;
  iterationsRequired: number;
  confidenceChange: number;
}

// ─── Agent Action ────────────────────────────────────────────────────────────

export interface AgentAction {
  id: string;
  type: ExecutionStep['type'] | 'suggest' | 'alert' | 'delegate' | 'vote' | 'message';
  agentId: string;
  description: string;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  params: Record<string, unknown>;
  affectedFiles: string[];
  reasoning: string;
  alternatives?: AgentAction[];
  timestamp: number;
}

// ─── Agent Observation & Hypothesis ─────────────────────────────────────────

export interface AgentObservation {
  id: string;
  type: 'file_change' | 'error_detected' | 'pattern_found' | 'performance_issue' | 'security_concern' | 'dependency_update' | 'test_failure';
  source: string; // file path, terminal output, etc.
  content: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: number;
  agentId: AgentRole;
}

export interface AgentHypothesis {
  id: string;
  description: string;
  confidence: number;
  evidence: string[];
  testable: boolean;
  createdAt: number;
}

// ─── Shared Context ─────────────────────────────────────────────────────────

export interface SharedContextEntry {
  id: string;
  type: 'observation' | 'decision' | 'action_result' | 'workspace_state' | 'reasoning';
  source: AgentRole | 'workspace' | 'user';
  content: string;
  importance: number;
  timestamp: number;
  expiresAt?: number;
  relatedEntries: string[];
  version: number; // for conflict detection
}

export interface WorkspaceEvent {
  id: string;
  type: 'file_modified' | 'file_created' | 'file_deleted' | 'test_run' | 'build_result' | 'error_occurred' | 'dependency_change' | 'git_change';
  path?: string;
  content?: string;
  metadata: Record<string, unknown>;
  timestamp: number;
  semanticClassification: WorkspaceEventClassification;
}

export type WorkspaceEventClassification =
  | 'source_change'
  | 'config_change'
  | 'test_change'
  | 'dependency_change'
  | 'documentation_change'
  | 'build_artifact'
  | 'error_state'
  | 'version_control';

// ─── Communication Protocol ─────────────────────────────────────────────────

export type MessagePriority = 'low' | 'normal' | 'high' | 'critical';

export type MessageType =
  | 'observation'
  | 'request'
  | 'response'
  | 'delegation'
  | 'vote'
  | 'veto'
  | 'consensus_request'
  | 'approval_request'
  | 'notification'
  | 'reflection'
  | 'status_update';

export interface AgentMessage {
  id: string;
  type: MessageType;
  from: AgentRole | 'orchestrator' | 'user';
  to: AgentRole | 'broadcast' | 'orchestrator';
  priority: MessagePriority;
  content: string;
  structuredData?: MessageStructuredData;
  correlationId?: string; // for request-response pairing
  inReplyTo?: string;     // message ID being replied to
  timestamp: number;
  expiresAt?: number;
  read: boolean;
}

export interface MessageStructuredData {
  reasoningPacket?: ReasoningPacket;
  delegationContract?: DelegationContract;
  voteData?: VoteData;
  contextRequest?: ContextRequest;
  actionProposal?: AgentAction;
}

export interface ReasoningPacket {
  premises: string[];
  conclusion: string;
  confidence: number;
  evidence: string[];
  assumptions: string[];
  gaps: string[];
}

export interface DelegationContract {
  taskId: string;
  fromAgent: AgentRole;
  toAgent: AgentRole;
  requirements: string[];
  constraints: string[];
  deadline: number;
  priority: number;
}

export interface VoteData {
  proposalId: string;
  vote: 'approve' | 'reject' | 'abstain';
  confidence: number;
  reasoning: string;
  conditions?: string[]; // conditions under which this vote applies
}

export interface ContextRequest {
  requestedContext: string[];
  reason: string;
  urgency: 'low' | 'medium' | 'high';
}

// ─── Voting & Negotiation ───────────────────────────────────────────────────

export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposedBy: AgentRole | 'user';
  actions: AgentAction[];
  riskLevel: 'low' | 'medium' | 'high';
  estimatedImpact: string;
  votes: AgentVote[];
  status: ProposalStatus;
  createdAt: number;
  deadlineAt: number;
  consensusThreshold: number; // 0-1, fraction of votes needed
  executionPlanId?: string;
}

export type ProposalStatus = 'debating' | 'approved' | 'rejected' | 'expired' | 'executing' | 'completed';

export interface AgentVote {
  agentId: AgentRole;
  vote: 'approve' | 'reject' | 'abstain';
  confidence: number;
  reasoning: string;
  weight: number; // voting weight based on domain expertise
  timestamp: number;
  conditions?: string[];
}

export interface NegotiationRound {
  proposalId: string;
  round: number;
  arguments: AgentArgument[];
  contradictions: Contradiction[];
  timestamp: number;
}

export interface AgentArgument {
  agentId: AgentRole;
  position: 'for' | 'against' | 'neutral';
  points: string[];
  counterPoints: string[];
  evidence: string[];
}

export interface Contradiction {
  agentA: AgentRole;
  agentB: AgentRole;
  pointOfContention: string;
  agentAPosition: string;
  agentBPosition: string;
  resolution?: string;
}

// ─── Parallel Execution ─────────────────────────────────────────────────────

export interface ParallelExecutionGroup {
  id: string;
  tasks: ParallelTask[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial';
  lockingStrategy: LockingStrategy;
  createdAt: number;
  completedAt?: number;
}

export interface ParallelTask {
  taskId: string;
  agentId: AgentRole;
  lockedResources: string[]; // file paths locked for this task
  dependsOn: string[];       // other task IDs
  status: 'waiting' | 'ready' | 'running' | 'completed' | 'failed';
}

export interface LockingStrategy {
  type: 'pessimistic' | 'optimistic' | 'batched';
  granularity: 'file' | 'directory' | 'module';
  timeout: number; // ms before lock auto-releases
  conflictResolution: 'abort' | 'queue' | 'merge' | 'vote';
}

export interface ResourceLock {
  resource: string; // file path or directory
  heldBy: string;   // agent ID or task ID
  acquiredAt: number;
  expiresAt: number;
  type: 'read' | 'write' | 'exclusive';
}

// ─── Autonomous Organization ────────────────────────────────────────────────

export interface OrganizationGoal {
  id: string;
  title: string;
  description: string;
  type: 'stability' | 'quality' | 'performance' | 'security' | 'coverage' | 'maintainability';
  priority: number;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  progress: number; // 0-1
  decomposition: GoalDecomposition;
  assignedAgents: AgentRole[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  parentGoalId?: string;
  crossSessionId?: string; // for cross-session continuity
}

export interface GoalDecomposition {
  subgoals: OrganizationGoal[];
  requiredTasks: string[]; // task IDs
  milestones: GoalMilestone[];
  estimatedEffort: number; // relative units
}

export interface GoalMilestone {
  id: string;
  title: string;
  criteria: string[];
  progress: number;
  achievedAt?: number;
}

export interface OrganizationMemory {
  goals: OrganizationGoal[];
  completedGoals: OrganizationGoal[];
  lessonsLearned: LessonLearned[];
  agentPerformanceHistory: AgentPerformanceRecord[];
  crossSessionState: CrossSessionState;
}

export interface LessonLearned {
  id: string;
  context: string;
  lesson: string;
  applicability: string[];
  importance: number;
  learnedAt: number;
  sourceAgent: AgentRole;
}

export interface AgentPerformanceRecord {
  agentId: AgentRole;
  period: { start: number; end: number };
  tasksCompleted: number;
  tasksFailed: number;
  avgConfidence: number;
  avgDuration: number;
  userInterventions: number;
  correctDecisions: number;
  totalDecisions: number;
}

export interface CrossSessionState {
  activeGoals: string[];
  pendingDecisions: string[];
  compressedHistory: string;
  lastCheckpoint: number;
}

// ─── Dashboard Types ────────────────────────────────────────────────────────

export interface AgentDashboardState {
  agents: AgentDashboardEntry[];
  activeTasks: AgentTask[];
  activeProposals: Proposal[];
  recentMessages: AgentMessage[];
  activeGoals: OrganizationGoal[];
  systemMetrics: DashboardMetrics;
  autonomyLevel: AutonomyLevel;
}

export interface AgentDashboardEntry {
  identity: AgentIdentity;
  status: AgentStatus;
  currentTask: AgentTask | null;
  recentActions: AgentAction[];
  confidence: number;
  lastActivity: number;
}

export type AutonomyLevel = 'supervised' | 'assisted' | 'autonomous';

export interface DashboardMetrics {
  totalAgents: number;
  activeAgents: number;
  pendingTasks: number;
  activeProposals: number;
  avgConfidence: number;
  executionSuccessRate: number;
  decisionsPerMinute: number;
  messagesPerMinute: number;
}

// ─── Orchestrator Configuration ─────────────────────────────────────────────

export interface OrchestratorConfig {
  maxConcurrentAgents: number;
  maxConcurrentTasks: number;
  defaultAutonomyLevel: AutonomyLevel;
  votingTimeout: number;        // ms
  messageRetentionMs: number;
  contextGraphMaxEntries: number;
  goalCheckIntervalMs: number;
  reasoningBudgetPerCycle: number; // max tokens per reasoning cycle
  idleReasoningIntervalMs: number;
  lockTimeoutMs: number;
  compressionIntervalMs: number;
}

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  maxConcurrentAgents: 6,
  maxConcurrentTasks: 10,
  defaultAutonomyLevel: 'assisted',
  votingTimeout: 30_000,
  messageRetentionMs: 3600_000, // 1 hour
  contextGraphMaxEntries: 10_000,
  goalCheckIntervalMs: 60_000,
  reasoningBudgetPerCycle: 4096,
  idleReasoningIntervalMs: 30_000,
  lockTimeoutMs: 60_000,
  compressionIntervalMs: 300_000,
};
