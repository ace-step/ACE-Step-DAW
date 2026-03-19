import * as Tone from 'tone';
import { TrackNode } from './TrackNode';
import type { MasteringSettings, SequencerPattern } from '../types/project';
import { createDefaultMasteringSettings } from '../utils/mastering';

export interface ScheduledSource {
  source: AudioBufferSourceNode;
  clipId: string;
  trackId: string;
  startTime: number;
}

export interface SequencerScheduleInfo {
  trackId: string;
  pattern: SequencerPattern;
  sampleBuffers: Map<string, AudioBuffer>;
  bpm: number;
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
  masterInput: GainNode;
  masterGain: GainNode;
  trackNodes: Map<string, TrackNode> = new Map();
  scheduledSources: ScheduledSource[] = [];

  private readonly masterDryGain: GainNode;
  private readonly masterWetGain: GainNode;
  private readonly masterLowShelf: BiquadFilterNode;
  private readonly masterPresence: BiquadFilterNode;
  private readonly masterHighShelf: BiquadFilterNode;
  private readonly masterBusCompressor: DynamicsCompressorNode;
  private readonly masterLimiterDrive: GainNode;
  private readonly masterLimiter: WaveShaperNode;
  private readonly masterAnalysisNode: AnalyserNode;
  private readonly masterAnalysisData: Float32Array<ArrayBuffer>;

  private _playing = false;
  private _startedAt = 0;
  private _offset = 0;
  private _rafId: number | null = null;
  private _onTimeUpdate: ((time: number) => void) | null = null;
  private _onEnded: (() => void) | null = null;

  // Stored for re-scheduling on loop
  private _lastClips: ClipScheduleInfo[] = [];
  private _lastTotalDuration = 0;

  // MIDI event scheduler — fires callbacks when currentTime reaches scheduled time
  private _midiEvents: { time: number; callback: () => void; fired: boolean }[] = [];

  // Metronome
  private _metronomeGain: GainNode;
  private _metronomeSources: OscillatorNode[] = [];

  constructor() {
    this.ctx = new AudioContext({ sampleRate: 48000 });
    // Share our AudioContext with Tone.js so EffectsEngine nodes live on the same graph
    Tone.setContext(this.ctx as unknown as Tone.BaseContext);
    this.masterInput = this.ctx.createGain();
    this.masterDryGain = this.ctx.createGain();
    this.masterWetGain = this.ctx.createGain();
    this.masterLowShelf = this.ctx.createBiquadFilter();
    this.masterPresence = this.ctx.createBiquadFilter();
    this.masterHighShelf = this.ctx.createBiquadFilter();
    this.masterBusCompressor = this.ctx.createDynamicsCompressor();
    this.masterLimiterDrive = this.ctx.createGain();
    this.masterLimiter = this.ctx.createWaveShaper();
    this.masterGain = this.ctx.createGain();
    this.masterAnalysisNode = this.ctx.createAnalyser();
    this.masterAnalysisNode.fftSize = 2048;
    this.masterAnalysisNode.smoothingTimeConstant = 0.75;
    this.masterAnalysisData = new Float32Array(this.masterAnalysisNode.fftSize);
    this.masterGain.connect(this.masterAnalysisNode);
    this.masterAnalysisNode.connect(this.ctx.destination);
    this._metronomeGain = this.ctx.createGain();
    this._metronomeGain.gain.value = 0.35;
    this._metronomeGain.connect(this.ctx.destination);

    this.masterLowShelf.type = 'lowshelf';
    this.masterLowShelf.frequency.value = 110;
    this.masterPresence.type = 'peaking';
    this.masterPresence.frequency.value = 2400;
    this.masterPresence.Q.value = 0.8;
    this.masterHighShelf.type = 'highshelf';
    this.masterHighShelf.frequency.value = 7200;
    this.masterLimiter.curve = this.buildSoftClipCurve();
    this.masterLimiter.oversample = '4x';

    this.masterInput.connect(this.masterDryGain);
    this.masterDryGain.connect(this.masterGain);

    this.masterInput.connect(this.masterLowShelf);
    this.masterLowShelf.connect(this.masterPresence);
    this.masterPresence.connect(this.masterHighShelf);
    this.masterHighShelf.connect(this.masterBusCompressor);
    this.masterBusCompressor.connect(this.masterLimiterDrive);
    this.masterLimiterDrive.connect(this.masterLimiter);
    this.masterLimiter.connect(this.masterWetGain);
    this.masterWetGain.connect(this.masterGain);

    this.applyMastering(createDefaultMasteringSettings());
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
      node = new TrackNode(this.ctx, this.masterInput);
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

  applyMastering(settings?: MasteringSettings) {
    const mastering = settings ?? createDefaultMasteringSettings();
    const active = mastering.enabled && !mastering.previewBypassed;

    this.masterDryGain.gain.value = active ? 0 : 1;
    this.masterWetGain.gain.value = active ? 1 : 0;

    if (!active) {
      this.masterLowShelf.gain.value = 0;
      this.masterPresence.gain.value = 0;
      this.masterHighShelf.gain.value = 0;
      this.masterBusCompressor.threshold.value = 0;
      this.masterBusCompressor.ratio.value = 1;
      this.masterBusCompressor.attack.value = 0.003;
      this.masterBusCompressor.release.value = 0.25;
      this.masterBusCompressor.knee.value = 30;
      this.masterLimiterDrive.gain.value = 1;
      return;
    }

    const targetBoost =
      mastering.targetLufs === -8 ? 1.28 :
      mastering.targetLufs === -11 ? 1.18 :
      1.08;

    switch (mastering.preset) {
      case 'loud':
        this.masterLowShelf.gain.value = 1.4;
        this.masterPresence.gain.value = 0.9;
        this.masterHighShelf.gain.value = 1.25;
        this.masterBusCompressor.threshold.value = -24;
        this.masterBusCompressor.ratio.value = 3;
        this.masterBusCompressor.attack.value = 0.006;
        this.masterBusCompressor.release.value = 0.12;
        this.masterBusCompressor.knee.value = 8;
        this.masterLimiterDrive.gain.value = targetBoost * 1.08;
        break;
      case 'warm':
        this.masterLowShelf.gain.value = 2.2;
        this.masterPresence.gain.value = -0.5;
        this.masterHighShelf.gain.value = -0.2;
        this.masterBusCompressor.threshold.value = -20;
        this.masterBusCompressor.ratio.value = 2.2;
        this.masterBusCompressor.attack.value = 0.018;
        this.masterBusCompressor.release.value = 0.2;
        this.masterBusCompressor.knee.value = 12;
        this.masterLimiterDrive.gain.value = targetBoost * 1.02;
        break;
      case 'bright':
        this.masterLowShelf.gain.value = -0.5;
        this.masterPresence.gain.value = 1.1;
        this.masterHighShelf.gain.value = 2.1;
        this.masterBusCompressor.threshold.value = -18;
        this.masterBusCompressor.ratio.value = 2;
        this.masterBusCompressor.attack.value = 0.014;
        this.masterBusCompressor.release.value = 0.16;
        this.masterBusCompressor.knee.value = 10;
        this.masterLimiterDrive.gain.value = targetBoost;
        break;
      case 'balanced':
      default:
        this.masterLowShelf.gain.value = 0.8;
        this.masterPresence.gain.value = 0.45;
        this.masterHighShelf.gain.value = 0.9;
        this.masterBusCompressor.threshold.value = -18;
        this.masterBusCompressor.ratio.value = 1.8;
        this.masterBusCompressor.attack.value = 0.012;
        this.masterBusCompressor.release.value = 0.18;
        this.masterBusCompressor.knee.value = 10;
        this.masterLimiterDrive.gain.value = targetBoost;
        break;
    }
  }

  getTrackLevel(trackId: string): number {
    return this.trackNodes.get(trackId)?.getLevel() ?? 0;
  }

  getMasterLevel(): number {
    this.masterAnalysisNode.getFloatTimeDomainData(this.masterAnalysisData);
    let peak = 0;
    for (let i = 0; i < this.masterAnalysisData.length; i++) {
      peak = Math.max(peak, Math.abs(this.masterAnalysisData[i]));
    }
    return peak;
  }

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

  /**
   * Schedule sequencer pattern playback for a track.
   * The pattern loops from time 0 and tiles across the timeline.
   */
  scheduleSequencer(
    info: SequencerScheduleInfo,
    fromTime: number,
    totalDuration: number,
  ) {
    const { trackId, pattern, sampleBuffers, bpm } = info;
    const trackNode = this.getOrCreateTrackNode(trackId);
    const contextNow = this.ctx.currentTime;

    const stepDuration = (60 / bpm) / (pattern.stepsPerBar / 4);
    const patternDuration = stepDuration * pattern.stepsPerBar * pattern.bars;
    if (patternDuration <= 0) return;

    // Tile the pattern across the timeline
    const startLoop = Math.floor(fromTime / patternDuration);
    const endLoop = Math.ceil(totalDuration / patternDuration);

    for (let loopIdx = startLoop; loopIdx < endLoop; loopIdx++) {
      const loopStartTime = loopIdx * patternDuration;

      for (const row of pattern.rows) {
        if (row.muted) continue;
        const buffer = sampleBuffers.get(row.sampleKey);
        if (!buffer) continue;

        for (let stepIdx = 0; stepIdx < row.steps.length; stepIdx++) {
          const step = row.steps[stepIdx];
          if (!step.active) continue;

          // Apply swing: offset even-indexed steps (1, 3, 5, ...)
          let swingOffset = 0;
          if (pattern.swing > 0 && stepIdx % 2 === 1) {
            swingOffset = stepDuration * pattern.swing * 0.5;
          }

          const stepTime = loopStartTime + stepIdx * stepDuration + swingOffset;
          if (stepTime + buffer.duration <= fromTime) continue;
          if (stepTime >= totalDuration) break;

          const source = this.ctx.createBufferSource();
          source.buffer = buffer;

          // Per-step velocity gain
          const velocityGain = this.ctx.createGain();
          velocityGain.gain.value = step.velocity * row.volume;
          source.connect(velocityGain);
          velocityGain.connect(trackNode.inputGain);

          const delay = stepTime - fromTime;
          if (delay >= 0) {
            source.start(contextNow + delay);
          } else {
            const seekInto = -delay;
            if (seekInto < buffer.duration) {
              source.start(contextNow, seekInto);
            } else {
              continue;
            }
          }

          this.scheduledSources.push({
            source,
            clipId: `seq-${row.id}-${stepIdx}-${loopIdx}`,
            trackId,
            startTime: stepTime,
          });
        }
      }
    }
  }

  /**
   * Schedule a MIDI callback to fire when playback reaches the given time.
   * Uses the same time base as the RAF-driven playhead, so it stays in sync
   * with the Timeline and Piano Roll cursors.
   */
  scheduleMidiEvent(time: number, callback: () => void) {
    this._midiEvents.push({ time, callback, fired: false });
  }

  clearMidiEvents() {
    this._midiEvents = [];
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
        this._midiEvents = [];
        if (this._rafId !== null) {
          cancelAnimationFrame(this._rafId);
          this._rafId = null;
        }
        this._onEnded?.();
        return;
      }

      // Fire any MIDI events whose time has been reached
      for (const evt of this._midiEvents) {
        if (!evt.fired && currentTime >= evt.time) {
          evt.fired = true;
          evt.callback();
        }
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
    this.clearMidiEvents();
  }

  stopAllSources() {
    for (const s of this.scheduledSources) {
      try { s.source.stop(); } catch { /* already stopped */ }
      s.source.disconnect();
    }
    this.scheduledSources = [];
  }

  private buildSoftClipCurve() {
    const samples = 4096;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 2.6) / Math.tanh(2.6);
    }
    return curve;
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

  setTrackVolume(trackId: string, volume: number) {
    const node = this.trackNodes.get(trackId);
    if (node) node.volume = Math.max(0, Math.min(1, volume));
  }

  setTrackPan(trackId: string, pan: number) {
    const node = this.trackNodes.get(trackId);
    if (node) node.pan = pan;
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
