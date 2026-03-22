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
    'bg-daw-surface-2 hover:bg-daw-hover text-zinc-300 font-medium',
  primary:
    'bg-daw-accent hover:bg-daw-accent-hover text-white font-medium',
  ghost:
    'bg-transparent hover:bg-daw-hover-subtle text-zinc-400 hover:text-zinc-100',
  danger:
    'bg-transparent hover:bg-red-900/30 text-red-400 hover:text-red-300',
};

const ACTIVE_CLASSES = 'bg-daw-accent text-white shadow-sm';

const BASE_CLASSES =
  'inline-flex items-center justify-center rounded-md transition-[color,background-color,transform] duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed select-none';

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
  className?: string;
} = {}): string {
  const {
    size = 'md',
    variant = 'default',
    icon = false,
    active = false,
    className = '',
  } = opts;

  const sizeClasses = icon ? ICON_SIZE_CLASSES[size] : SIZE_CLASSES[size];
  const variantClasses = active ? ACTIVE_CLASSES : VARIANT_CLASSES[variant];

  return [BASE_CLASSES, sizeClasses, variantClasses, className]
    .filter(Boolean)
    .join(' ');
}

/**
 * Shared DAW button with consistent sizing, border-radius, and hover states.
 *
 * @example
 * <Button variant="primary" size="md" onClick={save}>Save</Button>
 * <Button variant="ghost" size="sm" icon title="Settings"><GearIcon /></Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    size = 'md',
    variant = 'default',
    icon = false,
    active = false,
    className = '',
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={getButtonClasses({ size, variant, icon, active, className })}
      {...rest}
    >
      {children}
    </button>
  );
});
