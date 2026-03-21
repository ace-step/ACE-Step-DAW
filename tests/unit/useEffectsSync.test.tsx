import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffectsSync } from '../../src/hooks/useEffectsSync';
import { useProjectStore } from '../../src/store/projectStore';

const {
  rebuildChain,
  getInputNode,
  getOutputNode,
  spliceMasterEffects,
  getOrCreateTrackNode,
} = vi.hoisted(() => ({
  rebuildChain: vi.fn(),
  getInputNode: vi.fn(),
  getOutputNode: vi.fn(),
  spliceMasterEffects: vi.fn(),
  getOrCreateTrackNode: vi.fn(() => ({
    spliceEffects: vi.fn(),
    volumeGain: {},
  })),
}));

vi.mock('../../src/engine/EffectsEngine', () => ({
  effectsEngine: {
    rebuildChain,
    getInputNode,
    getOutputNode,
  },
}));

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    getOrCreateTrackNode,
    spliceMasterEffects,
  }),
}));

function TestHarness() {
  useEffectsSync();
  return null;
}

describe('useEffectsSync master bus', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    rebuildChain.mockReset();
    getInputNode.mockReset();
    getOutputNode.mockReset();
    spliceMasterEffects.mockReset();
    getOrCreateTrackNode.mockClear();

    getInputNode.mockImplementation((id: string) => `input:${id}`);
    getOutputNode.mockImplementation((id: string) => `output:${id}`);

    useProjectStore.getState().createProject({ name: 'Master FX Sync Test' });
    useProjectStore.getState().addTrack('drums');
    useProjectStore.getState().addMasterEffect('delay');
  });

  it('rebuilds and splices the master effects chain when master effects change', () => {
    render(<TestHarness />);

    const masterEffects = useProjectStore.getState().project?.masterEffects ?? [];
    expect(rebuildChain).toHaveBeenCalledWith('__master__', masterEffects, false);
    expect(spliceMasterEffects).toHaveBeenCalledWith('input:__master__', 'output:__master__');
  });
});
