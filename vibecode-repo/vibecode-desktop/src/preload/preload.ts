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
    unwatch: (watchId: string) => ipcRenderer.invoke('fs:unwatch', watchId),
    unwatchAll: () => ipcRenderer.invoke('fs:unwatchAll'),
    stat: (path: string) => ipcRenderer.invoke('fs:stat', path),
    mkdir: (path: string) => ipcRenderer.invoke('fs:mkdir', path),
    delete: (path: string) => ipcRenderer.invoke('fs:delete', path),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    addWorkspaceRoot: (rootPath: string) => ipcRenderer.invoke('fs:addWorkspaceRoot', rootPath),
    getWorkspaceRoots: () => ipcRenderer.invoke('fs:getWorkspaceRoots'),
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
    onChatDone: (callback: (data: { providerId: string; model: string; fullContent: string; timestamp: number }) => void) => {
      ipcRenderer.on('provider:chat:done', (_event, data) => callback(data));
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
    cacheStats: () => ipcRenderer.invoke('memory:cacheStats'),
  },
  session: {
    save: (state: any) => ipcRenderer.invoke('session:save', state),
    restore: (sessionId: string) => ipcRenderer.invoke('session:restore', sessionId),
    list: () => ipcRenderer.invoke('session:list'),
    delete: (sessionId: string) => ipcRenderer.invoke('session:delete', sessionId),
    getLatest: (projectId: string) => ipcRenderer.invoke('session:getLatest', projectId),
  },
  execution: {
    plan: (title: string, description: string, steps: any[]) =>
      ipcRenderer.invoke('execution:plan', title, description, steps),
    execute: (planId: string) => ipcRenderer.invoke('execution:execute', planId),
    approve: (planId: string) => ipcRenderer.invoke('execution:approve', planId),
    reject: (planId: string) => ipcRenderer.invoke('execution:reject', planId),
    modifyStep: (planId: string, stepId: string, updates: any) =>
      ipcRenderer.invoke('execution:modifyStep', planId, stepId, updates),
    status: (planId: string) => ipcRenderer.invoke('execution:status', planId),
    cancel: (planId: string) => ipcRenderer.invoke('execution:cancel', planId),
    retry: (stepId: string) => ipcRenderer.invoke('execution:retry', stepId),
    history: (projectId?: string) => ipcRenderer.invoke('execution:history', projectId),
    propose: (step: any) => ipcRenderer.invoke('execution:propose', step),
    rollback: (planId: string) => ipcRenderer.invoke('execution:rollback', planId),
    executionHistory: () => ipcRenderer.invoke('execution:executionHistory'),
    /** Core pipeline: process AI response → generate proposal */
    processAIResponse: (aiResponse: string, userMessage: string, context?: any) =>
      ipcRenderer.invoke('execution:processAIResponse', aiResponse, userMessage, context),
    getPlan: (planId: string) => ipcRenderer.invoke('execution:getPlan', planId),
    getStep: (stepId: string) => ipcRenderer.invoke('execution:getStep', stepId),
    detectBlockers: (planId: string) => ipcRenderer.invoke('execution:detectBlockers', planId),
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
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    quit: () => ipcRenderer.send('app:quit'),
    minimize: () => ipcRenderer.send('app:minimize'),
    maximize: () => ipcRenderer.send('app:maximize'),
    close: () => ipcRenderer.send('app:close'),
  },
};

contextBridge.exposeInMainWorld('vibecode', vibecode);
