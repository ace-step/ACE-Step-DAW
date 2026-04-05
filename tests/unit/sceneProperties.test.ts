import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('scene properties (#1033)', () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
  });

  describe('scene color', () => {
    it('scenes have no color by default', () => {
      const scene = useProjectStore.getState().project?.session?.scenes[0];
      expect(scene).toBeDefined();
      expect(scene!.color).toBeUndefined();
    });

    it('can set a color on a scene via updateSessionSceneProperties', () => {
      const scene = useProjectStore.getState().project?.session?.scenes[0];
      useProjectStore.getState().updateSessionSceneProperties(scene!.id, { color: '#e74c3c' });
      const updated = useProjectStore.getState().project?.session?.scenes[0];
      expect(updated!.color).toBe('#e74c3c');
    });

    it('can clear a scene color by setting undefined', () => {
      const scene = useProjectStore.getState().project?.session?.scenes[0];
      useProjectStore.getState().updateSessionSceneProperties(scene!.id, { color: '#3498db' });
      useProjectStore.getState().updateSessionSceneProperties(scene!.id, { color: undefined });
      const updated = useProjectStore.getState().project?.session?.scenes[0];
      expect(updated!.color).toBeUndefined();
    });
  });

  describe('tempo override on scene launch', () => {
    it('launching a scene with tempo override updates the project BPM', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('drums');
      store.addClip(track.id, {
        startTime: 0,
        duration: 2,
        prompt: 'test',
        globalCaption: '',
        lyrics: '',
        source: 'uploaded',
      });

      const session = useProjectStore.getState().project?.session;
      const scene = session?.scenes[0];
      expect(scene).toBeDefined();

      // Set tempo override
      store.updateSessionSceneProperties(scene!.id, { tempo: 140 });

      // Launch scene (immediate since not playing)
      useTransportStore.setState({ currentTime: 0, isPlaying: false });
      useProjectStore.getState().launchSessionScene(scene!.id);

      // Verify BPM was updated
      const project = useProjectStore.getState().project;
      expect(project!.bpm).toBe(140);
    });

    it('launching a scene without tempo override does not change BPM', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('drums');
      store.addClip(track.id, {
        startTime: 0,
        duration: 2,
        prompt: 'test',
        globalCaption: '',
        lyrics: '',
        source: 'uploaded',
      });

      const session = useProjectStore.getState().project?.session;
      const scene = session?.scenes[0];

      useTransportStore.setState({ currentTime: 0, isPlaying: false });
      useProjectStore.getState().launchSessionScene(scene!.id);

      expect(useProjectStore.getState().project!.bpm).toBe(120);
    });
  });

  describe('time signature override on scene launch', () => {
    it('launching a scene with time signature override updates the project time signature', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('drums');
      store.addClip(track.id, {
        startTime: 0,
        duration: 2,
        prompt: 'test',
        globalCaption: '',
        lyrics: '',
        source: 'uploaded',
      });

      const session = useProjectStore.getState().project?.session;
      const scene = session?.scenes[0];

      // Set time signature override: 3/4
      store.updateSessionSceneProperties(scene!.id, { timeSignature: [3, 4] });

      useTransportStore.setState({ currentTime: 0, isPlaying: false });
      useProjectStore.getState().launchSessionScene(scene!.id);

      const project = useProjectStore.getState().project;
      expect(project!.timeSignature).toBe(3);
      expect(project!.timeSignatureDenominator).toBe(4);
    });

    it('launching a scene without time signature override preserves existing', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('drums');
      store.addClip(track.id, {
        startTime: 0,
        duration: 2,
        prompt: 'test',
        globalCaption: '',
        lyrics: '',
        source: 'uploaded',
      });

      const session = useProjectStore.getState().project?.session;
      const scene = session?.scenes[0];

      useTransportStore.setState({ currentTime: 0, isPlaying: false });
      useProjectStore.getState().launchSessionScene(scene!.id);

      expect(useProjectStore.getState().project!.timeSignature).toBe(4);
    });
  });

  describe('scene property persistence', () => {
    it('scene properties survive updateSessionSceneProperties round-trip', () => {
      const scene = useProjectStore.getState().project?.session?.scenes[0];

      useProjectStore.getState().updateSessionSceneProperties(scene!.id, {
        color: '#9b59b6',
        tempo: 90,
        timeSignature: [6, 8],
      });

      const updated = useProjectStore.getState().project?.session?.scenes[0];
      expect(updated).toMatchObject({
        id: scene!.id,
        name: scene!.name,
        index: 0,
        color: '#9b59b6',
        tempo: 90,
        timeSignature: [6, 8],
      });
    });

    it('updating one scene does not affect other scenes', () => {
      // Default project has 4 scenes; use the first two
      const scenes = useProjectStore.getState().project?.session?.scenes;
      expect(scenes!.length).toBeGreaterThanOrEqual(2);

      useProjectStore.getState().updateSessionSceneProperties(scenes![0].id, { color: '#e74c3c', tempo: 140 });
      useProjectStore.getState().updateSessionSceneProperties(scenes![1].id, { color: '#3498db', tempo: 80 });

      const result = useProjectStore.getState().project?.session?.scenes;
      expect(result![0].color).toBe('#e74c3c');
      expect(result![0].tempo).toBe(140);
      expect(result![1].color).toBe('#3498db');
      expect(result![1].tempo).toBe(80);
    });
  });

  describe('scene rename', () => {
    it('can rename a scene via updateSessionSceneProperties', () => {
      const scene = useProjectStore.getState().project?.session?.scenes[0];
      expect(scene!.name).toMatch(/Scene/);

      useProjectStore.getState().updateSessionSceneProperties(scene!.id, { name: 'Intro' });
      const updated = useProjectStore.getState().project?.session?.scenes[0];
      expect(updated!.name).toBe('Intro');
    });
  });

  describe('scene launch with both tempo and time signature overrides', () => {
    it('applies both overrides simultaneously', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('drums');
      store.addClip(track.id, {
        startTime: 0,
        duration: 2,
        prompt: 'test',
        globalCaption: '',
        lyrics: '',
        source: 'uploaded',
      });

      const session = useProjectStore.getState().project?.session;
      const scene = session?.scenes[0];

      store.updateSessionSceneProperties(scene!.id, { tempo: 160, timeSignature: [7, 8] });

      useTransportStore.setState({ currentTime: 0, isPlaying: false });
      useProjectStore.getState().launchSessionScene(scene!.id);

      const project = useProjectStore.getState().project;
      expect(project!.bpm).toBe(160);
      expect(project!.timeSignature).toBe(7);
      expect(project!.timeSignatureDenominator).toBe(8);
    });
  });
});
