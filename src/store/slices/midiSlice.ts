/**
 * MIDI note operations slice for projectStore.
 *
 * Extracted from projectStore.ts to reduce file size and improve testability.
 * This slice handles: addMidiNote, updateMidiNote, resizeMidiNote, removeMidiNote,
 * setNoteVelocity, quantizeMidiNotes, stampChord, populateMidiPattern, setMidiGrid,
 * transformMidiNotes.
 */
import { v4 as uuidv4 } from 'uuid';
import type { MidiNote, PianoRollGrid, Project } from '../../types/project';
import { quantizeNotes as applyQuantize, type QuantizeOptions } from '../../utils/midiQuantize';
import { applyTransform, type TransformOptions } from '../../utils/midiTransforms';
import { generatePattern, type PatternOptions } from '../../utils/midiPatternGenerator';

/** History scope for undo/redo bucketing (mirrors projectStore's HistoryScope). */
type HistoryScope = 'arrangement' | 'track' | 'pianoRoll' | 'mixer';

/** History options accepted by the shared pushHistory helper. */
interface HistoryOptions {
  trackId?: string;
  clipId?: string;
  scope?: HistoryScope;
  label?: string;
}

// Shared helpers injected from projectStore
export interface MidiSliceDeps {
  isViewerMode: () => boolean;
  pushHistory: (project: Project | null, options?: HistoryOptions) => void;
}

// Zustand set/get functions
type SetFn = (partial: { project: Project | null }) => void;
type GetFn = () => { project: Project | null };

/** Append notes to a clip's midiData (pure function). */
export function appendMidiNotesToClip(project: Project, clipId: string, newNotes: MidiNote[]): Project {
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

/** Update a clip's midiData notes immutably (pure function). */
function updateClipMidiNotes(
  project: Project,
  clipId: string,
  updater: (notes: MidiNote[]) => MidiNote[],
): Project {
  return {
    ...project,
    updatedAt: Date.now(),
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) =>
        clip.id === clipId && clip.midiData
          ? {
              ...clip,
              midiData: {
                ...clip.midiData,
                notes: updater(clip.midiData.notes),
              },
            }
          : clip,
      ),
    })),
  };
}

export interface MidiSliceActions {
  addMidiNote: (clipId: string, note: Omit<MidiNote, 'id'> & { id?: string }) => string | undefined;
  updateMidiNote: (clipId: string, noteId: string, updates: Partial<MidiNote>) => void;
  resizeMidiNote: (clipId: string, noteId: string, input: {
    edge: 'left' | 'right';
    startBeat?: number;
    endBeat?: number;
    minDurationBeats?: number;
  }) => void;
  removeMidiNote: (clipId: string, noteId: string) => void;
  setNoteVelocity: (clipId: string, noteId: string, velocity: number) => void;
  quantizeMidiNotes: (clipId: string, noteIds: string[], gridBeatsOrOptions: number | QuantizeOptions) => void;
  stampChord: (clipId: string, rootPitch: number, intervals: number[], startBeat: number, durationBeats: number, velocity?: number) => string[];
  populateMidiPattern: (clipId: string, options: PatternOptions) => string[];
  setMidiGrid: (clipId: string, grid: PianoRollGrid) => void;
  transformMidiNotes: (clipId: string, noteIds: string[], transform: TransformOptions) => void;
}

export function createMidiSlice(
  set: SetFn,
  get: GetFn,
  deps: MidiSliceDeps,
): MidiSliceActions {
  return {
    addMidiNote: (clipId, note) => {
      const state = get();
      if (deps.isViewerMode()) return undefined;
      if (!state.project) return undefined;
      const noteId = note.id ?? uuidv4();
      const noteWithId: MidiNote = { ...note, id: noteId };
      deps.pushHistory(state.project, { scope: 'pianoRoll', label: 'Add MIDI note', clipId });
      set({ project: appendMidiNotesToClip(state.project, clipId, [noteWithId]) });
      return noteId;
    },

    updateMidiNote: (clipId, noteId, updates) => {
      const state = get();
      if (deps.isViewerMode()) return;
      if (!state.project) return;
      deps.pushHistory(state.project, { scope: 'pianoRoll', label: 'Edit MIDI note', clipId });
      set({
        project: updateClipMidiNotes(state.project, clipId, (notes) =>
          notes.map((note) => (note.id === noteId ? { ...note, ...updates } : note)),
        ),
      });
    },

    resizeMidiNote: (clipId, noteId, input) => {
      const state = get();
      if (deps.isViewerMode()) return;
      if (!state.project) return;
      const minDurationBeats = Math.max(0.001, input.minDurationBeats ?? 0.125);
      deps.pushHistory(state.project, { scope: 'pianoRoll', label: 'Resize MIDI note', clipId });
      set({
        project: updateClipMidiNotes(state.project, clipId, (notes) =>
          notes.map((note) => {
            if (note.id !== noteId) return note;
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
        ),
      });
    },

    removeMidiNote: (clipId, noteId) => {
      const state = get();
      if (deps.isViewerMode()) return;
      if (!state.project) return;
      deps.pushHistory(state.project, { scope: 'pianoRoll', label: 'Delete MIDI note', clipId });
      set({
        project: updateClipMidiNotes(state.project, clipId, (notes) =>
          notes.filter((note) => note.id !== noteId),
        ),
      });
    },

    setNoteVelocity: (clipId, noteId, velocity) => {
      const state = get();
      if (deps.isViewerMode()) return;
      if (!state.project) return;
      const clampedVelocity = Math.round(Math.max(1, Math.min(127, velocity)));
      deps.pushHistory(state.project, { scope: 'pianoRoll', label: 'Set note velocity', clipId });
      set({
        project: updateClipMidiNotes(state.project, clipId, (notes) =>
          notes.map((note) => (note.id === noteId ? { ...note, velocity: clampedVelocity } : note)),
        ),
      });
    },

    quantizeMidiNotes: (clipId, noteIds, gridBeatsOrOptions) => {
      const state = get();
      const options: QuantizeOptions =
        typeof gridBeatsOrOptions === 'number'
          ? { gridBeats: gridBeatsOrOptions, strength: 100, swing: 0, scope: 'start' }
          : gridBeatsOrOptions;
      if (!state.project || options.gridBeats <= 0) return;
      deps.pushHistory(state.project, { scope: 'pianoRoll', label: 'Quantize MIDI notes', clipId });
      const noteIdSet = new Set(noteIds);
      set({
        project: updateClipMidiNotes(state.project, clipId, (notes) =>
          applyQuantize(notes, noteIdSet, options),
        ),
      });
    },

    stampChord: (clipId, rootPitch, intervals, startBeat, durationBeats, velocity = 100) => {
      const state = get();
      if (deps.isViewerMode()) return [];
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
      deps.pushHistory(state.project, { scope: 'pianoRoll', label: 'Stamp chord', clipId });
      set({ project: appendMidiNotesToClip(state.project, clipId, newNotes) });
      return newNotes.map((note) => note.id);
    },

    populateMidiPattern: (clipId, options) => {
      const state = get();
      if (!state.project) return [];
      deps.pushHistory(state.project, { scope: 'pianoRoll', label: 'Generate MIDI pattern', clipId });
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
                      notes: newNotes,
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
      deps.pushHistory(state.project, { scope: 'pianoRoll', label: 'Set MIDI grid', clipId });
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
      deps.pushHistory(state.project, { scope: 'pianoRoll', label: 'Transform MIDI notes', clipId });
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
  };
}
