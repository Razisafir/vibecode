// Plugin Registry - Discovery, manifest validation, and dependency resolution
// Phase 8: Plugin Architecture

import type { PluginManifest, PluginCapability } from '../kernel/types';
import { EventEmitter } from 'events';
import { existsSync, readFileSync, readdirSync, watch, type FSWatcher } from 'fs';
import { join } from 'path';

const REQUIRED_MANIFEST_FIELDS: (keyof PluginManifest)[] = [
  'id', 'name', 'version', 'description', 'main', 'apiVersion', 'capabilities'
];

export class PluginRegistry extends EventEmitter {
  private manifests = new Map<string, PluginManifest>();
  private pluginDirectories: string[];
  private watchers: FSWatcher[] = [];
  private commandIds = new Map<string, string>(); // commandId -> pluginId

  constructor(pluginDirectories: string[]) {
    super();
    this.pluginDirectories = pluginDirectories;
  }

  async scan(): Promise<void> {
    for (const dir of this.pluginDirectories) {
      await this.scanDirectory(dir);
    }
  }

  async scanDirectory(dir: string): Promise<void> {
    if (!existsSync(dir)) return;

    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const manifestPath = join(dir, entry.name, 'manifest.json');
        if (existsSync(manifestPath)) {
          try {
            const manifest = this.loadManifest(manifestPath);
            this.registerManifest(manifest);
          } catch (err) {
            // Invalid manifest does not crash registry scan
            this.emit('scan-error', {
              directory: dir,
              plugin: entry.name,
              error: err
            });
          }
        }
      }
    }
  }

  loadManifest(manifestPath: string): PluginManifest {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf-8'));

    // Validate required fields
    const missing = REQUIRED_MANIFEST_FIELDS.filter(field => !(field in raw));
    if (missing.length > 0) {
      throw new Error(
        `Invalid manifest at ${manifestPath}: missing required fields: ${missing.join(', ')}`
      );
    }

    // Validate field types
    if (typeof raw.id !== 'string' || typeof raw.name !== 'string' ||
        typeof raw.version !== 'string') {
      throw new Error(
        `Invalid manifest at ${manifestPath}: id, name, version must be strings`
      );
    }

    if (!Array.isArray(raw.capabilities)) {
      throw new Error(
        `Invalid manifest at ${manifestPath}: capabilities must be an array`
      );
    }

    return raw as PluginManifest;
  }

  registerManifest(manifest: PluginManifest): void {
    if (this.manifests.has(manifest.id)) {
      throw new Error(`Duplicate plugin ID: ${manifest.id}`);
    }
    this.manifests.set(manifest.id, manifest);
    this.emit('plugin-registered', manifest);
  }

  unregisterManifest(pluginId: string): boolean {
    return this.manifests.delete(pluginId);
  }

  getManifest(pluginId: string): PluginManifest | undefined {
    return this.manifests.get(pluginId);
  }

  getAllManifests(): PluginManifest[] {
    return Array.from(this.manifests.values());
  }

  registerCommandId(commandId: string, pluginId: string): void {
    if (this.commandIds.has(commandId)) {
      const existingPlugin = this.commandIds.get(commandId);
      throw new Error(
        `Command ID conflict: '${commandId}' is already registered by plugin '${existingPlugin}'`
      );
    }
    this.commandIds.set(commandId, pluginId);
  }

  unregisterCommandId(commandId: string): void {
    this.commandIds.delete(commandId);
  }

  checkCommandConflict(commandId: string): string | undefined {
    return this.commandIds.get(commandId);
  }

  resolveDependencies(pluginId: string): string[] {
    const manifest = this.manifests.get(pluginId);
    if (!manifest) return [];

    const resolved: string[] = [];
    const visited = new Set<string>();

    const resolve = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const m = this.manifests.get(id);
      if (m?.dependencies) {
        for (const dep of m.dependencies) {
          resolve(dep);
          resolved.push(dep);
        }
      }
    };

    resolve(pluginId);
    return resolved;
  }

  startWatching(): void {
    for (const dir of this.pluginDirectories) {
      if (existsSync(dir)) {
        const watcher = watch(dir, { recursive: true }, (eventType, filename) => {
          if (filename?.toString().endsWith('manifest.json')) {
            this.emit('manifest-changed', {
              directory: dir,
              filename: filename.toString(),
              eventType
            });
          }
        });
        this.watchers.push(watcher);
      }
    }
  }

  stopWatching(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
  }

  getPluginDirectories(): string[] {
    return [...this.pluginDirectories];
  }

  getManifestCount(): number {
    return this.manifests.size;
  }

  has(pluginId: string): boolean {
    return this.manifests.has(pluginId);
  }
}
