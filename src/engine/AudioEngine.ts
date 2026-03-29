import * as Tone from 'tone';
import { TrackNode } from './TrackNode';
import { ReturnTrackNode } from './ReturnTrackNode';
import type {
  AudioWarpMarker,
  GainEnvelopePoint,
  MasteringState,
  ReturnTrack,
  Send,
  SequencerPattern,
  TempoEvent,
  TimeSignatureEvent,
  Track,
} from '../types/project';
import { ensureMasteringState } from '../utils/mastering';
import { applyClipFadeAutomation } from '../utils/clipFade';
import { beatToTime, getBeatAtBar, getTimeSignatureAtBar, getTimeSignatureBeatLength } from '../utils/tempoMap';
import { computeWarpedSegments } from '../utils/audioWarp';
import { loadAudioBlobByKey } from '../services/audioFileManager';
import { readAudioContextPlaybackLatency } from '../utils/playbackLatency';
import { getScrubPlaybackRate, getScrubSliceWindow, getScrubSourceOffset } from '../utils/scrub';

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

export interface TimelineScrubClip {
  clipId: string;
  trackId: string;
  startTime: number;
  clipDuration: number;
  audioOffset: number;
  timeStretchRate: number;
  bufferKey: string;
}

export interface TimelineScrubTrackState {
  id: string;
  volume: number;
  muted: boolean;
  soloed: boolean;
  pan?: number;
  eqLowGain?: number;
  eqMidGain?: number;
  eqHighGain?: number;
  compressorEnabled?: boolean;
  compressorThreshold?: number;
  compressorRatio?: number;
  reverbMix?: number;
  reverbRoomSize?: number;
  parentTrackId?: string | null;
  isGroup?: boolean;
}

/**
 * Core audio engine managing AudioContext, track routing, and playback scheduling.
 */
export class AudioEngine {
  /** Lookahead time in seconds — audio events are scheduled this far ahead of playback. */
  static readonly LOOK_AHEAD = 0.1;

  ctx: AudioContext;
  masterGain: GainNode;
  trackNodes: Map<string, TrackNode> = new Map();
  returnTrackNodes: Map<string, ReturnTrackNode> = new Map();
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
  private _playbackLatencyCompensation = 0;

  // Stored for re-scheduling on loop
  private _lastClips: ClipScheduleInfo[] = [];
  private _lastTotalDuration = 0;

  // MIDI event scheduler — fires callbacks when currentTime reaches scheduled time
  private _midiEvents: { time: number; callback: () => void; fired: boolean }[] = [];

  // Metronome
  private _metronomeGain: GainNode;
  private _metronomeSources: OscillatorNode[] = [];
  private readonly scrubGain: GainNode;
  private scrubOscillator: OscillatorNode | null = null;
  private scrubFilter: BiquadFilterNode | null = null;
  private scrubTimelineSources: AudioBufferSourceNode[] = [];
  private scrubRequestId = 0;
  private readonly decodedBufferCache = new Map<string, AudioBuffer>();
  private readonly decodedBufferPromises = new Map<string, Promise<AudioBuffer | null>>();
  private scrubTrackStateHash = '';

  // Video recording: MediaStream tap from master output
  private _mediaStreamDest: MediaStreamAudioDestinationNode | null = null;

  constructor() {
    this.ctx = new AudioContext({ sampleRate: 48000 });
    this._playbackLatencyCompensation = (this.ctx.outputLatency ?? 0) + (this.ctx.baseLatency ?? 0);
    // Share our AudioContext with Tone.js so EffectsEngine nodes live on the same graph
    Tone.setContext(this.ctx as unknown as Tone.BaseContext);
    // Configure Tone.js lookahead for stable scheduling under UI load
    try { Tone.getContext().lookAhead = AudioEngine.LOOK_AHEAD; } catch { /* test env */ }
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
    this.scrubGain = this.ctx.createGain();
    this.scrubGain.gain.value = 0;
    this.scrubGain.connect(this.ctx.destination);
    this.refreshPlaybackLatencyCompensation();
  }

  async resume() {
    if (this.ctx.state !== 'running') {
      await this.ctx.resume();
    }
  }

  async previewMetronomeClick(accent = false) {
    await this.resume();
    const now = this.ctx.currentTime;
    const freq = accent ? 1200 : 800;
    const clickDuration = 0.03;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(1, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + clickDuration);

    osc.connect(env);
    env.connect(this._metronomeGain);

    osc.start(now);
    osc.stop(now + clickDuration + 0.01);

    osc.addEventListener('ended', () => {
      osc.disconnect();
      env.disconnect();
    }, { once: true });
  }

  setTimeUpdateCallback(cb: (time: number) => void) {
    this._onTimeUpdate = cb;
  }

  measurePlaybackLatency() {
    return readAudioContextPlaybackLatency(this.ctx);
  }

  refreshPlaybackLatencyCompensation() {
    const measured = this.measurePlaybackLatency();
    this._playbackLatencyCompensation = Math.max(
      0,
      (measured.baseLatency ?? 0) + (measured.outputLatency ?? 0),
    );
    return measured;
  }

  setOnEndedCallback(cb: () => void) {
    this._onEnded = cb;
  }

  startScrubPreview() {
    if (this.scrubOscillator) return;

    const oscillator = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 900;
    oscillator.connect(filter);
    filter.connect(this.scrubGain);
    oscillator.start();

    this.scrubOscillator = oscillator;
    this.scrubFilter = filter;
  }

  updateScrubPreview(rate: number) {
    this.startScrubPreview();
    const now = this.ctx.currentTime;
    const magnitude = Math.min(1, Math.abs(rate));
    const direction = rate >= 0 ? 1 : -1;
    const frequency = 480 + magnitude * 1900 + (direction < 0 ? -120 : 0);
    const gain = magnitude > 0.02 ? 0.015 + magnitude * 0.07 : 0;

    this.scrubOscillator?.frequency.cancelScheduledValues(now);
    this.scrubOscillator?.frequency.linearRampToValueAtTime(frequency, now + 0.02);
    this.scrubFilter?.frequency.cancelScheduledValues(now);
    this.scrubFilter?.frequency.linearRampToValueAtTime(700 + magnitude * 2400, now + 0.02);
    this.scrubGain.gain.cancelScheduledValues(now);
    this.scrubGain.gain.linearRampToValueAtTime(gain, now + 0.015);
  }

  stopScrubPreview() {
    const now = this.ctx.currentTime;
    this.scrubGain.gain.cancelScheduledValues(now);
    this.scrubGain.gain.linearRampToValueAtTime(0, now + 0.02);

    if (this.scrubOscillator) {
      const oscillator = this.scrubOscillator;
      const filter = this.scrubFilter;
      this.scrubOscillator = null;
      this.scrubFilter = null;
      try { oscillator.stop(now + 0.03); } catch { /* already stopped */ }
      globalThis.setTimeout(() => {
        oscillator.disconnect();
        filter?.disconnect();
      }, 60);
    }
  }

  private async _getDecodedBuffer(key: string) {
    const cached = this.decodedBufferCache.get(key);
    if (cached) return cached;

    const inflight = this.decodedBufferPromises.get(key);
    if (inflight) return inflight;

    const decodePromise = (async () => {
      const blob = await loadAudioBlobByKey(key);
      if (!blob) return null;

      const buffer = await this.decodeAudioData(blob);
      this.decodedBufferCache.set(key, buffer);
      return buffer;
    })();

    this.decodedBufferPromises.set(key, decodePromise);

    try {
      return await decodePromise;
    } finally {
      this.decodedBufferPromises.delete(key);
    }
  }

  private _stopTimelineScrubSources() {
    for (const source of this.scrubTimelineSources) {
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
    }
    this.scrubTimelineSources = [];
  }

  private _getScrubTrackStateHash(projectTracks: TimelineScrubTrackState[]) {
    return JSON.stringify(projectTracks.map((track) => ({
      id: track.id,
      volume: track.volume,
      muted: track.muted,
      soloed: track.soloed,
      pan: track.pan ?? 0,
      eqLowGain: track.eqLowGain ?? 0,
      eqMidGain: track.eqMidGain ?? 0,
      eqHighGain: track.eqHighGain ?? 0,
      compressorEnabled: track.compressorEnabled ?? false,
      compressorThreshold: track.compressorThreshold ?? -24,
      compressorRatio: track.compressorRatio ?? 4,
      reverbMix: track.reverbMix ?? 0,
      reverbRoomSize: track.reverbRoomSize ?? 0.5,
      parentTrackId: track.parentTrackId ?? null,
      isGroup: track.isGroup ?? false,
    })));
  }

  private _syncTrackNodesForScrub(projectTracks: TimelineScrubTrackState[]) {
    for (const track of projectTracks.filter((candidate) => candidate.isGroup)) {
      this.getOrCreateTrackNode(track.id);
    }

    for (const track of projectTracks) {
      const trackNode = this.getOrCreateTrackNode(track.id);
      trackNode.volume = track.volume;
      trackNode.muted = track.muted;
      trackNode.soloed = track.soloed;
      trackNode.pan = track.pan ?? 0;
      trackNode.eqLowGain = track.eqLowGain ?? 0;
      trackNode.eqMidGain = track.eqMidGain ?? 0;
      trackNode.eqHighGain = track.eqHighGain ?? 0;
      trackNode.applyCompressor(
        track.compressorEnabled ?? false,
        track.compressorThreshold ?? -24,
        track.compressorRatio ?? 4,
      );
      trackNode.setReverb(track.reverbMix ?? 0, track.reverbRoomSize ?? 0.5);
      this.setTrackGroupRouting(track.id, track.parentTrackId ?? null);
    }

    this.updateSoloState();
  }

  private _syncTrackNodesForScrubIfNeeded(projectTracks: TimelineScrubTrackState[]) {
    const nextHash = this._getScrubTrackStateHash(projectTracks);
    if (nextHash === this.scrubTrackStateHash) return;

    this._syncTrackNodesForScrub(projectTracks);
    this.scrubTrackStateHash = nextHash;
  }

  async startTimelineScrub(
    projectTracks: TimelineScrubTrackState[],
    clips: TimelineScrubClip[],
    time: number,
    previewRate: number,
  ) {
    this._syncTrackNodesForScrubIfNeeded(projectTracks);
    await this.updateTimelineScrub(projectTracks, clips, time, previewRate);
  }

  async updateTimelineScrub(
    projectTracks: TimelineScrubTrackState[],
    clips: TimelineScrubClip[],
    time: number,
    previewRate: number,
  ) {
    this.scrubRequestId += 1;
    const requestId = this.scrubRequestId;
    this._syncTrackNodesForScrubIfNeeded(projectTracks);
    this._stopTimelineScrubSources();

    const overlappingClips = clips
      .filter((clip) => time >= clip.startTime && time <= clip.startTime + clip.clipDuration)
      .slice(0, 6);

    if (overlappingClips.length === 0) return;

    const scrubPlaybackRate = getScrubPlaybackRate(previewRate);
    const scrubWindow = getScrubSliceWindow(previewRate);
    const startedAt = this.ctx.currentTime + 0.003;

    await Promise.all(overlappingClips.map(async (clip) => {
      const buffer = await this._getDecodedBuffer(clip.bufferKey);
      if (!buffer || requestId !== this.scrubRequestId) return;

      const trackNode = this.getOrCreateTrackNode(clip.trackId);
      const source = this.ctx.createBufferSource();
      const totalPlaybackRate = Math.max(0.25, Math.min(4, scrubPlaybackRate * Math.max(0.1, clip.timeStretchRate)));
      const sourceOffset = getScrubSourceOffset({
        clipStartTime: clip.startTime,
        clipDuration: clip.clipDuration,
        timelineTime: time,
        previewRate,
        audioOffset: clip.audioOffset,
        timeStretchRate: clip.timeStretchRate,
      });
      const maxSourceDuration = Math.max(0, buffer.duration - sourceOffset);
      const sourceDuration = Math.min(maxSourceDuration, Math.max(0.03, scrubWindow * totalPlaybackRate));

      if (sourceDuration <= 0.001) return;

      source.buffer = buffer;
      source.playbackRate.value = totalPlaybackRate;
      source.connect(trackNode.inputGain);
      source.start(startedAt, sourceOffset, sourceDuration);
      this.scrubTimelineSources.push(source);
    }));
  }

  stopTimelineScrub() {
    this.scrubRequestId += 1;
    this._stopTimelineScrubSources();
    this.scrubTrackStateHash = '';
  }

  getOrCreateTrackNode(trackId: string): TrackNode {
    let node = this.trackNodes.get(trackId);
    if (!node) {
      node = new TrackNode(this.ctx, this.masterInputGain);
      this.trackNodes.set(trackId, node);
    }
    return node;
  }

  /**
   * Route a child track's output through its parent group's TrackNode.
   * Call this after creating/updating track group assignments.
   */
  setTrackGroupRouting(trackId: string, groupId: string | null) {
    const trackNode = this.trackNodes.get(trackId);
    if (!trackNode) return;

    if (groupId) {
      const groupNode = this.getOrCreateTrackNode(groupId);
      trackNode.rerouteOutput(groupNode.inputGain);
    } else {
      trackNode.rerouteOutput(this.masterInputGain);
    }
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

  setPlaybackLatencyCompensation(seconds: number) {
    this._playbackLatencyCompensation = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  }

  getPlaybackLatencyCompensation(): number {
    return this._playbackLatencyCompensation;
  }

  getTrackLevel(trackId: string): number {
    return this.getTrackMeter(trackId).level;
  }

  getTrackMeter(trackId: string): { level: number; leftLevel: number; rightLevel: number; clipped: boolean } {
    return this.trackNodes.get(trackId)?.getMeter() ?? { level: 0, leftLevel: 0, rightLevel: 0, clipped: false };
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
    _data: Uint8Array<ArrayBuffer>,
    timeData: Float32Array<ArrayBuffer>,
  ): { level: number; clipped: boolean } {
    analyser.getFloatTimeDomainData(timeData);

    let samplePeak = 0;
    for (let i = 0; i < timeData.length; i++) {
      const abs = Math.abs(timeData[i]);
      if (abs > samplePeak) samplePeak = abs;
    }

    return {
      level: Math.max(0, Math.min(1, samplePeak)),
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

      // Fire MIDI events with lookahead — schedule them ahead of the
      // playback cursor so audio thread has time to process them.
      this.fireMidiEventsForTime(currentTime);

      // Send latency-compensated time to the visual playhead so it
      // aligns with what the listener actually hears through speakers.
      const compensatedTime = Math.max(0, currentTime - this._playbackLatencyCompensation);
      this._onTimeUpdate?.(compensatedTime);
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
    this.stopScrubPreview();
    this.stopTimelineScrub();
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

  /** Returns the configured lookahead time in seconds. */
  getLookAhead(): number {
    return AudioEngine.LOOK_AHEAD;
  }

  /**
   * Returns the current playback time compensated for output latency,
   * so the visual playhead matches what the listener actually hears.
   */
  getCompensatedTime(): number {
    const raw = this.getCurrentTime();
    return Math.max(0, raw - this._playbackLatencyCompensation);
  }

  /**
   * Fire scheduled MIDI events whose time falls within the lookahead window.
   * Called from the RAF tick with the current timeline position.
   */
  fireMidiEventsForTime(currentTime: number) {
    const threshold = currentTime + AudioEngine.LOOK_AHEAD;
    for (const evt of this._midiEvents) {
      if (!evt.fired && threshold >= evt.time) {
        evt.fired = true;
        evt.callback();
      }
    }
  }

  /**
   * Schedule metronome clicks at every beat from `fromTime` to `totalDuration`.
   * Beat 1 of each bar gets a higher-pitched click (accent).
   */
  scheduleMetronome(
    bpm: number,
    timeSignature: number,
    timeSignatureDenominator: number,
    fromTime: number,
    totalDuration: number,
    tempoMap?: TempoEvent[],
    timeSignatureMap?: TimeSignatureEvent[],
  ) {
    this.stopMetronome();
    const contextNow = this.ctx.currentTime;
    for (let bar = 1; bar <= 999; bar++) {
      const barBeat = getBeatAtBar(bar, timeSignatureMap, timeSignature, timeSignatureDenominator);
      const barTime = beatToTime(barBeat, tempoMap, bpm);
      if (barTime > totalDuration) break;

      const meter = getTimeSignatureAtBar(timeSignatureMap, bar, timeSignature, timeSignatureDenominator);
      const beatLength = getTimeSignatureBeatLength(meter.denominator);

      for (let beatIndex = 0; beatIndex < meter.numerator; beatIndex++) {
        const beatTime = beatToTime(barBeat + (beatIndex * beatLength), tempoMap, bpm);
        if (beatTime > totalDuration) break;
        if (beatTime < fromTime) continue;

        const delay = beatTime - fromTime;
        const freq = beatIndex === 0 ? 1200 : 800;
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

  /**
   * Returns a MediaStream carrying the master audio output.
   * Used by the video recorder to capture DAW audio alongside screen video.
   * Lazily creates a MediaStreamAudioDestinationNode connected in parallel
   * to the existing output — no impact on playback volume or routing.
   */
  getAudioStream(): MediaStream {
    if (!this._mediaStreamDest) {
      this._mediaStreamDest = this.ctx.createMediaStreamDestination();
      this.masterOutputGain.connect(this._mediaStreamDest);
    }
    return this._mediaStreamDest.stream;
  }

  /** Disconnects the media stream tap created by getAudioStream(). */
  disposeAudioStream(): void {
    if (this._mediaStreamDest) {
      try {
        this.masterOutputGain.disconnect(this._mediaStreamDest);
      } catch {
        // already disconnected
      }
      this._mediaStreamDest = null;
    }
  }

  // -----------------------------------------------------------------------
  // Return Track Nodes & Send Routing
  // -----------------------------------------------------------------------

  getOrCreateReturnTrackNode(returnTrackId: string): ReturnTrackNode {
    let node = this.returnTrackNodes.get(returnTrackId);
    if (!node) {
      node = new ReturnTrackNode(this.ctx, this.masterInputGain);
      this.returnTrackNodes.set(returnTrackId, node);
    }
    return node;
  }

  removeReturnTrackNode(returnTrackId: string) {
    const node = this.returnTrackNodes.get(returnTrackId);
    if (node) {
      node.disconnect();
      this.returnTrackNodes.delete(returnTrackId);
    }
  }

  getReturnTrackMeter(returnTrackId: string): { level: number; leftLevel: number; rightLevel: number; clipped: boolean } {
    return this.returnTrackNodes.get(returnTrackId)?.getMeter() ?? { level: 0, leftLevel: 0, rightLevel: 0, clipped: false };
  }

  resetReturnTrackClip(returnTrackId: string) {
    this.returnTrackNodes.get(returnTrackId)?.resetClip();
  }

  /**
   * Synchronize send routing between tracks and return tracks.
   * Creates/updates ReturnTrackNodes, wires send gain nodes, and cleans up stale connections.
   */
  syncSends(tracks: Track[], returnTracks: ReturnTrack[]) {
    const returnTrackIds = new Set(returnTracks.map(rt => rt.id));

    // 1. Create/update ReturnTrackNodes
    for (const rt of returnTracks) {
      const node = this.getOrCreateReturnTrackNode(rt.id);
      node.volume = rt.volume;
      node.pan = rt.pan;
    }

    // 2. Remove ReturnTrackNodes that no longer exist in the data model
    for (const [id] of this.returnTrackNodes) {
      if (!returnTrackIds.has(id)) {
        this.removeReturnTrackNode(id);
      }
    }

    // 3. Wire sends for each track
    const activeSends = new Map<string, Set<string>>();

    for (const track of tracks) {
      const trackNode = this.trackNodes.get(track.id);
      if (!trackNode) continue;

      const sends = track.sends ?? [];
      const activeReturnIds = new Set<string>();

      for (const send of sends) {
        if (!returnTrackIds.has(send.returnTrackId)) continue;
        if (send.amount <= 0) continue;

        const returnNode = this.returnTrackNodes.get(send.returnTrackId);
        if (!returnNode) continue;

        activeReturnIds.add(send.returnTrackId);
        trackNode.connectSend(send.returnTrackId, returnNode.inputGain, send.amount, (send.prePost ?? 'post') === 'pre');
      }

      activeSends.set(track.id, activeReturnIds);
    }

    // 4. Disconnect sends that are no longer active
    for (const track of tracks) {
      const trackNode = this.trackNodes.get(track.id);
      if (!trackNode) continue;
      const active = activeSends.get(track.id) ?? new Set();
      for (const send of (track.sends ?? [])) {
        if (send.amount <= 0 && !active.has(send.returnTrackId)) {
          trackNode.disconnectSend(send.returnTrackId);
        }
      }
    }
  }

  dispose() {
    this.stop();
    this.disposeAudioStream();
    for (const node of this.trackNodes.values()) {
      node.disconnect();
    }
    this.trackNodes.clear();
    for (const node of this.returnTrackNodes.values()) {
      node.disconnect();
    }
    this.returnTrackNodes.clear();
    this.ctx.close();
  }
}
