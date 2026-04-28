/**
 * Track Preset Manager — save, browse, apply, and delete track presets.
 *
 * Presets capture a track's instrument, effects chain, and settings
 * so they can be reused to create new tracks with the same configuration.
 */
import { useState, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useCollaborationStore } from '../../store/collaborationStore';
import type { TrackPreset } from '../../types/project';
import { toastError } from '../../hooks/useToast';

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

// ─── Preset Row ───────────────────────────────────────────────────────────

function PresetRow({
  preset,
  onApply,
  onDelete,
}: {
  preset: TrackPreset;
  onApply: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-800/40 rounded transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-zinc-200 truncate">{preset.name}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] text-zinc-500 capitalize">{preset.trackType}</span>
          <span className="text-[9px] text-zinc-600">{formatDate(preset.createdAt)}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onApply}
        className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700/40 text-zinc-300 hover:bg-zinc-600/50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        aria-label="Apply preset"
      >
        Apply
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 text-[11px]"
        aria-label="Delete preset"
      >
        ×
      </button>
    </div>
  );
}

// ─── Save Preset Form ─────────────────────────────────────────────────────

function SavePresetForm() {
  const [name, setName] = useState('');
  const tracks = useProjectStore((s) => s.project?.tracks ?? []);
  const saveTrackPreset = useProjectStore((s) => s.saveTrackPreset);
  const [selectedTrackId, setSelectedTrackId] = useState('');

  const [saveError, setSaveError] = useState('');

  // Prefer selected track only while it still exists; fall back to first track.
  const hasSelectedTrack = tracks.some((t) => t.id === selectedTrackId);
  const effectiveTrackId = (hasSelectedTrack ? selectedTrackId : tracks[0]?.id) || '';

  const handleSave = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed || !effectiveTrackId) return;
    setSaveError('');
    try {
      const preset = saveTrackPreset(effectiveTrackId, trimmed);
      if (preset) {
        setName('');
      } else {
        setSaveError('Preset was not saved.');
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save preset.');
    }
  }, [name, effectiveTrackId, saveTrackPreset]);

  return (
    <div className="px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        {tracks.length > 1 && (
          <select
            value={effectiveTrackId}
            onChange={(e) => { setSelectedTrackId(e.target.value); setSaveError(''); }}
            aria-label="Track to save preset from"
            className="text-[10px] bg-zinc-800 border border-zinc-700/50 rounded px-1 py-0.5 text-zinc-300 focus:outline-none focus:border-zinc-500"
          >
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName || t.trackName}
              </option>
            ))}
          </select>
        )}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          placeholder="Preset name..."
          aria-label="Preset name"
          className="flex-1 px-1.5 py-0.5 text-[10px] bg-zinc-800/50 border border-zinc-700/50 rounded text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500/70"
        />
        <button
          type="button"
          onClick={handleSave}
          className="text-[9px] px-2 py-0.5 rounded bg-zinc-700/50 text-zinc-300 hover:bg-zinc-600/50 transition-colors"
          aria-label="Save preset"
        >
          Save
        </button>
      </div>
      {saveError && (
        <div className="mt-1 text-[9px] text-red-400" role="alert">{saveError}</div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────

export function TrackPresetManager() {
  const presets = useProjectStore((s) => s.project?.trackPresets ?? []);
  const applyTrackPreset = useProjectStore((s) => s.applyTrackPreset);
  const deleteTrackPreset = useProjectStore((s) => s.deleteTrackPreset);
  const isViewerMode = useCollaborationStore((s) => s.isViewerMode);

  const handleApplyPreset = useCallback((presetId: string) => {
    const track = applyTrackPreset(presetId);
    if (!track) {
      toastError(isViewerMode
        ? 'Track presets cannot be applied in viewer mode.'
        : 'Track preset could not be applied.');
    }
  }, [applyTrackPreset, isViewerMode]);

  const handleDeletePreset = useCallback((presetId: string) => {
    if (isViewerMode) {
      toastError('Track presets cannot be deleted in viewer mode.');
      return;
    }
    deleteTrackPreset(presetId);
  }, [deleteTrackPreset, isViewerMode]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-2 py-1.5 border-b border-zinc-700/50">
        <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
          Track Presets
        </div>
      </div>

      {/* Save form */}
      <div className="border-b border-zinc-700/30">
        <SavePresetForm />
      </div>

      {/* Preset list */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {presets.length === 0 ? (
          <div className="text-[10px] text-zinc-500 text-center py-4">
            No track presets saved yet.
            <br />
            <span className="text-[9px]">
              Save a track's instrument and effects as a preset.
            </span>
          </div>
        ) : (
          presets.map((preset) => (
            <PresetRow
              key={preset.id}
              preset={preset}
              onApply={() => handleApplyPreset(preset.id)}
              onDelete={() => handleDeletePreset(preset.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
