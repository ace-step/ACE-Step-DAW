import { useCallback, useEffect, useMemo, useState, type SetStateAction } from 'react';
import { useAudioImport } from '../../hooks/useAudioImport';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { GranularSettings, PianoRollGrid, SamplerConfig } from '../../types/project';
import { CHORD_SHAPES, DEFAULT_CHORD_SHAPE_ABBR, getChordShapeByAbbr } from '../../utils/chords';
import { QuickSamplerEditor } from './QuickSamplerEditor';
import { ZoneMapEditor } from './ZoneMapEditor';
import { GranularPanel } from './GranularPanel';
import { GrooveTemplatesPanel } from './GrooveTemplatesPanel';
import { GeneratePatternDialog } from './GeneratePatternDialog';
import { PianoRollCanvas } from './PianoRollCanvas';
import { PianoRollEmptyState } from './PianoRollEmptyState';
import { QuantizeDialog } from './QuantizeDialog';
import { SynthPresetBrowser } from './SynthPresetBrowser';
import { getSynthPresetById, type SynthPresetCategory } from '../../data/synthPresets';
import { createUserPreset, getPresetById, type InstrumentPresetCategory } from '../../data/instrumentPresets';
import { TransformMenu } from './TransformMenu';
import { ChordSuggestionPanel } from './ChordSuggestionPanel';
import { MidiAiPanel } from './MidiAiPanel';
import { useChordSuggestionStore } from '../../store/chordSuggestionStore';
import { useMidiAiStore } from '../../store/midiAiStore';
import { getPianoRollToolShortcut, type PianoRollTool } from './PianoRollConstants';
import { SynthParameterEditor, PRESET_DEFAULT_OSCILLATOR } from '../synth/SynthParameterEditor';
import { PhysicalModelingEditor } from '../synth/PhysicalModelingEditor';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const PIANO_ROLL_TOOL_BUTTONS = [
  { tool: 'select', label: 'Select', icon: '↖' },
  { tool: 'pencil', label: 'Pencil', icon: '✏' },
  { tool: 'paint', label: 'Paint', icon: '▦' },
  { tool: 'erase', label: 'Erase', icon: '⌫' },
  { tool: 'velocityPaint', label: 'Vel Paint', icon: '⇕' },
] as const satisfies ReadonlyArray<{ tool: PianoRollTool; label: string; icon: string }>;

export function PianoRoll() {
  const [gridSize, setGridSize] = useState<PianoRollGrid>('1/16');
  const [prZoomX, setPrZoomX] = useState(1);
  const [samplerDropActive, setSamplerDropActive] = useState(false);
  const [showSynthParams, setShowSynthParams] = useState(false);

  const project = useProjectStore((s) => s.project);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const loadSynthPreset = useProjectStore((s) => s.loadSynthPreset);
  const updateSynthOscillatorType = useProjectStore((s) => s.updateSynthOscillatorType);
  const setTrackSampler = useProjectStore((s) => s.setTrackSampler);
  const clearTrackSampler = useProjectStore((s) => s.clearTrackSampler);
  const updateSamplerConfig = useProjectStore((s) => s.updateSamplerConfig);
  const updateGranularConfig = useProjectStore((s) => s.updateGranularConfig);
  const clearGranularConfig = useProjectStore((s) => s.clearGranularConfig);
  const convertMidiClipToStrudel = useProjectStore((s) => s.convertMidiClipToStrudel);
  const convertMidiTrackToStrudel = useProjectStore((s) => s.convertMidiTrackToStrudel);
  const applyStrudelCodeToTrack = useProjectStore((s) => s.applyStrudelCodeToTrack);
  const {
    importAudioFileAsSampler,
    importAssetAsQuickSampler,
    openSamplerFilePicker,
    openGranularFilePicker,
  } = useAudioImport();

  const userSynthPresets = useUIStore((s) => s.userSynthPresets);
  const saveSynthPreset = useUIStore((s) => s.saveSynthPreset);
  const deleteUserSynthPreset = useUIStore((s) => s.deleteUserSynthPreset);
  const userInstrumentPresets = useUIStore((s) => s.userInstrumentPresets);
  const saveInstrumentPreset = useUIStore((s) => s.saveInstrumentPreset);
  const deleteInstrumentPreset = useUIStore((s) => s.deleteInstrumentPreset);
  const openTrackId = useUIStore((s) => s.openPianoRollTrackId);
  const openClipId = useUIStore((s) => s.openPianoRollClipId);
  const selectedPianoRollNoteIds = useUIStore((s) => s.selectedPianoRollNoteIds);
  const activeTool = useUIStore((s) => s.activePianoRollTool);
  const activeChordShapeAbbr = useUIStore((s) => s.activePianoRollChordShape);
  const showGhostNotes = useUIStore((s) => s.showGhostNotes);
  const toggleGhostNotes = useUIStore((s) => s.toggleGhostNotes);
  const pianoRollHeight = useUIStore((s) => s.pianoRollHeight);
  const setPianoRollHeight = useUIStore((s) => s.setPianoRollHeight);
  const setOpenPianoRoll = useUIStore((s) => s.setOpenPianoRoll);
  const setSelectedPianoRollNoteIds = useUIStore((s) => s.setSelectedPianoRollNoteIds);
  const setActivePianoRollTool = useUIStore((s) => s.setActivePianoRollTool);
  const setActivePianoRollChordShape = useUIStore((s) => s.setActivePianoRollChordShape);
  const setKeyboardContext = useUIStore((s) => s.setKeyboardContext);
  const openGeneratePatternDialog = useUIStore((s) => s.openGeneratePatternDialog);
  const openQuantizeDialog = useUIStore((s) => s.openQuantizeDialog);
  const setHistoryFocusScope = useUIStore((s) => s.setHistoryFocusScope);
  const chordPanelOpen = useChordSuggestionStore((s) => s.panelOpen);
  const toggleChordPanel = useChordSuggestionStore((s) => s.togglePanel);
  const midiAiPanelOpen = useMidiAiStore((s) => s.panelOpen);
  const openMidiAiPanel = useMidiAiStore((s) => s.openPanel);
  const closeMidiAiPanel = useMidiAiStore((s) => s.closePanel);
  const [groovePanelOpen, setGroovePanelOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const ui = useUIStore.getState();
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;
      if (ui.keyboardContext.scope !== 'pianoRoll' || !ui.openPianoRollTrackId) return;

      const toolByCode: Partial<Record<KeyboardEvent['code'], PianoRollTool>> = {
        KeyV: 'select',
        KeyB: 'pencil',
        KeyX: 'erase',
        Digit1: 'select',
        Digit2: 'pencil',
        Digit3: 'paint',
        Digit4: 'erase',
        Digit5: 'slide',
        Digit6: 'velocityPaint',
      };

      const tool = toolByCode[event.code];
      if (tool) {
        event.preventDefault();
        setActivePianoRollTool(tool);
        return;
      }

      // AI generation shortcuts
      const clipId = ui.openPianoRollClipId;
      const trackId = ui.openPianoRollTrackId;

      // G = Toggle AI Generate panel
      if (event.code === 'KeyG' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        const aiState = useMidiAiStore.getState();
        if (aiState.panelOpen) {
          aiState.closePanel();
        } else if (trackId && clipId) {
          aiState.openPanel(trackId, clipId);
        }
        return;
      }

      // L = Lock/unlock selected notes (when AI panel is open)
      if (event.code === 'KeyL' && !event.ctrlKey && !event.metaKey) {
        const aiState = useMidiAiStore.getState();
        if (!aiState.panelOpen) return;
        const selected = ui.selectedPianoRollNoteIds;
        if (selected.length === 0) return;
        event.preventDefault();
        // Toggle: if any selected note is unlocked, lock all; otherwise unlock all
        const anyUnlocked = selected.some((id) => !aiState.lockedNoteIds.has(id));
        if (anyUnlocked) {
          aiState.lockNotes(selected);
        } else {
          aiState.unlockNotes(selected);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActivePianoRollTool]);

  const track = useMemo(
    () => project?.tracks.find((candidate) => candidate.id === openTrackId) ?? null,
    [openTrackId, project],
  );

  const clip = useMemo(() => {
    if (!track) return null;
    if (openClipId) {
      const selectedClip = track.clips.find((candidate) => candidate.id === openClipId);
      if (selectedClip?.midiData) return selectedClip;
    }
    return track.clips.find((candidate) => candidate.midiData) ?? null;
  }, [openClipId, track]);

  const ghostNotes = useMemo(() => {
    if (!showGhostNotes || !project || !track) return [];
    const notes: Array<{ pitch: number; startBeat: number; durationBeats: number; color: string }> = [];
    for (const otherTrack of project.tracks) {
      if (otherTrack.id === track.id) continue;
      for (const otherClip of otherTrack.clips) {
        if (otherClip.midiData) {
          for (const note of otherClip.midiData.notes) {
            notes.push({ pitch: note.pitch, startBeat: note.startBeat, durationBeats: note.durationBeats, color: otherTrack.color });
          }
        }
      }
    }
    return notes;
  }, [showGhostNotes, project, track]);

  const samplerConfig = track?.samplerConfig ?? null;
  const selectedNoteIds = useMemo(() => new Set(selectedPianoRollNoteIds), [selectedPianoRollNoteIds]);
  const sampleDuration = Math.max(0.01, track?.sampler?.sampleDuration ?? samplerConfig?.trimEnd ?? 1);
  const activeToolLabel = PIANO_ROLL_TOOL_BUTTONS.find(({ tool }) => tool === activeTool)?.label
    ?? (activeTool === 'slide' ? 'Slide' : 'Select');
  const activeChordShape = getChordShapeByAbbr(activeChordShapeAbbr) ?? getChordShapeByAbbr(DEFAULT_CHORD_SHAPE_ABBR)!;
  const selectedNoteCount = selectedNoteIds.size;
  const navigationSummary = selectedNoteCount === 0
    ? 'No note selected'
    : `${selectedNoteCount} note${selectedNoteCount === 1 ? '' : 's'} selected`;

  const handleSelectedNoteIdsChange = useCallback((next: SetStateAction<Set<string>>) => {
    const resolved = typeof next === 'function' ? next(new Set(selectedPianoRollNoteIds)) : next;
    setSelectedPianoRollNoteIds(Array.from(resolved));
  }, [selectedPianoRollNoteIds, setSelectedPianoRollNoteIds]);

  const applySamplerConfig = useCallback((updates: Partial<SamplerConfig>) => {
    if (!track?.sampler?.audioKey || !samplerConfig) return;

    const trimStart = clamp(updates.trimStart ?? samplerConfig.trimStart, 0, sampleDuration - 0.01);
    const trimEnd = clamp(updates.trimEnd ?? samplerConfig.trimEnd, trimStart + 0.01, sampleDuration);
    const loopStart = clamp(updates.loopStart ?? samplerConfig.loopStart, trimStart, trimEnd - 0.01);
    const loopEnd = clamp(updates.loopEnd ?? samplerConfig.loopEnd, loopStart + 0.01, trimEnd);

    updateSamplerConfig(track.id, {
      ...samplerConfig,
      ...updates,
      rootNote: updates.rootNote ?? samplerConfig.rootNote,
      trimStart,
      trimEnd,
      loopStart,
      loopEnd,
    });
  }, [sampleDuration, samplerConfig, track, updateSamplerConfig]);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = pianoRollHeight;

      const onMouseMove = (event: MouseEvent) => {
        setPianoRollHeight(startHeight + (startY - event.clientY));
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [pianoRollHeight, setPianoRollHeight],
  );

  const handleSamplerDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const types = e.dataTransfer.types;
    if (types.includes('Files') || types.includes('application/x-asset-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setSamplerDropActive(true);
    }
  }, []);

  const handleSamplerDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setSamplerDropActive(false);
    if (!track) return;

    const assetId = e.dataTransfer.getData('application/x-asset-id');
    if (assetId) {
      await importAssetAsQuickSampler(assetId, track.id);
      return;
    }

    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|aac|m4a|webm)$/i.test(file.name))) {
      await importAudioFileAsSampler(file, track.id);
    }
  }, [importAssetAsQuickSampler, importAudioFileAsSampler, track]);

  const handleSavePreset = useCallback(() => {
    if (!track) return;
    const name = window.prompt('Preset name:');
    if (!name) return;
    const inst = track.instrument;
    if (!inst) return;

    const currentUnified = track.synthPresetDefinitionId
      ? getPresetById(track.synthPresetDefinitionId, userInstrumentPresets)
      : null;
    const currentLegacy = track.synthPresetDefinitionId
      ? getSynthPresetById(track.synthPresetDefinitionId, userSynthPresets)
      : null;
    const category: InstrumentPresetCategory =
      currentUnified?.category ?? currentLegacy?.category ?? 'Keys';

    const preset = createUserPreset(name, category, inst);
    saveInstrumentPreset(preset);
  }, [track, saveInstrumentPreset, userInstrumentPresets, userSynthPresets]);

  if (!track) return null;

  return (
    <div
      data-keyboard-context="pianoRoll"
      role="region"
      tabIndex={0}
      className="border-t border-[#1a1a1a] bg-[#1a1a1e] flex flex-col select-none shrink-0"
      style={{ height: pianoRollHeight }}
      onMouseDownCapture={() => setHistoryFocusScope('pianoRoll')}
      onFocusCapture={() => setHistoryFocusScope('pianoRoll')}
      onFocus={() => setKeyboardContext('pianoRoll', track.id)}
      onMouseDown={() => setKeyboardContext('pianoRoll', track.id)}
    >
      <div
        aria-label="Resize piano roll"
        className="h-1.5 w-full cursor-ns-resize bg-[#444] hover:bg-violet-500 transition-colors flex-shrink-0"
        onMouseDown={handleResizeMouseDown}
      />

      <div className="px-3 py-2 border-b border-[#2a2a2a] bg-[#1e1e22] flex items-center gap-2 shrink-0 flex-wrap">
        <div className="text-xs font-medium text-zinc-200">{track.displayName}</div>

        {PIANO_ROLL_TOOL_BUTTONS.map(({ tool, label, icon }) => {
          const active = activeTool === tool;
          return (
            <button
              type="button"
              key={tool}
              aria-label={`Activate ${label.toLowerCase()} tool`}
              aria-keyshortcuts={getPianoRollToolShortcut(tool)}
              aria-pressed={active ? 'true' : 'false'}
              className={`px-2 py-1 rounded text-[10px] transition-colors ${
                active ? 'bg-violet-600/50 text-violet-200' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
              }`}
              onClick={() => setActivePianoRollTool(tool)}
              title={`${label} tool (${getPianoRollToolShortcut(tool)})`}
            >
              {icon} {label}
            </button>
          );
        })}

        <div
          aria-label="Piano roll tool status"
          role="status"
          aria-live="polite"
          data-active-tool={activeTool}
          className="px-2 py-1 rounded bg-black/20 border border-white/5 text-[10px] text-zinc-300"
        >
          Tool: <span className="text-zinc-100">{activeToolLabel}</span>
        </div>

        <div
          aria-label="Piano roll navigation status"
          role="status"
          aria-live="polite"
          className="px-2 py-1 rounded bg-black/20 border border-white/5 text-[10px] text-zinc-300"
        >
          Scope: <span className="text-zinc-100">Piano Roll</span> · {navigationSummary}
        </div>

        <select
          aria-label="Piano roll chord shape"
          value={activeChordShapeAbbr}
          onChange={(e) => setActivePianoRollChordShape(e.target.value)}
          className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[11px] text-zinc-300"
          title="Chord stamp shape for Shift+click placement"
        >
          {CHORD_SHAPES.map((shape) => (
            <option key={shape.abbr} value={shape.abbr}>
              {shape.abbr}
            </option>
          ))}
        </select>

        <div className="px-2 py-1 rounded bg-black/20 border border-white/5 text-[10px] text-zinc-300">
          Chord stamp: <span className="text-zinc-100">{activeChordShape.abbr}</span>
        </div>

        <div className="px-2 py-1 rounded bg-black/20 border border-white/5 text-[10px] text-zinc-400">
          Shift+click stamps root position for one grid step
        </div>

        <button
          className={`px-2 py-1 rounded text-[10px] transition-colors ${
            showGhostNotes ? 'bg-cyan-600/50 text-cyan-200' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
          }`}
          onClick={toggleGhostNotes}
          title="Show notes from other tracks"
        >
          Ghost
        </button>

        <select
          aria-label="Piano roll grid size"
          value={gridSize}
          onChange={(e) => setGridSize(e.target.value as PianoRollGrid)}
          className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[11px] text-zinc-300"
        >
          <option value="1/4">1/4</option>
          <option value="1/8">1/8</option>
          <option value="1/16">1/16</option>
          <option value="1/32">1/32</option>
        </select>

        <SynthPresetBrowser
          trackId={track.id}
          currentPresetId={track.synthPresetDefinitionId ?? null}
          onSelectPreset={(presetId) => loadSynthPreset(track.id, presetId)}
          onSavePreset={handleSavePreset}
          userPresets={userSynthPresets}
          userInstrumentPresets={userInstrumentPresets}
          onDeleteUserPreset={(presetId) => {
            deleteUserSynthPreset(presetId);
            deleteInstrumentPreset(presetId);
          }}
        />

        {track.synthPreset !== 'sampler' && (
          <button
            type="button"
            aria-label="Toggle synth parameters"
            aria-pressed={showSynthParams ? 'true' : 'false'}
            className={`px-2 py-1 rounded text-[10px] transition-colors ${
              showSynthParams
                ? 'bg-violet-600/50 text-violet-200'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
            onClick={() => setShowSynthParams((v) => !v)}
            title="Show/hide synth parameter editor"
          >
            Synth Params
          </button>
        )}

        {/* Legacy preset dropdown (Quick Sampler toggle) */}
        <select
          aria-label="Track synth preset"
          value={track.synthPreset ?? 'piano'}
          onChange={(e) => {
            const preset = e.target.value as typeof track.synthPreset;
            updateTrack(track.id, { synthPreset: preset });
            // Reset oscillator to preset default (skip for sampler — no synth params)
            if (preset !== 'sampler') {
              updateSynthOscillatorType(track.id, PRESET_DEFAULT_OSCILLATOR[preset ?? 'piano'] ?? 'triangle');
            }
          }}
          className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[11px] text-zinc-300"
        >
          <option value="piano">Piano</option>
          <option value="strings">Strings</option>
          <option value="pad">Pad</option>
          <option value="lead">Lead</option>
          <option value="bass">Bass</option>
          <option value="organ">Organ</option>
          <option value="sampler">Quick Sampler</option>
        </select>

        {clip && <TransformMenu clipId={clip.id} selectedNoteIds={selectedNoteIds} />}

        {clip && (
          <button
            className="px-2 py-1 rounded text-[10px] bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors"
            onClick={() => {
              const noteIds = selectedNoteIds.size > 0
                ? Array.from(selectedNoteIds)
                : (clip.midiData?.notes.map((n) => n.id) ?? []);
              if (noteIds.length > 0) openQuantizeDialog(clip.id, noteIds);
            }}
            title="Quantize notes with options (Ctrl+Q)"
          >
            Quantize
          </button>
        )}

        {clip && (
          <button
            className="px-2 py-1 rounded text-[10px] bg-violet-600/30 text-violet-200 hover:bg-violet-600/50 transition-colors"
            onClick={() => openGeneratePatternDialog(clip.id)}
            title="Generate MIDI pattern from genre/scale constraints"
          >
            Generate Pattern
          </button>
        )}

        <button
          className={`px-2 py-1 rounded text-[10px] transition-colors ${
            groovePanelOpen
              ? 'bg-emerald-600/40 text-emerald-200'
              : 'bg-emerald-600/15 text-emerald-100 hover:bg-emerald-600/30'
          }`}
          onClick={() => setGroovePanelOpen((v) => !v)}
          title="Toggle groove templates panel"
        >
          Groove
        </button>

        <button
          className={`px-2 py-1 rounded text-[10px] transition-colors ${
            chordPanelOpen
              ? 'bg-cyan-600/40 text-cyan-200'
              : 'bg-cyan-600/15 text-cyan-100 hover:bg-cyan-600/30'
          }`}
          onClick={toggleChordPanel}
          title="Toggle AI chord suggestion panel"
        >
          AI Chords
        </button>

        {clip && (
          <button
            className={`px-2 py-1 rounded text-[10px] transition-colors ${
              midiAiPanelOpen
                ? 'bg-violet-600/40 text-violet-200'
                : 'bg-violet-600/15 text-violet-100 hover:bg-violet-600/30'
            }`}
            onClick={() => {
              if (midiAiPanelOpen) {
                closeMidiAiPanel();
              } else {
                openMidiAiPanel(track.id, clip.id);
              }
            }}
            title="Toggle AI MIDI generation panel (infill, continue, variation)"
          >
            AI Generate
          </button>
        )}

        {clip && (
          <button
            className="px-2 py-1 rounded text-[10px] bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 transition-colors"
            onClick={() => {
              void (async () => {
                const result = await convertMidiClipToStrudel(clip.id);
                if (!result) return;
                await applyStrudelCodeToTrack(result.code, null, { label: 'Convert MIDI Clip' });
              })();
            }}
            title="Convert the current MIDI clip into Strudel code"
          >
            To Strudel
          </button>
        )}

        {!clip && (
          <button
            className="px-2 py-1 rounded text-[10px] bg-amber-500/15 text-amber-100 hover:bg-amber-500/25 transition-colors"
            onClick={() => {
              void (async () => {
                const result = await convertMidiTrackToStrudel(track.id);
                if (!result) return;
                await applyStrudelCodeToTrack(result.code, null, { label: 'Convert MIDI Track' });
              })();
            }}
            title="Convert this track's MIDI clips into Strudel code"
          >
            Track to Strudel
          </button>
        )}

        {clip && <span className="text-[10px] text-zinc-400 ml-1 truncate max-w-[200px]">{clip.prompt}</span>}

        <div className="ml-auto flex items-center gap-2">
          <button
            aria-label="Zoom out piano roll horizontally"
            className="text-[10px] text-zinc-400 hover:text-zinc-200 px-1"
            onClick={() => setPrZoomX((zoom) => Math.max(0.25, zoom - 0.25))}
          >
            -H
          </button>
          <button
            aria-label="Zoom in piano roll horizontally"
            className="text-[10px] text-zinc-400 hover:text-zinc-200 px-1"
            onClick={() => setPrZoomX((zoom) => Math.min(8, zoom + 0.25))}
          >
            +H
          </button>
          <button
            aria-label="Close piano roll"
            className="text-xs text-zinc-400 hover:text-zinc-200"
            onClick={() => setOpenPianoRoll(null)}
          >
            Close
          </button>
        </div>
      </div>

      {groovePanelOpen && (
        <div className="border-b border-zinc-700/50 max-h-48 overflow-y-auto">
          <GrooveTemplatesPanel />
        </div>
      )}
      {chordPanelOpen && <ChordSuggestionPanel />}
      {midiAiPanelOpen && <MidiAiPanel />}

      {track.synthPreset === 'sampler' && (
        <div
          aria-label="Quick Sampler target"
          className={samplerDropActive ? 'ring-1 ring-cyan-400/70 shrink-0' : 'shrink-0'}
          onDragOver={handleSamplerDragOver}
          onDragLeave={() => setSamplerDropActive(false)}
          onDrop={handleSamplerDrop}
        >
          <QuickSamplerEditor
            track={track}
            onSamplerConfigChange={applySamplerConfig}
            onSamplerSettingsChange={(updates) => setTrackSampler(track.id, updates)}
            onClear={() => clearTrackSampler(track.id)}
            onLoadSample={() => openSamplerFilePicker(track.id)}
          />
          <ZoneMapEditor
            track={track}
            onLoadSampleForZone={() => openSamplerFilePicker(track.id)}
          />
        </div>
      )}

      {track.instrument?.kind === 'granular' && (
        <GranularPanel
          track={track}
          onConfigChange={(updates: Partial<GranularSettings>) =>
            updateGranularConfig(track.id, updates)
          }
          onClear={() => clearGranularConfig(track.id)}
          onLoadSample={() => openGranularFilePicker(track.id)}
        />
      )}

      {showSynthParams && track.instrument?.kind === 'physical' && (
        <PhysicalModelingEditor trackId={track.id} />
      )}

      {showSynthParams && track.synthPreset !== 'sampler' && track.instrument?.kind !== 'granular' && track.instrument?.kind !== 'physical' && (
        <SynthParameterEditor trackId={track.id} />
      )}

      {clip ? (
        <PianoRollCanvas
          clip={clip}
          track={track}
          activeTool={activeTool}
          activeChordShapeAbbr={activeChordShapeAbbr}
          gridSize={gridSize}
          prZoomX={prZoomX}
          onZoomXChange={setPrZoomX}
          ghostNotes={ghostNotes}
          selectedNoteIds={selectedNoteIds}
          onSelectedNoteIdsChange={handleSelectedNoteIdsChange}
        />
      ) : (
        <PianoRollEmptyState />
      )}
      <QuantizeDialog />
      <GeneratePatternDialog />
    </div>
  );
}
