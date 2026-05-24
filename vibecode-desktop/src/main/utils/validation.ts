// ============================================================
// VibeCode Desktop — Centralized Validation Layer
// All IPC handlers should use these helpers to validate inputs
// ============================================================

import { z, ZodSchema, ZodError } from 'zod';

// ─── Result Types ────────────────────────────────────────────────────────────

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Helper: validateOrThrow ─────────────────────────────────────────────────

/**
 * Validate data against a Zod schema. Returns the parsed data on success,
 * or throws an Error with a human-readable message on failure.
 *
 * Use this when you want the handler to propagate validation errors
 * naturally (they'll be caught by the try/catch in the IPC handler).
 */
export function validateOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

// ─── Helper: validateWithError ───────────────────────────────────────────────

/**
 * Validate data against a Zod schema. Returns a structured result
 * instead of throwing. Use this when you want to return a graceful
 * error to the renderer rather than throwing.
 *
 * Returns:
 *   { success: true, data: T }       on valid input
 *   { success: false, error: string } on invalid input
 */
export function validateWithError<T>(schema: ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errorMessage = formatZodError(result.error);
  return { success: false, error: errorMessage };
}

// ─── Helper: formatZodError ──────────────────────────────────────────────────

/**
 * Format a ZodError into a concise, human-readable string.
 * Shows at most the first 5 issues to avoid overwhelming error messages.
 */
export function formatZodError(error: ZodError): string {
  const issues = error.issues.slice(0, 5);
  const parts = issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') + ': ' : '';
    return `${path}${issue.message}`;
  });

  let message = `Validation error: ${parts.join('; ')}`;
  if (error.issues.length > 5) {
    message += `; ...and ${error.issues.length - 5} more issue(s)`;
  }
  return message;
}
