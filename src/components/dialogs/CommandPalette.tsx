import { useEffect, useMemo, useRef, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { Z } from '../../utils/zIndex';
import { useAnimatedPresence } from '../../hooks/useAnimatedPresence';

function ShortcutHint({ keys }: { keys?: string[] }) {
  if (!keys || keys.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {keys.map((key) => (
        <kbd
          key={key}
          className="inline-flex min-w-[1.25rem] items-center justify-center rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-zinc-400"
        >
          {key}
        </kbd>
      ))}
    </div>
  );
}

export function CommandPalette() {
  const show = useUIStore((state) => state.showCommandPalette);
  const query = useUIStore((state) => state.commandPaletteQuery);
  const recentCommandIds = useUIStore((state) => state.recentCommandIds);
  const setQuery = useUIStore((state) => state.setCommandPaletteQuery);
  const close = useUIStore((state) => state.closeCommandPalette);
  const search = useUIStore((state) => state.searchCommandPalette);
  const execute = useUIStore((state) => state.executeCommandPaletteCommand);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const results = useMemo(() => search(query), [query, recentCommandIds, search]);

  useEffect(() => {
    if (!show) return;

    setSelectedIndex(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [show]);

  useEffect(() => {
    if (selectedIndex >= results.length) {
      setSelectedIndex(results.length > 0 ? results.length - 1 : 0);
    }
  }, [results, selectedIndex]);

  const { shouldRender, isVisible } = useAnimatedPresence(show, 100);

  if (!shouldRender) return null;

  const activeResult = results[selectedIndex] ?? null;

  const runSelected = async () => {
    if (!activeResult) return;
    await execute(activeResult.id);
  };

  return (
    <div
      className="fixed inset-0 flex items-start justify-center px-4 pt-[10vh]"
      style={{
        zIndex: Z.commandPalette,
        backgroundColor: isVisible ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0)',
        backdropFilter: isVisible ? 'blur(4px)' : 'blur(0px)',
        transition: 'background-color 200ms ease-out, backdrop-filter 200ms ease-out',
      }}
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#171717]/96 shadow-[0_40px_120px_rgba(0,0,0,0.55)]"
        style={{
          transform: isVisible ? 'translateY(0)' : 'translateY(-8px)',
          opacity: isVisible ? 1 : 0,
          transition: isVisible
            ? 'transform 200ms ease-out, opacity 200ms ease-out'
            : 'transform 100ms ease-in, opacity 100ms ease-in',
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/8 px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-400">
                Command Palette
              </div>
              <div className="text-xs text-zinc-400">
                Search actions, track intents, parameters, and recent workflows
              </div>
            </div>
            <ShortcutHint keys={['Esc']} />
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setSelectedIndex((index) => Math.min(index + 1, results.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setSelectedIndex((index) => Math.max(index - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                void runSelected();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                close();
              }
            }}
            placeholder="Try “add reverb to vocals” or “tempo 140”"
            aria-label="Command palette search"
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-cyan-400/60 focus:bg-black/30"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {results.length > 0 ? (
            <div className="space-y-1" role="listbox" aria-label="Command results">
              {results.map((result, index) => {
                const active = index === selectedIndex;
                return (
                  <button
                    key={result.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    aria-label={result.title}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => {
                      void execute(result.id);
                    }}
                    className={`flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left transition ${
                      active
                        ? 'bg-cyan-500/14 ring-1 ring-cyan-400/35'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-zinc-100">{result.title}</span>
                        {result.isRecent && (
                          <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
                            Recent
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                        <span>{result.section}</span>
                        {result.subtitle && (
                          <>
                            <span className="text-zinc-600">•</span>
                            <span>{result.subtitle}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <ShortcutHint keys={result.shortcut} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <div className="text-sm font-medium text-zinc-200">No matching commands</div>
              <div className="mt-1 text-xs text-zinc-400">
                Try a track intent, action name, or parameter such as “tempo 128”.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
