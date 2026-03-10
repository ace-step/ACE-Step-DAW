import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { Project, Track, Clip, TrackName, ClipGenerationStatus } from '../types/project';
import { TRACK_CATALOG } from '../constants/tracks';
import {
  DEFAULT_BPM,
  DEFAULT_KEY_SCALE,
  DEFAULT_TIME_SIGNATURE,
  DEFAULT_PROJECT_NAME,
  DEFAULT_GENERATION,
} from '../constants/defaults';
import { saveProject as saveProjectToIDB } from '../services/projectStorage';

const MIN_TIMELINE_DURATION = 30; // seconds
const TIMELINE_PADDING = 10;      // seconds beyond last clip

interface ProjectState {
  project: Project | null;

  setProject: (project: Project) => void;
  createProject: (params?: {
    name?: string;
    bpm?: number;
    keyScale?: string;
    timeSignature?: number;
  }) => void;

  addTrack: (trackName: TrackName) => Track;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Pick<Track, 'displayName' | 'volume' | 'muted' | 'soloed'>>) => void;

  addClip: (trackId: string, clip: Omit<Clip, 'id' | 'trackId' | 'generationStatus' | 'generationJobId' | 'cumulativeMixKey' | 'isolatedAudioKey' | 'waveformPeaks'>) => Clip;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  removeClip: (clipId: string) => void;
  duplicateClip: (clipId: string) => Clip | undefined;
  updateClipStatus: (clipId: string, status: ClipGenerationStatus, extra?: Partial<Clip>) => void;

  getTrackById: (trackId: string) => Track | undefined;
  getClipById: (clipId: string) => Clip | undefined;
  getTrackForClip: (clipId: string) => Track | undefined;
  getTracksInGenerationOrder: () => Track[];
  /** Computed total duration: max(clip ends) + padding, minimum MIN_TIMELINE_DURATION */
  getTotalDuration: () => number;
  /** Actual audio duration without timeline padding: max(clip ends) */
  getAudioDuration: () => number;
}

function computeTotalDuration(tracks: Track[]): number {
  let maxEnd = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > maxEnd) maxEnd = end;
    }
  }
  return Math.max(MIN_TIMELINE_DURATION, maxEnd + TIMELINE_PADDING);
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
  project: null,

  setProject: (project) => set({ project }),

  createProject: (params) => {
    const project: Project = {
      id: uuidv4(),
      name: params?.name ?? DEFAULT_PROJECT_NAME,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      bpm: params?.bpm ?? DEFAULT_BPM,
      keyScale: params?.keyScale ?? DEFAULT_KEY_SCALE,
      timeSignature: params?.timeSignature ?? DEFAULT_TIME_SIGNATURE,
      totalDuration: MIN_TIMELINE_DURATION,
      tracks: [],
      generationDefaults: { ...DEFAULT_GENERATION },
    };
    set({ project });
  },

  addTrack: (trackName) => {
    const state = get();
    if (!state.project) throw new Error('No project');

    const info = TRACK_CATALOG[trackName];
    const existingOrders = state.project.tracks.map((t) => t.order);
    const maxOrder = existingOrders.length > 0 ? Math.max(...existingOrders) : 0;

    const track: Track = {
      id: uuidv4(),
      trackName,
      displayName: info.displayName,
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
        totalDuration: computeTotalDuration(newTracks),
        tracks: newTracks,
      },
    });

    return track;
  },

  removeTrack: (trackId) => {
    const state = get();
    if (!state.project) return;
    const newTracks = state.project.tracks.filter((t) => t.id !== trackId);
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks),
        tracks: newTracks,
      },
    });
  },

  updateTrack: (trackId, updates) => {
    const state = get();
    if (!state.project) return;
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

  addClip: (trackId, clipData) => {
    const state = get();
    if (!state.project) throw new Error('No project');

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
        totalDuration: computeTotalDuration(newTracks),
        tracks: newTracks,
      },
    });

    return clip;
  },

  updateClip: (clipId, updates) => {
    const state = get();
    if (!state.project) return;
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
        totalDuration: computeTotalDuration(newTracks),
        tracks: newTracks,
      },
    });
  },

  removeClip: (clipId) => {
    const state = get();
    if (!state.project) return;
    const newTracks = state.project.tracks.map((t) => ({
      ...t,
      clips: t.clips.filter((c) => c.id !== clipId),
    }));
    set({
      project: {
        ...state.project,
        updatedAt: Date.now(),
        totalDuration: computeTotalDuration(newTracks),
        tracks: newTracks,
      },
    });
  },

  duplicateClip: (clipId) => {
    const state = get();
    if (!state.project) return undefined;

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
        totalDuration: computeTotalDuration(newTracks),
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
