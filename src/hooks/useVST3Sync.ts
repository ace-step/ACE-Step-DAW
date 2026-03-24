/**
 * useVST3Sync — Syncs VST3 plugin state with the audio engine.
 *
 * Subscribes to the vst3Store and reacts to:
 * - Plugin instances being added/removed
 * - Connection status changes (offline/reconnect)
 * - Parameter changes forwarded to the bridge client
 */
import { useEffect, useRef } from 'react';
import { useVST3Store } from '../store/vst3Store';
import { _getBridgeClient } from './useVST3Connection';

export function useVST3Sync(): void {
  const prevInstanceIdsRef = useRef<Set<string>>(new Set());
  const prevConnectionStatusRef = useRef(useVST3Store.getState().connectionStatus);

  useEffect(() => {
    // Initialize with current state
    const currentState = useVST3Store.getState();
    prevInstanceIdsRef.current = new Set(Object.keys(currentState.instances));
    prevConnectionStatusRef.current = currentState.connectionStatus;

    const unsubscribe = useVST3Store.subscribe((state) => {
      const client = _getBridgeClient();
      const currentIds = new Set(Object.keys(state.instances));
      const prevIds = prevInstanceIdsRef.current;

      // Detect added instances
      for (const id of currentIds) {
        if (!prevIds.has(id) && state.connectionStatus === 'connected') {
          const instance = state.instances[id];
          void client.createInstance(instance.pluginId, instance.instanceId);
        }
      }

      // Detect removed instances
      for (const id of prevIds) {
        if (!currentIds.has(id) && prevConnectionStatusRef.current === 'connected') {
          void client.destroyInstance(id);
        }
      }

      // Detect connection status changes
      const statusChanged = state.connectionStatus !== prevConnectionStatusRef.current;
      if (statusChanged) {
        if (state.connectionStatus === 'disconnected') {
          // Mark all instances offline (update refs first to avoid re-entry)
          prevConnectionStatusRef.current = state.connectionStatus;
          prevInstanceIdsRef.current = currentIds;
          useVST3Store.getState().markAllInstancesOffline();
          return;
        } else if (
          state.connectionStatus === 'connected' &&
          prevConnectionStatusRef.current !== 'connected'
        ) {
          // Re-instantiate all offline plugins
          for (const instance of Object.values(state.instances)) {
            if (!instance.online) {
              void client.createInstance(instance.pluginId, instance.instanceId);
            }
          }
        }
      }

      prevInstanceIdsRef.current = currentIds;
      prevConnectionStatusRef.current = state.connectionStatus;
    });

    return () => {
      unsubscribe();
    };
  }, []);
}
