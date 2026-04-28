import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../../../store/projectStore';

// Mock projectStorage to prevent IndexedDB calls
vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

// Mock audio engine
vi.mock('../../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    getOrCreateTrackNode: () => ({ spliceEffects: vi.fn() }),
    masterVolume: 1,
  }),
  useAudioEngine: vi.fn(),
}));

vi.mock('../../../engine/EffectsEngine', () => ({
  effectsEngine: {
    rebuildChain: vi.fn(),
    getInputNode: vi.fn(),
    getOutputNode: vi.fn(),
    updateEffectParams: vi.fn(),
  },
}));

function createTrack() {
  const store = useProjectStore.getState();
  const track = store.addTrack('custom', 'stems');
  return track.id;
}

describe('Device Chain Store Actions', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  describe('reorderTrackEffect', () => {
    it('exposes reorderTrackEffect as a store action', () => {
      const state = useProjectStore.getState();
      expect(typeof state.reorderTrackEffect).toBe('function');
    });

    it('reorders effects from index 0 to index 2', () => {
      const trackId = createTrack();
      const store = useProjectStore.getState();

      store.addTrackEffect(trackId, 'reverb');
      store.addTrackEffect(trackId, 'delay');
      store.addTrackEffect(trackId, 'compressor');

      const beforeEffects = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!.effects!;
      expect(beforeEffects).toHaveLength(3);
      const [e0, e1, e2] = beforeEffects;

      useProjectStore.getState().reorderTrackEffect(trackId, 0, 2);

      const afterEffects = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!.effects!;
      expect(afterEffects[0].id).toBe(e1.id);
      expect(afterEffects[1].id).toBe(e2.id);
      expect(afterEffects[2].id).toBe(e0.id);
    });

    it('reorders effects from index 2 to index 0', () => {
      const trackId = createTrack();
      const store = useProjectStore.getState();

      store.addTrackEffect(trackId, 'reverb');
      store.addTrackEffect(trackId, 'delay');
      store.addTrackEffect(trackId, 'compressor');

      const beforeEffects = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!.effects!;
      const [e0, e1, e2] = beforeEffects;

      useProjectStore.getState().reorderTrackEffect(trackId, 2, 0);

      const afterEffects = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!.effects!;
      expect(afterEffects[0].id).toBe(e2.id);
      expect(afterEffects[1].id).toBe(e0.id);
      expect(afterEffects[2].id).toBe(e1.id);
    });

    it('does nothing for invalid indices', () => {
      const trackId = createTrack();
      const store = useProjectStore.getState();
      store.addTrackEffect(trackId, 'reverb');

      const beforeEffects = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!.effects!;
      const [e0] = beforeEffects;

      useProjectStore.getState().reorderTrackEffect(trackId, -1, 0);
      const afterEffects = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!.effects!;
      expect(afterEffects[0].id).toBe(e0.id);
    });

    it('does nothing when from === to', () => {
      const trackId = createTrack();
      const store = useProjectStore.getState();
      store.addTrackEffect(trackId, 'reverb');
      store.addTrackEffect(trackId, 'delay');

      const beforeEffects = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!.effects!;
      const ids = beforeEffects.map(e => e.id);

      useProjectStore.getState().reorderTrackEffect(trackId, 1, 1);

      const afterEffects = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!.effects!;
      expect(afterEffects.map(e => e.id)).toEqual(ids);
    });
  });

  describe('addTrackEffect', () => {
    it('adds an effect to a track', () => {
      const trackId = createTrack();
      const effectId = useProjectStore.getState().addTrackEffect(trackId, 'reverb');

      expect(effectId).not.toBeUndefined();
      const track = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!;
      expect(track.effects).toHaveLength(1);
      expect(track.effects![0].type).toBe('reverb');
      expect(track.effects![0].enabled).toBe(true);
    });

    it('adds multiple effects in order', () => {
      const trackId = createTrack();
      const store = useProjectStore.getState();
      store.addTrackEffect(trackId, 'reverb');
      store.addTrackEffect(trackId, 'delay');
      store.addTrackEffect(trackId, 'compressor');

      const track = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!;
      expect(track.effects).toHaveLength(3);
      expect(track.effects![0].type).toBe('reverb');
      expect(track.effects![1].type).toBe('delay');
      expect(track.effects![2].type).toBe('compressor');
    });
  });

  describe('removeTrackEffect', () => {
    it('removes a specific effect from a track', () => {
      const trackId = createTrack();
      const effectId = useProjectStore.getState().addTrackEffect(trackId, 'reverb')!;
      useProjectStore.getState().addTrackEffect(trackId, 'delay');

      useProjectStore.getState().removeTrackEffect(trackId, effectId);

      const track = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!;
      expect(track.effects).toHaveLength(1);
      expect(track.effects![0].type).toBe('delay');
    });
  });

  describe('updateTrackEffect (bypass toggle)', () => {
    it('toggles effect enabled state', () => {
      const trackId = createTrack();
      const effectId = useProjectStore.getState().addTrackEffect(trackId, 'reverb')!;

      // Initially enabled
      let track = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!;
      expect(track.effects![0].enabled).toBe(true);

      // Bypass (disable)
      useProjectStore.getState().updateTrackEffect(trackId, effectId, { enabled: false });
      track = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!;
      expect(track.effects![0].enabled).toBe(false);

      // Re-enable
      useProjectStore.getState().updateTrackEffect(trackId, effectId, { enabled: true });
      track = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!;
      expect(track.effects![0].enabled).toBe(true);
    });
  });
});
