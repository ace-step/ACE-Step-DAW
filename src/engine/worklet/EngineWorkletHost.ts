/**
 * EngineWorkletHost — Main-thread controller for the AudioWorklet DSP pipeline.
 *
 * Manages:
 * - AudioWorklet registration and node creation
 * - SharedArrayBuffer allocation for audio and parameter transport
 * - Play/stop/seek command dispatch via MessagePort
 * - Dropout monitoring and fallback detection
 *
 * Architecture:
 *   EngineWorkletHost (main thread)
 *     ↕ MessagePort commands + SharedArrayBuffer data
 *   engine-worklet-processor.js (AudioWorklet thread)
 */

import { RingBuffer } from '../dsp/RingBuffer';
import { ParamBuffer } from '../dsp/ParamBuffer';
import { createDebugLogger } from '../../utils/debugLogger';

const logger = createDebugLogger('ace-step:engine-worklet');

export interface WorkletHostOptions {
  /** Audio context to use. */
  context: AudioContext;
  /** Number of audio channels (default: 2). */
  channels?: number;
  /** Ring buffer capacity in frames (default: 4096). */
  bufferSize?: number;
  /** Number of automatable parameter slots (default: 256). */
  paramCount?: number;
}

export type WorkletState = 'uninitialized' | 'initializing' | 'ready' | 'playing' | 'stopped' | 'error';

export interface DropoutInfo {
  count: number;
  deficit: number;
  timestamp: number;
}

/** Track which AudioContexts have already registered the processor. */
const _registeredContexts = new WeakSet<AudioContext>();

export class EngineWorkletHost {
  private _ctx: AudioContext;
  private _node: AudioWorkletNode | null = null;
  private _audioBuffer: RingBuffer | null = null;
  private _paramBuffer: ParamBuffer | null = null;
  private _state: WorkletState = 'uninitialized';
  private _channels: number;
  private _bufferSize: number;
  private _paramCount: number;
  private _dropoutCount = 0;
  private _onDropout: ((info: DropoutInfo) => void) | null = null;
  private _onStateChange: ((state: WorkletState) => void) | null = null;

  constructor(options: WorkletHostOptions) {
    this._ctx = options.context;
    this._channels = options.channels ?? 2;
    this._bufferSize = options.bufferSize ?? 4096;
    this._paramCount = options.paramCount ?? 256;
  }

  get state(): WorkletState { return this._state; }
  get node(): AudioWorkletNode | null { return this._node; }
  get audioBuffer(): RingBuffer | null { return this._audioBuffer; }
  get paramBuffer(): ParamBuffer | null { return this._paramBuffer; }
  get dropoutCount(): number { return this._dropoutCount; }

  /** Set callback for dropout events. */
  onDropout(cb: (info: DropoutInfo) => void): void { this._onDropout = cb; }

  /** Set callback for state changes. */
  onStateChange(cb: (state: WorkletState) => void): void { this._onStateChange = cb; }

  /**
   * Check if SharedArrayBuffer is available (requires COOP/COEP headers).
   */
  static isSupported(): boolean {
    return RingBuffer.isSupported() &&
      typeof AudioWorkletNode !== 'undefined';
  }

  /**
   * Initialize the worklet: register processor, create node, allocate buffers.
   * Returns true on success, false if fallback is needed.
   */
  async initialize(): Promise<boolean> {
    if (this._state !== 'uninitialized') {
      return this._state === 'ready' ||
        this._state === 'playing' ||
        this._state === 'stopped';
    }

    this._setState('initializing');

    try {
      // Register the worklet processor (cached per AudioContext)
      if (!_registeredContexts.has(this._ctx)) {
        await this._ctx.audioWorklet.addModule('/engine-worklet-processor.js');
        _registeredContexts.add(this._ctx);
      }

      // Allocate shared buffers
      this._audioBuffer = RingBuffer.create(this._bufferSize, this._channels);
      this._paramBuffer = ParamBuffer.create(this._paramCount);

      // Create the AudioWorkletNode
      this._node = new AudioWorkletNode(this._ctx, 'engine-worklet-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [this._channels],
        processorOptions: { channels: this._channels },
      });

      // Listen for messages from the worklet
      this._node.port.onmessage = (e) => this._handleMessage(e.data);

      // Send shared buffers to the worklet
      this._node.port.postMessage({
        type: 'init',
        audioSab: this._audioBuffer.sharedBuffer,
        paramSab: this._paramBuffer.sharedBuffer,
        paramCount: this._paramCount,
      });

      // Wait for ready confirmation (with timeout)
      await this._waitForReady(3000);

      this._setState('ready');
      return true;
    } catch (err) {
      logger.error('Initialization failed:', err);
      // Clean up partially created resources
      this._node?.disconnect();
      this._node?.port.close();
      this._node = null;
      this._audioBuffer = null;
      this._paramBuffer = null;
      this._setState('error');
      return false;
    }
  }

  /** Start playback — tell the worklet to begin reading from the ring buffer. */
  play(): void {
    if (!this._node || this._state === 'error') return;
    this._node.port.postMessage({ type: 'play' });
    this._setState('playing');
  }

  /** Stop playback — worklet outputs silence. */
  stop(): void {
    if (!this._node || this._state === 'error') return;
    this._node.port.postMessage({ type: 'stop' });
    this._setState('stopped');
  }

  /**
   * Write audio frames to the ring buffer (main thread side).
   * Call this from the rendering loop to feed audio to the worklet.
   */
  writeAudio(data: Float32Array, frames: number): number {
    if (!this._audioBuffer) return 0;
    return this._audioBuffer.write(data, frames);
  }

  /** Write deinterleaved audio to the ring buffer. */
  writeAudioDeinterleaved(channels: Float32Array[], frames: number): number {
    if (!this._audioBuffer) return 0;
    return this._audioBuffer.writeDeinterleaved(channels, frames);
  }

  /** Set a parameter value (delivered atomically to the worklet). */
  setParam(index: number, value: number): void {
    this._paramBuffer?.set(index, value);
  }

  /** Connect the worklet output to a destination node. */
  connect(destination: AudioNode): void {
    this._node?.connect(destination);
  }

  /** Disconnect the worklet output. */
  disconnect(): void {
    this._node?.disconnect();
  }

  /** Dispose all resources. */
  dispose(): void {
    this.stop();
    this._node?.disconnect();
    this._node?.port.close();
    this._node = null;
    this._audioBuffer = null;
    this._paramBuffer = null;
    this._setState('uninitialized');
  }

  private _setState(state: WorkletState): void {
    this._state = state;
    this._onStateChange?.(state);
  }

  private _handleMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'ready':
        // Handled by _waitForReady
        break;
      case 'dropout':
        this._dropoutCount = msg.count as number;
        this._onDropout?.({
          count: msg.count as number,
          deficit: msg.deficit as number,
          timestamp: performance.now(),
        });
        break;
      case 'dropout-count':
        this._dropoutCount = msg.count as number;
        break;
    }
  }

  private _waitForReady(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = this._node!.port;
      const originalHandler = port.onmessage;
      let settled = false;

      const cleanup = () => {
        clearTimeout(timeout);
        port.onmessage = originalHandler;
      };

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Worklet ready timeout'));
      }, timeoutMs);

      port.onmessage = (e) => {
        if (settled) {
          originalHandler?.call(port, e);
          return;
        }

        if (e.data.type === 'ready') {
          settled = true;
          cleanup();
          resolve();
        } else {
          originalHandler?.call(port, e);
        }
      };
    });
  }
}
