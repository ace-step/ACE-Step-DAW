import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

// Mock projectStorage to prevent IndexedDB calls during testing
vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('drumMachine store actions', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  describe('addTrack with drumMachine type', () => {
    it('creates a drum machine track with 16 pads initialized', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      expect(track.trackType).toBe('drumMachine');
      expect(track.drumKit).toBe('808');
      expect(track.drumMachine).toBeDefined();
      expect(track.drumMachine!.pads).toHaveLength(16);
      expect(track.drumMachine!.kitName).toBe('808');
    });

    it('initializes pads with default names and properties', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      const pads = track.drumMachine!.pads;
      expect(pads[0].name).toBe('Kick');
      expect(pads[0].sampleKey).toBe('kick');
      expect(pads[0].volume).toBe(0.8);
      expect(pads[0].pan).toBe(0);
      expect(pads[1].name).toBe('Snare');
      expect(pads[15].name).toBe('Perc');
    });

    it('assigns unique IDs to each pad', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      const ids = track.drumMachine!.pads.map((p) => p.id);
      expect(new Set(ids).size).toBe(16);
    });

    it('sets laneHeight to 80 for drum machine tracks', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      expect(track.laneHeight).toBe(80);
    });
  });

  describe('setDrumPadSample', () => {
    it('changes the sample key of a pad', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadSample(track.id, 0, 'user-sample-custom');
      const updated = useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0];
      expect(updated.sampleKey).toBe('user-sample-custom');
    });

    it('does not affect other pads', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadSample(track.id, 0, 'new-sample');
      const pads = useProjectStore.getState().project!.tracks[0].drumMachine!.pads;
      expect(pads[1].sampleKey).toBe('snare');
      expect(pads[2].sampleKey).toBe('closed_hh');
    });
  });

  describe('setDrumPadVolume', () => {
    it('sets pad volume within bounds', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadVolume(track.id, 3, 0.5);
      const pad = useProjectStore.getState().project!.tracks[0].drumMachine!.pads[3];
      expect(pad.volume).toBe(0.5);
    });

    it('clamps volume to 0-1 range', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadVolume(track.id, 0, 1.5);
      expect(useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0].volume).toBe(1);
      useProjectStore.getState().setDrumPadVolume(track.id, 0, -0.5);
      expect(useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0].volume).toBe(0);
    });
  });

  describe('setDrumPadPan', () => {
    it('sets pad pan within bounds', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadPan(track.id, 2, -0.5);
      const pad = useProjectStore.getState().project!.tracks[0].drumMachine!.pads[2];
      expect(pad.pan).toBe(-0.5);
    });

    it('clamps pan to -1 to +1 range', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadPan(track.id, 0, 2);
      expect(useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0].pan).toBe(1);
      useProjectStore.getState().setDrumPadPan(track.id, 0, -3);
      expect(useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0].pan).toBe(-1);
    });
  });

  describe('renameDrumPad', () => {
    it('renames a pad', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().renameDrumPad(track.id, 0, 'My Kick');
      const pad = useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0];
      expect(pad.name).toBe('My Kick');
    });
  });

  describe('setDrumMachineKit', () => {
    it('changes the kit name', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumMachineKit(track.id, 'acoustic');
      const dm = useProjectStore.getState().project!.tracks[0].drumMachine!;
      expect(dm.kitName).toBe('acoustic');
    });

    it('also updates the track drumKit field', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumMachineKit(track.id, 'lofi');
      const updated = useProjectStore.getState().project!.tracks[0];
      expect(updated.drumKit).toBe('lofi');
    });
  });

  describe('initDrumMachine', () => {
    it('reinitializes a drum machine config', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      // Modify a pad
      useProjectStore.getState().setDrumPadSample(track.id, 0, 'custom');
      // Reinitialize
      useProjectStore.getState().initDrumMachine(track.id, 'acoustic');
      const dm = useProjectStore.getState().project!.tracks[0].drumMachine!;
      expect(dm.kitName).toBe('acoustic');
      expect(dm.pads[0].sampleKey).toBe('kick'); // reset to default
    });
  });

  describe('undo/redo', () => {
    it('undoes a pad sample change', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadSample(track.id, 0, 'custom');
      expect(useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0].sampleKey).toBe('custom');
      useProjectStore.getState().undo();
      expect(useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0].sampleKey).toBe('kick');
    });
  });
});
