import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';

vi.mock('../../src/services/projectStorage', () => ({ saveProject: vi.fn() }));

describe('expanded session quantization', () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
  });

  // At BPM=120: beatDuration = 60/120 = 0.5s
  // timeSignature = 4

  it('computes correct quantization seconds for 1/32', () => {
    const store = useProjectStore.getState();
    store.setSessionLaunchQuantization('1/32');

    const track = store.addTrack('drums');
    store.addClip(track.id, {
      startTime: 0, duration: 2, prompt: 'Test', globalCaption: '', lyrics: '', source: 'uploaded',
    });

    const session = useProjectStore.getState().project!.session!;
    const scene = session.scenes[0];

    // Set transport playing at time 0.1 — with 1/32 quantization (0.0625s), next boundary is 0.125s
    useTransportStore.setState({ currentTime: 0.1, isPlaying: true });
    store.launchSessionClip(track.id, scene.id);

    const pending = useProjectStore.getState().project!.session!.pendingLaunches;
    expect(pending).toHaveLength(1);
    expect(pending[0].executeAt).toBeCloseTo(0.125, 5);
  });

  it('computes correct quantization seconds for 1/16', () => {
    const store = useProjectStore.getState();
    store.setSessionLaunchQuantization('1/16');

    const track = store.addTrack('drums');
    store.addClip(track.id, {
      startTime: 0, duration: 2, prompt: 'Test', globalCaption: '', lyrics: '', source: 'uploaded',
    });

    const session = useProjectStore.getState().project!.session!;
    const scene = session.scenes[0];

    // 1/16 = 0.125s per step. At time 0.1, next boundary = 0.125
    useTransportStore.setState({ currentTime: 0.1, isPlaying: true });
    store.launchSessionClip(track.id, scene.id);

    const pending = useProjectStore.getState().project!.session!.pendingLaunches;
    expect(pending).toHaveLength(1);
    expect(pending[0].executeAt).toBeCloseTo(0.125, 5);
  });

  it('computes correct quantization seconds for 2 bars', () => {
    const store = useProjectStore.getState();
    store.setSessionLaunchQuantization('2 bars');

    const track = store.addTrack('drums');
    store.addClip(track.id, {
      startTime: 0, duration: 2, prompt: 'Test', globalCaption: '', lyrics: '', source: 'uploaded',
    });

    const session = useProjectStore.getState().project!.session!;
    const scene = session.scenes[0];

    // 2 bars = 0.5 * 4 * 2 = 4s. At time 1.0, next boundary = 4.0
    useTransportStore.setState({ currentTime: 1.0, isPlaying: true });
    store.launchSessionClip(track.id, scene.id);

    const pending = useProjectStore.getState().project!.session!.pendingLaunches;
    expect(pending).toHaveLength(1);
    expect(pending[0].executeAt).toBeCloseTo(4.0, 5);
  });

  it('computes correct quantization seconds for 4 bars', () => {
    const store = useProjectStore.getState();
    store.setSessionLaunchQuantization('4 bars');

    const track = store.addTrack('drums');
    store.addClip(track.id, {
      startTime: 0, duration: 2, prompt: 'Test', globalCaption: '', lyrics: '', source: 'uploaded',
    });

    const session = useProjectStore.getState().project!.session!;
    const scene = session.scenes[0];

    // 4 bars = 0.5 * 4 * 4 = 8s. At time 1.0, next boundary = 8.0
    useTransportStore.setState({ currentTime: 1.0, isPlaying: true });
    store.launchSessionClip(track.id, scene.id);

    const pending = useProjectStore.getState().project!.session!.pendingLaunches;
    expect(pending).toHaveLength(1);
    expect(pending[0].executeAt).toBeCloseTo(8.0, 5);
  });

  it('computes correct quantization seconds for 8 bars', () => {
    const store = useProjectStore.getState();
    store.setSessionLaunchQuantization('8 bars');

    const track = store.addTrack('drums');
    store.addClip(track.id, {
      startTime: 0, duration: 2, prompt: 'Test', globalCaption: '', lyrics: '', source: 'uploaded',
    });

    const session = useProjectStore.getState().project!.session!;
    const scene = session.scenes[0];

    // 8 bars = 0.5 * 4 * 8 = 16s. At time 1.0, next boundary = 16.0
    useTransportStore.setState({ currentTime: 1.0, isPlaying: true });
    store.launchSessionClip(track.id, scene.id);

    const pending = useProjectStore.getState().project!.session!.pendingLaunches;
    expect(pending).toHaveLength(1);
    expect(pending[0].executeAt).toBeCloseTo(16.0, 5);
  });

  describe('per-clip quantization override', () => {
    it('uses slot quantization instead of session quantization when set', () => {
      const store = useProjectStore.getState();
      store.setSessionLaunchQuantization('1 bar'); // session = 1 bar = 2s

      const track = store.addTrack('drums');
      store.addClip(track.id, {
        startTime: 0, duration: 2, prompt: 'Test', globalCaption: '', lyrics: '', source: 'uploaded',
      });

      const session = useProjectStore.getState().project!.session!;
      const scene = session.scenes[0];
      const slot = session.slots.find((s) => s.trackId === track.id && s.sceneId === scene.id)!;

      // Set slot quantization to '1/4' = 0.5s per step
      store.setSessionSlotQuantization(slot.id, '1/4');

      // At time 0.1, with 1/4 quantization (0.5s), next boundary = 0.5
      useTransportStore.setState({ currentTime: 0.1, isPlaying: true });
      store.launchSessionClip(track.id, scene.id);

      const pending = useProjectStore.getState().project!.session!.pendingLaunches;
      expect(pending).toHaveLength(1);
      // If session quantization was used (1 bar = 2s), executeAt would be 2.0
      // With slot override (1/4 = 0.5s), executeAt should be 0.5
      expect(pending[0].executeAt).toBeCloseTo(0.5, 5);
    });

    it('falls back to session quantization when slot is set to global', () => {
      const store = useProjectStore.getState();
      store.setSessionLaunchQuantization('1/4'); // session = 1/4 = 0.5s

      const track = store.addTrack('drums');
      store.addClip(track.id, {
        startTime: 0, duration: 2, prompt: 'Test', globalCaption: '', lyrics: '', source: 'uploaded',
      });

      const session = useProjectStore.getState().project!.session!;
      const scene = session.scenes[0];
      const slot = session.slots.find((s) => s.trackId === track.id && s.sceneId === scene.id)!;

      // Explicitly set to 'global' — should use session quantization
      store.setSessionSlotQuantization(slot.id, 'global');

      useTransportStore.setState({ currentTime: 0.1, isPlaying: true });
      store.launchSessionClip(track.id, scene.id);

      const pending = useProjectStore.getState().project!.session!.pendingLaunches;
      expect(pending).toHaveLength(1);
      expect(pending[0].executeAt).toBeCloseTo(0.5, 5);
    });

    it('falls back to session quantization when slot quantization is undefined', () => {
      const store = useProjectStore.getState();
      store.setSessionLaunchQuantization('1/2'); // session = 1/2 = 1.0s

      const track = store.addTrack('drums');
      store.addClip(track.id, {
        startTime: 0, duration: 2, prompt: 'Test', globalCaption: '', lyrics: '', source: 'uploaded',
      });

      const session = useProjectStore.getState().project!.session!;
      const scene = session.scenes[0];

      useTransportStore.setState({ currentTime: 0.1, isPlaying: true });
      store.launchSessionClip(track.id, scene.id);

      const pending = useProjectStore.getState().project!.session!.pendingLaunches;
      expect(pending).toHaveLength(1);
      expect(pending[0].executeAt).toBeCloseTo(1.0, 5);
    });
  });

  describe('setSessionSlotQuantization action', () => {
    it('updates the slot quantization field', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('drums');
      store.addClip(track.id, {
        startTime: 0, duration: 2, prompt: 'Test', globalCaption: '', lyrics: '', source: 'uploaded',
      });

      const session = useProjectStore.getState().project!.session!;
      const scene = session.scenes[0];
      const slot = session.slots.find((s) => s.trackId === track.id && s.sceneId === scene.id)!;
      expect(slot.quantization).toBe('global');

      store.setSessionSlotQuantization(slot.id, '1/8');

      const updatedSlot = useProjectStore.getState().project!.session!.slots.find((s) => s.id === slot.id)!;
      expect(updatedSlot.quantization).toBe('1/8');
    });

    it('ignores unknown slot ids', () => {
      const store = useProjectStore.getState();
      const sessionBefore = useProjectStore.getState().project!.session!;

      store.setSessionSlotQuantization('nonexistent-id', '1/4');

      const sessionAfter = useProjectStore.getState().project!.session!;
      expect(sessionAfter.slots).toEqual(sessionBefore.slots);
    });
  });

  describe('new slots default to global quantization', () => {
    it('creates new slots with quantization set to global', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('drums');

      const session = useProjectStore.getState().project!.session!;
      const trackSlots = session.slots.filter((s) => s.trackId === track.id);

      expect(trackSlots.length).toBeGreaterThan(0);
      for (const slot of trackSlots) {
        expect(slot.quantization).toBe('global');
      }
    });
  });
});
