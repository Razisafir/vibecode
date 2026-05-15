// ─── Preload Bridge ──────────────────────────────────────────────────────────
//
// Exposes all IPC APIs to the renderer via window.vibecode.
// Namespaces:
//   vibecode.fs.*         — File system operations
//   vibecode.terminal.*   — Terminal management
//   vibecode.providers.*  — Provider CRUD + streaming chat + test
//   vibecode.memory.*     — Memory vault
//   vibecode.workspace.*  — Workspace operations + analyze
//   vibecode.app.*        — App info
//   vibecode.proposal.*   — Proposal operations
//   vibecode.session.*    — Session management
//   vibecode.execution.*  — [DEPRECATED] Legacy execution engine — routes to sm:*
//   vibecode.updater.*    — Auto-updater
//   vibecode.telemetry.*  — Telemetry & diagnostics
//   vibecode.analytics.*  — Analytics (opt-in)
//   vibecode.sm.*         — Execution State Machine (ARC 12 — single source of truth)
// ─────────────────────────────────────────────────────────────────────────────

import { contextBridge, ipcRenderer } from 'electron';

const vibecode = {
  // ─── File System ───────────────────────────────────────────────────────
  fs: {
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    listDir: (dirPath: string) => ipcRenderer.invoke('fs:listDir', dirPath),
    watch: (filePath: string, callback: (event: string, file: string) => void) => {
      ipcRenderer.send('fs:watch', filePath);
      ipcRenderer.on('fs:watch:change', (_event, changedPath, eventType) => callback(eventType, changedPath));
    },
    stat: (filePath: string) => ipcRenderer.invoke('fs:stat', filePath),
    mkdir: (dirPath: string) => ipcRenderer.invoke('fs:mkdir', dirPath),
    delete: (filePath: string) => ipcRenderer.invoke('fs:delete', filePath),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    setWorkspaceRoot: (rootPath: string) => ipcRenderer.invoke('fs:setWorkspaceRoot', rootPath),
  },

  // ─── Terminal ──────────────────────────────────────────────────────────
  terminal: {
    create: (cwd?: string) => ipcRenderer.invoke('terminal:create', cwd),
    write: (id: string, data: string) => ipcRenderer.invoke('terminal:write', id, data),
    kill: (id: string) => ipcRenderer.invoke('terminal:kill', id),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('terminal:resize', id, cols, rows),
    onData: (callback: (id: string, data: string) => void) => {
      ipcRenderer.on('terminal:data', (_event, id, data) => callback(id, data));
    },
    onExit: (callback: (id: string, exitCode: number, signal?: number | string | null) => void) => {
      ipcRenderer.on('terminal:exit', (_event, id, exitCode, signal) => callback(id, exitCode, signal));
    },
    isAvailable: () => ipcRenderer.invoke('terminal:isAvailable'),
    list: () => ipcRenderer.invoke('terminal:list'),
    getOutput: (id: string) => ipcRenderer.invoke('terminal:getOutput', id),
  },

  // ─── Providers (enhanced with streaming, testing, friendly errors) ─────
  providers: {
    // CRUD
    list: () => ipcRenderer.invoke('provider:list'),
    add: (providerData: any, apiKey?: string) => ipcRenderer.invoke('provider:add', providerData, apiKey),
    configure: (config: any) => ipcRenderer.invoke('provider:configure', config),
    update: (id: string, updates: any, apiKey?: string) => ipcRenderer.invoke('provider:update', id, updates, apiKey),
    remove: (id: string) => ipcRenderer.invoke('provider:remove', id),
    getConfig: (id: string) => ipcRenderer.invoke('provider:getConfig', id),

    // Default / Active / Fallback
    setDefault: (id: string) => ipcRenderer.invoke('provider:setDefault', id),
    getDefault: () => ipcRenderer.invoke('provider:getDefault'),
    setActive: (id: string) => ipcRenderer.invoke('provider:setActive', id),
    getActive: () => ipcRenderer.invoke('provider:getActive'),
    setFallback: (id: string) => ipcRenderer.invoke('provider:setFallback', id),

    // Chat options
    getChatOptions: (id: string) => ipcRenderer.invoke('provider:getChatOptions', id),
    setChatOptions: (id: string, options: any) => ipcRenderer.invoke('provider:setChatOptions', id, options),

    // Models
    models: (id: string) => ipcRenderer.invoke('provider:models', id),
    getModels: (id: string) => ipcRenderer.invoke('provider:getModels', id),

    // Testing (enhanced with friendly errors)
    test: (id: string) => ipcRenderer.invoke('provider:test', id),
    testConnection: (id: string) => ipcRenderer.invoke('provider:testConnection', id),
    checkHealth: () => ipcRenderer.invoke('provider:checkHealth'),

    // Chat (non-streaming)
    chat: (providerId: string, model: string, messages: any[], options?: any) =>
      ipcRenderer.invoke('provider:chat', providerId, model, messages, options),

    // Streaming SSE chat (new)
    chatStream: (providerId: string, messages: any[], requestId?: string) =>
      ipcRenderer.invoke('provider:chatStream', providerId, messages, requestId),
    chatAbort: (requestId: string) =>
      ipcRenderer.invoke('provider:chatAbort', requestId),

    // Streaming events
    onStream: (callback: (chunk: string) => void) => {
      ipcRenderer.on('provider:stream', (_event, chunk) => callback(chunk));
    },
    onChatChunk: (callback: (data: { requestId: string; content: string }) => void) => {
      ipcRenderer.on('provider:chatChunk', (_event, data) => callback(data));
    },
    onChatDone: (callback: (data: { requestId: string; aborted?: boolean }) => void) => {
      ipcRenderer.on('provider:chatDone', (_event, data) => callback(data));
    },
    onChatError: (callback: (data: { requestId: string; error: string }) => void) => {
      ipcRenderer.on('provider:chatError', (_event, data) => callback(data));
    },
    onChatUpdate: (callback: (data: any) => void) => {
      ipcRenderer.on('provider:chat:chunk', (_event, data) => callback(data));
    },
    onChatComplete: (callback: (data: any) => void) => {
      ipcRenderer.on('provider:chat:done', (_event, data) => callback(data));
    },

    // Routing
    route: (requirements: any) => ipcRenderer.invoke('provider:route', requirements),
  },

  // ─── Memory Vault ──────────────────────────────────────────────────────
  memory: {
    store: (entry: any) => ipcRenderer.invoke('memory:store', entry),
    retrieve: (id: string) => ipcRenderer.invoke('memory:retrieve', id),
    search: (query: string, projectId?: string, limit?: number) =>
      ipcRenderer.invoke('memory:search', query, projectId, limit),
    rank: (query: string, memories: any[]) => ipcRenderer.invoke('memory:rank', query, memories),
    delete: (id: string) => ipcRenderer.invoke('memory:delete', id),
    list: (projectId: string) => ipcRenderer.invoke('memory:list', projectId),
    summarize: (projectId: string) => ipcRenderer.invoke('memory:summarize', projectId),
    update: (id: string, updates: any) => ipcRenderer.invoke('memory:update', id, updates),
  },

  // ─── Session Management ────────────────────────────────────────────────
  session: {
    save: (state: any) => ipcRenderer.invoke('session:save', state),
    restore: (sessionId: string) => ipcRenderer.invoke('session:restore', sessionId),
    list: () => ipcRenderer.invoke('session:list'),
    delete: (sessionId: string) => ipcRenderer.invoke('session:delete', sessionId),
    getLatest: (projectId: string) => ipcRenderer.invoke('session:getLatest', projectId),
    saveEnhanced: (state: any) => ipcRenderer.invoke('session:saveEnhanced', state),
    restoreEnhanced: (sessionId: string) => ipcRenderer.invoke('session:restoreEnhanced', sessionId),
    wasCrashed: () => ipcRenderer.invoke('session:wasCrashed'),
    getRecoverySession: () => ipcRenderer.invoke('session:getRecoverySession'),
    getRecoveryInfo: () => ipcRenderer.invoke('session:getRecoveryInfo'),
    markSafeShutdown: () => ipcRenderer.invoke('session:markSafeShutdown'),
    createEnhanced: (projectId: string, rootPath?: string) =>
      ipcRenderer.invoke('session:createEnhanced', projectId, rootPath),
    autoSaveEnhanced: (state: any, interval?: number) =>
      ipcRenderer.invoke('session:autoSaveEnhanced', state, interval),
    stopAutoSaveEnhanced: (sessionId: string) =>
      ipcRenderer.invoke('session:stopAutoSaveEnhanced', sessionId),
    updateEnhancedState: (state: any) =>
      ipcRenderer.invoke('session:updateEnhancedState', state),
    archiveCrashedSession: (sessionId: string) =>
      ipcRenderer.invoke('session:archiveCrashedSession', sessionId),
  },

  // ─── Execution Engine [DEPRECATED — routes to sm:*] ─────────────────
  // ARC 12: All execution.* methods now route through the state machine.
  // The old execution:* IPC handlers are replaced by sm:* handlers.
  // Every method below is a deprecation wrapper that calls the sm: equivalent.
  execution: {
    plan: (title: string, description: string, steps: any[]) => {
      console.warn('[VibeCode] execution.plan is deprecated, use sm.createPlan');
      return ipcRenderer.invoke('sm:createPlan', { title, description, steps });
    },
    execute: (planId: string) => {
      console.warn('[VibeCode] execution.execute is deprecated, use sm.executePlan');
      return ipcRenderer.invoke('sm:executePlan', planId);
    },
    status: (planId: string) => {
      console.warn('[VibeCode] execution.status is deprecated, use sm.getPlanProgress');
      return ipcRenderer.invoke('sm:getPlanProgress', planId);
    },
    cancel: (planId: string) => {
      console.warn('[VibeCode] execution.cancel is deprecated, use sm.cancelPlan');
      return ipcRenderer.invoke('sm:cancelPlan', planId);
    },
    retry: (stepId: string) => {
      console.warn('[VibeCode] execution.retry is deprecated, use sm.retryStep');
      return ipcRenderer.invoke('sm:retryStep', stepId);
    },
    history: (planId: string) => {
      console.warn('[VibeCode] execution.history is deprecated, use sm.getHistory');
      return ipcRenderer.invoke('sm:getHistory');
    },
    propose: (title: string, description: string, steps: any[]) => {
      console.warn('[VibeCode] execution.propose is deprecated, use sm.propose');
      return ipcRenderer.invoke('sm:propose', title, description, steps);
    },
    approve: (planId: string) => {
      console.warn('[VibeCode] execution.approve is deprecated, use sm.approvePlan');
      return ipcRenderer.invoke('sm:approvePlan', planId);
    },
    getPlan: (planId: string) => {
      console.warn('[VibeCode] execution.getPlan is deprecated, use sm.getNode');
      return ipcRenderer.invoke('sm:getNode', planId);
    },
    getStep: (stepId: string) => {
      console.warn('[VibeCode] execution.getStep is deprecated, use sm.getNode');
      return ipcRenderer.invoke('sm:getNode', stepId);
    },
    executeStep: (stepId: string) => {
      console.warn('[VibeCode] execution.executeStep is deprecated, use sm.executeStep');
      return ipcRenderer.invoke('sm:executeStep', stepId);
    },
    detectBlockers: (_planId: string) => {
      console.warn('[VibeCode] execution.detectBlockers is deprecated — graph handles dependencies automatically');
      return Promise.resolve({ success: true, data: { blockers: [], count: 0 } });
    },
    rollbackStep: (stepId: string) => {
      console.warn('[VibeCode] execution.rollbackStep is deprecated, use sm.rollbackStep');
      return ipcRenderer.invoke('sm:rollbackStep', stepId);
    },
    rollbackPlan: (planId: string) => {
      console.warn('[VibeCode] execution.rollbackPlan is deprecated, use sm.rollbackPlan');
      return ipcRenderer.invoke('sm:rollbackPlan', planId);
    },
    listPlans: () => {
      console.warn('[VibeCode] execution.listPlans is deprecated, use sm.getPlans');
      return ipcRenderer.invoke('sm:getPlans');
    },
    deletePlan: (planId: string) => {
      console.warn('[VibeCode] execution.deletePlan is deprecated, use sm.deleteNode');
      return ipcRenderer.invoke('sm:deleteNode', planId);
    },
    setWorkspace: (workspaceRoot: string) => {
      console.warn('[VibeCode] execution.setWorkspace is deprecated, use sm.setWorkspace');
      return ipcRenderer.invoke('sm:setWorkspace', workspaceRoot);
    },
    onStatus: (callback: (status: any) => void) => {
      console.warn('[VibeCode] execution.onStatus is deprecated, use sm.onEvent');
      ipcRenderer.on('sm:event', (_event, event) => callback(event));
    },
    onStepUpdate: (callback: (update: any) => void) => {
      console.warn('[VibeCode] execution.onStepUpdate is deprecated, use sm.onEvent');
      ipcRenderer.on('sm:event', (_event, event) => callback(event));
    },
    // Diff Preview
    getDiff: (stepId: string) => {
      console.warn('[VibeCode] execution.getDiff is deprecated, use sm.getDiff');
      return ipcRenderer.invoke('sm:getDiff', stepId);
    },
    getPlanDiffs: (planId: string) => {
      console.warn('[VibeCode] execution.getPlanDiffs is deprecated, use sm.getPlanDiffs');
      return ipcRenderer.invoke('sm:getPlanDiffs', planId);
    },
    getStepResult: (stepId: string) => {
      console.warn('[VibeCode] execution.getStepResult is deprecated, use sm.getNode');
      return ipcRenderer.invoke('sm:getNode', stepId);
    },
    getStepOutput: (stepId: string) => {
      console.warn('[VibeCode] execution.getStepOutput is deprecated, use sm.getNode');
      return ipcRenderer.invoke('sm:getNode', stepId);
    },
    // Execution Queue [DEPRECATED — queues are now part of the graph]
    queue: {
      list: () => {
        console.warn('[VibeCode] execution.queue.list is deprecated — queues are now part of the graph');
        return Promise.resolve({ success: true, data: { entries: [] } });
      },
      add: (planId: string) => {
        console.warn('[VibeCode] execution.queue.add is deprecated, use sm.executePlan');
        return ipcRenderer.invoke('sm:executePlan', planId);
      },
      cancel: (entryId: string) => {
        console.warn('[VibeCode] execution.queue.cancel is deprecated, use sm.cancelPlan');
        return ipcRenderer.invoke('sm:cancelPlan', entryId);
      },
    },
    // Execution History
    getHistory: () => {
      console.warn('[VibeCode] execution.getHistory is deprecated, use sm.getHistory');
      return ipcRenderer.invoke('sm:getHistory');
    },
    // Queue Update Events
    onQueueUpdate: (callback: (update: any) => void) => {
      console.warn('[VibeCode] execution.onQueueUpdate is deprecated, use sm.onEvent');
      ipcRenderer.on('sm:event', (_event, event) => callback(event));
    },
  },

  // ─── Workspace (enhanced with deep analysis) ──────────────────────────
  workspace: {
    analyze: (wsPath: string) => ipcRenderer.invoke('workspace:analyze', wsPath),
    open: (wsPath?: string) => ipcRenderer.invoke('workspace:open', wsPath),
    close: () => ipcRenderer.invoke('workspace:close'),
    recent: (limit?: number) => ipcRenderer.invoke('workspace:recent', limit),
    addRecent: (wsPath: string, name?: string, type?: string) =>
      ipcRenderer.invoke('workspace:addRecent', wsPath, name, type),
    removeRecent: (wsPath: string) => ipcRenderer.invoke('workspace:removeRecent', wsPath),
    switchWorkspace: (wsPath: string) => ipcRenderer.invoke('workspace:switchWorkspace', wsPath),
    getInfo: () => ipcRenderer.invoke('workspace:getInfo'),
    searchFiles: (pattern: string, maxResults?: number) =>
      ipcRenderer.invoke('workspace:searchFiles', pattern, maxResults),
    fuzzySearch: (query: string, maxResults?: number) =>
      ipcRenderer.invoke('workspace:fuzzySearch', query, maxResults),
  },

  // ─── Proposals ─────────────────────────────────────────────────────────
  proposal: {
    generateFromResponse: (response: string, context?: { workspaceRoot?: string; projectId?: string }) =>
      ipcRenderer.invoke('proposal:generateFromResponse', response, context),
    approveAndExecute: (planId: string) =>
      ipcRenderer.invoke('proposal:approveAndExecute', planId),
    reject: (planId: string, reason?: string) =>
      ipcRenderer.invoke('proposal:reject', planId, reason),
    modify: (planId: string, modifications: any) =>
      ipcRenderer.invoke('proposal:modify', planId, modifications),
    list: () => ipcRenderer.invoke('proposal:list'),
    get: (proposalId: string) =>
      ipcRenderer.invoke('proposal:get', proposalId),
    onUpdate: (callback: (update: any) => void) => {
      ipcRenderer.on('proposal:updated', (_event, update) => callback(update));
    },
  },

  // ─── App Info ──────────────────────────────────────────────────────────
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    quit: () => ipcRenderer.send('app:quit'),
    minimize: () => ipcRenderer.send('app:minimize'),
    maximize: () => ipcRenderer.send('app:maximize'),
    close: () => ipcRenderer.send('app:close'),
  },

  // ─── Auto-Updater ──────────────────────────────────────────────────────
  updater: {
    check: (force?: boolean) => ipcRenderer.invoke('updater:check', force),
    download: () => ipcRenderer.invoke('updater:download'),
    cancel: () => ipcRenderer.invoke('updater:cancel'),
    install: () => ipcRenderer.invoke('updater:install'),
    status: () => ipcRenderer.invoke('updater:status'),
    setChannel: (channel: string) => ipcRenderer.invoke('updater:setChannel', channel),
    onAvailable: (callback: (info: any) => void) => {
      ipcRenderer.on('updater:update-available', (_event, info) => callback(info));
    },
    onNotAvailable: (callback: (info: any) => void) => {
      ipcRenderer.on('updater:update-not-available', (_event, info) => callback(info));
    },
    onProgress: (callback: (progress: any) => void) => {
      ipcRenderer.on('updater:update:progress', (_event, progress) => callback(progress));
    },
    onDownloaded: (callback: (info: any) => void) => {
      ipcRenderer.on('updater:update-downloaded', (_event, info) => callback(info));
    },
    onError: (callback: (error: any) => void) => {
      ipcRenderer.on('updater:update:error', (_event, error) => callback(error));
    },
  },

  // ─── Telemetry & Diagnostics ───────────────────────────────────────────
  telemetry: {
    getMetrics: () => ipcRenderer.invoke('telemetry:getMetrics'),
    getRecentLogs: (count?: number, level?: string) =>
      ipcRenderer.invoke('telemetry:getRecentLogs', count, level),
    getCrashDumps: () => ipcRenderer.invoke('telemetry:getCrashDumps'),
    sendHeartbeat: (data?: { fps?: number }) =>
      ipcRenderer.invoke('telemetry:sendHeartbeat', data),
    clearCrashDumps: () => ipcRenderer.invoke('telemetry:clearCrashDumps'),
  },

  // ─── Analytics (opt-in, privacy-first) ─────────────────────────────────
  analytics: {
    getConfig: () => ipcRenderer.invoke('analytics:getConfig'),
    grantConsent: (options?: any) => ipcRenderer.invoke('analytics:grantConsent', options),
    revokeConsent: () => ipcRenderer.invoke('analytics:revokeConsent'),
    updateConfig: (updates: any) => ipcRenderer.invoke('analytics:updateConfig', updates),
    getMetrics: () => ipcRenderer.invoke('analytics:getMetrics'),
    getPendingEvents: () => ipcRenderer.invoke('analytics:getPendingEvents'),
    trackFeature: (feature: string) => ipcRenderer.invoke('analytics:trackFeature', feature),
  },

  // ── Execution State Machine (ARC 12 — single source of truth) ────────
  // This namespace is the canonical API. The old execution.* namespace
  // routes here via deprecation wrappers.
  sm: {
    // ── Graph Queries ──────────────────────────────────────────────────
    getNode: (nodeId: string) => ipcRenderer.invoke('sm:getNode', nodeId),
    getTimeline: () => ipcRenderer.invoke('sm:getTimeline'),
    getGraph: () => ipcRenderer.invoke('sm:getGraph'),
    getPlans: () => ipcRenderer.invoke('sm:getPlans'),
    getPlanProgress: (planId: string) => ipcRenderer.invoke('sm:getPlanProgress', planId),
    getChildren: (parentId: string) => ipcRenderer.invoke('sm:getChildren', parentId),
    getNodesByType: (type: string) => ipcRenderer.invoke('sm:getNodesByType', type),

    // ── Plan Operations ────────────────────────────────────────────────
    createPlan: (params: any) => ipcRenderer.invoke('sm:createPlan', params),
    approvePlan: (planId: string) => ipcRenderer.invoke('sm:approvePlan', planId),
    executePlan: (planId: string) => ipcRenderer.invoke('sm:executePlan', planId),
    cancelPlan: (planId: string) => ipcRenderer.invoke('sm:cancelPlan', planId),
    executeStep: (stepId: string) => ipcRenderer.invoke('sm:executeStep', stepId),
    retryStep: (stepId: string) => ipcRenderer.invoke('sm:retryStep', stepId),

    // ── Propose (ARC 12 — create plan requiring approval) ──────────────
    propose: (title: string, description: string, steps: any[]) =>
      ipcRenderer.invoke('sm:propose', title, description, steps),

    // ── History ────────────────────────────────────────────────────────
    getHistory: () => ipcRenderer.invoke('sm:getHistory'),

    // ── Diff ───────────────────────────────────────────────────────────
    getDiff: (stepId: string) => ipcRenderer.invoke('sm:getDiff', stepId),
    getPlanDiffs: (planId: string) => ipcRenderer.invoke('sm:getPlanDiffs', planId),

    // ── State Transitions ──────────────────────────────────────────────
    transition: (params: any) => ipcRenderer.invoke('sm:transition', params),

    // ── Rollback ───────────────────────────────────────────────────────
    rollbackStep: (stepId: string) => ipcRenderer.invoke('sm:rollbackStep', stepId),
    rollbackPlan: (planId: string) => ipcRenderer.invoke('sm:rollbackPlan', planId),

    // ── Safety ─────────────────────────────────────────────────────────
    runSafetyCheck: (params: any) => ipcRenderer.invoke('sm:runSafetyCheck', params),
    getSafetyScore: (planId: string) => ipcRenderer.invoke('sm:getSafetyScore', planId),

    // ── Workspace ──────────────────────────────────────────────────────
    setWorkspace: (workspaceRoot: string) => ipcRenderer.invoke('sm:setWorkspace', workspaceRoot),

    // ── Node Deletion ──────────────────────────────────────────────────
    deleteNode: (nodeId: string) => ipcRenderer.invoke('sm:deleteNode', nodeId),

    // ── Persistence (ARC 14) ──────────────────────────────────────────
    saveGraph: () => ipcRenderer.invoke('sm:saveGraph'),
    flushPersistence: () => ipcRenderer.invoke('sm:flushPersistence'),

    // ── Monaco Edit Tracking (ARC 14) ────────────────────────────────
    createMonacoEditNode: (params: {
      filePath: string;
      originalContent: string;
      newContent: string;
      isAI: boolean;
      region?: { startLine: number; startCol: number; endLine: number; endCol: number };
      linkedStepId?: string;
    }) => ipcRenderer.invoke('sm:createMonacoEditNode', params),

    // ── Audit Report (ARC 15) ──────────────────────────────────────────
    getAuditReport: () => ipcRenderer.invoke('sm:getAuditReport'),
    isAuditClean: () => ipcRenderer.invoke('sm:isAuditClean'),

    // ── Events ─────────────────────────────────────────────────────────
    onEvent: (callback: (event: any) => void) => {
      ipcRenderer.on('sm:event', (_event, event) => callback(event));
    },
  },
};

contextBridge.exposeInMainWorld('vibecode', vibecode);
