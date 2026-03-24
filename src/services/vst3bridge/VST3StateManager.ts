/**
 * VST3 State Manager — captures and restores VST3 plugin state for project persistence.
 *
 * VST3 plugins store their IComponent state as opaque binary data.
 * This manager coordinates with the VST3BridgeClient to serialize/deserialize
 * that state as base64 strings stored in the project file.
 */

/**
 * Minimal interface for the VST3 bridge client used by the state manager.
 * The full VST3BridgeClient lives in a separate module; this keeps the
 * state manager decoupled and easy to test.
 */
export interface VST3BridgeClient {
  /** Fetch the current IComponent state as a base64-encoded string. */
  getPluginState(instanceId: string): Promise<string>;
  /** Restore a previously captured IComponent state (base64-encoded). */
  setPluginState(instanceId: string, base64State: string): Promise<void>;
}

export class VST3StateManager {
  /**
   * Before project save: fetch state from all active VST3 plugins.
   * Returns a map of instanceId to base64-encoded component state.
   * Errors for individual plugins are silently skipped (the plugin may
   * have been removed or the companion disconnected).
   */
  static async captureAllStates(
    bridgeClient: VST3BridgeClient,
    instances: { trackId: string; instanceId: string }[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const tasks = instances.map(async ({ instanceId }) => {
      try {
        const state = await bridgeClient.getPluginState(instanceId);
        result.set(instanceId, state);
      } catch {
        // Plugin unavailable — skip silently
      }
    });
    await Promise.all(tasks);
    return result;
  }

  /**
   * After project load: restore state to all re-instantiated VST3 plugins.
   * Errors for individual plugins are silently skipped (the plugin may
   * not be available on this machine).
   */
  static async restoreAllStates(
    bridgeClient: VST3BridgeClient,
    instances: { instanceId: string; vst3State: string }[],
  ): Promise<void> {
    const tasks = instances.map(async ({ instanceId, vst3State }) => {
      try {
        await bridgeClient.setPluginState(instanceId, vst3State);
      } catch {
        // Plugin unavailable — skip silently
      }
    });
    await Promise.all(tasks);
  }
}
