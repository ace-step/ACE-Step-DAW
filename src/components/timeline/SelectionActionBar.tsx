interface SelectionActionBarProps {
  left: number;
  top: number;
  actions: Array<{
    id: string;
    label: string;
    onClick: () => void;
    tone?: 'default' | 'accent' | 'danger';
  }>;
}

export function SelectionActionBar({ left, top, actions }: SelectionActionBarProps) {
  if (actions.length === 0) return null;

  return (
    <div
      className="absolute z-30 flex items-center gap-1 rounded-xl border border-[#3c3c3c] bg-[#141414]/95 px-1.5 py-1 shadow-2xl backdrop-blur-md"
      style={{ left, top }}
      role="toolbar"
      aria-label="AI selection actions"
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={action.onClick}
          className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
            action.tone === 'danger'
              ? 'bg-rose-500/15 text-rose-100 hover:bg-rose-500/25'
              : action.tone === 'accent'
                ? 'bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25'
                : 'bg-[#242424] text-zinc-200 hover:bg-[#2f2f2f]'
          }`}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
