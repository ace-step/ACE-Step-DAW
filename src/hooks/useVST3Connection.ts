/**
 * useVST3Connection — Manages companion app auto-connect/reconnect.
 *
 * Creates and maintains a singleton VST3BridgeClient, syncs connection
 * state to the vst3Store, and supports auto-connect via localStorage.
 */
import { useEffect, useCallback, useRef } from 'react';
import { VST3BridgeClient } from '../services/VST3BridgeClient';
import { useVST3Store } from '../store/vst3Store';
import type { VST3ConnectionStatus } from '../types/vst3';

const AUTO_CONNECT_KEY = 'vst3-auto-connect';

let _bridgeClient: VST3BridgeClient | null = null;

/** Get or create the singleton bridge client. */
export function _getBridgeClient(): VST3BridgeClient {
  if (!_bridgeClient) {
    _bridgeClient = new VST3BridgeClient();
  }
  return _bridgeClient;
}

/** @internal Reset the singleton — for tests only. */
export function _resetBridgeClient(): void {
  if (_bridgeClient) {
    _bridgeClient.disconnect();
    _bridgeClient = null;
  }
}

export function useVST3Connection() {
  const status = useVST3Store((s) => s.connectionStatus);
  const error = useVST3Store((s) => s.connectionError);
  const companionVersion = useVST3Store((s) => s.companionVersion);
  const clientRef = useRef(_getBridgeClient());

  // Wire bridge events to store on mount
  useEffect(() => {
    const client = clientRef.current;
    const store = useVST3Store.getState();

    const onStatusChange = (newStatus: VST3ConnectionStatus) => {
      store.setConnectionStatus(newStatus);
      if (newStatus === 'connected') {
        store.setCompanionVersion(client.companionVersion);
        store.setConnectionError(null);
        // Auto-scan on connect
        client.scanPlugins();
      } else if (newStatus === 'disconnected') {
        store.setCompanionVersion(null);
        store.markAllInstancesOffline();
      }
    };

    const onError = (msg: string) => {
      store.setConnectionError(msg);
    };

    const onScanComplete = (plugins: import('../types/vst3').VST3PluginInfo[]) => {
      store.setScannedPlugins(plugins);
    };

    const onScanProgress = (found: number, current: string) => {
      store._setScanning(true);
      store._setScanProgress({ scanned: found, total: 0, currentPlugin: current });
    };

    client.on('statusChange', onStatusChange);
    client.on('error', onError);
    client.on('scanComplete', onScanComplete);
    client.on('scanProgress', onScanProgress);

    return () => {
      client.off('statusChange', onStatusChange);
      client.off('error', onError);
      client.off('scanComplete', onScanComplete);
      client.off('scanProgress', onScanProgress);
    };
  }, []);

  // Auto-connect on mount if preference is set
  useEffect(() => {
    const shouldAutoConnect = localStorage.getItem(AUTO_CONNECT_KEY) === 'true';
    if (shouldAutoConnect) {
      clientRef.current.connect();
    }
  }, []);

  const connect = useCallback(() => {
    localStorage.setItem(AUTO_CONNECT_KEY, 'true');
    clientRef.current.connect();
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(AUTO_CONNECT_KEY);
    clientRef.current.disconnect();
  }, []);

  const scanPlugins = useCallback(() => {
    clientRef.current.scanPlugins();
  }, []);

  // Expose connect/disconnect via store so CompanionStatus can call them
  useEffect(() => {
    const store = useVST3Store.getState();
    // Override the store's stub connect/disconnect with real bridge calls
    useVST3Store.setState({
      connect,
      disconnect,
      scanPlugins: () => {
        store._setScanning(true);
        clientRef.current.scanPlugins();
      },
    });
  }, [connect, disconnect]);

  return {
    status,
    error,
    companionVersion,
    connect,
    disconnect,
    scanPlugins,
    isConnected: status === 'connected',
  };
}
