import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { type TrackHeightPreset, getTrackHeightForPreset } from '../constants/trackHeight';
import type {
  Project,
  Track,
  Clip,
  ClipVersion,
  TrackName,
  TrackType,
  InputMonitoringMode,
  ClipGenerationStatus,
  AssetClip,
  SequencerPattern,
  SequencerRow,
  SequencerStep,
  MidiNote,
  PianoRollGrid,
  TrackEffect,
  TrackEffectType,
  CompressorParams,
  MidiEffect,
  MidiEffectType,
  AutomationParameter,
  AutomationPoint,
  AutomationLane,
  ReturnTrack,
  TrackPreset,
  TrackPresetSettings,
  Take,
  Marker,
  TempoEvent,
  TimeSignatureEvent,
  AudioWarpMarker,
  StretchMode,
  GainEnvelopePoint,
  LoudnessTarget,
  MasteringPreset,
  MasteringState,
  DrumMachineConfig,
  DrumKitName,
} from '../types/project';
import { automationParamEquals } from '../types/project';
import { quantizeNotes as applyQuantize, type QuantizeOptions } from '../utils/midiQuantize';
import {
  analyzeProjectForMastering,
  buildMasteringChain,
  createDefaultMasteringState,
  ensureMasteringState,
  estimateMasteredLufs,
} from '../utils/mastering';
import { TRACK_CATALOG, DEFAULT_DRUM_KIT } from '../constants/tracks';
import {
  DEFAULT_BPM,
  DEFAULT_KEY_SCALE,
  DEFAULT_TIME_SIGNATURE,
  DEFAULT_MEASURES,
  DEFAULT_PROJECT_NAME,
  DEFAULT_GENERATION,
} from '../constants/defaults';
import { saveProject as saveProjectToIDB } from '../services/projectStorage';
import { exportStemToWav, type ExportClip } from '../engine/exportMix';
import { applyTransform, type TransformOptions } from '../utils/midiTransforms';
import { loadAudioBlobByKey, saveAudioBlob } from '../services/audioFileManager';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { renderMidiTrackOffline, renderSequencerTrackOffline } from '../engine/offlineRender';
import { convertClipAudioToMidi } from '../services/audioToMidi';
import { createDefaultParametricEqBands } from '../utils/parametricEq';
import type { StemCount } from '../types/api';
import { separateClipAudioToStems } from '../services/stemSeparation';
import { beatToTime, getBeatAtBar } from '../utils/tempoMap';

function getBarDurationSec(bpm: number, timeSig: number): number {
  return (60 / bpm) * timeSig;
}
const MIN_TIMELINE_DURATION = DEFAULT_MEASURES * getBarDurationSec(DEFAULT_BPM, DEFAULT_TIME_SIGNATURE); // 64 bars @ 120 BPM 4/4 = 128s
const TIMELINE_PADDING = 10; // seconds beyond last clip

// ── Undo/Redo history ───────────────────────────────────────────────────────
// Module-level, not persisted, not reactive (no point in re-rendering for history changes)
const _history: Project[] = [];
const _future: Project[] = [];
const MAX_HISTORY = 50;
let _isDragging = false;

function _pushHistory(project: Project | null) {
  if (!project) return;
  // During drag operations, history is already captured by beginDrag — skip intermediate states
  if (_isDragging) return;
  _history.push(structuredClone(project));
  if (_history.length > MAX_HISTORY) _history.shift();
  _future.length = 0;
}

/** Call before starting a drag/continuous operation. Captures undo snapshot once. */
function _beginDrag(project: Project | null) {
  if (!project || _isDragging) return;
  _isDragging = true;
  _history.push(structuredClone(project));
  if (_history.length > MAX_HISTORY) _history.shift();
  _future.length = 0;
}

/** Call when drag/continuous operation ends. Re-enables normal history tracking. */
function _endDrag() {
  _isDragging = false;
}

interface ProjectState {
  project: Project | null;

  setProject: (project: Project) => void;
  createProject: (params?: {
    name?: string;
    bpm?: number;
    keyScale?: string;
    timeSignature?: number;
  }) => void;
  undo: () => void;
  redo: () => void;
  /** Call before starting a drag/continuous operation to capture a single undo snapshot. */
  beginDrag: () => void;
  /** Call when a drag/continuous operation ends to re-enable normal history. */
  endDrag: () => void;

  updateProject: (updates: Partial<Pick<Project, 'globalCaption' | 'bpm' | 'keyScale' | 'timeSignature' | 'name' | 'masterVolume' | 'measures'>>) => void;
  analyzeMastering: () => Promise<void>;
  setMasteringPreset: (preset: MasteringPreset) => void;
  setMasteringLoudnessTarget: (target: LoudnessTarget) => void;
  toggleMasteringPreview: () => void;
  setMasteringEnabled: (enabled: boolean) => void;
  removeMastering: () => void;
  updateTrackMixer: (trackId: string, updates: Partial<Pick<Track, 'pan' | 'eqLowGain' | 'eqMidGain' | 'eqHighGain' | 'compressorEnabled' | 'compressorThreshold' | 'compressorRatio'>>) => void;
  setPanMode: (trackId: string, mode: 'stereo' | 'dual-mono') => void;
  setDualMonoPan: (trackId: string, left: number, right: number) => void;
  setTrackLocalCaption: (trackId: string, caption: string) => void;
  setTrackReverb: (trackId: string, mix: number, roomSize: number) => void;
  freezeTrack: (trackId: string, frozenAudioKey?: string) => void;
  unfreezeTrack: (trackId: string) => void;
  flattenTrack: (trackId: string, audioKey: string, waveformPeaks?: number[], duration?: number) => void;

  addTrack: (trackName: TrackName, trackType?: TrackType) => Track;
  removeTrack: (trackId: string) => void;
  duplicateTrack: (trackId: string) => Track | undefined;
  updateTrack: (trackId: string, updates: Partial<Pick<Track, 'displayName' | 'volume' | 'muted' | 'soloed' | 'armed' | 'laneHeight' | 'trackType' | 'synthPreset' | 'drumKit' | 'color'>>) => void;
  saveTrackPreset: (trackId: string, presetName: string) => TrackPreset;
  applyTrackPreset: (presetId: string) => Track | undefined;
  deleteTrackPreset: (presetId: string) => void;
  renameTrack: (trackId: string, newName: string) => void;
  setInputMonitoring: (trackId: string, mode: InputMonitoringMode) => void;
  setTrackHeightPreset: (trackId: string, preset: TrackHeightPreset) => void;
  setAllTracksHeightPreset: (preset: TrackHeightPreset) => void;
  reorderTrack: (draggedId: string, targetId: string, position: 'before' | 'after') => void;

  addClip: (trackId: string, clip: Omit<Clip, 'id' | 'trackId' | 'generationStatus' | 'generationJobId' | 'cumulativeMixKey' | 'isolatedAudioKey' | 'waveformPeaks'>) => Clip;
  ensureMidiClip: (trackId: string, startTime?: number, duration?: number) => Clip;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  removeClip: (clipId: string) => void;
  duplicateClip: (clipId: string) => Clip | undefined;
  updateClipStatus: (clipId: string, status: ClipGenerationStatus, extra?: Partial<Clip>) => void;
  /** Snapshot current audio state of a clip as a new version entry. */
  saveClipVersion: (clipId: string) => void;
  /** Restore clip audio fields from a version by index. */
  setActiveVersion: (clipId: string, idx: number) => void;
  setClipFade: (clipId: string, fade: Partial<Pick<Clip, 'fadeInDuration' | 'fadeOutDuration' | 'fadeInCurve' | 'fadeOutCurve'>>) => void;
  setClipTimeStretch: (clipId: string, rate: number) => void;
  setClipPitchShift: (clipId: string, semitones: number) => void;
  setClipStretchMode: (clipId: string, mode: StretchMode) => void;
  tempoMatchClip: (clipId: string, sourceBpm: number) => void;
  quantizeAudioClip: (clipId: string, warpMarkers: AudioWarpMarker[]) => void;
  clearAudioQuantize: (clipId: string) => void;
  setClipGainEnvelope: (clipId: string, points: GainEnvelopePoint[]) => void;
  addClipGainPoint: (clipId: string, point: GainEnvelopePoint) => void;
  removeClipGainPoint: (clipId: string, pointIndex: number) => void;
  updateClipGainPoint: (clipId: string, pointIndex: number, updates: Partial<GainEnvelopePoint>) => void;

  /** Slip-edit: shift audioOffset by deltaSeconds without changing startTime/duration. */
  slipClip: (clipId: string, deltaSeconds: number) => void;
  splitClip: (clipId: string, splitTime: number) => void;
  toggleClipStar: (clipId: string) => void;
  moveClipToTrack: (clipId: string, targetTrackId: string, startTime?: number) => void;
  duplicateClipToTrack: (clipId: string, targetTrackId: string, startTime?: number) => Clip | undefined;
  batchDuplicateClips: (clipIds: string[], timeOffset: number) => void;
  batchMoveClips: (clipIds: string[], timeOffset: number) => void;

  removeAsset: (assetId: string) => void;
  toggleAssetStar: (assetId: string) => void;

  // Sequencer actions
  initSequencerPattern: (trackId: string) => void;
  toggleSequencerStep: (trackId: string, rowId: string, stepIndex: number) => void;
  setSequencerStepVelocity: (trackId: string, rowId: string, stepIndex: number, velocity: number) => void;
  addSequencerRow: (trackId: string, sampleId: string, name: string, color: string) => void;
  removeSequencerRow: (trackId: string, rowId: string) => void;
  updateSequencerSwing: (trackId: string, swing: number) => void;
  setSequencerStepsPerBar: (trackId: string, stepsPerBar: number) => void;
  setSequencerBars: (trackId: string, bars: number) => void;
  setSequencerRowVolume: (trackId: string, rowId: string, volume: number) => void;
  setSequencerRowPan: (trackId: string, rowId: string, pan: number) => void;
  toggleSequencerRowMute: (trackId: string, rowId: string) => void;
  setSequencerRowSample: (trackId: string, rowId: string, sampleKey: string) => void;
  clearSequencerRow: (trackId: string, rowId: string) => void;
  reorderSequencerRows: (trackId: string, fromIndex: number, toIndex: number) => void;
  cloneSequencerRow: (trackId: string, rowId: string) => void;
  renameSequencerRow: (trackId: string, rowId: string, name: string) => void;
  setSequencerRowColor: (trackId: string, rowId: string, color: string) => void;
  fillSequencerRow: (trackId: string, rowId: string, every: number) => void;
  batchSetSequencerSteps: (trackId: string, ops: { rowId: string; stepIndex: number; active: boolean; velocity: number }[]) => void;

  // Drum machine actions
  initDrumMachine: (trackId: string, kit?: DrumKitName) => void;
  setDrumPadSample: (trackId: string, padIndex: number, sampleKey: string) => void;
  setDrumPadVolume: (trackId: string, padIndex: number, volume: number) => void;
  setDrumPadPan: (trackId: string, padIndex: number, pan: number) => void;
  renameDrumPad: (trackId: string, padIndex: number, name: string) => void;
  setDrumMachineKit: (trackId: string, kit: DrumKitName) => void;
  addMidiNote: (clipId: string, note: Omit<MidiNote, 'id'> & { id?: string }) => string | undefined;
  updateMidiNote: (clipId: string, noteId: string, updates: Partial<MidiNote>) => void;
  removeMidiNote: (clipId: string, noteId: string) => void;
  quantizeMidiNotes: (clipId: string, noteIds: string[], gridBeatsOrOptions: number | QuantizeOptions) => void;
  stampChord: (clipId: string, rootPitch: number, intervals: number[], startBeat: number, durationBeats: number, velocity?: number) => string[];
  setMidiGrid: (clipId: string, grid: PianoRollGrid) => void;
  transformMidiNotes: (clipId: string, noteIds: string[], transform: TransformOptions) => void;
  addTrackEffect: (trackId: string, type: TrackEffectType) => string | undefined;
  updateTrackEffect: (trackId: string, effectId: string, updates: Partial<TrackEffect>) => void;
  removeTrackEffect: (trackId: string, effectId: string) => void;
  reorderTrackEffect: (trackId: string, fromIndex: number, toIndex: number) => void;
  setSidechainSource: (trackId: string, effectId: string, sourceTrackId: string | undefined) => void;

  // MIDI effects
  addMidiEffect: (trackId: string, type: MidiEffectType) => string | undefined;
  removeMidiEffect: (trackId: string, effectId: string) => void;
  updateMidiEffect: (trackId: string, effectId: string, updates: Partial<MidiEffect>) => void;
  toggleMidiEffect: (trackId: string, effectId: string) => void;
  reorderMidiEffect: (trackId: string, fromIndex: number, toIndex: number) => void;

  // Automation
  ensureAutomationLane: (trackId: string, parameter: AutomationParameter, initialValue?: number) => void;
  addAutomationPoint: (trackId: string, parameter: AutomationParameter, point: AutomationPoint) => void;
  removeAutomationPoint: (trackId: string, parameter: AutomationParameter, pointIndex: number) => void;
  updateAutomationPoint: (trackId: string, parameter: AutomationParameter, pointIndex: number, updates: Partial<AutomationPoint>) => void;
  clearAutomationLane: (trackId: string, parameter: AutomationParameter) => void;

  // Return tracks (sends/returns mixer buses)
  addReturnTrack: (name?: string) => ReturnTrack;
  removeReturnTrack: (returnTrackId: string) => void;
  updateReturnTrack: (returnTrackId: string, updates: Partial<Pick<ReturnTrack, 'name' | 'volume' | 'pan' | 'effects'>>) => void;
  updateTrackSend: (trackId: string, returnTrackId: string, amount: number) => void;

  // Track grouping / folder tracks
  createGroupTrack: (name: string) => Track;
  moveTrackToGroup: (trackId: string, groupId: string | null) => void;
  toggleGroupCollapse: (groupId: string) => void;
  getGroupVolume: (groupId: string) => number;

  // Tempo map
  addTempoEvent: (event: TempoEvent) => void;
  removeTempoEvent: (beat: number) => void;
  updateTempoEvent: (beat: number, updates: Partial<TempoEvent>) => void;
  clearTempoMap: () => void;

  // Time signature map
  addTimeSignatureEvent: (event: TimeSignatureEvent) => void;
  removeTimeSignatureEvent: (bar: number) => void;
  updateTimeSignatureEvent: (bar: number, updates: Partial<TimeSignatureEvent>) => void;
  clearTimeSignatureMap: () => void;

  // Markers
  addMarker: (time: number, name: string) => void;
  removeMarker: (id: string) => void;
  updateMarker: (id: string, updates: Partial<Pick<Marker, 'time' | 'name' | 'color'>>) => void;

  // Comping / takes
  addTake: (clipId: string, audioKey: string) => void;
  selectTake: (clipId: string, takeId: string) => void;
  toggleTakeLanes: (trackId: string) => void;

  getTrackById: (trackId: string) => Track | undefined;
  getClipById: (clipId: string) => Clip | undefined;
  getTrackForClip: (clipId: string) => Track | undefined;
  getTracksInGenerationOrder: () => Track[];
  /** Computed total duration: max(clip ends) + padding, minimum MIN_TIMELINE_DURATION */
  getTotalDuration: () => number;
  /** Actual audio duration without timeline padding: max(clip ends) */
  getAudioDuration: () => number;

  /** Convert an audio clip to MIDI, creating a new piano roll track with detected notes. */
  convertAudioToMidi: (clipId: string, options?: { threshold?: number; minConfidence?: number; minNoteDuration?: number }) => Promise<{ trackId: string; clipId: string } | undefined>;
  separateStems: (clipId: string, stemCount: StemCount) => Promise<Track[] | undefined>;

  /** Export each track as a separate WAV file (stem export). */
  exportStems: () => Promise<void>;
}

function computeTotalDuration(
  tracks: Track[],
  measures?: number,
  bpm?: number,
  timeSig?: number,
  tempoMap?: TempoEvent[],
  timeSignatureMap?: TimeSignatureEvent[],
): number {
  let maxEnd = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > maxEnd) maxEnd = end;
    }
  }
  const effectiveBpm = bpm ?? DEFAULT_BPM;
  const effectiveTimeSig = timeSig ?? DEFAULT_TIME_SIGNATURE;
  const effectiveMeasures = measures ?? DEFAULT_MEASURES;
  let measuredDuration: number;
  if ((tempoMap && tempoMap.length > 0) || (timeSignatureMap && timeSignatureMap.length > 0)) {
    const totalBeats = getBeatAtBar(effectiveMeasures + 1, timeSignatureMap, effectiveTimeSig);
    measuredDuration = beatToTime(totalBeats, tempoMap, effectiveBpm);
  } else {
    const barDur = getBarDurationSec(effectiveBpm, effectiveTimeSig);
    measuredDuration = effectiveMeasures * barDur;
  }
  return Math.max(measuredDuration, maxEnd + TIMELINE_PADDING);
}

function createDefaultTrackEffect(type: TrackEffectType): TrackEffect {
  const id = uuidv4();
  switch (type) {
    case 'eq3':
      return {
        id,
        type,
        enabled: true,
        params: { low: 0, mid: 0, high: 0, lowFrequency: 250, highFrequency: 4000 },
      };
    case 'parametricEq':
      return {
        id,
        type,
        enabled: true,
        params: {
          mode: 'parametric',
          bands: createDefaultParametricEqBands(),
        },
      };
    case 'compressor':
      return {
        id,
        type,
        enabled: true,
        params: { threshold: -24, ratio: 4, attack: 0.01, release: 0.2, knee: 12 },
      };
    case 'reverb':
      return {
        id,
        type,
        enabled: true,
        params: { decay: 2.4, preDelay: 0.02, wet: 0.25 },
      };
    case 'delay':
      return {
        id,
        type,
        enabled: true,
        params: { time: 0.25, feedback: 0.3, wet: 0.2 },
      };
    case 'distortion':
      return {
        id,
        type,
        enabled: true,
        params: { amount: 0.2, wet: 0.35, distortionType: 'soft' },
      };
    case 'filter':
      return {
        id,
        type,
        enabled: true,
        params: {
          frequency: 1800,
          resonance: 1,
          filterType: 'lowpass',
          lfoEnabled: false,
          lfoRate: 0.5,
          lfoDepth: 0.25,
        },
      };
  }
}

function createDefaultMidiEffect(type: MidiEffectType): MidiEffect {
  const id = uuidv4();
  switch (type) {
    case 'arpeggiator':
      return { id, type, enabled: true, params: { rate: '1/8', pattern: 'up', octaves: 1 } };
    case 'chord-gen':
      return { id, type, enabled: true, params: { chordType: 'major', inversion: 0 } };
    case 'scale-lock':
      return { id, type, enabled: true, params: { root: 0, scale: 'major' } };
  }
}

function cloneTrackEffectsForPreset(effects: TrackEffect[] | undefined): TrackEffect[] {
  return (effects ?? []).map((effect) => {
    if (effect.type !== 'compressor') {
      return structuredClone(effect);
    }

    const params = { ...effect.params };
    delete params.sidechainSourceTrackId;
    return { ...effect, params };
  });
}

function cloneTrackEffectsWithNewIds(effects: TrackEffect[] | undefined): TrackEffect[] {
  return cloneTrackEffectsForPreset(effects).map((effect) => ({
    ...effect,
    id: uuidv4(),
  }));
}

function cloneMidiEffectsWithNewIds(effects: MidiEffect[] | undefined): MidiEffect[] {
  return (effects ?? []).map((effect) => ({
    ...structuredClone(effect),
    id: uuidv4(),
  }));
}

function createDefaultSequencerPattern(): SequencerPattern {
  const stepsPerBar = 16;
  const bars = 1;
  const totalSteps = stepsPerBar * bars;

  return {
    id: uuidv4(),
    name: 'Pattern 1',
    rows: DEFAULT_DRUM_KIT.map((kit) => ({
      id: uuidv4(),
      name: kit.name,
      sampleKey: kit.id,
      steps: Array.from({ length: totalSteps }, () => ({ active: false, velocity: 0.8 })),
      volume: 0.8,
      pan: 0,
      muted: false,
      color: kit.color,
    })),
    stepsPerBar,
    bars,
    swing: 0,
  };
}

const DRUM_PAD_DEFAULTS: { name: string; sampleKey: string; color: string }[] = [
  { name: 'Kick',       sampleKey: 'kick',       color: '#ef4444' },
  { name: 'Snare',      sampleKey: 'snare',      color: '#f97316' },
  { name: 'Closed HH',  sampleKey: 'closed_hh',  color: '#eab308' },
  { name: 'Open HH',    sampleKey: 'open_hh',    color: '#84cc16' },
  { name: 'Clap',       sampleKey: 'clap',       color: '#22c55e' },
  { name: 'Rim',        sampleKey: 'rim',        color: '#06b6d4' },
  { name: 'Tom High',   sampleKey: 'high_tom',   color: '#3b82f6' },
  { name: 'Tom Low',    sampleKey: 'low_tom',    color: '#8b5cf6' },
  { name: 'Crash',      sampleKey: 'crash',      color: '#ec4899' },
  { name: 'Ride',       sampleKey: 'ride',       color: '#f59e0b' },
  { name: 'Shaker',     sampleKey: 'shaker',     color: '#10b981' },
  { name: 'Cowbell',    sampleKey: 'cowbell',     color: '#14b8a6' },
  { name: 'Conga',      sampleKey: 'conga',      color: '#0ea5e9' },
  { name: 'Bongo',      sampleKey: 'bongo',      color: '#6366f1' },
  { name: 'Tambourine', sampleKey: 'tambourine', color: '#d946ef' },
  { name: 'Perc',       sampleKey: 'perc',       color: '#a855f7' },
];

function createDefaultDrumMachineConfig(kit: DrumKitName = '808'): DrumMachineConfig {
  return {
    kitName: kit,
    pads: DRUM_PAD_DEFAULTS.map((d) => ({
      id: uuidv4(),
      name: d.name,
      sampleKey: d.sampleKey,
      color: d.color,
      volume: 0.8,
      pan: 0,
    })),
  };
}

function getDefaultTrackSynthPreset(trackName: TrackName): Track['synthPreset'] {
  return trackName === 'bass' ? 'bass'
    : trackName === 'strings' ? 'strings'
      : trackName === 'synth' ? 'lead'
        : trackName === 'keyboard' ? 'organ'
          : 'piano';
}

function buildTrackDisplayName(existingTracks: Track[], trackName: TrackName): string {
  const info = TRACK_CATALOG[trackName] ?? TRACK_CATALOG.custom;
  const sameNameCount = existingTracks.filter((track) => track.trackName === trackName).length;
  return sameNameCount === 0 ? info.displayName : `${info.displayName} ${sameNameCount + 1}`;
}

function createTrackFromTemplate(
  existingTracks: Track[],
  trackName: TrackName,
  trackType: TrackType,
  overrides?: Partial<Track>,
): Track {
  const info = TRACK_CATALOG[trackName] ?? TRACK_CATALOG.custom;
  const existingOrders = existingTracks.map((track) => track.order);
  const maxOrder = existingOrders.length > 0 ? Math.max(...existingOrders) : 0;
  const displayName = buildTrackDisplayName(existingTracks, trackName);
  const {
    id: _ignoredId,
    trackType: _ignoredTrackType,
    trackName: _ignoredTrackName,
    displayName: _ignoredDisplayName,
    order: _ignoredOrder,
    muted: _ignoredMuted,
    soloed: _ignoredSoloed,
    clips: _ignoredClips,
    effects: presetEffects,
    midiEffects: presetMidiEffects,
    sequencerPattern: presetSequencerPattern,
    ...trackOverrides
  } = overrides ?? {};

  const track: Track = {
    color: info.color,
    volume: 0.8,
    laneHeight: trackType === 'sequencer' ? 80 : trackType === 'drumMachine' ? 80 : trackType === 'pianoRoll' ? 88 : undefined,
    synthPreset: getDefaultTrackSynthPreset(trackName),
    drumKit: trackName === 'drums' || trackType === 'sequencer' || trackType === 'drumMachine' ? '808' : undefined,
    ...trackOverrides,
    id: uuidv4(),
    trackType,
    trackName,
    displayName,
    order: maxOrder + 1,
    muted: false,
    soloed: false,
    clips: [],
    effects: cloneTrackEffectsWithNewIds(presetEffects),
    midiEffects: cloneMidiEffectsWithNewIds(presetMidiEffects),
  };

  if (track.trackType === 'sequencer') {
    track.sequencerPattern = presetSequencerPattern
      ? {
          ...structuredClone(presetSequencerPattern),
          id: uuidv4(),
          rows: presetSequencerPattern.rows.map((row) => ({
            ...structuredClone(row),
            id: uuidv4(),
          })),
        }
      : createDefaultSequencerPattern();
  } else {
    delete track.sequencerPattern;
  }

  if (track.trackType === 'drumMachine') {
    track.drumMachine = createDefaultDrumMachineConfig(track.drumKit ?? '808');
  }

  return track;
}

function createTrackPresetSnapshot(track: Track, name: string): TrackPreset {
  const settings: TrackPresetSettings = {
    color: track.color,
    volume: track.volume,
    laneHeight: track.laneHeight,
    synthPreset: track.synthPreset,
    drumKit: track.drumKit,
    pan: track.pan,
    panMode: track.panMode,
    panLeft: track.panLeft,
    panRight: track.panRight,
    eqLowGain: track.eqLowGain,
    eqMidGain: track.eqMidGain,
    eqHighGain: track.eqHighGain,
    compressorEnabled: track.compressorEnabled,
    compressorThreshold: track.compressorThreshold,
    compressorRatio: track.compressorRatio,
    reverbMix: track.reverbMix,
    reverbRoomSize: track.reverbRoomSize,
    localCaption: track.localCaption,
  };

  return {
    id: uuidv4(),
    name,
    trackName: track.trackName,
    trackType: track.trackType ?? (track.trackName === 'custom' ? 'sample' : 'stems'),
    settings,
    effects: cloneTrackEffectsForPreset(track.effects),
    midiEffects: structuredClone(track.midiEffects ?? []),
    createdAt: Date.now(),
  };
}

function ensureTrackDefaults(track: Track): Track {
  return {
    ...track,
    synthPreset: track.synthPreset ?? getDefaultTrackSynthPreset(track.trackName),
    effects: track.effects ?? [],
    midiEffects: track.midiEffects ?? [],
    drumKit: track.drumKit ?? '808',
    clips: track.clips.map((clip) => ({
      ...clip,
      midiData: clip.midiData
        ? {
            notes: clip.midiData.notes ?? [],
            grid: clip.midiData.grid ?? '1/16',
          }
        : undefined,
    })),
  };
}

function applyMasteringPreferences(mastering: MasteringState): MasteringState {
  const next = ensureMasteringState(mastering);
  if (!next.analysis) return next;
  const chain = buildMasteringChain(next.analysis, next.preset, next.loudnessTarget);
  return {
    ...next,
    chain,
    outputLufs: estimateMasteredLufs(next.analysis, chain),
  };
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
  project: null,

  setProject: (project) => {
    _history.length = 0;
    _future.length = 0;
    // Migration: backfill trackType for projects created before the field existed
    const migrated: Project = {
      ...project,
      trackPresets: project.trackPresets ?? [],
      tracks: project.tracks.map((t) => {
        if (t.trackType) return t;
        const inferred: TrackType =
          t.trackName === 'custom' && t.clips.some((c) => c.source === 'uploaded')
            ? 'sample'
            : t.trackName === 'custom'
              ? 'sample'
              : 'stems';
        return { ...t, trackType: inferred };
      }).map(ensureTrackDefaults),
      mastering: ensureMasteringState(project.mastering),
    };
    set({ project: migrated });
  },

  undo: () => {
    const state = get();
    if (_history.length === 0) return;
    if (state.project) _future.push(structuredClone(state.project));
    const prev = _history.pop()!;
    set({ project: prev });
  },

  redo: () => {
    const state = get();
    if (_future.length === 0) return;
    if (state.project) _history.push(structuredClone(state.project));
    const next = _future.pop()!;
    set({ project: next });
  },

  beginDrag: () => {
    const state = get();
    _beginDrag(state.project);
  },

  endDrag: () => {
    _endDrag();
  },

  createProject: (params) => {
    const bpm = params?.bpm ?? DEFAULT_BPM;
    const timeSig = params?.timeSignature ?? DEFAULT_TIME_SIGNATURE;
    const measures = DEFAULT_MEASURES;
    const project: Project = {
      id: uuidv4(),
      name: params?.name ?? DEFAULT_PROJECT_NAME,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      bpm,
      keyScale: params?.keyScale ?? DEFAULT_KEY_SCALE,
      timeSignature: timeSig,
      totalDuration: measures * getBarDurationSec(bpm, timeSig),
      measures,
      tracks: [],
      trackPresets: [],
      generationDefaults: { ...DEFAULT_GENERATION },
      globalCaption: '',
      mastering: createDefaultMasteringState(),
    };
    set({ project });
  },

  updateProject: (updates) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const merged = { ...state.project, ...updates, updatedAt: Date.now() };
    // Recompute totalDuration when measures/bpm/timeSignature change
    if ('measures' in updates || 'bpm' in updates || 'timeSignature' in updates) {
      merged.totalDuration = computeTotalDuration(
        merged.tracks,
        merged.measures,
        merged.bpm,
        merged.timeSignature,
      );
    }
    set({ project: merged });
  },

  analyzeMastering: async () => {
    const state = get();
    if (!state.project) return;
    const mastering = ensureMasteringState(state.project.mastering);

    set({
      project: {
        ...state.project,
        mastering: {
          ...mastering,
          status: 'analyzing',
          error: undefined,
        },
      },
    });

    await new Promise((resolve) => globalThis.setTimeout(resolve, 650));

    const latestState = get();
    if (!latestState.project) return;
    const latestMastering = ensureMasteringState(latestState.project.mastering);
    const analysis = analyzeProjectForMastering(latestState.project);
    const chain = buildMasteringChain(analysis, latestMastering.preset, latestMastering.loudnessTarget);
    const outputLufs = estimateMasteredLufs(analysis, chain);

    _pushHistory(latestState.project);
    set({
      project: {
        ...latestState.project,
        updatedAt: Date.now(),
        mastering: {
          ...latestMastering,
          enabled: true,
          status: 'ready',
          previewOriginal: false,
          analysis,
          chain,
          outputLufs,
          error: undefined,
        },
      },
    });
  },

  setMasteringPreset: (preset) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const current = ensureMasteringState(state.project.mastering);
    const mastering = applyMasteringPreferences({
      ...current,
      preset,
      enabled: true,
      status: current.analysis ? 'ready' : 'idle',
    });
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        mastering,
      },
    });
  },

  setMasteringLoudnessTarget: (target) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const current = ensureMasteringState(state.project.mastering);
    const mastering = applyMasteringPreferences({
      ...current,
      loudnessTarget: target,
      enabled: true,
      status: current.analysis ? 'ready' : 'idle',
    });
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        mastering,
      },
    });
  },

  toggleMasteringPreview: () => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const mastering = ensureMasteringState(state.project.mastering);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        mastering: {
          ...mastering,
          previewOriginal: !mastering.previewOriginal,
        },
      },
    });
  },

  setMasteringEnabled: (enabled) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const mastering = ensureMasteringState(state.project.mastering);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        mastering: {
          ...mastering,
          enabled,
          previewOriginal: enabled ? mastering.previewOriginal : false,
        },
      },
    });
  },

  removeMastering: () => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        mastering: createDefaultMasteringState(),
      },
    });
  },

  updateTrackMixer: (trackId, updates) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId ? { ...t, ...updates } : t,
        ),
      },
    });
  },

  setPanMode: (trackId, mode) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId ? { ...t, panMode: mode } : t,
        ),
      },
    });
  },

  setDualMonoPan: (trackId, left, right) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId ? { ...t, panLeft: clamp(left), panRight: clamp(right) } : t,
        ),
      },
    });
  },

  setTrackLocalCaption: (trackId, caption) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId ? { ...t, localCaption: caption } : t,
        ),
      },
    });
  },

  setTrackReverb: (trackId, mix, roomSize) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId ? { ...t, reverbMix: mix, reverbRoomSize: roomSize } : t,
        ),
      },
    });
  },

  freezeTrack: (trackId, frozenAudioKey?) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId ? { ...t, frozen: true, ...(frozenAudioKey ? { frozenAudioKey } : {}) } : t,
        ),
      },
    });
  },

  unfreezeTrack: (trackId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId ? { ...t, frozen: false, frozenAudioKey: undefined } : t,
        ),
      },
    });
  },

  flattenTrack: (trackId, audioKey, waveformPeaks?, duration?) => {
    const state = get();
    if (!state.project) return;
    const track = state.project.tracks.find((t) => t.id === trackId);
    if (!track) return;
    _pushHistory(state.project);

    const newClip: Clip = {
      id: uuidv4(),
      trackId,
      startTime: 0,
      duration: duration ?? state.project.totalDuration,
      prompt: '',
      lyrics: '',
      generationStatus: 'ready',
      generationJobId: null,
      cumulativeMixKey: null,
      isolatedAudioKey: audioKey,
      waveformPeaks: waveformPeaks ?? null,
    };

    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                trackType: 'sample' as TrackType,
                frozen: false,
                frozenAudioKey: undefined,
                sequencerPattern: undefined,
                synthPreset: undefined,
                clips: [newClip],
              }
            : t,
        ),
      },
    });
  },

  addTrack: (trackName, trackType) => {
    const state = get();
    if (!state.project) throw new Error('No project');
    _pushHistory(state.project);

    const resolvedType: TrackType = trackType ?? (trackName === 'custom' ? 'sample' : 'stems');
    const track = createTrackFromTemplate(state.project.tracks, trackName, resolvedType);

    const newTracks = [...state.project.tracks, track];
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
      },
    });

    return track;
  },

  saveTrackPreset: (trackId, presetName) => {
    const state = get();
    if (!state.project) throw new Error('No project');
    const track = state.project.tracks.find((candidate) => candidate.id === trackId);
    if (!track) throw new Error(`Track '${trackId}' not found`);

    const trimmedName = presetName.trim();
    if (!trimmedName) throw new Error('Preset name is required');

    const preset = createTrackPresetSnapshot(track, trimmedName);
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        trackPresets: [...(state.project.trackPresets ?? []), preset],
      },
    });
    return preset;
  },

  applyTrackPreset: (presetId) => {
    const state = get();
    if (!state.project) return undefined;
    const preset = (state.project.trackPresets ?? []).find((candidate) => candidate.id === presetId);
    if (!preset) return undefined;

    _pushHistory(state.project);
    const track = createTrackFromTemplate(
      state.project.tracks,
      preset.trackName,
      preset.trackType,
      {
        ...preset.settings,
        effects: preset.effects,
        midiEffects: preset.midiEffects,
      },
    );

    const newTracks = [...state.project.tracks, track];
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature),
        tracks: newTracks,
      },
    });
    return track;
  },

  deleteTrackPreset: (presetId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        trackPresets: (state.project.trackPresets ?? []).filter((preset) => preset.id !== presetId),
      },
    });
  },

  removeTrack: (trackId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const newTracks = state.project.tracks.filter((t) => t.id !== trackId);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
      },
    });
  },

  duplicateTrack: (trackId) => {
    const state = get();
    if (!state.project) return undefined;
    const source = state.project.tracks.find((t) => t.id === trackId);
    if (!source) return undefined;
    _pushHistory(state.project);
    const newId = crypto.randomUUID();
    const clonedTrack: Track = {
      ...JSON.parse(JSON.stringify(source)),
      id: newId,
      displayName: `${source.displayName} (copy)`,
      clips: source.clips.map((clip) => ({
        ...JSON.parse(JSON.stringify(clip)),
        id: crypto.randomUUID(),
      })),
    };
    const newTracks = [...state.project.tracks, clonedTrack];
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
      },
    });
    return clonedTrack;
  },

  updateTrack: (trackId, updates) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId ? { ...t, ...updates } : t,
        ),
      },
    });
  },


  setTrackHeightPreset: (trackId, preset) => {
    const state = get();
    if (!state.project) return;
    const track = state.project.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const trackType = track.trackType ?? 'stems';
    const laneHeight = getTrackHeightForPreset(preset, trackType);
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId ? { ...t, laneHeight } : t,
        ),
      },
    });
  },

  setAllTracksHeightPreset: (preset) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => ({
          ...t,
          laneHeight: getTrackHeightForPreset(preset, t.trackType ?? 'stems'),
        })),
      },
    });
  },
  renameTrack: (trackId, newName) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId ? { ...t, displayName: newName } : t,
        ),
      },
    });
  },

  setInputMonitoring: (trackId, mode) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId ? { ...t, inputMonitoring: mode } : t,
        ),
      },
    });
  },

  reorderTrack: (draggedId, targetId, position) => {
    const state = get();
    if (!state.project || draggedId === targetId) return;
    _pushHistory(state.project);
    const sorted = [...state.project.tracks].sort((a, b) => a.order - b.order);
    const fromIdx = sorted.findIndex((t) => t.id === draggedId);
    const toIdx = sorted.findIndex((t) => t.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const [dragged] = sorted.splice(fromIdx, 1);
    const insertAt = position === 'before'
      ? (fromIdx < toIdx ? toIdx - 1 : toIdx)
      : (fromIdx < toIdx ? toIdx : toIdx + 1);
    sorted.splice(insertAt, 0, dragged);

    const idToNewOrder = new Map(sorted.map((t, i) => [t.id, i + 1]));
    const updatedTracks = state.project.tracks.map((t) => ({
      ...t,
      order: idToNewOrder.get(t.id) ?? t.order,
    }));
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: updatedTracks,
      },
    });
  },

  addClip: (trackId, clipData) => {
    const state = get();
    if (!state.project) throw new Error('No project');
    _pushHistory(state.project);

    const clip: Clip = {
      id: uuidv4(),
      trackId,
      startTime: clipData.startTime,
      duration: clipData.duration,
      prompt: clipData.prompt,
      globalCaption: clipData.globalCaption || '',
      lyrics: clipData.lyrics,
      generationStatus: 'empty',
      generationJobId: null,
      cumulativeMixKey: null,
      isolatedAudioKey: null,
      waveformPeaks: null,
      bpm: null,
      keyScale: null,
      timeSignature: null,
      source: clipData.source,
      starred: clipData.starred,
      midiData: clipData.midiData,
    };

    const newTracks = state.project.tracks.map((t) =>
      t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t,
    );

    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
      },
    });

    return clip;
  },

  ensureMidiClip: (trackId, startTime = 0, duration = getBarDurationSec(get().project?.bpm ?? DEFAULT_BPM, get().project?.timeSignature ?? DEFAULT_TIME_SIGNATURE)) => {
    const state = get();
    if (!state.project) throw new Error('No project');

    const track = state.project.tracks.find((t) => t.id === trackId);
    if (!track) throw new Error('Track not found');

    const existing = track.clips.find((clip) => clip.midiData);
    if (existing) return existing;

    return get().addClip(trackId, {
      startTime,
      duration,
      prompt: 'MIDI Clip',
      globalCaption: '',
      lyrics: '',
      midiData: { notes: [], grid: '1/16' },
      source: 'uploaded',
    });
  },

  updateClip: (clipId, updates) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const newTracks = state.project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId ? { ...c, ...updates } : c,
      ),
    }));
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
      },
    });
  },

  removeClip: (clipId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const newTracks = state.project.tracks.map((t) => ({
      ...t,
      clips: t.clips.filter((c) => c.id !== clipId),
    }));
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
      },
    });
  },

  duplicateClip: (clipId) => {
    const state = get();
    if (!state.project) return undefined;
    _pushHistory(state.project);

    let sourceClip: Clip | undefined;
    let trackId: string | undefined;
    for (const t of state.project.tracks) {
      const c = t.clips.find((c) => c.id === clipId);
      if (c) { sourceClip = c; trackId = t.id; break; }
    }
    if (!sourceClip || !trackId) return undefined;

    const isReady = sourceClip.generationStatus === 'ready' && !!sourceClip.isolatedAudioKey;
    const newClip: Clip = {
      ...sourceClip,
      id: uuidv4(),
      startTime: sourceClip.startTime + sourceClip.duration,
      generationStatus: isReady ? 'ready' : 'empty',
      generationJobId: null,
      cumulativeMixKey: sourceClip.cumulativeMixKey,
      isolatedAudioKey: isReady ? sourceClip.isolatedAudioKey : null,
      waveformPeaks: isReady && sourceClip.waveformPeaks ? [...sourceClip.waveformPeaks] : null,
    };

    const newTracks = state.project.tracks.map((t) =>
      t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t,
    );

    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
      },
    });

    return newClip;
  },

  setClipFade: (clipId, fade) => {
    get().updateClip(clipId, fade);
  },

  setClipTimeStretch: (clipId, rate) => {
    get().updateClip(clipId, { timeStretchRate: rate });
  },

  setClipPitchShift: (clipId, semitones) => {
    get().updateClip(clipId, { pitchShift: semitones });
  },

  setClipStretchMode: (clipId, mode) => {
    get().updateClip(clipId, { stretchMode: mode });
  },

  tempoMatchClip: (clipId, sourceBpm) => {
    const state = get();
    if (!state.project || sourceBpm <= 0) return;
    const projectBpm = state.project.bpm;
    const rate = projectBpm / sourceBpm;
    get().updateClip(clipId, { timeStretchRate: rate });
  },

  quantizeAudioClip: (clipId, warpMarkers) => {
    get().updateClip(clipId, { warpMarkers });
  },

  clearAudioQuantize: (clipId) => {
    get().updateClip(clipId, { warpMarkers: undefined });
  },

  slipClip: (clipId, deltaSeconds) => {
    const state = get();
    if (!state.project) return;
    for (const track of state.project.tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (!clip) continue;
      const audioDuration = clip.audioDuration;
      if (audioDuration == null) return;
      const origOffset = clip.audioOffset ?? 0;
      const maxOffset = Math.max(0, audioDuration - clip.duration);
      const newOffset = Math.max(0, Math.min(origOffset + deltaSeconds, maxOffset));
      get().updateClip(clipId, { audioOffset: newOffset });
      return;
    }
  },

  setClipGainEnvelope: (clipId, points) => {
    get().updateClip(clipId, { gainEnvelope: [...points] });
  },

  addClipGainPoint: (clipId, point) => {
    const clip = get().getClipById(clipId);
    if (!clip) return;
    const envelope = [...(clip.gainEnvelope ?? []), point];
    envelope.sort((a, b) => a.time - b.time);
    get().updateClip(clipId, { gainEnvelope: envelope });
  },

  removeClipGainPoint: (clipId, pointIndex) => {
    const clip = get().getClipById(clipId);
    if (!clip || !clip.gainEnvelope) return;
    if (pointIndex < 0 || pointIndex >= clip.gainEnvelope.length) return;
    const envelope = clip.gainEnvelope.filter((_, i) => i !== pointIndex);
    get().updateClip(clipId, { gainEnvelope: envelope });
  },

  updateClipGainPoint: (clipId, pointIndex, updates) => {
    const clip = get().getClipById(clipId);
    if (!clip || !clip.gainEnvelope) return;
    if (pointIndex < 0 || pointIndex >= clip.gainEnvelope.length) return;
    const envelope = clip.gainEnvelope.map((p, i) =>
      i === pointIndex ? { ...p, ...updates } : p,
    );
    envelope.sort((a, b) => a.time - b.time);
    get().updateClip(clipId, { gainEnvelope: envelope });
  },

  splitClip: (clipId, splitTime) => {
    const state = get();
    if (!state.project) return;

    let sourceClip: Clip | undefined;
    let trackId: string | undefined;
    for (const t of state.project.tracks) {
      const c = t.clips.find((c) => c.id === clipId);
      if (c) { sourceClip = c; trackId = t.id; break; }
    }
    if (!sourceClip || !trackId) return;

    const origStart = sourceClip.startTime;
    const origEnd = origStart + sourceClip.duration;
    if (splitTime <= origStart || splitTime >= origEnd) return;

    _pushHistory(state.project);
    const origAudioOffset = sourceClip.audioOffset ?? 0;
    const isReady = sourceClip.generationStatus === 'ready' && !!sourceClip.isolatedAudioKey;

    const leftDuration = splitTime - origStart;
    const rightDuration = origEnd - splitTime;

    const leftClip: Clip = {
      ...sourceClip,
      duration: leftDuration,
    };

    const rightClip: Clip = {
      ...sourceClip,
      id: uuidv4(),
      startTime: splitTime,
      duration: rightDuration,
      audioOffset: origAudioOffset + leftDuration,
      generationStatus: isReady ? 'ready' : 'empty',
      generationJobId: null,
      cumulativeMixKey: sourceClip.cumulativeMixKey,
      isolatedAudioKey: isReady ? sourceClip.isolatedAudioKey : null,
      waveformPeaks: isReady && sourceClip.waveformPeaks ? [...sourceClip.waveformPeaks] : null,
      audioDuration: sourceClip.audioDuration,
    };

    const newTracks = state.project.tracks.map((t) => {
      if (t.id !== trackId) return t;
      return {
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? leftClip : c)).concat(rightClip),
      };
    });

    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
      },
    });
  },

  updateClipStatus: (clipId, status, extra) => {
    const state = get();
    if (!state.project) return;

    const updatedTracks = state.project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        c.id === clipId ? { ...c, generationStatus: status, ...extra } : c,
      ),
    }));

    let assets = [...(state.project.assets ?? [])];

    // Auto-archive: when clip becomes 'ready', upsert into assets
    if (status === 'ready') {
      const track = updatedTracks.find((t) => t.clips.some((c) => c.id === clipId));
      const clip = track?.clips.find((c) => c.id === clipId);
      if (track && clip) {
        const existingIdx = assets.findIndex((a) => a.clipId === clipId);
        const asset: AssetClip = {
          id: existingIdx >= 0 ? assets[existingIdx].id : uuidv4(),
          clipId,
          trackDisplayName: track.displayName,
          prompt: clip.prompt,
          source: clip.source ?? 'generated',
          isolatedAudioKey: clip.isolatedAudioKey ?? (extra?.isolatedAudioKey as string | null) ?? null,
          cumulativeMixKey: clip.cumulativeMixKey ?? (extra?.cumulativeMixKey as string | null) ?? null,
          waveformPeaks: clip.waveformPeaks ?? (extra?.waveformPeaks as number[] | null) ?? null,
          starred: existingIdx >= 0 ? assets[existingIdx].starred : false,
          createdAt: Date.now(),
          duration: clip.duration,
        };
        if (existingIdx >= 0) {
          assets[existingIdx] = asset;
        } else {
          assets.push(asset);
        }
      }
    }

    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: updatedTracks,
        assets,
      },
    });
  },

  saveClipVersion: (clipId) => {
    const state = get();
    if (!state.project) return;
    const clip = state.project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
    if (!clip || clip.generationStatus !== 'ready') return;

    const version: ClipVersion = {
      id: uuidv4(),
      cumulativeMixKey: clip.cumulativeMixKey,
      isolatedAudioKey: clip.isolatedAudioKey,
      waveformPeaks: clip.waveformPeaks ? [...clip.waveformPeaks] : null,
      inferredMetas: clip.inferredMetas ? { ...clip.inferredMetas } : undefined,
      generatedFromContext: clip.generatedFromContext,
      serverCumulativePath: clip.serverCumulativePath,
      generatedAt: Date.now(),
    };

    const existingVersions = clip.versions ?? [];
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId
              ? { ...c, versions: [...existingVersions, version], activeVersionIdx: existingVersions.length }
              : c,
          ),
        })),
      },
    });
  },

  setActiveVersion: (clipId, idx) => {
    const state = get();
    if (!state.project) return;
    const clip = state.project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
    if (!clip || !clip.versions || idx < 0 || idx >= clip.versions.length) return;

    const version = clip.versions[idx];
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId
              ? {
                  ...c,
                  activeVersionIdx: idx,
                  cumulativeMixKey: version.cumulativeMixKey,
                  isolatedAudioKey: version.isolatedAudioKey,
                  waveformPeaks: version.waveformPeaks,
                  inferredMetas: version.inferredMetas,
                  generatedFromContext: version.generatedFromContext,
                  serverCumulativePath: version.serverCumulativePath,
                  generationStatus: 'ready',
                }
              : c,
          ),
        })),
      },
    });
  },

  toggleClipStar: (clipId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const clip = state.project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
    const newStarred = clip ? !clip.starred : true;
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, starred: newStarred } : c,
          ),
        })),
        assets: (state.project.assets ?? []).map((a) =>
          a.clipId === clipId ? { ...a, starred: newStarred } : a,
        ),
      },
    });
  },

  moveClipToTrack: (clipId, targetTrackId, startTime) => {
    const state = get();
    if (!state.project) return;
    const srcTrack = state.project.tracks.find((t) => t.clips.some((c) => c.id === clipId));
    if (!srcTrack) return;
    if (srcTrack.id === targetTrackId && startTime === undefined) return;
    const clip = srcTrack.clips.find((c) => c.id === clipId);
    if (!clip) return;
    _pushHistory(state.project);
    const movedClip = {
      ...clip,
      trackId: targetTrackId,
      ...(startTime !== undefined ? { startTime } : {}),
    };
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id === srcTrack.id && t.id !== targetTrackId) {
            return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
          }
          if (t.id === targetTrackId && t.id !== srcTrack.id) {
            return { ...t, clips: [...t.clips, movedClip] };
          }
          if (t.id === srcTrack.id && t.id === targetTrackId) {
            return { ...t, clips: t.clips.map((c) => c.id === clipId ? movedClip : c) };
          }
          return t;
        }),
      },
    });
  },

  duplicateClipToTrack: (clipId, targetTrackId, startTime) => {
    const state = get();
    if (!state.project) return undefined;
    let sourceClip: Clip | undefined;
    for (const t of state.project.tracks) {
      const c = t.clips.find((c) => c.id === clipId);
      if (c) { sourceClip = c; break; }
    }
    if (!sourceClip) return undefined;
    _pushHistory(state.project);
    const isReady = sourceClip.generationStatus === 'ready' && !!sourceClip.isolatedAudioKey;
    const newClip: Clip = {
      ...sourceClip,
      id: uuidv4(),
      trackId: targetTrackId,
      startTime: startTime ?? sourceClip.startTime,
      generationStatus: isReady ? 'ready' : 'empty',
      generationJobId: null,
      cumulativeMixKey: sourceClip.cumulativeMixKey,
      isolatedAudioKey: isReady ? sourceClip.isolatedAudioKey : null,
      waveformPeaks: isReady && sourceClip.waveformPeaks ? [...sourceClip.waveformPeaks] : null,
    };
    const newTracks = state.project.tracks.map((t) =>
      t.id === targetTrackId ? { ...t, clips: [...t.clips, newClip] } : t,
    );
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
      },
    });
    return newClip;
  },

  batchDuplicateClips: (clipIds, timeOffset) => {
    const state = get();
    if (!state.project) return;
    const idSet = new Set(clipIds);
    const clipsToClone: { clip: Clip; trackId: string }[] = [];
    for (const t of state.project.tracks) {
      for (const c of t.clips) {
        if (idSet.has(c.id)) clipsToClone.push({ clip: c, trackId: t.id });
      }
    }
    if (clipsToClone.length === 0) return;
    _pushHistory(state.project);
    const newClipsPerTrack = new Map<string, Clip[]>();
    for (const { clip, trackId } of clipsToClone) {
      const isReady = clip.generationStatus === 'ready' && !!clip.isolatedAudioKey;
      const dup: Clip = {
        ...clip,
        id: uuidv4(),
        trackId,
        startTime: Math.max(0, clip.startTime + timeOffset),
        generationStatus: isReady ? 'ready' : 'empty',
        generationJobId: null,
        cumulativeMixKey: clip.cumulativeMixKey,
        isolatedAudioKey: isReady ? clip.isolatedAudioKey : null,
        waveformPeaks: isReady && clip.waveformPeaks ? [...clip.waveformPeaks] : null,
      };
      if (!newClipsPerTrack.has(trackId)) newClipsPerTrack.set(trackId, []);
      newClipsPerTrack.get(trackId)!.push(dup);
    }
    const newTracks = state.project.tracks.map((t) => {
      const extra = newClipsPerTrack.get(t.id);
      return extra ? { ...t, clips: [...t.clips, ...extra] } : t;
    });
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
      },
    });
  },

  batchMoveClips: (clipIds, timeOffset) => {
    const state = get();
    if (!state.project || clipIds.length === 0 || timeOffset === 0) return;
    const idSet = new Set(clipIds);
    const newTracks = state.project.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        idSet.has(c.id)
          ? { ...c, startTime: Math.max(0, c.startTime + timeOffset) }
          : c,
      ),
    }));
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
      },
    });
  },

  removeAsset: (assetId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        assets: (state.project.assets ?? []).filter((a) => a.id !== assetId),
      },
    });
  },

  toggleAssetStar: (assetId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const asset = (state.project.assets ?? []).find((a) => a.id === assetId);
    if (!asset) return;
    const newStarred = !asset.starred;
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        assets: (state.project.assets ?? []).map((a) =>
          a.id === assetId ? { ...a, starred: newStarred } : a,
        ),
        tracks: state.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === asset.clipId ? { ...c, starred: newStarred } : c,
          ),
        })),
      },
    });
  },

  // ── Sequencer actions ───────────────────────────────────────────────────

  initSequencerPattern: (trackId) => {
    const state = get();
    if (!state.project) return;
    const track = state.project.tracks.find((t) => t.id === trackId);
    if (!track || track.sequencerPattern) return;
    _pushHistory(state.project);

    const stepsPerBar = 16;
    const bars = 1;
    const totalSteps = stepsPerBar * bars;
    const emptyStep = (): SequencerStep => ({ active: false, velocity: 0.8 });

    const rows: SequencerRow[] = DEFAULT_DRUM_KIT.map((kit) => ({
      id: uuidv4(),
      name: kit.name,
      sampleKey: kit.id,
      steps: Array.from({ length: totalSteps }, emptyStep),
      volume: 0.8,
      pan: 0,
      muted: false,
      color: kit.color,
    }));

    const pattern: SequencerPattern = {
      id: uuidv4(),
      name: 'Pattern 1',
      rows,
      stepsPerBar,
      bars,
      swing: 0,
    };

    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId ? { ...t, sequencerPattern: pattern } : t,
        ),
      },
    });
  },

  toggleSequencerStep: (trackId, rowId, stepIndex) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.sequencerPattern) return t;
          return {
            ...t,
            sequencerPattern: {
              ...t.sequencerPattern,
              rows: t.sequencerPattern.rows.map((r) => {
                if (r.id !== rowId) return r;
                const newSteps = [...r.steps];
                const s = newSteps[stepIndex];
                if (s) newSteps[stepIndex] = { ...s, active: !s.active };
                return { ...r, steps: newSteps };
              }),
            },
          };
        }),
      },
    });
  },

  setSequencerStepVelocity: (trackId, rowId, stepIndex, velocity) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.sequencerPattern) return t;
          return {
            ...t,
            sequencerPattern: {
              ...t.sequencerPattern,
              rows: t.sequencerPattern.rows.map((r) => {
                if (r.id !== rowId) return r;
                const newSteps = [...r.steps];
                const s = newSteps[stepIndex];
                if (s) newSteps[stepIndex] = { ...s, velocity: Math.max(0, Math.min(1, velocity)) };
                return { ...r, steps: newSteps };
              }),
            },
          };
        }),
      },
    });
  },

  addSequencerRow: (trackId, sampleId, name, color) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.sequencerPattern) return t;
          const totalSteps = t.sequencerPattern.stepsPerBar * t.sequencerPattern.bars;
          const newRow: SequencerRow = {
            id: uuidv4(),
            name,
            sampleKey: sampleId,
            steps: Array.from({ length: totalSteps }, () => ({ active: false, velocity: 0.8 })),
            volume: 0.8,
            pan: 0,
            muted: false,
            color,
          };
          return {
            ...t,
            sequencerPattern: {
              ...t.sequencerPattern,
              rows: [...t.sequencerPattern.rows, newRow],
            },
          };
        }),
      },
    });
  },

  removeSequencerRow: (trackId, rowId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.sequencerPattern) return t;
          return {
            ...t,
            sequencerPattern: {
              ...t.sequencerPattern,
              rows: t.sequencerPattern.rows.filter((r) => r.id !== rowId),
            },
          };
        }),
      },
    });
  },

  updateSequencerSwing: (trackId, swing) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.sequencerPattern) return t;
          return {
            ...t,
            sequencerPattern: { ...t.sequencerPattern, swing: Math.max(0, Math.min(1, swing)) },
          };
        }),
      },
    });
  },

  setSequencerStepsPerBar: (trackId, stepsPerBar) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.sequencerPattern) return t;
          const p = t.sequencerPattern;
          const newTotal = stepsPerBar * p.bars;
          return {
            ...t,
            sequencerPattern: {
              ...p,
              stepsPerBar,
              rows: p.rows.map((r) => {
                const steps = [...r.steps];
                while (steps.length < newTotal) steps.push({ active: false, velocity: 0.8 });
                return { ...r, steps: steps.slice(0, newTotal) };
              }),
            },
          };
        }),
      },
    });
  },

  setSequencerBars: (trackId, bars) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.sequencerPattern) return t;
          const p = t.sequencerPattern;
          const newTotal = p.stepsPerBar * bars;
          return {
            ...t,
            sequencerPattern: {
              ...p,
              bars,
              rows: p.rows.map((r) => {
                const steps = [...r.steps];
                while (steps.length < newTotal) steps.push({ active: false, velocity: 0.8 });
                return { ...r, steps: steps.slice(0, newTotal) };
              }),
            },
          };
        }),
      },
    });
  },

  setSequencerRowVolume: (trackId, rowId, volume) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.sequencerPattern) return t;
          return {
            ...t,
            sequencerPattern: {
              ...t.sequencerPattern,
              rows: t.sequencerPattern.rows.map((r) =>
                r.id === rowId ? { ...r, volume: Math.max(0, Math.min(1, volume)) } : r,
              ),
            },
          };
        }),
      },
    });
  },

  setSequencerRowPan: (trackId, rowId, pan) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.sequencerPattern) return t;
          return {
            ...t,
            sequencerPattern: {
              ...t.sequencerPattern,
              rows: t.sequencerPattern.rows.map((r) =>
                r.id === rowId ? { ...r, pan: Math.max(-1, Math.min(1, pan)) } : r,
              ),
            },
          };
        }),
      },
    });
  },

  toggleSequencerRowMute: (trackId, rowId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.sequencerPattern) return t;
          return {
            ...t,
            sequencerPattern: {
              ...t.sequencerPattern,
              rows: t.sequencerPattern.rows.map((r) =>
                r.id === rowId ? { ...r, muted: !r.muted } : r,
              ),
            },
          };
        }),
      },
    });
  },

  setSequencerRowSample: (trackId, rowId, sampleKey) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.sequencerPattern) return t;
          return {
            ...t,
            sequencerPattern: {
              ...t.sequencerPattern,
              rows: t.sequencerPattern.rows.map((r) =>
                r.id === rowId ? { ...r, sampleKey } : r,
              ),
            },
          };
        }),
      },
    });
  },

  clearSequencerRow: (trackId, rowId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.sequencerPattern) return t;
          return {
            ...t,
            sequencerPattern: {
              ...t.sequencerPattern,
              rows: t.sequencerPattern.rows.map((r) =>
                r.id === rowId
                  ? { ...r, steps: r.steps.map((s) => ({ ...s, active: false })) }
                  : r,
              ),
            },
          };
        }),
      },
    });
  },

  reorderSequencerRows: (trackId, fromIndex, toIndex) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.sequencerPattern) return t;
          const rows = [...t.sequencerPattern.rows];
          const [moved] = rows.splice(fromIndex, 1);
          if (!moved) return t;
          rows.splice(toIndex, 0, moved);
          return { ...t, sequencerPattern: { ...t.sequencerPattern, rows } };
        }),
      },
    });
  },

  cloneSequencerRow: (trackId, rowId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.sequencerPattern) return t;
          const idx = t.sequencerPattern.rows.findIndex((r) => r.id === rowId);
          if (idx < 0) return t;
          const orig = t.sequencerPattern.rows[idx];
          const clone: SequencerRow = {
            ...orig,
            id: uuidv4(),
            name: `${orig.name} copy`,
            steps: orig.steps.map((s) => ({ ...s })),
          };
          const rows = [...t.sequencerPattern.rows];
          rows.splice(idx + 1, 0, clone);
          return { ...t, sequencerPattern: { ...t.sequencerPattern, rows } };
        }),
      },
    });
  },

  renameSequencerRow: (trackId, rowId, name) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.sequencerPattern) return t;
          return {
            ...t,
            sequencerPattern: {
              ...t.sequencerPattern,
              rows: t.sequencerPattern.rows.map((r) =>
                r.id === rowId ? { ...r, name } : r,
              ),
            },
          };
        }),
      },
    });
  },

  setSequencerRowColor: (trackId, rowId, color) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.sequencerPattern) return t;
          return {
            ...t,
            sequencerPattern: {
              ...t.sequencerPattern,
              rows: t.sequencerPattern.rows.map((r) =>
                r.id === rowId ? { ...r, color } : r,
              ),
            },
          };
        }),
      },
    });
  },

  fillSequencerRow: (trackId, rowId, every) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.sequencerPattern) return t;
          return {
            ...t,
            sequencerPattern: {
              ...t.sequencerPattern,
              rows: t.sequencerPattern.rows.map((r) => {
                if (r.id !== rowId) return r;
                return {
                  ...r,
                  steps: r.steps.map((s, i) =>
                    i % every === 0 ? { ...s, active: true } : s,
                  ),
                };
              }),
            },
          };
        }),
      },
    });
  },

  batchSetSequencerSteps: (trackId, ops) => {
    const state = get();
    if (!state.project || ops.length === 0) return;
    _pushHistory(state.project);
    const lookup = new Map<string, Map<number, { active: boolean; velocity: number }>>();
    for (const op of ops) {
      let m = lookup.get(op.rowId);
      if (!m) { m = new Map(); lookup.set(op.rowId, m); }
      m.set(op.stepIndex, { active: op.active, velocity: op.velocity });
    }
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.sequencerPattern) return t;
          return {
            ...t,
            sequencerPattern: {
              ...t.sequencerPattern,
              rows: t.sequencerPattern.rows.map((r) => {
                const stepMap = lookup.get(r.id);
                if (!stepMap) return r;
                return {
                  ...r,
                  steps: r.steps.map((s, idx) => {
                    const patch = stepMap.get(idx);
                    return patch ? { ...s, active: patch.active, velocity: patch.velocity } : s;
                  }),
                };
              }),
            },
          };
        }),
      },
    });
  },

  // ─── Drum Machine Actions ──────────────────────────────────────────────────
  initDrumMachine: (trackId, kit) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId ? { ...t, drumMachine: createDefaultDrumMachineConfig(kit ?? t.drumKit ?? '808') } : t,
        ),
      },
    });
  },

  setDrumPadSample: (trackId, padIndex, sampleKey) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.drumMachine) return t;
          return {
            ...t,
            drumMachine: {
              ...t.drumMachine,
              pads: t.drumMachine.pads.map((p, i) =>
                i === padIndex ? { ...p, sampleKey } : p,
              ),
            },
          };
        }),
      },
    });
  },

  setDrumPadVolume: (trackId, padIndex, volume) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.drumMachine) return t;
          return {
            ...t,
            drumMachine: {
              ...t.drumMachine,
              pads: t.drumMachine.pads.map((p, i) =>
                i === padIndex ? { ...p, volume: Math.max(0, Math.min(1, volume)) } : p,
              ),
            },
          };
        }),
      },
    });
  },

  setDrumPadPan: (trackId, padIndex, pan) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.drumMachine) return t;
          return {
            ...t,
            drumMachine: {
              ...t.drumMachine,
              pads: t.drumMachine.pads.map((p, i) =>
                i === padIndex ? { ...p, pan: Math.max(-1, Math.min(1, pan)) } : p,
              ),
            },
          };
        }),
      },
    });
  },

  renameDrumPad: (trackId, padIndex, name) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.drumMachine) return t;
          return {
            ...t,
            drumMachine: {
              ...t.drumMachine,
              pads: t.drumMachine.pads.map((p, i) =>
                i === padIndex ? { ...p, name } : p,
              ),
            },
          };
        }),
      },
    });
  },

  setDrumMachineKit: (trackId, kit) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id !== trackId || !t.drumMachine) return t;
          return {
            ...t,
            drumKit: kit,
            drumMachine: { ...t.drumMachine, kitName: kit },
          };
        }),
      },
    });
  },

  addMidiNote: (clipId, note) => {
    const state = get();
    if (!state.project) return undefined;
    const noteId = note.id ?? uuidv4();
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            clip.id === clipId
              ? {
                  ...clip,
                  midiData: {
                    notes: [...(clip.midiData?.notes ?? []), { ...note, id: noteId }],
                    grid: clip.midiData?.grid ?? '1/16',
                  },
                }
              : clip,
          ),
        })),
      },
    });
    return noteId;
  },

  updateMidiNote: (clipId, noteId, updates) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            clip.id === clipId && clip.midiData
              ? {
                  ...clip,
                  midiData: {
                    ...clip.midiData,
                    notes: clip.midiData.notes.map((note) =>
                      note.id === noteId ? { ...note, ...updates } : note,
                    ),
                  },
                }
              : clip,
          ),
        })),
      },
    });
  },

  removeMidiNote: (clipId, noteId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            clip.id === clipId && clip.midiData
              ? {
                  ...clip,
                  midiData: {
                    ...clip.midiData,
                    notes: clip.midiData.notes.filter((note) => note.id !== noteId),
                  },
                }
              : clip,
          ),
        })),
      },
    });
  },

  quantizeMidiNotes: (clipId, noteIds, gridBeatsOrOptions) => {
    const state = get();
    const options: QuantizeOptions =
      typeof gridBeatsOrOptions === 'number'
        ? { gridBeats: gridBeatsOrOptions, strength: 100, swing: 0, scope: 'start' }
        : gridBeatsOrOptions;
    if (!state.project || options.gridBeats <= 0) return;
    _pushHistory(state.project);
    const noteIdSet = new Set(noteIds);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            clip.id === clipId && clip.midiData
              ? {
                  ...clip,
                  midiData: {
                    ...clip.midiData,
                    notes: applyQuantize(clip.midiData.notes, noteIdSet, options),
                  },
                }
              : clip,
          ),
        })),
      },
    });
  },

  stampChord: (clipId, rootPitch, intervals, startBeat, durationBeats, velocity = 100) => {
    const state = get();
    if (!state.project) return [];
    _pushHistory(state.project);
    const noteIds: string[] = [];
    const pitches = intervals.map((i) => rootPitch + i).filter((p) => p <= 127);
    for (const pitch of pitches) {
      const id = crypto.randomUUID();
      noteIds.push(id);
      // Use addMidiNote internally (but we batch in one history push)
    }
    // Batch add all chord notes in one state update
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            clip.id === clipId && clip.midiData
              ? {
                  ...clip,
                  midiData: {
                    ...clip.midiData,
                    notes: [
                      ...clip.midiData.notes,
                      ...pitches.map((pitch, i) => ({
                        id: noteIds[i],
                        pitch,
                        startBeat,
                        durationBeats,
                        velocity,
                      })),
                    ],
                  },
                }
              : clip,
          ),
        })),
      },
    });
    return noteIds;
  },

  setMidiGrid: (clipId, grid) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) =>
            clip.id === clipId
              ? {
                  ...clip,
                  midiData: {
                    notes: clip.midiData?.notes ?? [],
                    grid,
                  },
                }
              : clip,
          ),
        })),
      },
    });
  },

  transformMidiNotes: (clipId, noteIds, transform) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const noteIdSet = new Set(noteIds);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId || !clip.midiData) return clip;
            const selected = clip.midiData.notes.filter((n) => noteIdSet.has(n.id));
            const unselected = clip.midiData.notes.filter((n) => !noteIdSet.has(n.id));
            const transformed = applyTransform(selected, transform);
            return {
              ...clip,
              midiData: { ...clip.midiData, notes: [...unselected, ...transformed] },
            };
          }),
        })),
      },
    });
  },

  addTrackEffect: (trackId, type) => {
    const state = get();
    if (!state.project) return undefined;
    const effect = createDefaultTrackEffect(type);
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) =>
          track.id === trackId
            ? { ...track, effects: [...(track.effects ?? []), effect] }
            : track,
        ),
      },
    });
    return effect.id;
  },

  updateTrackEffect: (trackId, effectId, updates) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) => {
          if (track.id !== trackId) return track;
          return {
            ...track,
            effects: (track.effects ?? []).map((effect) =>
              effect.id === effectId ? { ...effect, ...updates } as TrackEffect : effect,
            ),
          };
        }),
      },
    });
  },

  removeTrackEffect: (trackId, effectId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        automationLanes: (state.project.automationLanes ?? []).filter(
          (lane) => lane.parameter.type !== 'effect' || lane.parameter.effectId !== effectId,
        ),
        tracks: state.project.tracks.map((track) =>
          track.id === trackId
            ? { ...track, effects: (track.effects ?? []).filter((effect) => effect.id !== effectId) }
            : track,
        ),
      },
    });
  },

  reorderTrackEffect: (trackId, fromIndex, toIndex) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) => {
          if (track.id !== trackId) return track;
          const effects = [...(track.effects ?? [])];
          if (fromIndex < 0 || toIndex < 0 || fromIndex >= effects.length || toIndex >= effects.length) {
            return track;
          }
          const [moved] = effects.splice(fromIndex, 1);
          effects.splice(toIndex, 0, moved);
          return { ...track, effects };
        }),
      },
    });
  },


  setSidechainSource: (trackId, effectId, sourceTrackId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) => {
          if (track.id !== trackId) return track;
          return {
            ...track,
            effects: (track.effects ?? []).map((effect) => {
              if (effect.id !== effectId || effect.type !== 'compressor') return effect;
              const params = { ...effect.params } as CompressorParams;
              if (sourceTrackId === undefined) {
                delete params.sidechainSourceTrackId;
              } else {
                params.sidechainSourceTrackId = sourceTrackId;
              }
              return { ...effect, params } as TrackEffect;
            }),
          };
        }),
      },
    });
  },

  // ─── MIDI Effects ──────────────────────────────────────────────────────────

  addMidiEffect: (trackId, type) => {
    const state = get();
    if (!state.project) return undefined;
    const effect = createDefaultMidiEffect(type);
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) =>
          track.id === trackId
            ? { ...track, midiEffects: [...(track.midiEffects ?? []), effect] }
            : track,
        ),
      },
    });
    return effect.id;
  },

  removeMidiEffect: (trackId, effectId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) =>
          track.id === trackId
            ? { ...track, midiEffects: (track.midiEffects ?? []).filter((e) => e.id !== effectId) }
            : track,
        ),
      },
    });
  },

  updateMidiEffect: (trackId, effectId, updates) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) =>
          track.id === trackId
            ? {
                ...track,
                midiEffects: (track.midiEffects ?? []).map((e) =>
                  e.id === effectId ? ({ ...e, ...updates, id: e.id, type: e.type } as MidiEffect) : e,
                ),
              }
            : track,
        ),
      },
    });
  },

  toggleMidiEffect: (trackId, effectId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) =>
          track.id === trackId
            ? {
                ...track,
                midiEffects: (track.midiEffects ?? []).map((e) =>
                  e.id === effectId ? { ...e, enabled: !e.enabled } : e,
                ),
              }
            : track,
        ),
      },
    });
  },

  reorderMidiEffect: (trackId, fromIndex, toIndex) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) => {
          if (track.id !== trackId) return track;
          const effects = [...(track.midiEffects ?? [])];
          if (fromIndex < 0 || fromIndex >= effects.length || toIndex < 0 || toIndex >= effects.length) return track;
          const [moved] = effects.splice(fromIndex, 1);
          effects.splice(toIndex, 0, moved);
          return { ...track, midiEffects: effects };
        }),
      },
    });
  },

  // ─── Automation ───────────────────────────────────────────────────────────

  ensureAutomationLane: (trackId, parameter, initialValue = 0.5) => {
    const state = get();
    if (!state.project) return;
    const existingLane = (state.project.automationLanes ?? []).find(
      (lane) => lane.trackId === trackId && automationParamEquals(lane.parameter, parameter),
    );
    if (existingLane) return;
    _pushHistory(state.project);
    const lanes = [
      ...(state.project.automationLanes ?? []),
      {
        id: uuidv4(),
        trackId,
        parameter,
        points: [
          { time: 0, value: initialValue },
          { time: state.project.totalDuration, value: initialValue },
        ],
      },
    ];
    set({ project: { ...state.project, updatedAt: Date.now(), automationLanes: lanes } });
  },

  addAutomationPoint: (trackId, parameter, point) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const lanes = [...(state.project.automationLanes ?? [])];
    const matchLane = (l: AutomationLane) =>
      l.trackId === trackId && automationParamEquals(l.parameter, parameter);
    const existingLane = lanes.find(matchLane);
    if (!existingLane) {
      lanes.push({ id: uuidv4(), trackId, parameter, points: [point] });
    } else {
      const laneIdx = lanes.indexOf(existingLane);
      lanes[laneIdx] = { ...existingLane, points: [...existingLane.points, point].sort((a, b) => a.time - b.time) };
    }
    set({ project: { ...state.project, updatedAt: Date.now(), automationLanes: lanes } });
  },

  removeAutomationPoint: (trackId, parameter, pointIndex) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const lanes = (state.project.automationLanes ?? []).map((lane) => {
      if (lane.trackId !== trackId || !automationParamEquals(lane.parameter, parameter)) return lane;
      return { ...lane, points: lane.points.filter((_: AutomationPoint, i: number) => i !== pointIndex) };
    });
    set({ project: { ...state.project, updatedAt: Date.now(), automationLanes: lanes } });
  },

  updateAutomationPoint: (trackId, parameter, pointIndex, updates) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const lanes = (state.project.automationLanes ?? []).map((lane) => {
      if (lane.trackId !== trackId || !automationParamEquals(lane.parameter, parameter)) return lane;
      const newPoints = lane.points.map((p: AutomationPoint, i: number) =>
        i === pointIndex ? { ...p, ...updates } : p,
      ).sort((a: AutomationPoint, b: AutomationPoint) => a.time - b.time);
      return { ...lane, points: newPoints };
    });
    set({ project: { ...state.project, updatedAt: Date.now(), automationLanes: lanes } });
  },

  clearAutomationLane: (trackId, parameter) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const lanes = (state.project.automationLanes ?? []).filter(
      (l: AutomationLane) => !(l.trackId === trackId && automationParamEquals(l.parameter, parameter)),
    );
    set({ project: { ...state.project, updatedAt: Date.now(), automationLanes: lanes } });
  },

  // -- Track grouping / folder tracks --

  createGroupTrack: (name) => {
    const state = get();
    if (!state.project) throw new Error('No project');
    _pushHistory(state.project);
    const existingOrders = state.project.tracks.map((t) => t.order);
    const maxOrder = existingOrders.length > 0 ? Math.max(...existingOrders) : 0;
    const track: Track = {
      id: uuidv4(),
      trackName: 'custom',
      displayName: name,
      color: '#71717a',
      order: maxOrder + 1,
      volume: 0.8,
      muted: false,
      soloed: false,
      clips: [],
      isGroup: true,
      collapsed: false,
      effects: [],
    };
    const newTracks = [...state.project.tracks, track];
    set({ project: { ...state.project, updatedAt: Date.now(), tracks: newTracks } });
    return track;
  },

  moveTrackToGroup: (trackId, groupId) => {
    const state = get();
    if (!state.project) return;
    if (groupId !== null) {
      const group = state.project.tracks.find((t) => t.id === groupId);
      if (!group || !group.isGroup) return;
    }
    const track = state.project.tracks.find((t) => t.id === trackId);
    if (!track || track.isGroup) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId ? { ...t, parentTrackId: groupId ?? undefined } : t,
        ),
      },
    });
  },

  toggleGroupCollapse: (groupId) => {
    const state = get();
    if (!state.project) return;
    const group = state.project.tracks.find((t) => t.id === groupId);
    if (!group || !group.isGroup) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === groupId ? { ...t, collapsed: !t.collapsed } : t,
        ),
      },
    });
  },

  getGroupVolume: (groupId) => {
    const state = get();
    if (!state.project) return 0;
    const children = state.project.tracks.filter((t) => t.parentTrackId === groupId && !t.isGroup);
    if (children.length === 0) return 0;
    return children.reduce((sum, t) => sum + t.volume, 0) / children.length;
  },

  // ── Return tracks (sends/returns mixer buses) ─────────────────────────────

  addReturnTrack: (name) => {
    const state = get();
    const returnTrack: ReturnTrack = {
      id: uuidv4(),
      name: name ?? `Return ${(state.project?.returnTracks?.length ?? 0) + 1}`,
      effects: [],
      volume: 1,
      pan: 0,
    };
    if (state.project) {
      _pushHistory(state.project);
      set({
        project: {
          ...state.project,
          updatedAt: Date.now(),
          returnTracks: [...(state.project.returnTracks ?? []), returnTrack],
        },
      });
    }
    return returnTrack;
  },

  removeReturnTrack: (returnTrackId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        returnTracks: (state.project.returnTracks ?? []).filter((rt) => rt.id !== returnTrackId),
        // Clean up sends referencing this return track from all tracks
        tracks: state.project.tracks.map((track) => ({
          ...track,
          sends: (track.sends ?? []).filter((s) => s.returnTrackId !== returnTrackId),
        })),
      },
    });
  },

  updateReturnTrack: (returnTrackId, updates) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        returnTracks: (state.project.returnTracks ?? []).map((rt) =>
          rt.id === returnTrackId ? { ...rt, ...updates } : rt,
        ),
      },
    });
  },

  updateTrackSend: (trackId, returnTrackId, amount) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) => {
          if (track.id !== trackId) return track;
          const sends = [...(track.sends ?? [])];
          const existingIdx = sends.findIndex((s) => s.returnTrackId === returnTrackId);
          if (amount <= 0) {
            // Remove the send if amount is 0 or negative
            if (existingIdx >= 0) sends.splice(existingIdx, 1);
          } else if (existingIdx >= 0) {
            sends[existingIdx] = { ...sends[existingIdx], amount };
          } else {
            sends.push({ returnTrackId, amount });
          }
          return { ...track, sends };
        }),
      },
    });
  },

  // ── Tempo Map ──────────────────────────────────────────────────────────────

  addTempoEvent: (event: TempoEvent) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const map = [...(state.project.tempoMap ?? [])];
    const existingIdx = map.findIndex((e: TempoEvent) => e.beat === event.beat);
    if (existingIdx >= 0) {
      map[existingIdx] = event;
    } else {
      map.push(event);
      map.sort((a: TempoEvent, b: TempoEvent) => a.beat - b.beat);
    }
    const updated = { ...state.project, updatedAt: Date.now(), tempoMap: map };
    updated.totalDuration = computeTotalDuration(updated.tracks, updated.measures, updated.bpm, updated.timeSignature, updated.tempoMap, updated.timeSignatureMap);
    set({ project: updated });
  },

  removeTempoEvent: (beat: number) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const map = (state.project.tempoMap ?? []).filter((e: TempoEvent) => e.beat !== beat);
    const updated = { ...state.project, updatedAt: Date.now(), tempoMap: map };
    updated.totalDuration = computeTotalDuration(updated.tracks, updated.measures, updated.bpm, updated.timeSignature, updated.tempoMap, updated.timeSignatureMap);
    set({ project: updated });
  },

  updateTempoEvent: (beat: number, updates: Partial<TempoEvent>) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const map = (state.project.tempoMap ?? []).map((e: TempoEvent) =>
      e.beat === beat ? { ...e, ...updates } : e,
    );
    if ('beat' in updates) map.sort((a: TempoEvent, b: TempoEvent) => a.beat - b.beat);
    const updated = { ...state.project, updatedAt: Date.now(), tempoMap: map };
    updated.totalDuration = computeTotalDuration(updated.tracks, updated.measures, updated.bpm, updated.timeSignature, updated.tempoMap, updated.timeSignatureMap);
    set({ project: updated });
  },

  clearTempoMap: () => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const updated = { ...state.project, updatedAt: Date.now(), tempoMap: [] };
    updated.totalDuration = computeTotalDuration(updated.tracks, updated.measures, updated.bpm, updated.timeSignature, updated.tempoMap, updated.timeSignatureMap);
    set({ project: updated });
  },

  // ── Time Signature Map ────────────────────────────────────────────────────

  addTimeSignatureEvent: (event: TimeSignatureEvent) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const map = [...(state.project.timeSignatureMap ?? [])];
    const existingIdx = map.findIndex((e: TimeSignatureEvent) => e.bar === event.bar);
    if (existingIdx >= 0) {
      map[existingIdx] = event;
    } else {
      map.push(event);
      map.sort((a: TimeSignatureEvent, b: TimeSignatureEvent) => a.bar - b.bar);
    }
    const updated = { ...state.project, updatedAt: Date.now(), timeSignatureMap: map };
    updated.totalDuration = computeTotalDuration(updated.tracks, updated.measures, updated.bpm, updated.timeSignature, updated.tempoMap, updated.timeSignatureMap);
    set({ project: updated });
  },

  removeTimeSignatureEvent: (bar: number) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const map = (state.project.timeSignatureMap ?? []).filter((e: TimeSignatureEvent) => e.bar !== bar);
    const updated = { ...state.project, updatedAt: Date.now(), timeSignatureMap: map };
    updated.totalDuration = computeTotalDuration(updated.tracks, updated.measures, updated.bpm, updated.timeSignature, updated.tempoMap, updated.timeSignatureMap);
    set({ project: updated });
  },

  updateTimeSignatureEvent: (bar: number, updates: Partial<TimeSignatureEvent>) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const map = (state.project.timeSignatureMap ?? []).map((e: TimeSignatureEvent) =>
      e.bar === bar ? { ...e, ...updates } : e,
    );
    if ('bar' in updates) map.sort((a: TimeSignatureEvent, b: TimeSignatureEvent) => a.bar - b.bar);
    const updated = { ...state.project, updatedAt: Date.now(), timeSignatureMap: map };
    updated.totalDuration = computeTotalDuration(updated.tracks, updated.measures, updated.bpm, updated.timeSignature, updated.tempoMap, updated.timeSignatureMap);
    set({ project: updated });
  },

  clearTimeSignatureMap: () => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const updated = { ...state.project, updatedAt: Date.now(), timeSignatureMap: [] };
    updated.totalDuration = computeTotalDuration(updated.tracks, updated.measures, updated.bpm, updated.timeSignature, updated.tempoMap, updated.timeSignatureMap);
    set({ project: updated });
  },

  // ── Markers ────────────────────────────────────────────────────────────────

  addMarker: (time, name) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const marker: Marker = { id: uuidv4(), time, name, color: '#facc15' };
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        markers: [...(state.project.markers ?? []), marker],
      },
    });
  },

  removeMarker: (id) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        markers: (state.project.markers ?? []).filter((m) => m.id !== id),
      },
    });
  },

  updateMarker: (id, updates) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        markers: (state.project.markers ?? []).map((m) =>
          m.id === id ? { ...m, ...updates } : m,
        ),
      },
    });
  },

  // ── Comping / takes ─────────────────────────────────────────────────────────

  addTake: (clipId, audioKey) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const take: Take = { id: uuidv4(), audioKey, selected: false };
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, takes: [...(c.takes ?? []), take] } : c,
          ),
        })),
      },
    });
  },

  selectTake: (clipId, takeId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId
              ? {
                  ...c,
                  takes: (c.takes ?? []).map((tk) => ({
                    ...tk,
                    selected: tk.id === takeId,
                  })),
                }
              : c,
          ),
        })),
      },
    });
  },

  toggleTakeLanes: (trackId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const track = state.project.tracks.find((t) => t.id === trackId);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId ? { ...t, showTakeLanes: !track?.showTakeLanes } : t,
        ),
      },
    });
  },

  getTrackById: (trackId) => {
    return get().project?.tracks.find((t) => t.id === trackId);
  },

  getClipById: (clipId) => {
    const project = get().project;
    if (!project) return undefined;
    for (const track of project.tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) return clip;
    }
    return undefined;
  },

  getTrackForClip: (clipId) => {
    const project = get().project;
    if (!project) return undefined;
    return project.tracks.find((t) => t.clips.some((c) => c.id === clipId));
  },

  getTracksInGenerationOrder: () => {
    const project = get().project;
    if (!project) return [];
    return [...project.tracks].sort((a, b) => b.order - a.order);
  },

  getTotalDuration: () => {
    const project = get().project;
    if (!project) return MIN_TIMELINE_DURATION;
    return project.totalDuration;
  },

  getAudioDuration: () => {
    const project = get().project;
    if (!project) return MIN_TIMELINE_DURATION;
    let maxEnd = 0;
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        const end = clip.startTime + clip.duration;
        if (end > maxEnd) maxEnd = end;
      }
    }
    return Math.max(MIN_TIMELINE_DURATION, maxEnd);
  },

  separateStems: async (clipId, stemCount) => {
    const state = get();
    const project = state.project;
    if (!project) return undefined;

    const sourceTrack = project.tracks.find((track) => track.clips.some((clip) => clip.id === clipId));
    if (!sourceTrack) {
      throw new Error(`Track for clip '${clipId}' not found`);
    }

    const sourceClip = sourceTrack.clips.find((clip) => clip.id === clipId);
    if (!sourceClip) {
      throw new Error(`Clip '${clipId}' not found`);
    }

    const audioKey = sourceClip.isolatedAudioKey ?? sourceClip.cumulativeMixKey;
    if (!audioKey) {
      throw new Error('Stem separation requires an audio clip');
    }

    const sourceBlob = await loadAudioBlobByKey(audioKey);
    if (!sourceBlob) {
      throw new Error(`Audio for clip '${clipId}' not found`);
    }

    const preparedStems = await separateClipAudioToStems({
      clipId,
      sourceBlob,
      stemCount,
      sourceLabel: sourceTrack.displayName,
    });

    const latest = get();
    if (!latest.project) return undefined;
    _pushHistory(latest.project);

    const existingOrders = latest.project.tracks.map((track) => track.order);
    let nextOrder = existingOrders.length > 0 ? Math.max(...existingOrders) + 1 : 1;
    const existingNames = latest.project.tracks.map((track) => track.displayName);
    const appendedTracks: Track[] = [];

    for (const stem of preparedStems) {
      let displayName = stem.displayName;
      let suffix = 2;
      while (existingNames.includes(displayName)) {
        displayName = `${stem.displayName} ${suffix}`;
        suffix += 1;
      }
      existingNames.push(displayName);

      const newTrackId = uuidv4();
      const newClipId = uuidv4();
      const isolatedKey = await saveAudioBlob(latest.project.id, newClipId, 'isolated', stem.audioBlob);

      appendedTracks.push({
        id: newTrackId,
        trackType: 'sample',
        trackName: stem.trackName,
        displayName,
        color: stem.color,
        order: nextOrder++,
        volume: 0.8,
        muted: false,
        soloed: false,
        clips: [{
          id: newClipId,
          trackId: newTrackId,
          startTime: sourceClip.startTime,
          duration: sourceClip.duration,
          prompt: `${displayName} stem`,
          lyrics: '',
          generationStatus: 'ready',
          generationJobId: null,
          cumulativeMixKey: null,
          isolatedAudioKey: isolatedKey,
          waveformPeaks: stem.waveformPeaks,
          audioDuration: stem.audioDuration,
          audioOffset: 0,
          source: 'uploaded',
        }],
        effects: [],
      });
    }

    const newAssets: AssetClip[] = appendedTracks.flatMap((track) => track.clips.map((clip) => ({
      id: uuidv4(),
      clipId: clip.id,
      trackDisplayName: track.displayName,
      prompt: clip.prompt,
      source: clip.source ?? 'uploaded',
      isolatedAudioKey: clip.isolatedAudioKey,
      cumulativeMixKey: clip.cumulativeMixKey,
      waveformPeaks: clip.waveformPeaks,
      starred: false,
      createdAt: Date.now(),
      duration: clip.duration,
    })));
    const updatedTracks = [...latest.project.tracks, ...appendedTracks];
    set({
      project: {
        ...latest.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(updatedTracks, latest.project.measures, latest.project.bpm, latest.project.timeSignature),
        tracks: updatedTracks,
        assets: [...(latest.project.assets ?? []), ...newAssets],
      },
    });

    return appendedTracks;
  },

  convertAudioToMidi: async (clipId, options) => {
    const state = get();
    if (!state.project) return undefined;
    const sourceTrack = state.project.tracks.find((t) => t.clips.some((c) => c.id === clipId));
    if (!sourceTrack) return undefined;
    const clip = sourceTrack.clips.find((c) => c.id === clipId);
    if (!clip) return undefined;

    const audioKey = clip.isolatedAudioKey ?? clip.cumulativeMixKey;
    if (!audioKey) return undefined;

    const bpm = state.project.bpm;
    const result = await convertClipAudioToMidi(audioKey, bpm, {
      threshold: options?.threshold ?? 0.15,
      minConfidence: options?.minConfidence ?? 0.5,
      minNoteDuration: options?.minNoteDuration ?? 0.05,
    });

    if (result.notes.length === 0) return undefined;

    // Create a new piano roll track
    const newTrack = get().addTrack('custom', 'pianoRoll');

    // Rename the track to indicate source
    get().renameTrack(newTrack.id, `${sourceTrack.displayName} (MIDI)`);

    // Create a MIDI clip on the new track at the same position
    const newClip = get().addClip(newTrack.id, {
      startTime: clip.startTime,
      duration: clip.duration,
      prompt: `Converted from ${sourceTrack.displayName}`,
      lyrics: '',
      midiData: { notes: result.notes, grid: '1/16' },
    });

    return { trackId: newTrack.id, clipId: newClip.id };
  },

  exportStems: async () => {
    const project = get().project;
    if (!project) return;

    const engine = getAudioEngine();
    const totalDuration = project.totalDuration;

    for (const track of project.tracks) {
      const clips: ExportClip[] = [];

      if (track.trackType === 'pianoRoll') {
        for (const clip of track.clips) {
          const notes = clip.midiData?.notes ?? [];
          if (notes.length === 0) continue;
          const buffer = await renderMidiTrackOffline(
            notes, clip.startTime, project.bpm,
            track.synthPreset ?? 'piano', totalDuration,
          );
          clips.push({ startTime: 0, buffer, volume: track.volume, pan: track.pan ?? 0, effects: track.effects });
        }
      }

      if (track.trackType === 'sequencer' && track.sequencerPattern) {
        const buffer = await renderSequencerTrackOffline(
          track.sequencerPattern, project.bpm, totalDuration, track.drumKit ?? '808',
        );
        clips.push({ startTime: 0, buffer, volume: track.volume, pan: track.pan ?? 0, effects: track.effects });
      }

      for (const clip of track.clips) {
        if (clip.generationStatus === 'ready' && clip.isolatedAudioKey) {
          const blob = await loadAudioBlobByKey(clip.isolatedAudioKey);
          if (blob) {
            const buffer = await engine.decodeAudioData(blob);
            clips.push({ startTime: clip.startTime, buffer, volume: track.volume, pan: track.pan ?? 0, effects: track.effects });
          }
        }
      }

      if (clips.length === 0) continue;

      const wavBlob = await exportStemToWav(clips, totalDuration);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}_${track.displayName}.wav`;
      a.click();
      URL.revokeObjectURL(url);
    }
  },
}),
    {
      name: 'ace-step-daw-project',
      partialize: (state) => ({ project: state.project }),
    },
  ),
);

// Auto-save to project library (IDB) on changes, debounced
let _saveTimer: ReturnType<typeof setTimeout>;
useProjectStore.subscribe((state) => {
  if (!state.project) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    const proj = useProjectStore.getState().project;
    if (proj) saveProjectToIDB(proj);
  }, 1000);
});
