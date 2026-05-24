// ─── Friendly Error Messages ────────────────────────────────────────────────
//
// Converts raw network/HTTP errors into user-friendly messages.
// Inspired by the base software's friendlyError() function, but enhanced
// with TypeScript types, structured output, and more granular detection.
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from './logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProviderInfo {
  name: string;
  type: string;
  baseUrl?: string;
}

export interface FriendlyErrorResult {
  /** User-friendly error message */
  message: string;
  /** Short code for programmatic handling */
  code: FriendlyErrorCode;
  /** Whether the user might be able to fix this themselves */
  userFixable: boolean;
  /** Suggested action the user can take */
  suggestion?: string;
}

export type FriendlyErrorCode =
  | 'connection_refused'
  | 'host_not_found'
  | 'connection_reset'
  | 'ssl_error'
  | 'timeout'
  | 'auth_rejected'
  | 'not_found'
  | 'rate_limited'
  | 'server_error'
  | 'unknown';

// ─── Main Function ─────────────────────────────────────────────────────────

/**
 * Convert a raw error into a user-friendly error message with structured metadata.
 *
 * @param err - The raw error (Error object, string, or unknown)
 * @param provider - Provider info for context-aware messages
 * @returns Structured friendly error result
 */
export function friendlyError(err: unknown, provider: ProviderInfo): FriendlyErrorResult {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const url = provider.baseUrl ?? '';

  // Log the raw error for debugging (never expose to user)
  logger.debug('provider', 'Raw error converted to friendly message', {
    rawMessage: msg,
    providerName: provider.name,
    providerType: provider.type,
  });

  // ── ECONNREFUSED ──────────────────────────────────────────────────────
  if (msg.includes('ECONNREFUSED') || msg.includes('connect ECONNREFUSED')) {
    if (provider.type === 'ollama') {
      return {
        message: 'Ollama is not running. Start Ollama and try again.',
        code: 'connection_refused',
        userFixable: true,
        suggestion: 'Run "ollama serve" in a terminal to start the Ollama server.',
      };
    }
    if (provider.type === 'lmstudio') {
      return {
        message: 'LM Studio server is off. Start LM Studio and enable the local server.',
        code: 'connection_refused',
        userFixable: true,
        suggestion: 'Open LM Studio, load a model, and click "Start Server".',
      };
    }
    return {
      message: `Cannot connect to ${provider.name}. The server at ${url} is not responding.`,
      code: 'connection_refused',
      userFixable: true,
      suggestion: 'Make sure the server is running and the URL is correct.',
    };
  }

  // ── ENOTFOUND ─────────────────────────────────────────────────────────
  if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo ENOTFOUND')) {
    return {
      message: `Invalid URL or host not found: ${url}`,
      code: 'host_not_found',
      userFixable: true,
      suggestion: 'Check the provider URL for typos. Ensure the hostname is correct.',
    };
  }

  // ── ECONNRESET ────────────────────────────────────────────────────────
  if (msg.includes('ECONNRESET')) {
    return {
      message: `Connection was reset by ${provider.name}. The server may have crashed or restarted.`,
      code: 'connection_reset',
      userFixable: false,
      suggestion: 'Try again in a moment. If the problem persists, check the server logs.',
    };
  }

  // ── SSL/TLS ───────────────────────────────────────────────────────────
  if (msg.includes('CERT') || msg.includes('SSL') || msg.includes('TLS') || msg.includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE') || msg.includes('SELF_SIGNED_CERT')) {
    return {
      message: `SSL/TLS error connecting to ${provider.name}. Check the URL and certificate.`,
      code: 'ssl_error',
      userFixable: true,
      suggestion: 'If using a self-signed certificate, ensure it is trusted by your system. Check that the URL uses https:// when required.',
    };
  }

  // ── Timeout ───────────────────────────────────────────────────────────
  if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('timed out')) {
    return {
      message: 'Endpoint timed out. The provider may be offline or overloaded.',
      code: 'timeout',
      userFixable: true,
      suggestion: 'Check your internet connection. If the provider is local, make sure it is running. Try again in a moment.',
    };
  }

  // ── 401 / 403 ─────────────────────────────────────────────────────────
  if (msg.includes('401') || msg.includes('403') || msg.includes('Unauthorized') || msg.includes('Forbidden')) {
    return {
      message: 'API key rejected. Please check your API key.',
      code: 'auth_rejected',
      userFixable: true,
      suggestion: 'Verify that your API key is correct and has not expired. Check the provider dashboard for key status.',
    };
  }

  // ── 404 ───────────────────────────────────────────────────────────────
  if (msg.includes('404') || msg.includes('Not Found')) {
    return {
      message: 'Model not found. Check the model name and provider URL.',
      code: 'not_found',
      userFixable: true,
      suggestion: 'Verify that the model name is spelled correctly and is available on this provider.',
    };
  }

  // ── 429 ───────────────────────────────────────────────────────────────
  if (msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('rate limit')) {
    return {
      message: 'Rate limit exceeded. Please wait before trying again.',
      code: 'rate_limited',
      userFixable: true,
      suggestion: 'Wait a moment and retry. Consider upgrading your API plan for higher rate limits.',
    };
  }

  // ── 5xx ───────────────────────────────────────────────────────────────
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.includes('Internal Server Error')) {
    return {
      message: `The ${provider.name} server encountered an error. Please try again later.`,
      code: 'server_error',
      userFixable: false,
      suggestion: 'This is a server-side issue. Try again in a few moments. Check the provider status page if available.',
    };
  }

  // ── Fallback ──────────────────────────────────────────────────────────
  return {
    message: msg || 'An unexpected error occurred.',
    code: 'unknown',
    userFixable: false,
  };
}

/**
 * Simple version that returns just a string message.
 * Useful for quick error display without needing structured data.
 */
export function friendlyErrorMessage(err: unknown, provider: ProviderInfo): string {
  return friendlyError(err, provider).message;
}
