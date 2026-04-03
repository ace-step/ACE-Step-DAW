import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize;
  variant?: ButtonVariant;
  /** Render as a square icon button instead of a text button */
  icon?: boolean;
  /** Active/pressed state styling (overrides variant) */
  active?: boolean;
  /** Show a loading spinner and disable interaction */
  loading?: boolean;
  children?: ReactNode;
}

/* ── Size tokens ── */
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-2 py-1 text-[11px]',
  md: 'px-3 py-1.5 text-xs',
  lg: 'px-4 py-2 text-sm',
};

const ICON_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'w-6 h-6',
  md: 'w-7 h-7',
  lg: 'w-8 h-8',
};

/* ── Variant tokens ── */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default:
    'bg-daw-surface-2 hover:bg-daw-hover text-zinc-300 font-medium hover:shadow-[var(--daw-shadow-sm)]',
  primary:
    'bg-daw-accent hover:bg-daw-accent-hover text-white font-medium hover:shadow-[var(--daw-shadow-sm)]',
  ghost:
    'bg-transparent hover:bg-daw-hover-subtle text-zinc-400 hover:text-zinc-100 hover:border hover:border-white/10',
  danger:
    'bg-transparent hover:bg-red-900/30 text-red-400 hover:text-red-300 hover:shadow-[0_0_8px_rgba(239,68,68,0.25)]',
};

const ACTIVE_CLASSES = 'bg-daw-accent text-white';

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-transparent transition-[color,background-color,transform,box-shadow,border-color,opacity] duration-[var(--duration-normal)] ease-[var(--ease-out)] active:scale-[0.97] active:shadow-[var(--daw-shadow-inset)] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 select-none';

/**
 * Build the full className string for button styling.
 * Useful when you need the classes outside of the <Button> component
 * (e.g., on a native <button> you cannot easily swap).
 */
export function getButtonClasses(opts: {
  size?: ButtonSize;
  variant?: ButtonVariant;
  icon?: boolean;
  active?: boolean;
  loading?: boolean;
  className?: string;
} = {}): string {
  const {
    size = 'md',
    variant = 'default',
    icon = false,
    active = false,
    loading = false,
    className = '',
  } = opts;

  const sizeClasses = icon ? `${ICON_SIZE_CLASSES[size]} rounded-full` : SIZE_CLASSES[size];
  const variantClasses = active ? ACTIVE_CLASSES : VARIANT_CLASSES[variant];
  const loadingClasses = loading ? 'pointer-events-none' : '';

  return [BASE_CLASSES, sizeClasses, variantClasses, loadingClasses, className]
    .filter(Boolean)
    .join(' ');
}

/* ── Loading spinner ── */
function Spinner({ size }: { size: ButtonSize }) {
  const dim = size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5';
  return (
    <svg
      className={`${dim} animate-spin`}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M14 8a6 6 0 00-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Shared DAW button with consistent sizing, border-radius, and hover states.
 *
 * @example
 * <Button variant="primary" size="md" onClick={save}>Save</Button>
 * <Button variant="ghost" size="sm" icon title="Settings"><GearIcon /></Button>
 * <Button variant="primary" loading>Saving...</Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    size = 'md',
    variant = 'default',
    icon = false,
    active = false,
    loading = false,
    className = '',
    children,
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={getButtonClasses({ size, variant, icon, active, loading, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner size={size} />}
      {children}
    </button>
  );
});

/* ── ButtonGroup: connected row of buttons ── */

interface ButtonGroupProps {
  children: ReactNode;
  className?: string;
}

export function ButtonGroup({ children, className = '' }: ButtonGroupProps) {
  return (
    <div
      className={`inline-flex items-center [&>button]:rounded-none [&>button:first-child]:rounded-l-md [&>button:last-child]:rounded-r-md [&>button+button]:border-l [&>button+button]:border-l-white/10 ${className}`}
      role="group"
    >
      {children}
    </div>
  );
}
