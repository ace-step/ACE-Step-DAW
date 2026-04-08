import { useCallback, useMemo, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { Z } from '../../utils/zIndex';
import { GROOVE_PRESETS } from '../../data/groovePresets';
import type { GrooveTemplate } from '../../types/project';

interface GrooveItemProps {
  groove: GrooveTemplate;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

function GrooveItem({ groove, isSelected, onSelect, onDelete, onRename }: GrooveItemProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(groove.name);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== groove.name) {
      onRename(groove.id, trimmed);
    }
    setEditing(false);
  }, [editValue, groove.id, groove.name, onRename]);

  const gridLabel = groove.gridBeats < 1
    ? `1/${Math.round(1 / groove.gridBeats)} note`
    : `${groove.gridBeats} beat${groove.gridBeats !== 1 ? 's' : ''}`;

  return (
    <div
      data-testid={`groove-item-${groove.id}`}
      role="option"
      aria-selected={isSelected}
      className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-colors ${
        isSelected
          ? 'bg-indigo-500/20 border border-indigo-500/40'
          : 'bg-zinc-800/60 border border-zinc-700/30 hover:bg-zinc-700/40'
      }`}
      onClick={() => onSelect(groove.id)}
      onDoubleClick={() => { setEditing(true); setEditValue(groove.name); }}
    >
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            data-testid={`groove-rename-input-${groove.id}`}
            className="w-full bg-zinc-700 text-zinc-100 text-xs px-1.5 py-0.5 rounded border border-zinc-600 outline-none focus:border-indigo-500"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setEditing(false);
            }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-xs font-medium text-zinc-200 truncate block">{groove.name}</span>
        )}
        <span className="text-[10px] text-zinc-500">
          {gridLabel} &middot; {groove.lengthBeats}B loop
        </span>
      </div>
      <button
        data-testid={`groove-delete-${groove.id}`}
        className="p-1 text-zinc-500 hover:text-red-400 transition-colors shrink-0"
        onClick={(e) => { e.stopPropagation(); onDelete(groove.id); }}
        title="Delete groove"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export function GroovePoolPanel() {
  const show = useUIStore((s) => s.showGroovePool);
  const setShow = useUIStore((s) => s.setShowGroovePool);
  const project = useProjectStore((s) => s.project);
  const deleteGrooveTemplate = useProjectStore((s) => s.deleteGrooveTemplate);
  const renameGrooveTemplate = useProjectStore((s) => s.renameGrooveTemplate);
  const addGrooveTemplate = useProjectStore((s) => s.addGrooveTemplate);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPresets, setShowPresets] = useState(false);

  const grooves = project?.groovePool ?? [];

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return grooves;
    const q = searchQuery.toLowerCase();
    return grooves.filter((g) => g.name.toLowerCase().includes(q));
  }, [grooves, searchQuery]);

  const handleDelete = useCallback((id: string) => {
    deleteGrooveTemplate(id);
    if (selectedId === id) setSelectedId(null);
  }, [deleteGrooveTemplate, selectedId]);

  const handleRename = useCallback((id: string, name: string) => {
    renameGrooveTemplate(id, name);
  }, [renameGrooveTemplate]);

  const handleLoadPreset = useCallback((preset: typeof GROOVE_PRESETS[number]) => {
    const existing = grooves.find((g) => g.id === preset.id);
    if (existing) return; // Already loaded
    addGrooveTemplate({ ...preset, createdAt: Date.now() });
  }, [grooves, addGrooveTemplate]);

  const loadedPresetIds = useMemo(
    () => new Set(grooves.map((g) => g.id)),
    [grooves],
  );

  if (!show) return null;

  return (
    <div
      data-testid="groove-pool-panel"
      className="fixed top-10 right-0 bottom-6 w-80 bg-zinc-900/95 backdrop-blur-md border-l border-zinc-700/50 flex flex-col shadow-2xl"
      style={{ zIndex: Z.panel }}
      role="listbox"
      aria-label="Groove Pool"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/50">
        <h2 className="text-sm font-semibold text-zinc-200">Groove Pool</h2>
        <button
          data-testid="groove-pool-close"
          onClick={() => setShow(false)}
          className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors"
          title="Close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-zinc-700/50">
        <input
          data-testid="groove-pool-search"
          type="text"
          placeholder="Search grooves..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700/50 rounded text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Groove list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {/* Presets section */}
        <button
          data-testid="groove-presets-toggle"
          onClick={() => setShowPresets(!showPresets)}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-medium text-zinc-400 hover:text-zinc-300 transition-colors"
        >
          <span className="transition-transform" style={{ transform: showPresets ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            &#9654;
          </span>
          Built-in Presets ({GROOVE_PRESETS.length})
        </button>
        {showPresets && (
          <div data-testid="groove-presets-list" className="space-y-1 mb-2">
            {GROOVE_PRESETS.map((preset) => {
              const isLoaded = loadedPresetIds.has(preset.id);
              return (
                <div
                  key={preset.id}
                  data-testid={`groove-preset-${preset.id}`}
                  className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800/40 border border-zinc-700/20"
                >
                  <span className="text-[11px] text-zinc-300 flex-1 truncate">{preset.name}</span>
                  <button
                    data-testid={`groove-preset-load-${preset.id}`}
                    onClick={() => handleLoadPreset(preset)}
                    disabled={isLoaded}
                    className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                      isLoaded
                        ? 'text-zinc-500 bg-zinc-700/50 cursor-not-allowed'
                        : 'text-indigo-300 bg-indigo-600/20 hover:bg-indigo-600/40'
                    }`}
                  >
                    {isLoaded ? 'Loaded' : 'Load'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Separator when both presets and grooves exist */}
        {showPresets && filtered.length > 0 && (
          <div className="border-t border-zinc-700/30 my-1" />
        )}
        {filtered.length === 0 ? (
          <div data-testid="groove-pool-empty" className="text-center py-8">
            <p className="text-xs text-zinc-500">
              {searchQuery ? 'No grooves match your search' : 'No grooves yet'}
            </p>
            <p className="text-[10px] text-zinc-600 mt-1">
              Right-click a MIDI clip and select &quot;Extract Groove&quot;
            </p>
          </div>
        ) : (
          filtered.map((groove) => (
            <GrooveItem
              key={groove.id}
              groove={groove}
              isSelected={selectedId === groove.id}
              onSelect={setSelectedId}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          ))
        )}
      </div>

      {/* Apply section */}
      {selectedId && grooves.find((g) => g.id === selectedId) && (
        <ApplyGrooveBar
          grooveId={selectedId}
        />
      )}
    </div>
  );
}

interface ApplyGrooveBarProps {
  grooveId: string;
}

function ApplyGrooveBar({ grooveId }: ApplyGrooveBarProps) {
  const [strength, setStrength] = useState(100);
  const [applyTiming, setApplyTiming] = useState(true);
  const [applyVelocity, setApplyVelocity] = useState(true);
  const applyGrooveToClip = useProjectStore((s) => s.applyGrooveToClip);
  const project = useProjectStore((s) => s.project);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);

  const handleApply = useCallback(() => {
    if (!project || selectedClipIds.size === 0) return;

    // Apply groove to all selected MIDI clips
    for (const clipId of selectedClipIds) {
      // Find the clip to get all note IDs
      for (const track of project.tracks) {
        const clip = track.clips.find((c) => c.id === clipId);
        if (clip?.midiData?.notes?.length) {
          const noteIds = clip.midiData.notes.map((n) => n.id);
          applyGrooveToClip(clipId, noteIds, grooveId, {
            strength,
            applyTiming,
            applyVelocity,
          });
          break;
        }
      }
    }
  }, [project, selectedClipIds, applyGrooveToClip, grooveId, strength, applyTiming, applyVelocity]);

  const hasSelectedMidiClips = useMemo(() => {
    if (!project || selectedClipIds.size === 0) return false;
    return [...selectedClipIds].some((clipId) =>
      project.tracks.some((t) => t.clips.some((c) => c.id === clipId && c.midiData?.notes?.length)),
    );
  }, [project, selectedClipIds]);

  return (
    <div
      data-testid="apply-groove-bar"
      className="border-t border-zinc-700/50 px-4 py-3 space-y-2"
    >
      {/* Strength slider */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-zinc-400 w-14">Strength</label>
        <input
          data-testid="groove-strength-slider"
          type="range"
          min={0}
          max={100}
          value={strength}
          onChange={(e) => setStrength(Number(e.target.value))}
          className="flex-1 h-1 accent-indigo-500"
        />
        <span data-testid="groove-strength-value" className="text-[10px] text-zinc-400 w-8 text-right">
          {strength}%
        </span>
      </div>

      {/* Timing / Velocity toggles */}
      <div className="flex gap-3">
        <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer">
          <input
            data-testid="groove-apply-timing"
            type="checkbox"
            checked={applyTiming}
            onChange={(e) => setApplyTiming(e.target.checked)}
            className="accent-indigo-500"
          />
          Timing
        </label>
        <label className="flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer">
          <input
            data-testid="groove-apply-velocity"
            type="checkbox"
            checked={applyVelocity}
            onChange={(e) => setApplyVelocity(e.target.checked)}
            className="accent-indigo-500"
          />
          Velocity
        </label>
      </div>

      {/* Apply button */}
      <button
        data-testid="groove-apply-button"
        onClick={handleApply}
        disabled={!hasSelectedMidiClips}
        className={`w-full py-1.5 text-xs font-medium rounded transition-colors ${
          hasSelectedMidiClips
            ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
            : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
        }`}
      >
        {hasSelectedMidiClips ? 'Apply Groove' : 'Select a MIDI clip first'}
      </button>
    </div>
  );
}
