import { useEffect, useRef, useState, useCallback, type ReactNode, type KeyboardEvent } from 'react';

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
 * Includes entrance/exit animation and keyboard navigation.
 */
export function ContextMenuWrapper({
  x,
  y,
  onClose,
  children,
  minWidth = CONTEXT_MENU.minWidth,
  testId,
}: ContextMenuWrapperProps) {
  const [entered, setEntered] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const clampedX = Math.min(x, window.innerWidth - (minWidth + 20));
  const clampedY = Math.min(y, window.innerHeight - 100);

  // Entrance animation
  useEffect(() => {
    requestAnimationFrame(() => setEntered(true));
  }, []);

  // Focus the menu for keyboard navigation
  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const menu = menuRef.current;
      if (!menu) return;

      const items = Array.from(
        menu.querySelectorAll<HTMLButtonElement>('[data-menu-item]:not([disabled])'),
      );
      if (items.length === 0) return;

      const current = document.activeElement as HTMLElement;
      const idx = items.indexOf(current as HTMLButtonElement);

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const next = idx < items.length - 1 ? idx + 1 : 0;
          items[next].focus();
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prev = idx > 0 ? idx - 1 : items.length - 1;
          items[prev].focus();
          break;
        }
        case 'Home': {
          e.preventDefault();
          items[0].focus();
          break;
        }
        case 'End': {
          e.preventDefault();
          items[items.length - 1].focus();
          break;
        }
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [onClose],
  );

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
        className="fixed z-50 outline-none"
        data-testid={testId}
        role="menu"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
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
          transformOrigin: 'top left',
          opacity: entered ? 1 : 0,
          transform: entered ? 'scale(1)' : 'scale(0.95)',
          transition: 'opacity 150ms cubic-bezier(0.16, 1, 0.3, 1), transform 150ms cubic-bezier(0.16, 1, 0.3, 1)',
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
  /** Optional icon (16x16) shown left of label */
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
      data-menu-item
      role="menuitem"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`w-full text-left flex items-center gap-2 transition-[background-color,color] duration-[100ms] ease-out ${
        disabled
          ? 'cursor-not-allowed opacity-40'
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
      onFocus={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = danger
          ? CONTEXT_MENU.dangerHoverBg
          : CONTEXT_MENU.hoverBg;
        if (!color) e.currentTarget.style.color = '#fff';
      }}
      onBlur={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = disabled ? '#555' : textColor;
      }}
    >
      {icon && (
        <span className="shrink-0 w-4 h-4 flex items-center justify-center opacity-70">
          {icon}
        </span>
      )}
      <span className="flex-1 truncate">{label}</span>
      {shortcut && (
        <span className="ml-3 shrink-0" style={{ fontSize: 10, color: '#666' }}>
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
      role="separator"
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
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setEntered(true));
  }, []);

  return (
    <div
      role="menu"
      style={{
        background: CONTEXT_MENU.bg,
        border: `1px solid ${CONTEXT_MENU.border}`,
        borderRadius: CONTEXT_MENU.borderRadius,
        boxShadow: CONTEXT_MENU.shadow,
        backdropFilter: CONTEXT_MENU.backdropFilter,
        WebkitBackdropFilter: CONTEXT_MENU.backdropFilter,
        padding: '4px 0',
        minWidth: 130,
        opacity: entered ? 1 : 0,
        transform: entered ? 'translateX(0)' : 'translateX(-8px)',
        transition: 'opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      className="z-50"
    >
      {children}
    </div>
  );
}
