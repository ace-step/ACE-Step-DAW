import type { ReactNode } from 'react';
import { useAnimatedPresence } from '../../hooks/useAnimatedPresence';

interface DialogTransitionProps {
  show: boolean;
  children: ReactNode;
  onClose?: () => void;
}

/**
 * Wraps dialogs with scale + opacity entrance/exit animations
 * and an animated backdrop with blur.
 *
 * Open: scale(0.95) + opacity(0) → scale(1) + opacity(1), 250ms spring
 * Close: scale(1) → scale(0.97) + opacity(0), 200ms ease-in
 * Backdrop: fades in/out with blur
 */
export function DialogTransition({ show, children, onClose }: DialogTransitionProps) {
  const { shouldRender, isVisible } = useAnimatedPresence(show, 200);

  if (!shouldRender) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{
          backgroundColor: isVisible ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0)',
          backdropFilter: isVisible ? 'blur(4px)' : 'blur(0px)',
          transition: isVisible
            ? 'background-color 200ms ease-out, backdrop-filter 200ms ease-out'
            : 'background-color 200ms ease-in, backdrop-filter 200ms ease-in',
        }}
        onClick={onClose}
      />
      {/* Dialog content */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      >
        <div
          className="pointer-events-auto"
          style={{
            transform: isVisible ? 'scale(1)' : (show ? 'scale(0.97)' : 'scale(0.95)'),
            opacity: isVisible ? 1 : 0,
            transition: isVisible
              ? 'transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease-out'
              : 'transform 200ms ease-in, opacity 150ms ease-in',
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
