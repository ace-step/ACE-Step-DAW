/**
 * Video Sync Engine — keeps video playback frame-locked to Tone.js Transport.
 * Phase 4 of the video track epic (#1144).
 *
 * Design:
 * - Play mode: HTMLVideoElement with hardware-accelerated playback
 * - Scrub mode: Frame-accurate seeking (WebCodecs in supported browsers, fallback to video.currentTime)
 * - Drift correction: ±1 frame tolerance, correction when drift exceeds threshold
 */

export type VideoSyncMode = 'idle' | 'play' | 'scrub';

export interface VideoSyncState {
  mode: VideoSyncMode;
  videoElement: HTMLVideoElement | null;
  currentFrame: number;
  frameRate: number;
  driftSeconds: number;
}

export interface ComputeVideoTimeParams {
  transportTime: number;
  clipStartTime: number;
  sourceOffset: number;
  clipDuration: number;
  videoDuration: number;
}

export class VideoSyncEngine {
  private state: VideoSyncState;

  constructor() {
    this.state = {
      mode: 'idle',
      videoElement: null,
      currentFrame: 0,
      frameRate: 30,
      driftSeconds: 0,
    };
  }

  getState(): VideoSyncState {
    return { ...this.state };
  }

  setMode(mode: VideoSyncMode): void {
    this.state.mode = mode;
  }

  setVideoElement(el: HTMLVideoElement | null): void {
    this.state.videoElement = el;
  }

  setFrameRate(fps: number): void {
    this.state.frameRate = fps;
  }

  setCurrentFrame(frame: number): void {
    this.state.currentFrame = frame;
  }

  stepForward(): void {
    this.state.currentFrame += 1;
  }

  stepBackward(): void {
    this.state.currentFrame = Math.max(0, this.state.currentFrame - 1);
  }

  /**
   * Map a transport time position to the corresponding video time.
   * Returns -1 if the transport is outside the clip's time range.
   */
  static computeVideoTime(params: ComputeVideoTimeParams): number {
    const { transportTime, clipStartTime, sourceOffset, clipDuration, videoDuration } = params;

    // Before clip start
    if (transportTime < clipStartTime) return -1;

    // After clip end
    const clipEnd = clipStartTime + clipDuration;
    if (transportTime >= clipEnd) return -1;

    const elapsed = transportTime - clipStartTime;
    const videoTime = sourceOffset + elapsed;

    return Math.min(videoTime, videoDuration);
  }

  /** Convert a time in seconds to a frame number at the given frame rate. */
  static computeFrameNumber(timeSeconds: number, frameRate: number): number {
    return Math.floor(timeSeconds * frameRate);
  }

  /** Compute drift between actual video position and expected position. */
  static computeDrift(actualVideoTime: number, expectedVideoTime: number): number {
    return actualVideoTime - expectedVideoTime;
  }

  /**
   * Check if drift exceeds the ±1 frame tolerance.
   * At 30fps, 1 frame = ~33.3ms.
   */
  static needsDriftCorrection(driftSeconds: number, frameRate: number): boolean {
    const frameDuration = 1 / frameRate;
    return Math.abs(driftSeconds) > frameDuration;
  }

  /**
   * Sync the video element to a target time.
   * For play mode, seeks directly when drift exceeds ±1 frame tolerance.
   * For scrub mode, directly seeks to the target time.
   */
  syncTo(targetTimeSeconds: number): void {
    const { videoElement, mode, frameRate } = this.state;
    if (!videoElement || mode === 'idle') return;

    if (mode === 'scrub') {
      videoElement.currentTime = targetTimeSeconds;
      this.state.currentFrame = VideoSyncEngine.computeFrameNumber(targetTimeSeconds, frameRate);
      return;
    }

    // Play mode: check drift and correct
    const drift = VideoSyncEngine.computeDrift(videoElement.currentTime, targetTimeSeconds);
    this.state.driftSeconds = drift;

    if (VideoSyncEngine.needsDriftCorrection(drift, frameRate)) {
      // Large drift: seek directly
      videoElement.currentTime = targetTimeSeconds;
    }

    this.state.currentFrame = VideoSyncEngine.computeFrameNumber(targetTimeSeconds, frameRate);
  }

  /** Start playback — video element begins playing in sync. */
  play(): void {
    this.state.mode = 'play';
    this.state.videoElement?.play().catch(() => {
      // Autoplay may be blocked; engine will still track frames
    });
  }

  /** Pause playback. */
  pause(): void {
    this.state.mode = 'idle';
    this.state.videoElement?.pause();
  }

  /** Stop and reset to beginning. */
  stop(): void {
    this.state.mode = 'idle';
    if (this.state.videoElement) {
      this.state.videoElement.pause();
      this.state.videoElement.currentTime = 0;
    }
    this.state.currentFrame = 0;
    this.state.driftSeconds = 0;
  }

  dispose(): void {
    this.stop();
    this.state.videoElement = null;
  }
}
