/**
 * WAMPluginAdapter — Wraps a WAM 2.0 plugin instance as a WAPPlugin.
 *
 * This adapter bridges the WAM SDK's WebAudioModule interface to the
 * DAW's internal WAPPlugin interface, enabling WAM plugins to be used
 * in the same plugin chain as built-in and VST3 plugins.
 */
import type {
  WAPPlugin,
  PluginType,
  PluginAudioNode,
  PluginParamDescriptor,
  PluginParamValue,
  PluginParamValues,
} from '../../types/plugin';
import type { WAMPluginHandle } from './WAMHost';
import type { WAMParameterInfo } from '../../types/wam';

export class WAMPluginAdapter implements WAPPlugin {
  readonly name: string;
  readonly pluginType: PluginType;
  readonly version: string;
  readonly author: string;
  readonly description: string;
  readonly latencySamples = 0;

  private _handle: WAMPluginHandle;
  private _paramDescriptors: PluginParamDescriptor[] = [];
  private _paramInfoMap: Map<string, WAMParameterInfo> = new Map();
  private _cachedValues: PluginParamValues = {};
  private _audioNodeCreated = false;

  private constructor(handle: WAMPluginHandle) {
    this._handle = handle;
    const desc = handle.descriptor;

    this.name = desc.name ?? 'Unknown WAM';
    this.author = desc.vendor ?? 'Unknown';
    this.version = desc.version ?? '0.0.0';
    this.description = desc.description ?? '';
    this.pluginType = desc.isInstrument ? 'instrument' : 'effect';
  }

  /**
   * Create a WAMPluginAdapter by loading parameter info from the WAM node.
   * This is async because WAM parameter queries are promise-based.
   */
  static async create(handle: WAMPluginHandle): Promise<WAMPluginAdapter> {
    const adapter = new WAMPluginAdapter(handle);
    await adapter._loadParameters();
    return adapter;
  }

  /** Load parameter info and current values from the WAM node. */
  private async _loadParameters(): Promise<void> {
    const node = this._handle.instance.audioNode;

    try {
      const paramInfoMap = await node.getParameterInfo();
      const paramValues = await node.getParameterValues(true);

      const descriptors: PluginParamDescriptor[] = [];

      for (const [id, info] of Object.entries(paramInfoMap)) {
        this._paramInfoMap.set(id, info as WAMParameterInfo);
        const wamInfo = info as WAMParameterInfo;
        const currentValue = paramValues[id]?.value ?? wamInfo.defaultValue;

        if (wamInfo.type === 'choice' && wamInfo.choices?.length) {
          descriptors.push({
            id,
            name: wamInfo.label || id,
            type: 'enum',
            options: wamInfo.choices,
            defaultValue: wamInfo.choices[Math.round(wamInfo.defaultValue)] ?? wamInfo.choices[0],
          });
          this._cachedValues[id] =
            wamInfo.choices[Math.round(currentValue)] ?? wamInfo.choices[0];
        } else if (wamInfo.type === 'boolean') {
          descriptors.push({
            id,
            name: wamInfo.label || id,
            type: 'bool',
            defaultValue: wamInfo.defaultValue > 0.5,
          });
          this._cachedValues[id] = currentValue > 0.5;
        } else if (wamInfo.type === 'int') {
          descriptors.push({
            id,
            name: wamInfo.label || id,
            type: 'int',
            min: wamInfo.minValue,
            max: wamInfo.maxValue,
            defaultValue: Math.round(wamInfo.defaultValue),
          });
          this._cachedValues[id] = Math.round(currentValue);
        } else {
          // float (default)
          descriptors.push({
            id,
            name: wamInfo.label || id,
            type: 'float',
            min: wamInfo.minValue,
            max: wamInfo.maxValue,
            defaultValue: wamInfo.defaultValue,
          });
          this._cachedValues[id] = currentValue;
        }
      }

      this._paramDescriptors = descriptors;
    } catch {
      // Plugin may not expose parameters — that's fine
      this._paramDescriptors = [];
    }
  }

  createAudioNode(_ctx: AudioContext): PluginAudioNode {
    this._audioNodeCreated = true;
    const node = this._handle.audioNode;

    // WAM plugins always have an output
    // For effects (hasAudioInput), use the same node as input and output
    const isEffect = this.pluginType === 'effect';

    return {
      inputNode: isEffect ? node : null,
      outputNode: node,
    };
  }

  getParameterDescriptors(): PluginParamDescriptor[] {
    return this._paramDescriptors;
  }

  setParameter(paramId: string, value: PluginParamValue): void {
    this._cachedValues[paramId] = value;

    const info = this._paramInfoMap.get(paramId);
    if (!info) return;

    let numValue: number;
    if (info.type === 'choice' && typeof value === 'string' && info.choices) {
      numValue = info.choices.indexOf(value);
      if (numValue < 0) numValue = 0;
    } else if (info.type === 'boolean') {
      numValue = value ? 1 : 0;
    } else {
      numValue = Number(value);
    }

    const node = this._handle.instance.audioNode;
    node.setParameterValues({
      [paramId]: { id: paramId, value: numValue, normalized: true },
    });
  }

  getParameter(paramId: string): PluginParamValue | undefined {
    return this._cachedValues[paramId];
  }

  getParameters(): PluginParamValues {
    return { ...this._cachedValues };
  }

  dispose(): void {
    try {
      this._handle.instance.audioNode.destroy();
    } catch {
      // Ignore errors during cleanup
    }
    this._paramDescriptors = [];
    this._paramInfoMap.clear();
    this._cachedValues = {};
  }

  // ── WAM-specific methods (not part of WAPPlugin) ───────────────────────────

  /** Get the WAM plugin's custom GUI element. */
  async createGui(): Promise<Element> {
    return this._handle.instance.createGui();
  }

  /** Destroy a previously created GUI element. */
  destroyGui(gui: Element): void {
    this._handle.instance.destroyGui(gui);
  }

  /** Get the full WAM state for preset saving. */
  async getState(): Promise<unknown> {
    return this._handle.instance.audioNode.getState();
  }

  /** Restore WAM state from a preset. */
  async setState(state: unknown): Promise<void> {
    return this._handle.instance.audioNode.setState(state);
  }

  /** Get the underlying WAM handle. */
  getHandle(): WAMPluginHandle {
    return this._handle;
  }

  /** Whether this plugin has a custom GUI. */
  hasGui(): boolean {
    return typeof this._handle.instance.createGui === 'function';
  }
}
