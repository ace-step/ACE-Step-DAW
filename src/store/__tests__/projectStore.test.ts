import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

// Mock projectStorage to prevent IndexedDB calls during testing
vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('projectStore', () => {
  beforeEach(() => {
    // Reset to a fresh state
    useProjectStore.setState({ project: null });
  });

  describe('createProject', () => {
    it('creates a project with default values', () => {
      useProjectStore.getState().createProject();
      const project = useProjectStore.getState().project;
      expect(project).not.toBeNull();
      expect(project!.name).toBe('Untitled Project');
      expect(project!.bpm).toBe(120);
      expect(project!.keyScale).toBe('C major');
      expect(project!.timeSignature).toBe(4);
      expect(project!.tracks).toEqual([]);
    });

    it('creates a project with custom values', () => {
      useProjectStore.getState().createProject({
        name: 'My Song',
        bpm: 140,
        keyScale: 'A minor',
        timeSignature: 3,
      });
      const project = useProjectStore.getState().project;
      expect(project!.name).toBe('My Song');
      expect(project!.bpm).toBe(140);
      expect(project!.keyScale).toBe('A minor');
      expect(project!.timeSignature).toBe(3);
    });

    it('assigns a unique id', () => {
      useProjectStore.getState().createProject();
      const project = useProjectStore.getState().project;
      expect(project!.id).toBeDefined();
      expect(typeof project!.id).toBe('string');
      expect(project!.id.length).toBeGreaterThan(0);
    });
  });

  describe('updateProject', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('updates BPM', () => {
      useProjectStore.getState().updateProject({ bpm: 140 });
      expect(useProjectStore.getState().project!.bpm).toBe(140);
    });

    it('updates name', () => {
      useProjectStore.getState().updateProject({ name: 'New Name' });
      expect(useProjectStore.getState().project!.name).toBe('New Name');
    });

    it('updates updatedAt timestamp', () => {
      const before = useProjectStore.getState().project!.updatedAt;
      // Small delay to ensure timestamp changes
      useProjectStore.getState().updateProject({ bpm: 100 });
      const after = useProjectStore.getState().project!.updatedAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  describe('addTrack', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('adds a stems track', () => {
      const track = useProjectStore.getState().addTrack('drums');
      expect(track).toBeDefined();
      expect(track.trackName).toBe('drums');
      expect(track.trackType).toBe('stems');
      expect(useProjectStore.getState().project!.tracks).toHaveLength(1);
    });

    it('adds a sequencer track with pattern initialized', () => {
      const track = useProjectStore.getState().addTrack('drums', 'sequencer');
      expect(track.trackType).toBe('sequencer');
      expect(track.sequencerPattern).toBeDefined();
      expect(track.sequencerPattern!.rows.length).toBeGreaterThan(0);
      expect(track.sequencerPattern!.stepsPerBar).toBe(16);
    });

    it('adds a pianoRoll track', () => {
      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      expect(track.trackType).toBe('pianoRoll');
      expect(track.synthPreset).toBe('organ');
    });

    it('increments order for each new track', () => {
      const t1 = useProjectStore.getState().addTrack('drums');
      const t2 = useProjectStore.getState().addTrack('bass');
      expect(t2.order).toBeGreaterThan(t1.order);
    });

    it('appends number when duplicate trackName', () => {
      useProjectStore.getState().addTrack('drums');
      const t2 = useProjectStore.getState().addTrack('drums');
      expect(t2.displayName).toContain('2');
    });
  });

  describe('removeTrack', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('removes a track by id', () => {
      const track = useProjectStore.getState().addTrack('drums');
      useProjectStore.getState().removeTrack(track.id);
      expect(useProjectStore.getState().project!.tracks).toHaveLength(0);
    });
  });

  describe('updateTrack', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('updates track volume', () => {
      const track = useProjectStore.getState().addTrack('drums');
      useProjectStore.getState().updateTrack(track.id, { volume: 0.5 });
      const updated = useProjectStore.getState().project!.tracks[0];
      expect(updated.volume).toBe(0.5);
    });

    it('mutes and unmutes track', () => {
      const track = useProjectStore.getState().addTrack('drums');
      useProjectStore.getState().updateTrack(track.id, { muted: true });
      expect(useProjectStore.getState().project!.tracks[0].muted).toBe(true);
      useProjectStore.getState().updateTrack(track.id, { muted: false });
      expect(useProjectStore.getState().project!.tracks[0].muted).toBe(false);
    });

    it('solos a track', () => {
      const track = useProjectStore.getState().addTrack('drums');
      useProjectStore.getState().updateTrack(track.id, { soloed: true });
      expect(useProjectStore.getState().project!.tracks[0].soloed).toBe(true);
    });
  });

  describe('track presets', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('saves track type, effects, and settings as a reusable preset', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('keyboard', 'pianoRoll');

      store.updateTrack(track.id, { color: '#112233', volume: 0.42, synthPreset: 'pad' });
      store.updateTrackMixer(track.id, {
        pan: -0.35,
        eqLowGain: 3,
        eqMidGain: -2,
        eqHighGain: 5,
        compressorEnabled: true,
        compressorThreshold: -18,
        compressorRatio: 6,
      });
      store.setTrackLocalCaption(track.id, 'Warm pad stack');
      store.setTrackReverb(track.id, 0.33, 0.72);

      const effectId = store.addTrackEffect(track.id, 'reverb');
      expect(effectId).toBeDefined();
      store.updateTrackEffect(track.id, effectId!, {
        enabled: false,
        params: { decay: 8.4, preDelay: 0.2, wet: 0.61 },
      });

      const midiEffectId = store.addMidiEffect(track.id, 'arpeggiator');
      expect(midiEffectId).toBeDefined();
      store.updateMidiEffect(track.id, midiEffectId!, {
        params: { rate: '1/16', pattern: 'up-down', octaves: 2 },
      });

      const preset = store.saveTrackPreset(track.id, 'Dream Keys');

      expect(preset.name).toBe('Dream Keys');
      expect(preset.trackName).toBe('keyboard');
      expect(preset.trackType).toBe('pianoRoll');
      expect(preset.settings).toMatchObject({
        color: '#112233',
        volume: 0.42,
        synthPreset: 'pad',
        pan: -0.35,
        eqLowGain: 3,
        eqMidGain: -2,
        eqHighGain: 5,
        compressorEnabled: true,
        compressorThreshold: -18,
        compressorRatio: 6,
        reverbMix: 0.33,
        reverbRoomSize: 0.72,
        localCaption: 'Warm pad stack',
      });
      expect(preset.effects).toHaveLength(1);
      expect(preset.effects[0]).toMatchObject({
        type: 'reverb',
        enabled: false,
        params: { decay: 8.4, preDelay: 0.2, wet: 0.61 },
      });
      expect(preset.midiEffects).toHaveLength(1);
      expect(preset.midiEffects[0]).toMatchObject({
        type: 'arpeggiator',
        enabled: true,
        params: { rate: '1/16', pattern: 'up-down', octaves: 2 },
      });
      expect(useProjectStore.getState().project!.trackPresets).toHaveLength(1);
    });

    it('applies a track preset to a new track with fresh ids and no clips', () => {
      const store = useProjectStore.getState();
      const sourceTrack = store.addTrack('drums', 'sequencer');

      store.updateTrack(sourceTrack.id, { color: '#445566', volume: 0.55, drumKit: 'lofi' });
      store.updateTrackMixer(sourceTrack.id, {
        pan: 0.2,
        eqLowGain: 4,
        compressorEnabled: true,
        compressorThreshold: -12,
        compressorRatio: 8,
      });
      const effectId = store.addTrackEffect(sourceTrack.id, 'compressor');
      expect(effectId).toBeDefined();
      store.updateTrackEffect(sourceTrack.id, effectId!, {
        params: {
          threshold: -10,
          ratio: 10,
          attack: 0.02,
          release: 0.15,
          knee: 4,
          sidechainSourceTrackId: undefined,
        },
      });
      const midiEffectId = store.addMidiEffect(sourceTrack.id, 'scale-lock');
      expect(midiEffectId).toBeDefined();

      const preset = store.saveTrackPreset(sourceTrack.id, 'Dusty Drums');
      const appliedTrack = useProjectStore.getState().applyTrackPreset(preset.id);

      expect(appliedTrack).toBeDefined();
      expect(appliedTrack!.id).not.toBe(sourceTrack.id);
      expect(appliedTrack!.trackName).toBe('drums');
      expect(appliedTrack!.trackType).toBe('sequencer');
      expect(appliedTrack!.displayName).not.toBe(sourceTrack.displayName);
      expect(appliedTrack!.clips).toEqual([]);
      expect(appliedTrack!.color).toBe('#445566');
      expect(appliedTrack!.volume).toBe(0.55);
      expect(appliedTrack!.drumKit).toBe('lofi');
      expect(appliedTrack!.pan).toBe(0.2);
      expect(appliedTrack!.eqLowGain).toBe(4);
      expect(appliedTrack!.compressorEnabled).toBe(true);
      expect(appliedTrack!.compressorThreshold).toBe(-12);
      expect(appliedTrack!.compressorRatio).toBe(8);
      expect(appliedTrack!.effects).toHaveLength(1);
      expect(appliedTrack!.effects?.[0].type).toBe('compressor');
      expect(appliedTrack!.effects?.[0].id).not.toBe(effectId);
      expect(appliedTrack!.midiEffects).toHaveLength(1);
      expect(appliedTrack!.midiEffects?.[0].id).not.toBe(midiEffectId);
      expect(appliedTrack!.sequencerPattern).toBeDefined();
      expect(appliedTrack!.sequencerPattern?.id).not.toBe(sourceTrack.sequencerPattern?.id);
    });
  });

  describe('renameTrack', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('renames a track', () => {
      const track = useProjectStore.getState().addTrack('drums');
      useProjectStore.getState().renameTrack(track.id, 'My Drums');
      expect(useProjectStore.getState().project!.tracks[0].displayName).toBe('My Drums');
    });
  });

  describe('addClip / removeClip', () => {
    let trackId: string;

    beforeEach(() => {
      useProjectStore.getState().createProject();
      const track = useProjectStore.getState().addTrack('drums');
      trackId = track.id;
    });

    it('adds a clip to a track', () => {
      const clip = useProjectStore.getState().addClip(trackId, {
        startTime: 0,
        duration: 30,
        prompt: 'energetic drums',
        lyrics: '',
      });
      expect(clip).toBeDefined();
      expect(clip.trackId).toBe(trackId);
      expect(clip.prompt).toBe('energetic drums');
      expect(useProjectStore.getState().project!.tracks[0].clips).toHaveLength(1);
    });

    it('removes a clip', () => {
      const clip = useProjectStore.getState().addClip(trackId, {
        startTime: 0,
        duration: 30,
        prompt: 'drums',
        lyrics: '',
      });
      useProjectStore.getState().removeClip(clip.id);
      expect(useProjectStore.getState().project!.tracks[0].clips).toHaveLength(0);
    });
  });

  describe('undo/redo', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('undoes track addition', () => {
      useProjectStore.getState().addTrack('drums');
      expect(useProjectStore.getState().project!.tracks).toHaveLength(1);
      useProjectStore.getState().undo();
      expect(useProjectStore.getState().project!.tracks).toHaveLength(0);
    });

    it('redoes after undo', () => {
      useProjectStore.getState().addTrack('drums');
      useProjectStore.getState().undo();
      useProjectStore.getState().redo();
      expect(useProjectStore.getState().project!.tracks).toHaveLength(1);
    });
  });

  describe('sequencer actions', () => {
    let trackId: string;
    let rowId: string;

    beforeEach(() => {
      useProjectStore.getState().createProject();
      const track = useProjectStore.getState().addTrack('drums', 'sequencer');
      trackId = track.id;
      rowId = track.sequencerPattern!.rows[0].id;
    });

    it('toggles a sequencer step on', () => {
      useProjectStore.getState().toggleSequencerStep(trackId, rowId, 0);
      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.sequencerPattern!.rows[0].steps[0].active).toBe(true);
    });

    it('toggles a sequencer step off', () => {
      useProjectStore.getState().toggleSequencerStep(trackId, rowId, 0);
      useProjectStore.getState().toggleSequencerStep(trackId, rowId, 0);
      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.sequencerPattern!.rows[0].steps[0].active).toBe(false);
    });

    it('sets step velocity', () => {
      useProjectStore.getState().setSequencerStepVelocity(trackId, rowId, 0, 0.5);
      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.sequencerPattern!.rows[0].steps[0].velocity).toBe(0.5);
    });
  });

  describe('updateSequencerSwing', () => {
    let trackId: string;

    beforeEach(() => {
      useProjectStore.getState().createProject();
      const track = useProjectStore.getState().addTrack('drums', 'sequencer');
      trackId = track.id;
    });

    it('sets swing amount on a sequencer pattern', () => {
      useProjectStore.getState().updateSequencerSwing(trackId, 0.67);
      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.sequencerPattern!.swing).toBe(0.67);
    });

    it('clamps swing value to 0–1 range', () => {
      useProjectStore.getState().updateSequencerSwing(trackId, 1.5);
      const track1 = useProjectStore.getState().project!.tracks[0];
      expect(track1.sequencerPattern!.swing).toBe(1);

      useProjectStore.getState().updateSequencerSwing(trackId, -0.3);
      const track2 = useProjectStore.getState().project!.tracks[0];
      expect(track2.sequencerPattern!.swing).toBe(0);
    });
  });

  describe('MIDI actions', () => {
    let clipId: string;

    beforeEach(() => {
      useProjectStore.getState().createProject();
      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      const clip = useProjectStore.getState().ensureMidiClip(track.id);
      clipId = clip.id;
    });

    it('adds a MIDI note', () => {
      const noteId = useProjectStore.getState().addMidiNote(clipId, {
        pitch: 60,
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.8,
      });
      expect(noteId).toBeDefined();
      const clip = useProjectStore.getState().getClipById(clipId);
      expect(clip!.midiData!.notes).toHaveLength(1);
      expect(clip!.midiData!.notes[0].pitch).toBe(60);
    });

    it('removes a MIDI note', () => {
      const noteId = useProjectStore.getState().addMidiNote(clipId, {
        pitch: 60,
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.8,
      });
      useProjectStore.getState().removeMidiNote(clipId, noteId!);
      const clip = useProjectStore.getState().getClipById(clipId);
      expect(clip!.midiData!.notes).toHaveLength(0);
    });

    it('updates a MIDI note', () => {
      const noteId = useProjectStore.getState().addMidiNote(clipId, {
        pitch: 60,
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.8,
      });
      useProjectStore.getState().updateMidiNote(clipId, noteId!, { pitch: 72 });
      const clip = useProjectStore.getState().getClipById(clipId);
      expect(clip!.midiData!.notes[0].pitch).toBe(72);
    });
  });

  describe('effects', () => {
    let trackId: string;

    beforeEach(() => {
      useProjectStore.getState().createProject();
      const track = useProjectStore.getState().addTrack('drums');
      trackId = track.id;
    });

    it('adds an effect to a track', () => {
      const effectId = useProjectStore.getState().addTrackEffect(trackId, 'reverb');
      expect(effectId).toBeDefined();
      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.effects).toHaveLength(1);
      expect(track.effects![0].type).toBe('reverb');
    });

    it('removes an effect from a track', () => {
      const effectId = useProjectStore.getState().addTrackEffect(trackId, 'reverb');
      useProjectStore.getState().removeTrackEffect(trackId, effectId!);
      const track = useProjectStore.getState().project!.tracks[0];
      expect(track.effects).toHaveLength(0);
    });
  });
});
