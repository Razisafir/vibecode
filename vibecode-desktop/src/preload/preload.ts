import { contextBridge, ipcRenderer } from 'electron';

const vibecode = {
  fs: {
    readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
    writeFile: (path: string, content: string) => ipcRenderer.invoke('fs:writeFile', path, content),
    listDir: (path: string) => ipcRenderer.invoke('fs:listDir', path),
    watch: (path: string, callback: (event: string, file: string) => void) => {
      ipcRenderer.send('fs:watch', path);
      ipcRenderer.on('fs:watch:change', (_event, filePath, eventType) => callback(eventType, filePath));
    },
    stat: (path: string) => ipcRenderer.invoke('fs:stat', path),
    mkdir: (path: string) => ipcRenderer.invoke('fs:mkdir', path),
    delete: (path: string) => ipcRenderer.invoke('fs:delete', path),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    setWorkspaceRoot: (rootPath: string) => ipcRenderer.invoke('fs:setWorkspaceRoot', rootPath),
  },
  terminal: {
    create: (cwd?: string) => ipcRenderer.invoke('terminal:create', cwd),
    write: (id: string, data: string) => ipcRenderer.invoke('terminal:write', id, data),
    kill: (id: string) => ipcRenderer.invoke('terminal:kill', id),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('terminal:resize', id, cols, rows),
    onData: (callback: (id: string, data: string) => void) => {
      ipcRenderer.on('terminal:data', (_event, id, data) => callback(id, data));
    },
  },
  provider: {
    list: () => ipcRenderer.invoke('provider:list'),
    configure: (config: any) => ipcRenderer.invoke('provider:configure', config),
    test: (id: string) => ipcRenderer.invoke('provider:test', id),
    route: (requirements: any) => ipcRenderer.invoke('provider:route', requirements),
    chat: (providerId: string, model: string, messages: any[], options?: any) =>
      ipcRenderer.invoke('provider:chat', providerId, model, messages, options),
    models: (id: string) => ipcRenderer.invoke('provider:models', id),
    onStream: (callback: (chunk: string) => void) => {
      ipcRenderer.on('provider:stream', (_event, chunk) => callback(chunk));
    },
  },
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
  session: {
    save: (state: any) => ipcRenderer.invoke('session:save', state),
    restore: (sessionId: string) => ipcRenderer.invoke('session:restore', sessionId),
    list: () => ipcRenderer.invoke('session:list'),
    delete: (sessionId: string) => ipcRenderer.invoke('session:delete', sessionId),
    getLatest: (projectId: string) => ipcRenderer.invoke('session:getLatest', projectId),
    // Enhanced session methods
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
  execution: {
    plan: (title: string, description: string, steps: any[]) =>
      ipcRenderer.invoke('execution:plan', title, description, steps),
    execute: (planId: string) => ipcRenderer.invoke('execution:execute', planId),
    status: (planId: string) => ipcRenderer.invoke('execution:status', planId),
    cancel: (planId: string) => ipcRenderer.invoke('execution:cancel', planId),
    retry: (stepId: string) => ipcRenderer.invoke('execution:retry', stepId),
    history: (planId: string) => ipcRenderer.invoke('execution:history', planId),
    propose: (title: string, description: string, steps: any[]) =>
      ipcRenderer.invoke('execution:propose', title, description, steps),
    approve: (planId: string) => ipcRenderer.invoke('execution:approve', planId),
    getPlan: (planId: string) => ipcRenderer.invoke('execution:getPlan', planId),
    getStep: (stepId: string) => ipcRenderer.invoke('execution:getStep', stepId),
    executeStep: (stepId: string) => ipcRenderer.invoke('execution:executeStep', stepId),
    detectBlockers: (planId: string) => ipcRenderer.invoke('execution:detectBlockers', planId),
    rollbackStep: (stepId: string) => ipcRenderer.invoke('execution:rollbackStep', stepId),
    rollbackPlan: (planId: string) => ipcRenderer.invoke('execution:rollbackPlan', planId),
    listPlans: () => ipcRenderer.invoke('execution:listPlans'),
    deletePlan: (planId: string) => ipcRenderer.invoke('execution:deletePlan', planId),
    setWorkspace: (workspaceRoot: string) => ipcRenderer.invoke('execution:setWorkspace', workspaceRoot),
    onStatus: (callback: (status: any) => void) => {
      ipcRenderer.on('execution:status', (_event, status) => callback(status));
    },
    onStepUpdate: (callback: (update: any) => void) => {
      ipcRenderer.on('execution:step:update', (_event, update) => callback(update));
    },
  },
  workspace: {
    analyze: (path: string) => ipcRenderer.invoke('workspace:analyze', path),
    open: (path: string) => ipcRenderer.invoke('workspace:open', path),
    close: () => ipcRenderer.invoke('workspace:close'),
  },
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
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    quit: () => ipcRenderer.send('app:quit'),
    minimize: () => ipcRenderer.send('app:minimize'),
    maximize: () => ipcRenderer.send('app:maximize'),
    close: () => ipcRenderer.send('app:close'),
  },
};

contextBridge.exposeInMainWorld('vibecode', vibecode);
