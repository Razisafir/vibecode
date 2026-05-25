// VibeCode System Supervision - Auto Updater v8.0
// Manages staged auto-update rollouts

import { EventEmitter } from 'events';

export interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes: string;
  downloadUrl: string;
  hash: string;
  size: number;
  mandatory: boolean;
}

export interface UpdateConfig {
  checkIntervalMs: number;
  channel: 'stable' | 'beta' | 'alpha';
  autoDownload: boolean;
  autoInstallOnQuit: boolean;
  stagedRolloutPercentage: number;
}

const DEFAULT_CONFIG: UpdateConfig = {
  checkIntervalMs: 60 * 60 * 1000, // 1 hour
  channel: 'stable',
  autoDownload: false,
  autoInstallOnQuit: true,
  stagedRolloutPercentage: 100,
};

export class AutoUpdater extends EventEmitter {
  private config: UpdateConfig;
  private currentVersion: string;
  private availableUpdate: UpdateInfo | null = null;
  private downloadProgress = 0;
  private isChecking = false;
  private checkTimer: NodeJS.Timeout | null = null;

  constructor(currentVersion: string, config: Partial<UpdateConfig> = {}) {
    super();
    this.currentVersion = currentVersion;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async checkForUpdate(): Promise<UpdateInfo | null> {
    if (this.isChecking) return null;
    this.isChecking = true;
    this.emit('update:checking');

    // Simulated update check
    // In real implementation, this would query an update server
    this.isChecking = false;
    return this.availableUpdate;
  }

  async downloadUpdate(): Promise<void> {
    if (!this.availableUpdate) {
      throw new Error('No update available');
    }

    this.emit('update:downloading', { version: this.availableUpdate.version });
    // Simulated download
    this.downloadProgress = 100;
    this.emit('update:downloaded', { version: this.availableUpdate.version });
  }

  async installUpdate(): Promise<void> {
    if (!this.availableUpdate || this.downloadProgress !== 100) {
      throw new Error('Update not ready for installation');
    }
    this.emit('update:installing', { version: this.availableUpdate.version });
  }

  startPeriodicCheck(): void {
    this.stopPeriodicCheck();
    this.checkTimer = setInterval(async () => {
      await this.checkForUpdate();
    }, this.config.checkIntervalMs);
  }

  stopPeriodicCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  setAvailableUpdate(update: UpdateInfo): void {
    this.availableUpdate = update;
    this.downloadProgress = 0;
    this.emit('update:available', update);
  }

  getAvailableUpdate(): UpdateInfo | null {
    return this.availableUpdate;
  }

  getCurrentVersion(): string {
    return this.currentVersion;
  }

  getConfig(): UpdateConfig {
    return { ...this.config };
  }
}
