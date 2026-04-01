/**
 * EffectCardLayout — Shared layout component for all effect cards.
 *
 * Dense Ableton-style layout with openDAW-inspired visual depth:
 * multi-layer shadows on visualization, glass-morphism mode selectors.
 */
import type { ReactNode } from 'react';

interface EffectCardLayoutProps {
  mode?: ReactNode;
  visualization?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  color?: string;
}

export function EffectCardLayout({ mode, visualization, children, footer, color }: EffectCardLayoutProps) {
  return (
    <div className="flex flex-col items-center w-full px-4 py-3">
      <div className="w-full max-w-[800px] flex flex-col items-center gap-3">
        {mode && (
          <div
            className="flex items-center gap-0.5 rounded-sm p-0.5"
            style={{
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
              border: `1px solid ${color ? `${color}18` : 'rgba(255,255,255,0.04)'}`,
              boxShadow: '0 0 0 0.5px rgba(255,255,255,0.06), inset 0 1px 3px rgba(0,0,0,0.3), 0 2px 8px rgba(0,0,0,0.25)',
            }}
          >
            {visualization}
          </div>
        )}
        <div className="flex flex-wrap items-start justify-center gap-x-6 gap-y-3">
          {children}
        </div>
        {footer && (
          <div className="pt-0.5 w-full max-w-[400px] mx-auto">{footer}</div>
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
