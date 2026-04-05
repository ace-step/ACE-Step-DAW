/**
 * DspWorkerHost — Main-thread controller for the DSP Worker.
 *
 * Manages the lifecycle of a Web Worker that performs DSP rendering,
 * communicates via typed messages, and writes audio to SharedArrayBuffer
 * consumed by the AudioWorklet.
 *
 * Architecture:
 *   Main Thread (DspWorkerHost)
 *     ↕ MessagePort (typed commands)
 *   Worker Thread (dsp-worker.js)
 *     ↕ SharedArrayBuffer (audio + params)
 *   AudioWorklet Thread (engine-worklet-processor.js)
 *
 * Part of Phase 5: Worker Thread DSP Rendering (#1130).
 */

import { RingBuffer } from '../dsp/RingBuffer';
import { ParamBuffer } from '../dsp/ParamBuffer';
import type {
  WorkerCommand,
  WorkerMessage,
  EffectConfig,
} from './DspWorkerProtocol';

export type DspWorkerState = 'idle' | 'initializing' | 'ready' | 'playing' | 'stopped' | 'error';

export interface DspWorkerHostOptions {
  /** Audio context (for sample rate and worklet connection). */
  context: AudioContext;
  /** Number of audio channels (default: 2). */
  channels?: number;
  /** Ring buffer capacity in frames (default: 8192). */
  bufferSize?: number;
  /** Number of automatable parameter slots (default: 256). */
  paramCount?: number;
  /** URL to the worker script (default: '/dsp-worker.js'). */
  workerUrl?: string;
}

export interface CpuStats {
  usage: number;
  renderTimeMs: number;
}

export class DspWorkerHost {
  private _worker: Worker | null = null;
  private _audioBuffer: RingBuffer | null = null;
  private _paramBuffer: ParamBuffer | null = null;
  private _state: DspWorkerState = 'idle';
  private readonly _ctx: AudioContext;
  private readonly _channels: number;
  private readonly _bufferSize: number;
  private readonly _paramCount: number;
  private readonly _workerUrl: string;

  private _onStateChange: ((state: DspWorkerState) => void) | null = null;
  private _onCpu: ((stats: CpuStats) => void) | null = null;
  private _onError: ((msg: string) => void) | null = null;
  private _positionSample = 0;

  constructor(options: DspWorkerHostOptions) {
    this._ctx = options.context;
    this._channels = options.channels ?? 2;
    this._bufferSize = options.bufferSize ?? 8192;
    this._paramCount = options.paramCount ?? 256;
    this._workerUrl = options.workerUrl ?? '/dsp-worker.js';
  }

  get state(): DspWorkerState { return this._state; }
  get audioBuffer(): RingBuffer | null { return this._audioBuffer; }
  get paramBuffer(): ParamBuffer | null { return this._paramBuffer; }
  get position(): number { return this._positionSample; }

  onStateChange(cb: (state: DspWorkerState) => void): void { this._onStateChange = cb; }
  onCpu(cb: (stats: CpuStats) => void): void { this._onCpu = cb; }
  onError(cb: (msg: string) => void): void { this._onError = cb; }

  /**
   * Initialize the DSP Worker and allocate shared buffers.
   */
  async initialize(): Promise<boolean> {
    if (this._state !== 'idle') return false;
    this._setState('initializing');

    try {
      // Allocate shared buffers
      this._audioBuffer = RingBuffer.create(this._bufferSize, this._channels);
      this._paramBuffer = ParamBuffer.create(this._paramCount);

      // Create worker
      this._worker = new Worker(this._workerUrl, { type: 'module' });
      this._worker.onmessage = this._handleMessage.bind(this);
      this._worker.onerror = (e) => {
        this._setState('error');
        this._onError?.(e.message);
      };

      // Send init command
      this._send({
        type: 'init',
        sampleRate: this._ctx.sampleRate,
        channels: this._channels,
        bufferSize: this._bufferSize,
        audioSab: this._audioBuffer.sharedBuffer,
        paramSab: this._paramBuffer.sharedBuffer,
      });

      // Wait for ready message with settled pattern to prevent race conditions
      return new Promise((resolve) => {
        const worker = this._worker!;
        const origHandler = worker.onmessage;
        let settled = false;

        const cleanup = () => {
          clearTimeout(timeout);
          worker.onmessage = origHandler;
        };

        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          worker.terminate();
          if (this._worker === worker) this._worker = null;
          this._setState('error');
          this._onError?.('DSP worker initialization timed out');
          resolve(false);
        }, 5000);

        worker.onmessage = (e: MessageEvent) => {
          if (settled) return;
          const msg = e.data as WorkerMessage;
          if (msg.type === 'ready') {
            settled = true;
            cleanup();
            this._setState('ready');
            resolve(true);
          } else {
            origHandler?.call(worker, e);
            if (msg.type === 'error' || this._state === 'error') {
              settled = true;
              cleanup();
              resolve(false);
            }
          }
        };
      });
    } catch (err) {
      this._setState('error');
      return false;
    }
  }

  /**
   * Start DSP rendering from a specific sample position.
   */
  play(fromSample = 0, bpm = 120): void {
    if (this._state !== 'ready' && this._state !== 'stopped') return;
    this._send({ type: 'play', fromSample, bpm });
    this._setState('playing');
  }

  /**
   * Stop DSP rendering.
   */
  stop(): void {
    if (this._state !== 'playing') return;
    this._send({ type: 'stop' });
    this._setState('stopped');
  }

  /**
   * Seek to a specific sample position.
   */
  seek(toSample: number): void {
    this._send({ type: 'seek', toSample });
    this._positionSample = toSample;
  }

  /**
   * Set an automatable parameter value.
   */
  setParam(index: number, value: number): void {
    if (this._paramBuffer) {
      this._paramBuffer.set(index, value);
    }
  }

  /**
   * Add a track to the DSP graph.
   */
  addTrack(trackId: string, effects: EffectConfig[]): void {
    this._send({ type: 'add-track', trackId, effects });
  }

  /**
   * Remove a track from the DSP graph.
   */
  removeTrack(trackId: string): void {
    this._send({ type: 'remove-track', trackId });
  }

  /**
   * Update an effect's parameters.
   */
  updateEffect(trackId: string, effectIndex: number, params: Record<string, number>): void {
    this._send({ type: 'update-effect', trackId, effectIndex, params });
  }

  /**
   * Schedule a note-on event.
   */
  noteOn(trackId: string, note: number, velocity: number, sampleTime: number): void {
    this._send({ type: 'note-on', trackId, note, velocity, sampleTime });
  }

  /**
   * Schedule a note-off event.
   */
  noteOff(trackId: string, note: number, sampleTime: number): void {
    this._send({ type: 'note-off', trackId, note, sampleTime });
  }

  /**
   * Dispose of the worker and free resources.
   */
  dispose(): void {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    this._audioBuffer = null;
    this._paramBuffer = null;
    this._setState('idle');
  }

  private _send(cmd: WorkerCommand): void {
    this._worker?.postMessage(cmd);
  }

  private _handleMessage(e: MessageEvent): void {
    const msg = e.data as WorkerMessage;
    switch (msg.type) {
      case 'position':
        this._positionSample = msg.sample;
        break;
      case 'cpu':
        this._onCpu?.(msg);
        break;
      case 'error':
        this._setState('error');
        this._onError?.(msg.message);
        break;
    }
  }

  private _setState(state: DspWorkerState): void {
    this._state = state;
    this._onStateChange?.(state);
  }
}
