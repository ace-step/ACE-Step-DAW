import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../src/types/project';
import { useProjectStore } from '../../src/store/projectStore';
import { createDefaultMasteringState } from '../../src/utils/mastering';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

const mockLoadAudioBlobByKey = vi.fn();
const mockSaveAudioBlob = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('../../src/services/audioFileManager', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/audioFileManager')>('../../src/services/audioFileManager');
  return {
    ...actual,
    loadAudioBlobByKey: (...args: unknown[]) => mockLoadAudioBlobByKey(...args),
    saveAudioBlob: (...args: unknown[]) => mockSaveAudioBlob(...args),
  };
});

vi.mock('../../src/hooks/useToast', () => ({
  toastSuccess: (...args: unknown[]) => mockToastSuccess(...args),
  toastError: (...args: unknown[]) => mockToastError(...args),
}));

function createMockAudioBuffer(channelData: number[][], sampleRate = 4): AudioBuffer {
  const channels = channelData.map((values) => Float32Array.from(values));
  const length = channels[0]?.length ?? 0;
  return {
    numberOfChannels: channels.length,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (channel: number) => channels[channel],
  } as AudioBuffer;
}

const mockAudioContext = {
  createBuffer: vi.fn((numberOfChannels: number, length: number, sampleRate: number) => {
    const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    return {
      numberOfChannels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: (channel: number) => channels[channel],
    } as AudioBuffer;
  }),
};

const mockDecodeAudioData = vi.fn();

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    ctx: mockAudioContext,
    decodeAudioData: (...args: unknown[]) => mockDecodeAudioData(...args),
  }),
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
  };
}

describe('projectStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    mockLoadAudioBlobByKey.mockReset();
    mockSaveAudioBlob.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    mockDecodeAudioData.mockReset();
    mockAudioContext.createBuffer.mockClear();
  });

  describe('setProject / project getter', () => {
    it('stores the project and exposes it via the project getter', () => {
      const project = makeProject();

      useProjectStore.getState().setProject(project);

      const storedProject = useProjectStore.getState().project;

      expect(storedProject).toEqual(expect.objectContaining({
        ...project,
        mastering: createDefaultMasteringState(),
      }));
      expect(storedProject?.session).toMatchObject({
        quantization: '1 bar',
        slots: [],
        activeClipIdsByTrackId: {},
        pendingLaunches: [],
        isRecordingToArrangement: false,
        arrangementRecordStartTime: null,
        arrangementRecordEndTime: null,
        recordedLaunches: [],
        lastLaunchedSceneId: null,
        lastLaunchAt: null,
      });
      expect(storedProject?.session?.scenes).toHaveLength(4);
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

    it('updates and clears a clip color override', () => {
      const track = useProjectStore.getState().addTrack('drums');
      const clip = useProjectStore.getState().addClip(track.id, {
        startTime: 4,
        duration: 8,
        prompt: 'steady kick groove',
        lyrics: '',
        source: 'generated',
      });

      useProjectStore.getState().updateClipColor(clip.id, '#22c55e');
      expect(useProjectStore.getState().project?.tracks[0].clips[0].color).toBe('#22c55e');

      useProjectStore.getState().updateClipColor(clip.id, undefined);
      expect(useProjectStore.getState().project?.tracks[0].clips[0].color).toBeUndefined();
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

    it('creates a default effect automation lane once and removes it when the effect is deleted', () => {
      const track = useProjectStore.getState().addTrack('drums');
      const effectId = useProjectStore.getState().addTrackEffect(track.id, 'filter');
      expect(effectId).toBeDefined();

      const filterParameter = {
        type: 'effect',
        effectId: effectId!,
        effectType: 'filter',
        param: 'frequency',
      } as const;

      useProjectStore.getState().ensureAutomationLane(track.id, filterParameter, 0.4);
      useProjectStore.getState().ensureAutomationLane(track.id, filterParameter, 0.8);

      expect(useProjectStore.getState().project?.automationLanes).toEqual([
        expect.objectContaining({
          trackId: track.id,
          parameter: filterParameter,
          points: [
            { time: 0, value: 0.4 },
            { time: useProjectStore.getState().project?.totalDuration, value: 0.4 },
          ],
        }),
      ]);

      useProjectStore.getState().removeTrackEffect(track.id, effectId!);
      expect(useProjectStore.getState().project?.automationLanes).toEqual([]);
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

  describe('track effects', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('adds a parametric EQ effect with four default bands', () => {
      const track = useProjectStore.getState().addTrack('bass');
      const effectId = useProjectStore.getState().addTrackEffect(track.id, 'parametricEq');

      const effect = useProjectStore.getState().project?.tracks[0].effects?.find((item) => item.id === effectId);
      expect(effect?.type).toBe('parametricEq');
      expect(effect?.params.mode).toBe('parametric');
      expect(effect?.params.bands).toHaveLength(4);
    });
  });

  describe('exportMidiClip', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject({ name: 'MIDI Export Test' });
    });

    it('downloads a .mid file for a MIDI clip through the store API', () => {
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mid');
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.fn();
      const anchor = { click, href: '', download: '' } as unknown as HTMLAnchorElement;
      const originalCreateElement = document.createElement.bind(document);
      const createElement = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
        if (tagName === 'a') return anchor;
        return originalCreateElement(tagName);
      }) as typeof document.createElement);

      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      const clip = useProjectStore.getState().ensureMidiClip(track.id);
      useProjectStore.getState().updateTrack(track.id, { displayName: 'Lead Keys' });
      useProjectStore.getState().updateClip(clip.id, { prompt: 'Main Hook' });
      useProjectStore.getState().addMidiNote(clip.id, {
        pitch: 60,
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.8,
      });

      useProjectStore.getState().exportMidiClip(clip.id);

      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(anchor.download).toBe('MIDI Export Test_Lead Keys_Main Hook.mid');
      expect(click).toHaveBeenCalledOnce();

      createElement.mockRestore();
      revokeObjectURL.mockRestore();
      createObjectURL.mockRestore();
    });
  });

  describe('exportTrackMidi', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject({ name: 'Track MIDI Export' });
    });

    it('exports all MIDI clips from a track merged into a single .mid file', () => {
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mid');
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.fn();
      const anchor = { click, href: '', download: '' } as unknown as HTMLAnchorElement;
      const originalCreateElement = document.createElement.bind(document);
      const createElement = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
        if (tagName === 'a') return anchor;
        return originalCreateElement(tagName);
      }) as typeof document.createElement);

      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      useProjectStore.getState().updateTrack(track.id, { displayName: 'Lead Synth' });

      const clip1 = useProjectStore.getState().ensureMidiClip(track.id);
      useProjectStore.getState().addMidiNote(clip1.id, {
        pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8,
      });
      useProjectStore.getState().addClip(track.id, {
        startTime: 2, duration: 2, prompt: 'phrase-b', globalCaption: '', lyrics: '',
        midiData: { grid: '1/16', notes: [{ id: 'n2', pitch: 64, startBeat: 0, durationBeats: 1, velocity: 0.9 }] },
        source: 'uploaded',
      });

      useProjectStore.getState().exportTrackMidi(track.id);

      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(anchor.download).toBe('Track MIDI Export_Lead Synth.mid');
      expect(click).toHaveBeenCalledOnce();

      createElement.mockRestore();
      revokeObjectURL.mockRestore();
      createObjectURL.mockRestore();
    });

    it('shows error when track has no MIDI notes', () => {
      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      useProjectStore.getState().exportTrackMidi(track.id);
      expect(mockToastError).toHaveBeenCalledWith('Track has no MIDI notes to export');
    });
  });

  describe('exportProjectMidi', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject({ name: 'Project MIDI Export' });
    });

    it('exports all MIDI tracks as a multi-track .mid file', () => {
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mid');
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.fn();
      const anchor = { click, href: '', download: '' } as unknown as HTMLAnchorElement;
      const originalCreateElement = document.createElement.bind(document);
      const createElement = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
        if (tagName === 'a') return anchor;
        return originalCreateElement(tagName);
      }) as typeof document.createElement);

      const track1 = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      useProjectStore.getState().updateTrack(track1.id, { displayName: 'Piano' });
      const clip1 = useProjectStore.getState().ensureMidiClip(track1.id);
      useProjectStore.getState().addMidiNote(clip1.id, {
        pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8,
      });

      const track2 = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      useProjectStore.getState().updateTrack(track2.id, { displayName: 'Bass' });
      const clip2 = useProjectStore.getState().ensureMidiClip(track2.id);
      useProjectStore.getState().addMidiNote(clip2.id, {
        pitch: 36, startBeat: 0, durationBeats: 2, velocity: 1.0,
      });

      useProjectStore.getState().exportProjectMidi();

      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(anchor.download).toBe('Project MIDI Export.mid');
      expect(click).toHaveBeenCalledOnce();

      createElement.mockRestore();
      revokeObjectURL.mockRestore();
      createObjectURL.mockRestore();
    });

    it('shows error when no MIDI tracks have notes', () => {
      useProjectStore.getState().exportProjectMidi();
      expect(mockToastError).toHaveBeenCalledWith('No MIDI tracks with notes to export');
    });
  });

  describe('consolidateClips', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('merges selected MIDI clips on one track into a single clip', async () => {
      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      const clipA = useProjectStore.getState().addClip(track.id, {
        startTime: 0,
        duration: 1,
        prompt: 'phrase-a',
        globalCaption: '',
        lyrics: '',
        midiData: {
          grid: '1/16',
          notes: [{ id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }],
        },
        source: 'uploaded',
      });
      const clipB = useProjectStore.getState().addClip(track.id, {
        startTime: 1,
        duration: 1,
        prompt: 'phrase-b',
        globalCaption: '',
        lyrics: '',
        midiData: {
          grid: '1/16',
          notes: [{ id: 'n2', pitch: 64, startBeat: 0.5, durationBeats: 0.5, velocity: 0.7 }],
        },
        source: 'uploaded',
      });

      const consolidated = await useProjectStore.getState().consolidateClips(track.id, [clipA.id, clipB.id]);

      expect(consolidated).toBeDefined();
      expect(useProjectStore.getState().project?.tracks[0].clips).toHaveLength(1);
      expect(consolidated?.midiData?.notes).toHaveLength(2);
      expect(consolidated?.midiData?.notes.map((note) => note.startBeat)).toEqual([0, 2.5]);
    });

    it('renders selected audio clips into one replacement clip', async () => {
      const track = useProjectStore.getState().addTrack('drums', 'sample');
      const clipA = useProjectStore.getState().addClip(track.id, {
        startTime: 0,
        duration: 0.5,
        prompt: 'kick-a',
        globalCaption: '',
        lyrics: '',
        source: 'uploaded',
      });
      const clipB = useProjectStore.getState().addClip(track.id, {
        startTime: 1,
        duration: 0.5,
        prompt: 'kick-b',
        globalCaption: '',
        lyrics: '',
        source: 'uploaded',
      });

      useProjectStore.getState().updateClip(clipA.id, {
        generationStatus: 'ready',
        isolatedAudioKey: 'audio-a',
        gainEnvelope: [{ time: 0, gain: 0.5 }],
      });
      useProjectStore.getState().updateClip(clipB.id, {
        generationStatus: 'ready',
        isolatedAudioKey: 'audio-b',
      });

      mockLoadAudioBlobByKey.mockResolvedValue(new Blob(['wav'], { type: 'audio/wav' }));
      mockSaveAudioBlob.mockResolvedValue('merged-audio-key');
      mockDecodeAudioData
        .mockResolvedValueOnce(createMockAudioBuffer([[1, 1]], 4))
        .mockResolvedValueOnce(createMockAudioBuffer([[1, 1]], 4));

      const consolidated = await useProjectStore.getState().consolidateClips(track.id, [clipA.id, clipB.id]);

      expect(consolidated).toBeDefined();
      expect(consolidated?.isolatedAudioKey).toBe('merged-audio-key');
      expect(consolidated?.generationStatus).toBe('ready');
      expect(consolidated?.duration).toBe(1.5);
      expect(useProjectStore.getState().project?.tracks[0].clips).toHaveLength(1);
      expect(mockSaveAudioBlob).toHaveBeenCalledTimes(1);
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

describe('track presets', () => {
  beforeEach(() => {
    useProjectStore.getState().createProject();
  });

  it('saves track type, effects, and settings as a preset', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('keyboard', 'pianoRoll');
    store.updateTrack(track.id, { volume: 0.65, synthPreset: 'organ' });
    store.addTrackEffect(track.id, 'reverb');
    store.addTrackEffect(track.id, 'delay');

    const preset = store.saveTrackPreset(track.id, 'Dream Keys');

    expect(preset.name).toBe('Dream Keys');
    expect(preset.trackName).toBe('keyboard');
    expect(preset.trackType).toBe('pianoRoll');
    expect(preset.settings.volume).toBe(0.65);
    expect(preset.settings.synthPreset).toBe('organ');
    expect(preset.effects).toHaveLength(2);
    expect(preset.effects[0].type).toBe('reverb');
    expect(preset.effects[1].type).toBe('delay');
    expect(preset.createdAt).toBeGreaterThan(0);

    const presets = useProjectStore.getState().project!.trackPresets!;
    expect(presets).toHaveLength(1);
    expect(presets[0].id).toBe(preset.id);
  });

  it('applies a saved preset to create a new track', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('bass', 'pianoRoll');
    store.updateTrack(track.id, { volume: 0.4 });
    store.addTrackEffect(track.id, 'compressor');

    const preset = store.saveTrackPreset(track.id, 'Fat Bass');
    const newTrack = useProjectStore.getState().applyTrackPreset(preset.id);

    expect(newTrack).toBeDefined();
    expect(newTrack!.trackName).toBe('bass');
    expect(newTrack!.trackType).toBe('pianoRoll');
    expect(newTrack!.volume).toBe(0.4);
    expect(newTrack!.effects).toHaveLength(1);
    expect(newTrack!.effects![0].type).toBe('compressor');
    expect(newTrack!.id).not.toBe(track.id);
    expect(newTrack!.effects![0].id).not.toBe(preset.effects[0].id);

    const tracks = useProjectStore.getState().project!.tracks;
    expect(tracks).toHaveLength(2);
  });

  it('returns undefined when applying a non-existent preset', () => {
    const result = useProjectStore.getState().applyTrackPreset('non-existent');
    expect(result).toBeUndefined();
  });

  it('deletes a preset', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('drums', 'sequencer');
    const preset = store.saveTrackPreset(track.id, 'Boom Kit');

    expect(useProjectStore.getState().project!.trackPresets).toHaveLength(1);

    useProjectStore.getState().deleteTrackPreset(preset.id);
    expect(useProjectStore.getState().project!.trackPresets).toHaveLength(0);
  });

  it('throws when saving preset with empty name', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('drums');
    expect(() => store.saveTrackPreset(track.id, '   ')).toThrow('Preset name is required');
  });

  it('throws when saving preset for non-existent track', () => {
    expect(() => useProjectStore.getState().saveTrackPreset('nope', 'X')).toThrow();
  });

  it('preserves EQ and compressor settings in preset', () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('vocals', 'stems');

    useProjectStore.setState((state) => ({
      project: {
        ...state.project!,
        tracks: state.project!.tracks.map((t) =>
          t.id === track.id
            ? {
                ...t,
                eqLowGain: -3,
                eqMidGain: 2,
                eqHighGain: 5,
                compressorEnabled: true,
                compressorThreshold: -20,
                compressorRatio: 4,
                reverbMix: 0.3,
              }
            : t,
        ),
      },
    }));

    const preset = useProjectStore.getState().saveTrackPreset(track.id, 'Vocal Chain');
    expect(preset.settings.eqLowGain).toBe(-3);
    expect(preset.settings.eqMidGain).toBe(2);
    expect(preset.settings.eqHighGain).toBe(5);
    expect(preset.settings.compressorEnabled).toBe(true);
    expect(preset.settings.compressorThreshold).toBe(-20);
    expect(preset.settings.compressorRatio).toBe(4);
    expect(preset.settings.reverbMix).toBe(0.3);
  });

  it('strips sidechain source from compressor effects in preset', () => {
    const store = useProjectStore.getState();
    const kick = store.addTrack('drums');
    const bass = store.addTrack('bass', 'pianoRoll');

    const compId = store.addTrackEffect(bass.id, 'compressor');
    if (compId) {
      useProjectStore.getState().setSidechainSource(bass.id, compId, kick.id);
    }

    const preset = store.saveTrackPreset(bass.id, 'SC Bass');
    const compEffect = preset.effects.find((e) => e.type === 'compressor');
    expect(compEffect).toBeDefined();
    if (compEffect && 'sidechainSourceTrackId' in compEffect) {
      expect(compEffect.sidechainSourceTrackId).toBeUndefined();
    }
  });

  it('can save multiple presets and apply any of them', () => {
    const store = useProjectStore.getState();
    const t1 = store.addTrack('drums', 'sequencer');
    const t2 = store.addTrack('synth', 'pianoRoll');

    const p1 = store.saveTrackPreset(t1.id, 'Kit A');
    const p2 = useProjectStore.getState().saveTrackPreset(t2.id, 'Pad B');

    expect(useProjectStore.getState().project!.trackPresets).toHaveLength(2);

    const applied = useProjectStore.getState().applyTrackPreset(p2.id);
    expect(applied).toBeDefined();
    expect(applied!.trackName).toBe('synth');
    expect(applied!.trackType).toBe('pianoRoll');
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

  it('clamps overlapping fades to the clip duration', () => {
    const track = useProjectStore.getState().addTrack('drums');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0, duration: 1, prompt: 'beat', lyrics: '',
    });

    useProjectStore.getState().setClipFade(clip.id, {
      fadeInDuration: 0.8,
      fadeOutDuration: 0.7,
    });

    const updated = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(updated.fadeInDuration).toBe(0.3);
    expect(updated.fadeOutDuration).toBe(0.7);
  });

  describe('quantizeAudioClip / clearAudioQuantize', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('stores warp markers on a clip', () => {
      const track = useProjectStore.getState().addTrack('drums');
      const clip = useProjectStore.getState().addClip(track.id, {
        startTime: 0, duration: 4, prompt: 'beat', lyrics: '',
      });
      const markers = [
        { originalTime: 0.48, quantizedTime: 0.5 },
        { originalTime: 1.03, quantizedTime: 1.0 },
      ];
      useProjectStore.getState().quantizeAudioClip(clip.id, markers);

      const updated = useProjectStore.getState().project!.tracks[0].clips[0];
      expect(updated.warpMarkers).toEqual(markers);
    });

    it('clears warp markers from a clip', () => {
      const track = useProjectStore.getState().addTrack('drums');
      const clip = useProjectStore.getState().addClip(track.id, {
        startTime: 0, duration: 4, prompt: 'beat', lyrics: '',
      });
      useProjectStore.getState().quantizeAudioClip(clip.id, [
        { originalTime: 0.48, quantizedTime: 0.5 },
      ]);
      useProjectStore.getState().clearAudioQuantize(clip.id);

      const updated = useProjectStore.getState().project!.tracks[0].clips[0];
      expect(updated.warpMarkers).toBeUndefined();
    });
  });

  describe('applyAudioQuantize', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('detects transients from waveformPeaks and stores warp markers', () => {
      const track = useProjectStore.getState().addTrack('drums');
      const peaksLength = 2000;
      const peakDuration = 2.0;
      const peakSampleRate = peaksLength / peakDuration;
      const peaks: number[] = new Array(peaksLength).fill(0);
      const transientStart = Math.floor(0.48 * peakSampleRate);
      for (let i = transientStart; i < transientStart + 50; i++) {
        peaks[i] = 0.8;
      }

      const clip = useProjectStore.getState().addClip(track.id, {
        startTime: 0, duration: peakDuration, prompt: 'beat', lyrics: '',
      });
      useProjectStore.getState().updateClip(clip.id, {
        waveformPeaks: peaks,
        audioDuration: peakDuration,
      });

      useProjectStore.getState().applyAudioQuantize(clip.id);

      const updated = useProjectStore.getState().project!.tracks[0].clips[0];
      expect(updated.warpMarkers).toBeDefined();
      expect(updated.warpMarkers!.length).toBeGreaterThan(0);
      expect(updated.warpMarkers![0].quantizedTime).toBeCloseTo(0.5, 1);
    });

    it('does nothing for a clip without waveformPeaks', () => {
      const track = useProjectStore.getState().addTrack('drums');
      const clip = useProjectStore.getState().addClip(track.id, {
        startTime: 0, duration: 2, prompt: 'beat', lyrics: '',
      });

      useProjectStore.getState().applyAudioQuantize(clip.id);

      const updated = useProjectStore.getState().project!.tracks[0].clips[0];
      expect(updated.warpMarkers).toBeUndefined();
    });

    it('respects gridDivision option for 8th note quantize', () => {
      const track = useProjectStore.getState().addTrack('drums');
      const peaksLength = 44100;
      const peakDuration = 2.0;
      const peakSampleRate = peaksLength / peakDuration;
      const peaks: number[] = new Array(peaksLength).fill(0);
      const start = Math.floor(0.23 * peakSampleRate);
      for (let i = start; i < start + 100; i++) {
        peaks[i] = 0.8;
      }

      const clip = useProjectStore.getState().addClip(track.id, {
        startTime: 0, duration: peakDuration, prompt: 'beat', lyrics: '',
      });
      useProjectStore.getState().updateClip(clip.id, {
        waveformPeaks: peaks,
        audioDuration: peakDuration,
      });

      useProjectStore.getState().applyAudioQuantize(clip.id, { gridDivision: 0.5 });

      const updated = useProjectStore.getState().project!.tracks[0].clips[0];
      expect(updated.warpMarkers).toBeDefined();
      if (updated.warpMarkers && updated.warpMarkers.length > 0) {
        expect(updated.warpMarkers[0].quantizedTime).toBeCloseTo(0.25, 1);
      }
    });

    it('respects strength option for partial quantize', () => {
      const track = useProjectStore.getState().addTrack('drums');
      const peaksLength = 2000;
      const peakDuration = 2.0;
      const peakSampleRate = peaksLength / peakDuration;
      const peaks: number[] = new Array(peaksLength).fill(0);
      const start = Math.floor(0.4 * peakSampleRate);
      for (let i = start; i < start + 50; i++) {
        peaks[i] = 0.8;
      }

      const clip = useProjectStore.getState().addClip(track.id, {
        startTime: 0, duration: peakDuration, prompt: 'beat', lyrics: '',
      });
      useProjectStore.getState().updateClip(clip.id, {
        waveformPeaks: peaks,
        audioDuration: peakDuration,
      });

      useProjectStore.getState().applyAudioQuantize(clip.id, { strength: 0.5 });

      const updated = useProjectStore.getState().project!.tracks[0].clips[0];
      if (updated.warpMarkers && updated.warpMarkers.length > 0) {
        const m = updated.warpMarkers[0];
        expect(m.quantizedTime).toBeGreaterThan(m.originalTime);
        expect(m.quantizedTime).toBeLessThan(0.5);
      }
    });
  });
});
});
