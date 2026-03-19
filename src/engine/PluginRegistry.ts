/**
 * PluginRegistry — Manages plugin registration, loading, and instantiation.
 *
 * Supports both built-in plugins (registered at startup) and dynamically
 * loaded ES module plugins.
 */
import type {
  WAPPlugin,
  PluginFactory,
  PluginManifest,
  PluginInstance,
  PluginParamValues,
} from '../types/plugin';
import { v4 as uuidv4 } from 'uuid';

export class PluginRegistry {
  /** Registered plugin factories by plugin ID. */
  private factories = new Map<string, PluginFactory>();
  /** Plugin manifests by plugin ID. */
  private manifests = new Map<string, PluginManifest>();
  /** Live plugin instances by instance ID. */
  private instances = new Map<string, WAPPlugin>();

  /**
   * Register a built-in plugin factory.
   * @param id - Unique plugin identifier (e.g., "ace-bitcrusher").
   * @param factory - Function that creates a new plugin instance.
   */
  registerPlugin(id: string, factory: PluginFactory): PluginManifest {
    this.factories.set(id, factory);
    // Create a temporary instance to read metadata
    const temp = factory();
    const manifest: PluginManifest = {
      id,
      name: temp.name,
      pluginType: temp.pluginType,
      version: temp.version,
      author: temp.author,
      description: temp.description,
      parameters: temp.getParameterDescriptors(),
    };
    temp.dispose();
    this.manifests.set(id, manifest);
    return manifest;
  }

  /**
   * Dynamically load a plugin from a URL (ES module with default export).
   * The module must export a PluginFactory as its default export.
   */
  async loadPluginFromUrl(url: string, pluginId?: string): Promise<PluginManifest> {
    const module = await import(/* @vite-ignore */ url);
    const factory: PluginFactory = module.default ?? Object.values(module)[0];
    if (typeof factory !== 'function') {
      throw new Error(`Plugin module at ${url} does not export a valid factory function`);
    }
    const id = pluginId ?? `external-${uuidv4()}`;
    return this.registerPlugin(id, factory);
  }

  /**
   * Create a new instance of a registered plugin.
   * Returns a PluginInstance (serializable state) and stores the live WAPPlugin.
   */
  createInstance(pluginId: string, ctx: AudioContext): { instance: PluginInstance; plugin: WAPPlugin } {
    const factory = this.factories.get(pluginId);
    if (!factory) throw new Error(`Plugin "${pluginId}" not registered`);

    const manifest = this.manifests.get(pluginId);
    if (!manifest) throw new Error(`Plugin manifest for "${pluginId}" not found`);

    const plugin = factory();
    plugin.createAudioNode(ctx);

    const instanceId = uuidv4();
    this.instances.set(instanceId, plugin);

    // Build default params from descriptors
    const defaultParams: PluginParamValues = {};
    for (const desc of manifest.parameters) {
      defaultParams[desc.id] = desc.defaultValue;
    }

    const instance: PluginInstance = {
      id: instanceId,
      pluginId,
      enabled: true,
      params: defaultParams,
      manifest: { ...manifest },
    };

    return { instance, plugin };
  }

  /**
   * Get the live WAPPlugin for a given instance ID.
   */
  getInstance(instanceId: string): WAPPlugin | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Dispose and remove a plugin instance.
   */
  disposeInstance(instanceId: string): void {
    const plugin = this.instances.get(instanceId);
    if (plugin) {
      plugin.dispose();
      this.instances.delete(instanceId);
    }
  }

  /**
   * Get all registered plugin manifests.
   */
  getAvailablePlugins(): PluginManifest[] {
    return Array.from(this.manifests.values());
  }

  /**
   * Get a specific plugin manifest.
   */
  getManifest(pluginId: string): PluginManifest | undefined {
    return this.manifests.get(pluginId);
  }

  /**
   * Check if a plugin ID is registered.
   */
  isRegistered(pluginId: string): boolean {
    return this.factories.has(pluginId);
  }

  /**
   * Dispose all instances and clear the registry.
   */
  dispose(): void {
    for (const plugin of this.instances.values()) {
      plugin.dispose();
    }
    this.instances.clear();
    this.factories.clear();
    this.manifests.clear();
  }
}

export const pluginRegistry = new PluginRegistry();
