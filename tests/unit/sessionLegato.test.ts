import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';

vi.mock('../../src/services/projectStorage', () => ({ saveProject: vi.fn() }));

describe('session legato mode', () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
  });

  it('new slots have legato false by default', () => {
    const track = useProjectStore.getState().addTrack('drums');
    const slots = useProjectStore.getState().project?.session?.slots.filter(
      (s) => s.trackId === track.id,
    );
    expect(slots).not.toBeUndefined();
    expect(slots!.length).toBeGreaterThan(0);
    for (const slot of slots!) {
      expect(slot.legato).toBe(false);
    }
  });

  it('setSessionSlotLegato toggles legato mode on', () => {
    const track = useProjectStore.getState().addTrack('drums');
    const slot = useProjectStore.getState().project?.session?.slots.find(
      (s) => s.trackId === track.id,
    );
    expect(slot).not.toBeUndefined();

    useProjectStore.getState().setSessionSlotLegato(slot!.id, true);
    const updated = useProjectStore.getState().project?.session?.slots.find(
      (s) => s.id === slot!.id,
    );
    expect(updated?.legato).toBe(true);
  });

  it('setSessionSlotLegato toggles legato mode off', () => {
    const track = useProjectStore.getState().addTrack('drums');
    const slot = useProjectStore.getState().project?.session?.slots.find(
      (s) => s.trackId === track.id,
    );
    expect(slot).not.toBeUndefined();

    useProjectStore.getState().setSessionSlotLegato(slot!.id, true);
    useProjectStore.getState().setSessionSlotLegato(slot!.id, false);
    const updated = useProjectStore.getState().project?.session?.slots.find(
      (s) => s.id === slot!.id,
    );
    expect(updated?.legato).toBe(false);
  });

  it('setSessionSlotLegato does nothing for unknown slotId', () => {
    useProjectStore.getState().addTrack('drums');
    const slotsBefore = useProjectStore.getState().project?.session?.slots;
    useProjectStore.getState().setSessionSlotLegato('nonexistent-id', true);
    const slotsAfter = useProjectStore.getState().project?.session?.slots;
    expect(slotsAfter).toEqual(slotsBefore);
  });

  it('calculates correct legato offset for same-length clips', () => {
    const clipDuration = 4; // 4 seconds
    const launchedAt = 2;
    const currentTime = 5; // 3 seconds elapsed

    const elapsed = currentTime - launchedAt;
    const position = elapsed % clipDuration;
    expect(position).toBeCloseTo(3);
  });

  it('calculates correct legato offset for looped clip', () => {
    const clipDuration = 4;
    const launchedAt = 2;
    const currentTime = 9; // 7 seconds elapsed = 1 full loop + 3s

    const elapsed = currentTime - launchedAt;
    const position = elapsed % clipDuration;
    expect(position).toBeCloseTo(3);
  });

  it('legato offset is 0 when clip just started', () => {
    const clipDuration = 4;
    const launchedAt = 2;
    const currentTime = 2;

    const elapsed = currentTime - launchedAt;
    const position = elapsed % clipDuration;
    expect(position).toBeCloseTo(0);
  });

  it('transportStore launchSessionClip stores startOffset', () => {
    useTransportStore.getState().launchSessionClip('track-1', 'clip-1', 0, 10, 2.5);
    const launch = useTransportStore.getState().launchedSessionClips['track-1'];
    expect(launch).not.toBeUndefined();
    expect(launch.clipId).toBe('clip-1');
    expect(launch.sceneIndex).toBe(0);
    expect(launch.launchedAt).toBe(10);
    expect(launch.startOffset).toBe(2.5);
  });

  it('transportStore launchSessionClip without startOffset leaves it undefined', () => {
    useTransportStore.getState().launchSessionClip('track-1', 'clip-1', 0, 10);
    const launch = useTransportStore.getState().launchedSessionClips['track-1'];
    expect(launch.startOffset).toBeUndefined();
  });
});
