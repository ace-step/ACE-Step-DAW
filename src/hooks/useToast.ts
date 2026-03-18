import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  durationMs: number;
}

interface ToastState {
  toasts: ToastItem[];
  showToast: (input: { type: ToastType; message: string; durationMs?: number }) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

const DEFAULT_DURATION_MS: Record<ToastType, number> = {
  success: 3000,
  info: 3000,
  error: 5000,
};

const toastTimers = new Map<string, number>();

function clearToastTimer(id: string) {
  const timerId = toastTimers.get(id);
  if (timerId !== undefined) {
    window.clearTimeout(timerId);
    toastTimers.delete(id);
  }
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  showToast: ({ type, message, durationMs }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const resolvedDuration = durationMs ?? DEFAULT_DURATION_MS[type];

    set((state) => ({
      toasts: [...state.toasts, { id, type, message, durationMs: resolvedDuration }],
    }));

    const timerId = window.setTimeout(() => {
      clearToastTimer(id);
      set((state) => ({
        toasts: state.toasts.filter((toast) => toast.id !== id),
      }));
    }, resolvedDuration);
    toastTimers.set(id, timerId);

    return id;
  },
  dismissToast: (id) => {
    clearToastTimer(id);
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
  clearToasts: () => {
    for (const id of toastTimers.keys()) {
      clearToastTimer(id);
    }
    set({ toasts: [] });
  },
}));

export function useToast() {
  const toasts = useToastStore((state) => state.toasts);
  const showToast = useToastStore((state) => state.showToast);
  const dismissToast = useToastStore((state) => state.dismissToast);

  return { toasts, showToast, dismissToast };
}

export function showToast(input: { type: ToastType; message: string; durationMs?: number }) {
  return useToastStore.getState().showToast(input);
}

export function toastSuccess(message: string, durationMs?: number) {
  return showToast({ type: 'success', message, durationMs });
}

export function toastError(message: string, durationMs?: number) {
  return showToast({ type: 'error', message, durationMs });
}

export function toastInfo(message: string, durationMs?: number) {
  return showToast({ type: 'info', message, durationMs });
}
