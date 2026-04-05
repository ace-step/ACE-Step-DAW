/**
 * EffectCardLayout — Shared layout component for all effect cards.
 *
 * Dense Ableton-style layout with openDAW-inspired visual depth:
 * multi-layer shadows on visualization, glass-morphism mode selectors.
 * Staggered entrance animation when switching effects.
 */
import type { ReactNode } from 'react';

/**
 * Two-tier knob sizing system for visual parameter hierarchy.
 * Primary: main parameters (threshold, ratio, freq, etc.)
 * Secondary: supporting/fine-tune controls (knee, Q, etc.)
 */
export const KNOB_PRIMARY = 56;
export const KNOB_SECONDARY = 44;

interface EffectCardLayoutProps {
  mode?: ReactNode;
  visualization?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  color?: string;
}

/**
 * Inline style for staggered entrance. Each section fades in + slides up
 * with increasing delay (40ms between sections).
 */
const stagger = (index: number): React.CSSProperties => ({
  animation: `fx-card-enter 180ms ease-out ${index * 40}ms both`,
});

export function EffectCardLayout({ mode, visualization, children, footer, color }: EffectCardLayoutProps) {
  // idx is safe: re-initialized every render, all increments are synchronous in JSX evaluation
  let idx = 0;
  return (
    <div className="flex flex-col items-center w-full px-4 py-3">
      <div className="w-full max-w-[800px] flex flex-col items-center gap-3">
        {mode && (
          <div
            className="flex items-center gap-0.5 rounded-sm p-0.5"
            style={{
              ...stagger(idx++),
              background: 'rgba(255,255,255,0.03)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.06)',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.15)',
            }}
          >
            {mode}
          </div>
        )}
        {visualization && (
          <div
            className="w-full min-h-[60px] rounded-sm overflow-hidden"
            style={{
              ...stagger(idx++),
              border: `1px solid ${color ? `${color}18` : 'rgba(255,255,255,0.04)'}`,
              boxShadow: '0 0 0 0.5px rgba(255,255,255,0.06), inset 0 1px 3px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.25)',
            }}
          >
            {visualization}
          </div>
        )}
        <div
          className="flex flex-wrap items-start justify-center gap-x-6 gap-y-3"
          style={stagger(idx++)}
        >
          {children}
        </div>
        {footer && (
          <div className="pt-0.5 w-full max-w-[400px] mx-auto" style={stagger(idx++)}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

interface ParamGroupProps {
  label?: string;
  children: ReactNode;
}

export function ParamGroup({ label, children }: ParamGroupProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      {label && (
        <span className="text-[10px] text-white/25 uppercase tracking-wider font-medium">{label}</span>
      )}
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}

/**
 * Standardized mode toggle button for effect type/mode selectors.
 * Ensures consistent sizing, color, and padding across all effect cards.
 */
interface ModeButtonProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  color?: string;
  ariaLabel?: string;
}

export function ModeButton({ active, onClick, children, color, ariaLabel }: ModeButtonProps) {
  return (
    <button
      className={`px-2 py-0.5 text-[10px] rounded capitalize transition-colors ${
        active
          ? 'text-white/80 shadow-[0_0_3px_-1px_rgba(255,255,255,0.15)]'
          : 'text-white/30 hover:text-white/50 hover:bg-white/[0.06]'
      }`}
      style={active ? {
        backgroundColor: color ? `${color}20` : 'rgba(255,255,255,0.08)',
        color: color ? `${color}cc` : undefined,
      } : undefined}
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
