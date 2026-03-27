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
  private readonly analyserFloatData: Float32Array<ArrayBuffer>;
  private readonly analyserTimeDomainData: Float32Array<ArrayBuffer>;
  private readonly splitter: ChannelSplitterNode;
  private readonly analyserLeft: AnalyserNode;
  private readonly analyserRight: AnalyserNode;
  private readonly analyserLeftData: Uint8Array<ArrayBuffer>;
  private readonly analyserRightData: Uint8Array<ArrayBuffer>;
  private readonly analyserLeftTimeDomain: Float32Array<ArrayBuffer>;
  private readonly analyserRightTimeDomain: Float32Array<ArrayBuffer>;

  private _volume = 0.8;
  private _muted = false;
  private _soloed = false;
  private _soloActive = false;
  private _reverbMix = 0;
  private _reverbRoomSize = 0.5;
  private _effectsInput: AudioNode | null = null;
  private _effectsOutput: AudioNode | null = null;
  private _clipped = false;
  private latencyCompNode: DelayNode | null = null;

  private static readonly CLIP_THRESHOLD = 0.995;

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
    this.analyserNode.fftSize = 2048;
    this.analyserNode.smoothingTimeConstant = 0.75;
    this.analyserData = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserFloatData = new Float32Array(this.analyserNode.frequencyBinCount);
    this.analyserTimeDomainData = new Float32Array(this.analyserNode.fftSize);

    // Stereo channel splitting for L/R metering
    this.splitter = ctx.createChannelSplitter(2);
    this.analyserLeft = ctx.createAnalyser();
    this.analyserLeft.fftSize = 2048;
    this.analyserLeft.smoothingTimeConstant = 0.75;
    this.analyserRight = ctx.createAnalyser();
    this.analyserRight.fftSize = 2048;
    this.analyserRight.smoothingTimeConstant = 0.75;
    this.analyserLeftData = new Uint8Array(this.analyserLeft.frequencyBinCount);
    this.analyserRightData = new Uint8Array(this.analyserRight.frequencyBinCount);
    this.analyserLeftTimeDomain = new Float32Array(this.analyserLeft.fftSize);
    this.analyserRightTimeDomain = new Float32Array(this.analyserRight.fftSize);

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

    // Stereo metering: volumeGain → splitter → analyserLeft (ch0) / analyserRight (ch1)
    this.volumeGain.connect(this.splitter);
    this.splitter.connect(this.analyserLeft, 0);
    this.splitter.connect(this.analyserRight, 1);

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
    return this.getMeter().level;
  }

  getMeter(): { level: number; leftLevel: number; rightLevel: number; clipped: boolean } {
    this.analyserNode.getByteFrequencyData(this.analyserData);
    this.analyserNode.getFloatTimeDomainData(this.analyserTimeDomainData);

    let spectralPeak = 0;
    for (let i = 0; i < this.analyserData.length; i++) {
      if (this.analyserData[i] > spectralPeak) {
        spectralPeak = this.analyserData[i];
      }
    }

    let samplePeak = 0;
    for (let i = 0; i < this.analyserTimeDomainData.length; i++) {
      const abs = Math.abs(this.analyserTimeDomainData[i]);
      if (abs > samplePeak) samplePeak = abs;
    }

    if (samplePeak >= TrackNode.CLIP_THRESHOLD) {
      this._clipped = true;
    }

    // Per-channel metering
    const leftLevel = this._getChannelLevel(this.analyserLeft, this.analyserLeftData, this.analyserLeftTimeDomain);
    const rightLevel = this._getChannelLevel(this.analyserRight, this.analyserRightData, this.analyserRightTimeDomain);

    // Backward compat: level = max of L/R
    const level = Math.max(leftLevel, rightLevel);

    return { level: Math.max(0, Math.min(1, level)), leftLevel, rightLevel, clipped: this._clipped };
  }

  private _getChannelLevel(
    analyser: AnalyserNode,
    freqData: Uint8Array<ArrayBuffer>,
    timeDomainData: Float32Array<ArrayBuffer>,
  ): number {
    analyser.getByteFrequencyData(freqData);
    analyser.getFloatTimeDomainData(timeDomainData);

    let spectralPeak = 0;
    for (let i = 0; i < freqData.length; i++) {
      if (freqData[i] > spectralPeak) {
        spectralPeak = freqData[i];
      }
    }

    let samplePeak = 0;
    for (let i = 0; i < timeDomainData.length; i++) {
      const abs = Math.abs(timeDomainData[i]);
      if (abs > samplePeak) samplePeak = abs;
    }

    if (samplePeak >= TrackNode.CLIP_THRESHOLD) {
      this._clipped = true;
    }

    return Math.max(0, Math.min(1, Math.max(spectralPeak / 255, samplePeak)));
  }

  resetClip() {
    this._clipped = false;
  }

  getSpectrumData(): Float32Array<ArrayBuffer> {
    this.analyserNode.getFloatFrequencyData(this.analyserFloatData);
    return this.analyserFloatData.slice();
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
  // Latency Compensation (PDC)
  // -----------------------------------------------------------------------

  /**
   * Set latency compensation delay in samples.
   * 0 (or negative) = bypass/remove delay.
   * Inserts a DelayNode between compressor and volumeGain.
   */
  setLatencyCompensation(samples: number, sampleRate: number): void {
    if (samples <= 0) {
      // Bypass: remove delay node if present
      if (this.latencyCompNode) {
        this.compressor.disconnect(this.latencyCompNode);
        this.latencyCompNode.disconnect(this.volumeGain);
        this.compressor.connect(this.volumeGain);
        this.latencyCompNode = null;
      }
      return;
    }

    const delaySec = samples / sampleRate;

    if (this.latencyCompNode) {
      // Update existing delay value
      this.latencyCompNode.delayTime.value = delaySec;
    } else {
      // Create and insert delay node between compressor and volumeGain
      this.latencyCompNode = this.ctx.createDelay(1.0); // max 1 second
      this.latencyCompNode.delayTime.value = delaySec;

      this.compressor.disconnect(this.volumeGain);
      this.compressor.connect(this.latencyCompNode);
      this.latencyCompNode.connect(this.volumeGain);
    }
  }

  // -----------------------------------------------------------------------
  // Aux Sends (pre/post fader routing)
  // -----------------------------------------------------------------------

  private readonly _sends = new Map<string, { gain: GainNode; mode: 'pre' | 'post'; destination: AudioNode }>();

  /**
   * Connect a new aux send from this track to a destination node (e.g. return track inputGain).
   * Pre-fader taps after compressor (before volumeGain); post-fader taps after volumeGain.
   */
  connectSend(sendId: string, destination: AudioNode, amount: number, mode: 'pre' | 'post') {
    // Remove existing send with same ID if present
    this.disconnectSend(sendId);

    const sendGain = this.ctx.createGain();
    sendGain.gain.value = amount;

    const tapPoint = mode === 'pre' ? this.compressor : this.volumeGain;
    tapPoint.connect(sendGain);
    sendGain.connect(destination);

    this._sends.set(sendId, { gain: sendGain, mode, destination });
  }

  /** Disconnect and remove an aux send by ID. */
  disconnectSend(sendId: string) {
    const entry = this._sends.get(sendId);
    if (!entry) return;
    try { entry.gain.disconnect(); } catch { /* already disconnected */ }
    // Disconnect tap point — safe to call even if not connected
    const tapPoint = entry.mode === 'pre' ? this.compressor : this.volumeGain;
    try { tapPoint.disconnect(entry.gain); } catch { /* already disconnected */ }
    this._sends.delete(sendId);
  }

  /** Update the send level (gain amount) of an existing send. */
  updateSendAmount(sendId: string, amount: number) {
    const entry = this._sends.get(sendId);
    if (!entry) return;
    entry.gain.gain.value = amount;
  }

  /** Switch a send between pre-fader and post-fader tap point. */
  updateSendPrePost(sendId: string, mode: 'pre' | 'post') {
    const entry = this._sends.get(sendId);
    if (!entry) return;
    if (entry.mode === mode) return; // no change

    // Disconnect from old tap point
    const oldTap = entry.mode === 'pre' ? this.compressor : this.volumeGain;
    try { oldTap.disconnect(entry.gain); } catch { /* already disconnected */ }

    // Connect to new tap point
    const newTap = mode === 'pre' ? this.compressor : this.volumeGain;
    newTap.connect(entry.gain);

    entry.mode = mode;
  }

  // -----------------------------------------------------------------------

  /**
   * Re-route the final output (analyserNode) to a new destination node.
   * Used for group bus routing — child tracks route to the group's inputGain.
   */
  rerouteOutput(destination: AudioNode) {
    this.analyserNode.disconnect();
    this.analyserNode.connect(destination);
  }

  disconnect() {
    // Disconnect all aux sends
    for (const [sendId] of this._sends) {
      this.disconnectSend(sendId);
    }

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
    if (this.latencyCompNode) {
      this.latencyCompNode.disconnect();
      this.latencyCompNode = null;
    }
    this.volumeGain.disconnect();
    this.analyserNode.disconnect();
    this.splitter.disconnect();
    this.analyserLeft.disconnect();
    this.analyserRight.disconnect();
  }
}
