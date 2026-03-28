import { useEffect, useRef } from 'react';

interface ExpandEditorModalProps {
  isOpen: boolean;
  title: string;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onEnhance?: () => void;
  enhancing?: boolean;
  mono?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function ExpandEditorModal({
  isOpen,
  title,
  value,
  onChange,
  onClose,
  onEnhance,
  enhancing = false,
  mono = false,
  disabled = false,
  placeholder,
}: ExpandEditorModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea on open
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      data-testid="expand-editor-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="absolute inset-6 mx-auto flex max-w-[900px] flex-col rounded-lg border border-[#444] bg-[#1a1a1a] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#333] px-4 py-3">
          <h2 className="text-sm font-medium text-zinc-200">{title}</h2>
          <div className="flex items-center gap-2">
            {onEnhance && (
              <button
                type="button"
                onClick={onEnhance}
                disabled={disabled || enhancing}
                className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                title="AI enhance"
              >
                {enhancing ? (
                  <span className="animate-spin">...</span>
                ) : (
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3.5 20.5l1.5-4.5 3 3-4.5 1.5zM7.5 13.5l3 3 9-9-3-3-9 9z" opacity="0.85" />
                    <path d="M17 2l-1.5 3.5L12 7l3.5 1.5L17 12l1.5-3.5L22 7l-3.5-1.5L17 2z" />
                  </svg>
                )}
                <span>Enhance</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 p-4">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={placeholder}
            className={`h-full w-full resize-none rounded border border-[#444] bg-[#222] px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none ${mono ? 'font-mono' : ''}`}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-[#333] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
