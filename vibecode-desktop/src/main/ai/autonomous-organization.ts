// ============================================================
// VibeCode Desktop — ARC 22: Autonomous Organization Simulation
// Persistent long-running objectives, goal decomposition,
// self-generated subtasks, recursive execution chains,
// cross-session continuity
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import {
  OrganizationGoal,
  GoalDecomposition,
  GoalMilestone,
  OrganizationMemory,
  LessonLearned,
  AgentPerformanceRecord,
  CrossSessionState,
  AgentRole,
  AgentTask,
} from './types';
import { MultiAgentOrchestrator } from './multi-agent-orchestrator';
import { EventEmitter } from 'events';

// ─── Configuration ──────────────────────────────────────────────────────────

const PERSISTENCE_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '/tmp',
  '.vibecode',
  'organization'
);
const GOALS_FILE = path.join(PERSISTENCE_DIR, 'goals.json');
const MEMORY_FILE = path.join(PERSISTENCE_DIR, 'memory.json');
const CHECKPOINT_INTERVAL_MS = 5 * 60_000; // 5 minutes
const MAX_ACTIVE_GOALS = 10;
const MAX_COMPLETED_GOALS = 100;
const MAX_LESSONS = 500;

// ─── Event Types ────────────────────────────────────────────────────────────

export type OrganizationEventType = 'goal:created' | 'goal:updated' | 'goal:completed' | 'goal:abandoned' | 'subtask:generated' | 'milestone:achieved' | 'lesson:learned' | 'checkpoint:saved';

export interface OrganizationEvent {
  type: OrganizationEventType;
  goalId?: string;
  timestamp: number;
  data?: unknown;
}

// ─── Autonomous Organization ────────────────────────────────────────────────

export class AutonomousOrganization extends EventEmitter {
  private orchestrator: MultiAgentOrchestrator;
  private memory: OrganizationMemory;
  private handlers: ((event: OrganizationEvent) => void)[] = [];
  private checkpointTimer: NodeJS.Timeout | null = null;
  private running: boolean = false;

  constructor(orchestrator: MultiAgentOrchestrator) {
    super();
    this.orchestrator = orchestrator;

    this.memory = {
      goals: [],
      completedGoals: [],
      lessonsLearned: [],
      agentPerformanceHistory: [],
      crossSessionState: {
        activeGoals: [],
        pendingDecisions: [],
        compressedHistory: '',
        lastCheckpoint: 0,
      },
    };

    this.loadFromDisk();
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startCheckpointTimer();
    this.resumeActiveGoals();
    console.log('[AutonomousOrganization] Started with', this.memory.goals.length, 'active goals');
  }

  stop(): void {
    this.running = false;
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
      this.checkpointTimer = null;
    }
    this.saveToDisk();
  }

  // ─── Goal Management ──────────────────────────────────────────────────

  /**
   * Create a new organizational goal.
   */
  createGoal(
    title: string,
    description: string,
    type: OrganizationGoal['type'],
    priority: number = 50,
    parentGoalId?: string,
  ): OrganizationGoal {
    const goal: OrganizationGoal = {
      id: uuidv4(),
      title,
      description,
      type,
      priority,
      status: 'active',
      progress: 0,
      decomposition: {
        subgoals: [],
        requiredTasks: [],
        milestones: this.generateMilestones(type),
        estimatedEffort: this.estimateEffort(type),
      },
      assignedAgents: this.selectAgentsForGoal(type),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentGoalId,
      crossSessionId: uuidv4(),
    };

    this.memory.goals.push(goal);
    this.memory.crossSessionState.activeGoals.push(goal.id);

    // Enforce goal limits
    this.enforceGoalLimit();

    this.emitOrgEvent('goal:created', goal.id, { goal });
    this.saveToDisk();

    return goal;
  }

  /**
   * Update a goal's progress.
   */
  updateGoalProgress(goalId: string, progress: number): OrganizationGoal | null {
    const goal = this.findGoal(goalId);
    if (!goal) return null;

    goal.progress = Math.min(1, Math.max(0, progress));
    goal.updatedAt = Date.now();

    // Check milestones
    this.checkMilestones(goal);

    // Check if goal is complete
    if (goal.progress >= 1) {
      this.completeGoal(goalId);
    } else {
      this.emitOrgEvent('goal:updated', goalId, { progress });
    }

    this.saveToDisk();
    return goal;
  }

  /**
   * Decompose a goal into subgoals and tasks.
   */
  decomposeGoal(goalId: string): { subgoals: OrganizationGoal[]; tasks: AgentTask[] } {
    const goal = this.findGoal(goalId);
    if (!goal) return { subgoals: [], tasks: [] };

    // Generate subgoals based on goal type
    const subgoalTemplates = this.getSubgoalTemplates(goal);
    const subgoals: OrganizationGoal[] = [];

    for (const template of subgoalTemplates) {
      const subgoal = this.createGoal(
        template.title,
        template.description,
        template.type,
        goal.priority * 0.8,
        goalId,
      );
      subgoals.push(subgoal);
      goal.decomposition.subgoals.push(subgoal);
    }

    // Generate tasks from the goal
    const tasks = this.generateTasksFromGoal(goal);

    this.emitOrgEvent('goal:updated', goalId, { decomposed: true, subgoalCount: subgoals.length, taskCount: tasks.length });
    this.saveToDisk();

    return { subgoals, tasks };
  }

  /**
   * Complete a goal.
   */
  completeGoal(goalId: string): OrganizationGoal | null {
    const goal = this.findGoal(goalId);
    if (!goal) return null;

    goal.status = 'completed';
    goal.progress = 1;
    goal.completedAt = Date.now();
    goal.updatedAt = Date.now();

    // Move to completed
    this.memory.goals = this.memory.goals.filter(g => g.id !== goalId);
    this.memory.completedGoals.push(goal);
    this.memory.crossSessionState.activeGoals = this.memory.crossSessionState.activeGoals.filter(id => id !== goalId);

    // Learn from the completed goal
    this.recordLesson(goal);

    // Update parent goal progress
    if (goal.parentGoalId) {
      const parent = this.findGoal(goal.parentGoalId);
      if (parent) {
        const subgoals = parent.decomposition.subgoals;
        const completedCount = subgoals.filter(s => s.status === 'completed').length;
        const progress = subgoals.length > 0 ? completedCount / subgoals.length : 1;
        this.updateGoalProgress(parent.id, progress);
      }
    }

    this.emitOrgEvent('goal:completed', goalId, { goal });
    this.saveToDisk();

    return goal;
  }

  /**
   * Abandon a goal (with reason).
   */
  abandonGoal(goalId: string, reason: string): OrganizationGoal | null {
    const goal = this.findGoal(goalId);
    if (!goal) return null;

    goal.status = 'abandoned';
    goal.updatedAt = Date.now();

    this.memory.goals = this.memory.goals.filter(g => g.id !== goalId);
    this.memory.completedGoals.push(goal);
    this.memory.crossSessionState.activeGoals = this.memory.crossSessionState.activeGoals.filter(id => id !== goalId);

    // Record lesson from failure
    this.memory.lessonsLearned.push({
      id: uuidv4(),
      context: `Goal abandoned: ${goal.title}`,
      lesson: reason,
      applicability: [goal.type],
      importance: 0.6,
      learnedAt: Date.now(),
      sourceAgent: 'architect',
    });

    this.emitOrgEvent('goal:abandoned', goalId, { goal, reason });
    this.saveToDisk();

    return goal;
  }

  // ─── Goal Queries ─────────────────────────────────────────────────────

  getActiveGoals(): OrganizationGoal[] {
    return this.memory.goals.filter(g => g.status === 'active');
  }

  getGoal(goalId: string): OrganizationGoal | null {
    return this.findGoal(goalId);
  }

  getAllGoals(): OrganizationGoal[] {
    return [...this.memory.goals, ...this.memory.completedGoals];
  }

  getLessonsLearned(limit: number = 20): LessonLearned[] {
    return this.memory.lessonsLearned
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  getRelevantLessons(context: string, limit: number = 5): LessonLearned[] {
    const contextTerms = new Set(context.toLowerCase().split(/\s+/).filter(t => t.length > 3));
    const scored = this.memory.lessonsLearned.map(lesson => {
      let score = lesson.importance;
      const lessonTerms = lesson.context.toLowerCase().split(/\s+/);
      for (const term of lessonTerms) {
        if (contextTerms.has(term)) score += 0.3;
      }
      for (const app of lesson.applicability) {
        if (context.toLowerCase().includes(app)) score += 0.2;
      }
      return { lesson, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.lesson);
  }

  // ─── Performance Tracking ─────────────────────────────────────────────

  recordAgentPerformance(record: AgentPerformanceRecord): void {
    this.memory.agentPerformanceHistory.push(record);
    // Keep bounded
    if (this.memory.agentPerformanceHistory.length > 500) {
      this.memory.agentPerformanceHistory = this.memory.agentPerformanceHistory.slice(-500);
    }
  }

  getAgentPerformance(agentId: AgentRole, lastNDays: number = 30): AgentPerformanceRecord[] {
    const cutoff = Date.now() - lastNDays * 24 * 60 * 60 * 1000;
    return this.memory.agentPerformanceHistory
      .filter(r => r.agentId === agentId && r.period.start >= cutoff);
  }

  // ─── Cross-Session Continuity ─────────────────────────────────────────

  getCrossSessionState(): CrossSessionState {
    return { ...this.memory.crossSessionState };
  }

  // ─── Statistics ────────────────────────────────────────────────────────

  getStats(): {
    activeGoals: number;
    completedGoals: number;
    abandonedGoals: number;
    totalLessons: number;
    avgGoalProgress: number;
    topGoalTypes: Record<string, number>;
  } {
    const active = this.memory.goals.filter(g => g.status === 'active');
    const completed = this.memory.completedGoals.filter(g => g.status === 'completed');
    const abandoned = this.memory.completedGoals.filter(g => g.status === 'abandoned');

    const typeCounts: Record<string, number> = {};
    for (const g of this.memory.goals) {
      typeCounts[g.type] = (typeCounts[g.type] ?? 0) + 1;
    }

    return {
      activeGoals: active.length,
      completedGoals: completed.length,
      abandonedGoals: abandoned.length,
      totalLessons: this.memory.lessonsLearned.length,
      avgGoalProgress: active.length > 0
        ? active.reduce((sum, g) => sum + g.progress, 0) / active.length
        : 0,
      topGoalTypes: typeCounts,
    };
  }

  // ─── Event Handlers ───────────────────────────────────────────────────

  onOrganizationEvent(handler: (event: OrganizationEvent) => void): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private findGoal(goalId: string): OrganizationGoal | null {
    return this.memory.goals.find(g => g.id === goalId) ??
           this.memory.completedGoals.find(g => g.id === goalId) ??
           null;
  }

  private selectAgentsForGoal(type: OrganizationGoal['type']): AgentRole[] {
    const mapping: Record<OrganizationGoal['type'], AgentRole[]> = {
      stability: ['debug', 'security', 'architect'],
      quality: ['architect', 'product', 'research'],
      performance: ['performance', 'architect'],
      security: ['security', 'architect'],
      coverage: ['research', 'debug', 'product'],
      maintainability: ['architect', 'research', 'performance'],
    };
    return mapping[type] ?? ['architect'];
  }

  private generateMilestones(type: OrganizationGoal['type']): GoalMilestone[] {
    const templates: Record<OrganizationGoal['type'], string[]> = {
      stability: ['No critical errors for 24h', 'Test pass rate > 95%', 'Zero regression issues'],
      quality: ['Code review complete', 'Documentation updated', 'Type safety verified'],
      performance: ['Bottlenecks identified', 'Optimizations applied', 'Benchmarks passing'],
      security: ['Vulnerability scan clean', 'Permissions audited', 'Security review passed'],
      coverage: ['Key modules tested', 'Edge cases covered', 'Integration tests pass'],
      maintainability: ['Dependencies updated', 'Dead code removed', 'Architecture simplified'],
    };

    return (templates[type] ?? ['Goal initiated', 'Progress made', 'Goal achieved']).map(title => ({
      id: uuidv4(),
      title,
      criteria: [title],
      progress: 0,
    }));
  }

  private estimateEffort(type: OrganizationGoal['type']): number {
    const efforts: Record<OrganizationGoal['type'], number> = {
      stability: 8,
      quality: 6,
      performance: 7,
      security: 5,
      coverage: 9,
      maintainability: 6,
    };
    return efforts[type] ?? 5;
  }

  private checkMilestones(goal: OrganizationGoal): void {
    for (const milestone of goal.decomposition.milestones) {
      if (milestone.achievedAt) continue;

      // Simple progress-based milestone tracking
      const threshold = (goal.decomposition.milestones.indexOf(milestone) + 1) / goal.decomposition.milestones.length;
      if (goal.progress >= threshold) {
        milestone.progress = 1;
        milestone.achievedAt = Date.now();
        this.emitOrgEvent('milestone:achieved', goal.id, { milestone });
      }
    }
  }

  private getSubgoalTemplates(goal: OrganizationGoal): Array<{ title: string; description: string; type: OrganizationGoal['type'] }> {
    switch (goal.type) {
      case 'stability':
        return [
          { title: `Fix critical errors in ${goal.title}`, description: 'Identify and fix all critical runtime errors', type: 'stability' },
          { title: `Improve test coverage for ${goal.title}`, description: 'Add tests to prevent regression', type: 'coverage' },
        ];
      case 'quality':
        return [
          { title: `Code review: ${goal.title}`, description: 'Review code quality and suggest improvements', type: 'quality' },
          { title: `Refactor: ${goal.title}`, description: 'Apply refactoring suggestions', type: 'maintainability' },
        ];
      case 'performance':
        return [
          { title: `Profile: ${goal.title}`, description: 'Identify performance bottlenecks', type: 'performance' },
          { title: `Optimize: ${goal.title}`, description: 'Apply performance optimizations', type: 'performance' },
        ];
      case 'security':
        return [
          { title: `Scan: ${goal.title}`, description: 'Run security vulnerability scan', type: 'security' },
          { title: `Patch: ${goal.title}`, description: 'Fix identified security issues', type: 'security' },
        ];
      case 'coverage':
        return [
          { title: `Test: ${goal.title}`, description: 'Write comprehensive tests', type: 'coverage' },
          { title: `Verify: ${goal.title}`, description: 'Verify test coverage targets', type: 'quality' },
        ];
      case 'maintainability':
        return [
          { title: `Analyze: ${goal.title}`, description: 'Analyze codebase for maintainability issues', type: 'maintainability' },
          { title: `Cleanup: ${goal.title}`, description: 'Remove dead code and simplify architecture', type: 'maintainability' },
        ];
      default:
        return [];
    }
  }

  private generateTasksFromGoal(goal: OrganizationGoal): AgentTask[] {
    const tasks: AgentTask[] = [];
    for (const agent of goal.assignedAgents) {
      const task: AgentTask = {
        id: uuidv4(),
        type: this.goalTypeToTaskType(goal.type),
        title: `${goal.title} (${agent})`,
        description: goal.description,
        priority: goal.priority,
        assignedTo: agent,
        createdBy: 'orchestrator',
        status: 'queued',
        confidence: 0.5,
        dependencies: [],
        relatedFiles: [],
        subtaskIds: [],
        parentTaskId: undefined,
        createdAt: Date.now(),
      };
      tasks.push(task);
      goal.decomposition.requiredTasks.push(task.id);
    }
    return tasks;
  }

  private goalTypeToTaskType(goalType: OrganizationGoal['type']): AgentTask['type'] {
    const mapping: Record<string, AgentTask['type']> = {
      stability: 'repair',
      quality: 'analysis',
      performance: 'optimization',
      security: 'security_scan',
      coverage: 'analysis',
      maintainability: 'refactor',
    };
    return mapping[goalType] ?? 'analysis';
  }

  private recordLesson(goal: OrganizationGoal): void {
    const lesson: LessonLearned = {
      id: uuidv4(),
      context: `Completed goal: ${goal.title} (${goal.type})`,
      lesson: `Goal of type "${goal.type}" was completed successfully with ${goal.assignedAgents.join(', ')} agents. Progress: ${goal.progress}. Duration: ${goal.completedAt ? goal.completedAt - goal.createdAt : 'unknown'}ms.`,
      applicability: [goal.type],
      importance: 0.7,
      learnedAt: Date.now(),
      sourceAgent: 'architect',
    };
    this.memory.lessonsLearned.push(lesson);
    if (this.memory.lessonsLearned.length > MAX_LESSONS) {
      this.memory.lessonsLearned.sort((a, b) => b.importance - a.importance);
      this.memory.lessonsLearned = this.memory.lessonsLearned.slice(0, MAX_LESSONS);
    }
  }

  private enforceGoalLimit(): void {
    while (this.memory.goals.length > MAX_ACTIVE_GOALS) {
      const lowest = this.memory.goals.sort((a, b) => a.priority - b.priority)[0];
      if (lowest) {
        this.abandonGoal(lowest.id, 'Goal deprioritized to make room for higher priority goals');
      }
    }
    while (this.memory.completedGoals.length > MAX_COMPLETED_GOALS) {
      this.memory.completedGoals.shift();
    }
  }

  private resumeActiveGoals(): void {
    for (const goal of this.memory.goals) {
      if (goal.status === 'active') {
        // Check if goal should still be active
        const age = Date.now() - goal.createdAt;
        if (age > 7 * 24 * 60 * 60 * 1000 && goal.progress < 0.1) {
          // Stale goal
          this.abandonGoal(goal.id, 'Goal inactive for 7 days with minimal progress');
        }
      }
    }
  }

  // ─── Persistence ──────────────────────────────────────────────────────

  private startCheckpointTimer(): void {
    this.checkpointTimer = setInterval(() => {
      this.saveToDisk();
      this.emitOrgEvent('checkpoint:saved');
    }, CHECKPOINT_INTERVAL_MS);
    if (this.checkpointTimer?.unref) this.checkpointTimer.unref();
  }

  private saveToDisk(): void {
    try {
      if (!fs.existsSync(PERSISTENCE_DIR)) {
        fs.mkdirSync(PERSISTENCE_DIR, { recursive: true });
      }

      this.memory.crossSessionState.lastCheckpoint = Date.now();
      this.memory.crossSessionState.activeGoals = this.memory.goals.map(g => g.id);
      this.memory.crossSessionState.compressedHistory = this.compressHistory();

      fs.writeFileSync(GOALS_FILE, JSON.stringify({
        active: this.memory.goals,
        completed: this.memory.completedGoals.slice(-MAX_COMPLETED_GOALS),
      }, null, 2), 'utf-8');

      fs.writeFileSync(MEMORY_FILE, JSON.stringify({
        lessons: this.memory.lessonsLearned,
        performance: this.memory.agentPerformanceHistory.slice(-100),
        crossSession: this.memory.crossSessionState,
      }, null, 2), 'utf-8');
    } catch (err) {
      console.error('[AutonomousOrganization] Failed to save:', err);
    }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(GOALS_FILE)) {
        const data = JSON.parse(fs.readFileSync(GOALS_FILE, 'utf-8'));
        this.memory.goals = data.active ?? [];
        this.memory.completedGoals = data.completed ?? [];
      }
      if (fs.existsSync(MEMORY_FILE)) {
        const data = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
        this.memory.lessonsLearned = data.lessons ?? [];
        this.memory.agentPerformanceHistory = data.performance ?? [];
        this.memory.crossSessionState = data.crossSession ?? this.memory.crossSessionState;
      }
      console.log('[AutonomousOrganization] Loaded from disk:', this.memory.goals.length, 'active goals');
    } catch (err) {
      console.error('[AutonomousOrganization] Failed to load:', err);
    }
  }

  private compressHistory(): string {
    const goals = this.memory.completedGoals.slice(-20);
    return goals.map(g => `${g.type}:${g.title}:${g.status}`).join('; ');
  }

  private emitOrgEvent(type: OrganizationEventType, goalId?: string, data?: unknown): void {
    const event: OrganizationEvent = { type, goalId, timestamp: Date.now(), data };
    for (const handler of this.handlers) {
      try { handler(event); } catch (err) { console.error('[AutonomousOrganization] Event handler error:', err); }
    }
    this.emit(type, event);
  }

  dispose(): void {
    this.stop();
    this.handlers = [];
    this.memory.goals = [];
    this.memory.completedGoals = [];
    this.memory.lessonsLearned = [];
    this.memory.agentPerformanceHistory = [];
    this.removeAllListeners();
  }
}
