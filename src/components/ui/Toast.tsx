import { useEffect, useRef, useState } from 'react';
import { useToast, type ToastType } from '../../hooks/useToast';
import { Z } from '../../utils/zIndex';

/* ── Type-specific styles ── */
const TOAST_STYLES: Record<ToastType, {
  border: string;
  label: string;
  iconPath: string;
}> = {
  success: {
    border: 'border-emerald-500/40',
    label: 'text-emerald-300',
    iconPath: 'M5 13l4 4L19 7', // checkmark
  },
  error: {
    border: 'border-red-500/40',
    label: 'text-red-300',
    iconPath: 'M6 18L18 6M6 6l12 12', // X
  },
  info: {
    border: 'border-sky-500/40',
    label: 'text-sky-300',
    iconPath: 'M12 16v-4m0-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z', // info circle
  },
};

function ToastIcon({ type }: { type: ToastType }) {
  const style = TOAST_STYLES[type];
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 mt-0.5 ${style.label}`}
      aria-hidden="true"
    >
      <path d={style.iconPath} />
    </svg>
  );
}

/* ── Progress bar (CSS animation: 100% → 0% width) ── */
function ProgressBar({ durationMs, paused }: { durationMs: number; paused: boolean }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    if (paused) {
      // Freeze at current width
      const currentWidth = el.getBoundingClientRect().width;
      const parentWidth = el.parentElement?.getBoundingClientRect().width ?? 1;
      el.style.animationPlayState = 'paused';
      el.style.width = `${(currentWidth / parentWidth) * 100}%`;
    } else {
      el.style.animationPlayState = 'running';
    }
  }, [paused]);

  return (
    <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden rounded-b-lg">
      <div
        ref={barRef}
        className="h-full bg-white/20"
        style={{
          width: '100%',
          animation: `toast-progress ${durationMs}ms linear forwards`,
        }}
      />
    </div>
  );
}

/* ── Individual toast item ── */
function ToastItem({
  toast,
  onDismiss,
  onPause,
  onResume,
}: {
  toast: { id: string; type: ToastType; message: string; durationMs: number; createdAt: number };
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}) {
  const style = TOAST_STYLES[toast.type];
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  // Enter animation
  useEffect(() => {
    const el = ref.current;
    if (el) {
      requestAnimationFrame(() => {
        el.classList.remove('translate-x-full', 'opacity-0');
        el.classList.add('translate-x-0', 'opacity-100');
      });
    }
  }, []);

  const handleMouseEnter = () => {
    setPaused(true);
    onPause(toast.id);
  };

  const handleMouseLeave = () => {
    setPaused(false);
    onResume(toast.id);
  };

  return (
    <div
      ref={ref}
      data-testid="toast-item"
      className={`pointer-events-auto relative overflow-hidden rounded-lg border daw-glass daw-shadow-md translate-x-full opacity-0 transition-[transform,opacity] duration-200 ease-out ${style.border}`}
      role="status"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <ToastIcon type={toast.type} />
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${style.label}`}>
            {toast.type}
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-100">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="rounded p-0.5 text-sm leading-none text-zinc-500 transition-colors hover:text-zinc-200 hover:bg-white/5"
          aria-label={`Dismiss ${toast.type} notification`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 3l6 6M3 9l6-6" />
          </svg>
        </button>
      </div>
      <ProgressBar durationMs={toast.durationMs} paused={paused} />
    </div>
  );
}

/* ── Toast container ── */
export function ToastContainer() {
  const { toasts, dismissToast, pauseToast, resumeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 bottom-4 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col-reverse gap-2"
      style={{ zIndex: Z.toast }}
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={dismissToast}
          onPause={pauseToast}
          onResume={resumeToast}
        />
      ))}
    </div>
  );
}
