import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setTrackVolume: vi.fn(),
  setTrackPan: vi.fn(),
  applyAutomationValue: vi.fn(),
}));

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    setTrackVolume: mocks.setTrackVolume,
    setTrackPan: mocks.setTrackPan,
  }),
}));

vi.mock('../../src/engine/EffectsEngine', () => ({
  effectsEngine: {
    applyAutomationValue: mocks.applyAutomationValue,
  },
}));

import { AutomationEngine } from '../../src/engine/AutomationEngine';
import type { AutomationLane } from '../../src/types/project';

describe('AutomationEngine', () => {
  beforeEach(() => {
    mocks.setTrackVolume.mockReset();
    mocks.setTrackPan.mockReset();
    mocks.applyAutomationValue.mockReset();
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('routes effect automation lanes into the effects engine during playback', () => {
    const engine = new AutomationEngine();
    const lanes: AutomationLane[] = [
      {
        id: 'lane-1',
        trackId: 'track-1',
        parameter: {
          type: 'effect',
          effectId: 'fx-1',
          effectType: 'filter',
          param: 'frequency',
        },
        points: [
          { time: 0, value: 0.2 },
          { time: 2, value: 0.8 },
        ],
      },
    ];

    engine.start(lanes, () => 1);

    expect(mocks.applyAutomationValue).toHaveBeenCalledWith(
      'track-1',
      'fx-1',
      {
        type: 'effect',
        effectId: 'fx-1',
        effectType: 'filter',
        param: 'frequency',
      },
      0.5,
    );
  });
});
