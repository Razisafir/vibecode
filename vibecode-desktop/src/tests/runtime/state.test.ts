// State Manager Test Suite (Phase 1)
import { describe, it, expect, beforeEach } from 'vitest';
import { StateManager, getStateManager, resetStateManager } from '../../system/kernel/state';

describe('StateManager', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    resetStateManager();
    stateManager = new StateManager();
  });

  it('should return uninitialized for unknown services', () => {
    expect(stateManager.getState('unknown')).toBe('uninitialized');
  });

  it('should transition from uninitialized to initializing', () => {
    expect(stateManager.setState('test', 'initializing')).toBe(true);
    expect(stateManager.getState('test')).toBe('initializing');
  });

  it('should reject invalid transitions', () => {
    expect(stateManager.setState('test', 'ready')).toBe(false);
    expect(stateManager.getState('test')).toBe('uninitialized');
  });

  it('should follow valid lifecycle: uninitialized -> initializing -> ready', () => {
    stateManager.setState('test', 'initializing');
    expect(stateManager.setState('test', 'ready')).toBe(true);
    expect(stateManager.getState('test')).toBe('ready');
  });

  it('should track transition history', () => {
    stateManager.setState('test', 'initializing');
    stateManager.setState('test', 'ready');
    const history = stateManager.getTransitionHistory('test');
    expect(history).toHaveLength(2);
    expect(history[0].from).toBe('uninitialized');
    expect(history[1].to).toBe('ready');
  });

  it('should notify listeners on state change', () => {
    const listener = vi.fn();
    stateManager.addListener(listener);
    stateManager.setState('test', 'initializing');
    expect(listener).toHaveBeenCalledWith('test', 'initializing', 'uninitialized');
  });

  it('should provide service info', () => {
    stateManager.setState('test', 'ready');
    stateManager.setVersion('test', '1.0.0');
    const info = stateManager.getServiceInfo('test');
    expect(info.state).toBe('ready');
    expect(info.version).toBe('1.0.0');
  });

  it('should reset state', () => {
    stateManager.setState('test', 'ready');
    stateManager.reset('test');
    expect(stateManager.getState('test')).toBe('uninitialized');
  });
});
