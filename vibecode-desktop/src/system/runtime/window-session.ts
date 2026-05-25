// Window Session - Save/load window state with debounced auto-save
// Phase 9: Multi-Window Architecture

import type { WindowSessionData, WindowBounds } from '../kernel/types';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

export class WindowSession {
  private sessionDirectory: string;
  private debounceMs: number;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private inMemoryStore = new Map<string, WindowSessionData>();

  constructor(sessionDirectory: string, debounceMs: number = 300) {
    this.sessionDirectory = sessionDirectory;
    this.debounceMs = debounceMs;
  }

  async save(windowId: string, data: WindowSessionData): Promise<void> {
    this.inMemoryStore.set(windowId, data);
    this.persistToDisk(windowId, data);
  }

  async debouncedSave(windowId: string, data: WindowSessionData): Promise<void> {
    // Store in memory immediately for reads, debounce the disk write
    this.inMemoryStore.set(windowId, data);

    // Clear existing timer
    const existing = this.debounceTimers.get(windowId);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new debounced save for disk persistence
    const timer = setTimeout(() => {
      this.persistToDisk(windowId, data);
      this.debounceTimers.delete(windowId);
    }, this.debounceMs);

    this.debounceTimers.set(windowId, timer);
  }

  async load(windowId: string): Promise<WindowSessionData | null> {
    // Try in-memory first
    const memData = this.inMemoryStore.get(windowId);
    if (memData) return memData;

    // Try disk
    return this.loadFromDisk(windowId);
  }

  async loadAll(): Promise<WindowSessionData[]> {
    const sessions: WindowSessionData[] = [];

    // Load from disk
    if (existsSync(this.sessionDirectory)) {
      const files = readdirSync(this.sessionDirectory)
        .filter(f => f.endsWith('.json'));

      for (const file of files) {
        try {
          const data = JSON.parse(readFileSync(join(this.sessionDirectory, file), 'utf-8'));
          sessions.push(data);
          this.inMemoryStore.set(data.windowId, data);
        } catch {
          // Skip corrupted files
        }
      }
    }

    // Add any in-memory sessions not on disk
    for (const [, data] of this.inMemoryStore) {
      if (!sessions.find(s => s.windowId === data.windowId)) {
        sessions.push(data);
      }
    }

    return sessions;
  }

  async delete(windowId: string): Promise<void> {
    this.inMemoryStore.delete(windowId);

    const filePath = join(this.sessionDirectory, `${windowId}.json`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  detectStaleSessions(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): string[] {
    const stale: string[] = [];
    const now = Date.now();

    for (const [windowId, data] of this.inMemoryStore) {
      if (now - data.lastActive > maxAgeMs) {
        stale.push(windowId);
      }
    }

    return stale;
  }

  getSharedGlobalState(): Record<string, unknown> {
    // Merge global state from all sessions (last-write wins)
    const merged: Record<string, unknown> = {};
    let latestTimestamp = 0;

    for (const [, data] of this.inMemoryStore) {
      if (data.lastActive > latestTimestamp) {
        latestTimestamp = data.lastActive;
        Object.assign(merged, data.globalState);
      }
    }

    return merged;
  }

  getSessionDirectory(): string {
    return this.sessionDirectory;
  }

  getPendingSaveCount(): number {
    return this.debounceTimers.size;
  }

  flushPendingSaves(): void {
    for (const [windowId, timer] of this.debounceTimers) {
      clearTimeout(timer);
      const data = this.inMemoryStore.get(windowId);
      if (data) {
        this.persistToDisk(windowId, data);
      }
      this.debounceTimers.delete(windowId);
    }
  }

  private persistToDisk(windowId: string, data: WindowSessionData): void {
    try {
      if (!existsSync(this.sessionDirectory)) {
        mkdirSync(this.sessionDirectory, { recursive: true });
      }
      writeFileSync(
        join(this.sessionDirectory, `${windowId}.json`),
        JSON.stringify(data, null, 2)
      );
    } catch (err) {
      // Silent fail for disk writes — in-memory is still valid
    }
  }

  private loadFromDisk(windowId: string): WindowSessionData | null {
    const filePath = join(this.sessionDirectory, `${windowId}.json`);
    if (!existsSync(filePath)) return null;

    try {
      const data = JSON.parse(readFileSync(filePath, 'utf-8'));
      this.inMemoryStore.set(windowId, data);
      return data;
    } catch {
      return null;
    }
  }
}
