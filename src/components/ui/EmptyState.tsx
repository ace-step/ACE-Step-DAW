import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'gap-1.5 py-6' : 'gap-2 py-12'
      } ${className}`}
    >
      {icon && (
        <div aria-hidden="true" className="text-daw-text-muted opacity-40">{icon}</div>
      )}

      <p
        className={`text-daw-text-muted font-medium ${
          compact ? 'text-[10px]' : 'text-[11px]'
        }`}
      >
        {title}
      </p>

      {description && (
        <p
          className={`text-daw-text-muted opacity-50 max-w-[220px] leading-relaxed ${
            compact ? 'text-[9px]' : 'text-[10px]'
          }`}
        >
          {description}
        </p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className="mt-1 px-3 py-1 text-[10px] font-medium rounded bg-daw-accent/15 text-daw-accent hover:bg-daw-accent/25 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
