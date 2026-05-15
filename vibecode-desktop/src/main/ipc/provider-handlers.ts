// ─── Provider IPC Handlers ──────────────────────────────────────────────────
//
// Enhanced with features from the base software:
// - Provider CRUD with secrets-store integration
// - Streaming SSE chat via raw HTTP (not fetch API)
// - Active abort management for canceling streams
// - Provider testing with friendly error messages
// - Non-streaming chat fallback
// - Model listing from remote providers
// ─────────────────────────────────────────────────────────────────────────────

import { ipcMain, BrowserWindow } from 'electron';
import * as http from 'http';
import * as https from 'https';
import { providerStore, providerToPublic, PersistedProvider, PublicProvider } from '../services/provider-store';
import { secretsStore, maskKey } from '../services/secrets-store';
import { friendlyError, friendlyErrorMessage } from '../utils/friendly-errors';
import { logger } from '../utils/logger';
import { validateWithError } from '../utils/validation';
import {
  ProviderConfigSchema,
  ProviderUpdateSchema,
  ChatMessageSchema,
  ChatCompletionOptionsSchema,
  RouteRequirementsSchema,
  ChatOptionsUpdateSchema,
  IdSchema,
} from '../utils/schemas';
import { auditLog } from '../utils/audit-log';

// ─── Types ──────────────────────────────────────────────────────────────────

interface IpcResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function ok<T>(data: T): IpcResult<T> {
  return { success: true, data };
}

function err(message: string): IpcResult {
  return { success: false, error: message };
}

// ─── Active Abort Management ────────────────────────────────────────────────

const activeAborts = new Map<string, boolean>();

// ─── Helper: Sanitize provider for IPC ──────────────────────────────────────

function sanitizeProvider(p: PersistedProvider): PublicProvider {
  const apiKey = secretsStore.get(p.id);
  return providerToPublic(p, apiKey);
}

// ─── HTTP Helpers (raw HTTP, not fetch) ─────────────────────────────────────

interface HttpResult {
  ok: boolean;
  data: string;
  error?: string;
  statusCode?: number;
}

function httpGet(url: string, apiKey: string | undefined, timeoutMs: number): Promise<HttpResult> {
  const urlObj = new URL(url);
  const isHttps = urlObj.protocol === 'https:';
  const httpModule = isHttps ? https : http;

  return new Promise((resolve) => {
    const options: http.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      timeout: timeoutMs,
    };

    const req = httpModule.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk.toString(); });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, data, statusCode: res.statusCode });
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          resolve({ ok: false, data, error: 'API key rejected. Please check your API key.', statusCode: res.statusCode });
        } else if (res.statusCode === 404) {
          resolve({ ok: false, data, error: 'Model not found. Check the model name and provider URL.', statusCode: res.statusCode });
        } else {
          resolve({ ok: false, data, error: `HTTP ${res.statusCode}: ${data.slice(0, 200)}`, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ ok: false, data: '', error: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, data: '', error: 'Request timed out' });
    });

    req.end();
  });
}

function httpPost(url: string, body: unknown, apiKey: string | undefined, timeoutMs: number): Promise<HttpResult> {
  const urlObj = new URL(url);
  const isHttps = urlObj.protocol === 'https:';
  const httpModule = isHttps ? https : http;
  const payload = JSON.stringify(body);

  return new Promise((resolve) => {
    const options: http.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      timeout: timeoutMs,
    };

    const req = httpModule.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk.toString(); });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, data, statusCode: res.statusCode });
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          resolve({ ok: false, data, error: 'API key rejected. Please check your API key.', statusCode: res.statusCode });
        } else if (res.statusCode === 404) {
          resolve({ ok: false, data, error: 'Model not found. Check the model name and provider URL.', statusCode: res.statusCode });
        } else {
          resolve({ ok: false, data, error: `HTTP ${res.statusCode}: ${data.slice(0, 200)}`, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ ok: false, data: '', error: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, data: '', error: 'Request timed out' });
    });

    req.write(payload);
    req.end();
  });
}

// ─── Provider Test ──────────────────────────────────────────────────────────

async function testProviderConnection(provider: PersistedProvider): Promise<{ ok: boolean; models?: string[]; error?: string; latency?: number }> {
  const apiKey = secretsStore.get(provider.id);
  const baseUrl = (provider.baseUrl ?? '').replace(/\/+$/, '');
  const start = Date.now();

  try {
    // Try GET /models first (OpenAI-compatible)
    const modelsResult = await httpGet(`${baseUrl}/models`, apiKey, 8000);
    if (modelsResult.ok) {
      let modelIds: string[] = [];
      try {
        const parsed = JSON.parse(modelsResult.data);
        if (Array.isArray(parsed.data)) {
          modelIds = parsed.data.map((m: any) => m.id).filter(Boolean);
        }
      } catch { /* Ignore parse errors */ }
      return { ok: true, models: modelIds, latency: Date.now() - start };
    }

    // Fallback: tiny POST /chat/completions
    const chatResult = await httpPost(`${baseUrl}/chat/completions`, {
      model: provider.model ?? provider.models[0]?.id ?? 'default',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 1,
      stream: false,
    }, apiKey, 10000);

    if (chatResult.ok) {
      return { ok: true, latency: Date.now() - start };
    }

    return {
      ok: false,
      error: chatResult.error || 'Provider returned an error',
      latency: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      error: friendlyErrorMessage(err, { name: provider.name, type: provider.type, baseUrl: provider.baseUrl }),
      latency: Date.now() - start,
    };
  }
}

// ─── Streaming Chat (raw HTTP/SSE) ─────────────────────────────────────────

async function streamChat(
  provider: PersistedProvider,
  messages: Array<{ role: string; content: string }>,
  requestId: string,
  sender: Electron.WebContents
): Promise<void> {
  const apiKey = secretsStore.get(provider.id);
  const baseUrl = (provider.baseUrl ?? '').replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;
  const model = provider.model ?? provider.models[0]?.id ?? 'default';
  const payload = JSON.stringify({ model, messages, stream: true });

  activeAborts.set(requestId, false);

  try {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    await new Promise<void>((resolve) => {
      const options: http.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        timeout: 30000,
      };

      const req = httpModule.request(options, (res) => {
        let buffer = '';

        res.on('data', (chunk) => {
          // Check if aborted
          if (activeAborts.get(requestId)) {
            req.destroy();
            try { sender.send('provider:chatDone', { requestId, aborted: true }); } catch { /* Window might be closed */ }
            resolve();
            return;
          }

          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6);
            if (data === '[DONE]') {
              try { sender.send('provider:chatDone', { requestId }); } catch { /* */ }
              resolve();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                try { sender.send('provider:chatChunk', { requestId, content }); } catch { /* */ }
              }
            } catch {
              // Malformed chunk — skip
            }
          }
        });

        res.on('end', () => {
          try { sender.send('provider:chatDone', { requestId }); } catch { /* */ }
          resolve();
        });

        res.on('error', (err) => {
          try {
            sender.send('provider:chatError', {
              requestId,
              error: friendlyErrorMessage(err, { name: provider.name, type: provider.type, baseUrl: provider.baseUrl }),
            });
          } catch { /* */ }
          resolve();
        });
      });

      req.on('error', (err) => {
        try {
          sender.send('provider:chatError', {
            requestId,
            error: friendlyErrorMessage(err, { name: provider.name, type: provider.type, baseUrl: provider.baseUrl }),
          });
        } catch { /* */ }
        resolve();
      });

      req.on('timeout', () => {
        req.destroy();
        try {
          sender.send('provider:chatError', {
            requestId,
            error: 'Endpoint timed out. The provider may be offline or overloaded.',
          });
        } catch { /* */ }
        resolve();
      });

      req.write(payload);
      req.end();
    });
  } catch (err) {
    try {
      sender.send('provider:chatError', {
        requestId,
        error: friendlyErrorMessage(err, { name: provider.name, type: provider.type, baseUrl: provider.baseUrl }),
      });
    } catch { /* */ }
  } finally {
    activeAborts.delete(requestId);
  }
}

// ─── Non-Streaming Chat Fallback ────────────────────────────────────────────

async function chatNonStream(
  provider: PersistedProvider,
  messages: Array<{ role: string; content: string }>
): Promise<{ content?: string; error?: string }> {
  const apiKey = secretsStore.get(provider.id);
  const baseUrl = (provider.baseUrl ?? '').replace(/\/+$/, '');
  const model = provider.model ?? provider.models[0]?.id ?? 'default';

  try {
    const result = await httpPost(`${baseUrl}/chat/completions`, {
      model,
      messages,
      stream: false,
    }, apiKey, 60000);

    if (!result.ok) {
      return { error: result.error || 'Provider returned an error' };
    }

    const parsed = JSON.parse(result.data);
    const content = parsed.choices?.[0]?.message?.content;
    if (!content) {
      return { error: 'Provider returned malformed response — no content found.' };
    }
    return { content };
  } catch (err) {
    return { error: friendlyErrorMessage(err, { name: provider.name, type: provider.type, baseUrl: provider.baseUrl }) };
  }
}

// ─── Handler Registration ───────────────────────────────────────────────────

export function registerProviderHandlers(): void {
  // ── provider:list ──────────────────────────────────────────────────────
  ipcMain.handle('provider:list', async () => {
    try {
      const providers = providerStore.list();
      const sanitized = providers.map(sanitizeProvider);
      return ok({ providers: sanitized });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:add ───────────────────────────────────────────────────────
  ipcMain.handle('provider:add', async (_event, providerData: Partial<PersistedProvider>, apiKey?: string) => {
    try {
      const now = new Date().toISOString();
      const id = providerData.id || `provider-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const provider: PersistedProvider = {
        id,
        name: providerData.name ?? 'New Provider',
        type: providerData.type ?? 'custom',
        baseUrl: providerData.baseUrl ?? '',
        model: providerData.model ?? '',
        enabled: providerData.enabled ?? true,
        isDefault: providerData.isDefault ?? false,
        lastStatus: 'unknown',
        models: providerData.models ?? [],
        priority: providerData.priority ?? 50,
        chatOptions: providerData.chatOptions ?? { temperature: 0.7, maxTokens: 4096, streaming: true },
        createdAt: now,
        updatedAt: now,
      };

      providerStore.add(provider);

      if (apiKey) {
        secretsStore.set(id, apiKey);
      }

      auditLog.auditLog('provider.add', { providerId: id, providerName: provider.name, hasApiKey: !!apiKey });

      return ok({ provider: sanitizeProvider(provider) });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:configure ─────────────────────────────────────────────────
  ipcMain.handle('provider:configure', async (_event, config: any) => {
    try {
      const validation = validateWithError(ProviderConfigSchema, config);
      if (!validation.success) {
        return err(validation.error!);
      }

      const now = new Date().toISOString();
      const id = `provider-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const provider: PersistedProvider = {
        id,
        name: config.name ?? 'New Provider',
        type: config.type ?? 'custom',
        baseUrl: config.baseUrl ?? '',
        model: config.model ?? '',
        enabled: true,
        isDefault: false,
        lastStatus: 'unknown',
        models: config.models ?? [],
        priority: config.priority ?? 50,
        chatOptions: config.chatOptions ?? { temperature: 0.7, maxTokens: 4096, streaming: true },
        createdAt: now,
        updatedAt: now,
      };

      providerStore.add(provider);

      if (config.apiKey) {
        secretsStore.set(id, config.apiKey);
      }

      auditLog.auditLog('provider.configure', { providerId: id, providerName: provider.name, providerType: provider.type });

      return ok({ provider: sanitizeProvider(provider) });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:update ────────────────────────────────────────────────────
  ipcMain.handle('provider:update', async (_event, id: string, updates: any, apiKey?: string) => {
    try {
      const idValidation = validateWithError(IdSchema, id);
      if (!idValidation.success) return err(idValidation.error!);

      // Sanitize updates — never allow direct id/createdAt changes
      const safeUpdates = { ...updates };
      delete safeUpdates.id;
      delete safeUpdates.createdAt;

      const updated = providerStore.update(id, safeUpdates);
      if (!updated) return err(`Provider not found: ${id}`);

      // Handle API key separately via SecretsStore
      if (apiKey !== undefined) {
        if (apiKey === '') {
          secretsStore.delete(id);
        } else {
          secretsStore.set(id, apiKey);
        }
      }

      auditLog.auditLog('provider.update', { providerId: id, hasApiKeyUpdate: apiKey !== undefined });

      return ok({ provider: sanitizeProvider(updated) });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:remove ────────────────────────────────────────────────────
  ipcMain.handle('provider:remove', async (_event, providerId: string) => {
    try {
      const idValidation = validateWithError(IdSchema, providerId);
      if (!idValidation.success) return err(idValidation.error!);

      const removed = providerStore.delete(providerId);
      if (removed) {
        secretsStore.delete(providerId);
      }
      auditLog.auditLog('provider.remove', { providerId, removed });
      return ok({ removed, providerId });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:test (enhanced with friendly errors) ──────────────────────
  ipcMain.handle('provider:test', async (_event, providerId: string) => {
    try {
      const idValidation = validateWithError(IdSchema, providerId);
      if (!idValidation.success) return err(idValidation.error!);

      const provider = providerStore.get(providerId);
      if (!provider) return err(`Provider not found: ${providerId}`);

      const result = await testProviderConnection(provider);

      // Update status
      providerStore.update(providerId, {
        lastStatus: result.ok ? 'connected' : 'failed',
        lastTestedAt: new Date().toISOString(),
        lastError: result.ok ? undefined : result.error,
      });

      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:testConnection (new: test with friendly error details) ───
  ipcMain.handle('provider:testConnection', async (_event, providerId: string) => {
    try {
      const provider = providerStore.get(providerId);
      if (!provider) return err(`Provider not found: ${providerId}`);

      const result = await testProviderConnection(provider);

      // Update status
      providerStore.update(providerId, {
        lastStatus: result.ok ? 'connected' : 'failed',
        lastTestedAt: new Date().toISOString(),
        lastError: result.ok ? undefined : result.error,
      });

      if (result.ok) {
        return ok({
          connected: true,
          latency: result.latency,
          models: result.models,
          provider: sanitizeProvider(providerStore.get(providerId)!),
        });
      } else {
        const friendly = friendlyError(new Error(result.error ?? 'Connection failed'), {
          name: provider.name,
          type: provider.type,
          baseUrl: provider.baseUrl,
        });
        return ok({
          connected: false,
          error: friendly.message,
          code: friendly.code,
          userFixable: friendly.userFixable,
          suggestion: friendly.suggestion,
          latency: result.latency,
          provider: sanitizeProvider(providerStore.get(providerId)!),
        });
      }
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:getModels (new: list available models from provider) ──────
  ipcMain.handle('provider:getModels', async (_event, providerId: string) => {
    try {
      const provider = providerStore.get(providerId);
      if (!provider) return err(`Provider not found: ${providerId}`);

      const apiKey = secretsStore.get(providerId);
      const baseUrl = (provider.baseUrl ?? '').replace(/\/+$/, '');

      // Try to fetch models from the provider
      const result = await httpGet(`${baseUrl}/models`, apiKey, 8000);

      if (result.ok) {
        let models: string[] = [];
        try {
          const parsed = JSON.parse(result.data);
          if (Array.isArray(parsed.data)) {
            models = parsed.data.map((m: any) => m.id).filter(Boolean);
          }
        } catch { /* Ignore */ }
        return ok({ models, cached: false });
      }

      // Fallback: return configured models
      return ok({
        models: provider.models.map(m => m.id),
        cached: true,
      });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:chatStream (new: streaming SSE chat via raw HTTP) ─────────
  ipcMain.handle('provider:chatStream', async (event, providerId: string, messages: Array<{ role: string; content: string }>, requestId?: string) => {
    try {
      const provider = providerStore.get(providerId);
      if (!provider) return err(`Provider not found: ${providerId}`);

      if (!provider.enabled) return err(`Provider "${provider.name}" is disabled. Enable it first.`);

      const reqId = requestId || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Start streaming in the background — return immediately
      streamChat(provider, messages, reqId, event.sender).catch((err) => {
        logger.error('provider', 'Stream chat failed', { requestId: reqId, error: String(err) });
      });

      return ok({ requestId: reqId, streaming: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:chatAbort (new: abort active stream) ─────────────────────
  ipcMain.handle('provider:chatAbort', async (_event, requestId: string) => {
    try {
      if (activeAborts.has(requestId)) {
        activeAborts.set(requestId, true);
        return ok({ aborted: true, requestId });
      }
      return ok({ aborted: false, requestId, message: 'No active stream with that requestId' });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:chat (existing: full chat with streaming via IPC events) ──
  ipcMain.handle(
    'provider:chat',
    async (event, providerId: string, model: string, messages: any[], options?: any) => {
      try {
        const idValidation = validateWithError(IdSchema, providerId);
        if (!idValidation.success) return err(idValidation.error!);
        if (!model || typeof model !== 'string') return err('Model is required and must be a string');
        if (!Array.isArray(messages)) return err('Messages must be an array');

        const provider = providerStore.get(providerId);
        if (!provider) return err(`Provider not found: ${providerId}`);

        // Use non-streaming chat for simplicity in this handler
        const result = await chatNonStream(provider, messages.map((m: any) => ({ role: m.role, content: m.content })));

        if (result.error) {
          return err(result.error);
        }

        return ok({ content: result.content, providerId, model });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── provider:models (existing: configured models) ──────────────────────
  ipcMain.handle('provider:models', async (_event, providerId: string) => {
    try {
      const idValidation = validateWithError(IdSchema, providerId);
      if (!idValidation.success) return err(idValidation.error!);

      const provider = providerStore.get(providerId);
      if (!provider) return err(`Provider not found: ${providerId}`);

      return ok({ models: provider.models });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:checkHealth ───────────────────────────────────────────────
  ipcMain.handle('provider:checkHealth', async () => {
    try {
      const providers = providerStore.list();
      const results = await Promise.allSettled(
        providers.map(async (p) => {
          const result = await testProviderConnection(p);
          providerStore.update(p.id, {
            lastStatus: result.ok ? 'connected' : 'failed',
            lastTestedAt: new Date().toISOString(),
            lastError: result.ok ? undefined : result.error,
          });
          return { id: p.id, ok: result.ok, latency: result.latency };
        })
      );

      const updated = providerStore.list().map(sanitizeProvider);
      return ok({ providers: updated });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:setActive ─────────────────────────────────────────────────
  ipcMain.handle('provider:setActive', async (_event, id: string) => {
    try {
      const idValidation = validateWithError(IdSchema, id);
      if (!idValidation.success) return err(idValidation.error!);

      providerStore.setActiveId(id);
      auditLog.auditLog('provider.setActive', { providerId: id });
      return ok({ id, active: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:getActive ─────────────────────────────────────────────────
  ipcMain.handle('provider:getActive', async () => {
    try {
      const activeId = providerStore.getActiveId();
      if (!activeId) {
        const defaultProvider = providerStore.getDefault();
        if (!defaultProvider) return ok({ provider: null });
        return ok({ provider: sanitizeProvider(defaultProvider) });
      }
      const provider = providerStore.get(activeId);
      if (!provider) return ok({ provider: null });
      return ok({ provider: sanitizeProvider(provider) });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:setFallback ───────────────────────────────────────────────
  ipcMain.handle('provider:setFallback', async (_event, id: string) => {
    try {
      const idValidation = validateWithError(IdSchema, id);
      if (!idValidation.success) return err(idValidation.error!);

      providerStore.setFallbackId(id);
      return ok({ id, fallback: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:getConfig ─────────────────────────────────────────────────
  ipcMain.handle('provider:getConfig', async (_event, id: string) => {
    try {
      const provider = providerStore.get(id);
      if (!provider) return err(`Provider not found: ${id}`);
      return ok({ config: sanitizeProvider(provider) });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:getChatOptions ────────────────────────────────────────────
  ipcMain.handle('provider:getChatOptions', async (_event, id: string) => {
    try {
      const provider = providerStore.get(id);
      if (!provider) return err(`Provider not found: ${id}`);
      return ok({ chatOptions: provider.chatOptions ?? { temperature: 0.7, maxTokens: 4096, streaming: true } });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:setChatOptions ────────────────────────────────────────────
  ipcMain.handle('provider:setChatOptions', async (_event, id: string, options: any) => {
    try {
      const optValidation = validateWithError(ChatOptionsUpdateSchema, options);
      if (!optValidation.success) return err(optValidation.error!);

      const updated = providerStore.update(id, { chatOptions: { ...options } });
      if (!updated) return err(`Provider not found: ${id}`);
      return ok({ id, chatOptions: updated.chatOptions });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:setDefault ────────────────────────────────────────────────
  ipcMain.handle('provider:setDefault', async (_event, id: string) => {
    try {
      const result = providerStore.setDefault(id);
      if (!result) return err(`Provider not found: ${id}`);
      return ok({ provider: sanitizeProvider(result) });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:getDefault ────────────────────────────────────────────────
  ipcMain.handle('provider:getDefault', async () => {
    try {
      const provider = providerStore.getDefault();
      if (!provider) return ok({ provider: null });
      return ok({ provider: sanitizeProvider(provider) });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  logger.info('ipc', 'Provider handlers registered (with streaming, testing, friendly errors)');
}
