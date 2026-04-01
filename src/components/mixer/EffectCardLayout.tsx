/**
 * EffectCardLayout — Shared layout component for all effect cards.
 *
 * Full-width Ableton-style: params spread horizontally, centered,
 * with mode selector and footer properly aligned.
 */
import type { ReactNode } from 'react';

interface EffectCardLayoutProps {
  /** Optional mode selector row (e.g., filter type buttons) */
  mode?: ReactNode;
  /** Optional visualization area (e.g., EQ curve, GR meter, spectrum) */
  visualization?: ReactNode;
  /** Main parameter controls */
  children: ReactNode;
  /** Optional footer row (typically Dry/Wet slider) */
  footer?: ReactNode;
  /** Effect accent color (from EFFECT_COLORS) */
  color?: string;
}

export function EffectCardLayout({ mode, visualization, children, footer, color }: EffectCardLayoutProps) {
  return (
    <div className="flex flex-col items-center w-full px-4 py-4">
      {/* Constrained content — prevents full-width stretching */}
      <div className="w-full max-w-[800px] flex flex-col items-center gap-3">
        {mode && (
          <div
            className="flex items-center gap-0.5 rounded-md p-1"
            style={{
              background: 'rgba(255,255,255,0.03)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {mode}
          </div>
        )}
        {visualization && (
          <div
            className="w-full min-h-[60px] rounded-md overflow-hidden"
            style={{
              borderColor: color ? `${color}18` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${color ? `${color}18` : 'rgba(255,255,255,0.04)'}`,
              boxShadow: `
                0 1px 3px rgba(0,0,0,0.3),
                0 4px 12px rgba(0,0,0,0.2),
                inset 0 1px 0 rgba(255,255,255,0.04)
              `,
            }}
          >
            {visualization}
          </div>
        )}
        {/* Parameters — evenly spaced horizontal row */}
        <div className="flex flex-wrap items-start justify-center gap-x-8 gap-y-4">
          {children}
        </div>
        {footer && (
          <div className="pt-1 w-full max-w-[400px] mx-auto">{footer}</div>
        )}
      </div>
    </div>
  );
}

interface ParamGroupProps {
  /** Group label */
  label?: string;
  children: ReactNode;
}

/** Groups related knobs with an optional label. */
export function ParamGroup({ label, children }: ParamGroupProps) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {label && (
        <span className="text-[9px] text-white/25 uppercase tracking-wider font-medium">{label}</span>
      )}
      <div className="flex items-center gap-4">{children}</div>
    </div>
  );
}
