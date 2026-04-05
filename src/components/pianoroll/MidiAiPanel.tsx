/**
 * MIDI AI Generation Panel — inline panel within the Piano Roll
 * for AI-powered MIDI generation (infilling, continuation, variation).
 *
 * Follows the same layout pattern as ChordSuggestionPanel.
 * Issue #739
 */
import { useCallback } from 'react';
import { useMidiAiStore } from '../../store/midiAiStore';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { generateMidiAi } from '../../services/midiAiService';
import type { MidiGenerationMode } from '../../types/api';
import type { MidiNote } from '../../types/project';

const MODE_OPTIONS: Array<{ value: MidiGenerationMode; label: string; description: string }> = [
  { value: 'infill', label: 'Infill', description: 'Generate notes within a selected region' },
  { value: 'continue', label: 'Continue', description: 'Extend the melody from the end' },
  { value: 'variation', label: 'Variation', description: 'Create a variation of selected notes' },
  { value: 'arrange', label: 'Arrange', description: 'Generate a complementary part' },
];

const MODEL_OPTIONS = [
  { value: 'anticipatory-music-transformer', label: 'Anticipatory (128M)' },
  { value: 'moonbeam', label: 'Moonbeam' },
  { value: 'midi-gpt', label: 'MIDI-GPT (20M)' },
  { value: 'notagen', label: 'NotaGen' },
];

export function MidiAiPanel() {
  const status = useMidiAiStore((s) => s.status);
  const error = useMidiAiStore((s) => s.error);
  const mode = useMidiAiStore((s) => s.mode);
  const temperature = useMidiAiStore((s) => s.temperature);
  const numResults = useMidiAiStore((s) => s.numResults);
  const model = useMidiAiStore((s) => s.model);
  const style = useMidiAiStore((s) => s.style);
  const selectionStartBeat = useMidiAiStore((s) => s.selectionStartBeat);
  const selectionEndBeat = useMidiAiStore((s) => s.selectionEndBeat);
  const lockedNoteIds = useMidiAiStore((s) => s.lockedNoteIds);
  const variations = useMidiAiStore((s) => s.variations);
  const activeVariationIndex = useMidiAiStore((s) => s.activeVariationIndex);
  const targetClipId = useMidiAiStore((s) => s.targetClipId);

  const setMode = useMidiAiStore((s) => s.setMode);
  const setTemperature = useMidiAiStore((s) => s.setTemperature);
  const setNumResults = useMidiAiStore((s) => s.setNumResults);
  const setModel = useMidiAiStore((s) => s.setModel);
  const setStyle = useMidiAiStore((s) => s.setStyle);
  const nextVariation = useMidiAiStore((s) => s.nextVariation);
  const prevVariation = useMidiAiStore((s) => s.prevVariation);
  const acceptVariation = useMidiAiStore((s) => s.acceptVariation);
  const rejectVariations = useMidiAiStore((s) => s.rejectVariations);
  const closePanel = useMidiAiStore((s) => s.closePanel);
  const clearSelection = useMidiAiStore((s) => s.clearSelection);
  const clearLockedNotes = useMidiAiStore((s) => s.clearLockedNotes);
  const reset = useMidiAiStore((s) => s.reset);

  const project = useProjectStore((s) => s.project);
  const addMidiNote = useProjectStore((s) => s.addMidiNote);
  const removeMidiNote = useProjectStore((s) => s.removeMidiNote);
  const selectedNoteIds = useUIStore((s) => s.selectedPianoRollNoteIds);

  const bpm = project?.bpm ?? 120;

  const clip = project?.tracks
    .flatMap((t) => t.clips)
    .find((c) => c.id === targetClipId) ?? null;

  const notes: MidiNote[] = clip?.midiData?.notes ?? [];
  const lockedCount = lockedNoteIds.size;

  const hasSelection = selectionStartBeat !== null && selectionEndBeat !== null;
  const selectionBars = hasSelection
    ? Math.round(((selectionEndBeat! - selectionStartBeat!) / 4) * 10) / 10
    : 0;

  const canGenerate =
    status !== 'generating' &&
    (mode !== 'infill' || hasSelection) &&
    notes.length > 0;

  // ── Generate handler ──────────────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    if (!canGenerate) return;

    // Compute locked note indices (position in the notes array)
    const lockedIndices: number[] = [];
    notes.forEach((n, i) => {
      if (lockedNoteIds.has(n.id)) lockedIndices.push(i);
    });

    void generateMidiAi(notes, {
      bpm,
      mode,
      selectionStart: selectionStartBeat ?? undefined,
      selectionEnd: selectionEndBeat ?? undefined,
      lockedNoteIndices: lockedIndices.length > 0 ? lockedIndices : undefined,
      temperature,
      numResults,
      model,
      style: style || undefined,
      key: project?.keyScale,
      timeSignature: `${project?.timeSignature ?? 4}/4`,
    });
  }, [
    canGenerate, notes, lockedNoteIds, bpm, mode, selectionStartBeat, selectionEndBeat,
    temperature, numResults, model, style, project,
  ]);

  // ── Accept variation handler ──────────────────────────────────────────────

  const handleAccept = useCallback(() => {
    const variation = acceptVariation();
    if (!variation || !targetClipId) return;

    // In infill mode: remove existing notes in the selection range, then add generated notes
    if (mode === 'infill' && selectionStartBeat !== null && selectionEndBeat !== null) {
      const toRemove = notes.filter(
        (n) =>
          !lockedNoteIds.has(n.id) &&
          n.startBeat >= selectionStartBeat &&
          n.startBeat < selectionEndBeat,
      );
      for (const n of toRemove) {
        removeMidiNote(targetClipId, n.id);
      }
    }

    // Add the generated notes
    for (const note of variation.notes) {
      addMidiNote(targetClipId, note);
    }
  }, [
    acceptVariation, targetClipId, mode, selectionStartBeat, selectionEndBeat,
    notes, lockedNoteIds, removeMidiNote, addMidiNote,
  ]);

  // ── Lock selected notes ───────────────────────────────────────────────────

  const handleLockSelected = useCallback(() => {
    if (selectedNoteIds.length > 0) {
      useMidiAiStore.getState().lockNotes(selectedNoteIds);
    }
  }, [selectedNoteIds]);

  // ── Render ────────────────────────────────────────────────────────────────

  const activeVariation = variations[activeVariationIndex] ?? null;
  const modeDescription = MODE_OPTIONS.find((o) => o.value === mode)?.description ?? '';

  return (
    <div
      className="border-t border-daw-border bg-daw-surface px-3 py-2 shrink-0"
      data-testid="midi-ai-panel"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-medium text-zinc-200">AI MIDI Generate</span>

        {/* Mode selector */}
        <div className="flex gap-0.5">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMode(opt.value)}
              className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                mode === opt.value
                  ? 'bg-violet-600/50 text-violet-200'
                  : 'bg-white/5 text-zinc-400 hover:bg-white/10'
              }`}
              title={opt.description}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Model selector */}
        <select
          aria-label="MIDI AI model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="bg-[#111] border border-[#333] rounded px-1.5 py-0.5 text-[10px] text-zinc-300"
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Status indicators */}
        {status === 'generating' && (
          <span className="text-[10px] text-amber-400 animate-pulse">Generating...</span>
        )}
        {status === 'error' && (
          <span className="text-[10px] text-red-400 truncate max-w-[200px]" title={error ?? ''}>
            Error: {error}
          </span>
        )}

        <div className="ml-auto flex gap-1">
          {status === 'error' && (
            <button
              type="button"
              onClick={reset}
              className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-zinc-400 hover:bg-white/10 transition-colors"
            >
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={closePanel}
            className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-zinc-400 hover:bg-white/10 transition-colors"
            title="Close AI MIDI panel"
          >
            Close
          </button>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        {/* Temperature */}
        <label className="flex items-center gap-1 text-[10px] text-zinc-400">
          Temp:
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-16 h-1 accent-violet-500"
            title={`Temperature: ${temperature.toFixed(1)}`}
          />
          <span className="text-zinc-300 tabular-nums w-6">{temperature.toFixed(1)}</span>
        </label>

        {/* Variations count */}
        <label className="flex items-center gap-1 text-[10px] text-zinc-400">
          Variations:
          <select
            value={numResults}
            onChange={(e) => setNumResults(parseInt(e.target.value))}
            className="bg-[#111] border border-[#333] rounded px-1 py-0.5 text-[10px] text-zinc-300"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>

        {/* Style hint */}
        <label className="flex items-center gap-1 text-[10px] text-zinc-400">
          Style:
          <input
            type="text"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            placeholder="e.g. jazz, classical"
            className="bg-[#111] border border-[#333] rounded px-1.5 py-0.5 text-[10px] text-zinc-300 w-28"
          />
        </label>

        {/* Selection info */}
        {mode === 'infill' && (
          <span className="text-[10px] text-zinc-500">
            {hasSelection
              ? `Region: ${selectionStartBeat!.toFixed(1)}–${selectionEndBeat!.toFixed(1)} beats (${selectionBars} bars)`
              : 'Select a region in the piano roll to generate'}
          </span>
        )}

        {/* Locked notes info */}
        {lockedCount > 0 && (
          <span className="text-[10px] text-amber-400/80">
            {lockedCount} note{lockedCount === 1 ? '' : 's'} locked
          </span>
        )}
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2">
        {/* Lock selected */}
        <button
          type="button"
          onClick={handleLockSelected}
          disabled={selectedNoteIds.length === 0}
          className="px-1.5 py-0.5 rounded text-[10px] bg-amber-600/20 text-amber-200 hover:bg-amber-600/40 disabled:opacity-30 transition-colors"
          title="Lock selected notes (they won't be regenerated)"
        >
          Lock Selected
        </button>

        {lockedCount > 0 && (
          <button
            type="button"
            onClick={clearLockedNotes}
            className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-zinc-400 hover:bg-white/10 transition-colors"
            title="Unlock all notes"
          >
            Unlock All
          </button>
        )}

        {hasSelection && (
          <button
            type="button"
            onClick={clearSelection}
            className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-zinc-400 hover:bg-white/10 transition-colors"
            title="Clear selection region"
          >
            Clear Region
          </button>
        )}

        {/* Generate button */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="px-3 py-1 rounded text-[11px] font-medium bg-violet-600/60 text-violet-100 hover:bg-violet-600/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={modeDescription}
        >
          {status === 'generating' ? 'Generating...' : `Generate (${mode})`}
        </button>
      </div>

      {/* Preview row — shown when previewing variations */}
      {status === 'previewing' && activeVariation && (
        <div className="mt-2 flex items-center gap-2 p-2 rounded bg-daw-surface-2 border border-violet-500/20">
          <span className="text-[10px] text-zinc-400">Preview:</span>

          {/* Variation navigation */}
          <button
            type="button"
            onClick={prevVariation}
            disabled={activeVariationIndex === 0}
            className="px-1 py-0.5 rounded text-[10px] bg-white/5 text-zinc-400 hover:bg-white/10 disabled:opacity-30 transition-colors"
          >
            &lt;
          </button>

          <span className="text-[11px] text-zinc-200 tabular-nums">
            {activeVariationIndex + 1} / {variations.length}
          </span>

          <button
            type="button"
            onClick={nextVariation}
            disabled={activeVariationIndex === variations.length - 1}
            className="px-1 py-0.5 rounded text-[10px] bg-white/5 text-zinc-400 hover:bg-white/10 disabled:opacity-30 transition-colors"
          >
            &gt;
          </button>

          {/* Score */}
          {activeVariation.score !== undefined && (
            <span className="text-[10px] text-zinc-500">
              Score: {(activeVariation.score * 100).toFixed(0)}%
            </span>
          )}

          {/* Notes count */}
          <span className="text-[10px] text-zinc-500">
            {activeVariation.notes.length} notes
          </span>

          {/* Model info */}
          <span className="text-[9px] text-zinc-600">
            via {activeVariation.model}
          </span>

          {/* Accept / Reject */}
          <div className="ml-auto flex gap-1">
            <button
              type="button"
              onClick={rejectVariations}
              className="px-2 py-0.5 rounded text-[10px] bg-red-600/20 text-red-300 hover:bg-red-600/40 transition-colors"
              title="Discard all variations"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className="px-2 py-0.5 rounded text-[10px] bg-emerald-600/30 text-emerald-200 hover:bg-emerald-600/50 transition-colors"
              title="Apply this variation to the clip"
            >
              Accept
            </button>
          </div>
        </div>
      )}

      {/* Empty state hint */}
      {notes.length === 0 && (
        <div className="mt-1 text-[10px] text-zinc-500">
          Add some notes first — the AI uses existing notes as context for generation.
        </div>
      )}
    </div>
  );
}
