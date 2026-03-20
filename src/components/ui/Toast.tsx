import { useEffect, useRef } from 'react';
import { useToast } from '../../hooks/useToast';
import { Z } from '../../utils/zIndex';

const TOAST_STYLES = {
  success: {
    border: 'border-emerald-500/40',
    accent: 'bg-emerald-400',
    label: 'text-emerald-300',
  },
  error: {
    border: 'border-red-500/40',
    accent: 'bg-red-400',
    label: 'text-red-300',
  },
  info: {
    border: 'border-sky-500/40',
    accent: 'bg-sky-400',
    label: 'text-sky-300',
  },
} as const;

function ToastItem({ toast, onDismiss }: { toast: { id: string; type: 'success' | 'error' | 'info'; message: string }; onDismiss: (id: string) => void }) {
  const style = TOAST_STYLES[toast.type];
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Trigger enter animation on next frame
    const el = ref.current;
    if (el) {
      requestAnimationFrame(() => {
        el.classList.remove('translate-x-full', 'opacity-0');
        el.classList.add('translate-x-0', 'opacity-100');
      });
    }
  }, []);

  return (
    <div
      ref={ref}
      data-testid="toast-item"
      className={`pointer-events-auto overflow-hidden rounded-lg border bg-[#141414]/95 shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm translate-x-full opacity-0 transition-[transform,opacity] duration-200 ease-out ${style.border}`}
      role="status"
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${style.accent}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${style.label}`}>
            {toast.type}
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-100">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="rounded px-1 text-sm leading-none text-zinc-500 transition-colors hover:text-zinc-200"
          aria-label={`Dismiss ${toast.type} notification`}
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 top-4 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2"
      style={{ zIndex: Z.toast }}
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
