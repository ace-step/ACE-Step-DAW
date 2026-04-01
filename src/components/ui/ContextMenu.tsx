import type { ReactNode } from 'react';

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
 * Clamps position so the menu stays on-screen.
 */
export function ContextMenuWrapper({
  x,
  y,
  onClose,
  children,
  minWidth = CONTEXT_MENU.minWidth,
  testId,
}: ContextMenuWrapperProps) {
  const clampedX = Math.min(x, window.innerWidth - (minWidth + 20));
  const clampedY = Math.min(y, window.innerHeight - 100);

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
        className="fixed z-50"
        data-testid={testId}
        style={{
          left: clampedX,
          top: clampedY,
          background: CONTEXT_MENU.bg,
          border: `1px solid ${CONTEXT_MENU.border}`,
          borderRadius: CONTEXT_MENU.borderRadius,
          boxShadow: CONTEXT_MENU.shadow,
          backdropFilter: CONTEXT_MENU.backdropFilter,
          WebkitBackdropFilter: CONTEXT_MENU.backdropFilter,
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
  className?: string;
}

export function ContextMenuItem({
  label,
  onClick,
  danger,
  disabled,
  shortcut,
  color,
  className,
}: ContextMenuItemProps) {
  const textColor = danger
    ? CONTEXT_MENU.dangerColor
    : color ?? CONTEXT_MENU.textColor;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`w-full text-left flex items-center justify-between transition-colors ${
        disabled
          ? 'cursor-not-allowed'
          : 'cursor-pointer'
      } ${className ?? ''}`}
      style={{
        padding: '5px 12px',
        fontSize: CONTEXT_MENU.fontSize,
        border: 'none',
        background: 'transparent',
        color: disabled ? '#555' : textColor,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = danger
          ? CONTEXT_MENU.dangerHoverBg
          : CONTEXT_MENU.hoverBg;
        if (!color) e.currentTarget.style.color = '#fff';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = disabled ? '#555' : textColor;
      }}
    >
      <span>{label}</span>
      {shortcut && (
        <span style={{ fontSize: 10, color: '#666', marginLeft: 12 }}>
          {shortcut}
        </span>
      )}
    </button>
  );
}

/* ─── Separator ──────────────────────────────────────────────────────────── */

export function ContextMenuSeparator() {
  return (
    <div
      style={{
        margin: '4px 8px',
        height: 1,
        background: CONTEXT_MENU.separatorColor,
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
  return (
    <div
      style={{
        background: CONTEXT_MENU.bg,
        border: `1px solid ${CONTEXT_MENU.border}`,
        borderRadius: CONTEXT_MENU.borderRadius,
        boxShadow: CONTEXT_MENU.shadow,
        backdropFilter: CONTEXT_MENU.backdropFilter,
        WebkitBackdropFilter: CONTEXT_MENU.backdropFilter,
        padding: '4px 0',
        minWidth: 130,
      }}
      className="z-50"
    >
      {children}
    </div>
  );
}
