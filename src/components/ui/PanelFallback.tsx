/**
 * Suspense fallback components for lazy-loaded panels.
 *
 * Each fallback approximates the layout of the real panel
 * to prevent layout shift while the chunk loads.
 */

import { Skeleton } from './Skeleton';

interface FallbackShellProps {
  height?: number | string;
  className?: string;
  children?: React.ReactNode;
}

function FallbackShell({ height = 280, className = '', children }: FallbackShellProps) {
  return (
    <div
      className={`bg-daw-surface border-t border-daw-border ${className}`}
      style={{ height }}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}

/** Mixer panel: skeleton channel strips */
export function MixerFallback() {
  return (
    <FallbackShell height={280} className="flex items-end gap-1 px-3 py-3">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex flex-col items-center gap-2 w-14">
          <Skeleton className="w-3 h-24" />
          <Skeleton variant="circle" className="w-6 h-6" />
          <Skeleton className="w-10 h-3" />
        </div>
      ))}
    </FallbackShell>
  );
}

/** Piano roll: skeleton grid */
export function PianoRollFallback() {
  return (
    <FallbackShell height={300} className="flex">
      {/* Key column */}
      <div className="w-12 flex flex-col gap-px py-2">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
      {/* Grid area */}
      <div className="flex-1 p-3">
        <div className="grid grid-cols-8 gap-px h-full opacity-30">
          {Array.from({ length: 48 }, (_, i) => (
            <Skeleton key={i} className="h-4" />
          ))}
        </div>
      </div>
    </FallbackShell>
  );
}

/** Effect chain: skeleton effect cards */
export function EffectChainFallback() {
  return (
    <FallbackShell height={240} className="flex gap-2 px-3 py-3 overflow-hidden">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="w-40 shrink-0 flex flex-col gap-2 rounded border border-daw-border p-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-full" />
          <div className="flex gap-2 mt-auto">
            <Skeleton variant="circle" className="w-8 h-8" />
            <Skeleton variant="circle" className="w-8 h-8" />
          </div>
        </div>
      ))}
    </FallbackShell>
  );
}

/** Generic bottom panel fallback (sequencer, drum machine, strudel) */
export function BottomPanelFallback() {
  return (
    <FallbackShell height={260} className="flex flex-col gap-3 px-4 py-3">
      <div className="flex gap-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="flex-1 grid grid-cols-16 gap-px">
        {Array.from({ length: 64 }, (_, i) => (
          <Skeleton key={i} className="h-6" />
        ))}
      </div>
    </FallbackShell>
  );
}

/** Session view fallback */
export function SessionViewFallback() {
  return (
    <div className="flex-1 flex bg-daw-bg" aria-hidden="true">
      <div className="w-48 border-r border-daw-border flex flex-col gap-1 p-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
      <div className="flex-1 p-3">
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 24 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </div>
    </div>
  );
}
