import { TrackNode } from './TrackNode';

export interface ScheduledSource {
  source: AudioBufferSourceNode;
  clipId: string;
  trackId: string;
  startTime: number;
}

export interface ClipScheduleInfo {
  clipId: string;
  trackId: string;
  startTime: number;
  buffer: AudioBuffer;
  audioOffset: number;   // offset into the buffer (crop start)
  clipDuration: number;  // how long to play (crop length)
}

/**
 * Core audio engine managing AudioContext, track routing, and playback scheduling.
 */
export class AudioEngine {
  ctx: AudioContext;
  masterGain: GainNode;
  trackNodes: Map<string, TrackNode> = new Map();
  scheduledSources: ScheduledSource[] = [];

  private _playing = false;
  private _startedAt = 0;
  private _offset = 0;
  private _rafId: number | null = null;
  private _onTimeUpdate: ((time: number) => void) | null = null;
  private _onEnded: (() => void) | null = null;

  // Stored for re-scheduling on loop
  private _lastClips: ClipScheduleInfo[] = [];
  private _lastTotalDuration = 0;

  // Metronome
  private _metronomeGain: GainNode;
  private _metronomeSources: OscillatorNode[] = [];

  constructor() {
    this.ctx = new AudioContext({ sampleRate: 48000 });
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this._metronomeGain = this.ctx.createGain();
    this._metronomeGain.gain.value = 0.35;
    this._metronomeGain.connect(this.ctx.destination);
  }

  async resume() {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  setTimeUpdateCallback(cb: (time: number) => void) {
    this._onTimeUpdate = cb;
  }

  setOnEndedCallback(cb: () => void) {
    this._onEnded = cb;
  }

  getOrCreateTrackNode(trackId: string): TrackNode {
    let node = this.trackNodes.get(trackId);
    if (!node) {
      node = new TrackNode(this.ctx, this.masterGain);
      this.trackNodes.set(trackId, node);
    }
    return node;
  }

  removeTrackNode(trackId: string) {
    const node = this.trackNodes.get(trackId);
    if (node) {
      node.disconnect();
      this.trackNodes.delete(trackId);
    }
  }

  get masterVolume() { return this.masterGain.gain.value; }
  set masterVolume(v: number) { this.masterGain.gain.value = Math.max(0, Math.min(2, v)); }

  updateSoloState() {
    const anySoloed = Array.from(this.trackNodes.values()).some((n) => n.soloed);
    for (const node of this.trackNodes.values()) {
      node.soloActive = anySoloed;
    }
  }

  schedulePlayback(
    clips: ClipScheduleInfo[],
    fromTime: number,
    totalDuration: number,
  ) {
    this.stopAllSources();

    // Store for loop re-scheduling
    this._lastClips = clips;
    this._lastTotalDuration = totalDuration;

    for (const clip of clips) {
      const trackNode = this.getOrCreateTrackNode(clip.trackId);
      const source = this.ctx.createBufferSource();
      source.buffer = clip.buffer;
      source.connect(trackNode.inputGain);

      const clipEnd = clip.startTime + clip.clipDuration;
      if (clipEnd <= fromTime) continue;

      const contextNow = this.ctx.currentTime;
      if (clip.startTime >= fromTime) {
        // Clip hasn't started: schedule with delay, start from audioOffset
        const delay = clip.startTime - fromTime;
        source.start(contextNow + delay, clip.audioOffset, clip.clipDuration);
      } else {
        // Clip already started: seek into it
        const seekOffset = fromTime - clip.startTime;
        const remaining = clip.clipDuration - seekOffset;
        source.start(contextNow, clip.audioOffset + seekOffset, remaining);
      }

      this.scheduledSources.push({
        source,
        clipId: clip.clipId,
        trackId: clip.trackId,
        startTime: clip.startTime,
      });
    }

    this._playing = true;
    this._startedAt = this.ctx.currentTime;
    this._offset = fromTime;
    this._startTimeUpdate(totalDuration);
  }

  private _startTimeUpdate(totalDuration: number) {
    const tick = () => {
      if (!this._playing) return;
      const elapsed = this.ctx.currentTime - this._startedAt;
      const currentTime = this._offset + elapsed;

      if (currentTime >= totalDuration) {
        // Reached end — notify listener (transport handles loop vs stop)
        this.stopAllSources();
        this._playing = false;
        if (this._rafId !== null) {
          cancelAnimationFrame(this._rafId);
          this._rafId = null;
        }
        this._onEnded?.();
        return;
      }

      this._onTimeUpdate?.(currentTime);
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  stop() {
    this._playing = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this.stopAllSources();
    this.stopMetronome();
  }

  stopAllSources() {
    for (const s of this.scheduledSources) {
      try { s.source.stop(); } catch { /* already stopped */ }
      s.source.disconnect();
    }
    this.scheduledSources = [];
  }

  get playing() { return this._playing; }

  getCurrentTime(): number {
    if (!this._playing) return this._offset;
    return this._offset + (this.ctx.currentTime - this._startedAt);
  }

  /**
   * Schedule metronome clicks at every beat from `fromTime` to `totalDuration`.
   * Beat 1 of each bar gets a higher-pitched click (accent).
   */
  scheduleMetronome(bpm: number, timeSignature: number, fromTime: number, totalDuration: number) {
    this.stopMetronome();
    const beatDuration = 60 / bpm;
    const contextNow = this.ctx.currentTime;
    const firstBeatIdx = Math.ceil(fromTime / beatDuration);
    const lastBeatIdx = Math.floor(totalDuration / beatDuration);

    for (let i = firstBeatIdx; i <= lastBeatIdx; i++) {
      const beatTime = i * beatDuration;
      const delay = beatTime - fromTime;
      if (delay < 0) continue;

      const isAccent = (i % timeSignature) === 0;
      const freq = isAccent ? 1200 : 800;
      const clickDuration = 0.03;

      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(1, contextNow + delay);
      env.gain.exponentialRampToValueAtTime(0.001, contextNow + delay + clickDuration);

      osc.connect(env);
      env.connect(this._metronomeGain);

      osc.start(contextNow + delay);
      osc.stop(contextNow + delay + clickDuration + 0.01);
      this._metronomeSources.push(osc);
    }
  }

  stopMetronome() {
    for (const osc of this._metronomeSources) {
      try { osc.stop(); } catch { /* already stopped */ }
      osc.disconnect();
    }
    this._metronomeSources = [];
  }

  async decodeAudioData(blob: Blob): Promise<AudioBuffer> {
    const arrayBuffer = await blob.arrayBuffer();
    return this.ctx.decodeAudioData(arrayBuffer);
  }

  dispose() {
    this.stop();
    for (const node of this.trackNodes.values()) {
      node.disconnect();
    }
    this.trackNodes.clear();
    this.ctx.close();
  }
}
