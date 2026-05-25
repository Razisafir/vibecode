// Phase 10: Observability Provider Tests
// Covers status-provider.ts, failure-map.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { StatusProvider } from '../../system/observability/status-provider';
import { FAILURE_CATEGORY_LABELS } from '../../system/observability/failure-map';
import type { ServiceInfo, ServiceState } from '../../system/kernel/types';

describe('StatusProvider', () => {
  let provider: StatusProvider;

  beforeEach(() => {
    provider = new StatusProvider();
  });

  it('registers a service and tracks it', () => {
    provider.registerService({
      name: 'kernel',
      state: 'ready',
      version: '1.0.0',
      dependencies: [],
    });

    const info = provider.getServiceInfo('kernel');
    expect(info).toBeDefined();
    expect(info!.name).toBe('kernel');
    expect(info!.state).toBe('ready');
  });

  it('updates service state', () => {
    provider.registerService({
      name: 'plugin-manager',
      state: 'initializing',
      version: '1.0.0',
      dependencies: [],
    });

    provider.updateServiceState('plugin-manager', 'ready');
    expect(provider.getServiceInfo('plugin-manager')!.state).toBe('ready');
  });

  it('getSystemStatus returns healthy when all services ready', () => {
    provider.registerService({ name: 'kernel', state: 'ready', version: '1.0.0', dependencies: [] });
    provider.registerService({ name: 'runtime', state: 'ready', version: '1.0.0', dependencies: [] });

    const status = provider.getSystemStatus();
    expect(status.overall).toBe('healthy');
    expect(status.services).toHaveLength(2);
  });

  it('getSystemStatus returns unhealthy when any service failed', () => {
    provider.registerService({ name: 'kernel', state: 'ready', version: '1.0.0', dependencies: [] });
    provider.registerService({ name: 'broken', state: 'failed', version: '1.0.0', dependencies: [] });

    const status = provider.getSystemStatus();
    expect(status.overall).toBe('unhealthy');
  });

  it('getSystemStatus returns degraded when service is degraded', () => {
    provider.registerService({ name: 'kernel', state: 'ready', version: '1.0.0', dependencies: [] });
    provider.registerService({ name: 'slow', state: 'degraded', version: '1.0.0', dependencies: [] });

    const status = provider.getSystemStatus();
    expect(status.overall).toBe('degraded');
  });

  it('getSystemStatus returns degraded when service is initializing', () => {
    provider.registerService({ name: 'kernel', state: 'initializing', version: '1.0.0', dependencies: [] });

    const status = provider.getSystemStatus();
    // StatusProvider maps 'initializing' to 'degraded' overall status
    expect(status.overall).toBe('degraded');
  });

  it('setActivePlugins tracks active plugins', () => {
    provider.setActivePlugins(['plugin-a', 'plugin-b']);
    const status = provider.getSystemStatus();
    expect(status.activePlugins).toEqual(['plugin-a', 'plugin-b']);
  });

  it('reset clears all state', () => {
    provider.registerService({ name: 'kernel', state: 'ready', version: '1.0.0', dependencies: [] });
    provider.setActivePlugins(['plugin-a']);
    provider.reset();

    expect(provider.getAllServices()).toHaveLength(0);
    expect(provider.getSystemStatus().activePlugins).toHaveLength(0);
  });

  it('emits status:service-registered event', () => {
    let eventFired = false;
    provider.on('status:service-registered', () => { eventFired = true; });
    provider.registerService({ name: 'test', state: 'ready', version: '1.0.0', dependencies: [] });
    expect(eventFired).toBe(true);
  });

  it('getAllServices returns all registered services', () => {
    provider.registerService({ name: 'a', state: 'ready', version: '1.0.0', dependencies: [] });
    provider.registerService({ name: 'b', state: 'failed', version: '1.0.0', dependencies: [] });

    const services = provider.getAllServices();
    expect(services).toHaveLength(2);
  });
});

describe('FAILURE_CATEGORY_LABELS', () => {
  it('has labels for all failure categories', () => {
    expect(FAILURE_CATEGORY_LABELS.NETWORK_ERROR).toBe('Network Error');
    expect(FAILURE_CATEGORY_LABELS.AUTH_FAILURE).toBe('Authentication Failure');
    expect(FAILURE_CATEGORY_LABELS.RESOURCE_EXHAUSTED).toBe('Resource Exhausted');
    expect(FAILURE_CATEGORY_LABELS.TIMEOUT).toBe('Timeout');
    expect(FAILURE_CATEGORY_LABELS.CORRUPTION).toBe('Data Corruption');
    expect(FAILURE_CATEGORY_LABELS.PERMISSION_DENIED).toBe('Permission Denied');
    expect(FAILURE_CATEGORY_LABELS.PLUGIN_FAILURE).toBe('Plugin Failure');
    expect(FAILURE_CATEGORY_LABELS.UNKNOWN).toBe('Unknown Error');
  });

  it('has label for PM2_MISCONFIGURATION', () => {
    expect(FAILURE_CATEGORY_LABELS.PM2_MISCONFIGURATION).toBe('PM2 Misconfiguration');
  });
});
