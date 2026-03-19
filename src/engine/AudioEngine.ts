import * as Tone from 'tone';
import { TrackNode } from './TrackNode';
import type { SequencerPattern } from '../types/project';

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
  /** Fade-in duration in seconds applied to the gain node (0 = no fade). */
  fadeIn?: number;
  /** Fade-out duration in seconds applied to the gain node (0 = no fade). */
  fadeOut?: number;
  /** Curve shape for fades (default 'equal-power'). */
  fadeCurve?: 'linear' | 'equal-power';
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

  // MIDI event scheduler — fires callbacks when currentTime reaches scheduled time
  private _midiEvents: { time: number; callback: () => void; fired: boolean }[] = [];

  // Metronome
  private _metronomeGain: GainNode;
  private _metronomeSources: OscillatorNode[] = [];

  // Cached equal-power fade curves (128 samples, sin/cos shapes).
  private static readonly _EP_FADE_IN  = AudioEngine._buildEPCurve('in');
  private static readonly _EP_FADE_OUT = AudioEngine._buildEPCurve('out');

  private static _buildEPCurve(direction: 'in' | 'out'): Float32Array {
    const STEPS = 128;
    const values = new Float32Array(STEPS);
    for (let i = 0; i < STEPS; i++) {
      const t = i / (STEPS - 1);
      values[i] = direction === 'in' ? Math.sin(t * Math.PI / 2) : Math.cos(t * Math.PI / 2);
    }
    return values;
  }

  constructor() {
    this.ctx = new AudioContext({ sampleRate: 48000 });
    // Share our AudioContext with Tone.js so EffectsEngine nodes live on the same graph
    Tone.setContext(this.ctx as unknown as Tone.BaseContext);
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

  getTrackLevel(trackId: string): number {
    return this.trackNodes.get(trackId)?.getLevel() ?? 0;
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

      const clipEnd = clip.startTime + clip.clipDuration;
      if (clipEnd <= fromTime) continue;

      const contextNow = this.ctx.currentTime;

      // Build per-clip fade gain node so fades are independent of the track fader.
      const fadeIn  = clip.fadeIn  ?? 0;
      const fadeOut = clip.fadeOut ?? 0;
      const curve   = clip.fadeCurve ?? 'equal-power';

      if (fadeIn > 0 || fadeOut > 0) {
        const fadeGain = this.ctx.createGain();
        source.connect(fadeGain);
        fadeGain.connect(trackNode.inputGain);

        if (clip.startTime >= fromTime) {
          // Clip hasn't started yet.
          const clipContextStart = contextNow + (clip.startTime - fromTime);
          const clipContextEnd   = contextNow + (clipEnd - fromTime);

          if (fadeIn > 0) {
            const fadeInEnd = clipContextStart + Math.min(fadeIn, clip.clipDuration);
            fadeGain.gain.setValueAtTime(0, clipContextStart);
            this._rampGain(fadeGain.gain, curve, 0, 1, clipContextStart, fadeInEnd);
          }

          if (fadeOut > 0) {
            const fadeOutStart = clipContextEnd - Math.min(fadeOut, clip.clipDuration);
            fadeGain.gain.setValueAtTime(1, fadeOutStart);
            this._rampGain(fadeGain.gain, curve, 1, 0, fadeOutStart, clipContextEnd);
          }
        } else {
          // Clip already started: seek into it.
          const seekOffset  = fromTime - clip.startTime;
          const contextEnd  = contextNow + (clipEnd - fromTime);

          // Fade-in: compute gain at the seek point.
          if (fadeIn > 0 && seekOffset < fadeIn) {
            const t = seekOffset / fadeIn;
            const startGain = curve === 'equal-power' ? Math.sin(t * Math.PI / 2) : t;
            const fadeInEnd = contextNow + (fadeIn - seekOffset);
            fadeGain.gain.setValueAtTime(startGain, contextNow);
            this._rampGain(fadeGain.gain, curve, startGain, 1, contextNow, fadeInEnd);
          }

          // Fade-out.
          if (fadeOut > 0) {
            const fadeOutStart = contextEnd - Math.min(fadeOut, clip.clipDuration);
            fadeGain.gain.setValueAtTime(1, fadeOutStart);
            this._rampGain(fadeGain.gain, curve, 1, 0, fadeOutStart, contextEnd);
          }
        }
      } else {
        source.connect(trackNode.inputGain);
      }

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
   * Apply a gain ramp (linear or equal-power) between two AudioContext times.
   * Equal-power uses a sine/cosine curve approximated with a value array for smooth
   * DAW-style crossfades.
   */
  private _rampGain(
    gain: AudioParam,
    curve: 'linear' | 'equal-power',
    fromValue: number,
    toValue: number,
    startTime: number,
    endTime: number,
  ) {
    const duration = endTime - startTime;
    if (duration <= 0) {
      gain.setValueAtTime(toValue, startTime);
      return;
    }
    if (curve === 'linear') {
      gain.linearRampToValueAtTime(toValue, endTime);
    } else {
      // Equal-power curve: use pre-computed sin/cos lookup for perceptually constant loudness.
      const cachedCurve = fromValue < toValue
        ? AudioEngine._EP_FADE_IN
        : AudioEngine._EP_FADE_OUT;
      gain.setValueCurveAtTime(cachedCurve, startTime, duration);
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
