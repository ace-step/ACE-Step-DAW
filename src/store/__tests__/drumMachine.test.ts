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
      expect(track.drumMachine).not.toBeUndefined();
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

  describe('setDrumPadTune', () => {
    it('sets pad tune in semitones', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadTune(track.id, 0, 5);
      const pad = useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0];
      expect(pad.tune).toBe(5);
    });

    it('clamps tune to -24 to +24 range', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadTune(track.id, 0, 30);
      expect(useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0].tune).toBe(24);
      useProjectStore.getState().setDrumPadTune(track.id, 0, -30);
      expect(useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0].tune).toBe(-24);
    });

    it('defaults to 0 on new pads', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      expect(track.drumMachine!.pads[0].tune).toBe(0);
    });
  });

  describe('setDrumPadDecay', () => {
    it('sets pad decay', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadDecay(track.id, 0, 0.5);
      const pad = useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0];
      expect(pad.decay).toBe(0.5);
    });

    it('clamps decay to 0-1 range', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadDecay(track.id, 0, 1.5);
      expect(useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0].decay).toBe(1);
      useProjectStore.getState().setDrumPadDecay(track.id, 0, -0.5);
      expect(useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0].decay).toBe(0);
    });

    it('defaults to 1 on new pads', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      expect(track.drumMachine!.pads[0].decay).toBe(1);
    });
  });

  describe('setDrumPadFilter', () => {
    it('sets pad filter type and cutoff', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadFilter(track.id, 0, { type: 'lowpass', cutoff: 2000 });
      const pad = useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0];
      expect(pad.filter.type).toBe('lowpass');
      expect(pad.filter.cutoff).toBe(2000);
    });

    it('clamps cutoff to 20-20000 range', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadFilter(track.id, 0, { cutoff: 25000 });
      expect(useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0].filter.cutoff).toBe(20000);
      useProjectStore.getState().setDrumPadFilter(track.id, 0, { cutoff: 5 });
      expect(useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0].filter.cutoff).toBe(20);
    });

    it('defaults to off with 20000 cutoff', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      const pad = track.drumMachine!.pads[0];
      expect(pad.filter.type).toBe('off');
      expect(pad.filter.cutoff).toBe(20000);
    });
  });

  describe('setDrumPadDrive', () => {
    it('sets pad drive amount', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadDrive(track.id, 0, 0.5);
      const pad = useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0];
      expect(pad.drive).toBe(0.5);
    });

    it('clamps drive to 0-1 range', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadDrive(track.id, 0, 1.5);
      expect(useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0].drive).toBe(1);
      useProjectStore.getState().setDrumPadDrive(track.id, 0, -0.5);
      expect(useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0].drive).toBe(0);
    });

    it('defaults to 0 on new pads', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      expect(track.drumMachine!.pads[0].drive).toBe(0);
    });
  });

  describe('setDrumPadSend', () => {
    it('sets pad reverb send', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadSend(track.id, 0, { reverb: 0.4 });
      const pad = useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0];
      expect(pad.send.reverb).toBe(0.4);
    });

    it('sets pad delay send', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadSend(track.id, 0, { delay: 0.6 });
      const pad = useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0];
      expect(pad.send.delay).toBe(0.6);
    });

    it('clamps send amounts to 0-1', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadSend(track.id, 0, { reverb: 1.5, delay: -0.5 });
      const pad = useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0];
      expect(pad.send.reverb).toBe(1);
      expect(pad.send.delay).toBe(0);
    });

    it('defaults to 0 sends on new pads', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      const pad = track.drumMachine!.pads[0];
      expect(pad.send.reverb).toBe(0);
      expect(pad.send.delay).toBe(0);
    });
  });

  describe('migration: backfill missing pad fields', () => {
    it('adds default tune/decay/filter/drive/send to pads missing them', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      // Simulate an old persisted pad without the new fields by stripping them
      const oldPad = { ...track.drumMachine!.pads[0] } as Record<string, unknown>;
      delete oldPad.tune;
      delete oldPad.decay;
      delete oldPad.filter;
      delete oldPad.drive;
      delete oldPad.send;

      // Reload the project through setProject which calls ensureTrackDefaults
      const project = useProjectStore.getState().project!;
      const modifiedTrack = {
        ...project.tracks[0],
        drumMachine: {
          ...project.tracks[0].drumMachine!,
          pads: [oldPad as never, ...project.tracks[0].drumMachine!.pads.slice(1)],
        },
      };
      useProjectStore.getState().setProject({
        ...project,
        tracks: [modifiedTrack],
      });

      const pad = useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0];
      expect(pad.tune).toBe(0);
      expect(pad.decay).toBe(1);
      expect(pad.filter).toEqual({ type: 'off', cutoff: 20000 });
      expect(pad.drive).toBe(0);
      expect(pad.send).toEqual({ reverb: 0, delay: 0 });
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

    it('undoes a pad tune change', () => {
      const track = useProjectStore.getState().addTrack('drums', 'drumMachine');
      useProjectStore.getState().setDrumPadTune(track.id, 0, 12);
      expect(useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0].tune).toBe(12);
      useProjectStore.getState().undo();
      expect(useProjectStore.getState().project!.tracks[0].drumMachine!.pads[0].tune).toBe(0);
    });
  });
});
