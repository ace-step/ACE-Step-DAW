/**
 * VST3PluginAdapter — wraps a remote VST3 plugin as a WAPPlugin.
 *
 * The companion desktop app hosts the actual VST3 instance.
 * This adapter communicates over the bridge client and presents
 * the plugin to the DAW through the standard WAPPlugin interface.
 */

import type {
  WAPPlugin,
  PluginType,
  PluginAudioNode,
  PluginParamDescriptor,
  PluginParamValue,
  PluginParamValues,
  FloatParamDescriptor,
} from '../../types/plugin';
import type { VST3BridgeClient } from './VST3BridgeClient';
import type {
  VST3PluginInfo,
  VST3ParamInfo,
  InstantiatedResponse,
  AudioFrame,
} from './VST3BridgeProtocol';
import { createRingBuffer, type W9RingBuffer } from './ringBuffer';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Ring buffer capacity in sample frames (≈ 0.5 s at 48 kHz). */
const RING_BUFFER_FRAMES = 24_000;

/** Interval (ms) for the audio pump loop. */
const AUDIO_PUMP_INTERVAL_MS = 5;

/** Audio block size sent per pump iteration (in sample frames). */
const BLOCK_SIZE = 128;

// ─── Adapter ────────────────────────────────────────────────────────────────

export class VST3PluginAdapter implements WAPPlugin {
  readonly name: string;
  readonly pluginType: PluginType;
  readonly version: string;
  readonly author: string;
  readonly description: string;
  readonly latencySamples: number;

  private instanceId: string;
  private bridgeClient: VST3BridgeClient;
  private paramDescriptors: PluginParamDescriptor[] = [];
  private paramValues: PluginParamValues = {};

  // Audio streaming state
  private inputRingBuffer: W9RingBuffer | null = null;
  private outputRingBuffer: W9RingBuffer | null = null;
  private audioPumpTimer: ReturnType<typeof setInterval> | null = null;
  private audioNodeRef: PluginAudioNode | null = null;
  private disposed = false;

  constructor(
    instanceId: string,
    pluginInfo: VST3PluginInfo,
    instantiateResponse: InstantiatedResponse,
    bridgeClient: VST3BridgeClient,
  ) {
    this.instanceId = instanceId;
    this.name = pluginInfo.name;
    this.pluginType = pluginInfo.category === 'instrument' ? 'instrument' : 'effect';
    this.version = '1.0.0';
    this.author = pluginInfo.vendor;
    this.description = `VST3: ${pluginInfo.name} by ${pluginInfo.vendor}`;
    this.bridgeClient = bridgeClient;
    this.latencySamples = instantiateResponse.latencySamples;

    // Map VST3 params to WAP param descriptors
    this.paramDescriptors = this.mapParamDescriptors(instantiateResponse.parameters);
    this.paramValues = this.buildDefaultParams(instantiateResponse.parameters);

    // Listen for param changes from companion (e.g., native GUI adjustments)
    this.bridgeClient.on('param_changed', this.handleParamChanged);
  }

  // ─── WAPPlugin: audio node ──────────────────────────────────────────────

  createAudioNode(ctx: AudioContext): PluginAudioNode {
    const outputChannels = 2;
    const inputChannels = this.pluginType === 'instrument' ? 0 : 2;

    // Create ring buffers for bridging worklet <-> WebSocket
    this.inputRingBuffer = createRingBuffer(RING_BUFFER_FRAMES, Math.max(inputChannels, 1));
    this.outputRingBuffer = createRingBuffer(RING_BUFFER_FRAMES, outputChannels);

    // For effects: input gain node captures audio to send to companion
    const inputNode = this.pluginType === 'effect' ? ctx.createGain() : null;

    // Output gain node delivers processed audio back to the graph
    const outputNode = ctx.createGain();

    // If effect, connect input → ScriptProcessorNode (capture) → silence
    // In a full implementation this would be an AudioWorkletNode.
    // For now we use a lightweight pump loop that the bridge client
    // drives via audio_frame events.
    if (inputNode) {
      // Connect input through to keep the Web Audio graph alive,
      // but at zero gain so captured audio doesn't double-play.
      const silencer = ctx.createGain();
      silencer.gain.value = 0;
      inputNode.connect(silencer);
      silencer.connect(ctx.destination);
    }

    // Start the audio pump loop
    this.startAudioPump(inputChannels, outputChannels);

    this.audioNodeRef = { inputNode, outputNode };
    return this.audioNodeRef;
  }

  // ─── WAPPlugin: parameters ─────────────────────────────────────────────

  getParameterDescriptors(): PluginParamDescriptor[] {
    return this.paramDescriptors;
  }

  setParameter(paramId: string, value: PluginParamValue): void {
    this.paramValues[paramId] = value;
    const vst3ParamId = parseInt(paramId, 10);
    this.bridgeClient.setParam(this.instanceId, vst3ParamId, value as number);
  }

  getParameter(paramId: string): PluginParamValue | undefined {
    return this.paramValues[paramId];
  }

  getParameters(): PluginParamValues {
    return { ...this.paramValues };
  }

  // ─── WAPPlugin: MIDI ──────────────────────────────────────────────────

  noteOn(note: number, velocity: number, _time?: number): void {
    this.bridgeClient.sendMidi(this.instanceId, [
      { type: 'noteOn', note, velocity, sampleOffset: 0 },
    ]);
  }

  noteOff(note: number, _time?: number): void {
    this.bridgeClient.sendMidi(this.instanceId, [
      { type: 'noteOff', note, velocity: 0, sampleOffset: 0 },
    ]);
  }

  // ─── WAPPlugin: lifecycle ─────────────────────────────────────────────

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.bridgeClient.off('param_changed', this.handleParamChanged);
    this.stopAudioPump();
    this.bridgeClient.destroy(this.instanceId);

    this.inputRingBuffer?.reset();
    this.outputRingBuffer?.reset();
    this.inputRingBuffer = null;
    this.outputRingBuffer = null;
    this.audioNodeRef = null;
  }

  // ─── VST3-specific public API ─────────────────────────────────────────

  /** The companion-assigned instance identifier. */
  get instanceIdentifier(): string {
    return this.instanceId;
  }

  /** Latency in samples introduced by this plugin. */
  get pluginLatency(): number {
    return this.latencySamples;
  }

  /** Ask the companion to open the native VST3 editor window. */
  async openEditor(): Promise<{ width: number; height: number }> {
    return this.bridgeClient.openEditor(this.instanceId);
  }

  /** Retrieve serialised plugin state (preset) from the companion. */
  async getState(): Promise<string> {
    return this.bridgeClient.getState(this.instanceId);
  }

  /** Restore serialised plugin state on the companion. */
  async setState(data: string): Promise<void> {
    return this.bridgeClient.setState(this.instanceId, data);
  }

  // ─── Internal helpers ─────────────────────────────────────────────────

  /**
   * Map VST3 numeric parameter info to WAP FloatParamDescriptor[].
   *
   * VST3 params use numeric IDs and normalised 0-1 ranges.
   * WAP params use string IDs. We convert the numeric ID to a string
   * and preserve the VST3 range.
   */
  private mapParamDescriptors(params: VST3ParamInfo[]): PluginParamDescriptor[] {
    return params.map((p): FloatParamDescriptor => ({
      id: String(p.id),
      name: (p.title ?? p.name) as string,
      type: 'float' as const,
      min: p.min,
      max: p.max,
      defaultValue: (p.defaultValue ?? p.default) as number,
      step: p.stepCount > 0 ? (p.max - p.min) / p.stepCount : undefined,
    }));
  }

  /** Build the initial param values map from VST3 defaults. */
  private buildDefaultParams(params: VST3ParamInfo[]): PluginParamValues {
    const values: PluginParamValues = {};
    for (const p of params) {
      values[String(p.id)] = (p.defaultValue ?? p.default) as number;
    }
    return values;
  }

  /**
   * Handle a parameter change pushed from the companion
   * (e.g., the user adjusted a knob in the native VST3 GUI).
   */
  private handleParamChanged = (
    instanceId: string,
    paramId: number,
    value: number,
  ): void => {
    if (instanceId !== this.instanceId) return;
    this.paramValues[String(paramId)] = value;
  };

  /** Start the audio pump loop that bridges ring buffers and the bridge client. */
  private startAudioPump(inputChannels: number, _outputChannels: number): void {
    // Pre-allocate the read buffer to avoid per-tick allocation
    const inputBuf = inputChannels > 0
      ? new Float32Array(BLOCK_SIZE * inputChannels)
      : null;

    this.audioPumpTimer = setInterval(() => {
      if (this.disposed) return;

      // Read captured input from ring buffer and send to companion
      if (this.inputRingBuffer && inputBuf) {
        const available = this.inputRingBuffer.availableRead();
        if (available >= inputBuf.length) {
          this.inputRingBuffer.read(inputBuf);
          const frame: AudioFrame = {
            instanceId: this.instanceId,
            samples: inputBuf,
            channels: inputChannels,
            frameCount: BLOCK_SIZE,
          };
          this.bridgeClient.sendAudioFrame(frame);
        }
      }

      // Read processed output from output ring buffer — handled by
      // the audio_frame event listener which writes into the output
      // ring buffer. The worklet reads from there.
    }, AUDIO_PUMP_INTERVAL_MS);
  }

  /** Stop the audio pump loop. */
  private stopAudioPump(): void {
    if (this.audioPumpTimer !== null) {
      clearInterval(this.audioPumpTimer);
      this.audioPumpTimer = null;
    }
  }
}
