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
    list(): Promise<Provider[]>;
    configure(config: Partial<Provider>): Promise<{ success: boolean }>;
    test(id: string): Promise<{ success: boolean; latency: number }>;
    route(requirements: Record<string, unknown>): Promise<Provider>;
    chat(
      providerId: string,
      model: string,
      messages: ChatMessage[],
      options?: ChatOptions,
    ): Promise<void>;
    models(id: string): Promise<ModelInfo[]>;
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
  };
  execution: {
    plan(title: string, description: string, steps: Omit<ExecutionStep, 'id' | 'planId' | 'retryCount'>[]): Promise<ExecutionPlan>;
    execute(planId: string): Promise<ExecutionPlan>;
    status(planId: string): Promise<ExecutionPlan>;
    cancel(planId: string): Promise<void>;
    retry(stepId: string): Promise<ExecutionStep>;
    history(projectId?: string): Promise<ExecutionPlan[]>;
    propose(step: Partial<ExecutionStep>): Promise<ProposalCard>;
    onStatus(callback: (status: ExecutionPlan) => void): void;
  };
  workspace: {
    analyze(path: string): Promise<WorkspaceAnalysis>;
    open(path: string): Promise<void>;
    close(): Promise<void>;
  };
  app: {
    getVersion(): Promise<string>;
    quit(): void;
    minimize(): void;
    maximize(): void;
    close(): void;
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
  error?: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  systemPrompt?: string;
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
  latency: number;
  priority: number;
}

export type ProviderType = 'openai' | 'anthropic' | 'google' | 'local' | 'custom';

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

// ---- Global Window Declaration ----

declare global {
  interface Window {
    vibecode: VibeCodeAPI;
  }
}

export {};
