import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../src/types/project';
import { useProjectStore } from '../../src/store/projectStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

function makeProject(): Project {
  return {
    id: 'project-1',
    name: 'Test Project',
    createdAt: 1,
    updatedAt: 1,
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    totalDuration: 128,
    measures: 64,
    tracks: [],
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
  };
}

describe('projectStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
  });

  describe('setProject / project getter', () => {
    it('stores the project and exposes it via the project getter', () => {
      const project = makeProject();

      useProjectStore.getState().setProject(project);

      expect(useProjectStore.getState().project).toEqual(project);
    });
  });

  describe('addTrack / removeTrack', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('adds tracks and removes the requested track', () => {
      const drumsTrack = useProjectStore.getState().addTrack('drums');
      const bassTrack = useProjectStore.getState().addTrack('bass');

      let project = useProjectStore.getState().project;
      expect(project?.tracks).toHaveLength(2);
      expect(project?.tracks.map((track) => track.id)).toEqual([drumsTrack.id, bassTrack.id]);

      useProjectStore.getState().removeTrack(drumsTrack.id);

      project = useProjectStore.getState().project;
      expect(project?.tracks).toHaveLength(1);
      expect(project?.tracks[0].id).toBe(bassTrack.id);
    });
  });

  describe('addClip basics', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('adds a clip to the target track with the expected default metadata', () => {
      const track = useProjectStore.getState().addTrack('drums');

      const clip = useProjectStore.getState().addClip(track.id, {
        startTime: 4,
        duration: 8,
        prompt: 'steady kick groove',
        lyrics: '',
        source: 'generated',
      });

      const storedTrack = useProjectStore.getState().project?.tracks[0];
      expect(storedTrack?.clips).toHaveLength(1);
      expect(storedTrack?.clips[0]).toMatchObject({
        id: clip.id,
        trackId: track.id,
        startTime: 4,
        duration: 8,
        prompt: 'steady kick groove',
        lyrics: '',
        source: 'generated',
        generationStatus: 'empty',
        generationJobId: null,
        cumulativeMixKey: null,
        isolatedAudioKey: null,
        waveformPeaks: null,
      });
    });
  });

  describe('automation lane operations', () => {
    const parameter = { type: 'mixer', param: 'volume' } as const;

    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('adds automation points into a sorted lane', () => {
      const track = useProjectStore.getState().addTrack('drums');

      useProjectStore.getState().addAutomationPoint(track.id, parameter, { time: 2, value: 0.3 });
      useProjectStore.getState().addAutomationPoint(track.id, parameter, { time: 1, value: 0.8 });

      expect(useProjectStore.getState().project?.automationLanes).toEqual([
        expect.objectContaining({
          trackId: track.id,
          parameter,
          points: [
            { time: 1, value: 0.8 },
            { time: 2, value: 0.3 },
          ],
        }),
      ]);
    });

    it('removes a single automation point by index', () => {
      const track = useProjectStore.getState().addTrack('drums');

      useProjectStore.getState().addAutomationPoint(track.id, parameter, { time: 1, value: 0.2 });
      useProjectStore.getState().addAutomationPoint(track.id, parameter, { time: 2, value: 0.7 });
      useProjectStore.getState().removeAutomationPoint(track.id, parameter, 0);

      expect(useProjectStore.getState().project?.automationLanes).toEqual([
        expect.objectContaining({
          trackId: track.id,
          parameter,
          points: [{ time: 2, value: 0.7 }],
        }),
      ]);
    });

    it('clears only the targeted automation lane', () => {
      const track = useProjectStore.getState().addTrack('drums');
      const panParameter = { type: 'mixer', param: 'pan' } as const;

      useProjectStore.getState().addAutomationPoint(track.id, parameter, { time: 1, value: 0.2 });
      useProjectStore.getState().addAutomationPoint(track.id, panParameter, { time: 1, value: 0.5 });
      useProjectStore.getState().clearAutomationLane(track.id, parameter);

      expect(useProjectStore.getState().project?.automationLanes).toEqual([
        expect.objectContaining({
          trackId: track.id,
          parameter: panParameter,
          points: [{ time: 1, value: 0.5 }],
        }),
      ]);
    });
  });

  describe('quantizeMidiNotes', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('snaps selected note startBeats to the nearest grid line', () => {
      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      const clip = useProjectStore.getState().ensureMidiClip(track.id);
      const noteId1 = useProjectStore.getState().addMidiNote(clip.id, {
        pitch: 60, startBeat: 0.3, durationBeats: 1, velocity: 100,
      })!;
      const noteId2 = useProjectStore.getState().addMidiNote(clip.id, {
        pitch: 64, startBeat: 1.7, durationBeats: 1, velocity: 80,
      })!;
      const noteId3 = useProjectStore.getState().addMidiNote(clip.id, {
        pitch: 67, startBeat: 3.1, durationBeats: 0.5, velocity: 90,
      })!;

      // Quantize notes 1 and 2 to quarter-note grid (1 beat), leave note 3 alone
      useProjectStore.getState().quantizeMidiNotes(clip.id, [noteId1, noteId2], 1);

      const notes = useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes;
      const n1 = notes.find(n => n.id === noteId1)!;
      const n2 = notes.find(n => n.id === noteId2)!;
      const n3 = notes.find(n => n.id === noteId3)!;

      expect(n1.startBeat).toBe(0);   // 0.3 → 0
      expect(n2.startBeat).toBe(2);   // 1.7 → 2
      expect(n3.startBeat).toBe(3.1); // unchanged
    });

    it('quantizes to eighth-note grid (0.5 beats)', () => {
      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      const clip = useProjectStore.getState().ensureMidiClip(track.id);
      const noteId = useProjectStore.getState().addMidiNote(clip.id, {
        pitch: 60, startBeat: 0.6, durationBeats: 1, velocity: 100,
      })!;

      useProjectStore.getState().quantizeMidiNotes(clip.id, [noteId], 0.5);

      const note = useProjectStore.getState().project!.tracks[0].clips[0].midiData!.notes[0];
      expect(note.startBeat).toBe(0.5); // 0.6 → 0.5
    });
  });
});

  describe('duplicateTrack', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('duplicates a track with all clips', () => {
      const original = useProjectStore.getState().addTrack('drums');
      useProjectStore.getState().addClip(original.id, {
        startTime: 0, duration: 30, prompt: 'test beat', lyrics: '',
      });

      const duplicate = useProjectStore.getState().duplicateTrack(original.id);

      expect(duplicate).toBeDefined();
      expect(duplicate!.id).not.toBe(original.id);
      expect(duplicate!.displayName).toBe('Drums (copy)');
      expect(duplicate!.clips).toHaveLength(1);
      expect(duplicate!.clips[0].id).not.toBe(original.clips[0]?.id);
      expect(duplicate!.clips[0].prompt).toBe('test beat');

      const tracks = useProjectStore.getState().project!.tracks;
      expect(tracks).toHaveLength(2);
    });

    it('returns undefined for non-existent track', () => {
      const result = useProjectStore.getState().duplicateTrack('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('reorderTrack', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('moves a track before another by updating order', () => {
      const drums = useProjectStore.getState().addTrack('drums');
      const bass = useProjectStore.getState().addTrack('bass');
      const keys = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');

      // Move keys before drums
      useProjectStore.getState().reorderTrack(keys.id, drums.id, 'before');

      const tracks = useProjectStore.getState().project!.tracks;
      const sorted = [...tracks].sort((a, b) => a.order - b.order);
      expect(sorted.map((t) => t.displayName)).toEqual(['Keyboard', 'Drums', 'Bass']);
    });

    it('moves a track after another by updating order', () => {
      const drums = useProjectStore.getState().addTrack('drums');
      const bass = useProjectStore.getState().addTrack('bass');
      const keys = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');

      // Move drums after keys
      useProjectStore.getState().reorderTrack(drums.id, keys.id, 'after');

      const tracks = useProjectStore.getState().project!.tracks;
      const sorted = [...tracks].sort((a, b) => a.order - b.order);
      expect(sorted.map((t) => t.displayName)).toEqual(['Bass', 'Keyboard', 'Drums']);
    });

    it('is undoable', () => {
      const drums = useProjectStore.getState().addTrack('drums');
      const bass = useProjectStore.getState().addTrack('bass');

      const orderBefore = useProjectStore.getState().project!.tracks.map((t) => ({ id: t.id, order: t.order }));

      useProjectStore.getState().reorderTrack(bass.id, drums.id, 'before');
      useProjectStore.getState().undo();

      const orderAfter = useProjectStore.getState().project!.tracks.map((t) => ({ id: t.id, order: t.order }));
      expect(orderAfter).toEqual(orderBefore);
    });
  });

describe('setClipFade', () => {
  beforeEach(() => {
    useProjectStore.getState().createProject();
  });

  it('sets fade in/out duration and curve on a clip', () => {
    const track = useProjectStore.getState().addTrack('drums');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0, duration: 10, prompt: 'beat', lyrics: '',
    });

    useProjectStore.getState().setClipFade(clip.id, {
      fadeInDuration: 0.5,
      fadeOutDuration: 1.0,
      fadeInCurve: 'exponential',
      fadeOutCurve: 'equal-power',
    });

    const updated = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(updated.fadeInDuration).toBe(0.5);
    expect(updated.fadeOutDuration).toBe(1.0);
    expect(updated.fadeInCurve).toBe('exponential');
    expect(updated.fadeOutCurve).toBe('equal-power');
  });

  it('partially updates fade properties without overwriting others', () => {
    const track = useProjectStore.getState().addTrack('drums');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0, duration: 10, prompt: 'beat', lyrics: '',
    });

    useProjectStore.getState().setClipFade(clip.id, {
      fadeInDuration: 0.3,
      fadeInCurve: 'linear',
    });
    useProjectStore.getState().setClipFade(clip.id, {
      fadeOutDuration: 0.8,
    });

    const updated = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(updated.fadeInDuration).toBe(0.3);
    expect(updated.fadeInCurve).toBe('linear');
    expect(updated.fadeOutDuration).toBe(0.8);
  });
});

describe('markers', () => {
  beforeEach(() => {
    useProjectStore.getState().createProject();
  });

  it('addMarker adds a marker and keeps the list sorted by time', () => {
    useProjectStore.getState().addMarker({ time: 10, name: 'Chorus', color: '#f59e0b' });
    useProjectStore.getState().addMarker({ time: 5, name: 'Verse', color: '#3b82f6' });

    const markers = useProjectStore.getState().project!.markers!;
    expect(markers).toHaveLength(2);
    expect(markers[0].time).toBe(5);
    expect(markers[0].name).toBe('Verse');
    expect(markers[1].time).toBe(10);
    expect(markers[1].name).toBe('Chorus');
  });

  it('removeMarker removes only the targeted marker', () => {
    const introMarker = useProjectStore.getState().addMarker({ time: 4, name: 'Intro', color: '#22c55e' });
    useProjectStore.getState().addMarker({ time: 20, name: 'Outro', color: '#ef4444' });

    useProjectStore.getState().removeMarker(introMarker.id);

    const markers = useProjectStore.getState().project!.markers!;
    expect(markers).toHaveLength(1);
    expect(markers[0].name).toBe('Outro');
  });

  it('updateMarker updates name, time, and color without affecting other markers', () => {
    const bridgeMarker = useProjectStore.getState().addMarker({ time: 8, name: 'Bridge', color: '#a855f7' });
    useProjectStore.getState().addMarker({ time: 16, name: 'Solo', color: '#f97316' });

    useProjectStore.getState().updateMarker(bridgeMarker.id, { name: 'Bridge (updated)', color: '#ec4899', time: 6 });

    const markers = useProjectStore.getState().project!.markers!;
    const updated = markers.find((m) => m.id === bridgeMarker.id)!;
    expect(updated.name).toBe('Bridge (updated)');
    expect(updated.color).toBe('#ec4899');
    expect(updated.time).toBe(6);
    // Other marker untouched
    const other = markers.find((m) => m.name === 'Solo')!;
    expect(other.time).toBe(16);
  });
});
