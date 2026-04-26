/**
 * Recording Engine — handles audio input access, recording, monitoring,
 * input level metering, and real-time waveform capture.
 */

import { createDebugLogger } from '../utils/debugLogger';
import { getAudioEngine } from '../hooks/useAudioEngine';

const log = createDebugLogger('recording-engine');

/**
 * Fire a short percussive click using only native Web Audio —
 * drop-in replacement for the `Tone.MembraneSynth.triggerAttackRelease`
 * pattern used by the count-in and metronome below.
 *
 * Models a kick-like click: starts at `startFreq`, exponentially
 * sweeps to `endFreq` over `decayMs`, with a linear attack and
 * exponential amplitude decay.
 *
 * Cleanup: oscillator `stop()` ends playback; the `onended` handler
 * disconnects both nodes so the graph edges + closures are
 * released deterministically instead of waiting for browser GC
 * (codex P3 on PR #1731, matching the pattern in
 * `LoopBrowser.playPreview`).
 */
function playClick(
  ctx: AudioContext,
  destination: AudioNode,
  startFreq: number,
  endFreq: number,
  decayMs: number,
  volume: number,
): void {
  const now = ctx.currentTime;
  const endTime = now + decayMs / 1000;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), endTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

  osc.connect(gain).connect(destination);
  osc.start(now);
  osc.stop(endTime + 0.02);
  osc.onended = () => {
    try { osc.disconnect(); } catch { /* already disconnected */ }
    try { gain.disconnect(); } catch { /* already disconnected */ }
    osc.onended = null;
  };
}

export interface AudioInputDevice {
  deviceId: string;
  label: string;
  isDefault: boolean;
}

export interface RecordingSession {
  trackId: string;
  regionId: string;
  startTime: number; // transport time when recording started
  chunks: Blob[];
  waveformSamples: number[]; // real-time waveform data (peak values 0-1)
}

export type CountInLength = 'off' | '1bar' | '2bars';
export type MetronomeMode = 'always' | 'recording-only' | 'off';

class RecordingEngine {
  // Audio input
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private monitorGainNode: GainNode | null = null;
  private inputGainNode: GainNode | null = null;

  // Recording sessions (one per armed track)
  private sessions: Map<string, RecordingSession> = new Map();
  private isRecordingActive = false;

  // Input devices
  private devices: AudioInputDevice[] = [];
  private selectedDeviceId: string = 'default';

  // Monitoring
  private monitoringEnabled: Map<string, boolean> = new Map();

  // Count-in
  private countInLength: CountInLength = '1bar';
  private isCountingIn = false;

  // Input level (cached for UI reads)
  private _inputLevel = -Infinity;
  private _inputPeak = -Infinity;
  private levelAnimFrame: number | null = null;

  // Real-time waveform capture
  private waveformInterval: ReturnType<typeof setInterval> | null = null;

  // Permission status
  private permissionGranted = false;
  private permissionDenied = false;

  /**
   * Request microphone permission and set up the input chain.
   * Returns true if permission was granted.
   */
  async requestPermission(deviceId?: string): Promise<boolean> {
    try {
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(t => t.stop());
      }

      const constraints: MediaStreamConstraints = {
        audio: deviceId && deviceId !== 'default'
          ? { deviceId: { exact: deviceId } }
          : true,
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.permissionGranted = true;
      this.permissionDenied = false;

      // Create audio nodes for analysis and monitoring
      this.audioContext = new AudioContext();
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.8;

      this.inputGainNode = this.audioContext.createGain();
      this.inputGainNode.gain.value = 1.0;

      this.monitorGainNode = this.audioContext.createGain();
      this.monitorGainNode.gain.value = 0; // Off by default

      this.sourceNode.connect(this.inputGainNode);
      this.inputGainNode.connect(this.analyserNode);
      this.inputGainNode.connect(this.monitorGainNode);
      this.monitorGainNode.connect(this.audioContext.destination);

      // Start level metering
      this.startLevelMetering();

      // Enumerate devices now that we have permission
      await this.enumerateDevices();

      return true;
    } catch (err) {
      log.error('Microphone permission denied:', err);
      this.permissionGranted = false;
      this.permissionDenied = true;
      return false;
    }
  }

  /**
   * List available audio input devices
   */
  async enumerateDevices(): Promise<AudioInputDevice[]> {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      this.devices = allDevices
        .filter(d => d.kind === 'audioinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
          isDefault: d.deviceId === 'default' || i === 0,
        }));
      return this.devices;
    } catch {
      return [];
    }
  }

  getDevices(): AudioInputDevice[] {
    return this.devices;
  }

  getSelectedDeviceId(): string {
    return this.selectedDeviceId;
  }

  /**
   * Change the audio input device. Reconnects the stream.
   */
  async selectDevice(deviceId: string): Promise<boolean> {
    this.selectedDeviceId = deviceId;
    if (this.permissionGranted) {
      return this.requestPermission(deviceId);
    }
    return false;
  }

  /**
   * Set monitoring (input through) for a track
   */
  setMonitoring(trackId: string, enabled: boolean) {
    this.monitoringEnabled.set(trackId, enabled);
    this.updateMonitorGain();
  }

  getMonitoring(trackId: string): boolean {
    return this.monitoringEnabled.get(trackId) ?? false;
  }

  private updateMonitorGain() {
    if (!this.monitorGainNode) return;
    const anyMonitoring = Array.from(this.monitoringEnabled.values()).some(v => v);
    this.monitorGainNode.gain.value = anyMonitoring ? 1.0 : 0;
  }

  /**
   * Get the current input level in dB
   */
  getInputLevel(): number {
    return this._inputLevel;
  }

  getInputPeak(): number {
    return this._inputPeak;
  }

  /**
   * Get the current input level as a linear 0-1 value
   */
  getInputLevelLinear(): number {
    if (this._inputLevel <= -60) return 0;
    return Math.max(0, Math.min(1, (this._inputLevel + 60) / 60));
  }

  private startLevelMetering() {
    if (this.levelAnimFrame !== null) return;

    const meter = () => {
      if (this.analyserNode) {
        const dataArray = new Float32Array(this.analyserNode.fftSize);
        this.analyserNode.getFloatTimeDomainData(dataArray);

        let peak = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const abs = Math.abs(dataArray[i]);
          if (abs > peak) peak = abs;
        }

        const db = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
        this._inputLevel = db;
        if (db > this._inputPeak) this._inputPeak = db;

        // Peak decay
        this._inputPeak = Math.max(this._inputLevel, this._inputPeak - 0.5);
      }

      this.levelAnimFrame = requestAnimationFrame(meter);
    };

    this.levelAnimFrame = requestAnimationFrame(meter);
  }

  private stopLevelMetering() {
    if (this.levelAnimFrame !== null) {
      cancelAnimationFrame(this.levelAnimFrame);
      this.levelAnimFrame = null;
    }
    this._inputLevel = -Infinity;
    this._inputPeak = -Infinity;
  }

  /**
   * Start recording on a specific track.
   */
  async startRecording(
    trackId: string,
    regionId: string,
    transportTime: number,
  ): Promise<boolean> {
    if (!this.mediaStream || !this.permissionGranted) {
      const ok = await this.requestPermission(this.selectedDeviceId);
      if (!ok) return false;
    }

    if (!this.mediaStream) return false;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const recorder = new MediaRecorder(this.mediaStream, { mimeType });
    const session: RecordingSession = {
      trackId,
      regionId,
      startTime: transportTime,
      chunks: [],
      waveformSamples: [],
    };

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        session.chunks.push(e.data);
      }
    };

    recorder.start(100);
    this.mediaRecorder = recorder;
    this.sessions.set(trackId, session);
    this.isRecordingActive = true;

    this.startWaveformCapture(trackId);

    return true;
  }

  private startWaveformCapture(trackId: string) {
    if (this.waveformInterval !== null) return;

    this.waveformInterval = setInterval(() => {
      const session = this.sessions.get(trackId);
      if (!session || !this.analyserNode) return;

      const dataArray = new Float32Array(this.analyserNode.fftSize);
      this.analyserNode.getFloatTimeDomainData(dataArray);

      let peak = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const abs = Math.abs(dataArray[i]);
        if (abs > peak) peak = abs;
      }

      session.waveformSamples.push(peak);
    }, 50);
  }

  private stopWaveformCapture() {
    if (this.waveformInterval !== null) {
      clearInterval(this.waveformInterval);
      this.waveformInterval = null;
    }
  }

  getRecordingWaveform(trackId: string): number[] {
    return this.sessions.get(trackId)?.waveformSamples ?? [];
  }

  /**
   * Stop recording on a specific track and return the AudioBuffer.
   */
  async stopRecording(trackId: string): Promise<{
    audioBuffer: AudioBuffer;
    waveformData: number[];
    duration: number;
  } | null> {
    const session = this.sessions.get(trackId);
    if (!session) return null;

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        if (!this.mediaRecorder) { resolve(); return; }
        this.mediaRecorder.onstop = () => resolve();
        this.mediaRecorder.stop();
      });
    }

    this.stopWaveformCapture();
    this.sessions.delete(trackId);

    if (this.sessions.size === 0) {
      this.isRecordingActive = false;
    }

    if (session.chunks.length === 0) return null;

    const blob = new Blob(session.chunks, { type: session.chunks[0].type });
    const arrayBuffer = await blob.arrayBuffer();

    const audioCtx = new AudioContext();
    try {
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      audioCtx.close();

      const waveformData = this.extractPeaks(audioBuffer, 512);

      return {
        audioBuffer,
        waveformData,
        duration: audioBuffer.duration,
      };
    } catch (err) {
      log.error('Failed to decode recorded audio:', err);
      audioCtx.close();
      return null;
    }
  }

  async stopAllRecordings(): Promise<Map<string, {
    audioBuffer: AudioBuffer;
    waveformData: number[];
    duration: number;
  }>> {
    const results = new Map<string, {
      audioBuffer: AudioBuffer;
      waveformData: number[];
      duration: number;
    }>();

    const trackIds = Array.from(this.sessions.keys());
    for (const trackId of trackIds) {
      const result = await this.stopRecording(trackId);
      if (result) {
        results.set(trackId, result);
      }
    }

    return results;
  }

  get recording() { return this.isRecordingActive; }
  get hasPermission() { return this.permissionGranted; }
  get denied() { return this.permissionDenied; }

  getSession(trackId: string): RecordingSession | undefined {
    return this.sessions.get(trackId);
  }

  // --- Count-In ---

  setCountInLength(length: CountInLength) {
    this.countInLength = length;
  }

  getCountInLength(): CountInLength {
    return this.countInLength;
  }

  async playCountIn(
    bpm: number,
    beatsPerBar: number,
    onBeat: (bar: number, beat: number, total: number) => void,
  ): Promise<void> {
    if (this.countInLength === 'off') return;

    this.isCountingIn = true;
    const bars = this.countInLength === '1bar' ? 1 : 2;
    const totalBeats = bars * beatsPerBar;
    const beatDuration = 60 / bpm;

    try {
      const engine = getAudioEngine();
      await engine.resume();
      const ctx = engine.ctx;
      // Hi click (downbeat) and lo click (other beats) — pitch
      // sweeps match the old Tone.MembraneSynth character
      // (pitchDecay 0.01, octaves 6/4 from C5/C4): ~3139 → 523 Hz
      // over 10 ms for hi, ~1046 → 261 Hz for lo. Previous values
      // (800→120, 400→90 over 60 ms) sounded too low and soft
      // (codex P3 on PR #1731).
      const clickHi = () => playClick(ctx, ctx.destination, 3139, 523, 10, 0.6);
      const clickLo = () => playClick(ctx, ctx.destination, 1046, 261, 10, 0.5);

      for (let i = 0; i < totalBeats; i++) {
        const bar = Math.floor(i / beatsPerBar);
        const beat = i % beatsPerBar;
        onBeat(bar, beat, totalBeats - i);

        if (beat === 0) {
          clickHi();
        } else {
          clickLo();
        }

        await new Promise<void>(resolve => setTimeout(resolve, beatDuration * 1000));
      }
    } finally {
      // Always reset isCountingIn, even if engine.resume() rejects
      // or onBeat throws — otherwise the engine can get stuck
      // reporting `countingIn === true` forever (Copilot review
      // on PR #1731).
      this.isCountingIn = false;
    }
  }

  get countingIn() { return this.isCountingIn; }

  // --- Metronome ---

  startMetronome(bpm: number, beatsPerBar: number): () => void {
    // Recording-time metronome. Not sample-accurate: clicks fire
    // when the JS timer wakes up (subject to UI stall, GC,
    // background-tab throttling). The app's sample-accurate
    // metronome lives in the Rust engine (Phase 3E); this helper
    // has no current call sites in `src/` as of Phase 5E, but is
    // retained for future recording-session UX that may need
    // wallclock-driven click beneath the sample-accurate playback
    // metronome (codex P2 note on PR #1731).
    const engine = getAudioEngine();
    // Fire-and-forget resume — if the user hasn't triggered a
    // gesture yet the ctx may be suspended and clicks would be
    // silent. `resume()` is a no-op when already running (Copilot
    // review on PR #1731).
    void engine.resume();
    const ctx = engine.ctx;
    // -6 dB ≈ 0.5 linear, -10 dB ≈ 0.316 linear (matches old
    // Tone.MembraneSynth volume.value settings).
    const hiVolume = 0.5;
    const loVolume = 0.316;
    const clickHi = () => playClick(ctx, ctx.destination, 3139, 523, 10, hiVolume);
    const clickLo = () => playClick(ctx, ctx.destination, 1046, 261, 10, loVolume);

    let beat = 0;
    const beatInterval = (60 / bpm) * 1000;
    const intervalId = setInterval(() => {
      if (beat % beatsPerBar === 0) {
        clickHi();
      } else {
        clickLo();
      }
      beat++;
    }, beatInterval);

    return () => {
      clearInterval(intervalId);
    };
  }

  // --- Helpers ---

  private extractPeaks(audioBuffer: AudioBuffer, numSamples: number): number[] {
    const channelData = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(channelData.length / numSamples);
    const peaks: number[] = [];

    for (let i = 0; i < numSamples; i++) {
      let max = 0;
      const start = i * blockSize;
      for (let j = 0; j < blockSize; j++) {
        const abs = Math.abs(channelData[start + j] ?? 0);
        if (abs > max) max = abs;
      }
      peaks.push(max);
    }

    return peaks;
  }

  dispose() {
    this.stopAllRecordings();
    this.stopLevelMetering();
    this.stopWaveformCapture();

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }

    if (this.sourceNode) { this.sourceNode.disconnect(); this.sourceNode = null; }
    if (this.analyserNode) { this.analyserNode.disconnect(); this.analyserNode = null; }
    if (this.monitorGainNode) { this.monitorGainNode.disconnect(); this.monitorGainNode = null; }
    if (this.inputGainNode) { this.inputGainNode.disconnect(); this.inputGainNode = null; }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.sessions.clear();
    this.monitoringEnabled.clear();
  }
}

export const recordingEngine = new RecordingEngine();
