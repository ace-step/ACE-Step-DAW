/**
 * WasmEffectNode — TypeScript wrapper for WASM-powered AudioWorklet effects.
 *
 * Provides the same interface as EffectsEngine effect nodes, but routes
 * audio through the Rust DSP engine via WASM in an AudioWorkletProcessor.
 */
import { createDebugLogger } from '../../utils/debugLogger';

const logger = createDebugLogger('ace-step:wasm-effect-node');

export interface WasmMeterData {
  rmsL: number;
  rmsR: number;
  peakL: number;
  peakR: number;
}

export type MeterCallback = (data: WasmMeterData) => void;

/**
 * Check if WASM AudioWorklet is supported in this browser.
 */
export function isWasmAudioSupported(): boolean {
  return (
    typeof AudioWorkletNode !== 'undefined' &&
    typeof WebAssembly !== 'undefined' &&
    typeof WebAssembly.instantiate === 'function'
  );
}

/**
 * Register the WASM effect processor in an AudioContext.
 * Must be called once before creating WasmEffectNode instances.
 */
export async function registerWasmProcessor(
  ctx: AudioContext
): Promise<void> {
  const processorUrl = new URL('./wasm-effect-processor.js', import.meta.url);
  await ctx.audioWorklet.addModule(processorUrl.href);
}

/**
 * WASM-powered audio effect node.
 *
 * Wraps an AudioWorkletNode that runs Rust DSP via WASM.
 * Provides parameter control and metering via MessagePort.
 */
export class WasmEffectNode {
  readonly node: AudioWorkletNode;
  readonly input: AudioNode;
  readonly output: AudioNode;

  private _ready = false;
  private _readyPromise: Promise<void>;
  private _onMeter: MeterCallback | null = null;

  constructor(
    ctx: AudioContext,
    effectType: string,
    params: Record<string, number> = {}
  ) {
    this.node = new AudioWorkletNode(ctx, 'wasm-effect-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    this.input = this.node;
    this.output = this.node;

    // Set up ready promise
    this._readyPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WasmEffectNode init timeout (5s)'));
      }, 5000);

      this.node.port.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        switch (msg.type) {
          case 'ready':
            this._ready = true;
            clearTimeout(timeout);
            resolve();
            break;
          case 'meter':
            if (this._onMeter) {
              this._onMeter(msg as WasmMeterData);
            }
            break;
          case 'error':
            logger.error(msg.message);
            break;
        }
      };
    });

    // Initialize — tell the worklet to load WASM
    const wasmUrl = new URL('/wasm/ace_dsp_wasm_bg.wasm', window.location.origin).href;
    this.node.port.postMessage({
      type: 'init',
      wasmUrl,
      effectType,
      params,
    });
  }

  /** Wait for the WASM module to load and initialize. */
  async whenReady(): Promise<void> {
    return this._readyPromise;
  }

  get isReady(): boolean {
    return this._ready;
  }

  /** Update a single parameter. */
  setParam(paramId: string, value: number): void {
    this.node.port.postMessage({ type: 'param', paramId, value });
  }

  /** Update multiple parameters at once. */
  setParams(params: Record<string, number>): void {
    for (const [key, val] of Object.entries(params)) {
      this.setParam(key, val);
    }
  }

  /** Reset the effect state (e.g., on seek). */
  reset(): void {
    this.node.port.postMessage({ type: 'reset' });
  }

  /** Subscribe to metering data (RMS, peak levels). */
  onMeter(callback: MeterCallback | null): void {
    this._onMeter = callback;
  }

  /** Connect this node's output to a destination. */
  connect(destination: AudioNode): AudioNode {
    return this.node.connect(destination);
  }

  /** Disconnect this node. */
  disconnect(): void {
    this.node.disconnect();
  }

  /** Clean up resources. */
  dispose(): void {
    this._onMeter = null;
    this.node.port.close();
    this.node.disconnect();
  }
}
