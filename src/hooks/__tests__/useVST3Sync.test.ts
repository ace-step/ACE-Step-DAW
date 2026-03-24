import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVST3Sync } from '../useVST3Sync';
import { useVST3Store } from '../../store/vst3Store';
import { VST3BridgeClient } from '../../services/VST3BridgeClient';
import { _resetBridgeClient } from '../useVST3Connection';

const createInstanceSpy = vi.spyOn(VST3BridgeClient.prototype, 'createInstance');
const destroyInstanceSpy = vi.spyOn(VST3BridgeClient.prototype, 'destroyInstance');

describe('useVST3Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createInstanceSpy.mockResolvedValue(undefined);
    destroyInstanceSpy.mockResolvedValue(undefined);

    _resetBridgeClient();

    // Reset vst3Store
    useVST3Store.setState({
      connectionStatus: 'connected',
      connectionError: null,
      companionVersion: '1.0.0',
      plugins: [],
      instances: {},
    });
  });

  afterEach(() => {
    _resetBridgeClient();
  });

  it('does nothing when there are no tracks with VST3 plugins', () => {
    renderHook(() => useVST3Sync());

    expect(createInstanceSpy).not.toHaveBeenCalled();
    expect(destroyInstanceSpy).not.toHaveBeenCalled();
  });

  it('instantiates a VST3 plugin when added to a track', async () => {
    // Set up: connection is active
    useVST3Store.setState({ connectionStatus: 'connected' });

    renderHook(() => useVST3Sync());

    // Add a VST3 instance to the store via _upsertInstance
    await act(async () => {
      useVST3Store.getState()._upsertInstance({
        instanceId: 'inst-1',
        pluginId: 'com.test.Plugin',
        pluginName: 'Test Plugin',
        vendor: 'Test',
        trackId: 'track-1',
        enabled: true,
        online: false,
        parameters: [],
        presets: [],
        activePreset: null,
      });
    });

    // The sync hook should trigger instantiation on the bridge
    expect(createInstanceSpy).toHaveBeenCalledWith('com.test.Plugin', 'inst-1');
  });

  it('destroys a VST3 plugin when removed', async () => {
    // Set up: connection is active with an existing instance
    useVST3Store.setState({
      connectionStatus: 'connected',
      instances: {
        'inst-1': {
          instanceId: 'inst-1',
          pluginId: 'com.test.Plugin',
          pluginName: 'Test Plugin',
          vendor: 'Test',
          trackId: 'track-1',
          enabled: true,
          online: true,
          parameters: [],
          presets: [],
          activePreset: null,
        },
      },
    });

    renderHook(() => useVST3Sync());

    // Remove the instance
    await act(async () => {
      useVST3Store.getState().removeInstance('inst-1');
    });

    expect(destroyInstanceSpy).toHaveBeenCalledWith('inst-1');
  });

  it('marks all instances offline when connection drops', async () => {
    useVST3Store.setState({
      connectionStatus: 'connected',
      instances: {
        'inst-1': {
          instanceId: 'inst-1',
          pluginId: 'com.test.Plugin',
          pluginName: 'Test Plugin',
          vendor: 'Test',
          trackId: 'track-1',
          enabled: true,
          online: true,
          parameters: [],
          presets: [],
          activePreset: null,
        },
      },
    });

    renderHook(() => useVST3Sync());

    // Simulate connection drop
    await act(async () => {
      useVST3Store.getState().setConnectionStatus('disconnected');
    });

    const inst = useVST3Store.getState().instances['inst-1'];
    expect(inst.online).toBe(false);
  });

  it('re-instantiates plugins when connection restores', async () => {
    useVST3Store.setState({
      connectionStatus: 'disconnected',
      instances: {
        'inst-1': {
          instanceId: 'inst-1',
          pluginId: 'com.test.Plugin',
          pluginName: 'Test Plugin',
          vendor: 'Test',
          trackId: 'track-1',
          enabled: true,
          online: false,
          parameters: [],
          presets: [],
          activePreset: null,
        },
      },
    });

    renderHook(() => useVST3Sync());

    // Simulate reconnection
    await act(async () => {
      useVST3Store.getState().setConnectionStatus('connected');
    });

    expect(createInstanceSpy).toHaveBeenCalledWith('com.test.Plugin', 'inst-1');
  });
});
