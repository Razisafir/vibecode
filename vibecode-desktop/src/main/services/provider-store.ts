// ─── Provider Store — Provider Metadata Persistence ─────────────────────────
//
// Persists provider configurations to ~/.vibecode/providers.json.
// API keys are now stored separately in SecretsStore for security.
// This store only manages provider metadata (name, type, URL, models, etc.).
//
// Enhancements from base software:
// - Default providers (Ollama, LM Studio) auto-seeded on first load
// - Provider status tracking (lastStatus, lastTestedAt, lastError)
// - Enabled/disabled toggle per provider
// - Default provider selection
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { getProvidersConfigPath, ensureDirectories } from '../utils/paths';
import { maskKey } from './secrets-store';
import { logger } from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PersistedProvider {
  id: string;
  name: string;
  type: string;
  /** No longer stores API key directly — use SecretsStore */
  apiKey?: string;  // Kept for migration backwards compatibility, but deprecated
  baseUrl?: string;
  model?: string;
  enabled?: boolean;
  isDefault?: boolean;
  lastStatus?: 'unknown' | 'connected' | 'failed';
  lastTestedAt?: string;
  lastError?: string;
  models: Array<{
    id: string;
    name: string;
    contextWindow: number;
    supportsStreaming: boolean;
    supportsTools: boolean;
    supportsVision: boolean;
  }>;
  priority: number;
  isActive?: boolean;
  isFallback?: boolean;
  chatOptions?: {
    temperature: number;
    maxTokens: number;
    streaming: boolean;
    model?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

interface ProviderStoreData {
  version: number;
  providers: PersistedProvider[];
  activeProviderId?: string;
  fallbackProviderId?: string;
}

// ─── Public Provider Type (for IPC / display) ───────────────────────────────

export interface PublicProvider {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  model?: string;
  enabled: boolean;
  isDefault: boolean;
  lastStatus: string;
  lastTestedAt?: string;
  lastError?: string;
  hasApiKey: boolean;
  apiKeyMasked?: string;
  isLocal: boolean;
  models: PersistedProvider['models'];
  priority: number;
  isActive?: boolean;
  isFallback?: boolean;
  chatOptions?: PersistedProvider['chatOptions'];
  createdAt?: string;
  updatedAt?: string;
}

// ─── Legacy Obfuscation (for migration) ─────────────────────────────────────

const OBFUSCATION_KEY = 'VibeCodeDesktop2024ObfuscationKey';

function xorDeobfuscate(obfuscated: string): string {
  const decoded = Buffer.from(obfuscated, 'base64').toString('binary');
  const chars: string[] = [];
  for (let i = 0; i < decoded.length; i++) {
    const charCode = decoded.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
    chars.push(String.fromCharCode(charCode));
  }
  return chars.join('');
}

function xorObfuscate(plaintext: string): string {
  const chars: string[] = [];
  for (let i = 0; i < plaintext.length; i++) {
    const charCode = plaintext.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
    chars.push(String.fromCharCode(charCode));
  }
  return Buffer.from(chars.join(''), 'binary').toString('base64');
}

/**
 * Legacy mask function for backwards compatibility.
 * New code should use maskKey from secrets-store.
 */
export function maskApiKey(apiKey: string | undefined): string | undefined {
  if (!apiKey) return undefined;
  if (apiKey.length <= 12) return '***';
  return `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
}

// ─── ProviderStore Class ────────────────────────────────────────────────────

export class ProviderStore {
  private filePath: string;
  private providers: Map<string, PersistedProvider> = new Map();
  private loaded: boolean = false;
  private activeProviderId?: string;
  private fallbackProviderId?: string;

  constructor() {
    ensureDirectories();
    this.filePath = getProvidersConfigPath();
  }

  // ─── Load ─────────────────────────────────────────────────────────────

  private load(): void {
    if (this.loaded) return;

    try {
      if (!fs.existsSync(this.filePath)) {
        // No file yet — seed defaults
        this.seedDefaults();
        this.loaded = true;
        return;
      }

      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const data: ProviderStoreData = JSON.parse(raw);

      if (data.providers && Array.isArray(data.providers)) {
        for (const p of data.providers) {
          if (p && p.id) {
            // De-obfuscate legacy API keys (for migration to SecretsStore)
            if (p.apiKey) {
              try {
                p.apiKey = xorDeobfuscate(p.apiKey);
              } catch {
                // If de-obfuscation fails, the key was stored as plaintext
                logger.warn('provider', `Could not de-obfuscate key for ${p.name}, using raw value`);
              }
            }
            this.providers.set(p.id, p);
          }
        }
      }

      // Restore active/fallback
      this.activeProviderId = data.activeProviderId;
      this.fallbackProviderId = data.fallbackProviderId;

      // If no providers, seed defaults
      if (this.providers.size === 0) {
        this.seedDefaults();
      }
    } catch (error) {
      logger.error('provider', 'Failed to load providers', { error: String(error) });
      if (this.providers.size === 0) {
        this.seedDefaults();
      }
    }

    this.loaded = true;
    logger.info('provider', `Loaded ${this.providers.size} providers from store`);
  }

  // ─── Save ─────────────────────────────────────────────────────────────

  private save(): void {
    try {
      const providers: PersistedProvider[] = Array.from(this.providers.values()).map((p) => {
        // Don't persist API keys in providers.json anymore
        // They should be in SecretsStore, but keep legacy compatibility
        const clone = { ...p };
        // Remove apiKey from provider data — it's in SecretsStore now
        delete clone.apiKey;
        return clone;
      });

      const data: ProviderStoreData = {
        version: 1,
        providers,
        activeProviderId: this.activeProviderId,
        fallbackProviderId: this.fallbackProviderId,
      };

      // Write atomically via temp file
      const tmpPath = this.filePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.filePath);

      logger.debug('provider', `Saved ${providers.length} providers`);
    } catch (error) {
      logger.error('provider', 'Failed to save providers', { error: String(error) });
    }
  }

  // ─── Default Providers ────────────────────────────────────────────────

  /** Seed default Ollama and LM Studio providers on first launch */
  private seedDefaults(): void {
    const now = new Date().toISOString();

    const defaults: PersistedProvider[] = [
      {
        id: 'ollama-default',
        name: 'Ollama',
        type: 'ollama',
        baseUrl: 'http://localhost:11434/v1',
        model: 'llama3.2:3b',
        enabled: true,
        isDefault: true,
        lastStatus: 'unknown',
        models: [
          {
            id: 'llama3.2:3b',
            name: 'Llama 3.2 3B',
            contextWindow: 128000,
            supportsStreaming: true,
            supportsTools: true,
            supportsVision: false,
          },
        ],
        priority: 10,
        chatOptions: {
          temperature: 0.7,
          maxTokens: 4096,
          streaming: true,
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'lmstudio-default',
        name: 'LM Studio',
        type: 'lmstudio',
        baseUrl: 'http://localhost:1234/v1',
        model: 'local-model',
        enabled: true,
        isDefault: false,
        lastStatus: 'unknown',
        models: [
          {
            id: 'local-model',
            name: 'Default Model',
            contextWindow: 128000,
            supportsStreaming: true,
            supportsTools: false,
            supportsVision: false,
          },
        ],
        priority: 20,
        chatOptions: {
          temperature: 0.7,
          maxTokens: 4096,
          streaming: true,
        },
        createdAt: now,
        updatedAt: now,
      },
    ];

    for (const p of defaults) {
      this.providers.set(p.id, p);
    }

    this.activeProviderId = 'ollama-default';
    this.save();
    logger.info('provider', 'Seeded default providers (Ollama, LM Studio)');
  }

  // ─── CRUD Operations ──────────────────────────────────────────────────

  /** List all providers */
  list(): PersistedProvider[] {
    this.load();
    return Array.from(this.providers.values());
  }

  /** Get a single provider by ID */
  get(id: string): PersistedProvider | undefined {
    this.load();
    return this.providers.get(id);
  }

  /** Get the default (or first enabled) provider */
  getDefault(): PersistedProvider | undefined {
    this.load();
    // First: find the isDefault + enabled provider
    for (const p of this.providers.values()) {
      if (p.isDefault && p.enabled) return p;
    }
    // Fallback: first enabled provider
    for (const p of this.providers.values()) {
      if (p.enabled) return p;
    }
    // Last resort: first provider
    return this.providers.values().next().value;
  }

  /** Add a new provider */
  add(provider: PersistedProvider): void {
    this.load();
    this.providers.set(provider.id, provider);
    this.save();
  }

  /** Update an existing provider */
  update(id: string, updates: Partial<PersistedProvider>): PersistedProvider | undefined {
    this.load();
    const existing = this.providers.get(id);
    if (!existing) return undefined;

    const updated: PersistedProvider = {
      ...existing,
      ...updates,
      id: existing.id, // Never allow ID change
      updatedAt: new Date().toISOString(),
    };

    this.providers.set(id, updated);
    this.save();
    return updated;
  }

  /** Delete a provider */
  delete(id: string): boolean {
    this.load();
    const deleted = this.providers.delete(id);
    if (deleted) {
      // Clear active/fallback if needed
      if (this.activeProviderId === id) this.activeProviderId = undefined;
      if (this.fallbackProviderId === id) this.fallbackProviderId = undefined;
      this.save();
    }
    return deleted;
  }

  /** Set the default provider */
  setDefault(id: string): PersistedProvider | undefined {
    this.load();
    // Unset all defaults
    for (const [k, p] of this.providers) {
      if (p.isDefault) {
        this.providers.set(k, { ...p, isDefault: false, updatedAt: new Date().toISOString() });
      }
    }
    // Set new default
    const target = this.providers.get(id);
    if (target) {
      this.providers.set(id, { ...target, isDefault: true, updatedAt: new Date().toISOString() });
    }
    this.save();
    return target;
  }

  // ─── Active / Fallback ────────────────────────────────────────────────

  getActiveId(): string | undefined {
    this.load();
    return this.activeProviderId;
  }

  getFallbackId(): string | undefined {
    this.load();
    return this.fallbackProviderId;
  }

  setActiveId(id: string): void {
    this.load();
    this.activeProviderId = id;
    this.save();
  }

  setFallbackId(id: string): void {
    this.load();
    this.fallbackProviderId = id;
    this.save();
  }

  // ─── Utility ──────────────────────────────────────────────────────────

  /** Get the file path for debugging */
  getFilePath(): string {
    return this.filePath;
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const providerStore = new ProviderStore();

/**
 * Convert a persisted provider to a public-facing object for IPC.
 * Masks the API key using the secrets store.
 */
export function providerToPublic(p: PersistedProvider, apiKey?: string): PublicProvider {
  const baseUrl = p.baseUrl ?? '';
  const isLocal = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') || baseUrl.includes('0.0.0.0');

  return {
    id: p.id,
    name: p.name,
    type: p.type,
    baseUrl,
    model: p.model,
    enabled: p.enabled ?? true,
    isDefault: p.isDefault ?? false,
    lastStatus: p.lastStatus ?? 'unknown',
    lastTestedAt: p.lastTestedAt,
    lastError: p.lastError,
    hasApiKey: !!apiKey,
    apiKeyMasked: apiKey ? maskKey(apiKey) : undefined,
    isLocal,
    models: p.models,
    priority: p.priority,
    isActive: p.isActive,
    isFallback: p.isFallback,
    chatOptions: p.chatOptions,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
