/**
 * EffectCardLayout — Shared layout component for all effect cards.
 *
 * Provides consistent zones: mode (optional), visualization (optional),
 * params grid, and footer (dry/wet).
 */
import type { ReactNode } from 'react';

interface EffectCardLayoutProps {
  /** Optional mode selector row (e.g., filter type buttons) */
  mode?: ReactNode;
  /** Optional visualization area (e.g., EQ curve, GR meter, spectrum) */
  visualization?: ReactNode;
  /** Main parameter controls — rendered in a CSS grid */
  children: ReactNode;
  /** Optional footer row (typically Dry/Wet slider) */
  footer?: ReactNode;
  /** Effect accent color (from EFFECT_COLORS) */
  color?: string;
}

export function EffectCardLayout({ mode, visualization, children, footer, color }: EffectCardLayoutProps) {
  return (
    <div className="flex flex-col gap-1.5 p-2">
      {mode && (
        <div className="flex items-center gap-1">{mode}</div>
      )}
      {visualization && (
        <div className="w-full min-h-[60px] rounded overflow-hidden" style={{ borderColor: color ? `${color}20` : undefined }}>
          {visualization}
        </div>
      )}
      <div
        className="grid gap-x-3 gap-y-2 justify-items-center"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(40px, 1fr))' }}
      >
        {children}
      </div>
      {footer && (
        <div className="pt-1 border-t border-white/5">{footer}</div>
      )}
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
    <div className="flex flex-col items-center gap-1">
      {label && (
        <span className="text-[9px] text-white/30 uppercase tracking-wider font-medium">{label}</span>
      )}
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}
