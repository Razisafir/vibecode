// Failure Map - Canonical source for FailureCategory and related types
export type { FailureCategory } from '../kernel/types';

export const FAILURE_CATEGORY_LABELS: Record<string, string> = {
  NETWORK_ERROR: 'Network Error',
  AUTH_FAILURE: 'Authentication Failure',
  RESOURCE_EXHAUSTED: 'Resource Exhausted',
  TIMEOUT: 'Timeout',
  CORRUPTION: 'Data Corruption',
  PERMISSION_DENIED: 'Permission Denied',
  PM2_MISCONFIGURATION: 'PM2 Misconfiguration',
  PLUGIN_FAILURE: 'Plugin Failure',
  UNKNOWN: 'Unknown Error',
};
