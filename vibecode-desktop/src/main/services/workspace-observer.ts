// ─── VibeCode Desktop — Live Workspace Awareness Engine ────────────────────────
// ARC 21 P0-3: Real-Time Workspace Observer
//
// Tracks file edits as streams of intent (not raw changes).
// Converts edits into semantic events. Feeds them into agent memory instantly.
// Updates context ranking in real time.
//
// Key features:
//   - File diff streaming pipeline
//   - Semantic change classifier
//   - Hot-reload context injection into agent runtime
//   - Real-time context ranking updates
// ──────────────────────────────────────────────────────────────────────────────

import * as path from 'path';
import { EventEmitter } from 'events';
import type { ExecutionStateMachine } from './execution-state-machine';
import type { WorkspaceContextService, WorkspaceFile } from './workspace-context-service';
import type { SessionMemoryService } from './session-memory';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** A semantic file change event */
export interface SemanticFileChange {
  /** Unique event ID */
  id: string;
  /** File path */
  filePath: string;
  /** Relative path from workspace root */
  relativePath: string;
  /** Change type */
  changeType: 'create' | 'modify' | 'delete' | 'rename';
  /** Semantic classification of the change */
  semanticType: SemanticChangeType;
  /** What the user appears to be doing */
  inferredIntent: InferredEditIntent;
  /** Confidence of intent inference */
  intentConfidence: number;
  /** Change magnitude (0-1: 0 = trivial, 1 = complete rewrite) */
  magnitude: number;
  /** Timestamp */
  timestamp: number;
  /** Diff summary (human-readable) */
  diffSummary: string;
  /** Affected symbols/imports (if detectable) */
  affectedSymbols: string[];
  /** Whether this change is part of a batch */
  isBatchPart: boolean;
  /** Batch ID (if part of a batch) */
  batchId?: string;
}

/** Semantic classification of a file change */
export type SemanticChangeType =
  | 'feature_addition'     // New functionality added
  | 'bug_fix'              // Fixing a bug
  | 'refactoring'          // Code restructure without behavior change
  | 'import_update'        // Import/add/export changes
  | 'dependency_change'    // package.json, requirements.txt, etc.
  | 'config_change'        // Configuration file modification
  | 'style_change'         // Formatting, whitespace, comments only
  | 'test_change'          // Test file modification
  | 'documentation'        // Doc/comment changes
  | 'deletion'             // File or significant code removal
  | 'rename'               // File or symbol rename
  | 'infrastructure'       // Build, CI, deployment changes
  | 'unknown';

/** What the user appears to be doing with this edit */
export type InferredEditIntent =
  | 'implementing_feature'   // Actively writing new code
  | 'fixing_bug'             // Fixing a known issue
  | 'refactoring'            // Improving code structure
  | 'debugging'              // Adding debug/inspection code
  | 'exploring'              // Reading/navigating (small changes)
  | 'configuring'            // Adjusting project settings
  | 'testing'                // Writing or modifying tests
  | 'cleaning_up'            // Removing dead code
  | 'dependency_management'  // Installing/removing deps
  | 'unknown';

/** A batch of related changes */
export interface ChangeBatch {
  /** Batch ID */
  id: string;
  /** Changes in this batch */
  changes: SemanticFileChange[];
  /** When the batch started */
  startedAt: number;
  /** When the batch was considered complete */
  completedAt: number | null;
  /** Overall inferred intent */
  intent: InferredEditIntent;
  /** Files affected */
  affectedFiles: string[];
  /** Is the batch still being added to? */
  isActive: boolean;
}

/** Observer configuration */
export interface WorkspaceObserverConfig {
  /** Debounce time for batching changes (ms) */
  batchDebounceTime: number;
  /** Maximum batch size before auto-completing */
  maxBatchSize: number;
  /** Maximum time a batch can remain open (ms) */
  maxBatchDuration: number;
  /** Whether to compute diffs */
  computeDiffs: boolean;
  /** Whether to infer intent */
  inferIntent: boolean;
  /** File patterns to ignore */
  ignorePatterns: string[];
}

/** Observer metrics */
export interface ObserverMetrics {
  /** Total changes observed */
  totalChanges: number;
  /** Changes by semantic type */
  changesByType: Record<string, number>;
  /** Changes by intent */
  changesByIntent: Record<string, number>;
  /** Batches completed */
  batchesCompleted: number;
  /** Average batch size */
  avgBatchSize: number;
  /** Active batches */
  activeBatches: number;
  /** Last change timestamp */
  lastChangeAt: number;
  /** Estimated events per minute */
  eventsPerMinute: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_OBSERVER_CONFIG: WorkspaceObserverConfig = {
  batchDebounceTime: 2000,  // 2 seconds
  maxBatchSize: 20,
  maxBatchDuration: 30_000, // 30 seconds
  computeDiffs: true,
  inferIntent: true,
  ignorePatterns: [
    'node_modules', '.git', 'dist', 'build', '.next',
    '__pycache__', '.venv', 'target', 'bin',
    '.DS_Store', 'thumbs.db',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// WORKSPACE OBSERVER
// ═══════════════════════════════════════════════════════════════════════════════

export class WorkspaceObserver extends EventEmitter {
  private esm: ExecutionStateMachine;
  private workspaceContext: WorkspaceContextService | null = null;
  private sessionMemory: SessionMemoryService | null = null;
  private config: WorkspaceObserverConfig;
  private workspaceRoot: string;

  /** Active change batches */
  private activeBatches: Map<string, ChangeBatch> = new Map();

  /** Batch completion timers */
  private batchTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** Recent change stream (last 100) */
  private recentChanges: SemanticFileChange[] = [];
  private readonly MAX_RECENT_CHANGES = 100;

  /** Last file content cache for diff computation */
  private lastContentCache: Map<string, string> = new Map();
  private readonly MAX_CACHE_SIZE = 50;

  /** Metrics */
  private metrics: ObserverMetrics = {
    totalChanges: 0,
    changesByType: {},
    changesByIntent: {},
    batchesCompleted: 0,
    avgBatchSize: 0,
    activeBatches: 0,
    lastChangeAt: 0,
    eventsPerMinute: 0,
  };

  /** Timestamps for events-per-minute calculation */
  private changeTimestamps: number[] = [];

  constructor(
    esm: ExecutionStateMachine,
    workspaceRoot: string,
    config?: Partial<WorkspaceObserverConfig>,
  ) {
    super();
    this.esm = esm;
    this.workspaceRoot = workspaceRoot;
    this.config = { ...DEFAULT_OBSERVER_CONFIG, ...config };
    this.setMaxListeners(50);
  }

  /** Inject dependencies */
  injectDependencies(deps: {
    workspaceContext?: WorkspaceContextService;
    sessionMemory?: SessionMemoryService;
  }): void {
    if (deps.workspaceContext) this.workspaceContext = deps.workspaceContext;
    if (deps.sessionMemory) this.sessionMemory = deps.sessionMemory;
  }

  // ─── File Change Processing ──────────────────────────────────────────

  /** Process a file change event from the file system watcher */
  processFileChange(filePath: string, changeType: 'create' | 'modify' | 'delete' | 'rename'): void {
    // Check ignore patterns
    const relativePath = path.relative(this.workspaceRoot, filePath);
    if (this.shouldIgnore(relativePath)) return;

    // Create semantic change event
    const change = this.classifyChange(filePath, relativePath, changeType);

    // Update metrics
    this.recordChange(change);

    // Add to current batch or start a new one
    this.addToBatch(change);

    // Update workspace context in real time
    if (this.workspaceContext) {
      switch (changeType) {
        case 'modify':
          this.workspaceContext.recordFileEdit(filePath);
          break;
        case 'delete':
          // Workspace context doesn't have explicit delete — context will refresh
          break;
      }
    }

    // Emit the semantic event
    this.emit('change:semantic', change);
    this.emit(`change:${change.semanticType}`, change);

    if (change.inferredIntent !== 'unknown') {
      this.emit(`intent:${change.inferredIntent}`, change);
    }
  }

  /** Classify a file change into semantic type and intent */
  private classifyChange(
    filePath: string,
    relativePath: string,
    changeType: 'create' | 'modify' | 'delete' | 'rename',
  ): SemanticFileChange {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath).toLowerCase();

    // Classify semantic type
    const semanticType = this.classifySemanticType(relativePath, ext, fileName, changeType);

    // Infer intent
    const inferredIntent = this.inferEditIntent(relativePath, ext, fileName, semanticType, changeType);

    // Compute change magnitude
    const magnitude = this.computeMagnitude(filePath, changeType);

    // Compute diff summary
    const diffSummary = this.computeDiffSummary(filePath, changeType);

    // Detect affected symbols
    const affectedSymbols = this.detectAffectedSymbols(filePath, changeType);

    const change: SemanticFileChange = {
      id: `chg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      filePath,
      relativePath,
      changeType,
      semanticType,
      inferredIntent,
      intentConfidence: this.computeIntentConfidence(semanticType, inferredIntent),
      magnitude,
      timestamp: Date.now(),
      diffSummary,
      affectedSymbols,
      isBatchPart: false, // Will be updated when added to batch
    };

    return change;
  }

  /** Classify the semantic type of a change */
  private classifySemanticType(
    relativePath: string,
    ext: string,
    fileName: string,
    changeType: 'create' | 'modify' | 'delete' | 'rename',
  ): SemanticChangeType {
    // Config files
    if ([
      'package.json', 'tsconfig.json', '.eslintrc', '.prettierrc',
      'vite.config.ts', 'webpack.config.js', 'docker-compose.yml',
      '.env', '.env.local', 'Makefile', 'Cargo.toml', 'go.mod',
    ].includes(fileName)) {
      return 'config_change';
    }

    // Dependency files
    if (['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Gemfile.lock'].includes(fileName)) {
      return 'dependency_change';
    }

    // Test files
    if (relativePath.includes('.test.') || relativePath.includes('.spec.') ||
        relativePath.includes('__tests__') || relativePath.includes('test/') ||
        relativePath.includes('tests/')) {
      return 'test_change';
    }

    // Documentation
    if (ext === '.md' || ext === '.rst' || ext === '.txt' || fileName.startsWith('readme')) {
      return 'documentation';
    }

    // Infrastructure
    if (relativePath.includes('.github/') || relativePath.includes('ci/') ||
        relativePath.includes('dockerfile') || relativePath.includes('docker-compose') ||
        fileName === 'jenkinsfile' || relativePath.includes('.gitlab-ci')) {
      return 'infrastructure';
    }

    // Deletion
    if (changeType === 'delete') {
      return 'deletion';
    }

    // Rename
    if (changeType === 'rename') {
      return 'rename';
    }

    // Source code changes — try to infer more specific type
    if (['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go'].includes(ext)) {
      // Heuristic: new files are often feature additions
      if (changeType === 'create') {
        return 'feature_addition';
      }

      // Otherwise, we can't tell without diff analysis — mark as unknown
      // A real implementation would analyze the diff here
      return 'unknown';
    }

    // Style files
    if (['.css', '.scss', '.less', '.sass'].includes(ext)) {
      return 'style_change';
    }

    return 'unknown';
  }

  /** Infer the user's edit intent from the change */
  private inferEditIntent(
    relativePath: string,
    ext: string,
    fileName: string,
    semanticType: SemanticChangeType,
    changeType: 'create' | 'modify' | 'delete' | 'rename',
  ): InferredEditIntent {
    // Direct mappings from semantic type
    const typeToIntent: Partial<Record<SemanticChangeType, InferredEditIntent>> = {
      feature_addition: 'implementing_feature',
      bug_fix: 'fixing_bug',
      refactoring: 'refactoring',
      test_change: 'testing',
      dependency_change: 'dependency_management',
      config_change: 'configuring',
      documentation: 'exploring',
      style_change: 'cleaning_up',
      deletion: 'cleaning_up',
      rename: 'refactoring',
      infrastructure: 'configuring',
    };

    return typeToIntent[semanticType] ?? 'unknown';
  }

  /** Compute change magnitude (0-1) */
  private computeMagnitude(filePath: string, changeType: 'create' | 'modify' | 'delete' | 'rename'): number {
    if (changeType === 'create') return 0.8; // New file = significant
    if (changeType === 'delete') return 0.9; // Deletion = very significant
    if (changeType === 'rename') return 0.3; // Rename = moderate

    // For modifications, we'd ideally compare diff size
    // Without diff analysis, use a default moderate magnitude
    return 0.5;
  }

  /** Compute a human-readable diff summary */
  private computeDiffSummary(filePath: string, changeType: 'create' | 'modify' | 'delete' | 'rename'): string {
    const fileName = path.basename(filePath);
    switch (changeType) {
      case 'create': return `Created ${fileName}`;
      case 'delete': return `Deleted ${fileName}`;
      case 'rename': return `Renamed ${fileName}`;
      case 'modify': return `Modified ${fileName}`;
    }
  }

  /** Detect affected symbols (simplified) */
  private detectAffectedSymbols(filePath: string, changeType: 'create' | 'modify' | 'delete' | 'rename'): string[] {
    // In a full implementation, we'd parse the diff and extract changed symbols
    // For now, return the file path as the only "symbol"
    return [path.basename(filePath, path.extname(filePath))];
  }

  /** Compute confidence of intent inference */
  private computeIntentConfidence(semanticType: SemanticChangeType, intent: InferredEditIntent): number {
    // High confidence for clear mappings
    const highConfidence: [SemanticChangeType, InferredEditIntent][] = [
      ['test_change', 'testing'],
      ['dependency_change', 'dependency_management'],
      ['config_change', 'configuring'],
      ['infrastructure', 'configuring'],
      ['documentation', 'exploring'],
    ];

    if (highConfidence.some(([st, i]) => st === semanticType && i === intent)) {
      return 0.9;
    }

    // Medium confidence for probable mappings
    if (semanticType === 'feature_addition' && intent === 'implementing_feature') return 0.7;
    if (semanticType === 'bug_fix' && intent === 'fixing_bug') return 0.75;

    // Low confidence for unknown
    if (intent === 'unknown') return 0.3;

    return 0.5;
  }

  // ─── Batching ────────────────────────────────────────────────────────

  /** Add a change to the current batch */
  private addToBatch(change: SemanticFileChange): void {
    // Find an active batch for this file's vicinity
    let batch: ChangeBatch | null = null;

    for (const [batchId, b] of this.activeBatches) {
      if (b.isActive) {
        // Add to existing batch if same intent or within time window
        batch = b;
        break;
      }
    }

    if (!batch) {
      // Create new batch
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      batch = {
        id: batchId,
        changes: [],
        startedAt: Date.now(),
        completedAt: null,
        intent: change.inferredIntent,
        affectedFiles: [],
        isActive: true,
      };
      this.activeBatches.set(batchId, batch);
    }

    // Add change to batch
    change.isBatchPart = true;
    change.batchId = batch.id;
    batch.changes.push(change);
    if (!batch.affectedFiles.includes(change.filePath)) {
      batch.affectedFiles.push(change.filePath);
    }

    // Update batch intent (most common intent wins)
    if (batch.changes.length > 1) {
      const intentCounts: Record<string, number> = {};
      for (const c of batch.changes) {
        intentCounts[c.inferredIntent] = (intentCounts[c.inferredIntent] ?? 0) + 1;
      }
      batch.intent = Object.entries(intentCounts)
        .sort(([, a], [, b]) => b - a)[0][0] as InferredEditIntent;
    }

    // Check if batch should be completed
    if (batch.changes.length >= this.config.maxBatchSize) {
      this.completeBatch(batch.id);
      return;
    }

    // Reset the batch timer
    const existingTimer = this.batchTimers.get(batch.id);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      this.completeBatch(batch!.id);
    }, this.config.batchDebounceTime);
    this.batchTimers.set(batch.id, timer);

    // Also enforce max duration
    if (Date.now() - batch.startedAt > this.config.maxBatchDuration) {
      this.completeBatch(batch.id);
    }
  }

  /** Complete a batch and emit the event */
  private completeBatch(batchId: string): void {
    const batch = this.activeBatches.get(batchId);
    if (!batch || !batch.isActive) return;

    batch.isActive = false;
    batch.completedAt = Date.now();

    // Clear timer
    const timer = this.batchTimers.get(batchId);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(batchId);
    }

    // Update metrics
    this.metrics.batchesCompleted++;
    const prevAvg = this.metrics.avgBatchSize;
    this.metrics.avgBatchSize = prevAvg === 0
      ? batch.changes.length
      : (prevAvg * 0.9 + batch.changes.length * 0.1);

    // Emit batch event
    this.emit('batch:completed', batch);
    this.emit(`batch:${batch.intent}`, batch);

    // Record pattern in session memory
    if (this.sessionMemory && batch.changes.length >= 3) {
      this.sessionMemory.observePattern(
        'workflow',
        `${batch.intent}: ${batch.affectedFiles.length} files`,
        batch.affectedFiles.join(', '),
      );
    }

    // Remove from active
    this.activeBatches.delete(batchId);

    logger.debug('workspace-observer', `Batch completed: ${batch.changes.length} changes, intent: ${batch.intent}`);
  }

  // ─── Ignore Logic ────────────────────────────────────────────────────

  /** Check if a file should be ignored */
  private shouldIgnore(relativePath: string): boolean {
    return this.config.ignorePatterns.some(pattern =>
      relativePath.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  // ─── Metrics ─────────────────────────────────────────────────────────

  /** Record a change in metrics */
  private recordChange(change: SemanticFileChange): void {
    this.metrics.totalChanges++;
    this.metrics.changesByType[change.semanticType] = (this.metrics.changesByType[change.semanticType] ?? 0) + 1;
    this.metrics.changesByIntent[change.inferredIntent] = (this.metrics.changesByIntent[change.inferredIntent] ?? 0) + 1;
    this.metrics.lastChangeAt = Date.now();
    this.metrics.activeBatches = this.activeBatches.size;

    // Track for events per minute
    this.changeTimestamps.push(Date.now());
    const oneMinuteAgo = Date.now() - 60_000;
    this.changeTimestamps = this.changeTimestamps.filter(t => t > oneMinuteAgo);
    this.metrics.eventsPerMinute = this.changeTimestamps.length;

    // Store in recent changes
    this.recentChanges.push(change);
    if (this.recentChanges.length > this.MAX_RECENT_CHANGES) {
      this.recentChanges = this.recentChanges.slice(-this.MAX_RECENT_CHANGES);
    }
  }

  /** Get current metrics */
  getMetrics(): ObserverMetrics {
    return { ...this.metrics };
  }

  /** Get recent changes */
  getRecentChanges(limit: number = 20): SemanticFileChange[] {
    return this.recentChanges.slice(-limit);
  }

  /** Get active batches */
  getActiveBatches(): ChangeBatch[] {
    return Array.from(this.activeBatches.values());
  }

  /** Force-complete all active batches */
  flushBatches(): void {
    for (const batchId of this.activeBatches.keys()) {
      this.completeBatch(batchId);
    }
  }

  /** Get the current dominant user intent based on recent changes */
  getCurrentIntent(): InferredEditIntent {
    if (this.recentChanges.length === 0) return 'unknown';

    const recent = this.recentChanges.slice(-10);
    const intentCounts: Record<string, number> = {};
    for (const change of recent) {
      intentCounts[change.inferredIntent] = (intentCounts[change.inferredIntent] ?? 0) + 1;
    }

    const sorted = Object.entries(intentCounts).sort(([, a], [, b]) => b - a);
    return (sorted[0]?.[0] ?? 'unknown') as InferredEditIntent;
  }
}

// ─── Module-level singleton ──────────────────────────────────────────────────

let workspaceObserver: WorkspaceObserver | null = null;

export function getWorkspaceObserver(esm?: ExecutionStateMachine, workspaceRoot?: string, config?: Partial<WorkspaceObserverConfig>): WorkspaceObserver {
  if (!workspaceObserver && esm && workspaceRoot) {
    workspaceObserver = new WorkspaceObserver(esm, workspaceRoot, config);
  }
  if (!workspaceObserver) {
    throw new Error('WorkspaceObserver not initialized — call getWorkspaceObserver(esm, workspaceRoot) first');
  }
  return workspaceObserver;
}

export function resetWorkspaceObserver(esm: ExecutionStateMachine, workspaceRoot: string, config?: Partial<WorkspaceObserverConfig>): WorkspaceObserver {
  workspaceObserver = new WorkspaceObserver(esm, workspaceRoot, config);
  return workspaceObserver;
}
