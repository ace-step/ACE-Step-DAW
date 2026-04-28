import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

function addClipToTrack(trackId: string, startTime: number, duration: number, prompt = 'test') {
  const clip = useProjectStore.getState().addClip(trackId, {
    startTime,
    duration,
    prompt,
    lyrics: '',
  });
  useProjectStore.getState().updateClip(clip.id, {
    generationStatus: 'ready',
    isolatedAudioKey: `audio-${clip.id}`,
    audioDuration: duration,
    audioOffset: 0,
  });
  return clip;
}

describe('splitAllAtPlayhead', () => {
  let trackId1: string;
  let trackId2: string;

  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const t1 = useProjectStore.getState().addTrack('stems');
    const t2 = useProjectStore.getState().addTrack('vocals');
    trackId1 = t1.id;
    trackId2 = t2.id;
  });

  it('splits clips on all tracks at the given time', () => {
    addClipToTrack(trackId1, 0, 4);
    addClipToTrack(trackId2, 0, 4);

    useProjectStore.getState().splitAllAtPlayhead(2);

    const tracks = useProjectStore.getState().project!.tracks;
    expect(tracks[0].clips).toHaveLength(2);
    expect(tracks[1].clips).toHaveLength(2);
  });

  it('does not split clips that do not overlap the split point', () => {
    addClipToTrack(trackId1, 0, 2); // ends at 2
    addClipToTrack(trackId1, 4, 2); // starts at 4
    addClipToTrack(trackId2, 0, 4);

    useProjectStore.getState().splitAllAtPlayhead(3);

    const tracks = useProjectStore.getState().project!.tracks;
    // track1: two clips, neither overlaps 3 → still 2
    expect(tracks[0].clips).toHaveLength(2);
    // track2: one clip 0-4 overlaps 3 → split into 2
    expect(tracks[1].clips).toHaveLength(2);
  });

  it('left portion retains original start, right starts at split point', () => {
    const clip = addClipToTrack(trackId1, 1, 4);

    useProjectStore.getState().splitAllAtPlayhead(3);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    const left = clips.find((c) => c.id === clip.id)!;
    const right = clips.find((c) => c.id !== clip.id)!;

    expect(left.startTime).toBe(1);
    expect(left.duration).toBe(2);
    expect(right.startTime).toBe(3);
    expect(right.duration).toBe(2);
  });

  it('pushes undo history', () => {
    addClipToTrack(trackId1, 0, 4);
    useProjectStore.getState().splitAllAtPlayhead(2);
    useProjectStore.getState().undo();

    expect(useProjectStore.getState().project!.tracks[0].clips).toHaveLength(1);
  });

  it('no-ops when no clips overlap the split point', () => {
    addClipToTrack(trackId1, 0, 2);
    useProjectStore.getState().splitAllAtPlayhead(5);
    // Should not push history for no-op
    expect(useProjectStore.getState().project!.tracks[0].clips).toHaveLength(1);
  });

  it('correctly sets audioOffset on the right portion', () => {
    const clip = addClipToTrack(trackId1, 0, 4);
    useProjectStore.getState().updateClip(clip.id, { audioOffset: 1 });

    useProjectStore.getState().splitAllAtPlayhead(2);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    const right = clips.find((c) => c.id !== clip.id)!;
    expect(right.audioOffset).toBe(3); // original offset 1 + left duration 2
  });
});

describe('insertTime', () => {
  let trackId1: string;
  let trackId2: string;

  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const t1 = useProjectStore.getState().addTrack('stems');
    const t2 = useProjectStore.getState().addTrack('vocals');
    trackId1 = t1.id;
    trackId2 = t2.id;
  });

  it('shifts clips after insert point forward', () => {
    addClipToTrack(trackId1, 4, 2); // starts at 4

    useProjectStore.getState().insertTime(2, 3); // insert 3s at t=2

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips[0].startTime).toBe(7); // 4 + 3
    expect(clips[0].duration).toBe(2); // unchanged
  });

  it('does not shift clips before insert point', () => {
    addClipToTrack(trackId1, 0, 2); // 0-2

    useProjectStore.getState().insertTime(5, 3);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips[0].startTime).toBe(0); // unchanged
  });

  it('splits clips that span the insert point', () => {
    addClipToTrack(trackId1, 0, 4); // 0-4

    useProjectStore.getState().insertTime(2, 3); // insert 3s at t=2

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(2);

    const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
    // Left portion: 0-2 (unchanged)
    expect(sorted[0].startTime).toBe(0);
    expect(sorted[0].duration).toBe(2);
    // Right portion: shifted by 3s → starts at 2+3=5
    expect(sorted[1].startTime).toBe(5);
    expect(sorted[1].duration).toBe(2);
  });

  it('shifts markers after insert point', () => {
    const store = useProjectStore.getState();
    store.addMarker(4, 'Chorus');

    useProjectStore.getState().insertTime(2, 3);

    const markers = useProjectStore.getState().project!.markers!;
    expect(markers[0].time).toBe(7); // 4 + 3
  });

  it('does not shift markers before insert point', () => {
    const store = useProjectStore.getState();
    store.addMarker(1, 'Intro');

    useProjectStore.getState().insertTime(2, 3);

    const markers = useProjectStore.getState().project!.markers!;
    expect(markers[0].time).toBe(1); // unchanged
  });

  it('shifts automation points after insert point', () => {
    const store = useProjectStore.getState();
    const param = { type: 'mixer' as const, param: 'volume' as const };
    store.ensureAutomationLane(trackId1, param);
    store.addAutomationPoint(trackId1, param, { time: 4, value: 0.8 });

    useProjectStore.getState().insertTime(2, 3);

    const lanes = useProjectStore.getState().project!.automationLanes ?? [];
    const lane = lanes.find((l) => l.trackId === trackId1)!;
    const point = lane.points.find((p) => p.value === 0.8)!;
    expect(point.time).toBe(7); // 4 + 3
    expect(lane.points[0].time).toBe(0); // initial unchanged
  });

  it('works on all tracks simultaneously', () => {
    addClipToTrack(trackId1, 4, 2);
    addClipToTrack(trackId2, 6, 2);

    useProjectStore.getState().insertTime(3, 5);

    const tracks = useProjectStore.getState().project!.tracks;
    expect(tracks[0].clips[0].startTime).toBe(9); // 4 + 5
    expect(tracks[1].clips[0].startTime).toBe(11); // 6 + 5
  });

  it('pushes undo history', () => {
    addClipToTrack(trackId1, 4, 2);

    useProjectStore.getState().insertTime(2, 3);
    useProjectStore.getState().undo();

    expect(useProjectStore.getState().project!.tracks[0].clips[0].startTime).toBe(4);
  });

  it('no-ops with zero duration', () => {
    addClipToTrack(trackId1, 4, 2);

    useProjectStore.getState().insertTime(2, 0);

    expect(useProjectStore.getState().project!.tracks[0].clips[0].startTime).toBe(4);
  });
});

describe('deleteTimeRange', () => {
  let trackId1: string;
  let trackId2: string;

  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const t1 = useProjectStore.getState().addTrack('stems');
    const t2 = useProjectStore.getState().addTrack('vocals');
    trackId1 = t1.id;
    trackId2 = t2.id;
  });

  it('removes clips fully inside the deleted range', () => {
    addClipToTrack(trackId1, 2, 2); // 2-4, fully inside 1-5

    useProjectStore.getState().deleteTimeRange(1, 5);

    expect(useProjectStore.getState().project!.tracks[0].clips).toHaveLength(0);
  });

  it('trims clips partially overlapping at the start of the range', () => {
    addClipToTrack(trackId1, 0, 4); // 0-4

    useProjectStore.getState().deleteTimeRange(2, 6);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(1);
    expect(clips[0].startTime).toBe(0);
    expect(clips[0].duration).toBe(2); // trimmed to 0-2
  });

  it('trims and shifts clips partially overlapping at the end of the range', () => {
    addClipToTrack(trackId1, 4, 4); // 4-8

    useProjectStore.getState().deleteTimeRange(2, 6);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(1);
    // Trimmed: was 4-8, range deletes 4-6, remaining is 6-8
    // Shifted back by range duration (4): 6-4=2, 8-4=4
    expect(clips[0].startTime).toBe(2);
    expect(clips[0].duration).toBe(2);
  });

  it('splits clips that completely span the deleted range', () => {
    addClipToTrack(trackId1, 0, 10); // 0-10

    useProjectStore.getState().deleteTimeRange(3, 7);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(2);

    const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
    // Left portion: 0-3 (unchanged)
    expect(sorted[0].startTime).toBe(0);
    expect(sorted[0].duration).toBe(3);
    // Right portion: was 7-10, shifted back by 4 → 3-6
    expect(sorted[1].startTime).toBe(3);
    expect(sorted[1].duration).toBe(3);
  });

  it('shifts clips after the range backward', () => {
    addClipToTrack(trackId1, 8, 2); // 8-10, after range 2-6

    useProjectStore.getState().deleteTimeRange(2, 6);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips[0].startTime).toBe(4); // 8 - 4
    expect(clips[0].duration).toBe(2); // unchanged
  });

  it('does not affect clips before the range', () => {
    addClipToTrack(trackId1, 0, 1); // 0-1, before range 2-6

    useProjectStore.getState().deleteTimeRange(2, 6);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips[0].startTime).toBe(0);
    expect(clips[0].duration).toBe(1);
  });

  it('removes markers inside the range and shifts markers after', () => {
    const store = useProjectStore.getState();
    store.addMarker(1, 'Before');
    store.addMarker(3, 'Inside');
    store.addMarker(8, 'After');

    useProjectStore.getState().deleteTimeRange(2, 6);

    const markers = useProjectStore.getState().project!.markers!;
    expect(markers).toHaveLength(2);
    expect(markers.find((m) => m.name === 'Before')!.time).toBe(1);
    expect(markers.find((m) => m.name === 'After')!.time).toBe(4); // 8 - 4
  });

  it('shifts automation points after range and removes points inside', () => {
    const store = useProjectStore.getState();
    const param = { type: 'mixer' as const, param: 'volume' as const };
    store.ensureAutomationLane(trackId1, param);
    store.addAutomationPoint(trackId1, param, { time: 1, value: 0.6 });
    store.addAutomationPoint(trackId1, param, { time: 3, value: 0.8 });
    store.addAutomationPoint(trackId1, param, { time: 8, value: 0.3 });

    useProjectStore.getState().deleteTimeRange(2, 6);

    const lanes = useProjectStore.getState().project!.automationLanes ?? [];
    const lane = lanes.find((l) => l.trackId === trackId1)!;
    expect(lane.points.find((p) => p.value === 0.6)!.time).toBe(1);
    expect(lane.points.find((p) => p.value === 0.8)).toBeUndefined();
    expect(lane.points.find((p) => p.value === 0.3)!.time).toBe(4);
  });

  it('pushes undo history', () => {
    addClipToTrack(trackId1, 4, 2);

    useProjectStore.getState().deleteTimeRange(2, 6);
    useProjectStore.getState().undo();

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(1);
    expect(clips[0].startTime).toBe(4);
  });

  it('no-ops when start >= end', () => {
    addClipToTrack(trackId1, 0, 4);

    useProjectStore.getState().deleteTimeRange(5, 3);

    expect(useProjectStore.getState().project!.tracks[0].clips[0].duration).toBe(4);
  });
});

describe('duplicateTimeRange', () => {
  let trackId1: string;
  let trackId2: string;

  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const t1 = useProjectStore.getState().addTrack('stems');
    const t2 = useProjectStore.getState().addTrack('vocals');
    trackId1 = t1.id;
    trackId2 = t2.id;
  });

  it('duplicates clips within the range to after the range', () => {
    addClipToTrack(trackId1, 2, 4); // 2-6

    useProjectStore.getState().duplicateTimeRange(2, 6);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(2);

    const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
    expect(sorted[0].startTime).toBe(2);
    expect(sorted[0].duration).toBe(4);
    // Duplicate starts at 2 + (6-2) = 6
    expect(sorted[1].startTime).toBe(6);
    expect(sorted[1].duration).toBe(4);
  });

  it('shifts clips after the range forward by the range duration', () => {
    addClipToTrack(trackId1, 2, 2); // 2-4 (inside range 0-4)
    addClipToTrack(trackId1, 6, 2); // 6-8 (after range)

    useProjectStore.getState().duplicateTimeRange(0, 4);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
    // Original clip at 2-4
    expect(sorted[0].startTime).toBe(2);
    // Duplicate of 2-4 placed at 2+4=6
    expect(sorted[1].startTime).toBe(6);
    // Original at 6-8 shifted forward by 4 → 10-12
    expect(sorted[2].startTime).toBe(10);
  });

  it('handles clips spanning the entire range', () => {
    addClipToTrack(trackId1, 0, 8); // 0-8, range is 2-6

    useProjectStore.getState().duplicateTimeRange(2, 6);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
    expect(sorted).toHaveLength(3);
    // Left portion: 0-6 (up to endTime)
    expect(sorted[0].startTime).toBe(0);
    expect(sorted[0].duration).toBe(6);
    // Duplicate of inside portion: 6-10
    expect(sorted[1].startTime).toBe(6);
    expect(sorted[1].duration).toBe(4);
    // Right portion (tail shifted): 10-12
    expect(sorted[2].startTime).toBe(10);
    expect(sorted[2].duration).toBe(2);
  });

  it('duplicates the in-range portion and shifts only the tail when a clip extends past endTime', () => {
    addClipToTrack(trackId1, 4, 4); // 4-8, overlaps range 2-6 with tail 6-8

    useProjectStore.getState().duplicateTimeRange(2, 6);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(3);

    const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
    // Original in-range head: 4-6
    expect(sorted[0].startTime).toBe(4);
    expect(sorted[0].duration).toBe(2);
    // Duplicated in-range head: 4 + 4 = 8
    expect(sorted[1].startTime).toBe(8);
    expect(sorted[1].duration).toBe(2);
    // Tail beyond endTime shifted: 6 + 4 = 10
    expect(sorted[2].startTime).toBe(10);
    expect(sorted[2].duration).toBe(2);
  });

  it('duplicates across multiple tracks', () => {
    addClipToTrack(trackId1, 0, 4); // track 1: 0-4
    addClipToTrack(trackId2, 0, 4); // track 2: 0-4

    useProjectStore.getState().duplicateTimeRange(0, 4);

    const tracks = useProjectStore.getState().project!.tracks;
    expect(tracks[0].clips).toHaveLength(2);
    expect(tracks[1].clips).toHaveLength(2);
  });

  it('duplicates markers within the range', () => {
    const store = useProjectStore.getState();
    store.addMarker(2, 'Verse');
    store.addMarker(6, 'After');

    useProjectStore.getState().duplicateTimeRange(0, 4);

    const markers = useProjectStore.getState().project!.markers!;
    // Original marker at 2, duplicate at 2+4=6, 'After' at 6+4=10
    const verseMarkers = markers.filter((m) => m.name === 'Verse');
    expect(verseMarkers).toHaveLength(2);
    expect(verseMarkers.map((m) => m.time).sort((a, b) => a - b)).toEqual([2, 6]);
    expect(markers.find((m) => m.name === 'After')!.time).toBe(10);
  });

  it('pushes undo history', () => {
    addClipToTrack(trackId1, 0, 4);

    useProjectStore.getState().duplicateTimeRange(0, 4);
    useProjectStore.getState().undo();

    expect(useProjectStore.getState().project!.tracks[0].clips).toHaveLength(1);
  });
});

describe('edge cases', () => {
  let trackId1: string;

  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const t1 = useProjectStore.getState().addTrack('stems');
    trackId1 = t1.id;
  });

  it('splitAllAtPlayhead handles clips starting at time 0', () => {
    addClipToTrack(trackId1, 0, 4);
    useProjectStore.getState().splitAllAtPlayhead(0.5);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(2);
    const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
    expect(sorted[0].startTime).toBe(0);
    expect(sorted[0].duration).toBeCloseTo(0.5);
    expect(sorted[1].startTime).toBeCloseTo(0.5);
    expect(sorted[1].duration).toBeCloseTo(3.5);
  });

  it('insertTime at time 0 shifts everything forward', () => {
    addClipToTrack(trackId1, 0, 4);
    useProjectStore.getState().insertTime(0, 2);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips[0].startTime).toBe(2);
  });

  it('deleteTimeRange with adjacent clips keeps them intact', () => {
    addClipToTrack(trackId1, 0, 2); // 0-2
    addClipToTrack(trackId1, 2, 2); // 2-4
    addClipToTrack(trackId1, 4, 2); // 4-6

    useProjectStore.getState().deleteTimeRange(2, 4);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(2);
    const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
    expect(sorted[0].startTime).toBe(0);
    expect(sorted[0].duration).toBe(2);
    expect(sorted[1].startTime).toBe(2); // 4-2=2
    expect(sorted[1].duration).toBe(2);
  });

  it('insertTime with no project is a no-op', () => {
    useProjectStore.setState({ project: null });
    expect(() => useProjectStore.getState().insertTime(0, 5)).not.toThrow();
  });

  it('deleteTimeRange handles negative or zero range gracefully', () => {
    addClipToTrack(trackId1, 0, 4);
    useProjectStore.getState().deleteTimeRange(3, 3); // zero range
    expect(useProjectStore.getState().project!.tracks[0].clips[0].duration).toBe(4);
  });

  it('duplicateTimeRange preserves clip audio properties', () => {
    const clip = addClipToTrack(trackId1, 0, 4);

    useProjectStore.getState().duplicateTimeRange(0, 4);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
    const dup = sorted[1];
    expect(dup.isolatedAudioKey).toBe(`audio-${clip.id}`);
    expect(dup.generationStatus).toBe('ready');
  });

  it('multiple operations compose correctly', () => {
    addClipToTrack(trackId1, 0, 4);
    addClipToTrack(trackId1, 4, 4);

    // Insert 2s at t=4, then delete the range 2-6
    useProjectStore.getState().insertTime(4, 2);
    // After insert: clip1 at 0-4, clip2 at 6-10
    const afterInsert = useProjectStore.getState().project!.tracks[0].clips;
    const sortedInsert = [...afterInsert].sort((a, b) => a.startTime - b.startTime);
    expect(sortedInsert[0].startTime).toBe(0);
    expect(sortedInsert[1].startTime).toBe(6);

    useProjectStore.getState().deleteTimeRange(2, 6);
    // After delete: clip1 trimmed to 0-2, clip2 shifted to 2-6
    const afterDelete = useProjectStore.getState().project!.tracks[0].clips;
    const sortedDelete = [...afterDelete].sort((a, b) => a.startTime - b.startTime);
    expect(sortedDelete[0].startTime).toBe(0);
    expect(sortedDelete[0].duration).toBe(2);
    expect(sortedDelete[1].startTime).toBe(2);
    expect(sortedDelete[1].duration).toBe(4);
  });
});
