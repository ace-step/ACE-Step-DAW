import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';
import type { AutomationParameter } from '../../types/project';
import { automationParamEquals } from '../../types/project';

vi.mock('../../services/projectStorage', () => ({ saveProject: vi.fn() }));

describe('send amount automation', () => {
  let trackId: string;

  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ name: 'Test', bpm: 120 });
    useProjectStore.getState().addTrack('custom', 'stems');
    trackId = useProjectStore.getState().project!.tracks[0].id;

    // Add a return track and a send to it
    const rt = useProjectStore.getState().addReturnTrack('FX Bus');
    useProjectStore.getState().updateTrackSend(trackId, rt.id, 0.5);
  });

  it('AutomationParameter type "send" is recognized', () => {
    const param: AutomationParameter = { type: 'send', sendIndex: 0, param: 'amount' };
    expect(param.type).toBe('send');
    expect(param.sendIndex).toBe(0);
    expect(param.param).toBe('amount');
  });

  it('automationParamEquals correctly compares send params', () => {
    const a: AutomationParameter = { type: 'send', sendIndex: 0, param: 'amount' };
    const b: AutomationParameter = { type: 'send', sendIndex: 0, param: 'amount' };
    const c: AutomationParameter = { type: 'send', sendIndex: 1, param: 'amount' };
    const d: AutomationParameter = { type: 'mixer', param: 'volume' };

    expect(automationParamEquals(a, b)).toBe(true);
    expect(automationParamEquals(a, c)).toBe(false);
    expect(automationParamEquals(a, d)).toBe(false);
  });

  it('ensureAutomationLane creates a lane for send amount', () => {
    const store = useProjectStore.getState();
    const param: AutomationParameter = { type: 'send', sendIndex: 0, param: 'amount' };
    store.ensureAutomationLane(trackId, param, 0.5);

    const lanes = useProjectStore.getState().project!.automationLanes!;
    const lane = lanes.find(
      (l) => l.trackId === trackId && automationParamEquals(l.parameter, param),
    );
    expect(lane).not.toBeUndefined();
    expect(lane!.points.length).toBeGreaterThanOrEqual(0);
  });

  it('addAutomationPoint works for send parameter', () => {
    const store = useProjectStore.getState();
    const param: AutomationParameter = { type: 'send', sendIndex: 0, param: 'amount' };
    store.addAutomationPoint(trackId, param, { time: 0, value: 0.3 });
    store.addAutomationPoint(trackId, param, { time: 2, value: 0.8 });

    const lanes = useProjectStore.getState().project!.automationLanes!;
    const lane = lanes.find(
      (l) => l.trackId === trackId && automationParamEquals(l.parameter, param),
    );
    expect(lane).not.toBeUndefined();
    expect(lane!.points).toHaveLength(2);
    expect(lane!.points[0].value).toBe(0.3);
    expect(lane!.points[1].value).toBe(0.8);
  });

  it('clearAutomationLane removes the send automation lane', () => {
    const store = useProjectStore.getState();
    const param: AutomationParameter = { type: 'send', sendIndex: 0, param: 'amount' };
    store.addAutomationPoint(trackId, param, { time: 0, value: 0.5 });

    const lanesBefore = useProjectStore.getState().project!.automationLanes!;
    expect(lanesBefore.some((l) => automationParamEquals(l.parameter, param))).toBe(true);

    store.clearAutomationLane(trackId, param);

    const lanesAfter = useProjectStore.getState().project!.automationLanes!;
    expect(lanesAfter.some((l) => automationParamEquals(l.parameter, param))).toBe(false);
  });
});
