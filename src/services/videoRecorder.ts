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
 * Ordered by preference — first supported type wins.
 * WebM (VP9) is preferred because it handles dynamic content (scrolling,
 * animations) more reliably than Chrome's MP4 MediaRecorder, which can
 * produce glitchy output with rapid frame changes. MP4 export is offered
 * as a post-recording conversion option via ffmpeg.wasm.
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

/** Lazily created, reused across recordings to avoid hitting the browser's AudioContext limit. */
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
      const mixCtx = getOrCreateMixContext();
      const dest = mixCtx.createMediaStreamDestination();

      const dawSource = mixCtx.createMediaStreamSource(audioStream);
      dawSource.connect(dest);

      const micSource = mixCtx.createMediaStreamSource(this._micStream);
      const micGain = mixCtx.createGain();
      micGain.gain.value = options.micVolume ?? 1;
      micSource.connect(micGain);
      micGain.connect(dest);

      // Track nodes for cleanup (disconnect, not close the shared context)
      this._mixNodes = [dawSource, micSource, micGain, dest];
      finalAudioTracks = dest.stream.getAudioTracks();
    } else {
      finalAudioTracks = audioStream.getAudioTracks();
    }

    // 3. Combine video + mixed audio
    const combinedStream = new MediaStream([
      ...displayStream.getVideoTracks(),
      ...finalAudioTracks,
    ]);

    // 4. Create MediaRecorder
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
      // Guard: onstop might fire twice (auto-stop from track end + our stop call)
      if (this._state.status === 'done' || this._state.status === 'idle') return;
      const blob = new Blob(this._chunks, { type: mimeType });
      this._chunks = [];
      this._cleanup();
      this._setState({ status: 'done', blob, mimeType });
    };

    recorder.onerror = () => {
      // Guard: might fire after we already transitioned
      if (this._state.status === 'done' || this._state.status === 'idle') return;
      this._finalizeBlobAndDone(mimeType);
    };

    // Handle user stopping screen share via browser UI ("Stop sharing" button).
    // The track ends immediately — we must flush remaining data before stopping.
    displayStream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (this._state.status !== 'recording') return;
        // Clear timer immediately
        if (this._durationTimer) {
          clearInterval(this._durationTimer);
          this._durationTimer = null;
        }
        this._setState({ status: 'stopping' });
        // Flush any buffered data, then stop
        try {
          if (this._recorder?.state === 'recording') {
            this._recorder.requestData(); // flush last chunk
            this._recorder.stop();
          } else {
            // Recorder already auto-stopped — build blob from what we have
            this._finalizeBlobAndDone(mimeType);
          }
        } catch {
          this._finalizeBlobAndDone(mimeType);
        }
      });
    });

    // 5. Start
    recorder.start(1000); // collect data every second
    this._recorder = recorder;
    this._startTime = Date.now();
    this._startDurationTimer();
    this._setState({ status: 'recording' });
  }

  /** Stop recording and produce the final blob. */
  stopRecording(): void {
    if (this._state.status !== 'recording') return;
    if (this._durationTimer) {
      clearInterval(this._durationTimer);
      this._durationTimer = null;
    }
    this._setState({ status: 'stopping' });
    try {
      if (this._recorder?.state === 'recording') {
        this._recorder.requestData(); // flush buffered data
        this._recorder.stop();
      }
    } catch {
      // Recorder may already be inactive — finalize from chunks
      this._finalizeBlobAndDone(this._state.mimeType ?? 'video/webm');
    }
  }

  /** Reset state back to idle, clearing any recorded blob. */
  dismiss(): void {
    this._cleanup();
    this._setState({ status: 'idle', duration: 0, blob: null, mimeType: null, error: null });
  }

  // ── Private ────────────────────────────────────────────────

  /** Fallback: build blob from whatever chunks we have and transition to done. */
  private _finalizeBlobAndDone(mimeType: string): void {
    if (this._state.status === 'done' || this._state.status === 'idle') return;
    const blob = new Blob(this._chunks, { type: mimeType });
    this._chunks = [];
    this._cleanup();
    if (blob.size > 0) {
      this._setState({ status: 'done', blob, mimeType });
    } else {
      this._setState({ status: 'error', error: 'Recording produced no data.' });
    }
  }

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
    // Disconnect mixing nodes (context is reused, not closed)
    for (const node of this._mixNodes) {
      try { node.disconnect(); } catch { /* already disconnected */ }
    }
    this._mixNodes = [];
    this._chunks = [];
  }
}
