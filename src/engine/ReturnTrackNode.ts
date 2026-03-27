/**
 * Audio channel strip for return (aux) tracks.
 *
 * Signal chain:
 *   inputGain → [effects splice] → volumeGain → panNode → analyserNode → destination
 *
 * Simpler than TrackNode: no EQ, compressor, or reverb (those come from
 * EffectsEngine if the user adds insert effects to the return track).
 */
export class ReturnTrackNode {
  readonly inputGain: GainNode;
  private readonly volumeGain: GainNode;
  private readonly panNode: StereoPannerNode;
  private readonly analyserNode: AnalyserNode;
  private readonly analyserData: Uint8Array<ArrayBuffer>;
  private readonly analyserTimeDomainData: Float32Array<ArrayBuffer>;
  private readonly splitter: ChannelSplitterNode;
  private readonly analyserLeft: AnalyserNode;
  private readonly analyserRight: AnalyserNode;
  private readonly analyserLeftData: Uint8Array<ArrayBuffer>;
  private readonly analyserRightData: Uint8Array<ArrayBuffer>;
  private readonly analyserLeftTimeDomain: Float32Array<ArrayBuffer>;
  private readonly analyserRightTimeDomain: Float32Array<ArrayBuffer>;

  private _volume = 1;
  private _muted = false;
  private _clipped = false;
  private _effectsInput: AudioNode | null = null;
  private _effectsOutput: AudioNode | null = null;

  /** Fade duration in seconds to avoid audio clicks. */
  static readonly MUTE_FADE_SEC = 0.005;
  private static readonly CLIP_THRESHOLD = 0.995;

  constructor(private ctx: AudioContext, destination: AudioNode) {
    this.inputGain = ctx.createGain();
    this.volumeGain = ctx.createGain();
    this.panNode = ctx.createStereoPanner();
    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.analyserNode.smoothingTimeConstant = 0.75;
    this.analyserData = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserTimeDomainData = new Float32Array(this.analyserNode.fftSize);

    // Stereo metering
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

    // Wire: inputGain → volumeGain → panNode → analyserNode → destination
    this.inputGain.connect(this.volumeGain);
    this.volumeGain.connect(this.panNode);
    this.panNode.connect(this.analyserNode);
    this.analyserNode.connect(destination);

    // Stereo metering tap
    this.panNode.connect(this.splitter);
    this.splitter.connect(this.analyserLeft, 0);
    this.splitter.connect(this.analyserRight, 1);
  }

  // -----------------------------------------------------------------------
  // Volume / Mute
  // -----------------------------------------------------------------------

  get volume() { return this._volume; }
  set volume(v: number) { this._volume = v; this._applyGain(); }

  get muted() { return this._muted; }
  set muted(v: boolean) { this._muted = v; this._applyGain(); }

  private _applyGain() {
    const target = this._muted ? 0 : this._volume;
    const now = this.ctx.currentTime;
    this.volumeGain.gain.cancelScheduledValues(now);
    this.volumeGain.gain.setValueAtTime(this.volumeGain.gain.value, now);
    this.volumeGain.gain.linearRampToValueAtTime(target, now + ReturnTrackNode.MUTE_FADE_SEC);
  }

  // -----------------------------------------------------------------------
  // Pan
  // -----------------------------------------------------------------------

  set pan(v: number) {
    this.panNode.pan.value = Math.max(-1, Math.min(1, v));
  }

  // -----------------------------------------------------------------------
  // Effects splice
  // -----------------------------------------------------------------------

  /**
   * Splice an external effects chain between inputGain and volumeGain.
   * Pass null/null to remove effects and restore the direct path.
   */
  spliceEffects(input: AudioNode | null, output: AudioNode | null) {
    try { this.inputGain.disconnect(this.volumeGain); } catch { /* noop */ }

    if (this._effectsOutput) {
      try { this._effectsOutput.disconnect(this.volumeGain); } catch { /* noop */ }
    }

    if (input && output) {
      this.inputGain.connect(input);
      output.connect(this.volumeGain);
    } else {
      this.inputGain.connect(this.volumeGain);
    }

    this._effectsInput = input;
    this._effectsOutput = output;
  }

  // -----------------------------------------------------------------------
  // Metering
  // -----------------------------------------------------------------------

  getMeter(): { level: number; leftLevel: number; rightLevel: number; clipped: boolean } {
    this.analyserNode.getByteFrequencyData(this.analyserData);
    this.analyserNode.getFloatTimeDomainData(this.analyserTimeDomainData);

    let spectralPeak = 0;
    for (let i = 0; i < this.analyserData.length; i++) {
      if (this.analyserData[i] > spectralPeak) spectralPeak = this.analyserData[i];
    }

    let samplePeak = 0;
    for (let i = 0; i < this.analyserTimeDomainData.length; i++) {
      const abs = Math.abs(this.analyserTimeDomainData[i]);
      if (abs > samplePeak) samplePeak = abs;
    }

    if (samplePeak >= ReturnTrackNode.CLIP_THRESHOLD) this._clipped = true;

    const leftLevel = this._getChannelLevel(this.analyserLeft, this.analyserLeftData, this.analyserLeftTimeDomain);
    const rightLevel = this._getChannelLevel(this.analyserRight, this.analyserRightData, this.analyserRightTimeDomain);
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
      if (freqData[i] > spectralPeak) spectralPeak = freqData[i];
    }

    let samplePeak = 0;
    for (let i = 0; i < timeDomainData.length; i++) {
      const abs = Math.abs(timeDomainData[i]);
      if (abs > samplePeak) samplePeak = abs;
    }

    if (samplePeak >= ReturnTrackNode.CLIP_THRESHOLD) this._clipped = true;

    return Math.max(0, Math.min(1, Math.max(spectralPeak / 255, samplePeak)));
  }

  resetClip() { this._clipped = false; }

  // -----------------------------------------------------------------------

  disconnect() {
    this.inputGain.disconnect();
    this.volumeGain.disconnect();
    this.panNode.disconnect();
    this.analyserNode.disconnect();
    this.splitter.disconnect();
    this.analyserLeft.disconnect();
    this.analyserRight.disconnect();
    if (this._effectsOutput) {
      try { this._effectsOutput.disconnect(); } catch { /* noop */ }
    }
  }
}
