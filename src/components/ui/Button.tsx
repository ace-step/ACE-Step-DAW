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
  /** Show loading spinner and disable interaction */
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

/* ── Variant tokens (using daw-btn-interactive for hover/active depth) ── */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default:
    'bg-daw-surface-2 hover:bg-daw-hover text-zinc-300 font-medium hover:shadow-[var(--daw-shadow-sm)]',
  primary:
    'bg-daw-accent hover:bg-daw-accent-hover text-white font-medium bg-gradient-to-b from-white/[0.08] to-transparent',
  ghost:
    'bg-transparent hover:bg-daw-hover-subtle text-zinc-400 hover:text-zinc-100 hover:border hover:border-white/10',
  danger:
    'bg-transparent hover:bg-red-900/30 text-red-400 hover:text-red-300 hover:shadow-[0_0_8px_rgba(239,68,68,0.25)]',
};

const ACTIVE_CLASSES = 'bg-daw-accent text-white';

const BASE_CLASSES =
  'inline-flex items-center justify-center rounded-md daw-btn-interactive disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none select-none gap-1.5';

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
  const loadingClasses = loading ? 'cursor-wait' : '';

  return [BASE_CLASSES, sizeClasses, variantClasses, loadingClasses, className]
    .filter(Boolean)
    .join(' ');
}

function Spinner({ size }: { size: ButtonSize }) {
  const dim = size === 'sm' ? 12 : size === 'md' ? 14 : 16;
  return (
    <svg
      className="animate-spin"
      width={dim}
      height={dim}
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
        d="M14 8a6 6 0 0 0-6-6"
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
 * <Button loading>Saving...</Button>
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
      className={getButtonClasses({ size, variant, icon, active, loading, className: `${className} relative` })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <span className={loading ? 'opacity-0' : undefined}>{children}</span>
      {loading && (
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <Spinner size={size} />
        </span>
      )}
    </button>
  );
});

/* ── ButtonGroup: connected buttons with shared border ── */

export interface ButtonGroupProps {
  children: ReactNode;
  className?: string;
}

export function ButtonGroup({ children, className = '' }: ButtonGroupProps) {
  return (
    <div
      className={`inline-flex items-center rounded-md overflow-hidden border border-daw-border [&>button]:rounded-none [&>button]:border-0 [&>button+button]:border-l [&>button+button]:border-daw-border ${className}`}
      role="group"
    >
      {children}
    </div>
  );
}
