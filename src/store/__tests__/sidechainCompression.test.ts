import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';
import type { CompressorParams } from '../../types/project';

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
    expect(effectId).not.toBeUndefined();

    useProjectStore.getState().setSidechainSource(bassTrackId, effectId, kickTrackId);

    const updatedTrack = useProjectStore.getState().project!.tracks.find(t => t.id === bassTrackId)!;
    const compressor = updatedTrack.effects.find(e => e.id === effectId)!;
    expect(compressor.type).toBe('compressor');
    expect((compressor.params as CompressorParams).sidechainSourceTrackId).toBe(kickTrackId);
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
    expect((compressor.params as CompressorParams).sidechainSourceTrackId).toBe(kickTrackId);

    useProjectStore.getState().setSidechainSource(bassTrackId, effectId, undefined);
    compressor = useProjectStore.getState().project!.tracks.find(t => t.id === bassTrackId)!
      .effects.find(e => e.id === effectId)!;
    expect((compressor.params as CompressorParams).sidechainSourceTrackId).toBeUndefined();
  });

  it('setSidechainSource ignores non-compressor effects', () => {
    const store = useProjectStore.getState();
    store.addTrack('stems');
    store.addTrack('stems');
    const tracks = useProjectStore.getState().project!.tracks;
    const kickTrackId = tracks[0].id;
    const bassTrackId = tracks[1].id;

    const reverbId = store.addTrackEffect(bassTrackId, 'reverb')!;

    // Should not crash or modify the reverb effect
    useProjectStore.getState().setSidechainSource(bassTrackId, reverbId, kickTrackId);
    const updatedTrack = useProjectStore.getState().project!.tracks.find(t => t.id === bassTrackId)!;
    const reverb = updatedTrack.effects.find(e => e.id === reverbId)!;
    expect(reverb.type).toBe('reverb');
    expect((reverb.params as Record<string, unknown>).sidechainSourceTrackId).toBeUndefined();
  });

  it('compressor default params do not include sidechainSourceTrackId', () => {
    const store = useProjectStore.getState();
    store.addTrack('stems');
    const tracks = useProjectStore.getState().project!.tracks;

    const effectId = store.addTrackEffect(tracks[0].id, 'compressor')!;
    const track = useProjectStore.getState().project!.tracks[0];
    const compressor = track.effects.find(e => e.id === effectId)!;
    const params = compressor.params as CompressorParams;

    expect(params.sidechainSourceTrackId).toBeUndefined();
    expect(params.threshold).toBe(-24);
    expect(params.ratio).toBe(4);
  });

  it('setSidechainSource supports undo', () => {
    const store = useProjectStore.getState();
    store.addTrack('stems');
    store.addTrack('stems');
    const tracks = useProjectStore.getState().project!.tracks;

    const effectId = store.addTrackEffect(tracks[1].id, 'compressor')!;

    useProjectStore.getState().setSidechainSource(tracks[1].id, effectId, tracks[0].id);
    const params = useProjectStore.getState().project!.tracks.find(t => t.id === tracks[1].id)!
      .effects.find(e => e.id === effectId)!.params as CompressorParams;
    expect(params.sidechainSourceTrackId).toBe(tracks[0].id);

    // Undo should revert the sidechain source
    useProjectStore.getState().undo();
    const undoneParams = useProjectStore.getState().project!.tracks.find(t => t.id === tracks[1].id)!
      .effects.find(e => e.id === effectId)!.params as CompressorParams;
    expect(undoneParams.sidechainSourceTrackId).toBeUndefined();
  });
});
