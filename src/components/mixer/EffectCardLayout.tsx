/**
 * EffectCardLayout — Shared layout component for all effect cards.
 *
 * Provides consistent zones: mode (optional), visualization (optional),
 * params (horizontal flex), and footer (dry/wet).
 *
 * In full-width mode (Ableton-style), params spread across the panel.
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
    <div className="flex flex-col items-center gap-3 px-6 py-4 w-full">
      {/* Constrained content area — prevents full-width stretching */}
      <div className="w-full max-w-[700px] flex flex-col gap-3">
        {mode && (
          <div className="flex items-center gap-0.5 rounded-md bg-white/[0.04] p-0.5 self-start">{mode}</div>
        )}
        {visualization && (
          <div
            className="w-full min-h-[60px] rounded-md overflow-hidden border border-white/[0.04]"
            style={{ borderColor: color ? `${color}18` : undefined }}
          >
            {visualization}
          </div>
        )}
        {/* Parameters — horizontal flex, wrapping, centered */}
        <div className="flex flex-wrap items-start justify-center gap-x-10 gap-y-4 py-2">
          {children}
        </div>
        {footer && (
          <div className="pt-2 border-t border-white/[0.06] w-full max-w-[280px]">{footer}</div>
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
      <div className="flex items-center gap-5">{children}</div>
    </div>
  );
}
