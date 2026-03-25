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
import { RingBuffer } from './ringBuffer';
import { VST3AudioWorkletNode } from './VST3AudioWorklet';
import { fnv1aHash } from './VST3BridgeProtocol';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Ring buffer capacity in sample frames (≈ 0.5 s at 48 kHz). */
const RING_BUFFER_FRAMES = 24_000;

/** Interval (ms) for the audio pump loop (input capture for effects). */
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
  private workletNode: VST3AudioWorkletNode | null = null;
  private outputRingBuffer: RingBuffer | null = null;
  private audioPumpTimer: ReturnType<typeof setInterval> | null = null;
  private audioNodeRef: PluginAudioNode | null = null;
  private audioFrameHandler: ((hash: number, seq: number, channels: number, samples: Float32Array[]) => void) | null = null;
  private instanceIdHash: number;
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
    this.instanceIdHash = fnv1aHash(instanceId);

    // Map VST3 params to WAP param descriptors
    this.paramDescriptors = this.mapParamDescriptors(instantiateResponse.parameters);
    this.paramValues = this.buildDefaultParams(instantiateResponse.parameters);

    // Listen for param changes from companion (e.g., native GUI adjustments)
    this.bridgeClient.on('paramChanged', this.handleParamChanged);
  }

  // ─── WAPPlugin: audio node ──────────────────────────────────────────────

  /**
   * Create the audio node. Must be called with `await` since AudioWorklet
   * registration is async. Returns a PluginAudioNode with input/output nodes.
   */
  async createAudioNodeAsync(ctx: AudioContext): Promise<PluginAudioNode> {
    const outputChannels = 2;
    const isEffect = this.pluginType === 'effect';

    // Create the VST3 AudioWorklet node (handles ring buffers + worklet registration)
    this.workletNode = await VST3AudioWorkletNode.create(ctx, outputChannels, isEffect);
    this.outputRingBuffer = RingBuffer.wrap(
      this.workletNode.outputSAB,
      outputChannels,
    );

    // Subscribe to incoming audio frames from the companion
    this.audioFrameHandler = (hash, _seq, channels, samples) => {
      if (hash !== this.instanceIdHash) return;
      if (!this.outputRingBuffer) return;

      // Write received audio (per-channel Float32Array[]) into the ring buffer.
      // The AudioWorklet reads from this ring buffer on the audio thread.
      const numSamples = samples.length > 0 ? samples[0].length : 0;
      if (numSamples > 0 && channels > 0) {
        this.outputRingBuffer.writeDeinterleaved(samples, numSamples);
      }
    };
    this.bridgeClient.onAudioFrame(this.audioFrameHandler);

    // Tell the companion to start streaming audio for this instance
    this.bridgeClient.send({
      type: 'startAudioStream',
      instanceId: this.instanceId,
      sampleRate: ctx.sampleRate,
      blockSize: BLOCK_SIZE,
    });

    // For effects: start the input pump that captures audio and sends to companion
    if (isEffect && this.workletNode.inputSAB) {
      this.startInputPump(outputChannels);
    }

    this.audioNodeRef = {
      inputNode: this.workletNode.inputNode,
      outputNode: this.workletNode.outputNode,
    };
    return this.audioNodeRef;
  }

  /**
   * Synchronous createAudioNode for WAPPlugin interface compatibility.
   * Kicks off async worklet creation internally. The audio graph won't
   * produce sound until the async setup completes.
   */
  createAudioNode(ctx: AudioContext): PluginAudioNode {
    // Create placeholder nodes immediately
    const outputNode = ctx.createGain();
    const inputNode = this.pluginType === 'effect' ? ctx.createGain() : null;

    this.audioNodeRef = { inputNode, outputNode };

    // Kick off async setup — once ready, reconnect to real worklet nodes
    this.createAudioNodeAsync(ctx).then((realNodes) => {
      // Connect real worklet output → placeholder output so downstream graph works
      if (realNodes.outputNode && realNodes.outputNode !== outputNode) {
        (realNodes.outputNode as AudioNode).connect(outputNode);
      }
      // For effects: connect placeholder input → real worklet input
      if (inputNode && realNodes.inputNode && realNodes.inputNode !== inputNode) {
        inputNode.connect(realNodes.inputNode as AudioNode);
      }
    });

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

    this.bridgeClient.off('paramChanged', this.handleParamChanged);

    // Unsubscribe from audio frames
    if (this.audioFrameHandler) {
      this.bridgeClient.offAudioFrame(this.audioFrameHandler);
      this.audioFrameHandler = null;
    }

    // Tell companion to stop streaming
    this.bridgeClient.send({
      type: 'stopAudioStream',
      instanceId: this.instanceId,
    });

    this.stopInputPump();
    this.bridgeClient.destroy(this.instanceId);

    // Clean up worklet node (handles ring buffer reset + disconnect)
    this.workletNode?.dispose();
    this.workletNode = null;
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

  /**
   * Start the input pump loop for effect plugins.
   * Reads captured audio from the input ring buffer (written by the worklet)
   * and sends it to the companion for processing.
   */
  private startInputPump(channels: number): void {
    if (!this.workletNode?.inputSAB) return;

    const inputRingBuffer = RingBuffer.wrap(this.workletNode.inputSAB, channels);
    // Pre-allocate per-channel read buffers
    const channelBuffers = Array.from({ length: channels }, () => new Float32Array(BLOCK_SIZE));

    this.audioPumpTimer = setInterval(() => {
      if (this.disposed) return;

      // Read captured input from ring buffer and send to companion
      const available = inputRingBuffer.availableRead;
      if (available >= BLOCK_SIZE) {
        inputRingBuffer.readDeinterleaved(channelBuffers, BLOCK_SIZE);
        const frame: AudioFrame = {
          instanceId: this.instanceId,
          samples: channelBuffers[0], // interleaved format for sendAudioFrame
          channels,
          frameCount: BLOCK_SIZE,
        };
        this.bridgeClient.sendAudioFrame(frame);
      }
    }, AUDIO_PUMP_INTERVAL_MS);
  }

  /** Stop the input pump loop. */
  private stopInputPump(): void {
    if (this.audioPumpTimer !== null) {
      clearInterval(this.audioPumpTimer);
      this.audioPumpTimer = null;
    }
  }
}
