/**
 * Return bus (aux) node — receives post-fader send signals from TrackNodes,
 * processes them through an optional effects chain, and routes to masterGain.
 *
 * Signal chain:
 *   inputGain → faderGain → analyserNode → masterGain
 */
export class ReturnBusNode {
  readonly inputGain: GainNode;
  private readonly faderGain: GainNode;
  private readonly panNode: StereoPannerNode;
  private readonly analyserNode: AnalyserNode;
  private readonly analyserData: Uint8Array<ArrayBuffer>;

  private _volume = 1;
  private _muted = false;

  constructor(private ctx: AudioContext, destination: AudioNode) {
    this.inputGain = ctx.createGain();
    this.faderGain = ctx.createGain();
    this.panNode = ctx.createStereoPanner();
    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.6;
    this.analyserData = new Uint8Array(this.analyserNode.frequencyBinCount);

    this.faderGain.gain.value = this._volume;

    this.inputGain.connect(this.faderGain);
    this.faderGain.connect(this.panNode);
    this.panNode.connect(this.analyserNode);
    this.analyserNode.connect(destination);
  }

  get volume() { return this._volume; }
  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    this._applyGain();
  }

  get muted() { return this._muted; }
  set muted(v: boolean) {
    this._muted = v;
    this._applyGain();
  }

  set pan(v: number) {
    this.panNode.pan.value = Math.max(-1, Math.min(1, v));
  }

  private _applyGain() {
    this.faderGain.gain.value = this._muted ? 0 : this._volume;
  }

  getLevel(): number {
    this.analyserNode.getByteFrequencyData(this.analyserData);
    let peak = 0;
    for (let i = 0; i < this.analyserData.length; i++) {
      if (this.analyserData[i] > peak) peak = this.analyserData[i];
    }
    return peak / 255;
  }

  disconnect() {
    this.inputGain.disconnect();
    this.faderGain.disconnect();
    this.panNode.disconnect();
    this.analyserNode.disconnect();
  }
}
