/**
 * Recording Engine — handles audio input access, recording, monitoring,
 * input level metering, and real-time waveform capture.
 */

import * as Tone from 'tone';
import { createDebugLogger } from '../utils/debugLogger';

const logger = createDebugLogger('ace-step:recording');

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
      logger.error('Microphone permission denied:', err);
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
      logger.error('Failed to decode recorded audio:', err);
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

    await Tone.start();

    const clickHi = new Tone.MembraneSynth({
      pitchDecay: 0.01,
      octaves: 6,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 },
    }).toDestination();

    const clickLo = new Tone.MembraneSynth({
      pitchDecay: 0.01,
      octaves: 4,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 },
    }).toDestination();

    for (let i = 0; i < totalBeats; i++) {
      const bar = Math.floor(i / beatsPerBar);
      const beat = i % beatsPerBar;
      onBeat(bar, beat, totalBeats - i);

      if (beat === 0) {
        clickHi.triggerAttackRelease('C5', '32n');
      } else {
        clickLo.triggerAttackRelease('C4', '32n');
      }

      await new Promise<void>(resolve => setTimeout(resolve, beatDuration * 1000));
    }

    this.isCountingIn = false;
    clickHi.dispose();
    clickLo.dispose();
  }

  get countingIn() { return this.isCountingIn; }

  // --- Metronome ---

  startMetronome(bpm: number, beatsPerBar: number): () => void {
    const clickHi = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 6,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 },
    }).toDestination();
    clickHi.volume.value = -6;

    const clickLo = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 4,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
    }).toDestination();
    clickLo.volume.value = -10;

    let beat = 0;
    const id = Tone.getTransport().scheduleRepeat((time) => {
      if (beat % beatsPerBar === 0) {
        clickHi.triggerAttackRelease('C5', '32n', time);
      } else {
        clickLo.triggerAttackRelease('C4', '32n', time);
      }
      beat++;
    }, `${beatsPerBar}n`);

    return () => {
      Tone.getTransport().clear(id);
      clickHi.dispose();
      clickLo.dispose();
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
