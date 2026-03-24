import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { type TrackHeightPreset, getTrackHeightForPreset } from '../constants/trackHeight';
import type {
  BounceInPlaceOptions,
  Project,
  ProjectTemplate,
  ProjectTemplateTrack,
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
  SamplerSettings,
  GainEnvelopePoint,
  LoudnessTarget,
  MasteringPreset,
  MasteringState,
  DrumMachineConfig,
  DrumKitName,
  SamplerConfig,
  SessionClipSlot,
  SessionLaunchEvent,
  SessionLaunchQuantization,
  SessionPendingLaunch,
  SessionScene,
  SessionState,
  PlaybackLatencySettings,
  StrudelFromMidiOptions,
  StrudelFromMidiResult,
} from '../types/project';
import type { PluginInstance, PluginParamValue } from '../types/plugin';
import { pluginRegistry } from '../engine/PluginRegistry';
import { automationParamEquals } from '../types/project';
import { quantizeNotes as applyQuantize, type QuantizeOptions } from '../utils/midiQuantize';
import { detectTransients, computeWarpMarkers } from '../utils/audioQuantize';
import {
  analyzeProjectForMastering,
  buildMasteringChain,
  createDefaultMasteringState,
  ensureMasteringState,
  estimateMasteredLufs,
} from '../utils/mastering';
import { TRACK_CATALOG, TRACK_TYPE_CATALOG, DEFAULT_DRUM_KIT } from '../constants/tracks';
import {
  DEFAULT_BPM,
  DEFAULT_KEY_SCALE,
  DEFAULT_TIME_SIGNATURE,
  DEFAULT_MEASURES,
  MAX_PROJECT_TRACKS,
  DEFAULT_PROJECT_NAME,
  DEFAULT_GENERATION,
} from '../constants/defaults';
import { saveProject as saveProjectToIDB } from '../services/projectStorage';
import { exportTrackStems, getStemExportTracks, trackHasExportableContent } from '../engine/exportMix';
import { applyTransform, type TransformOptions } from '../utils/midiTransforms';
import { generatePattern, type PatternOptions } from '../utils/midiPatternGenerator';
import { loadAudioBlobByKey, saveAudioBlob } from '../services/audioFileManager';
import * as audioEngineHooks from '../hooks/useAudioEngine';
import { renderMidiTrackOffline, renderSamplerTrackOffline, renderSequencerTrackOffline } from '../engine/offlineRender';
import { createSamplerConfig } from '../engine/SamplerEngine';
import { convertClipAudioToMidi } from '../services/audioToMidi';
import { createDefaultParametricEqBands } from '../utils/parametricEq';
import type { StemCount } from '../types/api';
import { separateClipAudioToStems } from '../services/stemSeparation';
import { beatToTime, getBeatAtBar } from '../utils/tempoMap';
import { encodeMidiFile, parseMidiFile } from '../utils/midi';
import { encodeMidiFile as encodeMultiTrackMidiFile, type MidiExportTrack } from '../utils/midiEncoder';
import { clampClipFadeDurations } from '../utils/clipFade';
import { extractGroove, applyGroove, type ExtractGrooveOptions, type ApplyGrooveOptions } from '../utils/groovePool';
import type { GrooveTemplate } from '../types/project';
import { toastError, toastSuccess } from '../hooks/useToast';
import { buildConsolidatedMidiClipData, renderConsolidatedAudioClip, validateClipConsolidation } from '../services/clipConsolidation';
import type { MidiCaptureService } from '../services/midiCaptureService';
import { snapTimeToZeroCrossing } from '../utils/zeroCrossing';
import {
  getClipAudibleEndTime,
  getClipAudibleStartTime,
  getClipContentOffset,
  getClipPlaybackRate,
  isClipRepitchStretched,
} from '../utils/clipAudio';
import { snapToGrid } from '../utils/time';
import {
  createDefaultPlaybackLatencySettings,
  detectPlaybackLatencySettings,
  normalizePlaybackLatencySettings,
  setPlaybackLatencyOverrideSettings,
} from '../utils/playbackLatency';
import { useTransportStore } from './transportStore';
import { useCollaborationStore } from './collaborationStore';
import { bounceTrackToAudioAsset } from '../services/bounceInPlace';
import {
  ensurePlaybackLatencySettings,
} from '../utils/playbackLatency';

function _isViewerMode(): boolean {
  return useCollaborationStore.getState().isViewerMode;
}

function getBarDurationSec(bpm: number, timeSig: number, timeSigDenominator: number = 4): number {
  return (60 / bpm) * timeSig * (4 / Math.max(1, timeSigDenominator));
}

function sanitizeFileNameSegment(value: string) {
  const trimmed = value.trim().replace(/[\\/:*?"<>|]/g, ' ');
  return trimmed.replace(/\s+/g, ' ').trim() || 'untitled';
}

const CLIP_RANGE_SLICE_EPSILON = 0.01;

function buildSlicedMidiData(
  clip: Clip,
  startTime: number,
  endTime: number,
  bpm: number,
): Clip['midiData'] {
  if (!clip.midiData) return undefined;

  const secPerBeat = 60 / Math.max(1, bpm);
  const rangeStartSec = Math.max(0, startTime - clip.startTime);
  const rangeEndSec = Math.max(rangeStartSec, endTime - clip.startTime);

  return {
    ...clip.midiData,
    notes: clip.midiData.notes.flatMap((note) => {
      const noteStartSec = note.startBeat * secPerBeat;
      const noteEndSec = (note.startBeat + note.durationBeats) * secPerBeat;
      const clippedStart = Math.max(noteStartSec, rangeStartSec);
      const clippedEnd = Math.min(noteEndSec, rangeEndSec);

      if (clippedEnd <= clippedStart) return [];

      return [{
        ...note,
        startBeat: (clippedStart - rangeStartSec) / secPerBeat,
        durationBeats: (clippedEnd - clippedStart) / secPerBeat,
      }];
    }),
  };
}

function buildClipSegmentFromRange(
  sourceClip: Clip,
  startTime: number,
  endTime: number,
  bpm: number,
  id: string,
): Clip {
  const relativeStart = Math.max(0, startTime - sourceClip.startTime);
  const duration = Math.max(0, endTime - startTime);
  const nextClip: Clip = {
    ...sourceClip,
    id,
    startTime,
    duration,
  };

  if (sourceClip.midiData) {
    nextClip.midiData = buildSlicedMidiData(sourceClip, startTime, endTime, bpm);
  }

  if (isClipRepitchStretched(sourceClip)) {
    const playbackRate = getClipPlaybackRate(sourceClip);
    const sourceOffset = (sourceClip.audioOffset ?? 0) + relativeStart * playbackRate;
    nextClip.audioOffset = Math.max(0, sourceOffset);
    nextClip.contentOffset = undefined;
  } else {
    const contentOffset = getClipContentOffset(sourceClip);
    const silenceTrim = Math.min(contentOffset, relativeStart);
    const audioTrim = Math.max(0, relativeStart - silenceTrim);
    const nextContentOffset = Math.max(0, contentOffset - silenceTrim);
    const audioDuration = sourceClip.audioDuration ?? sourceClip.duration;

    nextClip.audioOffset = Math.min(audioDuration, (sourceClip.audioOffset ?? 0) + audioTrim);
    nextClip.contentOffset = nextContentOffset > 0 ? Math.min(nextContentOffset, duration) : undefined;
  }

  const clampedFades = clampClipFadeDurations({
    clipDuration: duration,
    fadeInDuration: sourceClip.fadeInDuration,
    fadeOutDuration: sourceClip.fadeOutDuration,
  });
  nextClip.fadeInDuration = clampedFades.fadeInDuration;
  nextClip.fadeOutDuration = clampedFades.fadeOutDuration;

  return nextClip;
}

function snapClipBoundaryToAudio(
  clip: Clip,
  boundaryTime: number,
  samples: Float32Array,
  sampleRate: number,
): number {
  const audibleStart = getClipAudibleStartTime(clip);
  const audibleEnd = getClipAudibleEndTime(clip);
  if (boundaryTime <= audibleStart || boundaryTime >= audibleEnd) {
    return boundaryTime;
  }

  const audioOffset = clip.audioOffset ?? 0;
  const snappedSourceTime = isClipRepitchStretched(clip)
    ? snapTimeToZeroCrossing(
        samples,
        sampleRate,
        audioOffset + (boundaryTime - clip.startTime) * getClipPlaybackRate(clip),
      )
    : snapTimeToZeroCrossing(
        samples,
        sampleRate,
        audioOffset + (boundaryTime - audibleStart),
      );

  return isClipRepitchStretched(clip)
    ? clip.startTime + ((snappedSourceTime - audioOffset) / getClipPlaybackRate(clip))
    : audibleStart + (snappedSourceTime - audioOffset);
}

function buildConsolidatedPrompt(clips: Clip[], fallback: string) {
  const prompts = [...new Set(clips.map((clip) => clip.prompt.trim()).filter(Boolean))];
  return prompts.length === 1 ? prompts[0] : fallback;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

const MIN_TIMELINE_DURATION = DEFAULT_MEASURES * getBarDurationSec(DEFAULT_BPM, DEFAULT_TIME_SIGNATURE); // 128 bars @ 120 BPM 4/4 = 256s
const TIMELINE_PADDING = 10; // seconds beyond last clip

// ── Undo/Redo history ───────────────────────────────────────────────────────
export type HistoryScope = 'arrangement' | 'track' | 'pianoRoll' | 'mixer';

export interface HistoryTarget {
  trackId?: string;
  clipId?: string;
}

export interface ProjectHistoryEntry {
  id: string;
  label: string;
  scope: HistoryScope;
  timestamp: number;
  order: number;
  trackId?: string;
  clipId?: string;
  snapshot: Project;
}

type HistoryScopes<T> = Record<HistoryScope, T>;
type HistoryBucketMap<T> = Record<string, T>;
type HistoryBuckets<T> = HistoryScopes<HistoryBucketMap<T>>;
type HistoryOptions = HistoryTarget & Partial<Pick<ProjectHistoryEntry, 'label' | 'scope'>>;

const HISTORY_SCOPES: HistoryScope[] = ['arrangement', 'track', 'pianoRoll', 'mixer'];
const DEFAULT_HISTORY_LABEL: Record<HistoryScope, string> = {
  arrangement: 'Arrange project',
  track: 'Edit track',
  pianoRoll: 'Edit MIDI',
  mixer: 'Adjust mixer',
};
const MIXER_TRACK_KEYS = new Set(['volume', 'muted', 'soloed', 'pan', 'eqLowGain', 'eqMidGain', 'eqHighGain', 'compressorEnabled', 'compressorThreshold', 'compressorRatio']);
const GLOBAL_HISTORY_BUCKET = '__global__';

function getTrackUpdateHistoryOptions(trackId: string, updates: Partial<Track>): HistoryOptions {
  const keys = Object.keys(updates);
  const scope: HistoryScope = keys.some((key) => MIXER_TRACK_KEYS.has(key)) ? 'mixer' : 'track';
  const label =
    scope === 'mixer'
      ? 'Adjust channel strip'
      : keys.includes('displayName')
        ? 'Rename track'
        : keys.includes('synthPreset') || keys.includes('sampler') || keys.includes('samplerConfig')
          ? 'Configure instrument'
          : 'Edit track';
  return { scope, label, trackId };
}

function createHistoryBuckets<T>(factory: () => T): HistoryBuckets<T> {
  return {
    arrangement: { [GLOBAL_HISTORY_BUCKET]: factory() },
    track: { [GLOBAL_HISTORY_BUCKET]: factory() },
    pianoRoll: { [GLOBAL_HISTORY_BUCKET]: factory() },
    mixer: { [GLOBAL_HISTORY_BUCKET]: factory() },
  };
}

// Module-level, not persisted, not reactive (no point in re-rendering for history changes)
const _history = createHistoryBuckets<ProjectHistoryEntry[]>(() => []);
const _future = createHistoryBuckets<ProjectHistoryEntry[]>(() => []);
const MAX_HISTORY = 50;
let _isDragging = false;
let _historyOrder = 0;

function _getHistoryBucketKey(scope: HistoryScope, target: HistoryTarget = {}) {
  switch (scope) {
    case 'track':
      return target.trackId ? `track:${target.trackId}` : GLOBAL_HISTORY_BUCKET;
    case 'pianoRoll':
      if (target.clipId) return `clip:${target.clipId}`;
      if (target.trackId) return `track:${target.trackId}`;
      return GLOBAL_HISTORY_BUCKET;
    case 'arrangement':
    case 'mixer':
    default:
      return GLOBAL_HISTORY_BUCKET;
  }
}

function _ensureHistoryBucket(buckets: HistoryBuckets<ProjectHistoryEntry[]>, scope: HistoryScope, target: HistoryTarget = {}) {
  const key = _getHistoryBucketKey(scope, target);
  buckets[scope][key] ??= [];
  return { key, bucket: buckets[scope][key] };
}

function _getHistoryBucket(buckets: HistoryBuckets<ProjectHistoryEntry[]>, scope: HistoryScope, target: HistoryTarget = {}) {
  const key = _getHistoryBucketKey(scope, target);
  const bucket = buckets[scope][key];
  return bucket ? { key, bucket } : null;
}

function _trimHistory(bucket: ProjectHistoryEntry[]) {
  if (bucket.length > MAX_HISTORY) bucket.shift();
}

function _createHistoryEntry(project: Project, options: HistoryOptions = {}): ProjectHistoryEntry {
  const scope = options.scope ?? 'arrangement';
  return {
    id: uuidv4(),
    label: options.label ?? DEFAULT_HISTORY_LABEL[scope],
    scope,
    timestamp: Date.now(),
    order: ++_historyOrder,
    trackId: options.trackId,
    clipId: options.clipId,
    snapshot: structuredClone(project),
  };
}

function _clearHistory() {
  for (const scope of HISTORY_SCOPES) {
    _history[scope] = { [GLOBAL_HISTORY_BUCKET]: [] };
    _future[scope] = { [GLOBAL_HISTORY_BUCKET]: [] };
  }
}

function _resolveHistoryBucket(
  buckets: HistoryBuckets<ProjectHistoryEntry[]>,
  scope?: HistoryScope,
  target?: HistoryTarget,
): { scope: HistoryScope; key: string; bucket: ProjectHistoryEntry[] } | null {
  if (scope) {
    if (target?.trackId || target?.clipId) {
      const match = _getHistoryBucket(buckets, scope, target);
      if (match?.bucket.length) {
        return { scope, key: match.key, bucket: match.bucket };
      }
      return null;
    }

    let scopedCandidate: { key: string; bucket: ProjectHistoryEntry[] } | null = null;
    let scopedLatestOrder = -1;
    for (const [key, bucket] of Object.entries(buckets[scope])) {
      const entry = bucket[bucket.length - 1];
      if (entry && entry.order > scopedLatestOrder) {
        scopedLatestOrder = entry.order;
        scopedCandidate = { key, bucket };
      }
    }
    return scopedCandidate ? { scope, key: scopedCandidate.key, bucket: scopedCandidate.bucket } : null;
  }

  let candidate: { scope: HistoryScope; key: string; bucket: ProjectHistoryEntry[] } | null = null;
  let latestOrder = -1;
  for (const candidateScope of HISTORY_SCOPES) {
    for (const [key, bucket] of Object.entries(buckets[candidateScope])) {
      const entry = bucket[bucket.length - 1];
      if (entry && entry.order > latestOrder) {
        latestOrder = entry.order;
        candidate = { scope: candidateScope, key, bucket };
      }
    }
  }
  return candidate;
}

function _getHistoryEntries(buckets: HistoryBuckets<ProjectHistoryEntry[]>, scope?: HistoryScope, target?: HistoryTarget) {
  if (scope) {
    if (target?.trackId || target?.clipId) {
      const match = _getHistoryBucket(buckets, scope, target);
      return (match?.bucket ?? []).map((entry) => ({ ...entry, snapshot: structuredClone(entry.snapshot) }));
    }
    return Object.values(buckets[scope])
      .flatMap((bucket) => bucket)
      .sort((a, b) => a.order - b.order)
      .map((entry) => ({ ...entry, snapshot: structuredClone(entry.snapshot) }));
  }
  return HISTORY_SCOPES
    .flatMap((key) => Object.values(buckets[key]).flatMap((bucket) => bucket))
    .sort((a, b) => a.order - b.order)
    .map((entry) => ({ ...entry, snapshot: structuredClone(entry.snapshot) }));
}

function _pushHistory(project: Project | null, options: HistoryOptions = {}) {
  if (!project) return;
  // During drag operations, history is already captured by beginDrag — skip intermediate states
  if (_isDragging) return;
  const entry = _createHistoryEntry(project, options);
  const { bucket, key } = _ensureHistoryBucket(_history, entry.scope, entry);
  bucket.push(entry);
  _trimHistory(bucket);
  _future[entry.scope][key] = [];
}

function _appendMidiNotesToClip(project: Project, clipId: string, newNotes: MidiNote[]): Project {
  return {
    ...project,
    updatedAt: Date.now(),
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        clip.id === clipId
          ? {
              ...clip,
              midiData: {
                notes: [...(clip.midiData?.notes ?? []), ...newNotes],
                grid: clip.midiData?.grid ?? '1/16',
              },
            }
          : clip,
      ),
    })),
  };
}

/** Call before starting a drag/continuous operation. Captures undo snapshot once. */
function _beginDrag(project: Project | null, options: HistoryOptions = {}) {
  if (!project || _isDragging) return;
  _isDragging = true;
  const entry = _createHistoryEntry(project, options);
  const { bucket, key } = _ensureHistoryBucket(_history, entry.scope, entry);
  bucket.push(entry);
  _trimHistory(bucket);
  _future[entry.scope][key] = [];
}

/** Call when drag/continuous operation ends. Re-enables normal history tracking. */
function _endDrag() {
  _isDragging = false;
}

function _replaceTrackFromSnapshot(current: Project, snapshot: Project, trackId: string) {
  const snapshotTrack = snapshot.tracks.find((track) => track.id === trackId);
  if (!snapshotTrack) return current;
  return {
    ...current,
    updatedAt: Date.now(),
    tracks: current.tracks.map((track) => (
      track.id === trackId ? structuredClone(snapshotTrack) : track
    )),
  };
}

function _replaceClipFromSnapshot(current: Project, snapshot: Project, clipId: string) {
  let snapshotTrackId: string | null = null;
  let snapshotClip: Clip | null = null;

  for (const track of snapshot.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (clip) {
      snapshotTrackId = track.id;
      snapshotClip = clip;
      break;
    }
  }

  if (!snapshotTrackId || !snapshotClip) return current;

  return {
    ...current,
    updatedAt: Date.now(),
    tracks: current.tracks.map((track) => {
      if (track.id !== snapshotTrackId) return track;
      return {
        ...track,
        clips: track.clips.map((clip) => (
          clip.id === clipId ? structuredClone(snapshotClip) : clip
        )),
      };
    }),
  };
}

function _applyHistorySnapshot(current: Project | null, snapshot: Project, entry: Pick<ProjectHistoryEntry, 'scope' | 'trackId' | 'clipId'>) {
  if (!current) return structuredClone(snapshot);

  switch (entry.scope) {
    case 'track':
      return entry.trackId ? _replaceTrackFromSnapshot(current, snapshot, entry.trackId) : structuredClone(snapshot);
    case 'pianoRoll':
      if (entry.clipId) return _replaceClipFromSnapshot(current, snapshot, entry.clipId);
      if (entry.trackId) return _replaceTrackFromSnapshot(current, snapshot, entry.trackId);
      return structuredClone(snapshot);
    case 'mixer':
      if (entry.trackId) return _replaceTrackFromSnapshot(current, snapshot, entry.trackId);
      return {
        ...current,
        updatedAt: Date.now(),
        mastering: structuredClone(snapshot.mastering),
        returnTracks: structuredClone(snapshot.returnTracks ?? []),
      };
    case 'arrangement':
    default:
      return structuredClone(snapshot);
  }
}

export interface ProjectState {
  project: Project | null;

  setProject: (project: Project) => void;
  createProject: (params?: {
    name?: string;
    bpm?: number;
    keyScale?: string;
    timeSignature?: number;
  }) => void;
  undo: (scope?: HistoryScope, target?: HistoryTarget) => void;
  redo: (scope?: HistoryScope, target?: HistoryTarget) => void;
  getUndoHistory: (scope?: HistoryScope, target?: HistoryTarget) => ProjectHistoryEntry[];
  getRedoHistory: (scope?: HistoryScope, target?: HistoryTarget) => ProjectHistoryEntry[];
  jumpToHistoryEntry: (entryId: string, scope?: HistoryScope, target?: HistoryTarget) => void;
  /** Call before starting a drag/continuous operation to capture a single undo snapshot. */
  beginDrag: (options?: HistoryOptions) => void;
  /** Call when a drag/continuous operation ends to re-enable normal history. */
  endDrag: () => void;

  updateProject: (updates: Partial<Pick<Project, 'globalCaption' | 'bpm' | 'keyScale' | 'timeSignature' | 'timeSignatureDenominator' | 'name' | 'masterVolume' | 'measures'>>) => void;
  detectPlaybackLatency: (latency: { baseLatency?: number | null; outputLatency?: number | null }) => void;
  /** Alias for detectPlaybackLatency – used by tests and external callers. */
  capturePlaybackLatency: (latency: { baseLatency?: number | null; outputLatency?: number | null }) => void;
  setPlaybackLatencyOverride: (latencyMs: number | null) => void;
  analyzeMastering: () => Promise<void>;
  setMasteringPreset: (preset: MasteringPreset) => void;
  setMasteringLoudnessTarget: (target: LoudnessTarget) => void;
  toggleMasteringPreview: () => void;
  setMasteringEnabled: (enabled: boolean) => void;
  removeMastering: () => void;
  updateTrackMixer: (trackId: string, updates: Partial<Pick<Track, 'pan' | 'eqLowGain' | 'eqMidGain' | 'eqHighGain' | 'compressorEnabled' | 'compressorThreshold' | 'compressorRatio'>>) => void;
  toggleTrackEffectsBypass: (trackId: string) => void;
  setPanMode: (trackId: string, mode: 'stereo' | 'dual-mono') => void;
  setDualMonoPan: (trackId: string, left: number, right: number) => void;
  setTrackLocalCaption: (trackId: string, caption: string) => void;
  setTrackReverb: (trackId: string, mix: number, roomSize: number) => void;
  freezeTrack: (trackId: string, frozenAudioKey?: string) => void;
  unfreezeTrack: (trackId: string) => void;
  flattenTrack: (trackId: string, audioKey: string, waveformPeaks?: number[], duration?: number) => void;
  bounceInPlace: (trackId: string, options?: Partial<BounceInPlaceOptions>) => Promise<Clip | undefined>;

  addTrack: (trackName: TrackName | TrackType, trackType?: TrackType, options?: { order?: number }) => Track;
  removeTrack: (trackId: string) => void;
  removeTracks: (trackIds: string[]) => void;
  duplicateTrack: (trackId: string) => Track | undefined;
  updateTrack: (trackId: string, updates: Partial<Pick<Track, 'displayName' | 'volume' | 'muted' | 'soloed' | 'armed' | 'laneHeight' | 'trackType' | 'synthPreset' | 'sampler' | 'samplerConfig' | 'drumKit' | 'color'>>) => void;
  setTrackSampler: (trackId: string, sampler: Partial<SamplerSettings>) => void;
  clearTrackSampler: (trackId: string) => void;
  /** Set or clear the sampler config on a pianoRoll track. Pass null to remove. */
  updateSamplerConfig: (trackId: string, config: SamplerConfig | null) => void;
  createQuickSamplerTrack: (input: {
    audioKey: string;
    sampleName?: string;
    sampleDuration?: number;
    rootNote?: number;
    trackId?: string;
  }) => Track | undefined;
  createQuickSamplerFromClip: (trackId: string, clipId: string) => Track | undefined;
  /** Create a Quick Sampler track directly from a project asset by ID. */
  createQuickSamplerFromAsset: (assetId: string, options?: { trackId?: string; rootNote?: number }) => Track | undefined;
  saveTrackPreset: (trackId: string, presetName: string) => TrackPreset;
  applyTrackPreset: (presetId: string) => Track | undefined;
  deleteTrackPreset: (presetId: string) => void;
  renameTrack: (trackId: string, newName: string) => void;
  setInputMonitoring: (trackId: string, mode: InputMonitoringMode) => void;
  setTrackHeightPreset: (trackId: string, preset: TrackHeightPreset) => void;
  setAllTracksHeightPreset: (preset: TrackHeightPreset) => void;
  reorderTrack: (draggedId: string, targetId: string, position: 'before' | 'after') => void;
  moveTrackToOrder: (trackId: string, targetOrder: number) => void;

  addClip: (trackId: string, clip: Omit<Clip, 'id' | 'trackId' | 'generationStatus' | 'generationJobId' | 'cumulativeMixKey' | 'isolatedAudioKey' | 'waveformPeaks'>) => Clip;
  ensureMidiClip: (trackId: string, startTime?: number, duration?: number) => Clip;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  updateClipColor: (clipId: string, color: string | undefined) => void;
  updateClipColors: (clipIds: string[], color: string | undefined) => void;
  /** Toggle muted state on one or more clips. If any are active, mute all; if all muted, unmute all. */
  toggleClipMuted: (clipIds: string[]) => void;
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
  applyAudioQuantize: (clipId: string, options?: { gridDivision?: number; strength?: number; sensitivity?: number }) => void;
  /** Set all warp markers on a clip. */
  setWarpMarkers: (clipId: string, markers: AudioWarpMarker[]) => void;
  /** Add a single warp marker, maintaining sort order by originalTime. */
  addWarpMarker: (clipId: string, marker: AudioWarpMarker) => void;
  /** Remove a warp marker by index. */
  removeWarpMarker: (clipId: string, markerIndex: number) => void;
  /** Reset all warp/stretch state on a clip. */
  resetWarp: (clipId: string) => void;
  /** Stretch clip to fit a target duration in seconds (adjusts timeStretchRate). */
  stretchClipToFit: (clipId: string, targetDuration: number) => void;
  /** Create a crossfade between two overlapping clips on the same track. */
  createCrossfade: (clipAId: string, clipBId: string) => void;
  setClipGainEnvelope: (clipId: string, points: GainEnvelopePoint[]) => void;
  addClipGainPoint: (clipId: string, point: GainEnvelopePoint) => void;
  removeClipGainPoint: (clipId: string, pointIndex: number) => void;
  updateClipGainPoint: (clipId: string, pointIndex: number, updates: Partial<GainEnvelopePoint>) => void;

  /** Slip-edit: shift audioOffset by deltaSeconds without changing startTime/duration. */
  slipClip: (clipId: string, deltaSeconds: number) => void;
  sliceClipToRange: (clipId: string, startTime: number, endTime: number) => Promise<string | null>;
  splitClip: (clipId: string, splitTime: number) => void;
  splitClipAtZeroCrossing: (clipId: string, splitTime: number) => Promise<void>;
  snapClipEdgeToZeroCrossing: (clipId: string, edge: 'left' | 'right') => Promise<void>;
  consolidateClips: (trackId: string, clipIds: string[]) => Promise<Clip | undefined>;
  toggleClipStar: (clipId: string) => void;
  moveClipToTrack: (clipId: string, targetTrackId: string, startTime?: number) => void;
  duplicateClipToTrack: (clipId: string, targetTrackId: string, startTime?: number) => Clip | undefined;
  batchDuplicateClips: (clipIds: string[], timeOffset: number) => void;
  batchMoveClips: (clipIds: string[], timeOffset: number) => void;

  // Session View / clip launcher
  createSessionScene: (name?: string) => SessionScene | undefined;
  removeSessionScene: (sceneId: string) => void;
  assignClipToSessionSlot: (trackId: string, sceneId: string, clipId: string | null) => void;
  setSessionLaunchQuantization: (quantization: SessionLaunchQuantization) => void;
  launchSessionClip: (trackId: string, sceneId: string) => void;
  launchSessionScene: (sceneId: string) => void;
  stopSessionTrack: (trackId: string) => void;
  stopAllSessionClips: () => void;
  commitPendingSessionLaunches: (currentTime: number) => void;
  startSessionArrangementRecording: (startTime?: number) => void;
  stopSessionArrangementRecording: (endTime?: number) => Clip[];

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

  // Strudel actions
  updateStrudelCode: (trackId: string, code: string) => void;
  getStrudelCode: (trackId: string) => string | undefined;
  /** Evaluate pattern and return analysis info. Returns null if track not found or evaluation fails. */
  getStrudelPatternInfo: (trackId: string) => Promise<import('../engine/strudelEngine').StrudelPatternInfo | null>;
  /** Freeze/bounce strudel track audio to a new stems track with an audio clip. */
  freezeStrudelToAudio: (trackId: string, bars: number, onProgress?: (progress: number) => void) => Promise<Track>;
  /** Freeze strudel code into a piano roll track by evaluating the pattern without audio. */
  freezeStrudelToMidi: (trackId: string, bars?: number) => Promise<Track | null>;
  /** Freeze strudel percussion into a sequencer track and visible timeline clip. */
  freezeStrudelToDrumMachine: (trackId: string, bars?: number, stepsPerBar?: number) => Promise<Track | null>;
  /** Scaffold 4 coordinated strudel tracks from a genre template. */
  scaffoldStrudelArrangement: (genre: string) => Promise<string[]>;
  /** Convert a MIDI clip to Strudel code without mutating the source clip. */
  convertMidiClipToStrudel: (clipId: string, options?: Partial<StrudelFromMidiOptions>) => Promise<StrudelFromMidiResult | null>;
  /** Convert all MIDI clips on a track to Strudel code without mutating the source track. */
  convertMidiTrackToStrudel: (trackId: string, options?: Partial<StrudelFromMidiOptions>) => Promise<StrudelFromMidiResult | null>;
  /** Convert an uploaded .mid file to Strudel code without creating MIDI tracks. */
  convertMidiFileToStrudel: (file: File, options?: Partial<StrudelFromMidiOptions>) => Promise<StrudelFromMidiResult | null>;
  /** Write Strudel code into a target Strudel track, creating one if needed. */
  applyStrudelCodeToTrack: (code: string, targetTrackId?: string | null, options?: { label?: string; targetTrackMode?: StrudelFromMidiOptions['targetTrackMode'] }) => Promise<{ trackId: string } | null>;
  /** Capture current strudel code as a named version snapshot. */
  captureStrudelVersion: (trackId: string, label?: string) => void;
  /** Restore strudel code from a previously captured version. */
  restoreStrudelVersion: (trackId: string, versionIndex: number) => void;

  // Drum machine actions
  initDrumMachine: (trackId: string, kit?: DrumKitName) => void;
  setDrumPadSample: (trackId: string, padIndex: number, sampleKey: string) => void;
  setDrumPadVolume: (trackId: string, padIndex: number, volume: number) => void;
  setDrumPadPan: (trackId: string, padIndex: number, pan: number) => void;
  renameDrumPad: (trackId: string, padIndex: number, name: string) => void;
  setDrumMachineKit: (trackId: string, kit: DrumKitName) => void;
  addMidiNote: (clipId: string, note: Omit<MidiNote, 'id'> & { id?: string }) => string | undefined;
  updateMidiNote: (clipId: string, noteId: string, updates: Partial<MidiNote>) => void;
  resizeMidiNote: (clipId: string, noteId: string, input: {
    edge: 'left' | 'right';
    startBeat?: number;
    endBeat?: number;
    minDurationBeats?: number;
  }) => void;
  removeMidiNote: (clipId: string, noteId: string) => void;
  quantizeMidiNotes: (clipId: string, noteIds: string[], gridBeatsOrOptions: number | QuantizeOptions) => void;
  stampChord: (clipId: string, rootPitch: number, intervals: number[], startBeat: number, durationBeats: number, velocity?: number) => string[];
  populateMidiPattern: (clipId: string, options: PatternOptions) => string[];
  setMidiGrid: (clipId: string, grid: PianoRollGrid) => void;
  transformMidiNotes: (clipId: string, noteIds: string[], transform: TransformOptions) => void;
  addTrackEffect: (trackId: string, type: TrackEffectType) => string | undefined;
  updateTrackEffect: (trackId: string, effectId: string, updates: Partial<TrackEffect>) => void;
  removeTrackEffect: (trackId: string, effectId: string) => void;
  reorderTrackEffect: (trackId: string, fromIndex: number, toIndex: number) => void;
  setSidechainSource: (trackId: string, effectId: string, sourceTrackId: string | undefined) => void;

  // WAP Plugins
  addPlugin: (trackId: string, plugin: PluginInstance) => void;
  removePlugin: (trackId: string, pluginInstanceId: string) => void;
  updatePluginParam: (trackId: string, pluginInstanceId: string, paramId: string, value: PluginParamValue) => void;
  togglePlugin: (trackId: string, pluginInstanceId: string) => void;
  loadPlugin: (trackId: string, pluginId: string) => string | undefined;

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
  removeGroupTrack: (groupId: string) => void;
  setGroupMuted: (groupId: string, muted: boolean) => void;
  setGroupSoloed: (groupId: string, soloed: boolean) => void;
  getVisibleTracks: () => Track[];

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
  addTake: (clipId: string, audioKey: string, waveformPeaks?: number[]) => void;
  selectTake: (clipId: string, takeId: string) => void;
  toggleTakeLanes: (trackId: string) => void;
  promoteTake: (clipId: string, takeId: string) => void;
  deleteTake: (clipId: string, takeId: string) => void;
  flattenComp: (clipId: string) => void;

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

  // Project templates
  /** Save current project as a reusable template (strips clips/audio, keeps track layout & settings). */
  saveProjectAsTemplate: (name: string, description?: string) => ProjectTemplate;
  /** Create a new project from a template. */
  createProjectFromTemplate: (template: ProjectTemplate, projectName?: string) => void;
  exportMidiClip: (clipId: string) => void;
  /** Export all MIDI clips from a track merged into a single .mid file. */
  exportTrackMidi: (trackId: string) => void;
  /** Export all MIDI tracks as a multi-track .mid file for sharing with other DAWs. */
  exportProjectMidi: () => void;
  /** Import a .mid file, creating piano roll tracks for each MIDI track/channel. */
  importMidiFile: (file: File, options?: { startTime?: number; applyMetadata?: boolean }) => Promise<string[]>;

  // Groove pool
  extractGrooveFromClip: (clipId: string, name: string, options: ExtractGrooveOptions) => GrooveTemplate | undefined;
  applyGrooveToClip: (clipId: string, noteIds: string[], grooveId: string, options: ApplyGrooveOptions) => void;
  addGrooveTemplate: (template: GrooveTemplate) => void;
  deleteGrooveTemplate: (grooveId: string) => void;
  renameGrooveTemplate: (grooveId: string, name: string) => void;
  /** Capture retroactive MIDI from a rolling buffer into a new clip on the given track. */
  captureMidi: (
    trackId: string,
    captureTime: number,
    captureService: MidiCaptureService,
    options?: { bars?: number; quantize?: PianoRollGrid },
  ) => string | undefined;
}

function computeTotalDuration(
  tracks: Track[],
  measures?: number,
  bpm?: number,
  timeSig?: number,
  timeSigDenominator?: number,
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
  const effectiveTimeSigDenominator = timeSigDenominator ?? 4;
  const effectiveMeasures = measures ?? DEFAULT_MEASURES;
  let measuredDuration: number;
  if ((tempoMap && tempoMap.length > 0) || (timeSignatureMap && timeSignatureMap.length > 0)) {
    const totalBeats = getBeatAtBar(effectiveMeasures + 1, timeSignatureMap, effectiveTimeSig, effectiveTimeSigDenominator);
    measuredDuration = beatToTime(totalBeats, tempoMap, effectiveBpm);
  } else {
    const barDur = getBarDurationSec(effectiveBpm, effectiveTimeSig, effectiveTimeSigDenominator);
    measuredDuration = effectiveMeasures * barDur;
  }
  return Math.max(measuredDuration, maxEnd + TIMELINE_PADDING);
}

function buildBouncedClip(trackId: string, input: {
  startTime: number;
  duration: number;
  audioKey: string;
  waveformPeaks: number[];
  prompt?: string;
}): Clip {
  return {
    id: uuidv4(),
    trackId,
    startTime: input.startTime,
    duration: input.duration,
    prompt: input.prompt ?? '',
    globalCaption: '',
    lyrics: '',
    generationStatus: 'ready',
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: input.audioKey,
    waveformPeaks: input.waveformPeaks,
    audioDuration: input.duration,
    source: 'generated',
    starred: false,
  };
}

function createNeutralBouncedTrack(track: Track, bouncedClip: Clip, displayName: string): Track {
  return {
    ...track,
    trackName: 'custom',
    trackType: 'sample',
    displayName,
    volume: 1,
    muted: false,
    soloed: false,
    armed: false,
    clips: [bouncedClip],
    sequencerPattern: undefined,
    synthPreset: undefined,
    sampler: undefined,
    samplerConfig: undefined,
    effects: [],
    midiEffects: [],
    drumMachine: undefined,
    frozen: false,
    frozenAudioKey: undefined,
    pan: 0,
    panMode: 'stereo',
    panLeft: undefined,
    panRight: undefined,
    eqLowGain: 0,
    eqMidGain: 0,
    eqHighGain: 0,
    compressorEnabled: false,
    compressorThreshold: -24,
    compressorRatio: 4,
    effectsBypassed: false,
    reverbMix: 0,
    reverbRoomSize: 0.5,
    plugins: [],
  };
}

const DEFAULT_SESSION_SCENE_COUNT = 4;
const SESSION_LAUNCH_EPSILON = 0.0001;

function createSessionScene(index: number): SessionScene {
  return {
    id: uuidv4(),
    name: `Scene ${index + 1}`,
    index,
  };
}

function createDefaultSessionState(): SessionState {
  return {
    quantization: '1 bar',
    scenes: Array.from({ length: DEFAULT_SESSION_SCENE_COUNT }, (_, index) => createSessionScene(index)),
    slots: [],
    activeClipIdsByTrackId: {},
    pendingLaunches: [],
    isRecordingToArrangement: false,
    arrangementRecordStartTime: null,
    arrangementRecordEndTime: null,
    recordedLaunches: [],
    lastLaunchedSceneId: null,
    lastLaunchAt: null,
  };
}

function getSessionQuantizationSeconds(project: Project, quantization: SessionLaunchQuantization): number {
  const beatDuration = 60 / Math.max(1, project.bpm);
  switch (quantization) {
    case 'none':
      return 0;
    case '1/8':
      return beatDuration / 2;
    case '1/4':
      return beatDuration;
    case '1/2':
      return beatDuration * 2;
    case '1 bar':
      return beatDuration * project.timeSignature;
  }
}

function getQuantizedLaunchTime(currentTime: number, stepSeconds: number): number {
  if (stepSeconds <= 0) return currentTime;
  const steps = Math.ceil((currentTime - SESSION_LAUNCH_EPSILON) / stepSeconds);
  return Math.max(0, steps * stepSeconds);
}

function ensureSessionSlotsForTrack(session: SessionState, trackId: string): SessionState {
  const nextSlots = [...session.slots];
  let changed = false;
  for (const scene of session.scenes) {
    const exists = nextSlots.some((slot) => slot.trackId === trackId && slot.sceneId === scene.id);
    if (!exists) {
      nextSlots.push({ id: uuidv4(), trackId, sceneId: scene.id, clipId: null });
      changed = true;
    }
  }
  if (!changed) return session;
  return { ...session, slots: nextSlots };
}

function ensureProjectSession(project: Project): Project {
  const measures = DEFAULT_MEASURES;
  let session = project.session ?? createDefaultSessionState();

  session = {
    ...session,
    scenes: [...session.scenes]
      .sort((a, b) => a.index - b.index)
      .map((scene, index) => ({ ...scene, index })),
  };

  for (const track of project.tracks) {
    session = ensureSessionSlotsForTrack(session, track.id);
  }

  const trackIds = new Set(project.tracks.map((track) => track.id));
  const clipIds = new Set(project.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const sceneIds = new Set(session.scenes.map((scene) => scene.id));

  session = {
    ...session,
    slots: session.slots.filter((slot) => trackIds.has(slot.trackId) && sceneIds.has(slot.sceneId) && (slot.clipId === null || clipIds.has(slot.clipId))),
    activeClipIdsByTrackId: Object.fromEntries(
      Object.entries(session.activeClipIdsByTrackId).filter(([trackId, clipId]) => (
        trackIds.has(trackId) && (clipId === null || clipIds.has(clipId))
      )),
    ),
    pendingLaunches: session.pendingLaunches.filter((launch) => (
      (launch.trackId === undefined || trackIds.has(launch.trackId))
      && (launch.sceneId === undefined || sceneIds.has(launch.sceneId))
      && (launch.clipId === undefined || launch.clipId === null || clipIds.has(launch.clipId))
    )),
    recordedLaunches: session.recordedLaunches.filter((launch) => (
      trackIds.has(launch.trackId) && (launch.clipId === null || clipIds.has(launch.clipId))
    )),
  };

  return {
    ...project,
    measures,
    totalDuration: computeTotalDuration(
      project.tracks,
      measures,
      project.bpm,
      project.timeSignature,
      project.timeSignatureDenominator,
      project.tempoMap,
      project.timeSignatureMap,
    ),
    playbackLatency: ensurePlaybackLatencySettings(project.playbackLatency),
    session,
  };
}

function autoAssignClipToSession(session: SessionState, trackId: string, clipId: string): SessionState {
  const normalized = ensureSessionSlotsForTrack(session, trackId);
  if (normalized.slots.some((slot) => slot.trackId === trackId && slot.clipId === clipId)) {
    return normalized;
  }

  const emptySlot = normalized.slots
    .filter((slot) => slot.trackId === trackId && slot.clipId === null)
    .sort((a, b) => {
      const sceneA = normalized.scenes.find((scene) => scene.id === a.sceneId)?.index ?? 0;
      const sceneB = normalized.scenes.find((scene) => scene.id === b.sceneId)?.index ?? 0;
      return sceneA - sceneB;
    })[0];

  if (emptySlot) {
    return {
      ...normalized,
      slots: normalized.slots.map((slot) => (
        slot.id === emptySlot.id ? { ...slot, clipId } : slot
      )),
    };
  }

  const newScene = createSessionScene(normalized.scenes.length);
  const expanded = {
    ...normalized,
    scenes: [...normalized.scenes, newScene],
  };

  return {
    ...ensureSessionSlotsForTrack(expanded, trackId),
    slots: ensureSessionSlotsForTrack(expanded, trackId).slots.map((slot) => (
      slot.trackId === trackId && slot.sceneId === newScene.id ? { ...slot, clipId } : slot
    )),
  };
}

function replaceSessionSlotClip(session: SessionState, trackId: string, sceneId: string, clipId: string | null): SessionState {
  const normalized = ensureSessionSlotsForTrack(session, trackId);
  return {
    ...normalized,
    slots: normalized.slots.map((slot) => (
      slot.trackId === trackId && slot.sceneId === sceneId ? { ...slot, clipId } : slot
    )),
  };
}

function cloneClipForArrangement(sourceClip: Clip, startTime: number, duration: number): Clip {
  const nextDuration = Math.max(SESSION_LAUNCH_EPSILON, Math.min(duration, sourceClip.duration));
  return {
    ...structuredClone(sourceClip),
    id: uuidv4(),
    startTime,
    duration: nextDuration,
    trackId: sourceClip.trackId,
  };
}

function closeOpenSessionLaunches(events: SessionLaunchEvent[], trackId: string, endedAt: number): SessionLaunchEvent[] {
  return events.map((event) => (
    event.trackId === trackId && event.endedAt === null && event.startedAt <= endedAt
      ? { ...event, endedAt }
      : event
  ));
}

function applySessionTrackLaunch(
  project: Project,
  trackId: string,
  clipId: string | null,
  executedAt: number,
  source: SessionLaunchEvent['source'],
  sceneId: string | null = null,
): Project {
  const session = ensureProjectSession(project).session!;
  const nextEvents = closeOpenSessionLaunches(session.recordedLaunches, trackId, executedAt);
  const nextRecordedLaunches = session.isRecordingToArrangement && clipId
    ? [
        ...nextEvents,
        {
          id: uuidv4(),
          trackId,
          clipId,
          startedAt: executedAt,
          endedAt: null,
          sceneId,
          source,
        },
      ]
    : nextEvents;

  return {
    ...project,
    session: {
      ...session,
      activeClipIdsByTrackId: {
        ...session.activeClipIdsByTrackId,
        [trackId]: clipId,
      },
      recordedLaunches: nextRecordedLaunches,
      lastLaunchAt: executedAt,
      lastLaunchedSceneId: source === 'scene' ? sceneId : session.lastLaunchedSceneId,
    },
  };
}

function queuePendingSessionLaunch(
  session: SessionState,
  launch: Omit<SessionPendingLaunch, 'id' | 'requestedAt'>,
): SessionState {
  const nextLaunch: SessionPendingLaunch = {
    id: uuidv4(),
    requestedAt: Date.now(),
    ...launch,
  };

  if (launch.type === 'scene' || launch.type === 'stop-all') {
    return {
      ...session,
      pendingLaunches: [nextLaunch],
    };
  }

  return {
    ...session,
    pendingLaunches: [
      ...session.pendingLaunches.filter((candidate) => (
        candidate.type !== 'scene'
        && candidate.type !== 'stop-all'
        && candidate.trackId !== launch.trackId
      )),
      nextLaunch,
    ],
  };
}

function buildArrangementClipsFromSession(project: Project, endTime: number): Clip[] {
  const session = ensureProjectSession(project).session!;
  const finalizedEvents = session.recordedLaunches
    .map((event) => ({
      ...event,
      endedAt: event.endedAt ?? endTime,
    }))
    .filter((event) => event.clipId && event.endedAt > event.startedAt + SESSION_LAUNCH_EPSILON);

  const clipIndex = new Map(project.tracks.flatMap((track) => track.clips.map((clip) => [clip.id, clip] as const)));

  return finalizedEvents.flatMap((event) => {
    const sourceClip = event.clipId ? clipIndex.get(event.clipId) : undefined;
    if (!sourceClip) return [];
    return [cloneClipForArrangement(sourceClip, event.startedAt, event.endedAt - event.startedAt)];
  });
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
    case 'chorus':
      return {
        id,
        type,
        enabled: true,
        params: { frequency: 1.5, delayTime: 3.5, depth: 0.7, feedback: 0, wet: 0.5 },
      };
    case 'flanger':
      return {
        id,
        type,
        enabled: true,
        params: { frequency: 0.5, delayTime: 3, depth: 0.7, feedback: 0.5, wet: 0.5 },
      };
    case 'phaser':
      return {
        id,
        type,
        enabled: true,
        params: { frequency: 0.5, octaves: 3, stages: 10, Q: 10, baseFrequency: 350, wet: 0.5 },
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

function createDefaultSamplerSettings(overrides?: Partial<SamplerSettings>): SamplerSettings {
  return {
    rootNote: 60,
    ...overrides,
  };
}

function createDefaultSamplerConfig(audioKey: string, overrides?: Partial<SamplerConfig>): SamplerConfig {
  const sampleDuration = Math.max(0.01, overrides?.trimEnd ?? overrides?.loopEnd ?? 1);
  const trimStart = Math.max(0, Math.min(overrides?.trimStart ?? 0, sampleDuration - 0.01));
  const trimEnd = Math.max(trimStart + 0.01, Math.min(overrides?.trimEnd ?? sampleDuration, sampleDuration));
  const loopStart = Math.max(trimStart, Math.min(overrides?.loopStart ?? trimStart, trimEnd - 0.01));
  const loopEnd = Math.max(loopStart + 0.01, Math.min(overrides?.loopEnd ?? trimEnd, trimEnd));
  return {
    audioKey,
    rootNote: 60,
    trimStart,
    trimEnd,
    playbackMode: 'classic',
    loopStart,
    loopEnd,
    attack: 0.005,
    decay: 0.1,
    sustain: 1,
    release: 0.3,
    ...overrides,
  };
}

function syncSamplerState(
  track: Track,
  updates: {
    sampler?: SamplerSettings | undefined;
    samplerConfig?: SamplerConfig | undefined;
  },
): Pick<Track, 'sampler' | 'samplerConfig'> {
  const nextSampler = updates.sampler ?? track.sampler;
  const nextConfig = updates.samplerConfig ?? track.samplerConfig;

  if (nextConfig) {
    return {
      sampler: createDefaultSamplerSettings({
        ...(nextSampler ?? {}),
        audioKey: nextConfig.audioKey,
        rootNote: nextConfig.rootNote,
        sampleDuration: nextSampler?.sampleDuration ?? nextConfig.trimEnd,
      }),
      samplerConfig: createDefaultSamplerConfig(nextConfig.audioKey, nextConfig),
    };
  }

  if (nextSampler?.audioKey) {
    return {
      sampler: createDefaultSamplerSettings(nextSampler),
      samplerConfig: createDefaultSamplerConfig(nextSampler.audioKey, {
        rootNote: nextSampler.rootNote,
        trimEnd: nextSampler.sampleDuration,
        loopEnd: nextSampler.sampleDuration,
      }),
    };
  }

  return {
    sampler: nextSampler ? createDefaultSamplerSettings(nextSampler) : undefined,
    samplerConfig: undefined,
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

function buildUniqueTrackName(existingTracks: Track[], baseName: string): string {
  const trimmedBaseName = baseName.trim() || 'Bounce';
  let candidate = trimmedBaseName;
  let suffix = 2;

  while (existingTracks.some((track) => track.displayName === candidate)) {
    candidate = `${trimmedBaseName} ${suffix}`;
    suffix += 1;
  }

  return candidate;
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
  const autoDisplayName = buildTrackDisplayName(existingTracks, trackName);
  const {
    id: _ignoredId,
    trackType: _ignoredTrackType,
    trackName: _ignoredTrackName,
    displayName: overrideDisplayName,
    order: overrideOrder,
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
    displayName: overrideDisplayName || autoDisplayName,
    order: overrideOrder ?? maxOrder + 1,
    muted: false,
    soloed: false,
    clips: [],
    effects: cloneTrackEffectsWithNewIds(presetEffects),
    effectsBypassed: overrides?.effectsBypassed ?? false,
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

  if (track.trackType === 'strudel') {
    track.strudelCode = track.strudelCode ?? '// Strudel Pattern — press Cmd+Enter (Mac) or Ctrl+Enter to play\n// Docs: https://strudel.cc/workshop/getting-started\nnote("[c3 [e3 g3]]*2").sound("sawtooth").lpf(800)';
    track.strudelCycleLength = track.strudelCycleLength ?? 1;
    track.color = '#e67e22'; // Strudel orange
    if (!overrideDisplayName) {
      const strudelCount = existingTracks.filter((t) => t.trackType === 'strudel').length;
      track.displayName = strudelCount === 0 ? 'Strudel' : `Strudel ${strudelCount + 1}`;
    }
  }

  Object.assign(track, syncSamplerState(track, {}));
  return track;
}

function buildTrackOrderMapForMove(
  tracks: Track[],
  movedTrackId: string,
  requestedOrder: number,
): Map<string, number> {
  const normalizedOrder = Math.max(1, Math.floor(requestedOrder));
  const originalSortedTrackIds = [...tracks]
    .sort((a, b) => a.order - b.order)
    .map((track) => track.id);
  const originalIndexByTrackId = new Map(originalSortedTrackIds.map((trackId, index) => [trackId, index]));
  const items = tracks.map((track) => ({
    track,
    requestedOrder: track.id === movedTrackId
      ? normalizedOrder
      : Math.max(1, Math.floor(track.order) || 1),
    isMovedTrack: track.id === movedTrackId,
    originalIndex: originalIndexByTrackId.get(track.id) ?? Number.MAX_SAFE_INTEGER,
  }));

  items.sort((a, b) => {
    if (a.requestedOrder !== b.requestedOrder) {
      return a.requestedOrder - b.requestedOrder;
    }
    if (a.isMovedTrack !== b.isMovedTrack) {
      return a.isMovedTrack ? -1 : 1;
    }
    return a.originalIndex - b.originalIndex;
  });

  const orderMap = new Map<string, number>();
  let nextAvailableOrder = 1;

  for (const item of items) {
    const resolvedOrder = Math.max(item.requestedOrder, nextAvailableOrder);
    orderMap.set(item.track.id, resolvedOrder);
    nextAvailableOrder = resolvedOrder + 1;
  }

  return orderMap;
}

function createTrackPresetSnapshot(track: Track, name: string): TrackPreset {
  const settings: TrackPresetSettings = {
    color: track.color,
    volume: track.volume,
    laneHeight: track.laneHeight,
    synthPreset: track.synthPreset,
    sampler: track.sampler ? createDefaultSamplerSettings(track.sampler) : undefined,
    samplerConfig: track.samplerConfig ? createDefaultSamplerConfig(track.samplerConfig.audioKey, track.samplerConfig) : undefined,
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
    effectsBypassed: track.effectsBypassed ?? false,
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
  // Fix persisted tracks where trackName was incorrectly set to a TrackType value (e.g. 'strudel')
  const fixedTrackName: TrackName = (track.trackName in TRACK_CATALOG) ? track.trackName : 'custom';
  const normalizedTrack: Track = {
    ...track,
    trackName: fixedTrackName,
    synthPreset: track.synthPreset ?? getDefaultTrackSynthPreset(track.trackName),
    effects: track.effects ?? [],
    effectsBypassed: track.effectsBypassed ?? false,
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

  return {
    ...normalizedTrack,
    ...syncSamplerState(normalizedTrack, {}),
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

function detectPlaybackLatencyFromEngine() {
  const engine =
    'getExistingAudioEngine' in audioEngineHooks
      ? audioEngineHooks.getExistingAudioEngine?.() ?? null
      : null;
  if (!engine) return createDefaultPlaybackLatencySettings();
  return detectPlaybackLatencySettings(undefined, {
    baseLatency: engine.ctx.baseLatency,
    outputLatency: engine.ctx.outputLatency,
  });
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
  project: null,

  setProject: (project) => {
    _clearHistory();
    // Migration: backfill trackType for projects created before the field existed
    const migratedBase: Project = {
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
      playbackLatency:
        project.playbackLatency
          ? normalizePlaybackLatencySettings(project.playbackLatency)
          : detectPlaybackLatencyFromEngine(),
    };
    set({ project: ensureProjectSession(migratedBase) });
  },

  undo: (scope, target) => {
    const state = get();
    const resolved = _resolveHistoryBucket(_history, scope, target);
    if (!resolved) return;
    const prev = resolved.bucket.pop()!;
    const futureBucket = _ensureHistoryBucket(_future, resolved.scope, prev).bucket;
    if (state.project) {
      futureBucket.push({
        ...prev,
        id: uuidv4(),
        timestamp: Date.now(),
        order: ++_historyOrder,
        snapshot: structuredClone(state.project),
      });
    }
    set({ project: _applyHistorySnapshot(state.project, prev.snapshot, prev) });
  },

  redo: (scope, target) => {
    const state = get();
    const resolved = _resolveHistoryBucket(_future, scope, target);
    if (!resolved) return;
    const next = resolved.bucket.pop()!;
    if (state.project) {
      const historyBucket = _ensureHistoryBucket(_history, resolved.scope, next).bucket;
      historyBucket.push({
        ...next,
        id: uuidv4(),
        timestamp: Date.now(),
        order: ++_historyOrder,
        snapshot: structuredClone(state.project),
      });
      _trimHistory(historyBucket);
    }
    set({ project: _applyHistorySnapshot(state.project, next.snapshot, next) });
  },

  getUndoHistory: (scope, target) => _getHistoryEntries(_history, scope, target),

  getRedoHistory: (scope, target) => _getHistoryEntries(_future, scope, target),

  jumpToHistoryEntry: (entryId, scope, target) => {
    const state = get();
    const resolved = (() => {
      if (scope && (target?.trackId || target?.clipId)) {
        const match = _getHistoryBucket(_history, scope, target);
        if (!match) return null;
        return { scope, key: match.key, bucket: match.bucket };
      }
      for (const candidateScope of scope ? [scope] : HISTORY_SCOPES) {
        for (const [key, bucket] of Object.entries(_history[candidateScope])) {
          if (bucket.some((entry) => entry.id === entryId)) {
            return { scope: candidateScope, key, bucket };
          }
        }
      }
      return null;
    })();
    if (!resolved) return;
    const idx = resolved.bucket.findIndex((entry) => entry.id === entryId);
    if (idx === -1) return;

    const destination = resolved.bucket[idx];
    const futureBucket = _ensureHistoryBucket(_future, resolved.scope, destination).bucket;
    if (state.project) {
      futureBucket.push({
        ...destination,
        id: uuidv4(),
        timestamp: Date.now(),
        order: ++_historyOrder,
        snapshot: structuredClone(state.project),
      });
    }
    for (let pointer = resolved.bucket.length - 1; pointer > idx; pointer -= 1) {
      const entry = resolved.bucket[pointer];
      futureBucket.push({
        ...entry,
        id: uuidv4(),
        timestamp: Date.now(),
        order: ++_historyOrder,
      });
    }
    resolved.bucket.splice(idx);
    set({ project: _applyHistorySnapshot(state.project, destination.snapshot, destination) });
  },

  beginDrag: (options) => {
    const state = get();
    _beginDrag(state.project, options);
  },

  endDrag: () => {
    _endDrag();
  },

  createProject: (params) => {
    _clearHistory();
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
      timeSignatureDenominator: 4,
      totalDuration: measures * getBarDurationSec(bpm, timeSig, 4),
      measures,
      tracks: [],
      trackPresets: [],
      generationDefaults: { ...DEFAULT_GENERATION },
      globalCaption: '',
      mastering: createDefaultMasteringState(),
      playbackLatency: detectPlaybackLatencyFromEngine(),
      session: createDefaultSessionState(),
    };
    set({ project: ensureProjectSession(project) });
  },

  updateProject: (updates) => {
    const state = get();
    if (_isViewerMode()) return;
    if (!state.project) return;
    _pushHistory(state.project, { scope: 'arrangement', label: 'Update project settings' });
    const merged = {
      ...state.project,
      ...updates,
      measures: DEFAULT_MEASURES,
      updatedAt: Date.now(),
    };
    // Recompute totalDuration when project timing settings change.
    if ('measures' in updates || 'bpm' in updates || 'timeSignature' in updates || 'timeSignatureDenominator' in updates) {
      merged.totalDuration = computeTotalDuration(
        merged.tracks,
        merged.measures,
        merged.bpm,
        merged.timeSignature,
        merged.timeSignatureDenominator,
        merged.tempoMap,
        merged.timeSignatureMap,
      );
    }
    set({ project: merged });
  },

  detectPlaybackLatency: (latency) => {
    const state = get();
    if (!state.project) return;
    const nextPlaybackLatency = detectPlaybackLatencySettings(state.project.playbackLatency, latency);
    const currentPlaybackLatency = normalizePlaybackLatencySettings(state.project.playbackLatency);

    if (
      nextPlaybackLatency.detectedBaseLatencyMs === currentPlaybackLatency.detectedBaseLatencyMs
      && nextPlaybackLatency.detectedOutputLatencyMs === currentPlaybackLatency.detectedOutputLatencyMs
      && nextPlaybackLatency.detectedLatencyMs === currentPlaybackLatency.detectedLatencyMs
      && nextPlaybackLatency.manualOverrideMs === currentPlaybackLatency.manualOverrideMs
      && nextPlaybackLatency.compensationMs === currentPlaybackLatency.compensationMs
      && nextPlaybackLatency.source === currentPlaybackLatency.source
      && nextPlaybackLatency.browserSupport === currentPlaybackLatency.browserSupport
    ) {
      return;
    }
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        playbackLatency: nextPlaybackLatency,
      },
    });
  },

  capturePlaybackLatency: (latency) => {
    get().detectPlaybackLatency(latency);
  },

  setPlaybackLatencyOverride: (latencyMs) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project, { scope: 'arrangement', label: 'Adjust playback latency' });
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        playbackLatency: setPlaybackLatencyOverrideSettings(state.project.playbackLatency, latencyMs),
      },
    });
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

    _pushHistory(latestState.project, { scope: 'mixer', label: 'Analyze mastering' });
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
    _pushHistory(state.project, { scope: 'mixer', label: 'Set mastering preset' });
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
    _pushHistory(state.project, { scope: 'mixer', label: 'Set loudness target' });
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
    _pushHistory(state.project, { scope: 'mixer', label: 'Toggle mastering preview' });
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
    _pushHistory(state.project, { scope: 'mixer', label: enabled ? 'Enable mastering' : 'Disable mastering' });
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
    _pushHistory(state.project, { scope: 'mixer', label: 'Remove mastering' });
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
    if (_isViewerMode()) return;
    if (!state.project) return;
    _pushHistory(state.project, { scope: 'mixer', label: 'Adjust mixer', trackId });
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

  toggleTrackEffectsBypass: (trackId) => {
    const state = get();
    if (_isViewerMode()) return;
    if (!state.project) return;
    _pushHistory(state.project, { scope: 'mixer', label: 'Toggle FX bypass', trackId });
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) =>
          track.id === trackId
            ? { ...track, effectsBypassed: !(track.effectsBypassed ?? false) }
            : track,
        ),
      },
    });
  },

  setPanMode: (trackId, mode) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project, { scope: 'mixer', label: 'Set pan mode', trackId });
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
    _pushHistory(state.project, { scope: 'mixer', label: 'Adjust dual mono pan', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Edit track caption', trackId });
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
    _pushHistory(state.project, { scope: 'mixer', label: 'Adjust reverb send', trackId });
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
    _pushHistory(state.project, { scope: 'mixer', label: 'Add audio effect', trackId });
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
    _pushHistory(state.project, { scope: 'mixer', label: 'Edit audio effect', trackId });
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
    _pushHistory(state.project, { scope: 'mixer', label: 'Remove audio effect', trackId });

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
                sampler: undefined,
                clips: [newClip],
              }
            : t,
        ),
      },
    });
  },

  bounceInPlace: async (trackId, options) => {
    const state = get();
    if (!state.project) {
      throw new Error('No project');
    }

    const track = state.project.tracks.find((candidate) => candidate.id === trackId);
    if (!track) {
      throw new Error(`Track '${trackId}' not found`);
    }

    const resolvedOptions: BounceInPlaceOptions = {
      includeEffects: true,
      includeAutomation: true,
      normalize: false,
      replaceOriginal: true,
      ...options,
    };

    const bounced = await bounceTrackToAudioAsset(state.project, track, resolvedOptions);
    const latest = get();
    if (!latest.project) return;

    const latestTrack = latest.project.tracks.find((candidate) => candidate.id === trackId);
    if (!latestTrack) {
      throw new Error(`Track '${trackId}' not found`);
    }

    _pushHistory(latest.project, {
      scope: 'arrangement',
      label: resolvedOptions.replaceOriginal ? 'Bounce track in place' : 'Create bounced audio track',
      trackId,
    });

    const bouncedClip = buildBouncedClip(trackId, {
      startTime: bounced.startTime,
      duration: bounced.duration,
      audioKey: bounced.audioKey,
      waveformPeaks: bounced.waveformPeaks,
      prompt: `${latestTrack.displayName} Bounce`,
    });

    const assetEntry = {
      id: uuidv4(),
      clipId: bouncedClip.id,
      trackDisplayName: latestTrack.displayName,
      prompt: bouncedClip.prompt,
      source: 'uploaded' as const,
      isolatedAudioKey: bounced.audioKey,
      cumulativeMixKey: null,
      waveformPeaks: bounced.waveformPeaks,
      starred: false,
      createdAt: Date.now(),
      duration: bounced.duration,
    };

    let nextTracks: Track[];
    let nextAutomationLanes = latest.project.automationLanes ?? [];
    let assets = [...(latest.project.assets ?? [])];
    let resultClip: Clip = bouncedClip;

    if (resolvedOptions.replaceOriginal) {
      nextTracks = latest.project.tracks.map((candidate) =>
        candidate.id === trackId
          ? createNeutralBouncedTrack(candidate, bouncedClip, candidate.displayName)
          : candidate,
      );
      nextAutomationLanes = nextAutomationLanes.filter((lane) => lane.trackId !== trackId);
      assets.push(assetEntry);
      toastSuccess(`Bounced ${latestTrack.displayName} in place`);
    } else {
      const sourceIndex = latest.project.tracks.findIndex((candidate) => candidate.id === trackId);
      const insertedTrackId = uuidv4();
      const insertedClip = { ...bouncedClip, id: uuidv4(), trackId: insertedTrackId };
      const bouncedTrack = createNeutralBouncedTrack(
        {
          ...latestTrack,
          id: insertedTrackId,
        },
        insertedClip,
        `${latestTrack.displayName} Bounce`,
      );

      nextTracks = [...latest.project.tracks];
      nextTracks.splice(sourceIndex + 1, 0, bouncedTrack);
      resultClip = insertedClip;
      assets.push({
        ...assetEntry,
        clipId: insertedClip.id,
        trackDisplayName: bouncedTrack.displayName,
      });
      toastSuccess(`Created bounced audio track for ${latestTrack.displayName}`);
    }

    nextTracks = nextTracks.map((candidate, index) => ({ ...candidate, order: index }));

    set({
      project: {
        ...latest.project,
        updatedAt: Date.now(),
        automationLanes: nextAutomationLanes,
        tracks: nextTracks,
        totalDuration: computeTotalDuration(
          nextTracks,
          latest.project.measures,
          latest.project.bpm,
          latest.project.timeSignature,
          latest.project.timeSignatureDenominator,
          latest.project.tempoMap,
          latest.project.timeSignatureMap,
        ),
        assets,
      },
    });

    return resultClip;
  },

  addTrack: (trackName, trackType, options) => {
    const state = get();
    if (_isViewerMode()) return undefined as unknown as Track;
    if (!state.project) throw new Error('No project');
    if (state.project.tracks.length >= MAX_PROJECT_TRACKS) {
      toastError(`Track limit reached (${MAX_PROJECT_TRACKS} max)`);
      return undefined as unknown as Track;
    }
    _pushHistory(state.project, { scope: 'arrangement', label: 'Add track' });

    // Handle case where trackName is actually a TrackType (e.g. addTrack('strudel'))
    const isTrackType = trackName in TRACK_TYPE_CATALOG && !(trackName in TRACK_CATALOG);
    const resolvedName: TrackName = isTrackType ? 'custom' : trackName as TrackName;
    const resolvedType: TrackType = trackType ?? (isTrackType ? (trackName as TrackType) : (trackName === 'custom' ? 'sample' : 'stems'));
    const track = createTrackFromTemplate(
      state.project.tracks,
      resolvedName,
      resolvedType,
      options?.order !== undefined ? { order: options.order } : undefined,
    );

    const newTracks = [...state.project.tracks, track];
    const nextProject = ensureProjectSession({
      ...state.project,
      updatedAt: Date.now(),
      totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.timeSignatureDenominator, state.project.tempoMap, state.project.timeSignatureMap),
      tracks: newTracks,
    });
    set({
      project: nextProject,
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
    _pushHistory(state.project, { scope: 'mixer', label: 'Reorder audio effects', trackId });
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

    _pushHistory(state.project, { scope: 'track', label: 'Apply track preset' });
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
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.timeSignatureDenominator),
        tracks: newTracks,
      },
    });
    return track;
  },

  createQuickSamplerTrack: (input) => {
    const state = get();
    if (!state.project) return undefined;

    const rootNote = input.rootNote ?? 60;
    const sampleDuration = Math.max(0.01, input.sampleDuration ?? 1);
    const sampler = createDefaultSamplerSettings({
      audioKey: input.audioKey,
      sampleName: input.sampleName,
      rootNote,
      sampleDuration,
    });
    const samplerConfig = createDefaultSamplerConfig(input.audioKey, {
      rootNote,
      trimEnd: sampleDuration,
      loopEnd: sampleDuration,
    });

    _pushHistory(state.project);

    if (input.trackId) {
      let updatedTrack: Track | undefined;
      const tracks = state.project.tracks.map((candidate) => {
        if (candidate.id !== input.trackId) return candidate;
        updatedTrack = {
          ...candidate,
          trackType: 'pianoRoll',
          synthPreset: 'sampler',
          displayName: input.sampleName || 'Quick Sampler',
          ...syncSamplerState(candidate, { sampler, samplerConfig }),
        };
        return updatedTrack;
      });
      if (!updatedTrack) return undefined;
      set({
        project: {
          ...state.project,
          updatedAt: Date.now(),
          tracks,
        },
      });
      return updatedTrack;
    }

    const track = createTrackFromTemplate(
      state.project.tracks,
      'keyboard',
      'pianoRoll',
      {
        synthPreset: 'sampler',
        sampler,
        samplerConfig,
      },
    );
    track.displayName = input.sampleName || 'Quick Sampler';

    const newTracks = [...state.project.tracks, track];
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.timeSignatureDenominator),
        tracks: newTracks,
      },
    });
    return track;
  },

  createQuickSamplerFromClip: (trackId, clipId) => {
    const state = get();
    if (!state.project) return undefined;

    const sourceTrack = state.project.tracks.find((t) => t.id === trackId);
    if (!sourceTrack) return undefined;

    const clip = sourceTrack.clips.find((c) => c.id === clipId);
    if (!clip) return undefined;

    const audioKey = clip.isolatedAudioKey ?? clip.cumulativeMixKey;
    if (!audioKey) return undefined;

    const sampleDuration = clip.audioDuration ?? clip.duration;
    const sampleName = clip.prompt?.replace(/^Imported:\s*/, '') || sourceTrack.displayName;

    return get().createQuickSamplerTrack({
      audioKey,
      sampleName,
      sampleDuration,
    });
  },

  createQuickSamplerFromAsset: (assetId, options) => {
    const state = get();
    if (!state.project) return undefined;
    const asset = (state.project.assets ?? []).find((a) => a.id === assetId);
    if (!asset) return undefined;
    const audioKey = asset.isolatedAudioKey ?? asset.cumulativeMixKey;
    if (!audioKey) return undefined;
    const sampleName = asset.prompt?.trim() || asset.trackDisplayName || 'Quick Sampler';
    return get().createQuickSamplerTrack({
      audioKey,
      sampleName,
      sampleDuration: asset.duration,
      rootNote: options?.rootNote,
      trackId: options?.trackId,
    });
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
    if (_isViewerMode()) return;
    if (!state.project) return;
    _pushHistory(state.project, { scope: 'arrangement', label: 'Remove track', trackId });
    const newTracks = state.project.tracks.filter((t) => t.id !== trackId);
    set({
      project: ensureProjectSession({
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.timeSignatureDenominator, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
      }),
    });
  },

  removeTracks: (trackIds) => {
    const state = get();
    if (_isViewerMode()) return;
    if (!state.project) return;
    if (trackIds.length === 0) return;
    _pushHistory(state.project, { scope: 'arrangement', label: `Remove ${trackIds.length} track${trackIds.length > 1 ? 's' : ''}` });
    const idSet = new Set(trackIds);
    // For group tracks, unparent children instead of deleting them
    const groupIds = new Set(state.project.tracks.filter((t) => idSet.has(t.id) && t.isGroup).map((t) => t.id));
    const newTracks = state.project.tracks
      .filter((t) => !idSet.has(t.id))
      .map((t) => (t.parentTrackId && groupIds.has(t.parentTrackId)) ? { ...t, parentTrackId: undefined } : t);
    set({
      project: ensureProjectSession({
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.timeSignatureDenominator, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
      }),
    });
  },

  duplicateTrack: (trackId) => {
    const state = get();
    if (_isViewerMode()) return undefined;
    if (!state.project) return undefined;
    const source = state.project.tracks.find((t) => t.id === trackId);
    if (!source) return undefined;
    _pushHistory(state.project);
    const newId = crypto.randomUUID();
    const clipIdMap = new Map<string, string>();
    const clonedTrack: Track = {
      ...JSON.parse(JSON.stringify(source)),
      id: newId,
      displayName: `${source.displayName} (copy)`,
      clips: source.clips.map((clip) => {
        const nextId = crypto.randomUUID();
        clipIdMap.set(clip.id, nextId);
        return {
          ...JSON.parse(JSON.stringify(clip)),
          id: nextId,
          trackId: newId,
        };
      }),
    };
    const newTracks = [...state.project.tracks, clonedTrack];
    const baseProject = ensureProjectSession({
      ...state.project,
      updatedAt: Date.now(),
      totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.timeSignatureDenominator, state.project.tempoMap, state.project.timeSignatureMap),
      tracks: newTracks,
    });
    const session = ensureSessionSlotsForTrack(baseProject.session!, newId);
    const clonedSlots = (baseProject.session?.slots ?? [])
      .filter((slot) => slot.trackId === source.id)
      .map((slot) => ({
        id: uuidv4(),
        trackId: newId,
        sceneId: slot.sceneId,
        clipId: slot.clipId ? (clipIdMap.get(slot.clipId) ?? null) : null,
      }));
    set({
      project: {
        ...baseProject,
        session: {
          ...session,
          slots: [
            ...session.slots.filter((slot) => slot.trackId !== newId),
            ...clonedSlots,
          ],
        },
      },
    });
    return clonedTrack;
  },

  updateTrack: (trackId, updates) => {
    const state = get();
    if (_isViewerMode()) return;
    if (!state.project) return;
    _pushHistory(state.project, getTrackUpdateHistoryOptions(trackId, updates));
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id !== trackId
            ? t
            : (() => {
                const sampler = updates.sampler
                  ? createDefaultSamplerSettings(updates.sampler)
                  : updates.sampler === undefined
                    ? t.sampler
                    : undefined;
                const samplerConfig = updates.samplerConfig
                  ? createDefaultSamplerConfig(updates.samplerConfig.audioKey, updates.samplerConfig)
                  : updates.samplerConfig === undefined
                    ? t.samplerConfig
                    : undefined;
                const nextTrack = {
                  ...t,
                  ...updates,
                  sampler,
                  samplerConfig,
                };
                return {
                  ...nextTrack,
                  ...syncSamplerState(nextTrack, { sampler, samplerConfig }),
                };
              })(),
        ),
      },
    });
  },

  setTrackSampler: (trackId, sampler) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project, { scope: 'track', label: 'Update sampler settings', trackId });
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId
            ? (() => {
                const nextSampler = createDefaultSamplerSettings({ ...(t.sampler ?? {}), ...sampler });
                return {
                  ...t,
                  synthPreset: 'sampler',
                  ...syncSamplerState(t, { sampler: nextSampler }),
                };
              })()
            : t,
        ),
      },
    });
  },

  clearTrackSampler: (trackId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project, { scope: 'track', label: 'Clear sampler source', trackId });
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                sampler: undefined,
                samplerConfig: undefined,
              }
            : t,
        ),
      },
    });
  },

  updateSamplerConfig: (trackId, config) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project, { scope: 'track', label: config ? 'Configure sampler' : 'Clear sampler config', trackId });
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId
            ? (config
              ? {
                  ...t,
                  synthPreset: 'sampler',
                  ...syncSamplerState(t, { samplerConfig: config }),
                }
              : {
                  ...t,
                  sampler: undefined,
                  samplerConfig: undefined,
                })
            : t,
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
    _pushHistory(state.project, { scope: 'track', label: 'Set track height', trackId });
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
    _pushHistory(state.project, { scope: 'arrangement', label: 'Set all track heights' });
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
    _pushHistory(state.project, { scope: 'track', label: 'Rename track', trackId });
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

  moveTrackToOrder: (trackId, targetOrder) => {
    const state = get();
    if (!state.project) return;

    const track = state.project.tracks.find((candidate) => candidate.id === trackId);
    if (!track) return;
    if (track.isGroup) return;

    const normalizedOrder = Math.max(1, Math.floor(targetOrder));
    if (track.order === normalizedOrder) return;

    const collapsedGroupIds = new Set(
      state.project.tracks
        .filter((candidate) => candidate.isGroup && candidate.collapsed)
        .map((candidate) => candidate.id),
    );
    const blockedOrders = new Set(
      state.project.tracks
        .filter((candidate) => (
          candidate.id !== trackId
          && candidate.parentTrackId
          && collapsedGroupIds.has(candidate.parentTrackId)
        ))
        .map((candidate) => candidate.order),
    );
    if (blockedOrders.has(normalizedOrder)) return;

    _pushHistory(state.project);
    const orderMap = buildTrackOrderMapForMove(state.project.tracks, trackId, normalizedOrder);
    const updatedTracks = state.project.tracks.map((candidate) => ({
      ...candidate,
      order: orderMap.get(candidate.id) ?? candidate.order,
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
    if (_isViewerMode()) return undefined as unknown as Clip;
    if (!state.project) throw new Error('No project');
    _pushHistory(state.project);

    const clip: Clip = {
      id: uuidv4(),
      trackId,
      color: clipData.color,
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
      audioDuration: clipData.audioDuration,
      audioOffset: clipData.audioOffset,
      contentOffset: clipData.contentOffset,
      timeStretchRate: clipData.timeStretchRate,
      stretchMode: clipData.stretchMode,
      pitchShift: clipData.pitchShift,
      source: clipData.source,
      starred: clipData.starred,
      midiData: clipData.midiData,
    };

    const newTracks = state.project.tracks.map((t) =>
      t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t,
    );
    const session = ensureProjectSession({
      ...state.project,
      tracks: newTracks,
      session: autoAssignClipToSession(ensureProjectSession(state.project).session!, trackId, clip.id),
    }).session!;

    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.timeSignatureDenominator, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
        session,
      },
    });

    return clip;
  },

  ensureMidiClip: (trackId, startTime = 0, duration = getBarDurationSec(get().project?.bpm ?? DEFAULT_BPM, get().project?.timeSignature ?? DEFAULT_TIME_SIGNATURE, get().project?.timeSignatureDenominator ?? 4)) => {
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
    if (_isViewerMode()) return;
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
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.timeSignatureDenominator, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
      },
    });
  },

  updateClipColor: (clipId, color) => {
    get().updateClipColors([clipId], color);
  },

  updateClipColors: (clipIds, color) => {
    const state = get();
    if (_isViewerMode()) return;
    if (!state.project || clipIds.length === 0) return;

    const clipIdSet = new Set(clipIds);
    _pushHistory(state.project, { label: color ? 'Assign clip color' : 'Reset clip color', scope: 'arrangement' });

    const newTracks = state.project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => (
        clipIdSet.has(clip.id)
          ? {
              ...clip,
              ...(color ? { color } : { color: undefined }),
            }
          : clip
      )),
    }));

    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.timeSignatureDenominator, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
      },
    });
  },

  toggleClipMuted: (clipIds) => {
    const state = get();
    if (_isViewerMode()) return;
    if (!state.project || clipIds.length === 0) return;

    const clipIdSet = new Set(clipIds);
    // Collect targeted clips to decide toggle direction
    const targetClips = state.project.tracks
      .flatMap((t) => t.clips)
      .filter((c) => clipIdSet.has(c.id));
    if (targetClips.length === 0) return;

    // If any clip is active (not muted), mute all. If all muted, unmute all.
    const anyActive = targetClips.some((c) => !c.muted);
    const newMuted = anyActive;

    _pushHistory(state.project, { label: newMuted ? 'Mute clips' : 'Unmute clips', scope: 'arrangement' });

    const newTracks = state.project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        clipIdSet.has(clip.id) ? { ...clip, muted: newMuted } : clip,
      ),
    }));

    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.timeSignatureDenominator, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
      },
    });
  },

  removeClip: (clipId) => {
    const state = get();
    if (_isViewerMode()) return;
    if (!state.project) return;
    _pushHistory(state.project);
    const newTracks = state.project.tracks.map((t) => ({
      ...t,
      clips: t.clips.filter((c) => c.id !== clipId),
    }));
    const session = ensureProjectSession({
      ...state.project,
      tracks: newTracks,
    }).session!;
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.timeSignatureDenominator, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
        session: {
          ...session,
          slots: session.slots.map((slot) => (slot.clipId === clipId ? { ...slot, clipId: null } : slot)),
          activeClipIdsByTrackId: Object.fromEntries(
            Object.entries(session.activeClipIdsByTrackId).map(([trackId, activeClipId]) => [trackId, activeClipId === clipId ? null : activeClipId]),
          ),
          pendingLaunches: session.pendingLaunches.filter((launch) => launch.clipId !== clipId),
          recordedLaunches: session.recordedLaunches.filter((launch) => launch.clipId !== clipId),
        },
      },
    });
  },

  duplicateClip: (clipId) => {
    const state = get();
    if (_isViewerMode()) return undefined;
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
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.timeSignatureDenominator, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
        session: ensureProjectSession({
          ...state.project,
          tracks: newTracks,
          session: autoAssignClipToSession(ensureProjectSession(state.project).session!, trackId, newClip.id),
        }).session!,
      },
    });

    return newClip;
  },

  setClipFade: (clipId, fade) => {
    const clip = get().getClipById(clipId);
    if (!clip) return;
    const nextFade = clampClipFadeDurations({
      clipDuration: clip.duration,
      fadeInDuration: fade.fadeInDuration ?? clip.fadeInDuration,
      fadeOutDuration: fade.fadeOutDuration ?? clip.fadeOutDuration,
    });
    get().updateClip(clipId, {
      ...fade,
      fadeInDuration: nextFade.fadeInDuration,
      fadeOutDuration: nextFade.fadeOutDuration,
    });
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

  applyAudioQuantize: (clipId, options = {}) => {
    const state = get();
    if (!state.project) return;
    const { gridDivision = 1, strength = 1, sensitivity = 0.1 } = options;

    let clip: Clip | undefined;
    for (const track of state.project.tracks) {
      clip = track.clips.find((c) => c.id === clipId);
      if (clip) break;
    }
    if (!clip || !clip.waveformPeaks || clip.waveformPeaks.length === 0) return;

    const peaks = new Float32Array(clip.waveformPeaks);
    const audioDuration = clip.audioDuration ?? clip.duration;
    const peakSampleRate = peaks.length / audioDuration;

    const transients = detectTransients(peaks, peakSampleRate, { sensitivity });
    if (transients.length === 0) return;

    const markers = computeWarpMarkers(transients, state.project.bpm, gridDivision, strength);
    if (markers.length === 0) return;

    get().updateClip(clipId, { warpMarkers: markers });
  },

  setWarpMarkers: (clipId, markers) => {
    get().updateClip(clipId, { warpMarkers: [...markers] });
  },

  addWarpMarker: (clipId, marker) => {
    const clip = get().getClipById(clipId);
    if (!clip) return;
    const markers = [...(clip.warpMarkers ?? []), marker];
    markers.sort((a, b) => a.originalTime - b.originalTime);
    get().updateClip(clipId, { warpMarkers: markers });
  },

  removeWarpMarker: (clipId, markerIndex) => {
    const clip = get().getClipById(clipId);
    if (!clip || !clip.warpMarkers) return;
    const markers = clip.warpMarkers.filter((_, i) => i !== markerIndex);
    get().updateClip(clipId, { warpMarkers: markers.length > 0 ? markers : undefined });
  },

  resetWarp: (clipId) => {
    get().updateClip(clipId, {
      warpMarkers: undefined,
      timeStretchRate: undefined,
      pitchShift: undefined,
      stretchMode: undefined,
    });
  },

  stretchClipToFit: (clipId, targetDuration) => {
    const clip = get().getClipById(clipId);
    if (!clip || targetDuration <= 0) return;
    const rate = clip.duration / targetDuration;
    get().updateClip(clipId, { timeStretchRate: rate });
  },

  createCrossfade: (clipAId, clipBId) => {
    const state = get();
    if (!state.project) return;
    const clipA = state.getClipById(clipAId);
    const clipB = state.getClipById(clipBId);
    if (!clipA || !clipB) return;

    // Determine overlap: A should end after B starts
    const aEnd = clipA.startTime + clipA.duration;
    const bStart = clipB.startTime;
    const overlap = aEnd - bStart;
    if (overlap <= 0) return;

    // Batch as single undo entry
    get().beginDrag();
    get().setClipFade(clipAId, { fadeOutDuration: overlap });
    get().setClipFade(clipBId, { fadeInDuration: overlap });
    get().endDrag();
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

  sliceClipToRange: async (clipId, startTime, endTime) => {
    const state = get();
    if (!state.project) return null;

    let sourceClip: Clip | undefined;
    let trackId: string | undefined;
    for (const track of state.project.tracks) {
      const clip = track.clips.find((candidate) => candidate.id === clipId);
      if (clip) {
        sourceClip = clip;
        trackId = track.id;
        break;
      }
    }
    if (!sourceClip || !trackId) return null;

    const originalStart = sourceClip.startTime;
    const originalEnd = sourceClip.startTime + sourceClip.duration;
    let rangeStart = Math.max(originalStart, Math.min(startTime, endTime));
    let rangeEnd = Math.min(originalEnd, Math.max(startTime, endTime));

    if (sourceClip.midiData) {
      const bpm = state.project.bpm ?? 120;
      rangeStart = Math.max(originalStart, snapToGrid(rangeStart, bpm, 1));
      rangeEnd = Math.min(originalEnd, snapToGrid(rangeEnd, bpm, 1));
    } else {
      const audioKey = sourceClip.isolatedAudioKey ?? sourceClip.cumulativeMixKey;
      if (audioKey) {
        try {
          const blob = await loadAudioBlobByKey(audioKey);
          if (blob) {
            const engine = audioEngineHooks.getAudioEngine();
            const buffer = await engine.decodeAudioData(blob);
            const samples = buffer.getChannelData(0);
            rangeStart = snapClipBoundaryToAudio(sourceClip, rangeStart, samples, buffer.sampleRate);
            rangeEnd = snapClipBoundaryToAudio(sourceClip, rangeEnd, samples, buffer.sampleRate);
          }
        } catch {
          // Keep the original boundaries if audio decoding or zero-cross lookup fails.
        }
      }
    }

    rangeStart = Math.max(originalStart, rangeStart);
    rangeEnd = Math.min(originalEnd, rangeEnd);

    if (rangeEnd - rangeStart <= CLIP_RANGE_SLICE_EPSILON) {
      return null;
    }

    const hasLeftRemainder = rangeStart > originalStart + CLIP_RANGE_SLICE_EPSILON;
    const hasRightRemainder = rangeEnd < originalEnd - CLIP_RANGE_SLICE_EPSILON;
    if (!hasLeftRemainder && !hasRightRemainder) {
      return clipId;
    }

    const bpm = state.project.bpm ?? 120;
    const selectedClip = buildClipSegmentFromRange(sourceClip, rangeStart, rangeEnd, bpm, clipId);
    const extraClips: Clip[] = [];

    if (hasLeftRemainder) {
      extraClips.push(buildClipSegmentFromRange(sourceClip, originalStart, rangeStart, bpm, uuidv4()));
    }
    if (hasRightRemainder) {
      extraClips.push(buildClipSegmentFromRange(sourceClip, rangeEnd, originalEnd, bpm, uuidv4()));
    }

    _pushHistory(state.project);

    const nextTracks = state.project.tracks.map((track) => {
      if (track.id !== trackId) return track;
      return {
        ...track,
        clips: [...track.clips.filter((clip) => clip.id !== clipId), selectedClip, ...extraClips]
          .sort((a, b) => a.startTime - b.startTime),
      };
    });

    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(
          nextTracks,
          state.project.measures,
          state.project.bpm,
          state.project.timeSignature,
          state.project.timeSignatureDenominator,
          state.project.tempoMap,
          state.project.timeSignatureMap,
        ),
        tracks: nextTracks,
      },
    });

    return clipId;
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
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.timeSignatureDenominator, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
      },
    });
  },

  splitClipAtZeroCrossing: async (clipId, splitTime) => {
    const state = get();
    if (!state.project) return;

    let sourceClip: Clip | undefined;
    for (const t of state.project.tracks) {
      const c = t.clips.find((c) => c.id === clipId);
      if (c) {
        sourceClip = c;
        break;
      }
    }
    if (!sourceClip) return;

    const audioKey = sourceClip.isolatedAudioKey ?? sourceClip.cumulativeMixKey;
    if (!audioKey) {
      get().splitClip(clipId, splitTime);
      return;
    }

    try {
      const blob = await loadAudioBlobByKey(audioKey);
      if (!blob) {
        get().splitClip(clipId, splitTime);
        return;
      }

      const engine = audioEngineHooks.getAudioEngine();
      const buffer = await engine.decodeAudioData(blob);
      const samples = buffer.getChannelData(0);

      const audioOffset = sourceClip.audioOffset ?? 0;
      const bufferTime = audioOffset + (splitTime - sourceClip.startTime);
      const snappedBufferTime = snapTimeToZeroCrossing(
        samples,
        buffer.sampleRate,
        bufferTime,
      );
      const snappedSplitTime =
        sourceClip.startTime + (snappedBufferTime - audioOffset);

      get().splitClip(clipId, snappedSplitTime);
    } catch {
      get().splitClip(clipId, splitTime);
    }
  },

  snapClipEdgeToZeroCrossing: async (clipId, edge) => {
    const state = get();
    if (!state.project) return;

    let clip: Clip | undefined;
    for (const t of state.project.tracks) {
      const c = t.clips.find((c) => c.id === clipId);
      if (c) { clip = c; break; }
    }
    if (!clip) return;

    const audioKey = clip.isolatedAudioKey ?? clip.cumulativeMixKey;
    if (!audioKey) return;

    try {
      const blob = await loadAudioBlobByKey(audioKey);
      if (!blob) return;

      const engine = audioEngineHooks.getAudioEngine();
      const buffer = await engine.decodeAudioData(blob);
      const samples = buffer.getChannelData(0);
      const audioOffset = clip.audioOffset ?? 0;

      if (edge === 'left') {
        // The left edge corresponds to audioOffset in the buffer
        const snappedOffset = snapTimeToZeroCrossing(
          samples,
          buffer.sampleRate,
          audioOffset,
        );
        const delta = snappedOffset - audioOffset;
        if (delta === 0) return;

        const newStart = clip.startTime + delta;
        const newDuration = clip.duration - delta;
        if (newDuration < 0.1) return;

        _pushHistory(state.project);
        get().updateClip(clipId, {
          startTime: newStart,
          duration: newDuration,
          audioOffset: snappedOffset,
        });
      } else {
        // The right edge corresponds to audioOffset + duration in the buffer
        const rightBufferTime = audioOffset + clip.duration;
        const snappedRight = snapTimeToZeroCrossing(
          samples,
          buffer.sampleRate,
          rightBufferTime,
        );
        const newDuration = snappedRight - audioOffset;
        if (newDuration < 0.1) return;

        _pushHistory(state.project);
        get().updateClip(clipId, { duration: newDuration });
      }
    } catch {
      // If audio loading fails, keep the current position
    }
  },

  consolidateClips: async (trackId, clipIds) => {
    const state = get();
    if (!state.project) {
      toastError('Create or open a project before consolidating clips');
      return undefined;
    }

    if (clipIds.length === 0) {
      toastError('Select at least one clip to consolidate');
      return undefined;
    }

    const track = state.project.tracks.find((candidate) => candidate.id === trackId);
    if (!track) {
      toastError('Track not found for consolidate');
      return undefined;
    }

    const selectedClips = clipIds
      .map((clipId) => track.clips.find((clip) => clip.id === clipId))
      .filter((clip): clip is Clip => Boolean(clip));

    if (selectedClips.length !== clipIds.length) {
      toastError('Select clips from a single track before consolidating');
      return undefined;
    }

    let validatedSelection;
    try {
      validatedSelection = validateClipConsolidation(trackId, selectedClips);
    } catch (error) {
      toastError(error instanceof Error ? error.message : 'Unable to consolidate the selected clips');
      return undefined;
    }

    const { clips, mediaType } = validatedSelection;
    const startTime = clips[0].startTime;
    const endTime = Math.max(...clips.map((clip) => clip.startTime + clip.duration));
    const prompt = buildConsolidatedPrompt(clips, mediaType === 'midi' ? 'Consolidated MIDI Clip' : 'Consolidated Audio Clip');
    const lyrics = clips.map((clip) => clip.lyrics.trim()).filter(Boolean).join('\n');
    const source = clips.every((clip) => clip.source === 'generated') ? 'generated' : 'uploaded';

    _pushHistory(state.project);

    let consolidatedClip: Clip;
    if (mediaType === 'midi') {
      const merged = buildConsolidatedMidiClipData(state.project, clips);
      consolidatedClip = {
        id: uuidv4(),
        trackId,
        startTime: merged.startTime,
        duration: merged.duration,
        prompt,
        globalCaption: clips.map((clip) => clip.globalCaption?.trim()).filter(Boolean).join('\n'),
        lyrics,
        generationStatus: 'ready',
        generationJobId: null,
        cumulativeMixKey: null,
        isolatedAudioKey: null,
        waveformPeaks: null,
        source,
        midiData: merged.midiData,
      };
    } else {
      try {
        const rendered = await renderConsolidatedAudioClip(state.project, clips);
        consolidatedClip = {
          id: rendered.id,
          trackId,
          startTime,
          duration: rendered.duration,
          prompt,
          globalCaption: clips.map((clip) => clip.globalCaption?.trim()).filter(Boolean).join('\n'),
          lyrics,
          generationStatus: 'ready',
          generationJobId: null,
          cumulativeMixKey: null,
          isolatedAudioKey: rendered.isolatedAudioKey,
          waveformPeaks: rendered.waveformPeaks,
          source,
          audioDuration: rendered.audioDuration,
          audioOffset: 0,
        };
      } catch (error) {
        _history.arrangement[GLOBAL_HISTORY_BUCKET]?.pop();
        toastError(error instanceof Error ? error.message : 'Unable to consolidate the selected audio clips');
        return undefined;
      }
    }

    const clipIdSet = new Set(clips.map((clip) => clip.id));
    const nextTracks = state.project.tracks.map((candidate) => {
      if (candidate.id !== trackId) return candidate;
      const remainingClips = candidate.clips.filter((clip) => !clipIdSet.has(clip.id));
      return {
        ...candidate,
        clips: [...remainingClips, consolidatedClip].sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id)),
      };
    });

    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(nextTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.timeSignatureDenominator, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: nextTracks,
      },
    });

    toastSuccess(mediaType === 'midi' ? 'Consolidated MIDI clips' : 'Consolidated audio clips');
    return consolidatedClip;
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
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.timeSignatureDenominator, state.project.tempoMap, state.project.timeSignatureMap),
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
    let session = ensureProjectSession(state.project).session!;
    for (const [trackId, clips] of newClipsPerTrack.entries()) {
      for (const clip of clips) {
        session = autoAssignClipToSession(session, trackId, clip.id);
      }
    }
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.timeSignatureDenominator, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
        session: ensureProjectSession({
          ...state.project,
          tracks: newTracks,
          session,
        }).session!,
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
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.timeSignatureDenominator, state.project.tempoMap, state.project.timeSignatureMap),
        tracks: newTracks,
      },
    });
  },

  createSessionScene: (name) => {
    const state = get();
    if (!state.project) return undefined;
    _pushHistory(state.project);
    const session = ensureProjectSession(state.project).session!;
    const scene: SessionScene = {
      id: uuidv4(),
      name: name?.trim() || `Scene ${session.scenes.length + 1}`,
      index: session.scenes.length,
    };
    let nextSession: SessionState = {
      ...session,
      scenes: [...session.scenes, scene],
    };
    for (const track of state.project.tracks) {
      nextSession = ensureSessionSlotsForTrack(nextSession, track.id);
    }
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        session: nextSession,
      },
    });
    return scene;
  },

  removeSessionScene: (sceneId) => {
    const state = get();
    if (!state.project) return;
    const session = ensureProjectSession(state.project).session!;
    if (session.scenes.length <= 1) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        session: {
          ...session,
          scenes: session.scenes.filter((scene) => scene.id !== sceneId).map((scene, index) => ({ ...scene, index })),
          slots: session.slots.filter((slot) => slot.sceneId !== sceneId),
          pendingLaunches: session.pendingLaunches.filter((launch) => launch.sceneId !== sceneId),
          recordedLaunches: session.recordedLaunches.map((launch) => (
            launch.sceneId === sceneId ? { ...launch, sceneId: null } : launch
          )),
          lastLaunchedSceneId: session.lastLaunchedSceneId === sceneId ? null : session.lastLaunchedSceneId,
        },
      },
    });
  },

  assignClipToSessionSlot: (trackId, sceneId, clipId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const session = replaceSessionSlotClip(ensureProjectSession(state.project).session!, trackId, sceneId, clipId);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        session,
      },
    });
  },

  setSessionLaunchQuantization: (quantization) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        session: {
          ...ensureProjectSession(state.project).session!,
          quantization,
        },
      },
    });
  },

  launchSessionClip: (trackId, sceneId) => {
    const state = get();
    if (!state.project) return;
    const track = state.project.tracks.find((candidate) => candidate.id === trackId);
    if (!track) return;
    const session = ensureProjectSession(state.project).session!;
    const slot = session.slots.find((candidate) => candidate.trackId === trackId && candidate.sceneId === sceneId);
    if (!slot?.clipId || !track.clips.some((clip) => clip.id === slot.clipId)) return;

    const transport = useTransportStore.getState();
    const isImmediate = !transport.isPlaying || session.quantization === 'none';
    const executeAt = isImmediate
      ? transport.currentTime
      : getQuantizedLaunchTime(transport.currentTime, getSessionQuantizationSeconds(state.project, session.quantization));

    if (isImmediate) {
      set({
        project: applySessionTrackLaunch(state.project, trackId, slot.clipId, executeAt, 'clip', sceneId),
      });
      return;
    }

    set({
      project: {
        ...state.project,
        session: queuePendingSessionLaunch(session, {
          type: 'clip',
          trackId,
          sceneId,
          clipId: slot.clipId,
          executeAt,
        }),
      },
    });
  },

  launchSessionScene: (sceneId) => {
    const state = get();
    if (!state.project) return;
    const session = ensureProjectSession(state.project).session!;
    const transport = useTransportStore.getState();
    const isImmediate = !transport.isPlaying || session.quantization === 'none';
    const executeAt = isImmediate
      ? transport.currentTime
      : getQuantizedLaunchTime(transport.currentTime, getSessionQuantizationSeconds(state.project, session.quantization));

    if (isImmediate) {
      let nextProject = state.project;
      for (const slot of session.slots.filter((candidate) => candidate.sceneId === sceneId && candidate.clipId)) {
        nextProject = applySessionTrackLaunch(nextProject, slot.trackId, slot.clipId ?? null, executeAt, 'scene', sceneId);
      }
      set({ project: nextProject });
      return;
    }

    set({
      project: {
        ...state.project,
        session: queuePendingSessionLaunch(session, {
          type: 'scene',
          sceneId,
          executeAt,
        }),
      },
    });
  },

  stopSessionTrack: (trackId) => {
    const state = get();
    if (!state.project) return;
    const session = ensureProjectSession(state.project).session!;
    const transport = useTransportStore.getState();
    const isImmediate = !transport.isPlaying || session.quantization === 'none';
    const executeAt = isImmediate
      ? transport.currentTime
      : getQuantizedLaunchTime(transport.currentTime, getSessionQuantizationSeconds(state.project, session.quantization));

    if (isImmediate) {
      set({ project: applySessionTrackLaunch(state.project, trackId, null, executeAt, 'stop') });
      return;
    }

    set({
      project: {
        ...state.project,
        session: queuePendingSessionLaunch(session, {
          type: 'stop-track',
          trackId,
          executeAt,
        }),
      },
    });
  },

  stopAllSessionClips: () => {
    const state = get();
    if (!state.project) return;
    const session = ensureProjectSession(state.project).session!;
    const transport = useTransportStore.getState();
    const isImmediate = !transport.isPlaying || session.quantization === 'none';
    const executeAt = isImmediate
      ? transport.currentTime
      : getQuantizedLaunchTime(transport.currentTime, getSessionQuantizationSeconds(state.project, session.quantization));

    if (isImmediate) {
      let nextProject = state.project;
      for (const track of state.project.tracks) {
        nextProject = applySessionTrackLaunch(nextProject, track.id, null, executeAt, 'stop');
      }
      set({ project: nextProject });
      return;
    }

    set({
      project: {
        ...state.project,
        session: queuePendingSessionLaunch(session, {
          type: 'stop-all',
          executeAt,
        }),
      },
    });
  },

  commitPendingSessionLaunches: (currentTime) => {
    const state = get();
    if (!state.project) return;
    const session = ensureProjectSession(state.project).session!;
    const ready = session.pendingLaunches
      .filter((launch) => launch.executeAt <= currentTime + SESSION_LAUNCH_EPSILON)
      .sort((a, b) => a.executeAt - b.executeAt || a.requestedAt - b.requestedAt);
    if (ready.length === 0) return;

    let nextProject: Project = {
      ...ensureProjectSession(state.project),
      session: {
        ...session,
        pendingLaunches: session.pendingLaunches.filter((launch) => !ready.some((candidate) => candidate.id === launch.id)),
      },
    };

    for (const launch of ready) {
      if (launch.type === 'clip' && launch.trackId) {
        nextProject = applySessionTrackLaunch(nextProject, launch.trackId, launch.clipId ?? null, launch.executeAt, 'clip', launch.sceneId ?? null);
        continue;
      }
      if (launch.type === 'scene' && launch.sceneId) {
        const nextSession = ensureProjectSession(nextProject).session!;
        for (const slot of nextSession.slots.filter((candidate) => candidate.sceneId === launch.sceneId && candidate.clipId)) {
          nextProject = applySessionTrackLaunch(nextProject, slot.trackId, slot.clipId ?? null, launch.executeAt, 'scene', launch.sceneId);
        }
        continue;
      }
      if (launch.type === 'stop-track' && launch.trackId) {
        nextProject = applySessionTrackLaunch(nextProject, launch.trackId, null, launch.executeAt, 'stop');
        continue;
      }
      if (launch.type === 'stop-all') {
        for (const track of nextProject.tracks) {
          nextProject = applySessionTrackLaunch(nextProject, track.id, null, launch.executeAt, 'stop');
        }
      }
    }

    set({ project: nextProject });
  },

  startSessionArrangementRecording: (startTime) => {
    const state = get();
    if (!state.project) return;
    const session = ensureProjectSession(state.project).session!;
    const effectiveStartTime = startTime ?? useTransportStore.getState().currentTime;
    const initialLaunches: SessionLaunchEvent[] = Object.entries(session.activeClipIdsByTrackId)
      .filter(([, clipId]) => !!clipId)
      .map(([trackId, clipId]) => ({
        id: uuidv4(),
        trackId,
        clipId: clipId ?? null,
        startedAt: effectiveStartTime,
        endedAt: null,
        sceneId: null,
        source: 'clip',
      }));

    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        session: {
          ...session,
          isRecordingToArrangement: true,
          arrangementRecordStartTime: effectiveStartTime,
          arrangementRecordEndTime: null,
          recordedLaunches: initialLaunches,
        },
      },
    });
  },

  stopSessionArrangementRecording: (endTime) => {
    const state = get();
    if (!state.project) return [];
    const session = ensureProjectSession(state.project).session!;
    if (!session.isRecordingToArrangement) return [];
    const effectiveEndTime = endTime ?? useTransportStore.getState().currentTime;
    const baseProject = {
      ...state.project,
      session: {
        ...session,
        recordedLaunches: session.recordedLaunches.map((launch) => ({
          ...launch,
          endedAt: launch.endedAt ?? effectiveEndTime,
        })),
      },
    };
    const printedClips = buildArrangementClipsFromSession(baseProject, effectiveEndTime);
    if (printedClips.length === 0) {
      set({
        project: {
          ...baseProject,
          updatedAt: Date.now(),
          session: {
            ...baseProject.session!,
            isRecordingToArrangement: false,
            arrangementRecordEndTime: effectiveEndTime,
            recordedLaunches: [],
          },
        },
      });
      return [];
    }

    _pushHistory(state.project);
    const clipsByTrack = new Map<string, Clip[]>();
    for (const clip of printedClips) {
      if (!clipsByTrack.has(clip.trackId)) clipsByTrack.set(clip.trackId, []);
      clipsByTrack.get(clip.trackId)!.push(clip);
    }
    const newTracks = state.project.tracks.map((track) => (
      clipsByTrack.has(track.id)
        ? { ...track, clips: [...track.clips, ...clipsByTrack.get(track.id)!] }
        : track
    ));
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: newTracks,
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature, state.project.timeSignatureDenominator, state.project.tempoMap, state.project.timeSignatureMap),
        session: {
          ...baseProject.session!,
          isRecordingToArrangement: false,
          arrangementRecordEndTime: effectiveEndTime,
          recordedLaunches: [],
        },
      },
    });
    return printedClips;
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
    _pushHistory(state.project, { scope: 'track', label: 'Initialize sequencer', trackId });

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
    if (_isViewerMode()) return;
    if (!state.project) return;
    _pushHistory(state.project, { scope: 'track', label: 'Toggle sequencer step', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Adjust sequencer step velocity', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Add sequencer row', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Remove sequencer row', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Adjust sequencer swing', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Set sequencer resolution', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Set sequencer length', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Adjust sequencer row volume', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Adjust sequencer row pan', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Toggle sequencer row mute', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Assign sequencer row sample', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Clear sequencer row', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Reorder sequencer rows', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Duplicate sequencer row', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Rename sequencer row', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Color sequencer row', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Fill sequencer row', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Paint sequencer steps', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Initialize drum machine', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Swap drum pad sample', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Adjust drum pad volume', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Adjust drum pad pan', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Rename drum pad', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Change drum kit', trackId });
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

  // ── Strudel actions ──
  updateStrudelCode: (trackId, code) => {
    const state = get();
    if (_isViewerMode()) return;
    if (!state.project) return;
    _pushHistory(state.project, { scope: 'track', label: 'Update strudel code', trackId });
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) =>
          t.id === trackId ? { ...t, strudelCode: code } : t,
        ),
      },
    });
  },

  getStrudelCode: (trackId) => {
    const state = get();
    if (!state.project) return undefined;
    return state.project.tracks.find((t) => t.id === trackId)?.strudelCode;
  },

  getStrudelPatternInfo: async (trackId) => {
    const state = get();
    if (!state.project) return null;
    const track = state.project.tracks.find((t) => t.id === trackId);
    if (!track?.strudelCode) return null;
    try {
      const { evaluateStrudelCode, getPatternInfo } = await import('../engine/strudelEngine');
      const pattern = await evaluateStrudelCode(track.strudelCode);
      return getPatternInfo(pattern, track.strudelCycleLength ?? 1);
    } catch {
      return null;
    }
  },

  freezeStrudelToAudio: async (trackId, bars, onProgress) => {
    const state = get();
    if (!state.project) throw new Error('No project');
    const track = state.project.tracks.find((t) => t.id === trackId);
    if (!track || track.trackType !== 'strudel') throw new Error('Not a strudel track');
    if (!track.strudelCode?.trim()) throw new Error('No strudel code');
    if (!bars || bars < 1) throw new Error('Bars must be >= 1');

    _pushHistory(state.project, { scope: 'arrangement', label: 'Freeze strudel to audio' });

    const bpm = state.project.bpm ?? 120;
    const beatsPerBar = typeof state.project.timeSignature === 'number' ? state.project.timeSignature : 4;
    const durationSeconds = (bars * beatsPerBar * 60) / bpm;
    const sampleRate = 48_000;

    // Render strudel pattern to audio via OfflineAudioContext
    const { renderStrudelOffline } = await import('../engine/strudelEngine');
    const audioBuffer = await renderStrudelOffline(track.strudelCode, durationSeconds, bpm, sampleRate, onProgress);

    // Convert to WAV and store
    const { audioBufferToWavBlob } = await import('../utils/wav');
    const wavBlob = audioBufferToWavBlob(audioBuffer);
    const clipId = uuidv4();
    const { saveAudioBlob } = await import('../services/audioFileManager');
    const audioKey = await saveAudioBlob(get().project!.id, clipId, 'isolated', wavBlob);

    // Compute waveform peaks for visual display
    const { computeWaveformPeaks } = await import('../utils/waveformPeaks');
    const { CLIP_WAVEFORM_PEAK_COUNT } = await import('../utils/clipAudio');
    const waveformPeaks = computeWaveformPeaks(audioBuffer, CLIP_WAVEFORM_PEAK_COUNT);

    // Create a new stems track with the rendered audio clip
    const newTrack = createTrackFromTemplate(
      get().project!.tracks,
      'custom',
      'stems',
    );
    newTrack.displayName = `${track.displayName} (bounced)`;
    newTrack.color = track.color;
    newTrack.clips = [{
      id: clipId,
      trackId: newTrack.id,
      startTime: 0,
      duration: durationSeconds,
      prompt: '',
      lyrics: '',
      generationStatus: 'ready' as const,
      generationJobId: null,
      cumulativeMixKey: null,
      isolatedAudioKey: audioKey,
      waveformPeaks,
      source: 'uploaded' as const,
      audioDuration: durationSeconds,
    }];

    const newTracks = [...get().project!.tracks, newTrack];
    const nextProject = ensureProjectSession({
      ...get().project!,
      updatedAt: Date.now(),
      totalDuration: computeTotalDuration(
        newTracks,
        get().project!.measures,
        bpm,
        get().project!.timeSignature,
        get().project!.timeSignatureDenominator,
        get().project!.tempoMap,
        get().project!.timeSignatureMap,
      ),
      tracks: newTracks,
    });
    set({ project: nextProject });
    return newTrack;
  },

  freezeStrudelToMidi: async (trackId, bars = 4) => {
    const state = get();
    if (_isViewerMode()) return null;
    if (!state.project) return null;
    const track = state.project.tracks.find((candidate) => candidate.id === trackId);
    if (!track || track.trackType !== 'strudel') return null;
    if (!track.strudelCode?.trim()) return null;

    _pushHistory(state.project, { scope: 'arrangement', label: 'Freeze strudel to MIDI' });

    const bpm = state.project.bpm ?? 120;
    const beatsPerBar = typeof state.project.timeSignature === 'number' ? state.project.timeSignature : 4;
    const { evaluateStrudelPatternPure, queryPatternEvents } = await import('../engine/strudelEngine');
    const pattern = await evaluateStrudelPatternPure(track.strudelCode);
    if (!pattern) return null;

    const events = queryPatternEvents(pattern, 0, bars);
    const { strudelEventsToMidiNotes } = await import('../services/strudelConversion');
    const midiNotes = strudelEventsToMidiNotes(events, beatsPerBar);
    if (midiNotes.length === 0) return null;

    const newTrack = createTrackFromTemplate(
      get().project!.tracks,
      'keyboard',
      'pianoRoll',
    );
    newTrack.displayName = `${track.displayName} (MIDI)`;
    newTrack.color = track.color;

    const durationSeconds = (bars * beatsPerBar * 60) / bpm;
    const clipId = uuidv4();
    newTrack.clips = [{
      id: clipId,
      trackId: newTrack.id,
      startTime: 0,
      duration: durationSeconds,
      prompt: '',
      lyrics: '',
      generationStatus: 'ready' as const,
      generationJobId: null,
      cumulativeMixKey: null,
      isolatedAudioKey: null,
      waveformPeaks: null,
      source: 'uploaded' as const,
      midiData: {
        notes: midiNotes,
        grid: '1/16' as const,
      },
    }];

    const newTracks = [...get().project!.tracks, newTrack];
    const nextProject = ensureProjectSession({
      ...get().project!,
      updatedAt: Date.now(),
      totalDuration: computeTotalDuration(
        newTracks,
        get().project!.measures,
        bpm,
        get().project!.timeSignature,
        get().project!.timeSignatureDenominator,
        get().project!.tempoMap,
        get().project!.timeSignatureMap,
      ),
      tracks: newTracks,
    });
    set({ project: nextProject });
    return newTrack;
  },

  freezeStrudelToDrumMachine: async (trackId, bars = 1, stepsPerBar = 16) => {
    const state = get();
    if (_isViewerMode()) return null;
    if (!state.project) return null;
    const track = state.project.tracks.find((candidate) => candidate.id === trackId);
    if (!track || track.trackType !== 'strudel') return null;
    if (!track.strudelCode?.trim()) return null;

    _pushHistory(state.project, { scope: 'arrangement', label: 'Freeze strudel to drum machine' });

    const beatsPerBar = typeof state.project.timeSignature === 'number' ? state.project.timeSignature : 4;
    const { evaluateStrudelPatternPure, queryPatternEvents } = await import('../engine/strudelEngine');
    const pattern = await evaluateStrudelPatternPure(track.strudelCode);
    if (!pattern) return null;

    const events = queryPatternEvents(pattern, 0, bars);
    const { strudelEventsToDrumPattern, sequencerPatternToMidiData } = await import('../services/strudelConversion');
    const sequencerPattern = strudelEventsToDrumPattern(events, bars, stepsPerBar);
    if (sequencerPattern.rows.length === 0) return null;

    const newTrack = createTrackFromTemplate(
      get().project!.tracks,
      'percussion',
      'sequencer',
      { sequencerPattern },
    );
    newTrack.displayName = `${track.displayName} (Drums)`;
    newTrack.color = track.color;

    const bpm = state.project.bpm ?? 120;
    const singleBarMidi = sequencerPatternToMidiData(sequencerPattern, beatsPerBar);
    if (singleBarMidi.notes.length > 0) {
      const patternBeats = bars * beatsPerBar;
      const projectMeasures = state.project.measures ?? 8;
      const loopCount = Math.max(1, Math.ceil(projectMeasures / bars));
      const totalBeats = patternBeats * loopCount;
      const totalDurationSec = (totalBeats * 60) / bpm;

      const allNotes = [];
      for (let loop = 0; loop < loopCount; loop++) {
        const offset = loop * patternBeats;
        for (const note of singleBarMidi.notes) {
          allNotes.push({
            ...note,
            id: `${note.id}-L${loop}`,
            startBeat: note.startBeat + offset,
          });
        }
      }

      newTrack.clips = [{
        id: uuidv4(),
        trackId: newTrack.id,
        startTime: 0,
        duration: totalDurationSec,
        prompt: '',
        lyrics: '',
        generationStatus: 'ready' as const,
        generationJobId: null,
        cumulativeMixKey: null,
        isolatedAudioKey: null,
        waveformPeaks: null,
        midiData: { notes: allNotes, grid: singleBarMidi.grid },
      }];
    }

    const newTracks = [...get().project!.tracks, newTrack];
    const nextProject = ensureProjectSession({
      ...get().project!,
      updatedAt: Date.now(),
      totalDuration: computeTotalDuration(
        newTracks,
        get().project!.measures,
        bpm,
        get().project!.timeSignature,
        get().project!.timeSignatureDenominator,
        get().project!.tempoMap,
        get().project!.timeSignatureMap,
      ),
      tracks: newTracks,
    });
    set({ project: nextProject });
    return newTrack;
  },

  scaffoldStrudelArrangement: async (genre) => {
    const state = get();
    if (_isViewerMode()) return [];
    if (!state.project) return [];

    const { getArrangementTemplate } = await import('../services/strudelArrangement');
    const template = getArrangementTemplate(genre);

    _pushHistory(state.project, { scope: 'arrangement', label: `Scaffold strudel arrangement (${template.genre})` });

    const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
    const genreLabel = capitalize(template.genre);

    const roles: Array<{ role: string; code: string }> = [
      { role: 'Drums', code: template.drums },
      { role: 'Bass', code: template.bass },
      { role: 'Chords', code: template.chords },
      { role: 'Melody', code: template.melody },
    ];

    const trackIds: string[] = [];
    let currentTracks = [...state.project.tracks];

    for (const { role, code } of roles) {
      const newTrack = createTrackFromTemplate(currentTracks, 'custom', 'strudel', {
        displayName: `${genreLabel} ${role}`,
        strudelCode: code,
      });
      currentTracks = [...currentTracks, newTrack];
      trackIds.push(newTrack.id);
    }

    const bpm = state.project.bpm ?? 120;
    const nextProject = ensureProjectSession({
      ...state.project,
      updatedAt: Date.now(),
      totalDuration: computeTotalDuration(
        currentTracks,
        state.project.measures,
        bpm,
        state.project.timeSignature,
        state.project.timeSignatureDenominator,
        state.project.tempoMap,
        state.project.timeSignatureMap,
      ),
      tracks: currentTracks,
    });
    set({ project: nextProject });
    return trackIds;
  },

  convertMidiClipToStrudel: async (clipId, partialOptions) => {
    const state = get();
    if (!state.project) return null;
    const track = state.project.tracks.find((candidate) => candidate.clips.some((clip) => clip.id === clipId));
    const clip = track?.clips.find((candidate) => candidate.id === clipId);
    if (!track || !clip?.midiData) return null;

    const {
      convertMidiClipToStrudelCode,
      createDefaultStrudelFromMidiOptions,
    } = await import('../services/strudelConversion');

    const options = {
      ...createDefaultStrudelFromMidiOptions(state.project),
      ...partialOptions,
    };
    return convertMidiClipToStrudelCode(clip, track, state.project, options);
  },

  convertMidiTrackToStrudel: async (trackId, partialOptions) => {
    const state = get();
    if (!state.project) return null;
    const track = state.project.tracks.find((candidate) => candidate.id === trackId);
    if (!track) return null;

    const {
      convertMidiTrackToStrudelCode,
      createDefaultStrudelFromMidiOptions,
    } = await import('../services/strudelConversion');

    const options = {
      ...createDefaultStrudelFromMidiOptions(state.project),
      ...partialOptions,
    };
    return convertMidiTrackToStrudelCode(track, state.project, options);
  },

  convertMidiFileToStrudel: async (file, partialOptions) => {
    const state = get();
    if (!state.project) return null;

    try {
      const parsed = parseMidiFile(await file.arrayBuffer());
      const {
        convertParsedMidiFileToStrudelCode,
        createDefaultStrudelFromMidiOptions,
      } = await import('../services/strudelConversion');

      const options = {
        ...createDefaultStrudelFromMidiOptions(state.project),
        ...partialOptions,
      };
      return convertParsedMidiFileToStrudelCode(parsed, file.name.replace(/\.(mid|midi)$/i, ''), options);
    } catch (error) {
      console.error(error);
      return null;
    }
  },

  applyStrudelCodeToTrack: async (code, targetTrackId, options) => {
    const state = get();
    if (_isViewerMode()) return null;
    if (!state.project) return null;

    const targetMode = options?.targetTrackMode ?? 'currentOrNew';
    let nextTracks = [...state.project.tracks];
    let targetTrack = targetTrackId
      ? nextTracks.find((track) => track.id === targetTrackId && track.trackType === 'strudel')
      : undefined;

    if (!targetTrack && targetMode === 'currentOrNew') {
      targetTrack = nextTracks.find((track) => track.trackType === 'strudel');
    }

    if (!targetTrack || targetMode === 'alwaysNew') {
      targetTrack = createTrackFromTemplate(nextTracks, 'custom', 'strudel');
      nextTracks = [...nextTracks, targetTrack];
    }

    _pushHistory(state.project, {
      scope: 'track',
      label: options?.label ?? 'Apply Strudel code',
      trackId: targetTrack.id,
    });

    nextTracks = nextTracks.map((track) => {
      if (track.id !== targetTrack!.id) return track;

      const previousCode = track.strudelCode?.trim();
      const nextVersions = previousCode && previousCode !== code.trim()
        ? [
            ...(track.strudelVersions ?? []),
            {
              id: uuidv4(),
              code: track.strudelCode ?? '',
              timestamp: Date.now(),
              label: options?.label ? `${options.label} (previous)` : 'Auto snapshot',
            },
          ]
        : (track.strudelVersions ?? []);

      return {
        ...track,
        strudelCode: code,
        strudelVersions: nextVersions.length > 0 ? nextVersions : track.strudelVersions,
      };
    });

    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: nextTracks,
      },
    });

    const appliedTrackId = targetTrack.id;
    queueMicrotask(() => {
      void import('./uiStore').then(({ useUIStore }) => {
        useUIStore.getState().setOpenStrudelEditor(appliedTrackId);
      }).catch(() => {
        // Ignore UI sync failures during non-UI action usage.
      });
    });

    return { trackId: appliedTrackId };
  },

  captureStrudelVersion: (trackId, label) => {
    const state = get();
    if (_isViewerMode()) return;
    if (!state.project) return;
    const track = state.project.tracks.find((candidate) => candidate.id === trackId);
    if (!track || track.trackType !== 'strudel' || !track.strudelCode) return;

    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((candidate) => (
          candidate.id === trackId
            ? {
                ...candidate,
                strudelVersions: [
                  ...(candidate.strudelVersions ?? []),
                  {
                    id: uuidv4(),
                    code: candidate.strudelCode ?? '',
                    timestamp: Date.now(),
                    label,
                  },
                ],
              }
            : candidate
        )),
      },
    });
  },

  restoreStrudelVersion: (trackId, versionIndex) => {
    const state = get();
    if (_isViewerMode()) return;
    if (!state.project) return;
    const track = state.project.tracks.find((candidate) => candidate.id === trackId && candidate.trackType === 'strudel');
    const version = track?.strudelVersions?.[versionIndex];
    if (!track || !version) return;

    _pushHistory(state.project, { scope: 'track', label: 'Restore strudel version', trackId });
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((candidate) => (
          candidate.id === trackId
            ? { ...candidate, strudelCode: version.code }
            : candidate
        )),
      },
    });
  },

  addMidiNote: (clipId, note) => {
    const state = get();
    if (_isViewerMode()) return undefined;
    if (!state.project) return undefined;
    const noteId = note.id ?? uuidv4();
    const noteWithId: MidiNote = { ...note, id: noteId };
    _pushHistory(state.project, { scope: 'pianoRoll', label: 'Add MIDI note', clipId });
    set({ project: _appendMidiNotesToClip(state.project, clipId, [noteWithId]) });
    return noteId;
  },

  updateMidiNote: (clipId, noteId, updates) => {
    const state = get();
    if (_isViewerMode()) return;
    if (!state.project) return;
    _pushHistory(state.project, { scope: 'pianoRoll', label: 'Edit MIDI note', clipId });
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

  resizeMidiNote: (clipId, noteId, input) => {
    const state = get();
    if (_isViewerMode()) return;
    if (!state.project) return;
    const minDurationBeats = Math.max(0.001, input.minDurationBeats ?? 0.125);
    _pushHistory(state.project, { scope: 'pianoRoll', label: 'Resize MIDI note', clipId });
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId || !clip.midiData) {
              return clip;
            }

            return {
              ...clip,
              midiData: {
                ...clip.midiData,
                notes: clip.midiData.notes.map((note) => {
                  if (note.id !== noteId) {
                    return note;
                  }

                  const originalEndBeat = note.startBeat + note.durationBeats;
                  if (input.edge === 'left') {
                    const requestedStartBeat = Math.max(0, input.startBeat ?? note.startBeat);
                    const nextStartBeat = Math.min(requestedStartBeat, originalEndBeat - minDurationBeats);
                    return {
                      ...note,
                      startBeat: nextStartBeat,
                      durationBeats: Math.max(minDurationBeats, originalEndBeat - nextStartBeat),
                    };
                  }

                  const requestedEndBeat = input.endBeat ?? originalEndBeat;
                  return {
                    ...note,
                    durationBeats: Math.max(minDurationBeats, requestedEndBeat - note.startBeat),
                  };
                }),
              },
            };
          }),
        })),
      },
    });
  },

  removeMidiNote: (clipId, noteId) => {
    const state = get();
    if (_isViewerMode()) return;
    if (!state.project) return;
    _pushHistory(state.project, { scope: 'pianoRoll', label: 'Delete MIDI note', clipId });
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
    _pushHistory(state.project, { scope: 'pianoRoll', label: 'Quantize MIDI notes', clipId });
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
    if (_isViewerMode()) return [];
    if (!state.project) return [];
    const newNotes: MidiNote[] = intervals
      .map((interval) => rootPitch + interval)
      .filter((pitch) => pitch >= 0 && pitch <= 127)
      .map((pitch) => ({
        id: crypto.randomUUID(),
        pitch,
        startBeat,
        durationBeats,
        velocity,
      }));

    if (newNotes.length === 0) return [];

    _pushHistory(state.project, { scope: 'pianoRoll', label: 'Stamp chord', clipId });
    set({ project: _appendMidiNotesToClip(state.project, clipId, newNotes) });
    return newNotes.map((note) => note.id);
  },

  populateMidiPattern: (clipId, options) => {
    const state = get();
    if (!state.project) return [];
    _pushHistory(state.project, { scope: 'pianoRoll', label: 'Generate MIDI pattern', clipId });

    const generated = generatePattern(options);
    const noteIds: string[] = [];
    const newNotes: MidiNote[] = generated.map((g) => {
      const id = crypto.randomUUID();
      noteIds.push(id);
      return { id, ...g };
    });

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
                    notes: newNotes, // Replace all notes with generated pattern
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
    _pushHistory(state.project, { scope: 'pianoRoll', label: 'Set MIDI grid', clipId });
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
    _pushHistory(state.project, { scope: 'pianoRoll', label: 'Transform MIDI notes', clipId });
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

  // ─── WAP Plugins ──────────────────────────────────────────────────────────

  addPlugin: (trackId, plugin) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) =>
          track.id === trackId
            ? { ...track, plugins: [...(track.plugins ?? []), plugin] }
            : track,
        ),
      },
    });
  },

  removePlugin: (trackId, pluginInstanceId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) =>
          track.id === trackId
            ? { ...track, plugins: (track.plugins ?? []).filter((p) => p.id !== pluginInstanceId) }
            : track,
        ),
      },
    });
  },

  updatePluginParam: (trackId, pluginInstanceId, paramId, value) => {
    const state = get();
    if (!state.project) return;
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) => {
          if (track.id !== trackId) return track;
          return {
            ...track,
            plugins: (track.plugins ?? []).map((p) =>
              p.id === pluginInstanceId
                ? { ...p, params: { ...p.params, [paramId]: value } }
                : p,
            ),
          };
        }),
      },
    });
  },

  togglePlugin: (trackId, pluginInstanceId) => {
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
            plugins: (track.plugins ?? []).map((p) =>
              p.id === pluginInstanceId
                ? { ...p, enabled: !p.enabled }
                : p,
            ),
          };
        }),
      },
    });
  },

  loadPlugin: (trackId, pluginId) => {
    // This action creates a PluginInstance in the store.
    // The actual audio node creation happens in usePluginSync hook.
    const state = get();
    if (!state.project) return undefined;

    const manifest = pluginRegistry.getManifest(pluginId);
    if (!manifest) return undefined;

    const id = uuidv4();
    const defaultParams: Record<string, string | number | boolean> = {};
    for (const desc of manifest.parameters) {
      defaultParams[desc.id] = desc.defaultValue;
    }

    const instance: PluginInstance = {
      id,
      pluginId,
      enabled: true,
      params: defaultParams,
      manifest: { ...manifest },
    };

    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((track) =>
          track.id === trackId
            ? { ...track, plugins: [...(track.plugins ?? []), instance] }
            : track,
        ),
      },
    });
    return id;
  },

  // ─── MIDI Effects ──────────────────────────────────────────────────────────

  addMidiEffect: (trackId, type) => {
    const state = get();
    if (!state.project) return undefined;
    const effect = createDefaultMidiEffect(type);
    _pushHistory(state.project, { scope: 'track', label: 'Add MIDI effect', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Remove MIDI effect', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Edit MIDI effect', trackId });
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
    _pushHistory(state.project, { scope: 'track', label: 'Toggle MIDI effect', trackId });
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

  removeGroupTrack: (groupId) => {
    const state = get();
    if (!state.project) return;
    const group = state.project.tracks.find((t) => t.id === groupId);
    if (!group || !group.isGroup) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks
          .filter((t) => t.id !== groupId)
          .map((t) => t.parentTrackId === groupId ? { ...t, parentTrackId: undefined } : t),
      },
    });
  },

  setGroupMuted: (groupId, muted) => {
    const state = get();
    if (!state.project) return;
    const group = state.project.tracks.find((t) => t.id === groupId);
    if (!group || !group.isGroup) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id === groupId) return { ...t, muted };
          if (t.parentTrackId === groupId) return { ...t, muted };
          return t;
        }),
      },
    });
  },

  setGroupSoloed: (groupId, soloed) => {
    const state = get();
    if (!state.project) return;
    const group = state.project.tracks.find((t) => t.id === groupId);
    if (!group || !group.isGroup) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => {
          if (t.id === groupId) return { ...t, soloed };
          if (t.parentTrackId === groupId) return { ...t, soloed };
          return t;
        }),
      },
    });
  },

  getVisibleTracks: () => {
    const state = get();
    if (!state.project) return [];
    const collapsedGroupIds = new Set(
      state.project.tracks
        .filter((t) => t.isGroup && t.collapsed)
        .map((t) => t.id),
    );
    return [...state.project.tracks]
      .filter((t) => !t.parentTrackId || !collapsedGroupIds.has(t.parentTrackId))
      .sort((a, b) => a.order - b.order);
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
    updated.totalDuration = computeTotalDuration(updated.tracks, updated.measures, updated.bpm, updated.timeSignature, updated.timeSignatureDenominator, updated.tempoMap, updated.timeSignatureMap);
    set({ project: updated });
  },

  removeTempoEvent: (beat: number) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const map = (state.project.tempoMap ?? []).filter((e: TempoEvent) => e.beat !== beat);
    const updated = { ...state.project, updatedAt: Date.now(), tempoMap: map };
    updated.totalDuration = computeTotalDuration(updated.tracks, updated.measures, updated.bpm, updated.timeSignature, updated.timeSignatureDenominator, updated.tempoMap, updated.timeSignatureMap);
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
    updated.totalDuration = computeTotalDuration(updated.tracks, updated.measures, updated.bpm, updated.timeSignature, updated.timeSignatureDenominator, updated.tempoMap, updated.timeSignatureMap);
    set({ project: updated });
  },

  clearTempoMap: () => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const updated = { ...state.project, updatedAt: Date.now(), tempoMap: [] };
    updated.totalDuration = computeTotalDuration(updated.tracks, updated.measures, updated.bpm, updated.timeSignature, updated.timeSignatureDenominator, updated.tempoMap, updated.timeSignatureMap);
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
    updated.totalDuration = computeTotalDuration(updated.tracks, updated.measures, updated.bpm, updated.timeSignature, updated.timeSignatureDenominator, updated.tempoMap, updated.timeSignatureMap);
    set({ project: updated });
  },

  removeTimeSignatureEvent: (bar: number) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const map = (state.project.timeSignatureMap ?? []).filter((e: TimeSignatureEvent) => e.bar !== bar);
    const updated = { ...state.project, updatedAt: Date.now(), timeSignatureMap: map };
    updated.totalDuration = computeTotalDuration(updated.tracks, updated.measures, updated.bpm, updated.timeSignature, updated.timeSignatureDenominator, updated.tempoMap, updated.timeSignatureMap);
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
    updated.totalDuration = computeTotalDuration(updated.tracks, updated.measures, updated.bpm, updated.timeSignature, updated.timeSignatureDenominator, updated.tempoMap, updated.timeSignatureMap);
    set({ project: updated });
  },

  clearTimeSignatureMap: () => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const updated = { ...state.project, updatedAt: Date.now(), timeSignatureMap: [] };
    updated.totalDuration = computeTotalDuration(updated.tracks, updated.measures, updated.bpm, updated.timeSignature, updated.timeSignatureDenominator, updated.tempoMap, updated.timeSignatureMap);
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

  addTake: (clipId, audioKey, waveformPeaks) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const take: Take = { id: uuidv4(), audioKey, selected: false, waveformPeaks: waveformPeaks ?? null };
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

  promoteTake: (clipId, takeId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => {
            if (c.id !== clipId) return c;
            const take = (c.takes ?? []).find((tk) => tk.id === takeId);
            if (!take) return c;
            return {
              ...c,
              isolatedAudioKey: take.audioKey,
              waveformPeaks: take.waveformPeaks ?? c.waveformPeaks,
              takes: [],
            };
          }),
        })),
      },
    });
  },

  deleteTake: (clipId, takeId) => {
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
              ? { ...c, takes: (c.takes ?? []).filter((tk) => tk.id !== takeId) }
              : c,
          ),
        })),
      },
    });
  },

  flattenComp: (clipId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => {
            if (c.id !== clipId) return c;
            const selectedTake = (c.takes ?? []).find((tk) => tk.selected);
            if (selectedTake) {
              return {
                ...c,
                isolatedAudioKey: selectedTake.audioKey,
                waveformPeaks: selectedTake.waveformPeaks ?? c.waveformPeaks,
                takes: [],
              };
            }
            return { ...c, takes: [] };
          }),
        })),
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
    const remainingTrackSlots = Math.max(0, MAX_PROJECT_TRACKS - latest.project.tracks.length);

    if (remainingTrackSlots === 0) {
      toastError(`Track limit reached (${MAX_PROJECT_TRACKS} max)`);
      return [];
    }

    for (const stem of preparedStems.slice(0, remainingTrackSlots)) {
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
        totalDuration: computeTotalDuration(updatedTracks, latest.project.measures, latest.project.bpm, latest.project.timeSignature, latest.project.timeSignatureDenominator),
        tracks: updatedTracks,
        assets: [...(latest.project.assets ?? []), ...newAssets],
      },
    });

    if (preparedStems.length > remainingTrackSlots) {
      toastError(`Only ${remainingTrackSlots} stem track${remainingTrackSlots === 1 ? '' : 's'} could be added (limit ${MAX_PROJECT_TRACKS})`);
    }

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

    const engine = audioEngineHooks.getAudioEngine();
    const exportableTracks = getStemExportTracks(project, { scope: 'all-audible' }).filter(trackHasExportableContent);
    const stemExports = await exportTrackStems(
      project,
      exportableTracks,
      {
        format: 'wav',
        sampleRate: 48000,
        bitDepth: 16,
        mp3Bitrate: 320,
        oggQuality: 0.5,
      },
      engine,
    );

    for (const stemExport of stemExports) {
      downloadBlob(stemExport.blob, stemExport.fileName);
    }
  },

  // ── Project Templates ─────────────────────────────────────────────────────

  saveProjectAsTemplate: (name, description) => {
    const state = get();
    if (!state.project) throw new Error('No project');

    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Template name is required');

    const templateTracks: ProjectTemplateTrack[] = state.project.tracks.map((track) => ({
      trackName: track.trackName,
      trackType: track.trackType ?? 'stems',
      displayName: track.displayName,
      color: track.color,
      volume: track.volume,
      pan: track.pan,
      effects: track.effects ? structuredClone(track.effects) : undefined,
      midiEffects: track.midiEffects ? structuredClone(track.midiEffects) : undefined,
      synthPreset: track.synthPreset,
      drumKit: track.drumKit,
      localCaption: track.localCaption,
      sequencerPattern: track.sequencerPattern ? structuredClone(track.sequencerPattern) : undefined,
    }));

    const template: ProjectTemplate = {
      id: uuidv4(),
      name: trimmedName,
      description: (description ?? '').trim(),
      createdAt: Date.now(),
      bpm: state.project.bpm,
      keyScale: state.project.keyScale,
      timeSignature: state.project.timeSignature,
      timeSignatureDenominator: state.project.timeSignatureDenominator ?? 4,
      measures: DEFAULT_MEASURES,
      tracks: templateTracks,
      generationDefaults: structuredClone(state.project.generationDefaults),
    };

    return template;
  },

  createProjectFromTemplate: (template, projectName) => {
    const bpm = template.bpm;
    const timeSig = template.timeSignature;
    const timeSigDenominator = template.timeSignatureDenominator ?? 4;
    const measures = DEFAULT_MEASURES;

    const tracks: Track[] = template.tracks.slice(0, MAX_PROJECT_TRACKS).map((tt, idx) => ({
      id: uuidv4(),
      trackName: tt.trackName,
      trackType: tt.trackType,
      displayName: tt.displayName,
      color: tt.color,
      order: idx,
      volume: tt.volume,
      muted: false,
      soloed: false,
      clips: [],
      pan: tt.pan,
      effects: tt.effects ? structuredClone(tt.effects).map((e) => ({ ...e, id: uuidv4() })) : undefined,
      midiEffects: tt.midiEffects ? structuredClone(tt.midiEffects).map((e) => ({ ...e, id: uuidv4() })) : undefined,
      synthPreset: tt.synthPreset,
      drumKit: tt.drumKit,
      localCaption: tt.localCaption,
      sequencerPattern: tt.sequencerPattern ? structuredClone(tt.sequencerPattern) : undefined,
    }));

    const project: Project = {
      id: uuidv4(),
      name: projectName?.trim() || template.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      bpm,
      keyScale: template.keyScale,
      timeSignature: timeSig,
      timeSignatureDenominator: timeSigDenominator,
      totalDuration: measures * getBarDurationSec(bpm, timeSig, timeSigDenominator),
      measures,
      tracks,
      trackPresets: [],
      generationDefaults: structuredClone(template.generationDefaults),
      globalCaption: '',
      mastering: createDefaultMasteringState(),
    };

    set({ project: ensureProjectSession(project) });

    if (template.tracks.length > MAX_PROJECT_TRACKS) {
      toastError(`Template was limited to ${MAX_PROJECT_TRACKS} tracks`);
    }
  },

  exportMidiClip: (clipId: string) => {
    const project = get().project;
    if (!project) {
      toastError('Create or open a project before exporting MIDI');
      return;
    }

    const track = project.tracks.find((candidate) => candidate.clips.some((clip) => clip.id === clipId));
    const clip = track?.clips.find((candidate) => candidate.id === clipId);

    if (!track || !clip?.midiData) {
      toastError('Select a MIDI clip to export');
      return;
    }

    if (clip.midiData.notes.length === 0) {
      toastError('MIDI clip has no notes to export');
      return;
    }

    const numerator = project.timeSignatureMap?.[0]?.numerator ?? project.timeSignature;
    const denominator = project.timeSignatureMap?.[0]?.denominator ?? 4;
    const clipDurationBeats = Math.max(
      clip.duration * (project.bpm / 60),
      clip.midiData.notes.reduce((max, note) => Math.max(max, note.startBeat + note.durationBeats), 0),
    );

    const bytes = encodeMidiFile(clip.midiData.notes, {
      bpm: project.bpm,
      timeSignature: { numerator, denominator },
      trackName: track.displayName,
      clipDurationBeats,
    });

    const fileName = [
      sanitizeFileNameSegment(project.name),
      sanitizeFileNameSegment(track.displayName),
      sanitizeFileNameSegment(clip.prompt || 'midi-clip'),
    ].join('_');

    downloadBlob(
      new Blob([Uint8Array.from(bytes)], { type: 'audio/midi' }),
      `${fileName}.mid`,
    );
    toastSuccess(`Exported MIDI clip from ${track.displayName}`);
  },

  exportTrackMidi: (trackId: string) => {
    const project = get().project;
    if (!project) {
      toastError('Create or open a project before exporting MIDI');
      return;
    }

    const track = project.tracks.find((t) => t.id === trackId);
    if (!track) {
      toastError('Track not found');
      return;
    }

    const bpm = project.bpm;
    const secPerBeat = 60 / bpm;
    const allNotes: MidiNote[] = [];

    for (const clip of track.clips) {
      if (!clip.midiData?.notes.length) continue;
      const clipStartBeat = clip.startTime / secPerBeat;
      for (const note of clip.midiData.notes) {
        allNotes.push({
          ...note,
          id: note.id,
          startBeat: clipStartBeat + note.startBeat,
        });
      }
    }

    if (allNotes.length === 0) {
      toastError('Track has no MIDI notes to export');
      return;
    }

    const numerator = project.timeSignatureMap?.[0]?.numerator ?? project.timeSignature;
    const denominator = project.timeSignatureMap?.[0]?.denominator ?? 4;

    const bytes = encodeMidiFile(allNotes, {
      bpm,
      timeSignature: { numerator, denominator },
      trackName: track.displayName,
    });

    const fileName = [
      sanitizeFileNameSegment(project.name),
      sanitizeFileNameSegment(track.displayName),
    ].join('_');

    downloadBlob(
      new Blob([Uint8Array.from(bytes)], { type: 'audio/midi' }),
      `${fileName}.mid`,
    );
    toastSuccess(`Exported MIDI from ${track.displayName}`);
  },

  exportProjectMidi: () => {
    const project = get().project;
    if (!project) {
      toastError('Create or open a project before exporting MIDI');
      return;
    }

    const bpm = project.bpm;
    const secPerBeat = 60 / bpm;
    const numerator = project.timeSignatureMap?.[0]?.numerator ?? project.timeSignature;
    const denominator = project.timeSignatureMap?.[0]?.denominator ?? 4;

    const exportTracks: MidiExportTrack[] = [];
    let channelIndex = 0;

    for (const track of project.tracks) {
      const allNotes: MidiNote[] = [];
      for (const clip of track.clips) {
        if (!clip.midiData?.notes.length) continue;
        const clipStartBeat = clip.startTime / secPerBeat;
        for (const note of clip.midiData.notes) {
          allNotes.push({
            ...note,
            id: note.id,
            startBeat: clipStartBeat + note.startBeat,
          });
        }
      }

      if (allNotes.length > 0) {
        exportTracks.push({
          name: track.displayName,
          channel: channelIndex % 16,
          notes: allNotes,
        });
        channelIndex++;
      }
    }

    if (exportTracks.length === 0) {
      toastError('No MIDI tracks with notes to export');
      return;
    }

    const encoded = encodeMultiTrackMidiFile(exportTracks, {
      bpm,
      timeSignature: { bar: 1, numerator, denominator },
    });

    const fileName = sanitizeFileNameSegment(project.name);

    downloadBlob(
      new Blob([new Uint8Array(encoded)], { type: 'audio/midi' }),
      `${fileName}.mid`,
    );
    toastSuccess(`Exported ${exportTracks.length} MIDI track${exportTracks.length > 1 ? 's' : ''} from ${project.name}`);
  },


  // ── Groove Pool ─────────────────────────────────────────────────────────

  extractGrooveFromClip: (clipId, name, options) => {
    const state = get();
    if (!state.project) return undefined;

    let notes: MidiNote[] | undefined;
    for (const track of state.project.tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip?.midiData) {
        notes = clip.midiData.notes;
        break;
      }
    }
    if (!notes || notes.length === 0) return undefined;

    const extracted = extractGroove(notes, options);
    const template: GrooveTemplate = {
      id: uuidv4(),
      name,
      ...extracted,
      createdAt: Date.now(),
    };

    _pushHistory(state.project);

    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        groovePool: [...(state.project.groovePool ?? []), template],
      },
    });
    return template;
  },

  captureMidi: (trackId, captureTime, captureService, options) => {
    const state = get();
    if (!state.project) return undefined;

    const track = state.project.tracks.find((t) => t.id === trackId);
    if (!track) return undefined;

    const bpm = state.project.bpm;
    const timeSig = state.project.timeSignature;
    const bars = options?.bars ?? 4;

    const result = captureService.drain(trackId, captureTime, bpm, timeSig, bars);
    if (!result) return undefined;

    _pushHistory(state.project);

    const grid: PianoRollGrid = options?.quantize ?? '1/16';
    const midiNotes: MidiNote[] = result.notes.map((n) => ({
      id: uuidv4(),
      pitch: n.pitch,
      startBeat: n.startBeat,
      durationBeats: n.durationBeats,
      velocity: n.velocity,
    }));

    // Optionally quantize
    let finalNotes = midiNotes;
    if (options?.quantize) {
      const gridMap: Record<PianoRollGrid, number> = { '1/4': 1, '1/8': 0.5, '1/16': 0.25, '1/32': 0.125 };
      const gridBeats = gridMap[options.quantize];
      const allIds = new Set(midiNotes.map((n) => n.id));
      finalNotes = applyQuantize(midiNotes, allIds, { gridBeats, strength: 100, swing: 0, scope: 'preserveDuration' });
    }

    const clip: Clip = {
      id: uuidv4(),
      trackId,
      startTime: result.clipStartTime,
      duration: result.clipDuration,
      prompt: 'Captured MIDI',
      lyrics: '',
      generationStatus: 'ready',
      generationJobId: null,
      cumulativeMixKey: null,
      isolatedAudioKey: null,
      waveformPeaks: null,
      source: 'uploaded',
      midiData: { notes: finalNotes, grid },
    };

    const newTracks = state.project.tracks.map((t) =>
      t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t,
    );

    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(
          newTracks,
          state.project.measures,
          bpm,
          timeSig,
          state.project.timeSignatureDenominator,
          state.project.tempoMap,
          state.project.timeSignatureMap,
        ),
        tracks: newTracks,
      },
    });

    toastSuccess('Captured MIDI from rolling buffer');
    return clip.id;
  },

  applyGrooveToClip: (clipId, noteIds, grooveId, options) => {
    const state = get();
    if (!state.project) return;

    const groove = state.project.groovePool?.find((g) => g.id === grooveId);
    if (!groove) return;

    const noteIdSet = new Set(noteIds);
    _pushHistory(state.project);
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
            const grooved = applyGroove(selected, groove, options);
            return {
              ...clip,
              midiData: { ...clip.midiData, notes: [...unselected, ...grooved] },
            };
          }),
        })),
      },
    });
  },

  addGrooveTemplate: (template) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        groovePool: [...(state.project.groovePool ?? []), template],
      },
    });
  },

  deleteGrooveTemplate: (grooveId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        groovePool: (state.project.groovePool ?? []).filter((g) => g.id !== grooveId),
      },
    });
  },

  importMidiFile: async (file, options) => {
    const state = get();
    if (!state.project) return [];

    try {
      const parsed = parseMidiFile(await file.arrayBuffer());
      if (parsed.tracks.length === 0) {
        toastError('No MIDI note data found in file');
        return [];
      }

      const startTime = options?.startTime ?? 0;
      const applyMetadata = options?.applyMetadata ?? false;

      let effectiveBpm = state.project.bpm;
      let effectiveTimeSignature = state.project.timeSignature;

      if (applyMetadata) {
        const updates: Partial<Pick<Project, 'bpm' | 'timeSignature'>> = {};
        if (parsed.bpm !== undefined) {
          effectiveBpm = parsed.bpm;
          updates.bpm = parsed.bpm;
        }
        if (parsed.timeSignature && parsed.timeSignature.denominator === 4) {
          effectiveTimeSignature = parsed.timeSignature.numerator;
          updates.timeSignature = parsed.timeSignature.numerator;
        }
        if (Object.keys(updates).length > 0) {
          get().updateProject(updates);
        }
      }

      const baseName = file.name.replace(/\.(mid|midi)$/i, '');
      const trackIds: string[] = [];

      for (let index = 0; index < parsed.tracks.length; index++) {
        const parsedTrack = parsed.tracks[index];
        const track = get().addTrack('keyboard', 'pianoRoll');
        trackIds.push(track.id);

        get().updateTrack(track.id, {
          displayName: parsedTrack.name || (parsed.tracks.length === 1 ? baseName : `${baseName} ${index + 1}`),
        });

        const clipBeats = parsedTrack.notes.reduce(
          (max, note) => Math.max(max, note.startBeat + note.durationBeats),
          effectiveTimeSignature,
        );
        const clipDurationSeconds = Math.max(
          (clipBeats * 60) / effectiveBpm,
          (effectiveTimeSignature * 60) / effectiveBpm,
        );

        get().addClip(track.id, {
          startTime,
          duration: clipDurationSeconds,
          prompt: `Imported MIDI: ${file.name}`,
          lyrics: '',
          source: 'uploaded',
          midiData: {
            notes: parsedTrack.notes.map((note) => ({ ...note, id: uuidv4() })),
            grid: '1/16' as PianoRollGrid,
          },
        });
      }

      toastSuccess(`Imported MIDI into ${parsed.tracks.length} piano roll track${parsed.tracks.length === 1 ? '' : 's'}`);
      return trackIds;
    } catch (error) {
      console.error(error);
      toastError(`Failed to import MIDI file: ${file.name}`);
      return [];
    }
  },

  renameGrooveTemplate: (grooveId, name) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        groovePool: (state.project.groovePool ?? []).map((g) =>
          g.id === grooveId ? { ...g, name } : g,
        ),
      },
    });
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
