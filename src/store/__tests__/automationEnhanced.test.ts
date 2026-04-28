import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';
import type { AutomationParameter } from '../../types/project';

vi.mock('../../services/projectStorage', () => ({ saveProject: vi.fn() }));

const VOLUME_PARAM: AutomationParameter = { type: 'mixer', param: 'volume' };

describe('automation curve types', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ name: 'Test', bpm: 120 });
    useProjectStore.getState().addTrack('custom', 'stems');
  });

  it('addAutomationPoint stores curveType when provided', () => {
    const store = useProjectStore.getState();
    const trackId = store.project!.tracks[0].id;
    store.addAutomationPoint(trackId, VOLUME_PARAM, {
      time: 1,
      value: 0.5,
      curveType: 'exponential',
    });
    const lanes = useProjectStore.getState().project!.automationLanes!;
    const lane = lanes.find((l) => l.trackId === trackId);
    expect(lane).not.toBeUndefined();
    expect(lane!.points[0].curveType).toBe('exponential');
  });

  it('curveType defaults to undefined (treated as linear)', () => {
    const store = useProjectStore.getState();
    const trackId = store.project!.tracks[0].id;
    store.addAutomationPoint(trackId, VOLUME_PARAM, { time: 0, value: 0.5 });
    const lane = useProjectStore.getState().project!.automationLanes!.find(
      (l) => l.trackId === trackId,
    )!;
    expect(lane.points[0].curveType).toBeUndefined();
  });

  it('setAutomationPointCurve updates curveType on an existing point', () => {
    const store = useProjectStore.getState();
    const trackId = store.project!.tracks[0].id;
    store.addAutomationPoint(trackId, VOLUME_PARAM, { time: 0, value: 0.5 });
    store.addAutomationPoint(trackId, VOLUME_PARAM, { time: 2, value: 0.8 });

    store.setAutomationPointCurve(trackId, VOLUME_PARAM, 1, 's-curve');

    const lane = useProjectStore.getState().project!.automationLanes!.find(
      (l) => l.trackId === trackId,
    )!;
    expect(lane.points[1].curveType).toBe('s-curve');
    // first point should remain unchanged
    expect(lane.points[0].curveType).toBeUndefined();
  });

  it('setAutomationPointCurve supports step curve', () => {
    const store = useProjectStore.getState();
    const trackId = store.project!.tracks[0].id;
    store.addAutomationPoint(trackId, VOLUME_PARAM, { time: 0, value: 0.5 });
    store.setAutomationPointCurve(trackId, VOLUME_PARAM, 0, 'step');
    const lane = useProjectStore.getState().project!.automationLanes!.find(
      (l) => l.trackId === trackId,
    )!;
    expect(lane.points[0].curveType).toBe('step');
  });
});

describe('automation recording modes', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ name: 'Test', bpm: 120 });
    useProjectStore.getState().addTrack('custom', 'stems');
  });

  it('setAutomationRecordingMode stores mode on the lane', () => {
    const store = useProjectStore.getState();
    const trackId = store.project!.tracks[0].id;
    store.ensureAutomationLane(trackId, VOLUME_PARAM);
    store.setAutomationRecordingMode(trackId, VOLUME_PARAM, 'latch');

    const lane = useProjectStore.getState().project!.automationLanes!.find(
      (l) => l.trackId === trackId,
    )!;
    expect(lane.recordingMode).toBe('latch');
  });

  it('recording mode defaults to undefined (treated as touch)', () => {
    const store = useProjectStore.getState();
    const trackId = store.project!.tracks[0].id;
    store.ensureAutomationLane(trackId, VOLUME_PARAM);
    const lane = useProjectStore.getState().project!.automationLanes!.find(
      (l) => l.trackId === trackId,
    )!;
    expect(lane.recordingMode).toBeUndefined();
  });

  it('can set mode to write', () => {
    const store = useProjectStore.getState();
    const trackId = store.project!.tracks[0].id;
    store.ensureAutomationLane(trackId, VOLUME_PARAM);
    store.setAutomationRecordingMode(trackId, VOLUME_PARAM, 'write');
    const lane = useProjectStore.getState().project!.automationLanes!.find(
      (l) => l.trackId === trackId,
    )!;
    expect(lane.recordingMode).toBe('write');
  });

  it('can set mode to touch', () => {
    const store = useProjectStore.getState();
    const trackId = store.project!.tracks[0].id;
    store.ensureAutomationLane(trackId, VOLUME_PARAM);
    store.setAutomationRecordingMode(trackId, VOLUME_PARAM, 'touch');
    const lane = useProjectStore.getState().project!.automationLanes!.find(
      (l) => l.trackId === trackId,
    )!;
    expect(lane.recordingMode).toBe('touch');
  });
});

describe('LFO automation generation', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ name: 'Test', bpm: 120 });
    useProjectStore.getState().addTrack('custom', 'stems');
  });

  it('generateLFOAutomation creates sine wave points', () => {
    const store = useProjectStore.getState();
    const trackId = store.project!.tracks[0].id;
    // 1 cycle over 4 seconds, full depth, centered at 0.5
    store.generateLFOAutomation(trackId, VOLUME_PARAM, {
      shape: 'sine',
      rate: 1,
      depth: 1,
      phase: 0,
      startBeat: 0,
      endBeat: 8, // at 120bpm, 8 beats = 4 seconds
    });

    const lane = useProjectStore.getState().project!.automationLanes!.find(
      (l) => l.trackId === trackId,
    )!;
    expect(lane).not.toBeUndefined();
    expect(lane.points.length).toBeGreaterThan(4);
    // Sine starts at 0.5 (center), goes up to 1.0, back to 0.5, down to 0.0
    // First point should be at center
    expect(lane.points[0].value).toBeCloseTo(0.5, 1);
    // All values should be between 0 and 1
    for (const pt of lane.points) {
      expect(pt.value).toBeGreaterThanOrEqual(0);
      expect(pt.value).toBeLessThanOrEqual(1);
    }
  });

  it('generateLFOAutomation creates square wave points', () => {
    const store = useProjectStore.getState();
    const trackId = store.project!.tracks[0].id;
    store.generateLFOAutomation(trackId, VOLUME_PARAM, {
      shape: 'square',
      rate: 1,
      depth: 1,
      phase: 0,
      startBeat: 0,
      endBeat: 8,
    });

    const lane = useProjectStore.getState().project!.automationLanes!.find(
      (l) => l.trackId === trackId,
    )!;
    expect(lane).not.toBeUndefined();
    // Square wave should only have values at 0 and 1
    for (const pt of lane.points) {
      expect(pt.value === 0 || pt.value === 1).toBe(true);
    }
  });

  it('generateLFOAutomation creates triangle wave points', () => {
    const store = useProjectStore.getState();
    const trackId = store.project!.tracks[0].id;
    store.generateLFOAutomation(trackId, VOLUME_PARAM, {
      shape: 'triangle',
      rate: 1,
      depth: 1,
      phase: 0,
      startBeat: 0,
      endBeat: 8,
    });

    const lane = useProjectStore.getState().project!.automationLanes!.find(
      (l) => l.trackId === trackId,
    )!;
    expect(lane).not.toBeUndefined();
    expect(lane.points.length).toBeGreaterThan(4);
    for (const pt of lane.points) {
      expect(pt.value).toBeGreaterThanOrEqual(0);
      expect(pt.value).toBeLessThanOrEqual(1);
    }
  });

  it('generateLFOAutomation creates saw wave points', () => {
    const store = useProjectStore.getState();
    const trackId = store.project!.tracks[0].id;
    store.generateLFOAutomation(trackId, VOLUME_PARAM, {
      shape: 'saw',
      rate: 1,
      depth: 1,
      phase: 0,
      startBeat: 0,
      endBeat: 8,
    });

    const lane = useProjectStore.getState().project!.automationLanes!.find(
      (l) => l.trackId === trackId,
    )!;
    expect(lane).not.toBeUndefined();
    expect(lane.points.length).toBeGreaterThan(4);
    for (const pt of lane.points) {
      expect(pt.value).toBeGreaterThanOrEqual(0);
      expect(pt.value).toBeLessThanOrEqual(1);
    }
  });

  it('generateLFOAutomation respects depth parameter', () => {
    const store = useProjectStore.getState();
    const trackId = store.project!.tracks[0].id;
    store.generateLFOAutomation(trackId, VOLUME_PARAM, {
      shape: 'sine',
      rate: 1,
      depth: 0.5, // half depth
      phase: 0,
      startBeat: 0,
      endBeat: 8,
    });

    const lane = useProjectStore.getState().project!.automationLanes!.find(
      (l) => l.trackId === trackId,
    )!;
    // With depth=0.5, values should be between 0.25 and 0.75
    for (const pt of lane.points) {
      expect(pt.value).toBeGreaterThanOrEqual(0.24);
      expect(pt.value).toBeLessThanOrEqual(0.76);
    }
  });

  it('generateLFOAutomation respects phase offset', () => {
    const store = useProjectStore.getState();
    const trackId = store.project!.tracks[0].id;
    // Phase = 90 degrees means sine starts at peak
    store.generateLFOAutomation(trackId, VOLUME_PARAM, {
      shape: 'sine',
      rate: 1,
      depth: 1,
      phase: 90,
      startBeat: 0,
      endBeat: 8,
    });

    const lane = useProjectStore.getState().project!.automationLanes!.find(
      (l) => l.trackId === trackId,
    )!;
    // With 90 degree phase, first point should be at peak (1.0)
    expect(lane.points[0].value).toBeCloseTo(1.0, 1);
  });

  it('generateLFOAutomation replaces existing lane points', () => {
    const store = useProjectStore.getState();
    const trackId = store.project!.tracks[0].id;
    // Add a manual point first
    store.addAutomationPoint(trackId, VOLUME_PARAM, { time: 0, value: 0.3 });

    // Generate LFO should replace
    store.generateLFOAutomation(trackId, VOLUME_PARAM, {
      shape: 'sine',
      rate: 1,
      depth: 1,
      phase: 0,
      startBeat: 0,
      endBeat: 8,
    });

    const lane = useProjectStore.getState().project!.automationLanes!.find(
      (l) => l.trackId === trackId,
    )!;
    // Should not contain the old 0.3 point
    expect(lane.points.some((p) => p.value === 0.3 && p.time === 0)).toBe(false);
  });
});
