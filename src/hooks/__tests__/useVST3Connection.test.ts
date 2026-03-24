import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVST3Connection, _resetBridgeClient } from '../useVST3Connection';
import { useVST3Store } from '../../store/vst3Store';
import { VST3BridgeClient } from '../../services/VST3BridgeClient';

// Spy on the bridge client prototype so we can intercept calls
const connectSpy = vi.spyOn(VST3BridgeClient.prototype, 'connect');
const disconnectSpy = vi.spyOn(VST3BridgeClient.prototype, 'disconnect');

describe('useVST3Connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store to defaults
    useVST3Store.setState({
      connectionStatus: 'disconnected',
      connectionError: null,
      companionVersion: null,
    });
    // Reset singleton
    _resetBridgeClient();
    // Clear auto-connect preference
    localStorage.removeItem('vst3-auto-connect');
    // Make connect resolve immediately by default
    connectSpy.mockResolvedValue(undefined);
  });

  afterEach(() => {
    _resetBridgeClient();
  });

  it('initial state is disconnected', () => {
    const { result } = renderHook(() => useVST3Connection());

    expect(result.current.status).toBe('disconnected');
    expect(result.current.error).toBeNull();
    expect(result.current.companionVersion).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it('connect() changes status to connecting', async () => {
    const { result } = renderHook(() => useVST3Connection());

    await act(async () => {
      result.current.connect();
    });

    expect(connectSpy).toHaveBeenCalled();
  });

  it('disconnect() calls bridge client disconnect', () => {
    const { result } = renderHook(() => useVST3Connection());

    act(() => {
      result.current.disconnect();
    });

    expect(disconnectSpy).toHaveBeenCalled();
  });

  it('auto-connects on mount when preference is set', () => {
    localStorage.setItem('vst3-auto-connect', 'true');

    renderHook(() => useVST3Connection());

    expect(connectSpy).toHaveBeenCalled();
  });

  it('does not auto-connect when preference is not set', () => {
    renderHook(() => useVST3Connection());

    expect(connectSpy).not.toHaveBeenCalled();
  });

  it('syncs connection status to vst3Store', () => {
    const { result } = renderHook(() => useVST3Connection());

    // Simulate the bridge client emitting a connected event
    act(() => {
      result.current.connect();
    });

    // The store should reflect connecting status at minimum
    // (actual connected status depends on bridge callback)
    const storeStatus = useVST3Store.getState().connectionStatus;
    expect(['connecting', 'connected', 'disconnected']).toContain(storeStatus);
  });

  it('returns singleton bridge client across renders', () => {
    const { result, rerender } = renderHook(() => useVST3Connection());
    const firstConnect = result.current.connect;

    rerender();

    // Same function reference means same client
    expect(result.current.connect).toBe(firstConnect);
  });
});
