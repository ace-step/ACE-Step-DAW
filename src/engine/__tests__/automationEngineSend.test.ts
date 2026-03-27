import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AutomationEngine } from '../AutomationEngine';
import type { AutomationLane, AutomationParameter } from '../../types/project';

// Mock the audio engine module
vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => mockAudioEngine,
}));

vi.mock('../EffectsEngine', () => ({
  effectsEngine: { applyAutomationValue: vi.fn() },
}));

vi.mock('../../store/projectStore', () => ({
  useProjectStore: { getState: () => ({ project: null }) },
}));

const mockTrackNode = {
  updateSendAmount: vi.fn(),
};

const mockAudioEngine = {
  trackNodes: new Map<string, typeof mockTrackNode>(),
  setTrackVolume: vi.fn(),
  setTrackPan: vi.fn(),
};

describe('AutomationEngine send parameter', () => {
  let engine: AutomationEngine;

  beforeEach(() => {
    engine = new AutomationEngine();
    mockTrackNode.updateSendAmount.mockClear();
    mockAudioEngine.trackNodes.clear();
    mockAudioEngine.trackNodes.set('track-1', mockTrackNode);
  });

  it('getValueAtTime interpolates correctly for send lanes', () => {
    const param: AutomationParameter = { type: 'send', sendIndex: 0, param: 'amount' };
    const lane: AutomationLane = {
      id: 'lane-1',
      trackId: 'track-1',
      parameter: param,
      points: [
        { time: 0, value: 0.2 },
        { time: 2, value: 0.8 },
      ],
    };

    const val = AutomationEngine.getValueAtTime(lane, 1);
    expect(val).toBeCloseTo(0.5, 1);
  });

  it('getValueAtTime returns boundary values for send lanes', () => {
    const param: AutomationParameter = { type: 'send', sendIndex: 0, param: 'amount' };
    const lane: AutomationLane = {
      id: 'lane-1',
      trackId: 'track-1',
      parameter: param,
      points: [
        { time: 0, value: 0 },
        { time: 4, value: 1 },
      ],
    };

    expect(AutomationEngine.getValueAtTime(lane, 0)).toBe(0);
    expect(AutomationEngine.getValueAtTime(lane, 4)).toBe(1);
    expect(AutomationEngine.getValueAtTime(lane, 2)).toBeCloseTo(0.5, 1);
  });

  it('hasAutomation returns true for send lanes with points', () => {
    const param: AutomationParameter = { type: 'send', sendIndex: 0, param: 'amount' };
    const lane: AutomationLane = {
      id: 'lane-1',
      trackId: 'track-1',
      parameter: param,
      points: [{ time: 0, value: 0.5 }],
    };

    engine.start([lane], () => 0);
    expect(engine.hasAutomation('track-1', param)).toBe(true);
    engine.stop();
  });

  it('hasAutomation returns false for different sendIndex', () => {
    const param0: AutomationParameter = { type: 'send', sendIndex: 0, param: 'amount' };
    const param1: AutomationParameter = { type: 'send', sendIndex: 1, param: 'amount' };
    const lane: AutomationLane = {
      id: 'lane-1',
      trackId: 'track-1',
      parameter: param0,
      points: [{ time: 0, value: 0.5 }],
    };

    engine.start([lane], () => 0);
    expect(engine.hasAutomation('track-1', param1)).toBe(false);
    engine.stop();
  });
});
