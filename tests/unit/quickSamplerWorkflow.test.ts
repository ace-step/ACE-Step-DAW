import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('Quick Sampler workflow', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useProjectStore.getState().createProject();
  });

  describe('createQuickSamplerTrack', () => {
    it('creates a new pianoRoll track with sampler preset', () => {
      const track = useProjectStore.getState().createQuickSamplerTrack({
        audioKey: 'audio:proj:qs-1',
        sampleName: 'Kick',
        sampleDuration: 0.5,
      });

      expect(track).toBeDefined();
      expect(track!.trackType).toBe('pianoRoll');
      expect(track!.synthPreset).toBe('sampler');
      expect(track!.displayName).toBe('Kick');
    });

    it('uses default root note C4 (60) when not specified', () => {
      const track = useProjectStore.getState().createQuickSamplerTrack({
        audioKey: 'audio:proj:qs-default-root',
      });

      expect(track!.sampler!.rootNote).toBe(60);
      expect(track!.samplerConfig!.rootNote).toBe(60);
    });

    it('uses custom root note when specified', () => {
      const track = useProjectStore.getState().createQuickSamplerTrack({
        audioKey: 'audio:proj:qs-custom-root',
        rootNote: 48,
      });

      expect(track!.sampler!.rootNote).toBe(48);
      expect(track!.samplerConfig!.rootNote).toBe(48);
    });

    it('sets trimEnd and loopEnd to sampleDuration', () => {
      const track = useProjectStore.getState().createQuickSamplerTrack({
        audioKey: 'audio:proj:qs-dur',
        sampleDuration: 3.5,
      });

      expect(track!.samplerConfig!.trimEnd).toBe(3.5);
      expect(track!.samplerConfig!.loopEnd).toBe(3.5);
    });

    it('defaults display name to "Quick Sampler" when no sampleName', () => {
      const track = useProjectStore.getState().createQuickSamplerTrack({
        audioKey: 'audio:proj:qs-noname',
      });

      expect(track!.displayName).toBe('Quick Sampler');
    });

    it('updates an existing track when trackId is provided', () => {
      const original = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');

      const updated = useProjectStore.getState().createQuickSamplerTrack({
        trackId: original.id,
        audioKey: 'audio:proj:qs-update',
        sampleName: 'Updated Sampler',
        sampleDuration: 2.0,
      });

      expect(updated).toBeDefined();
      expect(updated!.id).toBe(original.id);
      expect(updated!.synthPreset).toBe('sampler');
      expect(updated!.displayName).toBe('Updated Sampler');
      // Should not add a new track
      expect(useProjectStore.getState().project!.tracks).toHaveLength(1);
    });

    it('returns undefined for nonexistent trackId', () => {
      const result = useProjectStore.getState().createQuickSamplerTrack({
        trackId: 'nonexistent-id',
        audioKey: 'audio:proj:qs-missing',
      });

      expect(result).toBeUndefined();
    });

    it('pushes to undo history', () => {
      const track = useProjectStore.getState().createQuickSamplerTrack({
        audioKey: 'audio:proj:qs-undo',
        sampleName: 'Undoable',
      });

      expect(track).toBeDefined();
      useProjectStore.getState().undo();

      const tracks = useProjectStore.getState().project!.tracks;
      expect(tracks.find((t) => t.displayName === 'Undoable')).toBeUndefined();
    });

    it('syncs sampler and samplerConfig audioKey', () => {
      const track = useProjectStore.getState().createQuickSamplerTrack({
        audioKey: 'audio:proj:qs-sync',
        sampleName: 'Synced',
        sampleDuration: 1.5,
        rootNote: 64,
      });

      expect(track!.sampler!.audioKey).toBe('audio:proj:qs-sync');
      expect(track!.samplerConfig!.audioKey).toBe('audio:proj:qs-sync');
    });
  });

  describe('createQuickSamplerFromClip', () => {
    it('creates a Quick Sampler track from a clip with audio', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('custom', 'sample');
      const clip = store.addClip(track.id, {
        startTime: 0,
        duration: 2.0,
        prompt: 'Test clip',
        lyrics: '',
      });

      store.updateClipStatus(clip.id, 'ready', {
        isolatedAudioKey: 'audio:proj:clip-1:iso:v1',
        audioDuration: 2.0,
      });

      const samplerTrack = store.createQuickSamplerFromClip(track.id, clip.id);

      expect(samplerTrack).toBeDefined();
      expect(samplerTrack!.trackType).toBe('pianoRoll');
      expect(samplerTrack!.synthPreset).toBe('sampler');
      expect(samplerTrack!.sampler!.audioKey).toBe('audio:proj:clip-1:iso:v1');
      expect(samplerTrack!.samplerConfig!.audioKey).toBe('audio:proj:clip-1:iso:v1');
      expect(samplerTrack!.samplerConfig!.trimEnd).toBe(2.0);
    });

    it('uses clip prompt as sample name', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('custom', 'sample');
      const clip = store.addClip(track.id, {
        startTime: 0,
        duration: 1.0,
        prompt: 'Cool Synth Lead',
        lyrics: '',
      });

      store.updateClipStatus(clip.id, 'ready', {
        isolatedAudioKey: 'audio:proj:clip-2:iso:v1',
        audioDuration: 1.0,
      });

      const samplerTrack = store.createQuickSamplerFromClip(track.id, clip.id);
      expect(samplerTrack!.displayName).toBe('Cool Synth Lead');
    });

    it('returns undefined when clip has no audio key', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('custom', 'sample');
      const clip = store.addClip(track.id, {
        startTime: 0,
        duration: 1.0,
        prompt: 'No audio',
        lyrics: '',
      });

      const result = store.createQuickSamplerFromClip(track.id, clip.id);
      expect(result).toBeUndefined();
    });

    it('returns undefined for nonexistent clip', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('custom', 'sample');

      const result = store.createQuickSamplerFromClip(track.id, 'nonexistent-clip');
      expect(result).toBeUndefined();
    });

    it('returns undefined for nonexistent track', () => {
      const store = useProjectStore.getState();
      const result = store.createQuickSamplerFromClip('nonexistent-track', 'nonexistent-clip');
      expect(result).toBeUndefined();
    });

    it('pushes to undo history', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('custom', 'sample');
      const clip = store.addClip(track.id, {
        startTime: 0,
        duration: 1.0,
        prompt: 'Undo test',
        lyrics: '',
      });

      store.updateClipStatus(clip.id, 'ready', {
        isolatedAudioKey: 'audio:proj:clip-undo:iso:v1',
        audioDuration: 1.0,
      });

      const trackCountBefore = useProjectStore.getState().project!.tracks.length;
      useProjectStore.getState().createQuickSamplerFromClip(track.id, clip.id);
      expect(useProjectStore.getState().project!.tracks.length).toBe(trackCountBefore + 1);

      useProjectStore.getState().undo();
      expect(useProjectStore.getState().project!.tracks.length).toBe(trackCountBefore);
    });

    it('uses audioDuration for trimEnd/loopEnd', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('custom', 'sample');
      const clip = store.addClip(track.id, {
        startTime: 0,
        duration: 5.0,
        prompt: 'Long clip',
        lyrics: '',
      });

      store.updateClipStatus(clip.id, 'ready', {
        isolatedAudioKey: 'audio:proj:clip-long:iso:v1',
        audioDuration: 4.8,
      });

      const samplerTrack = store.createQuickSamplerFromClip(track.id, clip.id);
      expect(samplerTrack!.samplerConfig!.trimEnd).toBe(4.8);
      expect(samplerTrack!.samplerConfig!.loopEnd).toBe(4.8);
    });
  });
});
