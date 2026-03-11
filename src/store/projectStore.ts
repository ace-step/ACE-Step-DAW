import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { Project, Track, Clip, ClipVersion, TrackName, ClipGenerationStatus } from '../types/project';
import { TRACK_CATALOG } from '../constants/tracks';
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

  addTrack: (trackName: TrackName) => Track;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Pick<Track, 'displayName' | 'volume' | 'muted' | 'soloed'>>) => void;
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
    set({ project });
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

  addTrack: (trackName) => {
    const state = get();
    if (!state.project) throw new Error('No project');
    _pushHistory(state.project);

    const info = TRACK_CATALOG[trackName];
    const existingOrders = state.project.tracks.map((t) => t.order);
    const maxOrder = existingOrders.length > 0 ? Math.max(...existingOrders) : 0;

    // When duplicate track names exist, append an incrementing suffix: "Drums 2", "Drums 3", …
    const sameNameCount = state.project.tracks.filter((t) => t.trackName === trackName).length;
    const displayName = sameNameCount === 0 ? info.displayName : `${info.displayName} ${sameNameCount + 1}`;

    const track: Track = {
      id: uuidv4(),
      trackName,
      displayName,
      color: info.color,
      order: maxOrder + 1,
      volume: 0.8,
      muted: false,
      soloed: false,
      clips: [],
    };

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

  updateClipStatus: (clipId, status, extra) => {
    const state = get();
    if (!state.project) return;
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        tracks: state.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, generationStatus: status, ...extra } : c,
          ),
        })),
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
