import type { ReactNode } from 'react';
import { useAnimatedPresence } from '../../hooks/useAnimatedPresence';

interface BottomPanelTransitionProps {
  show: boolean;
  children: ReactNode;
}

/**
 * Wraps bottom panels (PianoRoll, Sequencer, DrumMachine, EffectChain, Strudel)
 * with a slide-up entrance and slide-down exit animation.
 *
 * The panel slides up from the bottom edge over 300ms (spring ease),
 * and slides down over 250ms on close.
 */
export function BottomPanelTransition({ show, children }: BottomPanelTransitionProps) {
  const { shouldRender, isVisible } = useAnimatedPresence(show, 250);

  if (!shouldRender) return null;

  return (
    <div
      className="daw-bottom-panel-transition"
      style={{
        transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
        opacity: isVisible ? 1 : 0,
        transition: isVisible
          ? 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease-out'
          : 'transform 250ms ease-in, opacity 150ms ease-in',
      }}
    >
      {children}
    </div>
  );
}
