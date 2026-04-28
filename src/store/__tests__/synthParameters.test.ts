import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

function setupTrack() {
  useProjectStore.getState().createProject();
  const track = useProjectStore.getState().addTrack('pianoRoll');
  return track;
}

describe('synth parameter store actions', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
  });

  describe('updateSynthOscillatorType', () => {
    it('sets oscillator type on a track', () => {
      const track = setupTrack();
      useProjectStore.getState().updateSynthOscillatorType(track.id, 'sawtooth');
      const updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
      expect(updated.synthOscillatorType).toBe('sawtooth');
    });

    it('updates oscillator type to different waveform', () => {
      const track = setupTrack();
      useProjectStore.getState().updateSynthOscillatorType(track.id, 'sine');
      useProjectStore.getState().updateSynthOscillatorType(track.id, 'square');
      const updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
      expect(updated.synthOscillatorType).toBe('square');
    });

    it('does nothing when project is null', () => {
      useProjectStore.setState({ project: null });
      useProjectStore.getState().updateSynthOscillatorType('nonexistent', 'sine');
      expect(useProjectStore.getState().project).toBeNull();
    });
  });

  describe('updateSynthEnvelope', () => {
    it('sets envelope values on a track', () => {
      const track = setupTrack();
      useProjectStore.getState().updateSynthEnvelope(track.id, {
        attack: 0.1,
        decay: 0.3,
        sustain: 0.5,
        release: 1.0,
      });
      const updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
      expect(updated.synthEnvelope).toEqual({
        attack: 0.1,
        decay: 0.3,
        sustain: 0.5,
        release: 1.0,
      });
    });

    it('merges partial envelope updates', () => {
      const track = setupTrack();
      useProjectStore.getState().updateSynthEnvelope(track.id, {
        attack: 0.2,
        decay: 0.4,
        sustain: 0.6,
        release: 0.8,
      });
      useProjectStore.getState().updateSynthEnvelope(track.id, { attack: 0.5 });
      const updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
      expect(updated.synthEnvelope!.attack).toBe(0.5);
      expect(updated.synthEnvelope!.decay).toBe(0.4);
      expect(updated.synthEnvelope!.sustain).toBe(0.6);
      expect(updated.synthEnvelope!.release).toBe(0.8);
    });

    it('creates default envelope when none exists and partial update applied', () => {
      const track = setupTrack();
      useProjectStore.getState().updateSynthEnvelope(track.id, { attack: 0.3 });
      const updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
      expect(updated.synthEnvelope!.attack).toBe(0.3);
      expect(updated.synthEnvelope!.decay).toBe(0.1);
      expect(updated.synthEnvelope!.sustain).toBe(0.7);
      expect(updated.synthEnvelope!.release).toBe(0.3);
    });

    it('does nothing when project is null', () => {
      useProjectStore.setState({ project: null });
      useProjectStore.getState().updateSynthEnvelope('nonexistent', { attack: 1 });
      expect(useProjectStore.getState().project).toBeNull();
    });
  });

  describe('updateSynthFilter', () => {
    it('sets filter values on a track', () => {
      const track = setupTrack();
      useProjectStore.getState().updateSynthFilter(track.id, {
        type: 'highpass',
        frequency: 500,
        Q: 2,
      });
      const updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
      expect(updated.synthFilter).toEqual({
        type: 'highpass',
        frequency: 500,
        Q: 2,
      });
    });

    it('merges partial filter updates', () => {
      const track = setupTrack();
      useProjectStore.getState().updateSynthFilter(track.id, {
        type: 'lowpass',
        frequency: 2000,
        Q: 5,
      });
      useProjectStore.getState().updateSynthFilter(track.id, { frequency: 800 });
      const updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
      expect(updated.synthFilter!.type).toBe('lowpass');
      expect(updated.synthFilter!.frequency).toBe(800);
      expect(updated.synthFilter!.Q).toBe(5);
    });

    it('creates default filter when none exists and partial update applied', () => {
      const track = setupTrack();
      useProjectStore.getState().updateSynthFilter(track.id, { frequency: 3000 });
      const updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
      expect(updated.synthFilter!.type).toBe('lowpass');
      expect(updated.synthFilter!.frequency).toBe(3000);
      expect(updated.synthFilter!.Q).toBe(1);
    });
  });

  describe('updateSynthLfo', () => {
    it('sets LFO values on a track', () => {
      const track = setupTrack();
      useProjectStore.getState().updateSynthLfo(track.id, {
        rate: 4,
        depth: 0.8,
        shape: 'square',
      });
      const updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
      expect(updated.synthLfo).toEqual({
        rate: 4,
        depth: 0.8,
        shape: 'square',
      });
    });

    it('merges partial LFO updates', () => {
      const track = setupTrack();
      useProjectStore.getState().updateSynthLfo(track.id, {
        rate: 2,
        depth: 0.5,
        shape: 'triangle',
      });
      useProjectStore.getState().updateSynthLfo(track.id, { rate: 10 });
      const updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
      expect(updated.synthLfo!.rate).toBe(10);
      expect(updated.synthLfo!.depth).toBe(0.5);
      expect(updated.synthLfo!.shape).toBe('triangle');
    });

    it('creates default LFO when none exists and partial update applied', () => {
      const track = setupTrack();
      useProjectStore.getState().updateSynthLfo(track.id, { depth: 0.9 });
      const updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!;
      expect(updated.synthLfo!.rate).toBe(1);
      expect(updated.synthLfo!.depth).toBe(0.9);
      expect(updated.synthLfo!.shape).toBe('sine');
    });
  });
});
