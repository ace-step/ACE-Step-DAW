import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';
import { useCollaborationStore } from '../collaborationStore';
import { DEFAULT_GENERATION, DEFAULT_MEASURES, MAX_PROJECT_TRACKS } from '../../constants/defaults';
import type { Project } from '../../types/project';
import { createDefaultFmInstrument } from '../../utils/trackInstrument';

// Mock projectStorage to prevent IndexedDB calls during testing
vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('projectStore', () => {
  beforeEach(() => {
    // Reset to a fresh state
    useProjectStore.setState({ project: null });
    useCollaborationStore.getState().reset();
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
      expect(project!.measures).toBe(DEFAULT_MEASURES);
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

  describe('playback latency calibration', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('stores detected audio context latency and computes a normalized effective value', () => {
      useProjectStore.getState().capturePlaybackLatency({
        baseLatency: 0.005,
        outputLatency: 0.02,
      });

      const latency = useProjectStore.getState().project!.playbackLatency;
      expect(latency).toMatchObject({
        source: 'auto',
        detectedBaseLatencyMs: 5,
        detectedOutputLatencyMs: 20,
        detectedLatencyMs: 25,
        manualOverrideMs: null,
        compensationMs: 25,
      });
    });

    it('prefers manual override over detected latency', () => {
      const store = useProjectStore.getState();
      store.capturePlaybackLatency({
        baseLatency: 0.005,
        outputLatency: 0.02,
      });
      store.setPlaybackLatencyOverride(42);

      const latency = useProjectStore.getState().project!.playbackLatency;
      expect(latency).toMatchObject({
        source: 'manual',
        detectedLatencyMs: 25,
        manualOverrideMs: 42,
        compensationMs: 42,
      });
    });

    it('falls back gracefully when browser latency metrics are unavailable', () => {
      useProjectStore.getState().capturePlaybackLatency({});

      const latency = useProjectStore.getState().project!.playbackLatency;
      expect(latency).toMatchObject({
        source: 'fallback',
        detectedBaseLatencyMs: null,
        detectedOutputLatencyMs: null,
        detectedLatencyMs: null,
        manualOverrideMs: null,
        compensationMs: 0,
      });
    });
  });

  describe('addTrack', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('adds a stems track', () => {
      const track = useProjectStore.getState().addTrack('drums');
      expect(track).toMatchObject({ trackName: 'drums', trackType: 'stems' });
      expect(useProjectStore.getState().project!.tracks).toHaveLength(1);
    });

    it('adds a sequencer track with pattern initialized', () => {
      const track = useProjectStore.getState().addTrack('drums', 'sequencer');
      expect(track.trackType).toBe('sequencer');
      expect(track.sequencerPattern).toMatchObject({ stepsPerBar: 16 });
      expect(track.sequencerPattern!.rows.length).toBeGreaterThan(0);
      expect(track.sequencerPattern!.stepsPerBar).toBe(16);
    });

    it('adds a pianoRoll track', () => {
      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      expect(track.trackType).toBe('pianoRoll');
      expect(track.synthPreset).toBe('organ');
      expect(track.instrument).toMatchObject({
        kind: 'subtractive',
        preset: 'organ',
      });
    });

    it('stops adding tracks after the 128-track limit', () => {
      for (let index = 0; index < MAX_PROJECT_TRACKS; index += 1) {
        useProjectStore.getState().addTrack('drums');
      }

      const overflowTrack = useProjectStore.getState().addTrack('bass');

      expect(overflowTrack).toBeUndefined();
      expect(useProjectStore.getState().project!.tracks).toHaveLength(MAX_PROJECT_TRACKS);
    });

    it('stores sampler metadata on a piano roll track', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('keyboard', 'pianoRoll');

      store.updateTrack(track.id, { synthPreset: 'sampler' });
      store.setTrackSampler(track.id, {
        audioKey: 'audio:test:sampler',
        sampleName: 'LoFi Keys',
        rootNote: 48,
        sampleDuration: 1.25,
      });

      const updated = useProjectStore.getState().project!.tracks[0];
      expect(updated.synthPreset).toBe('sampler');
      expect(updated.instrument).toMatchObject({
        kind: 'sampler',
        settings: {
          audioKey: 'audio:test:sampler',
          rootNote: 48,
        },
      });
      expect(updated.sampler).toMatchObject({
        audioKey: 'audio:test:sampler',
        sampleName: 'LoFi Keys',
        rootNote: 48,
        sampleDuration: 1.25,
      });
      expect(updated.samplerConfig).toMatchObject({
        audioKey: 'audio:test:sampler',
        rootNote: 48,
        trimStart: 0,
        trimEnd: 1.25,
        playbackMode: 'classic',
        loopStart: 0,
        loopEnd: 1.25,
      });
    });

    it('clears sampler metadata without restoring stale sampler config', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('keyboard', 'pianoRoll');

      store.updateTrack(track.id, { synthPreset: 'sampler' });
      store.setTrackSampler(track.id, {
        audioKey: 'audio:test:clear-sampler',
        sampleName: 'Transient Hit',
        rootNote: 52,
        sampleDuration: 0.75,
      });

      store.updateSamplerConfig(track.id, null);

      const updated = useProjectStore.getState().project!.tracks[0];
      expect(updated.instrument).toMatchObject({
        kind: 'sampler',
        settings: {
          audioKey: undefined,
        },
      });
      expect(updated.sampler).toBeUndefined();
      expect(updated.samplerConfig).toBeUndefined();
    });

    it('creates a quick sampler track from an audio key via store API', () => {
      const store = useProjectStore.getState();
      const track = store.createQuickSamplerTrack({
        audioKey: 'audio:test:quick-sampler',
        sampleName: 'Quick Vox',
        sampleDuration: 2.75,
        rootNote: 57,
      });

      expect(track).toMatchObject({ trackType: 'pianoRoll', synthPreset: 'sampler' });
      expect(track?.instrument).toMatchObject({
        kind: 'sampler',
        settings: {
          audioKey: 'audio:test:quick-sampler',
          rootNote: 57,
        },
      });
      expect(track?.sampler).toMatchObject({
        audioKey: 'audio:test:quick-sampler',
        sampleName: 'Quick Vox',
        sampleDuration: 2.75,
        rootNote: 57,
      });
      expect(track?.samplerConfig).toMatchObject({
        audioKey: 'audio:test:quick-sampler',
        rootNote: 57,
        trimStart: 0,
        trimEnd: 2.75,
        playbackMode: 'classic',
        loopStart: 0,
        loopEnd: 2.75,
      });
    });

    it('increments order for each new track', () => {
      const t1 = useProjectStore.getState().addTrack('drums');
      const t2 = useProjectStore.getState().addTrack('bass');
      expect(t2.order).toBeGreaterThan(t1.order);
    });

    it('uses an explicit row order when creating a track in a selected empty slot', () => {
      useProjectStore.getState().addTrack('drums');

      const track = useProjectStore.getState().addTrack('bass', 'stems', { order: 4 });

      expect(track.order).toBe(4);
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

  describe('asset restoration', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    function createReadyGeneratedAsset() {
      const store = useProjectStore.getState();
      const track = store.addTrack('synth', 'stems');
      store.setTrackLocalCaption(track.id, 'Glass lead');

      const clip = store.addClip(track.id, {
        startTime: 0,
        duration: 6,
        prompt: 'Glass lead hook',
        globalCaption: 'Neon skyline',
        lyrics: '',
        source: 'generated',
      });

      store.updateClipStatus(clip.id, 'ready', {
        isolatedAudioKey: 'audio:isolated:lead',
        cumulativeMixKey: 'audio:cumulative:lead',
        waveformPeaks: [0.2, 0.6, 0.3],
        audioDuration: 6,
        audioOffset: 0,
        inferredMetas: {
          bpm: 128,
          keyScale: 'A minor',
        },
        generatedFromContext: true,
      });

      return {
        track,
        clip,
        asset: useProjectStore.getState().project!.assets![0],
      };
    }

    it('persists origin snapshots when a generated clip becomes ready', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('bass', 'stems');
      store.setTrackLocalCaption(track.id, 'Warm bass pulse');

      const clip = store.addClip(track.id, {
        startTime: 0,
        duration: 4,
        prompt: 'Warm bass groove',
        globalCaption: 'Night drive',
        lyrics: '',
        source: 'generated',
      });

      store.updateClipStatus(clip.id, 'ready', {
        isolatedAudioKey: 'audio:isolated:bass',
        cumulativeMixKey: 'audio:cumulative:bass',
        waveformPeaks: [0.1, 0.4, 0.2],
        audioDuration: 4,
        audioOffset: 0,
        inferredMetas: {
          bpm: 120,
          keyScale: 'C minor',
          genres: 'synthwave',
        },
        generatedFromContext: true,
      });

      const asset = useProjectStore.getState().project!.assets?.[0];
      expect(asset).toMatchObject({ source: 'generated', isolatedAudioKey: 'audio:isolated:bass' });
      expect(asset?.originTrackSnapshot).toMatchObject({
        trackName: 'bass',
        trackType: 'stems',
        displayName: track.displayName,
        settings: {
          color: track.color,
          localCaption: 'Warm bass pulse',
        },
      });
      expect(asset?.originClipSnapshot).toMatchObject({
        prompt: 'Warm bass groove',
        globalCaption: 'Night drive',
        source: 'generated',
        generationStatus: 'ready',
        isolatedAudioKey: 'audio:isolated:bass',
        cumulativeMixKey: 'audio:cumulative:bass',
        generatedFromContext: true,
        inferredMetas: {
          bpm: 120,
          keyScale: 'C minor',
          genres: 'synthwave',
        },
      });
    });

    it('restores a generated asset as a new AI track after the source track is deleted', () => {
      const store = useProjectStore.getState();
      const { track, asset } = createReadyGeneratedAsset();
      expect(asset).toMatchObject({ source: 'generated', isolatedAudioKey: 'audio:isolated:lead' });

      store.removeTrack(track.id);
      const restoredTrack = store.restoreAssetToNewTrack(asset!.id, 8);

      expect(restoredTrack).toMatchObject({
        trackType: 'stems',
        trackName: 'synth',
        displayName: track.displayName,
        localCaption: 'Glass lead',
      });

      const liveTrack = useProjectStore.getState().project!.tracks.find((candidate) => candidate.id === restoredTrack?.id);
      const restoredClip = liveTrack?.clips[0];
      expect(restoredClip).toMatchObject({
        startTime: 8,
        duration: 6,
        prompt: 'Glass lead hook',
        globalCaption: 'Neon skyline',
        source: 'generated',
        generationStatus: 'ready',
        isolatedAudioKey: 'audio:isolated:lead',
        cumulativeMixKey: 'audio:cumulative:lead',
        generatedFromContext: true,
      });
      expect(useProjectStore.getState().project!.assets?.[0]?.clipId).toBe(restoredClip?.id);
    });

    it('does not restore a generated asset while in viewer mode', () => {
      const store = useProjectStore.getState();
      const { track, asset } = createReadyGeneratedAsset();

      store.removeTrack(track.id);
      useCollaborationStore.getState().setViewerMode(true);

      const restoredTrack = store.restoreAssetToNewTrack(asset.id, 8);

      expect(restoredTrack).toBeUndefined();
      expect(useProjectStore.getState().project!.tracks).toHaveLength(0);
    });

    it('does not restore a generated asset beyond the project track limit', () => {
      const store = useProjectStore.getState();
      const { track, asset } = createReadyGeneratedAsset();

      store.removeTrack(track.id);
      for (let index = 0; index < MAX_PROJECT_TRACKS; index += 1) {
        store.addTrack('drums');
      }

      const restoredTrack = store.restoreAssetToNewTrack(asset.id, 8);

      expect(restoredTrack).toBeUndefined();
      expect(useProjectStore.getState().project!.tracks).toHaveLength(MAX_PROJECT_TRACKS);
    });

    it('backfills missing origin snapshots for legacy assets when the source clip still exists', () => {
      useProjectStore.getState().setProject({
        id: 'legacy-project',
        name: 'Legacy Project',
        createdAt: 1,
        updatedAt: 1,
        bpm: 120,
        keyScale: 'C major',
        timeSignature: 4,
        timeSignatureDenominator: 4,
        totalDuration: 32,
        tracks: [{
          id: 'track-1',
          trackName: 'synth',
          trackType: 'stems',
          displayName: 'Synth',
          color: '#3b82f6',
          order: 1,
          volume: 0.8,
          muted: false,
          soloed: false,
          clips: [{
            id: 'clip-1',
            trackId: 'track-1',
            startTime: 0,
            duration: 4,
            prompt: 'Legacy synth phrase',
            globalCaption: 'Retro night',
            lyrics: '',
            generationStatus: 'ready',
            generationJobId: null,
            cumulativeMixKey: 'audio:cumulative:legacy',
            isolatedAudioKey: 'audio:isolated:legacy',
            waveformPeaks: [0.1, 0.3],
            source: 'generated',
          }],
          effects: [],
          midiEffects: [],
        }],
        generationDefaults: DEFAULT_GENERATION,
        assets: [{
          id: 'asset-1',
          clipId: 'clip-1',
          trackDisplayName: 'Synth',
          prompt: 'Legacy synth phrase',
          source: 'generated',
          isolatedAudioKey: 'audio:isolated:legacy',
          cumulativeMixKey: 'audio:cumulative:legacy',
          waveformPeaks: [0.1, 0.3],
          starred: false,
          createdAt: 1,
          duration: 4,
        }],
      } as any);

      const asset = useProjectStore.getState().project!.assets?.[0];
      expect(asset?.originTrackSnapshot).toMatchObject({
        trackName: 'synth',
        trackType: 'stems',
        displayName: 'Synth',
      });
      expect(asset?.originClipSnapshot).toMatchObject({
        prompt: 'Legacy synth phrase',
        globalCaption: 'Retro night',
        source: 'generated',
      });
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

    it('migrates legacy piano-roll tracks and presets into canonical instrument state', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('keyboard', 'pianoRoll');
      store.updateTrack(track.id, { synthPreset: 'pad' });

      const legacyProject = structuredClone(useProjectStore.getState().project!) as Project;
      legacyProject.tracks = legacyProject.tracks.map((candidate) => (
        candidate.id === track.id
          ? {
              ...candidate,
              instrument: undefined,
              synthPreset: 'pad',
            }
          : candidate
      ));
      legacyProject.trackPresets = [{
        id: 'legacy-preset',
        name: 'Legacy Pad',
        trackName: 'keyboard',
        trackType: 'pianoRoll',
        settings: {
          color: '#223344',
          volume: 0.7,
          synthPreset: 'pad',
        },
        effects: [],
        midiEffects: [],
        createdAt: Date.now(),
      }];

      store.setProject(legacyProject);

      const migratedTrack = useProjectStore.getState().project!.tracks.find((candidate) => candidate.id === track.id)!;
      const migratedPreset = useProjectStore.getState().project!.trackPresets?.[0];

      expect(migratedTrack.instrument).toMatchObject({
        kind: 'subtractive',
        preset: 'pad',
      });
      expect(migratedPreset?.settings.instrument).toMatchObject({
        kind: 'subtractive',
        preset: 'pad',
      });
    });

    it('sets canonical instrument state and preserves legacy fallback fields', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('synth', 'pianoRoll');

      store.setTrackInstrument(track.id, createDefaultFmInstrument({
        name: 'FM Bell',
        fallbackPreset: 'lead',
        settings: {
          modulationIndex: 4.5,
          modulator: {
            waveform: 'sine',
            ratio: 3,
            level: 0.8,
          },
        },
      }));

      const updated = useProjectStore.getState().project!.tracks[0];
      expect(updated.instrument).toMatchObject({
        kind: 'fm',
        name: 'FM Bell',
        settings: {
          modulationIndex: 4.5,
        },
      });
      expect(updated.synthPreset).toBe('lead');
      expect(updated.sampler).toBeUndefined();
      expect(updated.samplerConfig).toBeUndefined();
    });
  });

  describe('setTrackFmSynth', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('creates an FM instrument on a track that had no instrument', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('synth', 'pianoRoll');

      store.setTrackFmSynth(track.id, {
        modulationIndex: 5,
        harmonicity: 3,
        algorithm: 'serial',
      });

      const updated = useProjectStore.getState().project!.tracks[0];
      expect(updated.instrument?.kind).toBe('fm');
      if (updated.instrument?.kind === 'fm') {
        expect(updated.instrument.settings.modulationIndex).toBe(5);
        expect(updated.instrument.settings.harmonicity).toBe(3);
        expect(updated.instrument.settings.algorithm).toBe('serial');
      }
    });

    it('merges partial params into existing FM instrument', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('synth', 'pianoRoll');

      // First set up FM
      store.setTrackFmSynth(track.id, {
        modulationIndex: 2,
        harmonicity: 2,
        algorithm: 'serial',
      });
      // Then update just algorithm
      store.setTrackFmSynth(track.id, {
        algorithm: 'parallel',
      });

      const updated = useProjectStore.getState().project!.tracks[0];
      if (updated.instrument?.kind === 'fm') {
        expect(updated.instrument.settings.algorithm).toBe('parallel');
        expect(updated.instrument.settings.modulationIndex).toBe(2);
      }
    });

    it('updates carrier and modulator operator settings independently', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('synth', 'pianoRoll');

      store.setTrackFmSynth(track.id, {
        carrier: { waveform: 'triangle', ratio: 1, level: 0.9 },
        modulator: { waveform: 'sawtooth', ratio: 3, level: 0.6 },
      });

      const updated = useProjectStore.getState().project!.tracks[0];
      if (updated.instrument?.kind === 'fm') {
        expect(updated.instrument.settings.carrier.waveform).toBe('triangle');
        expect(updated.instrument.settings.modulator.waveform).toBe('sawtooth');
        expect(updated.instrument.settings.modulator.ratio).toBe(3);
      }
    });

    it('preserves legacy synthPreset fallback from FM instrument', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('synth', 'pianoRoll');

      store.setTrackFmSynth(track.id, { modulationIndex: 4 });

      const updated = useProjectStore.getState().project!.tracks[0];
      // FM instruments use fallbackPreset for legacy synthPreset
      expect(updated.synthPreset).toBe('lead'); // default fallbackPreset
    });

    it('supports all four FM algorithms', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('synth', 'pianoRoll');

      for (const algo of ['serial', 'parallel', 'stack', 'feedback'] as const) {
        store.setTrackFmSynth(track.id, { algorithm: algo });
        const updated = useProjectStore.getState().project!.tracks[0];
        if (updated.instrument?.kind === 'fm') {
          expect(updated.instrument.settings.algorithm).toBe(algo);
        }
      }
    });

    it('is a no-op when project is null', () => {
      useProjectStore.setState({ project: null });
      // Should not throw
      useProjectStore.getState().setTrackFmSynth('nonexistent', { modulationIndex: 5 });
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
      expect(typeof effectId).toBe('string');
      store.updateTrackEffect(track.id, effectId!, {
        enabled: false,
        params: { decay: 8.4, preDelay: 0.2, wet: 0.61 },
      });

      const midiEffectId = store.addMidiEffect(track.id, 'arpeggiator');
      expect(typeof midiEffectId).toBe('string');
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
        instrument: {
          kind: 'subtractive',
          preset: 'pad',
        },
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

    it('preserves FM instrument state when saving and applying a track preset', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('synth', 'pianoRoll');

      store.setTrackInstrument(track.id, createDefaultFmInstrument({
        name: 'FM Bell',
        fallbackPreset: 'lead',
        settings: {
          modulationIndex: 6,
        },
      }));

      const preset = store.saveTrackPreset(track.id, 'FM Bell');
      const appliedTrack = store.applyTrackPreset(preset.id);

      expect(preset.settings.instrument).toMatchObject({
        kind: 'fm',
        name: 'FM Bell',
      });
      expect(appliedTrack?.instrument).toMatchObject({
        kind: 'fm',
        name: 'FM Bell',
        settings: {
          modulationIndex: 6,
        },
      });
      expect(appliedTrack?.synthPreset).toBe('lead');
    });

    it('preserves sampler settings when saving and applying a track preset', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('keyboard', 'pianoRoll');

      store.updateTrack(track.id, { synthPreset: 'sampler' });
      store.setTrackSampler(track.id, {
        audioKey: 'audio:test:sampler',
        sampleName: 'Voice Chop',
        rootNote: 57,
        sampleDuration: 2.4,
      });

      const preset = store.saveTrackPreset(track.id, 'Chop Sampler');
      expect(preset.settings).toMatchObject({
        synthPreset: 'sampler',
        sampler: {
          audioKey: 'audio:test:sampler',
          sampleName: 'Voice Chop',
          rootNote: 57,
          sampleDuration: 2.4,
        },
      });

      const appliedTrack = store.applyTrackPreset(preset.id);
      expect(appliedTrack?.synthPreset).toBe('sampler');
      expect(appliedTrack?.sampler).toMatchObject({
        audioKey: 'audio:test:sampler',
        sampleName: 'Voice Chop',
        rootNote: 57,
        sampleDuration: 2.4,
      });
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
      expect(typeof effectId).toBe('string');
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
      expect(typeof midiEffectId).toBe('string');

      const preset = store.saveTrackPreset(sourceTrack.id, 'Dusty Drums');
      const appliedTrack = useProjectStore.getState().applyTrackPreset(preset.id);

      expect(appliedTrack).toMatchObject({ trackName: 'drums', trackType: 'sequencer' });
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
      expect(appliedTrack!.sequencerPattern).toMatchObject({ stepsPerBar: 16 });
      expect(appliedTrack!.sequencerPattern?.id).not.toBe(sourceTrack.sequencerPattern?.id);
    });
  });

  describe('solo/mute management', () => {
    beforeEach(() => {
      useProjectStore.getState().createProject();
    });

    it('clearAllSolos unsolos all tracks', () => {
      const store = useProjectStore.getState();
      const t1 = store.addTrack('vocals');
      const t2 = store.addTrack('drums');
      store.updateTrack(t1.id, { soloed: true });
      store.updateTrack(t2.id, { soloed: true });

      useProjectStore.getState().clearAllSolos();

      const tracks = useProjectStore.getState().project!.tracks;
      expect(tracks.every((t) => !t.soloed)).toBe(true);
    });

    it('clearAllSolos is a no-op when no tracks are soloed', () => {
      const store = useProjectStore.getState();
      store.addTrack('vocals');
      const before = useProjectStore.getState().project!.updatedAt;

      useProjectStore.getState().clearAllSolos();

      expect(useProjectStore.getState().project!.updatedAt).toBe(before);
    });

    it('clearAllMutes unmutes all tracks', () => {
      const store = useProjectStore.getState();
      const t1 = store.addTrack('vocals');
      const t2 = store.addTrack('drums');
      store.updateTrack(t1.id, { muted: true });
      store.updateTrack(t2.id, { muted: true });

      useProjectStore.getState().clearAllMutes();

      const tracks = useProjectStore.getState().project!.tracks;
      expect(tracks.every((t) => !t.muted)).toBe(true);
    });

    it('clearAllMutes is a no-op when no tracks are muted', () => {
      const store = useProjectStore.getState();
      store.addTrack('vocals');
      const before = useProjectStore.getState().project!.updatedAt;

      useProjectStore.getState().clearAllMutes();

      expect(useProjectStore.getState().project!.updatedAt).toBe(before);
    });

    it('exclusiveSolo solos only the target track', () => {
      const store = useProjectStore.getState();
      const t1 = store.addTrack('vocals');
      const t2 = store.addTrack('drums');
      const t3 = store.addTrack('bass');
      store.updateTrack(t1.id, { soloed: true });
      store.updateTrack(t2.id, { soloed: true });

      useProjectStore.getState().exclusiveSolo(t3.id);

      const tracks = useProjectStore.getState().project!.tracks;
      expect(tracks.find((t) => t.id === t1.id)!.soloed).toBe(false);
      expect(tracks.find((t) => t.id === t2.id)!.soloed).toBe(false);
      expect(tracks.find((t) => t.id === t3.id)!.soloed).toBe(true);
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
      expect(clip).toMatchObject({ trackId, prompt: 'energetic drums' });
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
      expect(typeof noteId).toBe('string');
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

    it('resizes a MIDI note from the left edge and restores it with a single undo', () => {
      const noteId = useProjectStore.getState().addMidiNote(clipId, {
        pitch: 60,
        startBeat: 1,
        durationBeats: 2,
        velocity: 0.8,
      });

      useProjectStore.getState().resizeMidiNote(clipId, noteId!, {
        edge: 'left',
        startBeat: 0.5,
      });

      let clip = useProjectStore.getState().getClipById(clipId);
      expect(clip!.midiData!.notes[0]).toMatchObject({
        startBeat: 0.5,
        durationBeats: 2.5,
      });

      useProjectStore.getState().undo('pianoRoll', { clipId });

      clip = useProjectStore.getState().getClipById(clipId);
      expect(clip!.midiData!.notes[0]).toMatchObject({
        startBeat: 1,
        durationBeats: 2,
      });
    });

    it('resizes a MIDI note from the right edge without moving the start', () => {
      const noteId = useProjectStore.getState().addMidiNote(clipId, {
        pitch: 60,
        startBeat: 1,
        durationBeats: 2,
        velocity: 0.8,
      });

      useProjectStore.getState().resizeMidiNote(clipId, noteId!, {
        edge: 'right',
        endBeat: 4.5,
      });

      const clip = useProjectStore.getState().getClipById(clipId);
      expect(clip!.midiData!.notes[0]).toMatchObject({
        startBeat: 1,
        durationBeats: 3.5,
      });
    });

    it('stores slide-note metadata', () => {
      const noteId = useProjectStore.getState().addMidiNote(clipId, {
        pitch: 67,
        startBeat: 1,
        durationBeats: 0.5,
        velocity: 96,
        isSlide: true,
      });
      const clip = useProjectStore.getState().getClipById(clipId);
      expect(clip!.midiData!.notes.find((note) => note.id === noteId)?.isSlide).toBe(true);
    });

    it('stamps a chord as one undoable piano-roll action', () => {
      const historyBefore = useProjectStore.getState().getUndoHistory('pianoRoll', { clipId }).length;

      const noteIds = useProjectStore.getState().stampChord(clipId, 60, [0, 4, 7, 10], 2, 0.5, 88);

      expect(noteIds).toHaveLength(4);
      const clip = useProjectStore.getState().getClipById(clipId);
      expect(clip!.midiData!.notes).toHaveLength(4);
      expect(clip!.midiData!.notes.map((note) => note.pitch)).toEqual([60, 64, 67, 70]);
      expect(clip!.midiData!.notes.map((note) => note.startBeat)).toEqual([2, 2, 2, 2]);
      expect(clip!.midiData!.notes.map((note) => note.durationBeats)).toEqual([0.5, 0.5, 0.5, 0.5]);
      expect(clip!.midiData!.notes.map((note) => note.velocity)).toEqual([88, 88, 88, 88]);

      const history = useProjectStore.getState().getUndoHistory('pianoRoll', { clipId });
      expect(history).toHaveLength(historyBefore + 1);
      expect(history.at(-1)?.label).toBe('Stamp chord');

      useProjectStore.getState().undo('pianoRoll', { clipId });
      expect(useProjectStore.getState().getClipById(clipId)!.midiData!.notes).toHaveLength(0);
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
      expect(typeof effectId).toBe('string');
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
