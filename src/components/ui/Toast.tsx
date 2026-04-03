import { useEffect, useRef, useState, useCallback } from 'react';
import { useToast, type ToastItem as ToastItemType } from '../../hooks/useToast';
import { Z } from '../../utils/zIndex';

/* ── Type-based styling ── */
const TOAST_STYLES = {
  success: {
    border: 'border-emerald-500/40',
    accent: 'bg-emerald-400',
    label: 'text-emerald-300',
    progressBg: 'bg-emerald-400/60',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" className="text-emerald-400" />
        <path d="M4.5 7L6.2 8.8L9.5 5.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400" />
      </svg>
    ),
  },
  error: {
    border: 'border-red-500/40',
    accent: 'bg-red-400',
    label: 'text-red-300',
    progressBg: 'bg-red-400/60',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" className="text-red-400" />
        <path d="M5 5L9 9M9 5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-red-400" />
      </svg>
    ),
  },
  info: {
    border: 'border-sky-500/40',
    accent: 'bg-sky-400',
    label: 'text-sky-300',
    progressBg: 'bg-sky-400/60',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" className="text-sky-400" />
        <path d="M7 6.5V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-sky-400" />
        <circle cx="7" cy="4.5" r="0.75" fill="currentColor" className="text-sky-400" />
      </svg>
    ),
  },
} as const;

/* ── Individual toast ── */
function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastItemType;
  onDismiss: (id: string) => void;
}) {
  const style = TOAST_STYLES[toast.type];
  const ref = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [paused, setPaused] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef(Date.now());
  const remainingRef = useRef(toast.durationMs);
  const rafRef = useRef<number>(0);

  // Enter animation
  useEffect(() => {
    requestAnimationFrame(() => setEntered(true));
  }, []);

  // Dismiss with exit animation
  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  }, [onDismiss, toast.id]);

  // Progress bar animation — stops RAF loop when paused
  useEffect(() => {
    if (paused) return;

    const el = progressRef.current;
    if (!el) return;

    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min(elapsed / toast.durationMs, 1);
      el.style.width = `${(1 - progress) * 100}%`;

      if (progress >= 1) {
        dismiss();
        return;
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paused, toast.durationMs, dismiss]);

  // Pause/resume on hover
  const handleMouseEnter = useCallback(() => {
    setPaused(true);
    remainingRef.current = toast.durationMs - (Date.now() - startTimeRef.current);
  }, [toast.durationMs]);

  const handleMouseLeave = useCallback(() => {
    // Reset start time to account for pause duration
    startTimeRef.current = Date.now() - (toast.durationMs - remainingRef.current);
    setPaused(false);
  }, [toast.durationMs]);

  return (
    <div
      ref={ref}
      data-testid="toast-item"
      className={`pointer-events-auto overflow-hidden rounded-lg border bg-[#141414]/95 shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm ${style.border}`}
      style={{
        opacity: exiting ? 0 : entered ? 1 : 0,
        transform: exiting
          ? 'translateX(100%)'
          : entered
            ? 'translateX(0) translateY(0)'
            : 'translateX(100%)',
        transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      role="status"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span className="mt-0.5 shrink-0">{style.icon}</span>
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${style.label}`}>
            {toast.type}
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-100">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded px-1 text-sm leading-none text-zinc-500 transition-colors hover:text-zinc-200"
          aria-label={`Dismiss ${toast.type} notification`}
        >
          ×
        </button>
      </div>
      {/* Progress bar */}
      <div className="h-0.5 w-full bg-white/5">
        <div
          ref={progressRef}
          className={`h-full ${style.progressBg} transition-none`}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
}

/* ── Toast container ── */
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
