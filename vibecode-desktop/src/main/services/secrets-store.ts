// ─── Secrets Store — Secure API Key Storage ─────────────────────────────────
//
// Stores API keys per provider ID, separately from provider metadata.
// Uses Electron's safeStorage when available for encryption at rest.
// Falls back to XOR-obfuscated file storage if safeStorage is unavailable.
// Keys are never logged in full — only masked versions are displayed.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { getSecretsConfigPath, ensureDirectories } from '../utils/paths';
import { logger } from '../utils/logger';

// ─── Obfuscation Fallback ───────────────────────────────────────────────────
// When safeStorage is not available, we use XOR obfuscation.
// Not cryptographically secure, but avoids storing plaintext API keys on disk.

const OBFUSCATION_KEY = 'VibeCodeSecrets2024ObfuscationKey';

function xorObfuscate(plaintext: string): string {
  const chars: string[] = [];
  for (let i = 0; i < plaintext.length; i++) {
    const charCode = plaintext.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length);
    chars.push(String.fromCharCode(charCode));
  }
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

// ─── Key Masking ────────────────────────────────────────────────────────────

/**
 * Mask an API key for safe display.
 * Shows first 3 chars + "..." + last 4 chars.
 * Short keys are fully masked.
 */
export function maskKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  if (key.length <= 8) return '****';
  return key.slice(0, 3) + '...' + key.slice(-4);
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface SecretsData {
  version: number;
  /** Map of provider ID → encrypted/obfuscated API key */
  secrets: Record<string, string>;
  /** Whether safeStorage was used for encryption */
  safeStorageUsed: boolean;
}

// ─── SecretsStore Class ─────────────────────────────────────────────────────

export class SecretsStore {
  private filePath: string;
  private secrets: Map<string, string> = new Map();
  private loaded: boolean = false;
  private safeStorageAvailable: boolean = false;

  constructor() {
    ensureDirectories();
    this.filePath = getSecretsConfigPath();
    this.detectSafeStorage();
  }

  // ─── SafeStorage Detection ────────────────────────────────────────────

  private detectSafeStorage(): void {
    try {
      // safeStorage is only available in the main process after app.whenReady()
      const { safeStorage } = require('electron');
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        this.safeStorageAvailable = true;
        logger.info('provider', 'Electron safeStorage is available — keys will be encrypted');
      } else {
        logger.info('provider', 'Electron safeStorage not available — using XOR obfuscation fallback');
      }
    } catch {
      logger.info('provider', 'Electron safeStorage not available — using XOR obfuscation fallback');
    }
  }

  // ─── Load ─────────────────────────────────────────────────────────────

  private load(): void {
    if (this.loaded) return;

    try {
      if (!fs.existsSync(this.filePath)) {
        this.loaded = true;
        return;
      }

      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const data: SecretsData = JSON.parse(raw);

      if (data.secrets && typeof data.secrets === 'object') {
        for (const [providerId, encryptedKey] of Object.entries(data.secrets)) {
          if (typeof encryptedKey === 'string') {
            try {
              if (data.safeStorageUsed && this.safeStorageAvailable) {
                // Decrypt using safeStorage
                const { safeStorage } = require('electron');
                const buffer = Buffer.from(encryptedKey, 'base64');
                const decrypted = safeStorage.decryptString(buffer);
                this.secrets.set(providerId, decrypted);
              } else {
                // Decrypt using XOR obfuscation
                const decrypted = xorDeobfuscate(encryptedKey);
                this.secrets.set(providerId, decrypted);
              }
            } catch (decryptErr) {
              // Try fallback: maybe it was stored with XOR even though safeStorageUsed was true
              try {
                const decrypted = xorDeobfuscate(encryptedKey);
                this.secrets.set(providerId, decrypted);
                logger.warn('provider', `Fallback XOR decryption used for key of provider ${providerId}`);
              } catch {
                logger.error('provider', `Failed to decrypt key for provider ${providerId}`, {
                  error: String(decryptErr),
                });
              }
            }
          }
        }
      }
    } catch (err) {
      logger.error('provider', 'Failed to load secrets store', { error: String(err) });
    }

    this.loaded = true;
  }

  // ─── Save ─────────────────────────────────────────────────────────────

  private save(): void {
    try {
      const secretsObj: Record<string, string> = {};

      for (const [providerId, apiKey] of this.secrets) {
        if (this.safeStorageAvailable) {
          try {
            const { safeStorage } = require('electron');
            const encrypted = safeStorage.encryptString(apiKey);
            secretsObj[providerId] = encrypted.toString('base64');
          } catch {
            // Fallback to XOR if safeStorage fails for this key
            secretsObj[providerId] = xorObfuscate(apiKey);
          }
        } else {
          secretsObj[providerId] = xorObfuscate(apiKey);
        }
      }

      const data: SecretsData = {
        version: 1,
        secrets: secretsObj,
        safeStorageUsed: this.safeStorageAvailable,
      };

      // Write atomically via temp file
      const tmpPath = this.filePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.filePath);

      logger.debug('provider', `Saved ${this.secrets.size} secrets`);
    } catch (err) {
      logger.error('provider', 'Failed to save secrets store', { error: String(err) });
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────

  /** Get the decrypted API key for a provider */
  get(providerId: string): string | undefined {
    this.load();
    return this.secrets.get(providerId);
  }

  /** Store an API key for a provider */
  set(providerId: string, apiKey: string): void {
    this.load();
    this.secrets.set(providerId, apiKey);
    this.save();
    logger.info('provider', `API key stored for provider ${providerId}: ${maskKey(apiKey)}`);
  }

  /** Delete the API key for a provider */
  delete(providerId: string): boolean {
    this.load();
    const deleted = this.secrets.delete(providerId);
    if (deleted) {
      this.save();
      logger.info('provider', `API key deleted for provider ${providerId}`);
    }
    return deleted;
  }

  /** Check if a provider has an API key stored */
  has(providerId: string): boolean {
    this.load();
    return this.secrets.has(providerId);
  }

  /** Get the masked API key for safe display */
  getMasked(providerId: string): string | undefined {
    this.load();
    const key = this.secrets.get(providerId);
    return maskKey(key);
  }

  /** List all provider IDs that have API keys */
  listProviderIds(): string[] {
    this.load();
    return Array.from(this.secrets.keys());
  }

  /** Get the file path for debugging */
  getFilePath(): string {
    return this.filePath;
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

export const secretsStore = new SecretsStore();
