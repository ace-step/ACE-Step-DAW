import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({ saveProject: vi.fn() }));

describe('send pre/post fader toggle', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ name: 'Test', bpm: 120 });
    useProjectStore.getState().addTrack('stems');
  });

  it('new sends default to post-fader', () => {
    const store = useProjectStore.getState();
    const rt = store.addReturnTrack('Reverb Bus');
    const trackId = store.project!.tracks[0].id;
    store.updateTrackSend(trackId, rt.id, 0.5);

    const send = useProjectStore.getState().project!.tracks[0].sends![0];
    expect(send.prePost).toBe('post');
  });

  it('setSendPrePost toggles a send to pre-fader', () => {
    const store = useProjectStore.getState();
    const rt = store.addReturnTrack('Delay Bus');
    const trackId = store.project!.tracks[0].id;
    store.updateTrackSend(trackId, rt.id, 0.7);

    store.setSendPrePost(trackId, 0, 'pre');

    const send = useProjectStore.getState().project!.tracks[0].sends![0];
    expect(send.prePost).toBe('pre');
  });

  it('setSendPrePost toggles a send back to post-fader', () => {
    const store = useProjectStore.getState();
    const rt = store.addReturnTrack('Chorus Bus');
    const trackId = store.project!.tracks[0].id;
    store.updateTrackSend(trackId, rt.id, 0.5);

    store.setSendPrePost(trackId, 0, 'pre');
    store.setSendPrePost(trackId, 0, 'post');

    const send = useProjectStore.getState().project!.tracks[0].sends![0];
    expect(send.prePost).toBe('post');
  });

  it('setSendPrePost is a no-op for out-of-bounds sendIndex', () => {
    const store = useProjectStore.getState();
    const rt = store.addReturnTrack('Bus');
    const trackId = store.project!.tracks[0].id;
    store.updateTrackSend(trackId, rt.id, 0.5);

    // Should not throw
    store.setSendPrePost(trackId, 5, 'pre');

    const send = useProjectStore.getState().project!.tracks[0].sends![0];
    expect(send.prePost).toBe('post');
  });

  it('setSendPrePost pushes history for undo', () => {
    const store = useProjectStore.getState();
    const rt = store.addReturnTrack('Bus');
    const trackId = store.project!.tracks[0].id;
    store.updateTrackSend(trackId, rt.id, 0.5);

    store.setSendPrePost(trackId, 0, 'pre');

    // Undo should revert to post
    store.undo();
    const send = useProjectStore.getState().project!.tracks[0].sends![0];
    expect(send.prePost).toBe('post');
  });

  it('updateTrackSend preserves existing prePost value when updating amount', () => {
    const store = useProjectStore.getState();
    const rt = store.addReturnTrack('Bus');
    const trackId = store.project!.tracks[0].id;
    store.updateTrackSend(trackId, rt.id, 0.5);
    store.setSendPrePost(trackId, 0, 'pre');

    // Update amount — should keep pre-fader
    store.updateTrackSend(trackId, rt.id, 0.9);

    const send = useProjectStore.getState().project!.tracks[0].sends![0];
    expect(send.amount).toBe(0.9);
    expect(send.prePost).toBe('pre');
  });
});
