/**
 * WasmDspEngine — TypeScript orchestration layer for the Rust WASM DSP engine.
 *
 * Creates AudioWorkletNodes that run the WASM DSP processor and provides
 * a high-level API for parameter control via MessagePort.
 *
 * Usage:
 *   const engine = new WasmDspEngine();
 *   await engine.initialize(audioContext);
 *   const node = engine.createProcessor('track-1');
 *   node.setGain(0.8);
 *   node.setFilter(0, 1000, 0.707, 0); // lowpass at 1kHz
 */

/** Filter type constants matching the Rust BiquadType enum. */
export const FilterType = {
  Lowpass: 0,
  Highpass: 1,
  Bandpass: 2,
  Notch: 3,
  Allpass: 4,
  Peaking: 5,
  LowShelf: 6,
  HighShelf: 7,
} as const;

export type FilterTypeValue = (typeof FilterType)[keyof typeof FilterType];

/** Wrapper around an AudioWorkletNode running the WASM DSP processor. */
export interface WasmDspNode {
  /** The underlying AudioWorkletNode for audio graph connection. */
  readonly audioNode: AudioWorkletNode;

  /** Set gain (linear scale, 0.0 to ~2.0). */
  setGain(gain: number): void;

  /** Enable a biquad filter. */
  setFilter(
    filterType: FilterTypeValue,
    frequency: number,
    q: number,
    gainDb: number
  ): void;

  /** Disable the filter. */
  disableFilter(): void;

  /** Enable a delay effect. */
  setDelay(delayMs: number, feedback: number, wet: number): void;

  /** Update delay parameters. */
  setDelayParams(delayMs: number, feedback: number, wet: number, dry: number): void;

  /** Disable the delay. */
  disableDelay(): void;

  /** Enable compressor. */
  setCompressor(
    thresholdDb: number,
    ratio: number,
    attackMs: number,
    releaseMs: number,
    kneeDb: number,
    makeupDb: number
  ): void;

  /** Disable the compressor. */
  disableCompressor(): void;

  /** Enable noise gate. */
  setGate(
    thresholdDb: number,
    attackMs: number,
    holdMs: number,
    releaseMs: number,
    rangeDb: number
  ): void;

  /** Disable the noise gate. */
  disableGate(): void;

  /** Set a parametric EQ band (0-7). */
  setEqBand(
    bandIndex: number,
    filterType: FilterTypeValue,
    frequency: number,
    q: number,
    gainDb: number,
    enabled: boolean
  ): void;

  /** Disable parametric EQ entirely. */
  disableEq(): void;

  /** Enable reverb effect. */
  setReverb(roomSize: number, damping: number, wet: number, dry: number): void;

  /** Disable the reverb. */
  disableReverb(): void;

  /** Reset processor state (on seek/stop). */
  reset(): void;

  /** Clean up resources. */
  dispose(): void;
}

export class WasmDspEngine {
  private _initialized = false;
  private _wasmBytes: ArrayBuffer | null = null;
  private _workletRegistered = false;
  private _nodes = new Map<string, WasmDspNode>();

  /** Whether the engine has been initialized. */
  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * Initialize the engine: fetch WASM binary and register the AudioWorklet.
   * Must be called once before creating any processors.
   */
  async initialize(audioContext: AudioContext): Promise<void> {
    if (this._initialized) return;

    // Fetch the WASM binary
    const wasmUrl = new URL(
      '/ace_dsp_wasm_bg.wasm',
      window.location.origin
    ).href;
    const response = await fetch(wasmUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch WASM binary: ${response.status}`);
    }
    this._wasmBytes = await response.arrayBuffer();

    // Register the AudioWorklet processor
    if (!this._workletRegistered) {
      await audioContext.audioWorklet.addModule('/wasm-dsp-processor.js');
      this._workletRegistered = true;
    }

    this._initialized = true;
  }

  /**
   * Create a WASM DSP processor node for a track.
   * Returns a WasmDspNode with high-level parameter control.
   */
  createProcessor(
    audioContext: AudioContext,
    trackId: string
  ): WasmDspNode {
    if (!this._initialized || !this._wasmBytes) {
      throw new Error('WasmDspEngine not initialized. Call initialize() first.');
    }

    // Dispose existing node for this track if any
    this._nodes.get(trackId)?.dispose();

    const workletNode = new AudioWorkletNode(
      audioContext,
      'wasm-dsp-processor',
      {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      }
    );

    // Send WASM binary to the worklet for initialization
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('WASM init timeout')),
        5000
      );
      workletNode.port.onmessage = (event: MessageEvent) => {
        if (event.data.type === 'ready') {
          clearTimeout(timeout);
          resolve();
        } else if (event.data.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(event.data.message));
        }
      };
    });

    workletNode.port.postMessage(
      {
        type: 'init',
        wasmBytes: this._wasmBytes.slice(0), // Copy to transfer
        sampleRate: audioContext.sampleRate,
      },
      // Don't transfer — keep original for reuse
    );

    const node: WasmDspNode = {
      audioNode: workletNode,

      setGain(gain: number) {
        workletNode.port.postMessage({ type: 'set-gain', value: gain });
      },

      setFilter(
        filterType: FilterTypeValue,
        frequency: number,
        q: number,
        gainDb: number
      ) {
        workletNode.port.postMessage({
          type: 'set-filter',
          filterType,
          frequency,
          q,
          gainDb,
        });
      },

      disableFilter() {
        workletNode.port.postMessage({ type: 'disable-filter' });
      },

      setDelay(delayMs: number, feedback: number, wet: number) {
        workletNode.port.postMessage({
          type: 'set-delay',
          delayMs,
          feedback,
          wet,
        });
      },

      setDelayParams(
        delayMs: number,
        feedback: number,
        wet: number,
        dry: number
      ) {
        workletNode.port.postMessage({
          type: 'set-delay-params',
          delayMs,
          feedback,
          wet,
          dry,
        });
      },

      disableDelay() {
        workletNode.port.postMessage({ type: 'disable-delay' });
      },

      setCompressor(
        thresholdDb: number,
        ratio: number,
        attackMs: number,
        releaseMs: number,
        kneeDb: number,
        makeupDb: number
      ) {
        workletNode.port.postMessage({
          type: 'set-compressor',
          thresholdDb,
          ratio,
          attackMs,
          releaseMs,
          kneeDb,
          makeupDb,
        });
      },

      disableCompressor() {
        workletNode.port.postMessage({ type: 'disable-compressor' });
      },

      setGate(
        thresholdDb: number,
        attackMs: number,
        holdMs: number,
        releaseMs: number,
        rangeDb: number
      ) {
        workletNode.port.postMessage({
          type: 'set-gate',
          thresholdDb,
          attackMs,
          holdMs,
          releaseMs,
          rangeDb,
        });
      },

      disableGate() {
        workletNode.port.postMessage({ type: 'disable-gate' });
      },

      setEqBand(
        bandIndex: number,
        filterType: FilterTypeValue,
        frequency: number,
        q: number,
        gainDb: number,
        enabled: boolean
      ) {
        workletNode.port.postMessage({
          type: 'set-eq-band',
          bandIndex,
          filterType,
          frequency,
          q,
          gainDb,
          enabled,
        });
      },

      disableEq() {
        workletNode.port.postMessage({ type: 'disable-eq' });
      },

      setReverb(roomSize: number, damping: number, wet: number, dry: number) {
        workletNode.port.postMessage({
          type: 'set-reverb',
          roomSize,
          damping,
          wet,
          dry,
        });
      },

      disableReverb() {
        workletNode.port.postMessage({ type: 'disable-reverb' });
      },

      reset() {
        workletNode.port.postMessage({ type: 'reset' });
      },

      dispose() {
        workletNode.port.postMessage({ type: 'reset' });
        workletNode.disconnect();
      },
    };

    this._nodes.set(trackId, node);

    // Log initialization (async, don't block)
    readyPromise.catch((err) => {
      console.warn(`[WasmDspEngine] WASM init failed for ${trackId}:`, err);
    });

    return node;
  }

  /** Get an existing processor node by track ID. */
  getProcessor(trackId: string): WasmDspNode | undefined {
    return this._nodes.get(trackId);
  }

  /** Dispose a specific track's processor. */
  disposeProcessor(trackId: string): void {
    const node = this._nodes.get(trackId);
    if (node) {
      node.dispose();
      this._nodes.delete(trackId);
    }
  }

  /** Dispose all processors and reset engine state. */
  dispose(): void {
    for (const [, node] of this._nodes) {
      node.dispose();
    }
    this._nodes.clear();
    this._initialized = false;
    this._wasmBytes = null;
  }
}

/** Singleton instance. */
export const wasmDspEngine = new WasmDspEngine();
