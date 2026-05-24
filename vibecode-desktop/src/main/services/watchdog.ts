// Phase 2 shim — delegates to src/system/supervision/watchdog; remove in Phase 4

import { BrowserWindow } from 'electron';
import {
  startWatchdog,
  stopWatchdog,
  forceWatchdogRecovery,
  onWatchdogEvent,
  offWatchdogEvent,
  getWatchdogState,
  WatchdogEvent,
  WatchdogState,
} from '../../system/supervision/watchdog';

export {
  startWatchdog,
  stopWatchdog,
  forceWatchdogRecovery,
  onWatchdogEvent,
  offWatchdogEvent,
  getWatchdogState,
  WatchdogEvent,
  WatchdogState,
};

// ─── Backward-compatible singleton-like API ─────────────────────────────────
// Old code accesses watchdog.startWatching(), watchdog.on(), etc.
// This shim provides the same interface via an EventEmitter-like object.

import { EventEmitter } from 'events';

class WatchdogShim extends EventEmitter {
  startWatching(): void { startWatchdog(); }
  stopWatching(): void { stopWatchdog(); }
  forceRecovery(window: BrowserWindow): void { forceWatchdogRecovery(window); }
  getState(): WatchdogState { return getWatchdogState(); }

  // The on/off methods are inherited from EventEmitter.
  // We need to bridge module-level events to this instance.
  // The new module emits on its own emitter, so we forward.
}

const watchdogShim = new WatchdogShim();

// Bridge events from the module emitter to the shim instance
const eventNames: WatchdogEvent[] = ['watchdog:unresponsive', 'watchdog:recovered', 'watchdog:failed'];
for (const eventName of eventNames) {
  onWatchdogEvent(eventName, (...args: any[]) => {
    watchdogShim.emit(eventName, ...args);
  });
}

export const watchdog = watchdogShim;
