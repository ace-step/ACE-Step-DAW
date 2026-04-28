/**
 * AI Chord Suggestion Panel — shows current chord progression
 * and AI-predicted next chords inline within the Piano Roll.
 *
 * Uses ChordSeqAI (ONNX) for client-side inference.
 */
import { useCallback, useEffect } from 'react';
import { useChordSuggestionStore } from '../../store/chordSuggestionStore';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { getChordByIndex, getChordByLabel } from '../../utils/chordVocabulary';
import {
  addChordAndPredict,
  undoLastChordAndPredict,
  clearAll,
  requestPrediction,
  ensureModelLoaded,
} from '../../services/chordSuggestionService';
import { CHORD_GENRES, CHORD_DECADES, type ChordGenre, type ChordDecade } from '../../types/chordSuggestion';
import { CHORD_MODEL_REGISTRY } from '../../services/chordModelManager';
import type { ChordModelVariant } from '../../types/chordSuggestion';

const MODEL_OPTIONS: Array<{ value: ChordModelVariant; label: string }> = [
  { value: 'transformer-s', label: 'Transformer S (4.5 MB)' },
  { value: 'transformer-m', label: 'Transformer M (9.4 MB)' },
  { value: 'transformer-l', label: 'Transformer L (17.8 MB)' },
  { value: 'conditional-s', label: 'Cond. S (4.6 MB, genre)' },
  { value: 'conditional-m', label: 'Cond. M (9.6 MB, genre)' },
  { value: 'conditional-l', label: 'Cond. L (18 MB, genre)' },
  { value: 'rnn', label: 'RNN (1.4 MB, fast)' },
];

export function ChordSuggestionPanel() {
  const progression = useChordSuggestionStore((s) => s.progression);
  const suggestions = useChordSuggestionStore((s) => s.suggestions);
  const status = useChordSuggestionStore((s) => s.status);
  const error = useChordSuggestionStore((s) => s.error);
  const modelVariant = useChordSuggestionStore((s) => s.modelVariant);
  const styleCondition = useChordSuggestionStore((s) => s.styleCondition);
  const setModelVariant = useChordSuggestionStore((s) => s.setModelVariant);
  const setGenreWeight = useChordSuggestionStore((s) => s.setGenreWeight);
  const setDecadeWeight = useChordSuggestionStore((s) => s.setDecadeWeight);
  const clearStyleCondition = useChordSuggestionStore((s) => s.clearStyleCondition);

  const openClipId = useUIStore((s) => s.openPianoRollClipId);
  const openTrackId = useUIStore((s) => s.openPianoRollTrackId);
  const stampChord = useProjectStore((s) => s.stampChord);
  const project = useProjectStore((s) => s.project);

  const isConditional = CHORD_MODEL_REGISTRY[modelVariant]?.conditional ?? false;

  // Load model on first open
  useEffect(() => {
    void ensureModelLoaded();
  }, [modelVariant]);

  // Re-predict when prediction inputs change
  useEffect(() => {
    if (progression.length > 0) {
      void requestPrediction();
    }
  }, [progression, modelVariant, styleCondition]);

  const handleAddSuggestion = useCallback((tokenIndex: number) => {
    void addChordAndPredict(tokenIndex);
  }, []);

  const handleStampChord = useCallback((tokenIndex: number) => {
    if (!openClipId || !openTrackId) return;

    const token = getChordByIndex(tokenIndex);
    if (!token || token.midiNotes.length === 0) return;

    const track = project?.tracks.find((t) => t.id === openTrackId);
    const clip = track?.clips.find((c) => c.id === openClipId);
    if (!clip?.midiData) return;

    // Find the end position of existing notes (or start at beat 0)
    const existingNotes = clip.midiData.notes;
    const lastEnd = existingNotes.reduce(
      (max, n) => Math.max(max, n.startBeat + n.durationBeats),
      0,
    );

    // Stamp chord at the next available position, 1 bar duration
    const timeSignatureNumerator = project?.timeSignature ?? 4;
    const timeSignatureDenominator = (project as Record<string, number> | null)?.timeSignatureDenominator ?? 4;
    const beatsPerBar = timeSignatureNumerator * (4 / timeSignatureDenominator);
    const startBeat = lastEnd;

    // Deduplicate pitches to avoid stacked duplicate notes from vocabulary
    const uniqueMidiNotes = [...new Set(token.midiNotes)];
    const rootPitch = Math.min(...uniqueMidiNotes);
    const intervals = uniqueMidiNotes.map((n) => n - rootPitch);

    stampChord(openClipId, rootPitch, intervals, startBeat, beatsPerBar, 80);

    // Also add to progression for continued prediction
    void addChordAndPredict(tokenIndex);
  }, [openClipId, openTrackId, project, stampChord]);

  const handleUndo = useCallback(() => {
    void undoLastChordAndPredict();
  }, []);

  const handleClear = useCallback(() => {
    clearAll();
  }, []);

  const handleModelChange = useCallback((variant: ChordModelVariant) => {
    setModelVariant(variant);
    void ensureModelLoaded(variant);
  }, [setModelVariant]);

  const selectedGenre = Object.entries(styleCondition.genres).find(([, w]) => w > 0)?.[0] ?? '';
  const selectedDecade = Object.entries(styleCondition.decades).find(([, w]) => w > 0)?.[0] ?? '';

  return (
    <div
      className="border-t border-daw-border bg-daw-surface px-3 py-2 shrink-0"
      data-testid="chord-suggestion-panel"
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-medium text-zinc-200">AI Chord Suggest</span>

        <select
          aria-label="Chord AI model"
          value={modelVariant}
          onChange={(e) => handleModelChange(e.target.value as ChordModelVariant)}
          className="bg-[#111] border border-[#333] rounded px-1.5 py-0.5 text-[10px] text-zinc-300"
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Conditional model: genre/decade selectors */}
        {isConditional && (
          <>
            <select
              aria-label="Genre conditioning"
              value={selectedGenre}
              onChange={(e) => {
                clearStyleCondition();
                if (e.target.value) setGenreWeight(e.target.value as ChordGenre, 1.0);
              }}
              className="bg-[#111] border border-[#333] rounded px-1.5 py-0.5 text-[10px] text-zinc-300"
            >
              <option value="">Genre: any</option>
              {CHORD_GENRES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <select
              aria-label="Decade conditioning"
              value={selectedDecade}
              onChange={(e) => {
                // Clear existing decade weights, set new one
                for (const d of CHORD_DECADES) {
                  setDecadeWeight(d, 0);
                }
                if (e.target.value) setDecadeWeight(e.target.value as ChordDecade, 1.0);
              }}
              className="bg-[#111] border border-[#333] rounded px-1.5 py-0.5 text-[10px] text-zinc-300"
            >
              <option value="">Decade: any</option>
              {CHORD_DECADES.map((d) => (
                <option key={d} value={d}>{d}s</option>
              ))}
            </select>
          </>
        )}

        {status === 'loading-model' && (
          <span className="text-[10px] text-amber-400 animate-pulse">Loading model...</span>
        )}
        {status === 'predicting' && (
          <span className="text-[10px] text-cyan-400 animate-pulse">Predicting...</span>
        )}
        {status === 'error' && (
          <span className="text-[10px] text-red-400" title={error ?? ''}>Error: {error}</span>
        )}

        <div className="ml-auto flex gap-1">
          <button
            onClick={handleUndo}
            disabled={progression.length === 0}
            className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-zinc-400 hover:bg-white/10 disabled:opacity-30 transition-colors"
            title="Undo last chord"
          >
            Undo
          </button>
          <button
            onClick={handleClear}
            disabled={progression.length === 0}
            className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-zinc-400 hover:bg-white/10 disabled:opacity-30 transition-colors"
            title="Clear progression"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Current progression */}
      {progression.length > 0 && (
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          <span className="text-[10px] text-zinc-500 mr-1">Progression:</span>
          {progression.map((tokenIndex, i) => {
            const token = getChordByIndex(tokenIndex);
            return (
              <span
                key={`${tokenIndex}-${i}`}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-violet-600/30 text-violet-200 border border-violet-500/20"
              >
                {token?.label ?? `?${tokenIndex}`}
              </span>
            );
          })}
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-zinc-500 mr-1">Next:</span>
          {suggestions.map((suggestion) => {
            const pctLabel = `${Math.round(suggestion.probability * 100)}%`;
            return (
              <div key={suggestion.token.index} className="flex items-center gap-0.5">
                <button
                  onClick={() => handleAddSuggestion(suggestion.token.index)}
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-600/20 text-cyan-200 border border-cyan-500/20 hover:bg-cyan-600/40 transition-colors"
                  title={`Add ${suggestion.token.label} to progression (${pctLabel})`}
                >
                  {suggestion.token.label}
                </button>
                <button
                  onClick={() => handleStampChord(suggestion.token.index)}
                  className="px-1 py-0.5 rounded text-[9px] bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/40 transition-colors"
                  title={`Stamp ${suggestion.token.label} into piano roll at next position`}
                >
                  +PR
                </button>
                <span className="text-[9px] text-zinc-500 tabular-nums mr-1">{pctLabel}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {suggestions.length === 0 && progression.length === 0 && status !== 'loading-model' && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500">
            Start with a common chord:
          </span>
          <div className="flex gap-1 flex-wrap">
            {['C', 'Am', 'F', 'G', 'Dm', 'Em'].map((label) => {
              const token = findTokenByLabel(label);
              if (!token) return null;
              return (
                <button
                  key={label}
                  onClick={() => handleAddSuggestion(token.index)}
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 text-zinc-300 hover:bg-white/10 transition-colors"
                  title={`Start with ${label}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Helper to find a token by label. */
function findTokenByLabel(label: string) {
  return getChordByLabel(label);
}
