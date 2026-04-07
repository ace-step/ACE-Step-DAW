/**
 * SpectralEffectNode — TypeScript wrapper for the spectral AudioWorklet processor.
 *
 * Provides a clean API for spectral freeze, blur, filter, and morph effects.
 * Implements IDSPNode-compatible inputNode/outputNode for EffectsEngine integration.
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/963
 */

import type { SpectralMode } from '../types/project';

export type SpectralFFTCallback = (data: Float32Array) => void;

let _processorRegistered = false;

/**
 * Register the spectral AudioWorklet processor. Must be called once per AudioContext.
 */
export async function registerSpectralProcessor(ctx: AudioContext): Promise<void> {
  if (_processorRegistered) return;
  const url = new URL('./worklet/spectral-processor.js', import.meta.url);
  await ctx.audioWorklet.addModule(url.href);
  _processorRegistered = true;
}

/** Reset the registration flag (for tests). */
export function _resetRegistration(): void {
  _processorRegistered = false;
}

export class SpectralEffectNode {
  readonly node: AudioWorkletNode;
  readonly inputNode: AudioNode;
  readonly outputNode: AudioNode;

  private _onFFTData: SpectralFFTCallback | null = null;
  private _disposed = false;

  constructor(ctx: AudioContext, mode: SpectralMode) {
    this.node = new AudioWorkletNode(ctx, 'spectral-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    this.inputNode = this.node;
    this.outputNode = this.node;

    this.node.port.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'fftData' && this._onFFTData) {
        this._onFFTData(msg.data as Float32Array);
      }
    };

    this.setMode(mode);
  }

  /** Set the spectral processing mode. */
  setMode(mode: SpectralMode): void {
    this.node.port.postMessage({ type: 'setMode', mode });
  }

  /** Update effect parameters. */
  setParams(params: Record<string, number | boolean>): void {
    this.node.port.postMessage({ type: 'setParams', params });
  }

  /** Capture the current spectrum as freeze snapshot. */
  captureFreeze(): void {
    this.node.port.postMessage({ type: 'captureFreeze' });
  }

  /** Release the frozen spectrum. */
  releaseFreeze(): void {
    this.node.port.postMessage({ type: 'releaseFreeze' });
  }

  /** Set the spectral filter mask (32 bands, 0–1 each). */
  setFilterMask(mask: number[]): void {
    this.node.port.postMessage({ type: 'setFilterMask', mask });
  }

  /** Capture current spectrum as morph reference. */
  captureMorphReference(): void {
    this.node.port.postMessage({ type: 'captureMorphReference' });
  }

  /** Register a callback for FFT visualization data. */
  set onFFTData(cb: SpectralFFTCallback | null) {
    this._onFFTData = cb;
  }

  /** Connect output to a destination. */
  connect(dest: AudioNode): AudioNode {
    this.outputNode.connect(dest);
    return dest;
  }

  /** Disconnect from all destinations. */
  disconnect(): void {
    try {
      this.outputNode.disconnect();
    } catch {
      /* already disconnected */
    }
  }

  /** Release resources. */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._onFFTData = null;
    this.disconnect();
    this.node.port.close();
  }
}
