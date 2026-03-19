/**
 * Per-track audio channel strip.
 *
 * Signal chain:
 *   source → inputGain → panNode → eqLow → eqMid → eqHigh
 *          → dryGain ─────────────────────────────────────┐
 *          → convolver → wetGain → reverbOut              |
 *                                       → sumGain → compressor → volumeGain → analyserNode → masterGain
 */
export class TrackNode {
  readonly inputGain: GainNode;
  private readonly panNode: StereoPannerNode;
  private readonly eqLow: BiquadFilterNode;
  private readonly eqMid: BiquadFilterNode;
  private readonly eqHigh: BiquadFilterNode;
  private readonly dryGain: GainNode;
  private readonly convolver: ConvolverNode;
  private readonly wetGain: GainNode;
  private readonly sumGain: GainNode;
  private readonly compressor: DynamicsCompressorNode;
  readonly volumeGain: GainNode;
  private readonly analyserNode: AnalyserNode;
  private readonly analyserData: Uint8Array<ArrayBuffer>;

  private _volume = 0.8;
  private _muted = false;
  private _soloed = false;
  private _soloActive = false;
  private _reverbMix = 0;
  private _reverbRoomSize = 0.5;
  private _effectsInput: AudioNode | null = null;
  private _effectsOutput: AudioNode | null = null;

  constructor(private ctx: AudioContext, destination: AudioNode) {
    this.inputGain  = ctx.createGain();
    this.panNode    = ctx.createStereoPanner();
    this.eqLow      = ctx.createBiquadFilter();
    this.eqMid      = ctx.createBiquadFilter();
    this.eqHigh     = ctx.createBiquadFilter();
    this.dryGain    = ctx.createGain();
    this.convolver  = ctx.createConvolver();
    this.wetGain    = ctx.createGain();
    this.sumGain    = ctx.createGain();
    this.compressor = ctx.createDynamicsCompressor();
    this.volumeGain = ctx.createGain();
    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.6;
    this.analyserData = new Uint8Array(this.analyserNode.frequencyBinCount);

    // Configure EQ defaults
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 250;
    this.eqLow.gain.value = 0;

    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1000;
    this.eqMid.Q.value = 1;
    this.eqMid.gain.value = 0;

    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 8000;
    this.eqHigh.gain.value = 0;

    // Compressor defaults — start in "bypass" state (ratio=1, threshold=0 → no effect)
    this.compressor.threshold.value = 0;
    this.compressor.ratio.value = 1;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;
    this.compressor.knee.value = 30;

    // Reverb defaults — dry pass-through only
    this.dryGain.gain.value = 1;
    this.wetGain.gain.value = 0;

    // Wire the chain:
    //   inputGain → pan → eqLow → eqMid → eqHigh
    //                                    ↓
    //                               dryGain → sumGain
    //                               convolver → wetGain → sumGain
    //                               sumGain → compressor → volumeGain → analyserNode → destination
    this.inputGain.connect(this.panNode);
    this.panNode.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);

    this.eqHigh.connect(this.dryGain);
    this.eqHigh.connect(this.convolver);

    this.dryGain.connect(this.sumGain);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.sumGain);

    this.sumGain.connect(this.compressor);
    this.compressor.connect(this.volumeGain);
    this.volumeGain.connect(this.analyserNode);
    this.analyserNode.connect(destination);

    this.volumeGain.gain.value = this._volume;

    // Generate default (silent) reverb IR so the convolver never stalls
    this._buildImpulseResponse(this._reverbRoomSize);
  }

  // -----------------------------------------------------------------------
  // Volume / Mute / Solo
  // -----------------------------------------------------------------------

  get volume() { return this._volume; }
  set volume(v: number) { this._volume = v; this._applyGain(); }

  get muted() { return this._muted; }
  set muted(v: boolean) { this._muted = v; this._applyGain(); }

  get soloed() { return this._soloed; }
  set soloed(v: boolean) { this._soloed = v; this._applyGain(); }

  set soloActive(v: boolean) { this._soloActive = v; this._applyGain(); }

  /** Fade duration in seconds to avoid audio clicks on mute/unmute. */
  static readonly MUTE_FADE_SEC = 0.005;

  private _applyGain() {
    let target: number;
    if (this._muted) {
      target = 0;
    } else if (this._soloActive && !this._soloed) {
      target = 0;
    } else {
      target = this._volume;
    }
    const now = this.ctx.currentTime;
    this.volumeGain.gain.cancelScheduledValues(now);
    this.volumeGain.gain.setValueAtTime(this.volumeGain.gain.value, now);
    this.volumeGain.gain.linearRampToValueAtTime(target, now + TrackNode.MUTE_FADE_SEC);
  }

  // -----------------------------------------------------------------------
  // Pan
  // -----------------------------------------------------------------------

  set pan(v: number) {
    this.panNode.pan.value = Math.max(-1, Math.min(1, v));
  }

  // -----------------------------------------------------------------------
  // EQ
  // -----------------------------------------------------------------------

  set eqLowGain(dB: number) { this.eqLow.gain.value = dB; }
  set eqMidGain(dB: number) { this.eqMid.gain.value = dB; }
  set eqHighGain(dB: number) { this.eqHigh.gain.value = dB; }

  // -----------------------------------------------------------------------
  // Compressor
  // -----------------------------------------------------------------------

  set compressorEnabled(v: boolean) {
    if (!v) {
      this.compressor.threshold.value = 0;
      this.compressor.ratio.value = 1;
    }
  }

  set compressorThreshold(dB: number) {
    this.compressor.threshold.value = Math.max(-60, Math.min(0, dB));
  }

  set compressorRatio(ratio: number) {
    this.compressor.ratio.value = Math.max(1, Math.min(20, ratio));
  }

  getLevel(): number {
    this.analyserNode.getByteFrequencyData(this.analyserData);

    let peak = 0;
    for (let i = 0; i < this.analyserData.length; i++) {
      if (this.analyserData[i] > peak) {
        peak = this.analyserData[i];
      }
    }

    return peak / 255;
  }

  /**
   * Apply all compressor settings at once, enabling or bypassing cleanly.
   */
  applyCompressor(enabled: boolean, threshold: number, ratio: number) {
    if (enabled) {
      this.compressor.threshold.value = Math.max(-60, Math.min(0, threshold));
      this.compressor.ratio.value = Math.max(1, Math.min(20, ratio));
    } else {
      this.compressor.threshold.value = 0;
      this.compressor.ratio.value = 1;
    }
  }

  // -----------------------------------------------------------------------
  // Reverb
  // -----------------------------------------------------------------------

  /**
   * Set reverb wet/dry mix and room size.
   * @param mix - 0 (fully dry) to 1 (fully wet)
   * @param roomSize - 0 to 1, controls IR decay length (~0.3s–2s)
   */
  setReverb(mix: number, roomSize: number) {
    const clampedMix = Math.max(0, Math.min(1, mix));
    const clampedRoom = Math.max(0, Math.min(1, roomSize));
    this._reverbMix = clampedMix;
    this._reverbRoomSize = clampedRoom;
    this.dryGain.gain.value = 1 - clampedMix;
    this.wetGain.gain.value = clampedMix;
    this._buildImpulseResponse(clampedRoom);
  }

  /** Generate a synthetic exponential-decay white-noise IR. */
  private _buildImpulseResponse(roomSize: number) {
    const sampleRate = this.ctx.sampleRate;
    const durationSec = 0.3 + roomSize * 1.7; // 0.3s – 2s
    const length = Math.floor(sampleRate * durationSec);
    const ir = this.ctx.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const decay = Math.exp(-3 * (i / length));
        data[i] = (Math.random() * 2 - 1) * decay;
      }
    }
    this.convolver.buffer = ir;
  }

  // -----------------------------------------------------------------------

  /**
   * Splice an external effects chain (from EffectsEngine) between eqHigh and dryGain/convolver.
   * Pass null/null to remove effects and restore the direct path.
   */
  spliceEffects(input: AudioNode | null, output: AudioNode | null) {
    // Disconnect current splice point
    try { this.eqHigh.disconnect(this.dryGain); } catch {}
    try { this.eqHigh.disconnect(this.convolver); } catch {}

    if (this._effectsOutput) {
      try { this._effectsOutput.disconnect(this.dryGain); } catch {}
      try { this._effectsOutput.disconnect(this.convolver); } catch {}
    }

    if (input && output) {
      this.eqHigh.connect(input);
      output.connect(this.dryGain);
      output.connect(this.convolver);
    } else {
      // Restore direct path
      this.eqHigh.connect(this.dryGain);
      this.eqHigh.connect(this.convolver);
    }

    this._effectsInput = input;
    this._effectsOutput = output;
  }

  // -----------------------------------------------------------------------

  disconnect() {
    this.inputGain.disconnect();
    this.panNode.disconnect();
    this.eqLow.disconnect();
    this.eqMid.disconnect();
    this.eqHigh.disconnect();
    this.dryGain.disconnect();
    this.convolver.disconnect();
    this.wetGain.disconnect();
    this.sumGain.disconnect();
    this.compressor.disconnect();
    this.volumeGain.disconnect();
    this.analyserNode.disconnect();
  }
}
