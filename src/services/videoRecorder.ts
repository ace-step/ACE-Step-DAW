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

/**
 * WebM (VP9) is preferred because it handles dynamic content (scrolling,
 * animations) more reliably than Chrome's MP4 MediaRecorder.
 */
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

let _sharedMixCtx: AudioContext | null = null;
function getOrCreateMixContext(): AudioContext {
  if (!_sharedMixCtx || _sharedMixCtx.state === 'closed') {
    _sharedMixCtx = new AudioContext();
  }
  return _sharedMixCtx;
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
  private _mixNodes: AudioNode[] = [];
  private _durationTimer: ReturnType<typeof setInterval> | null = null;
  private _startTime = 0;
  private _stopped = false;

  onStateChange: ((state: VideoRecorderState) => void) | null = null;

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
    this._stopped = false;

    // 1. Request tab capture
    let displayStream: MediaStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: options.frameRate ?? 30 },
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

    // 2. Build audio — mix DAW output + optional mic
    let finalAudioTracks: MediaStreamTrack[];
    if (this._micStream) {
      const mixCtx = getOrCreateMixContext();
      const dest = mixCtx.createMediaStreamDestination();
      const dawSource = mixCtx.createMediaStreamSource(audioStream);
      dawSource.connect(dest);
      const micSource = mixCtx.createMediaStreamSource(this._micStream);
      const micGain = mixCtx.createGain();
      micGain.gain.value = options.micVolume ?? 1;
      micSource.connect(micGain);
      micGain.connect(dest);
      this._mixNodes = [dawSource, micSource, micGain, dest];
      finalAudioTracks = dest.stream.getAudioTracks();
    } else {
      finalAudioTracks = audioStream.getAudioTracks();
    }

    // 3. Combine video + audio
    const combinedStream = new MediaStream([
      ...displayStream.getVideoTracks(),
      ...finalAudioTracks,
    ]);

    // 4. Create MediaRecorder — NO timeslice to ensure a single valid blob
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
      if (this._stopped) return;
      this._stopped = true;
      this._stopDurationTimer();
      const blob = new Blob(this._chunks, { type: mimeType });
      this._chunks = [];
      this._cleanupStreams();
      if (blob.size > 0) {
        this._setState({ status: 'done', blob, mimeType });
      } else {
        this._setState({ status: 'error', error: 'Recording produced no data.' });
      }
    };

    recorder.onerror = () => {
      if (this._stopped) return;
      this._stopped = true;
      this._stopDurationTimer();
      this._cleanupStreams();
      this._setState({ status: 'error', error: 'Recording failed unexpectedly.' });
    };

    // 5. Start — no timeslice argument, data is collected as one chunk on stop()
    recorder.start();
    this._recorder = recorder;
    this._startTime = Date.now();
    this._startDurationTimer();
    this._setState({ status: 'recording' });
  }

  stopRecording(): void {
    if (this._state.status !== 'recording' || this._stopped) return;
    this._setState({ status: 'stopping' });
    this._stopDurationTimer();
    // stop() triggers ondataavailable (with all data) then onstop
    try {
      this._recorder?.stop();
    } catch {
      // Already inactive — onstop should have/will fire
    }
  }

  dismiss(): void {
    this._stopped = true;
    this._stopDurationTimer();
    this._cleanupStreams();
    if (this._recorder) {
      try { if (this._recorder.state !== 'inactive') this._recorder.stop(); } catch { /* */ }
      this._recorder = null;
    }
    this._chunks = [];
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

  private _stopDurationTimer(): void {
    if (this._durationTimer) {
      clearInterval(this._durationTimer);
      this._durationTimer = null;
    }
  }

  /** Clean up streams and audio nodes — does NOT touch the recorder. */
  private _cleanupStreams(): void {
    this._displayStream?.getTracks().forEach((t) => t.stop());
    this._displayStream = null;
    this._micStream?.getTracks().forEach((t) => t.stop());
    this._micStream = null;
    for (const node of this._mixNodes) {
      try { node.disconnect(); } catch { /* */ }
    }
    this._mixNodes = [];
  }
}
