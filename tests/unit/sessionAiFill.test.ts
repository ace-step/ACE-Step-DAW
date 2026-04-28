import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('aiFillSessionSlot', () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
  });

  function addTrackWithClips(count: number) {
    const store = useProjectStore.getState();
    const track = store.addTrack('drums');
    const clips = [];
    for (let i = 0; i < count; i++) {
      const clip = store.addClip(track.id, {
        startTime: i * 4,
        duration: 4,
        prompt: `Beat pattern ${i + 1}`,
        globalCaption: 'Electronic dance track',
        lyrics: '',
        source: 'uploaded',
      });
      clips.push(clip);
    }
    return { track, clips };
  }

  it('creates a clip in an empty session slot', () => {
    const { track, clips } = addTrackWithClips(2);
    const session = useProjectStore.getState().project!.session!;

    // Find an empty slot for this track
    const emptySlot = session.slots.find((s) => s.trackId === track.id && !s.clipId);
    expect(emptySlot).toBeDefined();

    const result = useProjectStore.getState().aiFillSessionSlot(emptySlot!.id);
    expect(result).not.toBeNull();
    expect(result!.source).toBe('generated');
    expect(result!.prompt).toContain('Continue from');
  });

  it('assigns the clip to the target slot specifically', () => {
    const { track } = addTrackWithClips(2);
    const session = useProjectStore.getState().project!.session!;

    const emptySlot = session.slots.find((s) => s.trackId === track.id && !s.clipId);
    expect(emptySlot).toBeDefined();

    const clip = useProjectStore.getState().aiFillSessionSlot(emptySlot!.id);
    expect(clip).not.toBeNull();

    // Verify the slot now has the clip
    const updatedSlot = useProjectStore.getState().project!.session!.slots.find((s) => s.id === emptySlot!.id);
    expect(updatedSlot?.clipId).toBe(clip!.id);
  });

  it('returns null for a slot that already has a clip', () => {
    const { track, clips } = addTrackWithClips(2);
    const session = useProjectStore.getState().project!.session!;

    const occupiedSlot = session.slots.find((s) => s.trackId === track.id && s.clipId !== null);
    expect(occupiedSlot).toBeDefined();

    const result = useProjectStore.getState().aiFillSessionSlot(occupiedSlot!.id);
    expect(result).toBeNull();
  });

  it('returns null for invalid slot id', () => {
    addTrackWithClips(1);
    const result = useProjectStore.getState().aiFillSessionSlot('nonexistent');
    expect(result).toBeNull();
  });

  it('uses context from adjacent clips for the prompt', () => {
    const { track, clips } = addTrackWithClips(3);
    const session = useProjectStore.getState().project!.session!;

    // Find empty slot between or after existing clips
    const emptySlot = session.slots.find((s) => s.trackId === track.id && !s.clipId);
    if (!emptySlot) return; // Skip if no empty slot

    const clip = useProjectStore.getState().aiFillSessionSlot(emptySlot.id);
    expect(clip).not.toBeNull();
    // Should reference nearby clip prompts
    expect(clip!.prompt).toContain('Beat pattern');
  });

  it('uses globalCaption from adjacent clips when project has none', () => {
    // Create project with empty globalCaption
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });

    const store = useProjectStore.getState();
    const track = store.addTrack('synth');
    store.addClip(track.id, {
      startTime: 0,
      duration: 4,
      prompt: 'Synth lead',
      globalCaption: 'Pop ballad with piano',
      lyrics: '',
      source: 'uploaded',
    });

    const session = useProjectStore.getState().project!.session!;
    const emptySlot = session.slots.find((s) => s.trackId === track.id && !s.clipId);
    if (!emptySlot) return;

    const clip = useProjectStore.getState().aiFillSessionSlot(emptySlot.id);
    expect(clip).not.toBeNull();
    expect(clip!.globalCaption).toContain('Pop ballad');
  });

  it('sets clip duration based on project settings', () => {
    addTrackWithClips(1);
    const session = useProjectStore.getState().project!.session!;
    const emptySlot = session.slots.find((s) => !s.clipId);
    if (!emptySlot) return;

    const clip = useProjectStore.getState().aiFillSessionSlot(emptySlot.id);
    expect(clip).not.toBeNull();
    // At 120 BPM, 4/4 time, 4 bars clip = 4 * 4 * 0.5 = 8 seconds
    expect(clip!.duration).toBeCloseTo(8, 1);
  });
});
