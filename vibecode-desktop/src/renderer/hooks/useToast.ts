import { useState, useCallback, useRef } from 'react';

// ---- Types ----

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  createdAt: number;
  exiting?: boolean;
}

// ---- Default Durations ----

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3000,
  error: 7000,
  warning: 5000,
  info: 5000,
};

// ---- State (module-level singleton) ----

let toastIdCounter = 0;
const listeners: Set<(toasts: Toast[]) => void> = new Set();
let currentToasts: Toast[] = [];

function emitChange() {
  listeners.forEach((fn) => fn([...currentToasts]));
}

function addToast(message: string, type: ToastType, duration?: number) {
  const id = `toast-${++toastIdCounter}-${Date.now()}`;
  const effectiveDuration = duration ?? DEFAULT_DURATIONS[type];

  const toast: Toast = {
    id,
    message,
    type,
    duration: effectiveDuration,
    createdAt: Date.now(),
  };

  currentToasts = [...currentToasts, toast];
  emitChange();

  // Auto-dismiss after duration
  setTimeout(() => {
    dismissToast(id);
  }, effectiveDuration);
}

function dismissToast(id: string) {
  // Mark as exiting first for animation
  const toast = currentToasts.find((t) => t.id === id);
  if (!toast || toast.exiting) return;

  currentToasts = currentToasts.map((t) =>
    t.id === id ? { ...t, exiting: true } : t,
  );
  emitChange();

  // Remove after exit animation
  setTimeout(() => {
    currentToasts = currentToasts.filter((t) => t.id !== id);
    emitChange();
  }, 200);
}

// ---- Hook ----

/**
 * Provides a `showToast(message, type, duration?)` function and
 * the current list of toasts for rendering.
 *
 * Usage:
 *   const { toasts, showToast } = useToast();
 *   showToast('File saved', 'success');
 */
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(currentToasts);
  const subscribedRef = useRef(false);

  if (!subscribedRef.current) {
    subscribedRef.current = true;
    listeners.add(setToasts);
  }

  // Cleanup on unmount
  const cleanupRef = useRef<(() => void) | null>(null);
  if (!cleanupRef.current) {
    cleanupRef.current = () => {
      listeners.delete(setToasts);
    };
  }

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration?: number) => {
      addToast(message, type, duration);
    },
    [],
  );

  const dismiss = useCallback((id: string) => {
    dismissToast(id);
  }, []);

  return { toasts, showToast, dismiss };
}
