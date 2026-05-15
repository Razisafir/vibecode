// ============================================================
// VibeCode Desktop — Provider Store Tests
// Tests CRUD operations, auto-seeding defaults, active/fallback
// management, API key exclusion from persistence, legacy key
// migration, key masking, and atomic writes.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProviderStore, PersistedProvider, maskApiKey, providerToPublic } from '../main/services/provider-store';

// We need to mock the paths utility to use a temp directory
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vibecode-provider-'));
}

function cleanupDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// Create a testable ProviderStore that uses a temp directory
class TestableProviderStore extends ProviderStore {
  constructor(filePath: string) {
    super();
    // Override the filePath to use temp directory
    (this as any).filePath = filePath;
    // Reset loaded state so the store re-reads from the new path
    (this as any).loaded = false;
    (this as any).providers = new Map();
    (this as any).activeProviderId = undefined;
    (this as any).fallbackProviderId = undefined;
  }
}

// Legacy XOR obfuscation (for migration tests — mirrors private implementation)
const OBFUSCATION_KEY = 'VibeCodeDesktop2024ObfuscationKey';
function xorObfuscate(plaintext: string): string {
  const chars: string[] = [];
  for (let i = 0; i < plaintext.length; i++) {
    const charCode = plaintext.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
    chars.push(String.fromCharCode(charCode));
  }
  return Buffer.from(chars.join(''), 'binary').toString('base64');
}

// Helper to write a providers.json directly (bypasses the store's save logic)
interface ProviderStoreData {
  version: number;
  providers: PersistedProvider[];
  activeProviderId?: string;
  fallbackProviderId?: string;
}

function writeProvidersFile(filePath: string, data: ProviderStoreData): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Helper to create a well-formed provider with sensible defaults
function makeProvider(overrides: Partial<PersistedProvider> = {}): PersistedProvider {
  return {
    id: 'test-provider',
    name: 'Test Provider',
    type: 'openai',
    models: [],
    priority: 1,
    ...overrides,
  };
}

describe('ProviderStore', () => {
  let tempDir: string;
  let store: TestableProviderStore;
  let testFilePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    testFilePath = path.join(tempDir, 'providers.json');
    store = new TestableProviderStore(testFilePath);
  });

  afterEach(() => {
    cleanupDir(tempDir);
  });

  // ── Auto-Seed Defaults ──────────────────────────────────────────────────

  describe('auto-seeding defaults', () => {
    it('should auto-seed Ollama and LM Studio when no file exists', () => {
      const providers = store.list();
      expect(providers).toHaveLength(2);
      expect(providers.find(p => p.id === 'ollama-default')).toBeDefined();
      expect(providers.find(p => p.id === 'lmstudio-default')).toBeDefined();
    });

    it('should set Ollama as the active provider after seeding', () => {
      store.list(); // trigger load + seed
      expect(store.getActiveId()).toBe('ollama-default');
    });

    it('should set Ollama as the default provider after seeding', () => {
      const defaultProvider = store.getDefault();
      expect(defaultProvider).toBeDefined();
      expect(defaultProvider!.id).toBe('ollama-default');
      expect(defaultProvider!.isDefault).toBe(true);
    });

    it('should seed defaults when file exists but has no providers', () => {
      writeProvidersFile(testFilePath, { version: 1, providers: [] });
      const freshStore = new TestableProviderStore(testFilePath);
      const providers = freshStore.list();
      expect(providers).toHaveLength(2);
    });
  });

  // ── CRUD Operations ────────────────────────────────────────────────────

  describe('CRUD operations', () => {
    it('should add a provider', () => {
      store.add(makeProvider({ id: 'openai-1', name: 'OpenAI' }));
      const provider = store.get('openai-1');
      expect(provider).toBeDefined();
      expect(provider!.name).toBe('OpenAI');
    });

    it('should list all providers including auto-seeded defaults', () => {
      store.add(makeProvider({ id: 'p1', name: 'Provider 1' }));
      store.add(makeProvider({ id: 'p2', name: 'Provider 2' }));
      // 2 added + 2 auto-seeded defaults = 4
      const providers = store.list();
      expect(providers).toHaveLength(4);
    });

    it('should get a provider by ID', () => {
      store.add(makeProvider({ id: 'openai-1', name: 'OpenAI', type: 'openai' }));
      const provider = store.get('openai-1');
      expect(provider).toBeDefined();
      expect(provider!.name).toBe('OpenAI');
      expect(provider!.type).toBe('openai');
    });

    it('should return undefined for non-existent provider', () => {
      expect(store.get('non-existent')).toBeUndefined();
    });

    it('should update a provider', () => {
      store.add(makeProvider({ id: 'openai-1', name: 'OpenAI' }));
      const updated = store.update('openai-1', { name: 'OpenAI Updated' });
      expect(updated).toBeDefined();
      expect(updated!.name).toBe('OpenAI Updated');
      expect(updated!.id).toBe('openai-1'); // ID should not change
    });

    it('should return undefined when updating non-existent provider', () => {
      const result = store.update('non-existent', { name: 'Nope' });
      expect(result).toBeUndefined();
    });

    it('should set updatedAt on update', () => {
      store.add(makeProvider({ id: 'p1', name: 'Before', updatedAt: '2024-01-01T00:00:00.000Z' }));
      const updated = store.update('p1', { name: 'After' });
      expect(updated!.updatedAt).not.toBe('2024-01-01T00:00:00.000Z');
    });

    it('should delete a provider', () => {
      store.add(makeProvider({ id: 'keep-me', name: 'Keep Me' }));
      store.add(makeProvider({ id: 'delete-me', name: 'Delete Me' }));

      const deleted = store.delete('delete-me');
      expect(deleted).toBe(true);
      expect(store.get('delete-me')).toBeUndefined();
      expect(store.get('keep-me')).toBeDefined();
    });

    it('should return false when deleting non-existent provider', () => {
      const deleted = store.delete('non-existent');
      expect(deleted).toBe(false);
    });

    it('should persist providers across store instances', () => {
      store.add(makeProvider({ id: 'persist-1', name: 'Persisted', baseUrl: 'http://localhost:1234' }));

      const freshStore = new TestableProviderStore(testFilePath);
      const provider = freshStore.get('persist-1');
      expect(provider).toBeDefined();
      expect(provider!.name).toBe('Persisted');
    });
  });

  // ── Default Provider ───────────────────────────────────────────────────

  describe('default provider', () => {
    it('should set a provider as default and unset previous default', () => {
      store.add(makeProvider({ id: 'p1', name: 'Provider 1', enabled: true, isDefault: true }));
      store.add(makeProvider({ id: 'p2', name: 'Provider 2', enabled: true, isDefault: false }));

      const result = store.setDefault('p2');
      expect(result).toBeDefined();
      expect(store.get('p2')!.isDefault).toBe(true);
      expect(store.get('p1')!.isDefault).toBe(false);
    });

    it('getDefault should return the enabled default provider', () => {
      // Pre-write file to avoid auto-seeded defaults interfering
      writeProvidersFile(testFilePath, {
        version: 1,
        providers: [
          makeProvider({ id: 'p1', name: 'Provider 1', enabled: true, isDefault: true }),
          makeProvider({ id: 'p2', name: 'Provider 2', enabled: true, isDefault: false }),
        ],
      });
      const freshStore = new TestableProviderStore(testFilePath);

      const defaultP = freshStore.getDefault();
      expect(defaultP).toBeDefined();
      expect(defaultP!.id).toBe('p1');
    });

    it('getDefault should fallback to first enabled provider if no default', () => {
      writeProvidersFile(testFilePath, {
        version: 1,
        providers: [
          makeProvider({ id: 'p1', name: 'Provider 1', enabled: true, isDefault: false }),
          makeProvider({ id: 'p2', name: 'Provider 2', enabled: true, isDefault: false }),
        ],
      });
      const freshStore = new TestableProviderStore(testFilePath);
      const defaultP = freshStore.getDefault();
      expect(defaultP).toBeDefined();
      expect(defaultP!.enabled).toBe(true);
    });
  });

  // ── Active / Fallback ──────────────────────────────────────────────────

  describe('active and fallback providers', () => {
    it('should set and get active provider ID', () => {
      store.add(makeProvider({ id: 'p1', name: 'Provider 1' }));
      store.setActiveId('p1');
      expect(store.getActiveId()).toBe('p1');
    });

    it('should set and get fallback provider ID', () => {
      store.add(makeProvider({ id: 'p1', name: 'Provider 1' }));
      store.setFallbackId('p1');
      expect(store.getFallbackId()).toBe('p1');
    });

    it('should clear active ID when deleting the active provider', () => {
      store.add(makeProvider({ id: 'active-1', name: 'Active Provider' }));
      store.setActiveId('active-1');
      store.delete('active-1');
      expect(store.getActiveId()).toBeUndefined();
    });

    it('should clear fallback ID when deleting the fallback provider', () => {
      store.add(makeProvider({ id: 'fallback-1', name: 'Fallback Provider' }));
      store.setFallbackId('fallback-1');
      store.delete('fallback-1');
      expect(store.getFallbackId()).toBeUndefined();
    });

    it('should not affect other providers when deleting one', () => {
      store.add(makeProvider({ id: 'provider-a', name: 'Provider A' }));
      store.add(makeProvider({ id: 'provider-b', name: 'Provider B' }));
      store.setFallbackId('provider-b');
      store.delete('provider-a');
      expect(store.get('provider-b')).toBeDefined();
      expect(store.getFallbackId()).toBe('provider-b');
    });

    it('should persist active and fallback IDs across store instances', () => {
      store.add(makeProvider({ id: 'p1', name: 'Provider 1' }));
      store.add(makeProvider({ id: 'p2', name: 'Provider 2' }));
      store.setActiveId('p1');
      store.setFallbackId('p2');

      const freshStore = new TestableProviderStore(testFilePath);
      expect(freshStore.getActiveId()).toBe('p1');
      expect(freshStore.getFallbackId()).toBe('p2');
    });
  });

  // ── API Key Handling ───────────────────────────────────────────────────

  describe('API key handling', () => {
    it('should NOT persist API keys to the providers.json file', () => {
      store.add(makeProvider({ id: 'openai-1', name: 'OpenAI', apiKey: 'sk-test-api-key-12345678' }));

      // Read the raw file to verify key is NOT present
      const raw = fs.readFileSync(testFilePath, 'utf-8');
      const rawData = JSON.parse(raw);
      expect(rawData.providers.find((p: any) => p.id === 'openai-1').apiKey).toBeUndefined();
    });

    it('should de-obfuscate legacy API keys on load (migration)', () => {
      const testKey = 'sk-test-secret-key-12345';
      const obfuscatedKey = xorObfuscate(testKey);

      writeProvidersFile(testFilePath, {
        version: 1,
        providers: [
          makeProvider({ id: 'legacy-1', name: 'Legacy Provider', apiKey: obfuscatedKey }),
        ],
      });

      const freshStore = new TestableProviderStore(testFilePath);
      const provider = freshStore.get('legacy-1');
      expect(provider).toBeDefined();
      expect(provider!.apiKey).toBe(testKey);
    });

    it('should handle plaintext API keys that fail de-obfuscation gracefully', () => {
      // If a key can't be de-obfuscated, it's used as-is (plaintext fallback)
      writeProvidersFile(testFilePath, {
        version: 1,
        providers: [
          makeProvider({ id: 'plain-1', name: 'Plain Key Provider', apiKey: 'not-valid-base64!!!' }),
        ],
      });

      const freshStore = new TestableProviderStore(testFilePath);
      const provider = freshStore.get('plain-1');
      expect(provider).toBeDefined();
      // The key should still be present (used as plaintext since de-obfuscation failed)
      expect(provider!.apiKey).toBeTruthy();
    });

    it('should remove API key from file on next save after loading legacy key', () => {
      const testKey = 'sk-migration-key';
      const obfuscatedKey = xorObfuscate(testKey);

      writeProvidersFile(testFilePath, {
        version: 1,
        providers: [
          makeProvider({ id: 'legacy-1', name: 'Legacy Provider', apiKey: obfuscatedKey }),
        ],
      });

      const freshStore = new TestableProviderStore(testFilePath);
      // Trigger a save by updating
      freshStore.update('legacy-1', { name: 'Updated Legacy' });

      // Now the file should NOT have the apiKey
      const raw = fs.readFileSync(testFilePath, 'utf-8');
      const rawData = JSON.parse(raw);
      expect(rawData.providers.find((p: any) => p.id === 'legacy-1').apiKey).toBeUndefined();
    });
  });

  // ── Key Masking in Logs ────────────────────────────────────────────────

  describe('maskApiKey', () => {
    it('should mask long API keys showing first 8 and last 4 chars', () => {
      const masked = maskApiKey('sk-test-api-key-12345678');
      expect(masked).toBe('sk-test-...5678');
    });

    it('should return *** for short API keys', () => {
      const masked = maskApiKey('short');
      expect(masked).toBe('***');
    });

    it('should return undefined for undefined input', () => {
      const masked = maskApiKey(undefined);
      expect(masked).toBeUndefined();
    });

    it('should mask exactly 12-character keys as *** (boundary)', () => {
      const masked = maskApiKey('123456789012');
      expect(masked).toBe('***');
    });

    it('should handle 13-character keys with first 8 and last 4', () => {
      const masked = maskApiKey('1234567890123');
      expect(masked).toBe('12345678...0123');
    });
  });

  // ── Atomic Writes ──────────────────────────────────────────────────────

  describe('atomic writes', () => {
    it('should write via temp file and rename', () => {
      store.add(makeProvider({ id: 'atomic-1', name: 'Atomic Test' }));

      expect(fs.existsSync(testFilePath)).toBe(true);
      expect(fs.existsSync(testFilePath + '.tmp')).toBe(false);
    });
  });

  // ── Chat Options Persistence ───────────────────────────────────────────

  describe('chat options persistence', () => {
    it('should persist and load chat options', () => {
      store.add(makeProvider({
        id: 'chat-opts-1',
        name: 'Chat Options Provider',
        chatOptions: {
          temperature: 0.7,
          maxTokens: 4096,
          streaming: true,
          model: 'gpt-4-turbo',
        },
      }));

      const freshStore = new TestableProviderStore(testFilePath);
      const provider = freshStore.get('chat-opts-1');
      expect(provider!.chatOptions).toBeDefined();
      expect(provider!.chatOptions!.temperature).toBe(0.7);
      expect(provider!.chatOptions!.maxTokens).toBe(4096);
      expect(provider!.chatOptions!.streaming).toBe(true);
      expect(provider!.chatOptions!.model).toBe('gpt-4-turbo');
    });
  });

  // ── providerToPublic ───────────────────────────────────────────────────

  describe('providerToPublic', () => {
    it('should convert a persisted provider to a public provider with API key info', () => {
      const provider = makeProvider({
        id: 'public-1',
        name: 'Public Test',
        baseUrl: 'http://localhost:11434',
        enabled: true,
        isDefault: true,
        priority: 5,
      });

      const pub = providerToPublic(provider, 'sk-test-key-12345678');
      expect(pub.id).toBe('public-1');
      expect(pub.name).toBe('Public Test');
      expect(pub.hasApiKey).toBe(true);
      expect(pub.apiKeyMasked).toBe('sk-...5678'); // maskKey uses first 3 + ... + last 4
      expect(pub.isLocal).toBe(true);
      expect(pub.enabled).toBe(true);
      expect(pub.isDefault).toBe(true);
      expect(pub.priority).toBe(5);
    });

    it('should handle provider without API key', () => {
      const provider = makeProvider({ id: 'no-key-1', baseUrl: 'https://api.openai.com/v1' });
      const pub = providerToPublic(provider);
      expect(pub.hasApiKey).toBe(false);
      expect(pub.apiKeyMasked).toBeUndefined();
      expect(pub.isLocal).toBe(false);
    });

    it('should default enabled to true and isDefault to false when undefined', () => {
      const provider = makeProvider({ id: 'defaults-1' });
      // enabled and isDefault are undefined in makeProvider
      const pub = providerToPublic(provider);
      expect(pub.enabled).toBe(true);
      expect(pub.isDefault).toBe(false);
    });
  });
});
