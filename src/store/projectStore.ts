import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { Project, Track, Clip, ClipVersion, TrackName, TrackType, ClipGenerationStatus, AssetClip, SequencerPattern, SequencerRow, SequencerStep } from '../types/project';
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

function _pushHistory(project: Project | null) {
  if (!project) return;
  _history.push(structuredClone(project));
  if (_history.length > MAX_HISTORY) _history.shift();
  _future.length = 0;
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

  updateProject: (updates: Partial<Pick<Project, 'globalCaption' | 'bpm' | 'keyScale' | 'timeSignature' | 'name' | 'masterVolume' | 'measures'>>) => void;
  updateTrackMixer: (trackId: string, updates: Partial<Pick<Track, 'pan' | 'eqLowGain' | 'eqMidGain' | 'eqHighGain' | 'compressorEnabled' | 'compressorThreshold' | 'compressorRatio'>>) => void;
  setTrackLocalCaption: (trackId: string, caption: string) => void;
  setTrackReverb: (trackId: string, mix: number, roomSize: number) => void;

  addTrack: (trackName: TrackName, trackType?: TrackType) => Track;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Pick<Track, 'displayName' | 'volume' | 'muted' | 'soloed' | 'laneHeight' | 'trackType'>>) => void;
  renameTrack: (trackId: string, newName: string) => void;
  reorderTrack: (draggedId: string, targetId: string, position: 'before' | 'after') => void;

  addClip: (trackId: string, clip: Omit<Clip, 'id' | 'trackId' | 'generationStatus' | 'generationJobId' | 'cumulativeMixKey' | 'isolatedAudioKey' | 'waveformPeaks'>) => Clip;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  removeClip: (clipId: string) => void;
  duplicateClip: (clipId: string) => Clip | undefined;
  updateClipStatus: (clipId: string, status: ClipGenerationStatus, extra?: Partial<Clip>) => void;
  /** Snapshot current audio state of a clip as a new version entry. */
  saveClipVersion: (clipId: string) => void;
  /** Restore clip audio fields from a version by index. */
  setActiveVersion: (clipId: string, idx: number) => void;

  splitClip: (clipId: string, splitTime: number) => void;
  toggleClipStar: (clipId: string) => void;
  moveClipToTrack: (clipId: string, targetTrackId: string, startTime?: number) => void;
  duplicateClipToTrack: (clipId: string, targetTrackId: string, startTime?: number) => Clip | undefined;
  batchDuplicateClips: (clipIds: string[], timeOffset: number) => void;

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

  getTrackById: (trackId: string) => Track | undefined;
  getClipById: (clipId: string) => Clip | undefined;
  getTrackForClip: (clipId: string) => Track | undefined;
  getTracksInGenerationOrder: () => Track[];
  /** Computed total duration: max(clip ends) + padding, minimum MIN_TIMELINE_DURATION */
  getTotalDuration: () => number;
  /** Actual audio duration without timeline padding: max(clip ends) */
  getAudioDuration: () => number;
}

function computeTotalDuration(
  tracks: Track[],
  measures?: number,
  bpm?: number,
  timeSig?: number,
): number {
  let maxEnd = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > maxEnd) maxEnd = end;
    }
  }
  const barDur = getBarDurationSec(bpm ?? DEFAULT_BPM, timeSig ?? DEFAULT_TIME_SIGNATURE);
  const measuredDuration = (measures ?? DEFAULT_MEASURES) * barDur;
  return Math.max(measuredDuration, maxEnd + TIMELINE_PADDING);
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
      tracks: project.tracks.map((t) => {
        if (t.trackType) return t;
        const inferred: TrackType =
          t.trackName === 'custom' && t.clips.some((c) => c.source === 'uploaded')
            ? 'sample'
            : t.trackName === 'custom'
              ? 'sample'
              : 'stems';
        return { ...t, trackType: inferred };
      }),
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
      generationDefaults: { ...DEFAULT_GENERATION },
      globalCaption: '',
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

  addTrack: (trackName, trackType) => {
    const state = get();
    if (!state.project) throw new Error('No project');
    _pushHistory(state.project);

    const resolvedType: TrackType = trackType ?? (trackName === 'custom' ? 'sample' : 'stems');
    const info = TRACK_CATALOG[trackName];
    const existingOrders = state.project.tracks.map((t) => t.order);
    const maxOrder = existingOrders.length > 0 ? Math.max(...existingOrders) : 0;

    const sameNameCount = state.project.tracks.filter((t) => t.trackName === trackName).length;
    const displayName = sameNameCount === 0 ? info.displayName : `${info.displayName} ${sameNameCount + 1}`;

    const track: Track = {
      id: uuidv4(),
      trackType: resolvedType,
      trackName,
      displayName,
      color: info.color,
      order: maxOrder + 1,
      volume: 0.8,
      muted: false,
      soloed: false,
      clips: [],
      laneHeight: resolvedType === 'sequencer' ? 80 : undefined,
    };

    // Auto-initialize sequencer pattern for sequencer tracks
    if (resolvedType === 'sequencer') {
      const stepsPerBar = 16;
      const bars = 1;
      const totalSteps = stepsPerBar * bars;
      track.sequencerPattern = {
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

  removeTrack: (trackId) => {
    const state = get();
    if (!state.project) return;
    _pushHistory(state.project);
    const newTracks = state.project.tracks.filter((t) => t.id !== trackId);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature),
        tracks: newTracks,
      },
    });
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
    };

    const newTracks = state.project.tracks.map((t) =>
      t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t,
    );

    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature),
        tracks: newTracks,
      },
    });

    return clip;
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
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature),
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
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature),
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
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature),
        tracks: newTracks,
      },
    });

    return newClip;
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
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature),
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
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature),
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
        totalDuration: computeTotalDuration(newTracks, state.project.measures, state.project.bpm, state.project.timeSignature),
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
