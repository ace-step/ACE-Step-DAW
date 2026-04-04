/**
 * Integration test: Mixer → Store flow
 *
 * Tests that mixer operations (volume, pan, mute, solo, effects)
 * correctly update the real Zustand store and cascade properly.
 * Uses real stores, no vi.mock() on stores.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { resetAllStores, createTestProject } from './setup';

describe('Mixer → Store Integration', () => {
  let tracks: ReturnType<typeof createTestProject>;

  beforeEach(() => {
    resetAllStores();
    tracks = createTestProject();
  });

  // ── Volume ──

  it('updates track volume and persists in project state', () => {
    useProjectStore.getState().updateTrack(tracks.vocals.id, { volume: 0.75 });

    const project = useProjectStore.getState().project!;
    const vocal = project.tracks.find((t) => t.id === tracks.vocals.id);
    expect(vocal?.volume).toBe(0.75);
  });

  it('allows volume values above 1.0 (for boost)', () => {
    useProjectStore.getState().updateTrack(tracks.vocals.id, { volume: 1.5 });

    const project = useProjectStore.getState().project!;
    const vocal = project.tracks.find((t) => t.id === tracks.vocals.id);
    expect(vocal?.volume).toBe(1.5);
  });

  // ── Pan ──

  it('updates track pan and persists', () => {
    useProjectStore.getState().updateTrackMixer(tracks.drums.id, { pan: -0.5 });

    const project = useProjectStore.getState().project!;
    const drum = project.tracks.find((t) => t.id === tracks.drums.id);
    expect(drum?.pan).toBe(-0.5);
  });

  // ── Mute/Solo ──

  it('toggles mute on a track', () => {
    useProjectStore.getState().updateTrack(tracks.vocals.id, { muted: true });

    const project = useProjectStore.getState().project!;
    const vocal = project.tracks.find((t) => t.id === tracks.vocals.id);
    expect(vocal?.muted).toBe(true);
  });

  it('toggles solo on a track', () => {
    useProjectStore.getState().updateTrack(tracks.drums.id, { soloed: true });

    const project = useProjectStore.getState().project!;
    const drum = project.tracks.find((t) => t.id === tracks.drums.id);
    expect(drum?.soloed).toBe(true);
  });

  it('muting and soloing are independent per track', () => {
    useProjectStore.getState().updateTrack(tracks.vocals.id, { muted: true });
    useProjectStore.getState().updateTrack(tracks.drums.id, { soloed: true });

    const project = useProjectStore.getState().project!;
    const vocal = project.tracks.find((t) => t.id === tracks.vocals.id);
    const drum = project.tracks.find((t) => t.id === tracks.drums.id);
    expect(vocal?.muted).toBe(true);
    expect(vocal?.soloed).toBeFalsy();
    expect(drum?.soloed).toBe(true);
    expect(drum?.muted).toBeFalsy();
  });

  // ── Effects ──

  it('adds effect to track and persists', () => {
    const effectId = useProjectStore.getState().addTrackEffect(tracks.vocals.id, 'reverb');

    expect(effectId).toBeDefined();
    const project = useProjectStore.getState().project!;
    const vocal = project.tracks.find((t) => t.id === tracks.vocals.id);
    const reverb = vocal?.effects?.find((e) => e.type === 'reverb');
    expect(reverb).toBeDefined();
    expect(reverb?.enabled).toBe(true);
  });

  it('updates effect parameters', () => {
    const effectId = useProjectStore.getState().addTrackEffect(tracks.vocals.id, 'reverb');
    // updateTrackEffect takes Partial<TrackEffect> — update the params object
    const currentEffect = useProjectStore.getState().project!.tracks
      .find((t) => t.id === tracks.vocals.id)?.effects
      ?.find((e) => e.id === effectId);
    useProjectStore.getState().updateTrackEffect(tracks.vocals.id, effectId!, {
      params: { ...currentEffect?.params, decay: 3.5, wet: 0.6 },
    });

    const project = useProjectStore.getState().project!;
    const vocal = project.tracks.find((t) => t.id === tracks.vocals.id);
    const reverb = vocal?.effects?.find((e) => e.id === effectId);
    expect(reverb?.params.decay).toBe(3.5);
    expect(reverb?.params.wet).toBe(0.6);
  });

  it('removes effect from track', () => {
    const effectId = useProjectStore.getState().addTrackEffect(tracks.vocals.id, 'reverb');
    useProjectStore.getState().removeTrackEffect(tracks.vocals.id, effectId!);

    const project = useProjectStore.getState().project!;
    const vocal = project.tracks.find((t) => t.id === tracks.vocals.id);
    expect(vocal?.effects?.find((e) => e.id === effectId)).toBeUndefined();
  });

  it('toggles effects bypass on track', () => {
    useProjectStore.getState().addTrackEffect(tracks.vocals.id, 'reverb');
    useProjectStore.getState().toggleTrackEffectsBypass(tracks.vocals.id);

    const project = useProjectStore.getState().project!;
    const vocal = project.tracks.find((t) => t.id === tracks.vocals.id);
    expect(vocal?.effectsBypassed).toBe(true);

    useProjectStore.getState().toggleTrackEffectsBypass(tracks.vocals.id);
    const project2 = useProjectStore.getState().project!;
    const vocal2 = project2.tracks.find((t) => t.id === tracks.vocals.id);
    expect(vocal2?.effectsBypassed).toBe(false);
  });

  // ── Clip operations through store ──

  it('adds clip and updates track state', () => {
    const clip = useProjectStore.getState().addClip(tracks.vocals.id, {
      startTime: 0,
      duration: 10,
      prompt: 'Ethereal vocals',
    });

    expect(clip.id).toBeDefined();
    const project = useProjectStore.getState().project!;
    const vocal = project.tracks.find((t) => t.id === tracks.vocals.id);
    expect(vocal?.clips).toHaveLength(1);
    expect(vocal?.clips[0].prompt).toBe('Ethereal vocals');
  });

  it('removes clip from track', () => {
    const clip = useProjectStore.getState().addClip(tracks.vocals.id, {
      startTime: 0,
      duration: 10,
    });
    useProjectStore.getState().removeClip(clip.id);

    const project = useProjectStore.getState().project!;
    const vocal = project.tracks.find((t) => t.id === tracks.vocals.id);
    expect(vocal?.clips).toHaveLength(0);
  });

  // ── Undo/Redo ──

  it('supports undo/redo for mixer operations', () => {
    const originalVolume = useProjectStore.getState().project!.tracks.find(
      (t) => t.id === tracks.vocals.id
    )!.volume;

    useProjectStore.getState().updateTrack(tracks.vocals.id, { volume: 0.3 });

    const afterChange = useProjectStore.getState().project!.tracks.find(
      (t) => t.id === tracks.vocals.id
    )!.volume;
    expect(afterChange).toBe(0.3);

    useProjectStore.getState().undo();

    const afterUndo = useProjectStore.getState().project!.tracks.find(
      (t) => t.id === tracks.vocals.id
    )!.volume;
    expect(afterUndo).toBe(originalVolume);
  });
});
