// Mock for Electron module used in tests
// Provides stub implementations for ipcMain, BrowserWindow, etc.

const handlers: Map<string, Function> = new Map();

export const ipcMain = {
  handle: (channel: string, handler: Function) => {
    handlers.set(channel, handler);
  },
  removeHandler: (channel: string) => {
    handlers.delete(channel);
  },
  _getHandlers: () => handlers,
  _clearHandlers: () => handlers.clear(),
};

export const ipcRenderer = {
  invoke: async (channel: string, ...args: any[]) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`No handler for channel: ${channel}`);
    return handler({}, ...args);
  },
};

export const BrowserWindow = {
  fromWebContents: () => null,
  getAllWindows: () => [],
};

export const app = {
  getPath: (name: string) => '/tmp/vibecode-test',
  on: () => {},
  quit: () => {},
  getVersion: () => '0.2.0-test',
  getName: () => 'VibeCode',
  isPackaged: false,
  requestSingleInstanceLock: () => true,
  getAppPath: () => '/tmp/vibecode-test',
  relaunch: () => {},
  exit: () => {},
};

export const clipboard = {
  readText: () => '',
  writeText: () => {},
};

export const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  showSaveDialog: async () => ({ canceled: true, filePath: '' }),
};

export const Menu = {
  setApplicationMenu: () => {},
  buildFromTemplate: () => null,
};

export const shell = {
  openExternal: () => {},
  openPath: () => {},
};

export const nativeImage = {
  createEmpty: () => ({}),
};

export const screen = {
  getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }),
};
