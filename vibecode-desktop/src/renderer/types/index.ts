// ============================================================
// VibeCode Desktop — TypeScript Type Definitions
// ============================================================

// ---- Window API (exposed via preload script) ----

export interface VibeCodeAPI {
  fs: {
    readFile(path: string): Promise<{ success: boolean; data?: string; error?: string }>;
    writeFile(path: string, content: string): Promise<{ success: boolean; error?: string }>;
    listDir(path: string): Promise<{ success: boolean; data?: FileInfo[]; error?: string }>;
    watch(path: string, callback: (event: string, file: string) => void): void;
    stat(path: string): Promise<{ success: boolean; data?: FileStats; error?: string }>;
    mkdir(path: string): Promise<{ success: boolean; error?: string }>;
    delete(path: string): Promise<{ success: boolean; error?: string }>;
    rename(oldPath: string, newPath: string): Promise<{ success: boolean; error?: string }>;
  };
  terminal: {
    create(cwd?: string): Promise<{ success: boolean; id?: string; error?: string }>;
    write(id: string, data: string): Promise<{ success: boolean }>;
    kill(id: string): Promise<{ success: boolean }>;
    resize(id: string, cols: number, rows: number): Promise<{ success: boolean }>;
    onData(callback: (id: string, data: string) => void): void;
  };
  provider: {
    list(): Promise<{ success: boolean; data?: { providers: Provider[] }; error?: string }>;
    configure(config: Partial<ProviderConfig>): Promise<{ success: boolean; data?: { provider: Provider }; error?: string }>;
    update(id: string, updates: Partial<ProviderConfig>): Promise<{ success: boolean; data?: { provider: Provider }; error?: string }>;
    remove(id: string): Promise<{ success: boolean; data?: { removed: boolean; providerId: string }; error?: string }>;
    test(id: string): Promise<{ success: boolean; data?: { success: boolean; latency: number }; error?: string }>;
    route(requirements: Record<string, unknown>): Promise<{ success: boolean; data?: { provider: Provider }; error?: string }>;
    chat(
      providerId: string,
      model: string,
      messages: ChatMessage[],
      options?: ChatOptions,
    ): Promise<{ success: boolean; data?: { content: string; providerId: string; model: string }; error?: string }>;
    models(id: string): Promise<{ success: boolean; data?: { models: ModelInfo[] }; error?: string }>;
    setActive(id: string): Promise<{ success: boolean; data?: { id: string; active: boolean }; error?: string }>;
    getActive(): Promise<{ success: boolean; data?: { provider: Provider | null }; error?: string }>;
    setFallback(id: string): Promise<{ success: boolean; data?: { id: string; fallback: boolean }; error?: string }>;
    getConfig(id: string): Promise<{ success: boolean; data?: { config: Record<string, unknown> }; error?: string }>;
    getChatOptions(id: string): Promise<{ success: boolean; data?: { chatOptions: ChatOptions }; error?: string }>;
    setChatOptions(id: string, options: Partial<ChatOptions>): Promise<{ success: boolean; data?: { id: string; chatOptions: ChatOptions }; error?: string }>;
    onStream(callback: (chunk: string) => void): void;
  };
  memory: {
    store(entry: Omit<MemoryEntry, 'id' | 'timestamp' | 'lastAccessed' | 'accessCount'>): Promise<MemoryEntry>;
    retrieve(id: string): Promise<MemoryEntry | null>;
    search(query: string, projectId?: string, limit?: number): Promise<MemoryEntry[]>;
    rank(query: string, memories: MemoryEntry[]): Promise<MemoryEntry[]>;
    delete(id: string): Promise<boolean>;
    list(projectId: string): Promise<MemoryEntry[]>;
    summarize(projectId: string): Promise<string>;
    update(id: string, updates: Partial<MemoryEntry>): Promise<MemoryEntry | null>;
  };
  session: {
    save(state: SessionState): Promise<void>;
    restore(sessionId: string): Promise<SessionState | null>;
    list(): Promise<SessionState[]>;
    delete(sessionId: string): Promise<boolean>;
    getLatest(projectId: string): Promise<SessionState | null>;
    saveEnhanced(state: EnhancedSessionState): Promise<void>;
    restoreEnhanced(sessionId: string): Promise<EnhancedSessionState | null>;
    wasCrashed(): Promise<boolean>;
    getRecoverySession(): Promise<EnhancedSessionState | null>;
    getRecoveryInfo(): Promise<RecoveryInfo>;
    markSafeShutdown(): Promise<void>;
    createEnhanced(projectId: string, rootPath?: string): Promise<EnhancedSessionState>;
    autoSaveEnhanced(state: EnhancedSessionState, interval?: number): Promise<void>;
    stopAutoSaveEnhanced(sessionId: string): Promise<void>;
    updateEnhancedState(state: EnhancedSessionState): Promise<void>;
    archiveCrashedSession(sessionId: string): Promise<boolean>;
  };
  execution: {
    plan(title: string, description: string, steps: any[]): Promise<{ success: boolean; data?: { plan: ExecutionPlan }; error?: string }>;
    execute(planId: string): Promise<{ success: boolean; data?: { plan: ExecutionPlan }; error?: string }>;
    status(planId: string): Promise<{ success: boolean; data?: { plan: { id: string; title: string; description: string; status: string; createdAt: number; updatedAt: number }; steps: Array<{ id: string; title: string; type: string; status: string; riskLevel: RiskLevel; requiresApproval: boolean; error?: string; retryCount: number; startedAt?: number; completedAt?: number }>; progress: { total: number; completed: number; failed: number; running: number; pending: number } }; error?: string }>;
    cancel(planId: string): Promise<{ success: boolean; data?: { plan: ExecutionPlan | null }; error?: string }>;
    retry(stepId: string): Promise<{ success: boolean; data?: { step: ExecutionStep }; error?: string }>;
    history(planId: string): Promise<{ success: boolean; data?: { history: any[]; planId: string }; error?: string }>;
    propose(title: string, description: string, steps: any[]): Promise<{ success: boolean; data?: { plan: ExecutionPlan }; error?: string }>;
    approve(planId: string): Promise<{ success: boolean; data?: { plan: ExecutionPlan }; error?: string }>;
    getPlan(planId: string): Promise<{ success: boolean; data?: { plan: ExecutionPlan }; error?: string }>;
    getStep(stepId: string): Promise<{ success: boolean; data?: { step: ExecutionStep }; error?: string }>;
    executeStep(stepId: string): Promise<{ success: boolean; data?: { step: ExecutionStep }; error?: string }>;
    detectBlockers(planId: string): Promise<{ success: boolean; data?: { blockers: ExecutionStep[]; count: number }; error?: string }>;
    rollbackStep(stepId: string): Promise<{ success: boolean; data?: { step: ExecutionStep | null }; error?: string }>;
    rollbackPlan(planId: string): Promise<{ success: boolean; data?: { plan: ExecutionPlan | null }; error?: string }>;
    listPlans(): Promise<{ success: boolean; data?: { plans: any[]; total: number }; error?: string }>;
    deletePlan(planId: string): Promise<{ success: boolean; data?: { deleted: boolean; planId: string }; error?: string }>;
    setWorkspace(workspaceRoot: string): Promise<{ success: boolean; data?: { workspaceRoot: string }; error?: string }>;
    onStatus(callback: (status: any) => void): void;
    onStepUpdate(callback: (update: any) => void): void;
    /** Get diff preview for a single step */
    getDiff(stepId: string): Promise<{ success: boolean; data?: DiffResult; error?: string }>;
    /** Get diff previews for all file-related steps in a plan */
    getPlanDiffs(planId: string): Promise<{ success: boolean; data?: { diffs: DiffResult[] }; error?: string }>;
    /** Get full step result including stdout for command steps */
    getStepResult(stepId: string): Promise<{ success: boolean; data?: { step: ExecutionStep; output?: StepOutput }; error?: string }>;
    /** Get truncated stdout/stderr for command steps */
    getStepOutput(stepId: string): Promise<{ success: boolean; data?: StepOutput; error?: string }>;
    /** Queue operations */
    queue: {
      list(): Promise<{ success: boolean; data?: { entries: ExecutionQueueEntry[] }; error?: string }>;
      add(planId: string, priority?: number, stepTimeout?: number): Promise<{ success: boolean; data?: ExecutionQueueEntry; error?: string }>;
      cancel(entryId: string): Promise<{ success: boolean; data?: { cancelled: boolean }; error?: string }>;
    };
    /** Get all completed execution history */
    getHistory(): Promise<{ success: boolean; data?: { history: ExecutionHistoryEntry[] }; error?: string }>;
    /** Queue update events */
    onQueueUpdate(callback: (update: any) => void): void;
  };
  workspace: {
    analyze(path: string): Promise<WorkspaceAnalysis>;
    open(path: string): Promise<{ success: boolean; data?: { canceled?: boolean; workspace?: WorkspaceInfo }; error?: string }>;
    close(): Promise<{ success: boolean; data?: { closed: boolean }; error?: string }>;
    recent(limit?: number): Promise<{ success: boolean; data?: { workspaces: RecentWorkspaceInfo[] }; error?: string }>;
    addRecent(path: string, name?: string, type?: string): Promise<{ success: boolean; data?: { workspace: RecentWorkspaceInfo }; error?: string }>;
    removeRecent(path: string): Promise<{ success: boolean; data?: { removed: boolean; path: string }; error?: string }>;
    switchWorkspace(path: string): Promise<{ success: boolean; data?: { workspace: WorkspaceInfo }; error?: string }>;
    getInfo(): Promise<{ success: boolean; data?: { workspace: CurrentWorkspaceInfo | null }; error?: string }>;
    searchFiles(pattern: string, maxResults?: number): Promise<{ success: boolean; data?: { files: FileSearchResult[] }; error?: string }>;
    fuzzySearch(query: string, maxResults?: number): Promise<{ success: boolean; data?: { files: FileSearchResult[] }; error?: string }>;
  };
  proposal: {
    generateFromResponse(response: string, context?: { workspaceRoot?: string; projectId?: string }): Promise<{ success: boolean; data?: { intents: ExecutionIntent[]; proposals: ProposalCardData[] }; error?: string }>;
    approveAndExecute(planId: string): Promise<{ success: boolean; data?: { plan: ExecutionPlan }; error?: string }>;
    reject(planId: string, reason?: string): Promise<{ success: boolean; data?: { planId: string; rejected: boolean }; error?: string }>;
    modify(planId: string, modifications: ProposalModification): Promise<{ success: boolean; data?: { plan: ExecutionPlan }; error?: string }>;
    list(): Promise<{ success: boolean; data?: { proposals: ProposalCardData[]; total: number }; error?: string }>;
    get(proposalId: string): Promise<{ success: boolean; data?: { proposal: ProposalCardData }; error?: string }>;
    onUpdate(callback: (update: ProposalUpdateEvent) => void): void;
  };
  app: {
    getVersion(): Promise<string>;
    quit(): void;
    minimize(): void;
    maximize(): void;
    close(): void;
  };
  telemetry: {
    getMetrics(): Promise<{ success: boolean; data?: TelemetryMetrics; error?: string }>;
    getRecentLogs(count?: number, level?: string): Promise<{ success: boolean; data?: { logs: LogEntry[] }; error?: string }>;
    getCrashDumps(): Promise<{ success: boolean; data?: { dumps: CrashDump[] }; error?: string }>;
    sendHeartbeat(data?: { fps?: number }): Promise<{ success: boolean; data?: { received: boolean }; error?: string }>;
    clearCrashDumps(): Promise<{ success: boolean; data?: { cleared: boolean }; error?: string }>;
  };
  updater: {
    check(force?: boolean): Promise<{ success: boolean; data?: { status: UpdateStatus }; error?: string }>;
    download(): Promise<{ success: boolean; data?: { status: UpdateStatus }; error?: string }>;
    cancel(): Promise<{ success: boolean; data?: { cancelled: boolean }; error?: string }>;
    install(): Promise<{ success: boolean; data?: { installing: boolean }; error?: string }>;
    status(): Promise<{ success: boolean; data?: { status: UpdateStatus }; error?: string }>;
    setChannel(channel: UpdateChannel): Promise<{ success: boolean; data?: { channel: UpdateChannel }; error?: string }>;
    onAvailable(callback: (info: any) => void): void;
    onNotAvailable(callback: (info: any) => void): void;
    onProgress(callback: (progress: UpdateProgress) => void): void;
    onDownloaded(callback: (info: any) => void): void;
    onError(callback: (error: any) => void): void;
  };
  analytics: {
    getConfig(): Promise<{ success: boolean; data?: { config: AnalyticsConfig }; error?: string }>;
    grantConsent(options?: Partial<AnalyticsConsentOptions>): Promise<{ success: boolean; data?: { config: AnalyticsConfig }; error?: string }>;
    revokeConsent(): Promise<{ success: boolean; data?: { config: AnalyticsConfig }; error?: string }>;
    updateConfig(updates: Partial<AnalyticsConsentOptions>): Promise<{ success: boolean; data?: { config: AnalyticsConfig }; error?: string }>;
    getMetrics(): Promise<{ success: boolean; data?: { metrics: UsageMetrics }; error?: string }>;
    getPendingEvents(): Promise<{ success: boolean; data?: { events: any[] }; error?: string }>;
    trackFeature(feature: string): Promise<{ success: boolean }>;
  };
}

// ---- Chat ----

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: ChatMessageMetadata;
}

export interface ChatMessageMetadata {
  provider?: string;
  model?: string;
  latency?: number;
  tokenCount?: number;
  proposalId?: string;
  proposalIds?: string[];
  error?: string;
}

export interface ChatOptions {
  temperature: number;
  maxTokens: number;
  streaming: boolean;
  model?: string;
}

// ---- Memory ----

export interface MemoryEntry {
  id: string;
  projectId: string;
  type: MemoryType;
  content: string;
  summary?: string;
  importance: number;
  tags: string[];
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  relatedIds: string[];
}

export type MemoryType = 'conversation' | 'decision' | 'preference' | 'fact' | 'pattern' | 'error';

// ---- Provider ----

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  models: ModelInfo[];
  isAvailable: boolean;
  lastChecked: number;
  latency: number;
  priority: number;
  isActive?: boolean;
  isFallback?: boolean;
  chatOptions?: ChatOptions;
}

export type ProviderType = 'openai' | 'anthropic' | 'google' | 'ollama' | 'lmstudio' | 'custom';

export interface ProviderConfig {
  name: string;
  type: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  models?: ModelInfo[];
  priority?: number;
  chatOptions?: ChatOptions;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
}

// ---- Execution ----

export interface ExecutionPlan {
  id: string;
  title: string;
  description: string;
  steps: ExecutionStep[];
  status: ExecutionStatus;
  createdAt: number;
  updatedAt: number;
}

export interface ExecutionStep {
  id: string;
  planId: string;
  title: string;
  description: string;
  type: StepType;
  status: ExecutionStatus;
  dependsOn: string[];
  params: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  retryCount: number;
  maxRetries: number;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
}

export type StepType = 'file_create' | 'file_edit' | 'file_delete' | 'command' | 'analysis' | 'review' | 'test';
export type ExecutionStatus = 'pending' | 'planning' | 'approved' | 'executing' | 'completed' | 'failed' | 'cancelled';
export type RiskLevel = 'low' | 'medium' | 'high';

// ---- File System ----

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: number;
}

export interface FileStats {
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  modified: number;
  created: number;
}

// ---- File Search ----

export interface FileSearchResult {
  path: string;
  name: string;
  extension: string;
  relativePath: string;
}

// ---- Proposals ----

export interface ProposalCard {
  id: string;
  type: 'file_create' | 'file_edit' | 'command' | 'analysis' | 'plan';
  title: string;
  description: string;
  riskLevel: RiskLevel;
  status: ProposalStatus;
  details: Record<string, unknown>;
  timestamp: number;
}

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';

/** Enhanced proposal card data generated from AI responses */
export interface ProposalCardData {
  id: string;
  type: 'file_create' | 'file_edit' | 'command' | 'analysis' | 'multi_step';
  title: string;
  description: string;
  riskLevel: RiskLevel;
  status: ProposalStatus;
  affectedFiles: AffectedFile[];
  steps: ProposalStepData[];
  estimatedImpact: string;
  canRollback: boolean;
  details: Record<string, unknown>;
  timestamp: number;
  planId?: string;
}

export interface AffectedFile {
  path: string;
  action: 'create' | 'edit' | 'delete';
  description: string;
}

export interface ProposalStepData {
  type: 'file_write' | 'file_edit' | 'command' | 'code_generation' | 'diff_apply';
  title: string;
  description: string;
  params: Record<string, unknown>;
  riskLevel: RiskLevel;
  dependsOn?: string[];
}

/** Intent extracted from an LLM response */
export interface ExecutionIntent {
  id: string;
  type: 'file_create' | 'file_edit' | 'command' | 'analysis' | 'multi_step';
  title: string;
  description: string;
  files: AffectedFile[];
  steps: ProposalStepData[];
  riskLevel: RiskLevel;
  estimatedImpact: string;
  canRollback: boolean;
}

/** Modification input for proposal:modify IPC */
export interface ProposalModification {
  title?: string;
  description?: string;
  stepUpdates?: Array<{
    stepIndex: number;
    updates: Partial<{
      title: string;
      description: string;
      params: Record<string, unknown>;
      riskLevel: RiskLevel;
    }>;
  }>;
}

/** Event sent via proposal:onUpdate */
export interface ProposalUpdateEvent {
  event: string;
  planIds: string[];
  timestamp: number;
}

// ---- Session ----

export interface SessionState {
  id: string;
  projectId: string;
  workspace: WorkspaceState;
  conversation: ConversationState;
  execution: ExecutionState;
  layout: LayoutState;
  lastSaved: number;
  createdAt: number;
}

export interface EnhancedSessionState extends SessionState {
  execution: ExecutionState & {
    activePlans: Array<ActivePlanInfo>;
    recentPlans: Array<RecentPlanInfo>;
    proposalQueue: string[];
  };

  conversation: ConversationState & {
    messages: Array<EnhancedChatMessage>;
  };

  layout: LayoutState & {
    workspacePanel?: 'editor' | 'terminal' | 'welcome';
  };

  workspace: WorkspaceState & {
    rootPath: string;
    expandedFolders: string[];
    recentFiles: string[];
  };

  recovery: RecoveryState;
}

export interface ActivePlanInfo {
  planId: string;
  status: string;
  currentStepIndex: number;
  startedAt: number;
}

export interface RecentPlanInfo {
  planId: string;
  title: string;
  status: string;
  completedAt?: number;
}

export interface EnhancedChatMessage extends ChatMessage {
  metadata?: ChatMessageMetadata & {
    proposalIds?: string[];
  };
}

export interface RecoveryState {
  lastCrashed: boolean;
  crashCount: number;
  lastCrashReason?: string;
  safeShutdown: boolean;
}

export interface CrashInfo {
  sessionId: string;
  reason: string;
  timestamp: number;
  activePlans: ActivePlanInfo[];
  unsavedChanges: boolean;
}

export interface RecoveryInfo {
  hasCrashedSession: boolean;
  crashInfo?: CrashInfo;
  sessionId?: string;
}

export interface WorkspaceState {
  openFiles: string[];
  activeFile?: string;
  scrollPositions: Record<string, number>;
}

export interface ConversationState {
  messages: ChatMessage[];
  activeProvider: string;
  activeModel: string;
}

export interface ExecutionState {
  activePlan?: ExecutionPlan;
  runningTasks: string[];
  completedTasks: string[];
}

export interface LayoutState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  aiPanelOpen: boolean;
  aiPanelWidth: number;
  activeSidebarTab: SidebarTab;
}

// ---- Sidebar ----

export type SidebarTab = 'files' | 'terminal' | 'memory' | 'settings';

// ---- Workspace ----

export interface WorkspaceAnalysis {
  path: string;
  type: string;
  languages: Record<string, number>;
  framework?: string;
  fileCount: number;
  totalSize: number;
}

/** Full workspace info returned by workspace:open and workspace:analyze */
export interface WorkspaceInfo {
  rootPath: string;
  name: string;
  type: 'node' | 'python' | 'rust' | 'go' | 'java' | 'generic';
  hasGit: boolean;
  hasPackageJson: boolean;
  hasReadme: boolean;
  files: string[];
  directories: string[];
  languages: Record<string, number>;
  totalFiles: number;
  totalSize: number;
}

/** Current workspace info (lighter version) */
export interface CurrentWorkspaceInfo {
  rootPath: string;
  name: string;
  type: 'node' | 'python' | 'rust' | 'go' | 'java' | 'generic';
  hasGit: boolean;
  totalFiles: number;
  languages: Record<string, number>;
}

/** Recent workspace entry from workspace store */
export interface RecentWorkspaceInfo {
  path: string;
  name: string;
  lastOpened: number;
  projectType: 'node' | 'python' | 'rust' | 'go' | 'java' | 'generic';
}

// ---- Command Palette ----

export interface Command {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  action: () => void;
}

// ---- Onboarding ----

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  illustration: string;
}

// ---- Terminal ----

export interface TerminalInstance {
  id: string;
  cwd: string;
  history: string[];
  active: boolean;
}

// ---- Diff Engine ----

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  lineNumber: number;
  /** Line number in the "before" file for remove/context lines */
  oldLineNumber?: number;
  /** Line number in the "after" file for add/context lines */
  newLineNumber?: number;
}

export interface DiffResult {
  filePath: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
}

// ---- Execution Queue ----

export interface ExecutionQueueEntry {
  id: string;
  planId: string;
  title: string;
  description: string;
  priority: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  addedAt: number;
  startedAt?: number;
  completedAt?: number;
  stepTimeout: number;
}

export interface ExecutionHistoryEntry {
  planId: string;
  title: string;
  description: string;
  status: string;
  stepCount: number;
  completedSteps: number;
  failedSteps: number;
  createdAt: number;
  completedAt?: number;
  duration?: number;
  stepSummaries: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    duration?: number;
    error?: string;
  }>;
}

export interface StepOutput {
  stepId: string;
  planId: string;
  title: string;
  type: string;
  status: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration?: number;
  truncated: boolean;
}

// ---- Telemetry ----

export interface TelemetryMetrics {
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
  };
  execution: {
    activePlans: number;
    completedPlans: number;
    failedPlans: number;
    avgDuration: number;
  };
  ipc: {
    avgLatency: number;
    p95Latency: number;
    totalCalls: number;
  };
  cache: {
    hitRate: number;
    size: number;
    evictions: number;
  };
  timestamps: {
    lastUpdated: number;
    uptime: number;
  };
}

export interface CrashDump {
  timestamp: number;
  error: {
    message: string;
    stack?: string;
    name: string;
  };
  context?: Record<string, unknown>;
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
  };
  recentIpcCalls: Array<{
    channel: string;
    durationMs: number;
    timestamp: number;
  }>;
  recentExecutionEvents: Array<{
    type: string;
    durationMs?: number;
    timestamp: number;
  }>;
  uptime: number;
  platform: string;
  nodeVersion: string;
  electronVersion: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogCategory = 'ipc' | 'execution' | 'memory' | 'provider' | 'session' | 'workspace' | 'watchdog' | 'crash-dump' | 'telemetry' | 'general';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: LogCategory;
  message: string;
  data?: Record<string, unknown>;
}

// ---- Auto-Update ----

export type UpdateChannel = 'stable' | 'beta' | 'nightly';

export interface UpdateStatus {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  error: string | null;
  progress: UpdateProgress | null;
  info: UpdateInfo | null;
  channel: UpdateChannel;
}

export interface UpdateProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

export interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes?: string;
}

// ---- Analytics ----

export interface AnalyticsConfig {
  enabled: boolean;
  crashReporting: boolean;
  usageMetrics: boolean;
  performanceMetrics: boolean;
  sessionId: string;
  consentDate: number | null;
  consentVersion: string;
}

export interface AnalyticsConsentOptions {
  crashReporting: boolean;
  usageMetrics: boolean;
  performanceMetrics: boolean;
}

export interface UsageMetrics {
  sessionLength: number;
  featureUsage: Record<string, number>;
  executionSuccessRate: number;
  providerPopularity: Record<string, number>;
  averageSessionLength: number;
  totalSessions: number;
  crashFrequency: number;
}

// ---- Global Window Declaration ----

declare global {
  interface Window {
    vibecode: VibeCodeAPI;
  }
}

export {};
