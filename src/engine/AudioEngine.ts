import * as Tone from 'tone';
import { TrackNode } from './TrackNode';
import type {
  AudioWarpMarker,
  GainEnvelopePoint,
  MasteringState,
  SequencerPattern,
  TempoEvent,
  TimeSignatureEvent,
} from '../types/project';
import { ensureMasteringState } from '../utils/mastering';
import { applyClipFadeAutomation } from '../utils/clipFade';
import { beatToTime, getBarAtBeat } from '../utils/tempoMap';
import { computeWarpedSegments } from '../utils/audioWarp';

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
  fadeInDuration?: number;
  fadeOutDuration?: number;
  fadeInCurve?: 'linear' | 'exponential' | 'equal-power';
  fadeOutCurve?: 'linear' | 'exponential' | 'equal-power';
  timeStretchRate?: number; // playback rate (1 = normal, 0.5 = half speed, 2 = double)
  gainEnvelope?: GainEnvelopePoint[]; // per-clip volume automation
  warpMarkers?: AudioWarpMarker[]; // flex-time warp markers for audio quantize
}

/**
 * Core audio engine managing AudioContext, track routing, and playback scheduling.
 */
export class AudioEngine {
  ctx: AudioContext;
  masterGain: GainNode;
  trackNodes: Map<string, TrackNode> = new Map();
  scheduledSources: ScheduledSource[] = [];
  private readonly masterInputGain: GainNode;
  private readonly masterDryGain: GainNode;
  private readonly masterProcessedGain: GainNode;
  private readonly masterOutputGain: GainNode;
  private readonly masterInputAnalyser: AnalyserNode;
  private readonly masterOutputAnalyser: AnalyserNode;
  private readonly masterEqLow: BiquadFilterNode;
  private readonly masterEqMid: BiquadFilterNode;
  private readonly masterEqHigh: BiquadFilterNode;
  private readonly masterCompressor: DynamicsCompressorNode;
  private readonly masterLimiter: DynamicsCompressorNode;
  private readonly widthSplitter: ChannelSplitterNode;
  private readonly widthMerger: ChannelMergerNode;
  private readonly widthLeftToLeft: GainNode;
  private readonly widthRightToLeft: GainNode;
  private readonly widthLeftToRight: GainNode;
  private readonly widthRightToRight: GainNode;
  private readonly masterInputAnalyserData: Uint8Array<ArrayBuffer>;
  private readonly masterOutputAnalyserData: Uint8Array<ArrayBuffer>;
  private readonly masterInputTimeDomainData: Float32Array<ArrayBuffer>;
  private readonly masterOutputTimeDomainData: Float32Array<ArrayBuffer>;
  private masterInputClipped = false;
  private masterOutputClipped = false;

  // High-resolution spectrum analyser for the SpectrumAnalyzer component & LUFS metering
  private readonly spectrumAnalyser: AnalyserNode;
  private readonly spectrumFloatData: Float32Array<ArrayBuffer>;
  private readonly spectrumTimeDomainData: Float32Array<ArrayBuffer>;

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
    this.masterInputGain = this.ctx.createGain();
    this.masterDryGain = this.ctx.createGain();
    this.masterProcessedGain = this.ctx.createGain();
    this.masterOutputGain = this.ctx.createGain();
    this.masterGain = this.masterOutputGain;
    this.masterInputAnalyser = this.ctx.createAnalyser();
    this.masterOutputAnalyser = this.ctx.createAnalyser();
    this.masterEqLow = this.ctx.createBiquadFilter();
    this.masterEqMid = this.ctx.createBiquadFilter();
    this.masterEqHigh = this.ctx.createBiquadFilter();
    this.masterCompressor = this.ctx.createDynamicsCompressor();
    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.widthSplitter = this.ctx.createChannelSplitter(2);
    this.widthMerger = this.ctx.createChannelMerger(2);
    this.widthLeftToLeft = this.ctx.createGain();
    this.widthRightToLeft = this.ctx.createGain();
    this.widthLeftToRight = this.ctx.createGain();
    this.widthRightToRight = this.ctx.createGain();

    this.masterEqLow.type = 'lowshelf';
    this.masterEqLow.frequency.value = 120;
    this.masterEqMid.type = 'peaking';
    this.masterEqMid.frequency.value = 1400;
    this.masterEqMid.Q.value = 0.8;
    this.masterEqHigh.type = 'highshelf';
    this.masterEqHigh.frequency.value = 6500;
    this.masterCompressor.threshold.value = -18;
    this.masterCompressor.ratio.value = 1.5;
    this.masterCompressor.attack.value = 0.01;
    this.masterCompressor.release.value = 0.18;
    this.masterCompressor.knee.value = 8;
    this.masterLimiter.threshold.value = -1.2;
    this.masterLimiter.ratio.value = 20;
    this.masterLimiter.attack.value = 0.003;
    this.masterLimiter.release.value = 0.08;
    this.masterLimiter.knee.value = 0;

    this.masterInputAnalyser.fftSize = 256;
    this.masterInputAnalyser.smoothingTimeConstant = 0.6;
    this.masterOutputAnalyser.fftSize = 256;
    this.masterOutputAnalyser.smoothingTimeConstant = 0.6;
    this.masterInputAnalyserData = new Uint8Array(this.masterInputAnalyser.frequencyBinCount);
    this.masterOutputAnalyserData = new Uint8Array(this.masterOutputAnalyser.frequencyBinCount);
    this.masterInputTimeDomainData = new Float32Array(this.masterInputAnalyser.fftSize);
    this.masterOutputTimeDomainData = new Float32Array(this.masterOutputAnalyser.fftSize);

    // High-resolution spectrum analyser (connected after limiter, before output)
    this.spectrumAnalyser = this.ctx.createAnalyser();
    this.spectrumAnalyser.fftSize = 2048;
    this.spectrumAnalyser.smoothingTimeConstant = 0.7;
    this.spectrumFloatData = new Float32Array(this.spectrumAnalyser.frequencyBinCount);
    this.spectrumTimeDomainData = new Float32Array(this.spectrumAnalyser.fftSize);

    this.masterInputGain.connect(this.masterInputAnalyser);
    this.masterInputAnalyser.connect(this.masterDryGain);
    this.masterDryGain.connect(this.masterOutputGain);

    this.masterInputAnalyser.connect(this.masterEqLow);
    this.masterEqLow.connect(this.masterEqMid);
    this.masterEqMid.connect(this.masterEqHigh);
    this.masterEqHigh.connect(this.masterCompressor);
    this.masterCompressor.connect(this.widthSplitter);
    this.widthSplitter.connect(this.widthLeftToLeft, 0);
    this.widthSplitter.connect(this.widthLeftToRight, 0);
    this.widthSplitter.connect(this.widthRightToLeft, 1);
    this.widthSplitter.connect(this.widthRightToRight, 1);
    this.widthLeftToLeft.connect(this.widthMerger, 0, 0);
    this.widthRightToLeft.connect(this.widthMerger, 0, 0);
    this.widthLeftToRight.connect(this.widthMerger, 0, 1);
    this.widthRightToRight.connect(this.widthMerger, 0, 1);
    this.widthMerger.connect(this.masterLimiter);
    this.masterLimiter.connect(this.masterOutputAnalyser);
    this.masterOutputAnalyser.connect(this.masterProcessedGain);
    this.masterProcessedGain.connect(this.masterOutputGain);
    this.masterOutputGain.connect(this.spectrumAnalyser);
    this.spectrumAnalyser.connect(this.ctx.destination);

    this._setMasterWidth(1);
    this.applyMastering(null);

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
      node = new TrackNode(this.ctx, this.masterInputGain);
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

  get masterVolume() { return this.masterOutputGain.gain.value; }
  set masterVolume(v: number) { this.masterOutputGain.gain.value = Math.max(0, Math.min(2, v)); }

  getTrackLevel(trackId: string): number {
    return this.getTrackMeter(trackId).level;
  }

  getTrackMeter(trackId: string): { level: number; clipped: boolean } {
    return this.trackNodes.get(trackId)?.getMeter() ?? { level: 0, clipped: false };
  }

  resetTrackClip(trackId: string) {
    this.trackNodes.get(trackId)?.resetClip();
  }

  getTrackSpectrum(trackId: string): Float32Array<ArrayBuffer> | null {
    return this.trackNodes.get(trackId)?.getSpectrumData() ?? null;
  }

  getMasterLevel(stage: 'input' | 'output'): number {
    return this.getMasterMeter(stage).level;
  }

  getMasterMeter(stage: 'input' | 'output'): { level: number; clipped: boolean } {
    const liveMeter = this._readAnalyserMeter(
      stage === 'input' ? this.masterInputAnalyser : this.masterOutputAnalyser,
      stage === 'input' ? this.masterInputAnalyserData : this.masterOutputAnalyserData,
      stage === 'input' ? this.masterInputTimeDomainData : this.masterOutputTimeDomainData,
    );

    if (stage === 'input') {
      this.masterInputClipped = this.masterInputClipped || liveMeter.clipped;
      return { level: liveMeter.level, clipped: this.masterInputClipped };
    }

    this.masterOutputClipped = this.masterOutputClipped || liveMeter.clipped;
    return { level: liveMeter.level, clipped: this.masterOutputClipped };
  }

  resetMasterClip(stage: 'input' | 'output') {
    if (stage === 'input') {
      this.masterInputClipped = false;
      return;
    }
    this.masterOutputClipped = false;
  }

  /** Get high-resolution spectrum data (dB) for the master output. */
  getMasterSpectrum(): Float32Array<ArrayBuffer> {
    this.spectrumAnalyser.getFloatFrequencyData(this.spectrumFloatData);
    return this.spectrumFloatData;
  }

  /** Get time-domain samples from the master output (for LUFS calculation). */
  getMasterTimeDomainData(): Float32Array<ArrayBuffer> {
    this.spectrumAnalyser.getFloatTimeDomainData(this.spectrumTimeDomainData);
    return this.spectrumTimeDomainData;
  }

  /** Sample rate of the audio context. */
  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  /** Number of frequency bins in the spectrum analyser. */
  get spectrumBinCount(): number {
    return this.spectrumAnalyser.frequencyBinCount;
  }

  applyMastering(mastering: MasteringState | null | undefined) {
    const state = mastering ? ensureMasteringState(mastering) : ensureMasteringState(undefined);
    const active = state.enabled && !state.previewOriginal && state.status === 'ready' && state.analysis;

    this.masterDryGain.gain.value = active ? 0 : 1;
    this.masterProcessedGain.gain.value = active ? 1 : 0;

    const chain = state.chain;
    this.masterEqLow.gain.value = chain.lowShelfGain;
    this.masterEqMid.gain.value = chain.midGain;
    this.masterEqHigh.gain.value = chain.highShelfGain;
    this.masterCompressor.threshold.value = chain.compressorThreshold;
    this.masterCompressor.ratio.value = chain.compressorRatio;
    this.masterLimiter.threshold.value = chain.limiterThreshold;
    this._setMasterWidth(chain.stereoWidth);

    const makeup = active ? Math.pow(10, chain.makeupGain / 20) : 1;
    this.masterProcessedGain.gain.value = active ? makeup : 0;
  }

  private _setMasterWidth(width: number) {
    const clamped = Math.max(0.5, Math.min(1.25, width));
    const same = 0.5 * (1 + clamped);
    const cross = 0.5 * (1 - clamped);
    this.widthLeftToLeft.gain.value = same;
    this.widthRightToLeft.gain.value = cross;
    this.widthLeftToRight.gain.value = cross;
    this.widthRightToRight.gain.value = same;
  }

  private _readAnalyserMeter(
    analyser: AnalyserNode,
    data: Uint8Array<ArrayBuffer>,
    timeData: Float32Array<ArrayBuffer>,
  ): { level: number; clipped: boolean } {
    analyser.getByteFrequencyData(data);
    analyser.getFloatTimeDomainData(timeData);

    let spectralPeak = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > spectralPeak) spectralPeak = data[i];
    }

    let samplePeak = 0;
    for (let i = 0; i < timeData.length; i++) {
      const abs = Math.abs(timeData[i]);
      if (abs > samplePeak) samplePeak = abs;
    }

    return {
      level: Math.max(0, Math.min(1, Math.max(spectralPeak / 255, samplePeak))),
      clipped: samplePeak >= 0.995,
    };
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
      const hasWarpMarkers = clip.warpMarkers && clip.warpMarkers.length > 0;

      if (hasWarpMarkers) {
        this._scheduleWarpedClip(clip, trackNode, fromTime);
      } else {
        this._scheduleStandardClip(clip, trackNode, fromTime);
      }
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


  /**
   * Schedule Web Audio gain automation for a clip's gain envelope.
   * Uses linearRampToValueAtTime between envelope points.
   */
  private _scheduleGainEnvelope(
    gainNode: GainNode,
    points: GainEnvelopePoint[],
    clip: ClipScheduleInfo,
    fromTime: number,
  ) {
    const contextNow = this.ctx.currentTime;
    const clipStart = clip.startTime;
    const seekOffset = Math.max(0, fromTime - clipStart);
    const delay = Math.max(0, clipStart - fromTime);
    const sorted = [...points].sort((a, b) => a.time - b.time);

    const clamp = (v: number) => Math.max(0, Math.min(2, v));

    // Compute initial gain at seek position
    let initialGain = 1;
    if (sorted.length === 1) {
      initialGain = clamp(sorted[0].gain);
    } else if (seekOffset <= sorted[0].time) {
      initialGain = clamp(sorted[0].gain);
    } else if (seekOffset >= sorted[sorted.length - 1].time) {
      initialGain = clamp(sorted[sorted.length - 1].gain);
    } else {
      for (let i = 0; i < sorted.length - 1; i++) {
        if (seekOffset >= sorted[i].time && seekOffset <= sorted[i + 1].time) {
          const t = (seekOffset - sorted[i].time) / (sorted[i + 1].time - sorted[i].time);
          initialGain = clamp(sorted[i].gain + t * (sorted[i + 1].gain - sorted[i].gain));
          break;
        }
      }
    }

    gainNode.gain.setValueAtTime(initialGain, contextNow + delay);

    // Schedule ramps for each point after the seek position
    for (const pt of sorted) {
      const ptContextTime = contextNow + delay + (pt.time - seekOffset);
      if (ptContextTime <= contextNow + delay) continue;
      gainNode.gain.linearRampToValueAtTime(clamp(pt.gain), ptContextTime);
    }
  }

  private _scheduleStandardClip(
    clip: ClipScheduleInfo,
    trackNode: TrackNode,
    fromTime: number,
  ) {
    const source = this.ctx.createBufferSource();
    source.buffer = clip.buffer;

    const envelope = clip.gainEnvelope;
    const hasFades = (clip.fadeInDuration ?? 0) > 0 || (clip.fadeOutDuration ?? 0) > 0;
    const hasEnvelope = Boolean(envelope && envelope.length > 0);
    let outputNode: AudioNode = source;

    if (hasFades) {
      const fadeNode = this.ctx.createGain();
      outputNode.connect(fadeNode);
      outputNode = fadeNode;
      this._scheduleClipFade(fadeNode, clip, fromTime);
    }
    if (hasEnvelope) {
      const gainNode = this.ctx.createGain();
      outputNode.connect(gainNode);
      outputNode = gainNode;
      this._scheduleGainEnvelope(gainNode, envelope!, clip, fromTime);
    }

    outputNode.connect(trackNode.inputGain);

    const rate = clip.timeStretchRate ?? 1;
    if (rate !== 1) {
      source.playbackRate.value = rate;
    }

    const clipEnd = clip.startTime + clip.clipDuration;
    if (clipEnd <= fromTime) return;

    const contextNow = this.ctx.currentTime;
    if (clip.startTime >= fromTime) {
      const delay = clip.startTime - fromTime;
      const bufferDuration = clip.clipDuration * rate;
      source.start(contextNow + delay, clip.audioOffset, bufferDuration);
    } else {
      const seekOffset = fromTime - clip.startTime;
      const remaining = clip.clipDuration - seekOffset;
      const bufferSeek = seekOffset * rate;
      const bufferRemaining = remaining * rate;
      source.start(contextNow, clip.audioOffset + bufferSeek, bufferRemaining);
    }

    this.scheduledSources.push({
      source,
      clipId: clip.clipId,
      trackId: clip.trackId,
      startTime: clip.startTime,
    });
  }

  private _scheduleWarpedClip(
    clip: ClipScheduleInfo,
    trackNode: TrackNode,
    fromTime: number,
  ) {
    const segments = computeWarpedSegments(clip.warpMarkers!, clip.clipDuration);
    const contextNow = this.ctx.currentTime;

    for (const seg of segments) {
      const segTimelineStart = clip.startTime + seg.targetStart;
      const segTimelineEnd = clip.startTime + seg.targetEnd;

      if (segTimelineEnd <= fromTime) continue;

      const source = this.ctx.createBufferSource();
      source.buffer = clip.buffer;
      source.playbackRate.value = seg.playbackRate;
      source.connect(trackNode.inputGain);

      if (segTimelineStart >= fromTime) {
        const delay = segTimelineStart - fromTime;
        const sourceDur = seg.sourceEnd - seg.sourceStart;
        source.start(contextNow + delay, clip.audioOffset + seg.sourceStart, sourceDur);
      } else {
        const elapsedTarget = fromTime - segTimelineStart;
        const targetDur = seg.targetEnd - seg.targetStart;
        const fraction = elapsedTarget / targetDur;
        const sourceDur = seg.sourceEnd - seg.sourceStart;
        const sourceSeek = fraction * sourceDur;
        const sourceRemaining = sourceDur - sourceSeek;
        source.start(contextNow, clip.audioOffset + seg.sourceStart + sourceSeek, sourceRemaining);
      }

      this.scheduledSources.push({
        source,
        clipId: clip.clipId,
        trackId: clip.trackId,
        startTime: segTimelineStart,
      });
    }
  }

  private _scheduleClipFade(
    gainNode: GainNode,
    clip: ClipScheduleInfo,
    fromTime: number,
  ) {
    applyClipFadeAutomation(gainNode.gain, {
      startTime: clip.startTime,
      duration: clip.clipDuration,
      fadeInDuration: clip.fadeInDuration,
      fadeOutDuration: clip.fadeOutDuration,
      fadeInCurve: clip.fadeInCurve,
      fadeOutCurve: clip.fadeOutCurve,
    }, this.ctx.currentTime, fromTime);
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
  scheduleMetronome(
    bpm: number,
    timeSignature: number,
    fromTime: number,
    totalDuration: number,
    tempoMap?: TempoEvent[],
    timeSignatureMap?: TimeSignatureEvent[],
  ) {
    this.stopMetronome();
    const contextNow = this.ctx.currentTime;
    const peakBpm = tempoMap?.reduce((m, e) => Math.max(m, e.bpm), bpm) ?? bpm;
    const maxBeats = Math.ceil((totalDuration / 60) * peakBpm) + 8;

    for (let beat = 0; beat <= maxBeats; beat++) {
      const beatTime = beatToTime(beat, tempoMap, bpm);
      if (beatTime > totalDuration) break;
      if (beatTime < fromTime) continue;

      const delay = beatTime - fromTime;
      const bar = getBarAtBeat(beat, timeSignatureMap, timeSignature);
      const prevBar = beat > 0 ? getBarAtBeat(beat - 1, timeSignatureMap, timeSignature) : 0;
      const isDownbeat = beat === 0 || bar > prevBar;

      const freq = isDownbeat ? 1200 : 800;
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
