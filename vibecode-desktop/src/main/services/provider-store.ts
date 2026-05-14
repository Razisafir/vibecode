// ─── Provider Store — Secure Persistence with XOR Obfuscation ──────────────
//
// Persists provider configurations to ~/.vibecode/providers.json.
// API keys are XOR-obfuscated before storage and de-obfuscated on load.
// Full API keys are never logged — only first 8 + last 4 chars.

import fs from 'fs';
import path from 'path';
import { getVibeCodeDir, getProvidersConfigPath, ensureDirectories } from '../utils/paths';

// ─── Obfuscation Key ────────────────────────────────────────────────────────
// A static key used for XOR obfuscation. Not cryptographically secure —
// the goal is to avoid storing plaintext API keys on disk.

const OBFUSCATION_KEY = 'VibeCodeDesktop2024ObfuscationKey';

function xorObfuscate(plaintext: string): string {
  const chars: string[] = [];
  for (let i = 0; i < plaintext.length; i++) {
    const charCode = plaintext.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
    chars.push(String.fromCharCode(charCode));
  }
  // Encode to base64 so the result is safe for JSON
  return Buffer.from(chars.join(''), 'binary').toString('base64');
}

function xorDeobfuscate(obfuscated: string): string {
  const decoded = Buffer.from(obfuscated, 'base64').toString('binary');
  const chars: string[] = [];
  for (let i = 0; i < decoded.length; i++) {
    const charCode = decoded.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
    chars.push(String.fromCharCode(charCode));
  }
  return chars.join('');
}

export function maskApiKey(apiKey: string | undefined): string | undefined {
  if (!apiKey) return undefined;
  if (apiKey.length <= 12) return '***';
  return `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PersistedProvider {
  id: string;
  name: string;
  type: string;
  apiKey?: string;       // obfuscated in file, de-obfuscated in memory
  baseUrl?: string;
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
}

interface ProviderStoreData {
  version: number;
  providers: PersistedProvider[];
  activeProviderId?: string;
  fallbackProviderId?: string;
}

// ─── ProviderStore Class ────────────────────────────────────────────────────

export class ProviderStore {
  private filePath: string;

  constructor() {
    ensureDirectories();
    this.filePath = getProvidersConfigPath();
  }

  // ─── Load ─────────────────────────────────────────────────────────────

  /** Load persisted providers from disk, de-obfuscating API keys */
  loadProviders(): ProviderStoreData {
    try {
      if (!fs.existsSync(this.filePath)) {
        return { version: 1, providers: [] };
      }

      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const data: ProviderStoreData = JSON.parse(raw);

      // De-obfuscate API keys
      if (data.providers) {
        for (const provider of data.providers) {
          if (provider.apiKey) {
            try {
              provider.apiKey = xorDeobfuscate(provider.apiKey);
            } catch {
              // If de-obfuscation fails, the key was stored as plaintext
              // (e.g., from a previous version). Leave it as-is.
              console.log(
                `[ProviderStore] Could not de-obfuscate key for ${provider.name}, using raw value`
              );
            }
          }
        }
      }

      return data;
    } catch (error) {
      console.error('[ProviderStore] Failed to load providers:', error);
      return { version: 1, providers: [] };
    }
  }

  // ─── Save ─────────────────────────────────────────────────────────────

  /** Save providers to disk, obfuscating API keys before writing */
  saveProviders(
    providers: PersistedProvider[],
    activeProviderId?: string,
    fallbackProviderId?: string
  ): void {
    try {
      // Deep-clone and obfuscate API keys for storage
      const toStore: PersistedProvider[] = providers.map((p) => {
        const clone = { ...p };
        if (clone.apiKey) {
          // Log masked key for debugging, never the full key
          console.log(`[ProviderStore] Saving API key for ${clone.name}: ${maskApiKey(clone.apiKey)}`);
          clone.apiKey = xorObfuscate(clone.apiKey);
        }
        return clone;
      });

      const data: ProviderStoreData = {
        version: 1,
        providers: toStore,
        activeProviderId,
        fallbackProviderId,
      };

      // Write atomically via temp file
      const tmpPath = this.filePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.filePath);

      console.log(`[ProviderStore] Saved ${providers.length} providers`);
    } catch (error) {
      console.error('[ProviderStore] Failed to save providers:', error);
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────────

  /** Remove a single provider from the persisted file */
  deleteProvider(id: string): void {
    const data = this.loadProviders();
    const filtered = data.providers.filter((p) => p.id !== id);
    const updatedActiveId = data.activeProviderId === id ? undefined : data.activeProviderId;
    const updatedFallbackId = data.fallbackProviderId === id ? undefined : data.fallbackProviderId;
    this.saveProviders(filtered, updatedActiveId, updatedFallbackId);
  }

  // ─── Utility ──────────────────────────────────────────────────────────

  /** Get the file path for debugging */
  getFilePath(): string {
    return this.filePath;
  }
}
