import { useMemo, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { FACTORY_GROOVES, getGrooveCategory, type GrooveCategory } from '../../data/factoryGrooves';
import type { GrooveTemplate } from '../../types/project';
import { Z } from '../../utils/zIndex';

const EMPTY_GROOVES: GrooveTemplate[] = [];

const ALL_CATEGORIES: Array<GrooveCategory | 'All' | 'Custom'> = [
  'All', 'Swing', 'Shuffle', 'Funk', 'Hip-Hop', 'Latin', 'Feel', 'Custom',
];

function gridLabel(gridBeats: number): string {
  if (gridBeats === 0.25) return '16th';
  if (gridBeats === 0.5) return '8th';
  if (gridBeats === 1) return '1/4';
  return `${gridBeats}b`;
}

function lengthLabel(lengthBeats: number): string {
  if (lengthBeats <= 2) return `${lengthBeats} beats`;
  const bars = lengthBeats / 4;
  if (Number.isInteger(bars)) return `${bars} bar${bars > 1 ? 's' : ''}`;
  return `${lengthBeats} beats`;
}

/** Micro SVG visualization of timing + velocity pattern. */
function GroovePreview({ groove }: { groove: GrooveTemplate }) {
  const w = 120;
  const h = 24;
  const slots = groove.timingOffsets.length;
  if (slots === 0) return null;

  const slotW = w / slots;
  const maxOffset = Math.max(...groove.timingOffsets.map(Math.abs), 0.01);

  return (
    <svg width={w} height={h} className="shrink-0 opacity-60">
      {groove.timingOffsets.map((offset, i) => {
        const vel = groove.velocityPattern[i] ?? 1;
        const barH = Math.max(2, vel * (h * 0.7));
        const x = i * slotW + slotW * 0.15;
        const barW = slotW * 0.7;
        const y = h - barH;
        const shift = (offset / maxOffset) * (slotW * 0.2);

        return (
          <rect
            key={i}
            x={x + shift}
            y={y}
            width={barW}
            height={barH}
            rx={1}
            fill="currentColor"
            opacity={0.4 + vel * 0.3}
          />
        );
      })}
    </svg>
  );
}

interface GrooveRowProps {
  groove: GrooveTemplate;
  isFactory: boolean;
  onDelete?: () => void;
}

function GrooveRow({ groove, isFactory, onDelete }: GrooveRowProps) {
  const category = getGrooveCategory(groove.name);

  return (
    <div className="group flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 transition-colors hover:border-white/15 hover:bg-white/[0.06]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[11px] font-medium text-zinc-200">{groove.name}</span>
          {isFactory && (
            <span className="shrink-0 rounded bg-white/5 px-1 py-0.5 text-[9px] text-zinc-500">
              Factory
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-400">
          <span>{gridLabel(groove.gridBeats)}</span>
          <span className="text-zinc-600">&middot;</span>
          <span>{lengthLabel(groove.lengthBeats)}</span>
          <span className="text-zinc-600">&middot;</span>
          <span>{category}</span>
        </div>
      </div>

      <GroovePreview groove={groove} />

      {!isFactory && onDelete && (
        <button
          aria-label={`Delete groove ${groove.name}`}
          className="shrink-0 rounded p-1 text-zinc-500 opacity-0 transition-all hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function GroovePoolPanel() {
  const showGroovePoolPanel = useUIStore((s) => s.showGroovePoolPanel);
  const setShowGroovePoolPanel = useUIStore((s) => s.setShowGroovePoolPanel);
  const groovePool = useProjectStore((s) => s.project?.groovePool ?? EMPTY_GROOVES);
  const deleteGrooveTemplate = useProjectStore((s) => s.deleteGrooveTemplate);

  const [activeCategory, setActiveCategory] = useState<GrooveCategory | 'All' | 'Custom'>('All');

  const allGrooves = useMemo(() => {
    const factory = FACTORY_GROOVES.map((g) => ({ groove: g, isFactory: true }));
    const user = groovePool.map((g) => ({ groove: g, isFactory: false }));
    return [...factory, ...user];
  }, [groovePool]);

  const filtered = useMemo(() => {
    if (activeCategory === 'All') return allGrooves;
    if (activeCategory === 'Custom') return allGrooves.filter((g) => !g.isFactory);
    return allGrooves.filter((g) => getGrooveCategory(g.groove.name) === activeCategory);
  }, [allGrooves, activeCategory]);

  if (!showGroovePoolPanel) return null;

  return (
    <div
      className="fixed right-4 top-14 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-white/10 bg-[#141426]/95 shadow-2xl backdrop-blur"
      style={{ zIndex: Z.commandPalette }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-200">
            Groove Pool
          </div>
          <div className="text-[10px] text-zinc-400">
            Extract &amp; apply timing/velocity patterns
          </div>
        </div>
        <button
          aria-label="Close groove pool panel"
          className="ml-auto text-sm text-zinc-400 transition-colors hover:text-zinc-200"
          onClick={() => setShowGroovePoolPanel(false)}
        >
          &times;
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1 border-b border-white/10 px-2 py-2">
        {ALL_CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              className={`rounded-full px-2.5 py-1 text-[10px] transition-colors ${
                isActive
                  ? 'bg-daw-accent text-white'
                  : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
              }`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Groove list */}
      <div className="max-h-[420px] overflow-y-auto px-2 py-2">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-zinc-400">
            No grooves in this category.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map(({ groove, isFactory }) => (
              <GrooveRow
                key={groove.id}
                groove={groove}
                isFactory={isFactory}
                onDelete={isFactory ? undefined : () => deleteGrooveTemplate(groove.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="border-t border-white/10 px-3 py-1.5 text-[10px] text-zinc-500">
        Right-click MIDI notes &rarr; Extract Groove
      </div>
    </div>
  );
}
