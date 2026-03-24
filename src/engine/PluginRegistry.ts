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
  VST3PluginManifest,
  VST3PluginInfo,
} from '../types/plugin';
import { v4 as uuidv4 } from 'uuid';

/** Factory that creates a VST3 adapter — may be async. */
type VST3AdapterFactory = (instanceId: string, ctx: AudioContext) => WAPPlugin | Promise<WAPPlugin>;

export class PluginRegistry {
  /** Registered plugin factories by plugin ID. */
  private factories = new Map<string, PluginFactory>();
  /** VST3 adapter factories by plugin ID. */
  private vst3Factories = new Map<string, VST3AdapterFactory>();
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

    return this.storeAndBuildInstance(pluginId, manifest, plugin);
  }

  /** Store a live plugin and build its serializable PluginInstance. */
  private storeAndBuildInstance(
    pluginId: string,
    manifest: PluginManifest,
    plugin: WAPPlugin,
  ): { instance: PluginInstance; plugin: WAPPlugin } {
    const instanceId = uuidv4();
    this.instances.set(instanceId, plugin);

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
    return this.factories.has(pluginId) || this.vst3Factories.has(pluginId);
  }

  // ── VST3 Support ────────────────────────────────────────────────────────

  /**
   * Register a VST3 plugin from scan results.
   * @param manifest - The VST3 plugin manifest.
   * @param adapterFactory - Factory that creates a WAPPlugin adapter for this VST3 plugin.
   */
  registerVST3Plugin(
    manifest: VST3PluginManifest,
    adapterFactory: (instanceId: string, ctx: AudioContext) => WAPPlugin,
  ): VST3PluginManifest {
    this.vst3Factories.set(manifest.id, adapterFactory);
    this.manifests.set(manifest.id, manifest);
    return manifest;
  }

  /**
   * Register all VST3 plugins from a scan.
   * Converts VST3PluginInfo[] to VST3PluginManifest[] and registers each.
   */
  registerVST3Plugins(
    plugins: VST3PluginInfo[],
    createAdapter: (pluginUid: string, instanceId: string, ctx: AudioContext) => Promise<WAPPlugin>,
  ): void {
    for (const info of plugins) {
      const pluginId = `vst3:${info.uid}`;
      const manifest: VST3PluginManifest = {
        id: pluginId,
        name: info.name,
        pluginType: info.pluginType,
        version: info.version,
        author: info.vendor,
        description: info.description,
        parameters: info.parameters,
        vst3Uid: info.uid,
        vendor: info.vendor,
        latencySamples: info.latencySamples,
        outputBusses: info.outputBusses,
        hasEditor: info.hasEditor,
        isVST3: true,
      };
      const adapterFactory: VST3AdapterFactory = (instanceId, ctx) =>
        createAdapter(info.uid, instanceId, ctx);
      this.vst3Factories.set(pluginId, adapterFactory);
      this.manifests.set(pluginId, manifest);
    }
  }

  /**
   * Create instance — supports both sync WAP and async VST3.
   */
  async createInstanceAsync(
    pluginId: string,
    ctx: AudioContext,
  ): Promise<{ instance: PluginInstance; plugin: WAPPlugin }> {
    // Try WAP factory first (sync path)
    if (this.factories.has(pluginId)) {
      return this.createInstance(pluginId, ctx);
    }

    // Try VST3 factory (async path)
    const vst3Factory = this.vst3Factories.get(pluginId);
    if (!vst3Factory) {
      throw new Error(`Plugin "${pluginId}" not registered`);
    }

    const manifest = this.manifests.get(pluginId);
    if (!manifest) {
      throw new Error(`Plugin manifest for "${pluginId}" not found`);
    }

    const tempId = uuidv4(); // temporary ID for factory call
    const plugin = await vst3Factory(tempId, ctx);
    plugin.createAudioNode(ctx);

    return this.storeAndBuildInstance(pluginId, manifest, plugin);
  }

  /**
   * Get only VST3 plugin manifests.
   */
  getVST3Plugins(): VST3PluginManifest[] {
    return Array.from(this.vst3Factories.keys())
      .map((id) => this.manifests.get(id) as VST3PluginManifest)
      .filter(Boolean);
  }

  /**
   * Check if a plugin is VST3.
   */
  isVST3Plugin(pluginId: string): boolean {
    return this.vst3Factories.has(pluginId);
  }

  /**
   * Unregister all VST3 plugins (for when companion disconnects).
   */
  unregisterVST3Plugins(): void {
    for (const pluginId of this.vst3Factories.keys()) {
      this.manifests.delete(pluginId);
    }
    this.vst3Factories.clear();
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
    this.vst3Factories.clear();
    this.manifests.clear();
  }
}

export const pluginRegistry = new PluginRegistry();
