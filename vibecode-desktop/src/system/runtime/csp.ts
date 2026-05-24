// ============================================================
// VibeCode Desktop — Content Security Policy
// ============================================================
//
// Extracted from main.ts during Phase 1 refactoring.
// Sets strict CSP headers for the renderer process.
//
// This is a VS Code fork competing with Cursor — not "an Electron app."
// ============================================================

import { session } from 'electron';
import { getIsDev } from '../kernel/state';
import { logger } from '../../main/utils/logger';

/**
 * Set strict Content Security Policy headers for the renderer process.
 *
 * In production: strict CSP that only allows 'self' resources.
 * In development: relaxed CSP that allows Vite HMR and dev tools.
 */
export function setupContentSecurityPolicy(): void {
  const isDev = getIsDev();

  const productionPolicy = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com http://localhost:11434 http://localhost:1234`,
    `font-src 'self'`,
    `media-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');

  const developmentPolicy = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: http://localhost:5173`,
    `connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com http://localhost:11434 http://localhost:1234 http://localhost:5173 ws://localhost:5173`,
    `font-src 'self' http://localhost:5173`,
    `media-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');

  const policy = isDev ? developmentPolicy : productionPolicy;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    });
  });

  logger.info('general', `Content Security Policy configured (${isDev ? 'development' : 'production'} mode)`);
}
