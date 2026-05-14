import { ipcMain, BrowserWindow } from 'electron';
import { ProviderManager, ProviderConfig, ChatMessage, ChatCompletionOptions, RouteRequirements } from '../services/provider-manager';

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

// ─── Singleton Provider Manager ─────────────────────────────────────────────

const providerManager = new ProviderManager();

// ─── Handler Registration ───────────────────────────────────────────────────

export function registerProviderHandlers(): void {
  // ── provider:list ──────────────────────────────────────────────────────
  ipcMain.handle('provider:list', async () => {
    try {
      const providers = providerManager.listProviders();
      // Mask API keys for security
      const sanitized = providers.map((p) => ({
        ...p,
        apiKey: p.apiKey ? `${p.apiKey.slice(0, 8)}...${p.apiKey.slice(-4)}` : undefined,
      }));
      return ok({ providers: sanitized });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:configure ─────────────────────────────────────────────────
  ipcMain.handle('provider:configure', async (_event, config: ProviderConfig) => {
    try {
      const provider = providerManager.registerProvider(config);
      return ok({
        provider: {
          ...provider,
          apiKey: provider.apiKey ? `${provider.apiKey.slice(0, 8)}...${provider.apiKey.slice(-4)}` : undefined,
        },
      });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:test ──────────────────────────────────────────────────────
  ipcMain.handle('provider:test', async (_event, providerId: string) => {
    try {
      const result = await providerManager.testProvider(providerId);
      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:route ─────────────────────────────────────────────────────
  ipcMain.handle('provider:route', async (_event, requirements: RouteRequirements) => {
    try {
      const provider = providerManager.routeRequest(requirements);
      return ok({
        provider: {
          ...provider,
          apiKey: provider.apiKey ? `${provider.apiKey.slice(0, 8)}...${provider.apiKey.slice(-4)}` : undefined,
        },
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
        const stream = providerManager.chatCompletion(
          providerId,
          model,
          messages,
          options ?? {}
        );

        let fullContent = '';

        for await (const chunk of stream) {
          fullContent += chunk;

          // Stream chunks to renderer
          try {
            const win = BrowserWindow.fromWebContents(event.sender);
            if (win && !win.isDestroyed()) {
              // Legacy format for preload compatibility: just the chunk string
              win.webContents.send('provider:stream', chunk);

              // Structured format for new API consumers
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

        // Send completion event
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
      const models = providerManager.getModels(providerId);
      return ok({ models });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── provider:remove ────────────────────────────────────────────────────
  ipcMain.handle('provider:remove', async (_event, providerId: string) => {
    try {
      const removed = providerManager.removeProvider(providerId);
      return ok({ removed, providerId });
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

  console.log('[IPC] Provider handlers registered');
}

/** Expose providerManager for use in other handlers */
export { providerManager };
