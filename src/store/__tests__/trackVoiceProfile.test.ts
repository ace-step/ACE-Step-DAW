import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../projectStore';

describe('Track voiceProfileId', () => {
  beforeEach(() => {
    useProjectStore.getState().createProject();
  });

  it('can assign a voice profile to a track', () => {
    const track = useProjectStore.getState().addTrack('vocals', 'stems');

    useProjectStore.getState().updateTrack(track.id, { voiceProfileId: 'voice-123' });

    const updated = useProjectStore.getState().project!.tracks.find((t) => t.id === track.id);
    expect(updated?.voiceProfileId).toBe('voice-123');
  });

  it('can clear a voice profile from a track', () => {
    const track = useProjectStore.getState().addTrack('vocals', 'stems');

    useProjectStore.getState().updateTrack(track.id, { voiceProfileId: 'voice-123' });
    useProjectStore.getState().updateTrack(track.id, { voiceProfileId: undefined });

    const updated = useProjectStore.getState().project!.tracks.find((t) => t.id === track.id);
    expect(updated?.voiceProfileId).toBeUndefined();
  });

  it('tracks start without a voice profile', () => {
    const track = useProjectStore.getState().addTrack('vocals', 'stems');
    expect(track.voiceProfileId).toBeUndefined();
  });
});
