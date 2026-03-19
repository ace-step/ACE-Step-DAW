import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({ saveProject: vi.fn() }));

describe('sidechain compression with cross-track routing', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ name: 'Test', bpm: 120 });
  });

  it('setSidechainSource sets the sidechain source trackId on a compressor effect', () => {
    const store = useProjectStore.getState();
    store.addTrack('stems');
    store.addTrack('stems');
    const tracks = useProjectStore.getState().project!.tracks;
    const kickTrackId = tracks[0].id;
    const bassTrackId = tracks[1].id;

    const effectId = store.addTrackEffect(bassTrackId, 'compressor')!;
    expect(effectId).toBeDefined();

    useProjectStore.getState().setSidechainSource(bassTrackId, effectId, kickTrackId);

    const updatedTrack = useProjectStore.getState().project!.tracks.find(t => t.id === bassTrackId)!;
    const compressor = updatedTrack.effects.find(e => e.id === effectId)!;
    expect(compressor.type).toBe('compressor');
    expect((compressor.params as { sidechainSourceTrackId?: string }).sidechainSourceTrackId).toBe(kickTrackId);
  });

  it('setSidechainSource can clear the sidechain by passing undefined', () => {
    const store = useProjectStore.getState();
    store.addTrack('stems');
    store.addTrack('stems');
    const tracks = useProjectStore.getState().project!.tracks;
    const kickTrackId = tracks[0].id;
    const bassTrackId = tracks[1].id;

    const effectId = store.addTrackEffect(bassTrackId, 'compressor')!;

    useProjectStore.getState().setSidechainSource(bassTrackId, effectId, kickTrackId);
    let compressor = useProjectStore.getState().project!.tracks.find(t => t.id === bassTrackId)!
      .effects.find(e => e.id === effectId)!;
    expect((compressor.params as { sidechainSourceTrackId?: string }).sidechainSourceTrackId).toBe(kickTrackId);

    useProjectStore.getState().setSidechainSource(bassTrackId, effectId, undefined);
    compressor = useProjectStore.getState().project!.tracks.find(t => t.id === bassTrackId)!
      .effects.find(e => e.id === effectId)!;
    expect((compressor.params as { sidechainSourceTrackId?: string }).sidechainSourceTrackId).toBeUndefined();
  });
});
