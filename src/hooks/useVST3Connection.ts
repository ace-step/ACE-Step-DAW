/**
 * useVST3Connection — Manages companion app auto-connect/reconnect.
 *
 * Creates and maintains a singleton VST3BridgeClient, syncs connection
 * state to the vst3Store, and supports auto-connect via localStorage.
 */
import { useEffect, useCallback, useRef } from 'react';
import { VST3BridgeClient } from '../services/vst3bridge/VST3BridgeClient';
import { useVST3Store } from '../store/vst3Store';
import type { VST3ConnectionStatus, VST3PluginInfo } from '../types/vst3';

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

/**
 * Map raw scanComplete plugin data from the companion to the store format.
 * Handles both the protocol's uid-based format and the store's id-based format.
 */
function mapPluginsToStore(raw: Array<Record<string, string>>): VST3PluginInfo[] {
  return raw.map((p) => ({
    id: p.uid ?? p.id ?? '',
    name: p.name ?? 'Unknown',
    vendor: p.vendor ?? 'Unknown',
    version: p.version ?? '0.0.0',
    category: (p.category?.toLowerCase().includes('instrument') ? 'instrument' : 'effect') as 'instrument' | 'effect',
    subcategory: p.category ?? '',
  }));
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

    // The new client's on() handlers receive the raw message object
    const onStatusChange = (msg: Record<string, unknown>) => {
      const newStatus = msg.status as VST3ConnectionStatus;
      store.setConnectionStatus(newStatus);
      if (newStatus === 'connected') {
        store.setCompanionVersion(client.companionVersion);
        store.setConnectionError(null);
        // Auto-scan on connect (fire-and-forget)
        client.send({ type: 'scanPlugins' });
      } else if (newStatus === 'disconnected') {
        store.setCompanionVersion(null);
        store.markAllInstancesOffline();
      }
    };

    const onError = (msg: Record<string, unknown>) => {
      store.setConnectionError((msg.message as string) || 'Unknown error');
    };

    const onScanComplete = (msg: Record<string, unknown>) => {
      const rawPlugins = (msg.plugins as Array<Record<string, string>>) || [];
      store.setScannedPlugins(mapPluginsToStore(rawPlugins));
    };

    const onScanProgress = (msg: Record<string, unknown>) => {
      store._setScanning(true);
      store._setScanProgress({
        scanned: (msg.found as number) ?? 0,
        total: 0,
        currentPlugin: (msg.current as string) ?? '',
      });
    };

    const unsubs = [
      client.on('statusChange', onStatusChange),
      client.on('error', onError),
      client.on('scanComplete', onScanComplete),
      client.on('scanProgress', onScanProgress),
    ];

    // Sync current state immediately (handles HMR / singleton already connected)
    if (client.isConnected) {
      store.setConnectionStatus('connected');
      store.setCompanionVersion(client.companionVersion);
      store.setConnectionError(null);
      // Trigger scan if plugins list is empty
      if (store.plugins.length === 0) {
        client.send({ type: 'scanPlugins' });
      }
    }

    return () => {
      for (const unsub of unsubs) unsub();
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
    clientRef.current.send({ type: 'scanPlugins' });
  }, []);

  // Expose connect/disconnect via store so CompanionStatus can call them
  useEffect(() => {
    const store = useVST3Store.getState();
    useVST3Store.setState({
      connect,
      disconnect,
      scanPlugins: () => {
        store._setScanning(true);
        clientRef.current.send({ type: 'scanPlugins' });
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
