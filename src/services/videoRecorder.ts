/**
 * VideoRecorderService — captures the browser tab (video) + AudioContext output (audio)
 * into a single WebM file using the MediaRecorder API.
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1170
 */

export type VideoRecordingStatus =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'stopping'
  | 'done'
  | 'error';

export interface VideoRecorderState {
  status: VideoRecordingStatus;
  duration: number;
  blob: Blob | null;
  mimeType: string | null;
  error: string | null;
}

export interface VideoRecorderOptions {
  frameRate?: number;
  videoBitsPerSecond?: number;
  audioBitsPerSecond?: number;
  /** Optional microphone stream for voiceover narration */
  micStream?: MediaStream;
  /** Microphone volume (0–1), default 1 */
  micVolume?: number;
}

/** Ordered by preference — first supported type wins. */
const MIME_PREFERENCES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=h264,opus',
  'video/webm',
] as const;

function selectMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const mime of MIME_PREFERENCES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

export class VideoRecorderService {
  private _state: VideoRecorderState = {
    status: 'idle',
    duration: 0,
    blob: null,
    mimeType: null,
    error: null,
  };

  private _recorder: MediaRecorder | null = null;
  private _chunks: Blob[] = [];
  private _displayStream: MediaStream | null = null;
  private _micStream: MediaStream | null = null;
  private _mixCtx: AudioContext | null = null;
  private _durationTimer: ReturnType<typeof setInterval> | null = null;
  private _startTime = 0;

  onStateChange: ((state: VideoRecorderState) => void) | null = null;

  // ── Public API ─────────────────────────────────────────────

  static isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getDisplayMedia === 'function' &&
      typeof MediaRecorder !== 'undefined' &&
      selectMimeType() !== null
    );
  }

  getState(): Readonly<VideoRecorderState> {
    return this._state;
  }

  /**
   * Start recording.
   * @param audioStream  MediaStream from AudioEngine.getAudioStream()
   * @param options      Optional quality settings
   */
  async startRecording(
    audioStream: MediaStream,
    options: VideoRecorderOptions = {},
  ): Promise<void> {
    if (this._state.status === 'recording' || this._state.status === 'requesting') {
      return;
    }

    const mimeType = selectMimeType();
    if (!mimeType) {
      this._setState({ status: 'error', error: 'No supported video MIME type found in this browser.' });
      return;
    }

    this._setState({ status: 'requesting', duration: 0, blob: null, mimeType: null, error: null });

    // 1. Request tab capture
    let displayStream: MediaStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: options.frameRate ?? 30,
        },
        // preferCurrentTab is Chrome-specific; cast to allow it
        preferCurrentTab: true,
        audio: false,
      } as DisplayMediaStreamOptions & { preferCurrentTab?: boolean });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Screen sharing was denied.';
      this._setState({ status: 'error', error: msg });
      return;
    }

    this._displayStream = displayStream;
    this._micStream = options.micStream ?? null;

    // 2. Build audio track — mix DAW output + optional mic via Web Audio API
    let finalAudioTracks: MediaStreamTrack[];
    if (this._micStream) {
      const mixCtx = new AudioContext();
      this._mixCtx = mixCtx;
      const dest = mixCtx.createMediaStreamDestination();

      const dawSource = mixCtx.createMediaStreamSource(audioStream);
      dawSource.connect(dest);

      const micSource = mixCtx.createMediaStreamSource(this._micStream);
      const micGain = mixCtx.createGain();
      micGain.gain.value = options.micVolume ?? 1;
      micSource.connect(micGain);
      micGain.connect(dest);

      finalAudioTracks = dest.stream.getAudioTracks();
    } else {
      finalAudioTracks = audioStream.getAudioTracks();
    }

    // 3. Combine video + mixed audio
    const combinedStream = new MediaStream([
      ...displayStream.getVideoTracks(),
      ...finalAudioTracks,
    ]);

    // 3. Create MediaRecorder
    this._chunks = [];
    const recorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: options.videoBitsPerSecond ?? 2_500_000,
      audioBitsPerSecond: options.audioBitsPerSecond ?? 128_000,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this._chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(this._chunks, { type: mimeType });
      this._chunks = [];
      this._cleanup();
      this._setState({ status: 'done', blob, mimeType });
    };

    recorder.onerror = () => {
      this._cleanup();
      this._setState({ status: 'error', error: 'Recording failed unexpectedly.' });
    };

    // Handle user stopping screen share via browser UI
    displayStream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (this._state.status === 'recording') {
          this.stopRecording();
        }
      });
    });

    // 4. Start
    recorder.start(1000); // collect data every second
    this._recorder = recorder;
    this._startTime = Date.now();
    this._startDurationTimer();
    this._setState({ status: 'recording' });
  }

  /** Stop recording and produce the final blob. */
  stopRecording(): void {
    if (this._state.status !== 'recording') return;
    // Clear duration timer immediately so it doesn't tick during the stopping phase
    if (this._durationTimer) {
      clearInterval(this._durationTimer);
      this._durationTimer = null;
    }
    this._setState({ status: 'stopping' });
    this._recorder?.stop();
  }

  /** Reset state back to idle, clearing any recorded blob. */
  dismiss(): void {
    this._cleanup();
    this._setState({ status: 'idle', duration: 0, blob: null, mimeType: null, error: null });
  }

  // ── Private ────────────────────────────────────────────────

  private _setState(patch: Partial<VideoRecorderState>): void {
    this._state = { ...this._state, ...patch };
    this.onStateChange?.(this._state);
  }

  private _startDurationTimer(): void {
    this._durationTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this._startTime) / 1000);
      this._setState({ duration: elapsed });
    }, 1000);
  }

  private _cleanup(): void {
    if (this._durationTimer) {
      clearInterval(this._durationTimer);
      this._durationTimer = null;
    }
    // Ensure the MediaRecorder is stopped so the final dataavailable fires
    if (this._recorder) {
      const state = this._recorder.state;
      if (state === 'recording' || state === 'paused') {
        try { this._recorder.stop(); } catch { /* already inactive */ }
      }
      this._recorder = null;
    }
    // Stop all display tracks (removes browser "sharing" indicator)
    this._displayStream?.getTracks().forEach((t) => t.stop());
    this._displayStream = null;
    // Stop mic stream tracks
    this._micStream?.getTracks().forEach((t) => t.stop());
    this._micStream = null;
    // Close mixing AudioContext
    if (this._mixCtx) {
      void this._mixCtx.close();
      this._mixCtx = null;
    }
    this._chunks = [];
  }
}
