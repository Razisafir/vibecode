// Mock for electron-updater module used in tests

export const autoUpdater = {
  autoDownload: true,
  autoRunAppAfterInstall: true,
  allowDowngrade: false,
  allowPrerelease: false,
  channel: 'stable',
  on: () => {},
  checkForUpdates: async () => null,
  downloadUpdate: async () => [],
  quitAndInstall: () => {},
};

export class CancellationToken {
  private _cancelled = false;
  get cancelled() { return this._cancelled; }
  cancel() { this._cancelled = true; }
}
