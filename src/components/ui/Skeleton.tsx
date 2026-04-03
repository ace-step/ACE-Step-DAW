/**
 * Skeleton / Shimmer loading placeholders.
 *
 * Usage:
 *   <Skeleton className="h-4 w-32" />           — single bar
 *   <Skeleton variant="circle" className="w-8 h-8" />  — avatar
 *   <SkeletonText lines={3} />                   — paragraph
 */

interface SkeletonProps {
  className?: string;
  variant?: 'rect' | 'circle';
  /** Disable shimmer animation (e.g. for prefers-reduced-motion) */
  static?: boolean;
}

export function Skeleton({ className = '', variant = 'rect', static: isStatic }: SkeletonProps) {
  const shape = variant === 'circle' ? 'rounded-full' : 'rounded';
  return (
    <div
      aria-hidden="true"
      className={`skeleton-shimmer ${shape} ${className}`}
      data-static={isStatic ? 'true' : undefined}
    />
  );
}

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className = '' }: SkeletonTextProps) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={`h-3 ${i === lines - 1 ? 'w-3/5' : 'w-full'}`}
        />
      ))}
    </div>
  );
}
