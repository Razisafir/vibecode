// ============================================================
// VibeCode Desktop — Zod Schemas Export
// Central schema definitions for validation across the app
// ============================================================

import { z } from 'zod';

// ─── Provider Schemas ────────────────────────────────────────────────────────

export const ModelInfoSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  contextWindow: z.number().int().min(0),
  supportsStreaming: z.boolean(),
  supportsTools: z.boolean(),
  supportsVision: z.boolean(),
});

export const ProviderConfigSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['openai', 'anthropic', 'google', 'ollama', 'lmstudio', 'custom']),
  apiKey: z.string().max(500).optional(),
  baseUrl: z.string().url().max(500).optional(),
  models: z.array(ModelInfoSchema).optional(),
  priority: z.number().min(0).max(100).optional(),
  chatOptions: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(1).max(1000000).optional(),
    streaming: z.boolean().optional(),
    model: z.string().max(200).optional(),
  }).optional(),
});

export const ProviderUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['openai', 'anthropic', 'google', 'ollama', 'lmstudio', 'custom']).optional(),
  apiKey: z.string().max(500).optional(),
  baseUrl: z.string().url().max(500).optional(),
  models: z.array(ModelInfoSchema).optional(),
  priority: z.number().min(0).max(100).optional(),
  chatOptions: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(1).max(1000000).optional(),
    streaming: z.boolean().optional(),
    model: z.string().max(200).optional(),
  }).optional(),
});

// ─── Execution Step Schemas ───────────────────────────────────────────────────

export const StepInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  type: z.enum([
    'file_write', 'file_read', 'file_edit', 'command',
    'code_edit', 'code_generation', 'diff_apply',
    'analysis', 'generation', 'review',
  ]),
  params: z.record(z.unknown()),
  dependsOn: z.array(z.string()).optional(),
  maxRetries: z.number().min(0).max(10).optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  requiresApproval: z.boolean().optional(),
});

export const PlanInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  steps: z.array(StepInputSchema).min(1).max(100),
});

// ─── Chat Message Schema ─────────────────────────────────────────────────────

export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().max(100000),
  name: z.string().max(100).optional(),
  toolCallId: z.string().max(100).optional(),
});

export const ChatCompletionOptionsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(1000000).optional(),
  topP: z.number().min(0).max(1).optional(),
  stop: z.array(z.string()).max(10).optional(),
  stream: z.boolean().optional(),
  tools: z.array(z.unknown()).max(50).optional(),
});

// ─── Memory Entry Schema ─────────────────────────────────────────────────────

export const MemoryEntryInputSchema = z.object({
  projectId: z.string().min(1).max(200),
  type: z.enum(['conversation', 'decision', 'preference', 'fact', 'context', 'error', 'success']),
  content: z.string().min(1).max(50000),
  summary: z.string().max(1000).optional(),
  importance: z.number().min(0).max(1),
  tags: z.array(z.string().max(50)).max(20),
  relatedIds: z.array(z.string()).max(50),
  metadata: z.record(z.unknown()).optional(),
});

export const MemoryUpdateSchema = z.object({
  content: z.string().min(1).max(50000).optional(),
  summary: z.string().max(1000).optional(),
  importance: z.number().min(0).max(1).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  relatedIds: z.array(z.string()).max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
  type: z.enum(['conversation', 'decision', 'preference', 'fact', 'context', 'error', 'success']).optional(),
});

// ─── Session State Schema ────────────────────────────────────────────────────

export const SessionStateSchema = z.object({
  id: z.string().min(1).max(200),
  projectId: z.string().min(1).max(200),
  workspace: z.object({
    openFiles: z.array(z.string().max(500)),
    activeFile: z.string().max(500).optional(),
    scrollPositions: z.record(z.number()),
  }),
  conversation: z.object({
    messages: z.array(z.unknown()),
    activeProvider: z.string().max(200),
    activeModel: z.string().max(200),
  }),
  execution: z.object({
    activePlan: z.unknown().optional(),
    runningTasks: z.array(z.string()),
    completedTasks: z.array(z.string()),
  }),
  layout: z.object({
    sidebarOpen: z.boolean(),
    sidebarWidth: z.number().min(100).max(2000),
    aiPanelOpen: z.boolean(),
    aiPanelWidth: z.number().min(100).max(2000),
    activeSidebarTab: z.string().max(50),
  }),
  lastSaved: z.number(),
  createdAt: z.number(),
});

export const EnhancedSessionStateSchema = SessionStateSchema.extend({
  execution: z.object({
    activePlan: z.unknown().optional(),
    runningTasks: z.array(z.string()),
    completedTasks: z.array(z.string()),
    activePlans: z.array(z.object({
      planId: z.string(),
      status: z.string(),
      currentStepIndex: z.number(),
      startedAt: z.number(),
    })),
    recentPlans: z.array(z.object({
      planId: z.string(),
      title: z.string(),
      status: z.string(),
      completedAt: z.number().optional(),
    })),
    proposalQueue: z.array(z.string()),
  }),
  conversation: z.object({
    messages: z.array(z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
      timestamp: z.number(),
      metadata: z.object({
        provider: z.string().optional(),
        model: z.string().optional(),
        proposalIds: z.array(z.string()).optional(),
        error: z.string().optional(),
      }).optional(),
    })),
    activeProvider: z.string(),
    activeModel: z.string(),
  }),
  layout: SessionStateSchema.shape.layout.extend({
    workspacePanel: z.enum(['editor', 'terminal', 'welcome']).optional(),
  }),
  workspace: z.object({
    rootPath: z.string(),
    openFiles: z.array(z.string()),
    activeFile: z.string().optional(),
    scrollPositions: z.record(z.number()),
    expandedFolders: z.array(z.string()),
    recentFiles: z.array(z.string()),
  }),
  recovery: z.object({
    lastCrashed: z.boolean(),
    crashCount: z.number(),
    lastCrashReason: z.string().optional(),
    safeShutdown: z.boolean(),
  }),
});

// ─── Workspace Path Schema ───────────────────────────────────────────────────

export const WorkspacePathSchema = z.string().min(1).max(500);

// ─── ID Schema ───────────────────────────────────────────────────────────────

export const IdSchema = z.string().min(1).max(200);

// ─── Proposal Modification Schema ────────────────────────────────────────────

export const StepUpdateSchema = z.object({
  stepIndex: z.number().int().min(0),
  updates: z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(1000).optional(),
    params: z.record(z.unknown()).optional(),
    riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  }),
});

export const ProposalModificationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(1000).optional(),
  stepUpdates: z.array(StepUpdateSchema).max(100).optional(),
});

// ─── Route Requirements Schema ───────────────────────────────────────────────

export const RouteRequirementsSchema = z.object({
  requiresStreaming: z.boolean().optional(),
  requiresTools: z.boolean().optional(),
  requiresVision: z.boolean().optional(),
  minContextWindow: z.number().int().min(0).optional(),
  preferredType: z.enum(['openai', 'anthropic', 'google', 'ollama', 'lmstudio', 'custom']).optional(),
});

// ─── Chat Options Schema ─────────────────────────────────────────────────────

export const ChatOptionsUpdateSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(1000000).optional(),
  streaming: z.boolean().optional(),
  model: z.string().max(200).optional(),
});
