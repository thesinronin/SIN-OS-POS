export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  type: ToastType;
  durationMs?: number;
}

type ToastListener = (toast: ToastMessage) => void;
const listeners: Set<ToastListener> = new Set();

export function subscribeToast(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Replaces native browser alert("...") with a smooth, styled toast notification.
 * Taglined with "As You Wish ✨" for a polished user experience.
 */
export function showToast(
  message: string,
  title: string = 'As You Wish ✨',
  type: ToastType = 'success',
  durationMs: number = 3200
) {
  const toast: ToastMessage = {
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    message,
    type,
    durationMs,
  };

  listeners.forEach((listener) => listener(toast));
}

// Global window replacement for window.alert
if (typeof window !== 'undefined') {
  (window as unknown as { customAlert?: (msg: string) => void }).customAlert = (msg: string) => {
    showToast(msg, 'As You Wish ✨', 'success');
  };
}
