// VibeCode System Supervision - Session Recovery v8.0
// Manages session state persistence and recovery for graceful restarts

import { EventEmitter } from 'events';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

export interface SessionState {
  id: string;
  windows: WindowStateRecord[];
  activePlugins: string[];
  preferences: Record<string, unknown>;
  lastSaved: number;
  version: string;
}

export interface WindowStateRecord {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  isMaximized: boolean;
  isFullScreen: boolean;
}

export interface SessionRecoveryConfig {
  stateFile: string;
  autoSaveIntervalMs: number;
  maxRecoveryAttempts: number;
}

const DEFAULT_CONFIG: SessionRecoveryConfig = {
  stateFile: './session-state/recovery.json',
  autoSaveIntervalMs: 30000, // 30 seconds
  maxRecoveryAttempts: 2,
};

export class SessionRecovery extends EventEmitter {
  private config: SessionRecoveryConfig;
  private currentState: SessionState | null = null;
  private autoSaveTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<SessionRecoveryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  saveState(state: SessionState): void {
    state.lastSaved = Date.now();
    state.version = '8.0.0';
    this.currentState = state;

    try {
      const dir = dirname(this.config.stateFile);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.config.stateFile, JSON.stringify(state, null, 2), 'utf-8');
      this.emit('state:saved', { path: this.config.stateFile });
    } catch (err) {
      this.emit('state:save-error', { error: err });
    }
  }

  recoverState(): SessionState | null {
    if (!existsSync(this.config.stateFile)) {
      return null;
    }

    try {
      const raw = readFileSync(this.config.stateFile, 'utf-8');
      const state = JSON.parse(raw) as SessionState;

      // Basic validation
      if (!state.id || !state.version || !state.lastSaved) {
        this.emit('state:corrupted', { path: this.config.stateFile });
        return null;
      }

      this.currentState = state;
      this.emit('state:recovered', { state });
      return state;
    } catch (err) {
      this.emit('state:recovery-error', { error: err });
      return null;
    }
  }

  startAutoSave(getState: () => SessionState): void {
    this.stopAutoSave();
    this.autoSaveTimer = setInterval(() => {
      const state = getState();
      this.saveState(state);
    }, this.config.autoSaveIntervalMs);
  }

  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  getCurrentState(): SessionState | null {
    return this.currentState;
  }

  clearState(): void {
    this.currentState = null;
    this.stopAutoSave();
  }

  getConfig(): SessionRecoveryConfig {
    return { ...this.config };
  }
}
