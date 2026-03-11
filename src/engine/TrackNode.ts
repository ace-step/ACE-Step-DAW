/**
 * Per-track audio channel strip.
 *
 * Signal chain:
 *   source → inputGain → panNode → eqLow → eqMid → eqHigh
 *          → dryGain ─────────────────────────────────────┐
 *          → convolver → wetGain → reverbOut              |
 *                                       → sumGain → compressor → volumeGain → masterGain
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

  private _volume = 0.8;
  private _muted = false;
  private _soloed = false;
  private _soloActive = false;
  private _reverbMix = 0;
  private _reverbRoomSize = 0.5;

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
    //                               sumGain → compressor → volumeGain → destination
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
    this.volumeGain.connect(destination);

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

  private _applyGain() {
    if (this._muted) {
      this.volumeGain.gain.value = 0;
    } else if (this._soloActive && !this._soloed) {
      this.volumeGain.gain.value = 0;
    } else {
      this.volumeGain.gain.value = this._volume;
    }
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
  }
}
