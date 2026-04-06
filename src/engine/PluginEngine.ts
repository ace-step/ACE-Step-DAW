/**
 * PluginEngine — Manages plugin audio nodes on tracks.
 *
 * Handles creating plugin audio nodes, connecting them into the track's
 * effect chain, and updating parameters at runtime.
 */
import type {
  WAPPlugin,
  PluginInstance,
  PluginParamValue,
  PluginAudioNode,
} from '../types/plugin';
import { pluginRegistry } from './PluginRegistry';

interface PluginNode {
  instanceId: string;
  plugin: WAPPlugin;
  audioNode: PluginAudioNode;
  bypassed: boolean;
}

export class PluginEngine {
  /** Per-track plugin chains (effect plugins inserted after built-in effects). */
  private chains = new Map<string, PluginNode[]>();

  /**
   * Add a plugin to a track's plugin chain.
   * Returns the audio node pair for wiring into the effect chain.
   */
  addPlugin(trackId: string, instanceId: string, plugin: WAPPlugin, ctx: AudioContext): PluginAudioNode {
    const audioNode = plugin.createAudioNode(ctx);
    const chain = this.chains.get(trackId) ?? [];

    const pluginNode: PluginNode = { instanceId, plugin, audioNode, bypassed: false };

    // Connect to last non-bypassed plugin in chain (skip bypassed plugins)
    if (chain.length > 0 && audioNode.inputNode) {
      for (let i = chain.length - 1; i >= 0; i--) {
        if (!chain[i].bypassed) {
          chain[i].audioNode.outputNode.connect(audioNode.inputNode);
          break;
        }
      }
    }

    chain.push(pluginNode);
    this.chains.set(trackId, chain);

    return audioNode;
  }

  /**
   * Remove a plugin from a track's plugin chain.
   */
  removePlugin(trackId: string, instanceId: string): void {
    const chain = this.chains.get(trackId);
    if (!chain) return;

    const idx = chain.findIndex((n) => n.instanceId === instanceId);
    if (idx < 0) return;

    const node = chain[idx];
    const prev = idx > 0 ? chain[idx - 1] : null;
    const next = idx < chain.length - 1 ? chain[idx + 1] : null;

    // Reconnect prev → next (bypassing removed node)
    if (prev && next && next.audioNode.inputNode) {
      try { prev.audioNode.outputNode.disconnect(); } catch { /* ok */ }
      prev.audioNode.outputNode.connect(next.audioNode.inputNode);
    }

    // Dispose the removed plugin
    node.plugin.dispose();
    pluginRegistry.disposeInstance(instanceId);

    chain.splice(idx, 1);
    if (chain.length === 0) {
      this.chains.delete(trackId);
    }
  }

  /**
   * Rebuild the entire plugin chain for a track from PluginInstance state.
   */
  rebuildChain(trackId: string, instances: PluginInstance[], ctx: AudioContext): void {
    this.disposeChain(trackId);

    const chain: PluginNode[] = [];

    for (const inst of instances) {
      if (!inst.enabled) continue;

      let plugin = pluginRegistry.getInstance(inst.id);
      if (!plugin) {
        // Re-create from registry
        if (!pluginRegistry.isRegistered(inst.pluginId)) continue;
        const result = pluginRegistry.createInstance(inst.pluginId, ctx);
        plugin = result.plugin;
        // Note: this creates a new instance ID; caller should update store
      }

      const audioNode = plugin.createAudioNode(ctx);

      // Apply saved parameters
      for (const [paramId, value] of Object.entries(inst.params)) {
        plugin.setParameter(paramId, value);
      }

      // Connect to previous in chain
      if (chain.length > 0 && audioNode.inputNode) {
        chain[chain.length - 1].audioNode.outputNode.connect(audioNode.inputNode);
      }

      chain.push({ instanceId: inst.id, plugin, audioNode, bypassed: false });
    }

    if (chain.length > 0) {
      this.chains.set(trackId, chain);
    }
  }

  /**
   * Update a plugin parameter value.
   */
  updateParam(trackId: string, instanceId: string, paramId: string, value: PluginParamValue): void {
    const chain = this.chains.get(trackId);
    if (!chain) return;
    const node = chain.find((n) => n.instanceId === instanceId);
    if (node) {
      node.plugin.setParameter(paramId, value);
    }
  }

  /**
   * Bypass or un-bypass a plugin. When bypassed, audio routes around the plugin.
   */
  setPluginBypassed(trackId: string, instanceId: string, bypassed: boolean): void {
    const chain = this.chains.get(trackId);
    if (!chain) return;

    const idx = chain.findIndex((n) => n.instanceId === instanceId);
    if (idx < 0 || chain[idx].bypassed === bypassed) return;

    const node = chain[idx];
    const prev = idx > 0 ? chain[idx - 1] : null;
    const next = idx < chain.length - 1 ? chain[idx + 1] : null;
    node.bypassed = bypassed;

    if (bypassed) {
      // Disconnect plugin from chain and connect around it
      if (prev) {
        try { prev.audioNode.outputNode.disconnect(node.audioNode.inputNode!); } catch { /* ok */ }
        if (next?.audioNode.inputNode) {
          prev.audioNode.outputNode.connect(next.audioNode.inputNode);
        }
      }
      if (next?.audioNode.inputNode) {
        try { node.audioNode.outputNode.disconnect(next.audioNode.inputNode); } catch { /* ok */ }
      }
    } else {
      // Re-insert plugin into chain
      if (prev && next?.audioNode.inputNode) {
        try { prev.audioNode.outputNode.disconnect(next.audioNode.inputNode); } catch { /* ok */ }
      }
      if (prev && node.audioNode.inputNode) {
        prev.audioNode.outputNode.connect(node.audioNode.inputNode);
      }
      if (next?.audioNode.inputNode) {
        node.audioNode.outputNode.connect(next.audioNode.inputNode);
      }
    }
  }

  /**
   * Get the input node of the first non-bypassed plugin in the chain.
   */
  getInputNode(trackId: string): AudioNode | null {
    const chain = this.chains.get(trackId);
    if (!chain?.length) return null;
    const first = chain.find((n) => !n.bypassed);
    return first?.audioNode.inputNode ?? null;
  }

  /**
   * Get the output node of the last non-bypassed plugin in the chain.
   */
  getOutputNode(trackId: string): AudioNode | null {
    const chain = this.chains.get(trackId);
    if (!chain?.length) return null;
    for (let i = chain.length - 1; i >= 0; i--) {
      if (!chain[i].bypassed) return chain[i].audioNode.outputNode;
    }
    return null;
  }

  /**
   * Get a live plugin instance by instance ID from a track.
   */
  getPlugin(trackId: string, instanceId: string): WAPPlugin | undefined {
    const chain = this.chains.get(trackId);
    if (!chain) return undefined;
    return chain.find((n) => n.instanceId === instanceId)?.plugin;
  }

  /**
   * Trigger noteOn on instrument plugins on a track.
   */
  noteOn(trackId: string, note: number, velocity: number, time?: number): void {
    const chain = this.chains.get(trackId);
    if (!chain) return;
    for (const node of chain) {
      if (node.plugin.noteOn) {
        node.plugin.noteOn(note, velocity, time);
      }
    }
  }

  /**
   * Trigger noteOff on instrument plugins on a track.
   */
  noteOff(trackId: string, note: number, time?: number): void {
    const chain = this.chains.get(trackId);
    if (!chain) return;
    for (const node of chain) {
      if (node.plugin.noteOff) {
        node.plugin.noteOff(note, time);
      }
    }
  }

  /**
   * Get total latency of plugin chain for a track (in samples).
   * Sums latencySamples from all plugins in the chain.
   * WAP plugins without latencySamples are assumed to have 0 latency.
   */
  getChainLatency(trackId: string): number {
    const chain = this.chains.get(trackId);
    if (!chain) return 0;
    let total = 0;
    for (const node of chain) {
      total += node.plugin.latencySamples ?? 0;
    }
    return total;
  }

  /**
   * Dispose the plugin chain for a track.
   */
  disposeChain(trackId: string): void {
    const chain = this.chains.get(trackId);
    if (!chain) return;
    for (const node of chain) {
      node.plugin.dispose();
      pluginRegistry.disposeInstance(node.instanceId);
    }
    this.chains.delete(trackId);
  }

  /**
   * Dispose all plugin chains.
   */
  dispose(): void {
    for (const trackId of this.chains.keys()) {
      this.disposeChain(trackId);
    }
  }
}

export const pluginEngine = new PluginEngine();
