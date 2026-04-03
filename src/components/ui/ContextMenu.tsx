import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

/* ─── Shared context-menu design tokens ──────────────────────────────────── */
export const CONTEXT_MENU = {
  bg: 'rgba(32, 32, 36, 0.85)',
  border: 'rgba(255, 255, 255, 0.08)',
  hoverBg: 'rgba(74, 95, 255, 0.25)', // daw-accent at 25%
  dangerColor: '#e74c3c',
  dangerHoverBg: 'rgba(231, 76, 60, 0.15)',
  textColor: '#d4d4d8', // zinc-300
  textDim: '#a1a1aa',   // zinc-400
  separatorColor: 'rgba(255, 255, 255, 0.06)',
  fontSize: 11,
  borderRadius: 4,
  minWidth: 160,
  shadow: '0 0 0 0.5px rgba(255,255,255,0.08), 0 8px 24px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3)',
  backdropFilter: 'blur(16px) saturate(1.2)',
} as const;

/* ─── Entrance/exit animation helper ─────────────────────────────────────── */

function useMenuAnimation(ref: React.RefObject<HTMLDivElement | null>) {
  // Set initial state synchronously to avoid 1-frame flash
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'scale(0.95)';
    el.style.transition = 'opacity 150ms ease-out, transform 150ms ease-out';
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Trigger entrance on next frame
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'scale(1)';
    });
  }, [ref]);
}

/* ─── Overlay + positioned wrapper ───────────────────────────────────────── */

interface ContextMenuWrapperProps {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
  minWidth?: number;
  testId?: string;
}

/**
 * Renders a fixed-position context menu with a click-away backdrop.
 * Clamps position so the menu stays on-screen. Animates entrance.
 */
export function ContextMenuWrapper({
  x,
  y,
  onClose,
  children,
  minWidth = CONTEXT_MENU.minWidth,
  testId,
}: ContextMenuWrapperProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const clampedX = Math.min(x, window.innerWidth - (minWidth + 20));
  const clampedY = Math.min(y, window.innerHeight - 100);

  useMenuAnimation(menuRef);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        className="fixed z-50 daw-glass"
        data-testid={testId}
        style={{
          left: clampedX,
          top: clampedY,
          borderRadius: CONTEXT_MENU.borderRadius,
          boxShadow: CONTEXT_MENU.shadow,
          padding: '4px 0',
          minWidth,
        }}
      >
        {children}
      </div>
    </>
  );
}

/* ─── Menu item ──────────────────────────────────────────────────────────── */

interface ContextMenuItemProps {
  label: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Extra text shown right-aligned (e.g. keyboard shortcut) */
  shortcut?: string;
  /** Override text color for accent items */
  color?: string;
  /** Optional icon element (16x16 recommended) rendered left of label */
  icon?: ReactNode;
  className?: string;
}

export function ContextMenuItem({
  label,
  onClick,
  danger,
  disabled,
  shortcut,
  color,
  icon,
  className,
}: ContextMenuItemProps) {
  const textColor = danger
    ? CONTEXT_MENU.dangerColor
    : color ?? CONTEXT_MENU.textColor;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`w-full text-left flex items-center gap-2 transition-colors ${
        disabled
          ? 'cursor-not-allowed opacity-40'
          : 'cursor-pointer'
      } ${className ?? ''}`}
      style={{
        padding: '5px 12px',
        fontSize: CONTEXT_MENU.fontSize,
        border: 'none',
        background: 'transparent',
        color: disabled ? CONTEXT_MENU.textDim : textColor,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = danger
          ? CONTEXT_MENU.dangerHoverBg
          : CONTEXT_MENU.hoverBg;
        if (!danger && !color) e.currentTarget.style.color = '#fff';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = disabled ? CONTEXT_MENU.textDim : textColor;
      }}
    >
      {icon && (
        <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="flex-1">{label}</span>
      {shortcut && (
        <kbd className="ml-3 font-mono text-[10px] text-zinc-500">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

/* ─── Separator ──────────────────────────────────────────────────────────── */

export function ContextMenuSeparator() {
  return (
    <div
      className="mx-2 my-1"
      style={{
        height: 1,
        background: `linear-gradient(to right, transparent, ${CONTEXT_MENU.separatorColor} 20%, ${CONTEXT_MENU.separatorColor} 80%, transparent)`,
      }}
    />
  );
}

/* ─── Submenu container (for nested menus) ───────────────────────────────── */

interface ContextMenuSubmenuProps {
  children: ReactNode;
}

/**
 * Styled container for a submenu popup (absolute-positioned by parent).
 * Does NOT include positioning logic — the parent decides left/top.
 */
export function ContextMenuSubmenu({ children }: ContextMenuSubmenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuAnimation(ref);

  return (
    <div
      ref={ref}
      className="z-50 daw-glass"
      style={{
        borderRadius: CONTEXT_MENU.borderRadius,
        boxShadow: CONTEXT_MENU.shadow,
        padding: '4px 0',
        minWidth: 130,
      }}
    >
      {children}
    </div>
  );
}
