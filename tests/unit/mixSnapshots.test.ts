import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, Track, ReturnTrack } from '../../src/types/project';
import { useProjectStore } from '../../src/store/projectStore';
import { useCollaborationStore } from '../../src/store/collaborationStore';
import { saveProject as saveProjectToIDB } from '../../src/services/projectStorage';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/services/audioFileManager', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/audioFileManager')>('../../src/services/audioFileManager');
  return { ...actual, loadAudioBlobByKey: vi.fn(), saveAudioBlob: vi.fn() };
});

vi.mock('../../src/hooks/useToast', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    ctx: {
      createBuffer: vi.fn((_n: number, len: number, sr: number) => ({
        numberOfChannels: _n,
        length: len,
        sampleRate: sr,
        duration: len / sr,
        getChannelData: () => new Float32Array(len),
      })),
    },
    decodeAudioData: vi.fn(),
  }),
}));

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    trackName: 'vocals',
    displayName: 'Vocals',
    color: '#ff0000',
    order: 0,
    volume: 0.75,
    muted: false,
    soloed: false,
    clips: [],
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Test',
    createdAt: 1,
    updatedAt: 1,
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    totalDuration: 256,
    measures: 128,
    tracks: [makeTrack()],
    trackPresets: [],
    generationDefaults: {
      inferenceSteps: 20,
      guidanceScale: 7.5,
      shift: 0,
      thinking: false,
      model: 'test-model',
    },
    globalCaption: '',
    automationLanes: [],
    assets: [],
    ...overrides,
  };
}

function seed(overrides: Partial<Project> = {}) {
  const project = makeProject(overrides);
  useProjectStore.getState().setProject(project);
  return project;
}

describe('Mix Snapshots Store Actions', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useCollaborationStore.getState().reset();
    vi.mocked(saveProjectToIDB).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── saveMixSnapshot ─────────────────────────────────────────────

  describe('saveMixSnapshot', () => {
    it('creates a snapshot and adds it to the project', () => {
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.6 })] });
      const snapshot = useProjectStore.getState().saveMixSnapshot('Mix A');

      expect(snapshot.name).toBe('Mix A');
      expect(snapshot.id).toBeTruthy();
      expect(snapshot.trackStates).toHaveLength(1);
      expect(snapshot.trackStates[0].volume).toBe(0.6);

      const project = useProjectStore.getState().project!;
      expect(project.mixSnapshots).toHaveLength(1);
      expect(project.mixSnapshots![0].id).toBe(snapshot.id);
    });

    it('preserves existing snapshots when adding new one', () => {
      seed();
      useProjectStore.getState().saveMixSnapshot('Mix A');
      useProjectStore.getState().saveMixSnapshot('Mix B');

      const project = useProjectStore.getState().project!;
      expect(project.mixSnapshots).toHaveLength(2);
      expect(project.mixSnapshots![0].name).toBe('Mix A');
      expect(project.mixSnapshots![1].name).toBe('Mix B');
    });

    it('captures master volume', () => {
      seed({ masterVolume: 0.85 });
      const snapshot = useProjectStore.getState().saveMixSnapshot('Test');
      expect(snapshot.masterVolume).toBe(0.85);
    });

    it('captures return track states', () => {
      seed({
        returnTracks: [{ id: 'rt1', name: 'Reverb', effects: [], volume: 0.7, pan: 0.2 }],
      });
      const snapshot = useProjectStore.getState().saveMixSnapshot('Test');
      expect(snapshot.returnTrackStates).toHaveLength(1);
      expect(snapshot.returnTrackStates[0].volume).toBe(0.7);
      expect(snapshot.returnTrackStates[0].pan).toBe(0.2);
    });

    it('updates project updatedAt timestamp', () => {
      seed();
      const before = useProjectStore.getState().project!.updatedAt;
      useProjectStore.getState().saveMixSnapshot('Test');
      const after = useProjectStore.getState().project!.updatedAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    it('throws if no project is loaded', () => {
      expect(() => useProjectStore.getState().saveMixSnapshot('Test')).toThrow();
    });

    it('throws and does not mutate in viewer mode', () => {
      seed();
      useCollaborationStore.getState().setViewerMode(true);

      expect(() => useProjectStore.getState().saveMixSnapshot('Read Only')).toThrow(/viewer mode/i);
      expect(useProjectStore.getState().project!.mixSnapshots).toBeUndefined();
    });
  });

  // ── loadMixSnapshot ─────────────────────────────────────────────

  describe('loadMixSnapshot', () => {
    it('restores track volumes from snapshot', () => {
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.5 })] });
      const snapshot = useProjectStore.getState().saveMixSnapshot('Saved');

      // Change volume
      useProjectStore.getState().updateTrack('t1', { volume: 0.9 });
      expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.9);

      // Load snapshot
      useProjectStore.getState().loadMixSnapshot(snapshot.id);
      expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.5);
    });

    it('restores mute/solo state', () => {
      seed({ tracks: [makeTrack({ id: 't1', muted: true, soloed: false })] });
      const snapshot = useProjectStore.getState().saveMixSnapshot('Saved');

      useProjectStore.getState().updateTrack('t1', { muted: false, soloed: true });
      useProjectStore.getState().loadMixSnapshot(snapshot.id);

      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.muted).toBe(true);
      expect(track.soloed).toBe(false);
    });

    it('restores pan and EQ settings', () => {
      seed({
        tracks: [makeTrack({ id: 't1', pan: -0.5, eqLowGain: 3, eqMidGain: -2, eqHighGain: 1 })],
      });
      const snapshot = useProjectStore.getState().saveMixSnapshot('Saved');

      useProjectStore.getState().updateTrackMixer('t1', { pan: 0.8, eqLowGain: 0 });
      useProjectStore.getState().loadMixSnapshot(snapshot.id);

      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.pan).toBe(-0.5);
      expect(track.eqLowGain).toBe(3);
    });

    it('restores master volume', () => {
      seed({ masterVolume: 0.8 });
      const snapshot = useProjectStore.getState().saveMixSnapshot('Saved');

      useProjectStore.getState().updateProject({ masterVolume: 0.5 });
      useProjectStore.getState().loadMixSnapshot(snapshot.id);

      expect(useProjectStore.getState().project!.masterVolume).toBe(0.8);
    });

    it('restores empty sends and effects from snapshots', () => {
      seed({
        tracks: [
          makeTrack({
            id: 't1',
            sends: [],
            effects: [],
          }),
        ],
      });
      const snapshot = useProjectStore.getState().saveMixSnapshot('Dry');

      useProjectStore.getState().updateTrack('t1', {
        sends: [{ returnTrackId: 'rt1', amount: 0.8, prePost: 'post' }],
        effects: [{ id: 'fx-1', type: 'reverb', enabled: true, params: { decay: 2.5, mix: 0.4 } }],
      });
      useProjectStore.getState().loadMixSnapshot(snapshot.id);

      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.sends).toEqual([]);
      expect(track.effects).toEqual([]);
    });

    it('does nothing if snapshot ID is invalid', () => {
      seed();
      useProjectStore.getState().saveMixSnapshot('Mix A');

      const before = useProjectStore.getState().project!;
      useProjectStore.getState().loadMixSnapshot('non-existent-id');
      const after = useProjectStore.getState().project!;

      expect(before).toBe(after); // Same reference, no change
    });

    it('only applies to tracks that exist in the snapshot', () => {
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.5 })] });
      const snapshot = useProjectStore.getState().saveMixSnapshot('Saved');

      // Add a new track after the snapshot
      useProjectStore.getState().addTrack('guitar', 'pianoRoll');
      const tracks = useProjectStore.getState().project!.tracks;
      const newTrackId = tracks[tracks.length - 1].id;

      useProjectStore.getState().loadMixSnapshot(snapshot.id);

      // New track should be unchanged (no snapshot state for it)
      const newTrack = useProjectStore.getState().project!.tracks.find((t) => t.id === newTrackId)!;
      expect(newTrack).toBeDefined();
    });
  });

  // ── deleteMixSnapshot ───────────────────────────────────────────

  describe('deleteMixSnapshot', () => {
    it('removes the snapshot from the project', () => {
      seed();
      const snap1 = useProjectStore.getState().saveMixSnapshot('Mix A');
      useProjectStore.getState().saveMixSnapshot('Mix B');

      useProjectStore.getState().deleteMixSnapshot(snap1.id);

      const project = useProjectStore.getState().project!;
      expect(project.mixSnapshots).toHaveLength(1);
      expect(project.mixSnapshots![0].name).toBe('Mix B');
    });

    it('handles deleting non-existent snapshot gracefully', () => {
      seed();
      useProjectStore.getState().saveMixSnapshot('Mix A');
      useProjectStore.getState().deleteMixSnapshot('fake-id');

      expect(useProjectStore.getState().project!.mixSnapshots).toHaveLength(1);
    });
  });

  // ── renameMixSnapshot ───────────────────────────────────────────

  describe('renameMixSnapshot', () => {
    it('renames the snapshot', () => {
      seed();
      const snap = useProjectStore.getState().saveMixSnapshot('Old Name');
      useProjectStore.getState().renameMixSnapshot(snap.id, 'New Name');

      expect(useProjectStore.getState().project!.mixSnapshots![0].name).toBe('New Name');
    });

    it('does not affect other snapshots', () => {
      seed();
      useProjectStore.getState().saveMixSnapshot('Mix A');
      const snap2 = useProjectStore.getState().saveMixSnapshot('Mix B');

      useProjectStore.getState().renameMixSnapshot(snap2.id, 'Mix B Renamed');

      const snapshots = useProjectStore.getState().project!.mixSnapshots!;
      expect(snapshots[0].name).toBe('Mix A');
      expect(snapshots[1].name).toBe('Mix B Renamed');
    });
  });

  // ── toggleAbCompare ─────────────────────────────────────────────

  describe('toggleAbCompare', () => {
    it('toggles ON: applies snapshot state', () => {
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.5 })] });
      const snap = useProjectStore.getState().saveMixSnapshot('Mix A');

      // Change mix
      useProjectStore.getState().updateTrack('t1', { volume: 0.9 });
      expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.9);

      // Toggle A/B ON
      useProjectStore.getState().toggleAbCompare(snap.id);
      expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.5);
      expect(useProjectStore.getState().isAbComparing()).toBe(true);
      expect(useProjectStore.getState().getAbActiveSnapshotId()).toBe(snap.id);
    });

    it('toggles OFF: restores previous state', () => {
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.5 })] });
      const snap = useProjectStore.getState().saveMixSnapshot('Mix A');

      useProjectStore.getState().updateTrack('t1', { volume: 0.9 });

      // Toggle ON then OFF
      useProjectStore.getState().toggleAbCompare(snap.id);
      expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.5);

      useProjectStore.getState().toggleAbCompare(snap.id);
      expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.9);
      expect(useProjectStore.getState().isAbComparing()).toBe(false);
      expect(useProjectStore.getState().getAbActiveSnapshotId()).toBeNull();
    });

    it('does nothing if snapshot does not exist', () => {
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.5 })] });

      useProjectStore.getState().toggleAbCompare('non-existent');
      expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.5);
      expect(useProjectStore.getState().isAbComparing()).toBe(false);
    });

    it('switches A/B targets while restoring back to the original mix', () => {
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.5 })] });
      const snapA = useProjectStore.getState().saveMixSnapshot('Mix A');
      useProjectStore.getState().updateTrack('t1', { volume: 0.7 });
      const snapB = useProjectStore.getState().saveMixSnapshot('Mix B');
      useProjectStore.getState().updateTrack('t1', { volume: 0.9 });

      useProjectStore.getState().toggleAbCompare(snapA.id);
      expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.5);

      useProjectStore.getState().toggleAbCompare(snapB.id);
      expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.7);

      useProjectStore.getState().toggleAbCompare(snapB.id);
      expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.9);
      expect(useProjectStore.getState().isAbComparing()).toBe(false);
    });

    it('autosaves non-mix edits during A/B while preserving the original mix', async () => {
      vi.useFakeTimers();
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.5 })] });
      const snap = useProjectStore.getState().saveMixSnapshot('Mix A');
      useProjectStore.getState().updateTrack('t1', { volume: 0.9 });
      useProjectStore.getState().toggleAbCompare(snap.id);
      expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.5);

      useProjectStore.getState().renameMixSnapshot(snap.id, 'Renamed During Compare');
      await vi.advanceTimersByTimeAsync(1000);
      await vi.runOnlyPendingTimersAsync();

      const savedProject = vi.mocked(saveProjectToIDB).mock.calls.at(-1)?.[0];
      expect(savedProject?.mixSnapshots?.[0].name).toBe('Renamed During Compare');
      expect(savedProject?.tracks[0].volume).toBe(0.9);
      expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.5);
    });

    it('clears active A/B state before undo and redo history changes', () => {
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.5 })] });
      const snap = useProjectStore.getState().saveMixSnapshot('Mix A');
      useProjectStore.getState().updateTrack('t1', { volume: 0.9 });
      useProjectStore.getState().toggleAbCompare(snap.id);
      expect(useProjectStore.getState().isAbComparing()).toBe(true);

      useProjectStore.getState().undo();

      expect(useProjectStore.getState().isAbComparing()).toBe(false);
      expect(useProjectStore.getState().getAbActiveSnapshotId()).toBeNull();

      useProjectStore.getState().redo();

      expect(useProjectStore.getState().isAbComparing()).toBe(false);
      expect(useProjectStore.getState().getAbActiveSnapshotId()).toBeNull();
    });

    it('loadMixSnapshot exits A/B mode', () => {
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.5 })] });
      const snap1 = useProjectStore.getState().saveMixSnapshot('Mix A');

      useProjectStore.getState().updateTrack('t1', { volume: 0.9 });
      useProjectStore.getState().toggleAbCompare(snap1.id);
      expect(useProjectStore.getState().isAbComparing()).toBe(true);

      // Load another snapshot should exit A/B
      useProjectStore.getState().loadMixSnapshot(snap1.id);
      expect(useProjectStore.getState().isAbComparing()).toBe(false);
    });

    it('loading a snapshot during A/B preserves the original mix as the undo base', () => {
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.5 })] });
      const snapA = useProjectStore.getState().saveMixSnapshot('Mix A');
      useProjectStore.getState().updateTrack('t1', { volume: 0.7 });
      const snapB = useProjectStore.getState().saveMixSnapshot('Mix B');
      useProjectStore.getState().updateTrack('t1', { volume: 0.9 });

      useProjectStore.getState().toggleAbCompare(snapA.id);
      expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.5);

      useProjectStore.getState().loadMixSnapshot(snapB.id);
      expect(useProjectStore.getState().isAbComparing()).toBe(false);
      expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.7);

      useProjectStore.getState().undo();
      expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.9);
    });

    it('deleteMixSnapshot exits A/B mode if deleting active snapshot', () => {
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.5 })] });
      const snap = useProjectStore.getState().saveMixSnapshot('Mix A');

      useProjectStore.getState().updateTrack('t1', { volume: 0.9 });
      useProjectStore.getState().toggleAbCompare(snap.id);
      expect(useProjectStore.getState().isAbComparing()).toBe(true);

      useProjectStore.getState().deleteMixSnapshot(snap.id);
      expect(useProjectStore.getState().isAbComparing()).toBe(false);
      expect(useProjectStore.getState().project!.tracks[0].volume).toBe(0.9);
    });

    it('setProject clears active A/B state', () => {
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.5 })] });
      const snap = useProjectStore.getState().saveMixSnapshot('Mix A');
      useProjectStore.getState().updateTrack('t1', { volume: 0.9 });
      useProjectStore.getState().toggleAbCompare(snap.id);
      expect(useProjectStore.getState().isAbComparing()).toBe(true);

      useProjectStore.getState().setProject(makeProject({ id: 'project-2' }));

      expect(useProjectStore.getState().isAbComparing()).toBe(false);
      expect(useProjectStore.getState().getAbActiveSnapshotId()).toBeNull();
    });

    it('createProject clears active A/B state', () => {
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.5 })] });
      const snap = useProjectStore.getState().saveMixSnapshot('Mix A');
      useProjectStore.getState().updateTrack('t1', { volume: 0.9 });
      useProjectStore.getState().toggleAbCompare(snap.id);
      expect(useProjectStore.getState().isAbComparing()).toBe(true);

      useProjectStore.getState().createProject({ name: 'Next' });

      expect(useProjectStore.getState().isAbComparing()).toBe(false);
      expect(useProjectStore.getState().getAbActiveSnapshotId()).toBeNull();
    });

    it('external setState project resets clear active A/B state', () => {
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.5 })] });
      const snap = useProjectStore.getState().saveMixSnapshot('Mix A');
      useProjectStore.getState().updateTrack('t1', { volume: 0.9 });
      useProjectStore.getState().toggleAbCompare(snap.id);
      expect(useProjectStore.getState().isAbComparing()).toBe(true);

      useProjectStore.setState({ project: null });

      expect(useProjectStore.getState().isAbComparing()).toBe(false);
      expect(useProjectStore.getState().getAbActiveSnapshotId()).toBeNull();
    });

    it('functional setState updates that do not replace the project preserve A/B state', () => {
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.5 })] });
      const snap = useProjectStore.getState().saveMixSnapshot('Mix A');
      useProjectStore.getState().updateTrack('t1', { volume: 0.9 });
      useProjectStore.getState().toggleAbCompare(snap.id);
      expect(useProjectStore.getState().isAbComparing()).toBe(true);

      useProjectStore.setState((state) => ({ abCompareRevision: state.abCompareRevision + 1 }));

      expect(useProjectStore.getState().isAbComparing()).toBe(true);
      expect(useProjectStore.getState().getAbActiveSnapshotId()).toBe(snap.id);
    });

    it('functional setState project resets clear active A/B state', () => {
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.5 })] });
      const snap = useProjectStore.getState().saveMixSnapshot('Mix A');
      useProjectStore.getState().updateTrack('t1', { volume: 0.9 });
      useProjectStore.getState().toggleAbCompare(snap.id);
      expect(useProjectStore.getState().isAbComparing()).toBe(true);

      useProjectStore.setState(() => ({ project: null }));

      expect(useProjectStore.getState().isAbComparing()).toBe(false);
      expect(useProjectStore.getState().getAbActiveSnapshotId()).toBeNull();
    });

    it('does not mutate project state in viewer mode', () => {
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.5 })] });
      const snap = useProjectStore.getState().saveMixSnapshot('Mix A');
      useProjectStore.getState().updateTrack('t1', { volume: 0.9 });
      const before = useProjectStore.getState().project!;

      useCollaborationStore.getState().setViewerMode(true);
      useProjectStore.getState().toggleAbCompare(snap.id);

      expect(useProjectStore.getState().project).toBe(before);
      expect(useProjectStore.getState().isAbComparing()).toBe(false);
    });

    it('blocks snapshot load, rename, and delete in viewer mode', () => {
      seed({ tracks: [makeTrack({ id: 't1', volume: 0.5 })] });
      const snap = useProjectStore.getState().saveMixSnapshot('Mix A');
      useProjectStore.getState().updateTrack('t1', { volume: 0.9 });

      useCollaborationStore.getState().setViewerMode(true);
      useProjectStore.getState().loadMixSnapshot(snap.id);
      useProjectStore.getState().renameMixSnapshot(snap.id, 'Renamed');
      useProjectStore.getState().deleteMixSnapshot(snap.id);

      const project = useProjectStore.getState().project!;
      expect(project.tracks[0].volume).toBe(0.9);
      expect(project.mixSnapshots).toHaveLength(1);
      expect(project.mixSnapshots![0].name).toBe('Mix A');
    });
  });

  // ── getAbActiveSnapshotId / isAbComparing ───────────────────────

  describe('A/B state accessors', () => {
    it('isAbComparing returns false by default', () => {
      seed();
      expect(useProjectStore.getState().isAbComparing()).toBe(false);
    });

    it('getAbActiveSnapshotId returns null by default', () => {
      seed();
      expect(useProjectStore.getState().getAbActiveSnapshotId()).toBeNull();
    });
  });
});
