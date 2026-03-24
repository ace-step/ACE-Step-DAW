import { describe, it, expect, vi } from 'vitest';
import { VST3StateManager, type VST3BridgeClient } from '../VST3StateManager';

function makeMockBridge(
  stateMap: Record<string, string> = {},
): VST3BridgeClient {
  return {
    getPluginState: vi.fn(async (instanceId: string) => {
      const state = stateMap[instanceId];
      if (!state) throw new Error(`Plugin ${instanceId} not found`);
      return state;
    }),
    setPluginState: vi.fn(async () => {}),
  };
}

describe('VST3StateManager.captureAllStates', () => {
  it('fetches state from all instances via bridge client', async () => {
    const bridge = makeMockBridge({
      'inst-1': 'c3RhdGUx',
      'inst-2': 'c3RhdGUy',
    });

    const result = await VST3StateManager.captureAllStates(bridge, [
      { trackId: 't1', instanceId: 'inst-1' },
      { trackId: 't2', instanceId: 'inst-2' },
    ]);

    expect(result.size).toBe(2);
    expect(result.get('inst-1')).toBe('c3RhdGUx');
    expect(result.get('inst-2')).toBe('c3RhdGUy');
    expect(bridge.getPluginState).toHaveBeenCalledTimes(2);
  });

  it('skips instances that fail (plugin unavailable)', async () => {
    const bridge = makeMockBridge({ 'inst-1': 'c3RhdGUx' });
    // inst-2 will throw because it's not in the map

    const result = await VST3StateManager.captureAllStates(bridge, [
      { trackId: 't1', instanceId: 'inst-1' },
      { trackId: 't2', instanceId: 'inst-2' },
    ]);

    expect(result.size).toBe(1);
    expect(result.get('inst-1')).toBe('c3RhdGUx');
    expect(result.has('inst-2')).toBe(false);
  });

  it('returns empty map for empty instances list', async () => {
    const bridge = makeMockBridge();
    const result = await VST3StateManager.captureAllStates(bridge, []);
    expect(result.size).toBe(0);
  });
});

describe('VST3StateManager.restoreAllStates', () => {
  it('sets state for all instances via bridge client', async () => {
    const bridge = makeMockBridge();

    await VST3StateManager.restoreAllStates(bridge, [
      { instanceId: 'inst-1', vst3State: 'c3RhdGUx' },
      { instanceId: 'inst-2', vst3State: 'c3RhdGUy' },
    ]);

    expect(bridge.setPluginState).toHaveBeenCalledTimes(2);
    expect(bridge.setPluginState).toHaveBeenCalledWith('inst-1', 'c3RhdGUx');
    expect(bridge.setPluginState).toHaveBeenCalledWith('inst-2', 'c3RhdGUy');
  });

  it('skips instances that fail without throwing', async () => {
    const bridge: VST3BridgeClient = {
      getPluginState: vi.fn(),
      setPluginState: vi.fn(async (instanceId: string) => {
        if (instanceId === 'inst-2') throw new Error('Plugin missing');
      }),
    };

    // Should not throw
    await VST3StateManager.restoreAllStates(bridge, [
      { instanceId: 'inst-1', vst3State: 'c3RhdGUx' },
      { instanceId: 'inst-2', vst3State: 'c3RhdGUy' },
    ]);

    expect(bridge.setPluginState).toHaveBeenCalledTimes(2);
  });

  it('handles empty instances list', async () => {
    const bridge = makeMockBridge();
    await VST3StateManager.restoreAllStates(bridge, []);
    expect(bridge.setPluginState).not.toHaveBeenCalled();
  });
});
