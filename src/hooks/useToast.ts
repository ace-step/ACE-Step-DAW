import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  durationMs: number;
  createdAt: number;
}

interface ToastState {
  toasts: ToastItem[];
  showToast: (input: { type: ToastType; message: string; durationMs?: number }) => string;
  dismissToast: (id: string) => void;
  pauseToast: (id: string) => void;
  resumeToast: (id: string) => void;
  clearToasts: () => void;
}

const DEFAULT_DURATION_MS: Record<ToastType, number> = {
  success: 3000,
  info: 3000,
  error: 5000,
};

const toastTimers = new Map<string, number>();
/** Tracks scheduling state: { startedAt, remainingMs } */
const toastSchedule = new Map<string, { startedAt: number; remainingMs: number }>();

function clearToastTimer(id: string) {
  const timerId = toastTimers.get(id);
  if (timerId !== undefined) {
    window.clearTimeout(timerId);
    toastTimers.delete(id);
  }
}

function scheduleRemoval(id: string, delayMs: number) {
  clearToastTimer(id);
  toastSchedule.set(id, { startedAt: Date.now(), remainingMs: delayMs });
  const timerId = window.setTimeout(() => {
    clearToastTimer(id);
    toastSchedule.delete(id);
    useToastStore.getState().dismissToast(id);
  }, delayMs);
  toastTimers.set(id, timerId);
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  showToast: ({ type, message, durationMs }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const resolvedDuration = durationMs ?? DEFAULT_DURATION_MS[type];
    const now = Date.now();

    set((state) => ({
      toasts: [...state.toasts, { id, type, message, durationMs: resolvedDuration, createdAt: now }],
    }));

    scheduleRemoval(id, resolvedDuration);
    return id;
  },
  dismissToast: (id) => {
    clearToastTimer(id);
    toastSchedule.delete(id);
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
  pauseToast: (id) => {
    const schedule = toastSchedule.get(id);
    if (!schedule) return;
    const elapsed = Date.now() - schedule.startedAt;
    const remaining = Math.max(schedule.remainingMs - elapsed, 500);
    clearToastTimer(id);
    // Store remaining with startedAt=0 to signal paused state
    toastSchedule.set(id, { startedAt: 0, remainingMs: remaining });
  },
  resumeToast: (id) => {
    const schedule = toastSchedule.get(id);
    if (!schedule || schedule.startedAt !== 0) return; // not paused
    scheduleRemoval(id, schedule.remainingMs);
  },
  clearToasts: () => {
    for (const id of toastTimers.keys()) {
      clearToastTimer(id);
    }
    toastSchedule.clear();
    set({ toasts: [] });
  },
}));

export function useToast() {
  const toasts = useToastStore((state) => state.toasts);
  const showToast = useToastStore((state) => state.showToast);
  const dismissToast = useToastStore((state) => state.dismissToast);
  const pauseToast = useToastStore((state) => state.pauseToast);
  const resumeToast = useToastStore((state) => state.resumeToast);

  return { toasts, showToast, dismissToast, pauseToast, resumeToast };
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
