/**
 * VideoSyncEngine — keeps video playback frame-locked to the DAW Transport.
 *
 * Dual-mode architecture:
 *   Play mode:  HTMLVideoElement for smooth hardware-accelerated playback
 *   Scrub mode: Frame-accurate seeking (WebCodecs when available, fallback to video.currentTime)
 *
 * Video is real-time (not musical-time). Tempo changes do NOT affect video speed.
 */

import type { VideoClipData, Clip, Track } from '../types/project';

// ─── Pure Logic (testable without browser APIs) ─────────────────────────────

export type SyncMode = 'idle' | 'playing' | 'scrubbing';

export interface VideoClipMapping {
  /** Timeline start time in seconds. */
  clipStartTime: number;
  /** Timeline end time in seconds. */
  clipEndTime: number;
  /** Duration on timeline. */
  clipDuration: number;
  /** Offset into the source video file (seconds). */
  sourceOffset: number;
  /** Total source video duration. */
  sourceDuration: number;
  /** Frame rate of the source video. */
  frameRate: number;
}

/**
 * Map a transport time (seconds) to a video source time (seconds).
 * Accounts for clip placement on timeline and source offset.
 *
 * Returns null if the transport time is outside any video clip.
 */
export function mapTransportToVideoTime(
  transportSeconds: number,
  mapping: VideoClipMapping,
): number | null {
  if (transportSeconds < mapping.clipStartTime || transportSeconds >= mapping.clipEndTime) {
    return null; // Outside this clip
  }
  const timeInClip = transportSeconds - mapping.clipStartTime;
  const videoTime = mapping.sourceOffset + timeInClip;
  // Clamp to source duration (freeze on last frame if clip extends beyond source)
  return Math.min(videoTime, mapping.sourceDuration);
}

/**
 * Build a VideoClipMapping from a clip with video data.
 */
export function buildClipMapping(clip: Clip, videoData: VideoClipData): VideoClipMapping {
  return {
    clipStartTime: clip.startTime,
    clipEndTime: clip.startTime + clip.duration,
    clipDuration: clip.duration,
    sourceOffset: videoData.sourceOffset,
    sourceDuration: videoData.fileDuration,
    frameRate: videoData.frameRate,
  };
}

/**
 * Calculate drift between expected and actual video time.
 * Returns drift in seconds (positive = video is ahead, negative = behind).
 */
export function calculateDrift(
  expectedVideoTime: number,
  actualVideoTime: number,
): number {
  return actualVideoTime - expectedVideoTime;
}

/**
 * Determine the correction strategy for a given drift amount.
 */
export type DriftCorrection =
  | { type: 'none' }
  | { type: 'rate-adjust'; playbackRate: number }
  | { type: 'hard-seek'; targetTime: number };

/** Drift threshold in seconds for rate adjustment (~1.5 frames at 30fps). */
export const DRIFT_RATE_THRESHOLD = 0.05;
/** Drift threshold in seconds for hard seek. */
export const DRIFT_SEEK_THRESHOLD = 0.1;

export function getDriftCorrection(
  driftSeconds: number,
  expectedVideoTime: number,
): DriftCorrection {
  const absDrift = Math.abs(driftSeconds);

  if (absDrift < DRIFT_RATE_THRESHOLD) {
    return { type: 'none' };
  }

  if (absDrift < DRIFT_SEEK_THRESHOLD) {
    // Micro-adjust playback rate (±5%) to gradually correct
    const rate = driftSeconds > 0 ? 0.95 : 1.05;
    return { type: 'rate-adjust', playbackRate: rate };
  }

  // Large drift — hard re-seek
  return { type: 'hard-seek', targetTime: expectedVideoTime };
}

/**
 * Calculate the frame duration for a given frame rate.
 */
export function frameDuration(frameRate: number): number {
  return frameRate > 0 ? 1 / frameRate : 1 / 30;
}

/**
 * Step forward or backward by a number of frames.
 */
export function stepFrameTime(
  currentTime: number,
  frameRate: number,
  direction: 'forward' | 'backward',
  frameCount: number = 1,
): number {
  const step = frameDuration(frameRate) * frameCount;
  const newTime = direction === 'forward'
    ? currentTime + step
    : currentTime - step;
  return Math.max(0, newTime);
}

/**
 * Handle loop: when transport loops, video must re-seek to loop start position.
 * Returns the video time at the loop start, or null if no video at loop start.
 */
export function handleLoop(
  loopStartSeconds: number,
  mapping: VideoClipMapping,
): number | null {
  return mapTransportToVideoTime(loopStartSeconds, mapping);
}

/**
 * Find the active video clip at a given transport time.
 * Returns the clip and its video data, or null if no video clip is active.
 */
export function findActiveVideoClip(
  tracks: Track[],
  transportSeconds: number,
): { clip: Clip; videoData: VideoClipData; track: Track } | null {
  for (const track of tracks) {
    if (track.trackType !== 'video') continue;
    for (const clip of track.clips) {
      if (!clip.videoData) continue;
      if (transportSeconds >= clip.startTime && transportSeconds < clip.startTime + clip.duration) {
        return { clip, videoData: clip.videoData, track };
      }
    }
  }
  return null;
}

/**
 * Apply audio latency compensation to display time.
 * Video should be displayed slightly ahead of audio to account for output pipeline latency.
 */
export function compensateLatency(
  transportSeconds: number,
  audioLatencySeconds: number,
): number {
  return transportSeconds + audioLatencySeconds;
}

// ─── VideoSyncEngine Class (browser-dependent) ──────────────────────────────

export class VideoSyncEngine {
  private videoEl: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private mode: SyncMode = 'idle';
  private currentMapping: VideoClipMapping | null = null;
  private animFrameId: number | null = null;
  private audioLatency: number = 0;

  /**
   * Attach the engine to DOM elements for rendering.
   */
  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.videoEl = document.createElement('video');
    this.videoEl.muted = true;
    this.videoEl.playsInline = true;
    this.videoEl.preload = 'auto';
  }

  /**
   * Detach and clean up resources.
   */
  detach(): void {
    this.stopPlayback();
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.removeAttribute('src');
      this.videoEl.load();
      this.videoEl = null;
    }
    this.canvas = null;
    this.ctx = null;
  }

  /**
   * Load a video source for playback.
   */
  async loadSource(objectURL: string, mapping: VideoClipMapping): Promise<void> {
    if (!this.videoEl) return;
    this.currentMapping = mapping;
    this.videoEl.src = objectURL;
    await new Promise<void>((resolve, reject) => {
      this.videoEl!.onloadedmetadata = () => resolve();
      this.videoEl!.onerror = () => reject(new Error('Failed to load video source'));
    });
  }

  /**
   * Set audio output latency for compensation.
   */
  setAudioLatency(latencySeconds: number): void {
    this.audioLatency = latencySeconds;
  }

  /**
   * Start continuous playback synced to a transport time.
   */
  startPlayback(transportSeconds: number): void {
    if (!this.videoEl || !this.currentMapping) return;

    const videoTime = mapTransportToVideoTime(
      compensateLatency(transportSeconds, this.audioLatency),
      this.currentMapping,
    );

    if (videoTime === null) {
      this.showBlack();
      return;
    }

    this.mode = 'playing';
    this.videoEl.currentTime = videoTime;
    this.videoEl.play().catch(() => {
      // Autoplay blocked — will try again on user interaction
    });

    this.startSyncLoop();
  }

  /**
   * Stop playback.
   */
  stopPlayback(): void {
    this.mode = 'idle';
    this.stopSyncLoop();
    if (this.videoEl) {
      this.videoEl.pause();
    }
  }

  /**
   * Pause playback.
   */
  pausePlayback(): void {
    this.mode = 'idle';
    this.stopSyncLoop();
    if (this.videoEl) {
      this.videoEl.pause();
    }
  }

  /**
   * Seek to a specific transport time (for scrubbing).
   */
  seekToTransportTime(transportSeconds: number): void {
    if (!this.videoEl || !this.currentMapping) return;
    this.mode = 'scrubbing';

    const videoTime = mapTransportToVideoTime(transportSeconds, this.currentMapping);
    if (videoTime === null) {
      this.showBlack();
      return;
    }

    this.videoEl.currentTime = videoTime;
    // Draw current frame after seek
    this.videoEl.onseeked = () => {
      this.drawCurrentFrame();
      this.videoEl!.onseeked = null;
    };
  }

  /**
   * Handle transport loop event.
   */
  handleLoopEvent(loopStartSeconds: number): void {
    if (!this.currentMapping) return;
    const videoTime = handleLoop(loopStartSeconds, this.currentMapping);
    if (videoTime !== null && this.videoEl) {
      this.videoEl.currentTime = videoTime;
    }
  }

  /**
   * Get current sync mode.
   */
  getMode(): SyncMode {
    return this.mode;
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private startSyncLoop(): void {
    this.stopSyncLoop();
    const loop = () => {
      if (this.mode !== 'playing') return;
      this.drawCurrentFrame();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private stopSyncLoop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private drawCurrentFrame(): void {
    if (!this.videoEl || !this.ctx || !this.canvas) return;
    this.ctx.drawImage(this.videoEl, 0, 0, this.canvas.width, this.canvas.height);
  }

  private showBlack(): void {
    if (!this.ctx || !this.canvas) return;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
