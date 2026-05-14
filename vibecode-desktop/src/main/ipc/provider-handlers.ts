import { ipcMain, BrowserWindow } from 'electron';
import { ProviderManager, ProviderConfig, ProviderType, ChatMessage, ChatCompletionOptions, RouteRequirements, ChatOptions } from '../services/provider-manager';
import { maskApiKey } from '../services/provider-store';
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

// ─── Helper: Sanitize provider for IPC ──────────────────────────────────────

function sanitizeProvider(provider: ReturnType<ProviderManager['getProvider']>) {
  if (!provider) return null;
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    apiKey: maskApiKey(provider.apiKey),
    baseUrl: provider.baseUrl,
    models: provider.models,
    isAvailable: provider.isAvailable,
    lastChecked: provider.lastChecked,
    latency: provider.latency,
    priority: provider.priority,
    isActive: provider.isActive ?? false,
    isFallback: provider.isFallback ?? false,
    chatOptions: provider.chatOptions,
  };
}

// ─── Singleton Provider Manager ─────────────────────────────────────────────

const providerManager = new ProviderManager();

// ─── Handler Registration ───────────────────────────────────────────────────

export function registerProviderHandlers(): void {
  // ── provider:list ──────────────────────────────────────────────────────
  ipcMain.handle('provider:list', async () => {
    try {
      const providers = providerManager.listProviders();
      const sanitized = providers.map(sanitizeProvider);
      return ok({ providers: sanitized });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:configure ─────────────────────────────────────────────────
  ipcMain.handle('provider:configure', async (_event, config: ProviderConfig) => {
    try {
      // Validate input
      const validation = validateWithError(ProviderConfigSchema, config);
      if (!validation.success) {
        return err(validation.error!);
      }

      const provider = providerManager.registerProvider(validation.data! as ProviderConfig);
      auditLog.auditLog('provider.configure', {
        providerId: provider.id,
        providerName: provider.name,
        providerType: provider.type,
        hasApiKey: !!config.apiKey,
      });

      return ok({
        provider: sanitizeProvider(provider),
      });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:update ────────────────────────────────────────────────────
  ipcMain.handle('provider:update', async (_event, id: string, updates: Partial<Omit<ProviderConfig, 'type'>> & { type?: ProviderType }) => {
    try {
      // Validate ID
      const idValidation = validateWithError(IdSchema, id);
      if (!idValidation.success) {
        return err(idValidation.error!);
      }

      // Validate updates
      const updatesValidation = validateWithError(ProviderUpdateSchema, updates);
      if (!updatesValidation.success) {
        return err(updatesValidation.error!);
      }

      const provider = providerManager.updateProvider(id, updatesValidation.data! as Partial<Omit<ProviderConfig, 'type'>> & { type?: ProviderType });
      if (!provider) {
        return err(`Provider not found: ${id}`);
      }

      auditLog.auditLog('provider.update', {
        providerId: id,
        hasApiKeyUpdate: updates.apiKey !== undefined,
      });

      return ok({
        provider: sanitizeProvider(provider),
      });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:remove ────────────────────────────────────────────────────
  ipcMain.handle('provider:remove', async (_event, providerId: string) => {
    try {
      const idValidation = validateWithError(IdSchema, providerId);
      if (!idValidation.success) {
        return err(idValidation.error!);
      }

      const removed = providerManager.removeProvider(providerId);
      auditLog.auditLog('provider.remove', { providerId, removed });
      return ok({ removed, providerId });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:test ──────────────────────────────────────────────────────
  ipcMain.handle('provider:test', async (_event, providerId: string) => {
    try {
      const idValidation = validateWithError(IdSchema, providerId);
      if (!idValidation.success) {
        return err(idValidation.error!);
      }

      const result = await providerManager.testProvider(providerId);
      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:route ─────────────────────────────────────────────────────
  ipcMain.handle('provider:route', async (_event, requirements: RouteRequirements) => {
    try {
      const validation = validateWithError(RouteRequirementsSchema, requirements);
      if (!validation.success) {
        return err(validation.error!);
      }

      const provider = providerManager.routeRequest(validation.data!);
      return ok({
        provider: sanitizeProvider(provider),
      });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:chat ──────────────────────────────────────────────────────
  ipcMain.handle(
    'provider:chat',
    async (event, providerId: string, model: string, messages: ChatMessage[], options?: ChatCompletionOptions) => {
      try {
        // Validate providerId
        const idValidation = validateWithError(IdSchema, providerId);
        if (!idValidation.success) {
          return err(idValidation.error!);
        }

        // Validate model
        if (!model || typeof model !== 'string') {
          return err('Model is required and must be a string');
        }

        // Validate messages
        if (!Array.isArray(messages)) {
          return err('Messages must be an array');
        }
        for (let i = 0; i < messages.length; i++) {
          const msgValidation = validateWithError(ChatMessageSchema, messages[i]);
          if (!msgValidation.success) {
            return err(`Invalid message at index ${i}: ${msgValidation.error}`);
          }
        }

        // Validate options if provided
        if (options) {
          const optValidation = validateWithError(ChatCompletionOptionsSchema, options);
          if (!optValidation.success) {
            return err(optValidation.error!);
          }
        }

        const stream = providerManager.chatCompletion(
          providerId,
          model,
          messages,
          options ?? {}
        );

        let fullContent = '';

        for await (const chunk of stream) {
          fullContent += chunk;

          try {
            const win = BrowserWindow.fromWebContents(event.sender);
            if (win && !win.isDestroyed()) {
              win.webContents.send('provider:stream', chunk);
              win.webContents.send('provider:chat:chunk', {
                providerId,
                model,
                chunk,
                timestamp: Date.now(),
              });
            }
          } catch {
            // Window might be closed
          }
        }

        try {
          const win = BrowserWindow.fromWebContents(event.sender);
          if (win && !win.isDestroyed()) {
            win.webContents.send('provider:chat:done', {
              providerId,
              model,
              fullContent,
              timestamp: Date.now(),
            });
          }
        } catch {
          // Window might be closed
        }

        return ok({ content: fullContent, providerId, model });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── provider:models ────────────────────────────────────────────────────
  ipcMain.handle('provider:models', async (_event, providerId: string) => {
    try {
      const idValidation = validateWithError(IdSchema, providerId);
      if (!idValidation.success) {
        return err(idValidation.error!);
      }

      const models = providerManager.getModels(providerId);
      return ok({ models });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:checkHealth ───────────────────────────────────────────────
  ipcMain.handle('provider:checkHealth', async () => {
    try {
      await providerManager.checkHealth();
      const providers = providerManager.listProviders();
      return ok({
        providers: providers.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          isAvailable: p.isAvailable,
          latency: p.latency,
          lastChecked: p.lastChecked,
        })),
      });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:setActive ─────────────────────────────────────────────────
  ipcMain.handle('provider:setActive', async (_event, id: string) => {
    try {
      const idValidation = validateWithError(IdSchema, id);
      if (!idValidation.success) {
        return err(idValidation.error!);
      }

      const success = providerManager.setActiveProvider(id);
      if (!success) {
        return err(`Provider not found: ${id}`);
      }

      auditLog.auditLog('provider.setActive', { providerId: id });
      return ok({ id, active: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:getActive ─────────────────────────────────────────────────
  ipcMain.handle('provider:getActive', async () => {
    try {
      const provider = providerManager.getActiveProvider();
      return ok({
        provider: sanitizeProvider(provider),
      });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:setFallback ───────────────────────────────────────────────
  ipcMain.handle('provider:setFallback', async (_event, id: string) => {
    try {
      const idValidation = validateWithError(IdSchema, id);
      if (!idValidation.success) {
        return err(idValidation.error!);
      }

      const success = providerManager.setFallbackProvider(id);
      if (!success) {
        return err(`Provider not found: ${id}`);
      }
      return ok({ id, fallback: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:getConfig ─────────────────────────────────────────────────
  ipcMain.handle('provider:getConfig', async (_event, id: string) => {
    try {
      const idValidation = validateWithError(IdSchema, id);
      if (!idValidation.success) {
        return err(idValidation.error!);
      }

      const config = providerManager.getSanitizedConfig(id);
      if (!config) {
        return err(`Provider not found: ${id}`);
      }
      return ok({ config });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:getChatOptions ────────────────────────────────────────────
  ipcMain.handle('provider:getChatOptions', async (_event, id: string) => {
    try {
      const idValidation = validateWithError(IdSchema, id);
      if (!idValidation.success) {
        return err(idValidation.error!);
      }

      const chatOptions = providerManager.getChatOptions(id);
      if (!chatOptions) {
        return err(`Provider not found: ${id}`);
      }
      return ok({ chatOptions });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:setChatOptions ────────────────────────────────────────────
  ipcMain.handle('provider:setChatOptions', async (_event, id: string, options: Partial<ChatOptions>) => {
    try {
      const idValidation = validateWithError(IdSchema, id);
      if (!idValidation.success) {
        return err(idValidation.error!);
      }

      const optValidation = validateWithError(ChatOptionsUpdateSchema, options);
      if (!optValidation.success) {
        return err(optValidation.error!);
      }

      const success = providerManager.setChatOptions(id, optValidation.data!);
      if (!success) {
        return err(`Provider not found: ${id}`);
      }
      return ok({ id, chatOptions: providerManager.getChatOptions(id) });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  console.log('[IPC] Provider handlers registered');
}

/** Expose providerManager for use in other handlers */
export { providerManager };
