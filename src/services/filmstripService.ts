/**
 * Filmstrip thumbnail generation service.
 * Phase 3 of the video track epic (#1144).
 *
 * Computes thumbnail intervals, dimensions, and coordinates
 * worker-based thumbnail generation.
 */

/** Standard filmstrip thumbnail width. */
export const FILMSTRIP_THUMBNAIL_WIDTH = 160;

/** Standard filmstrip thumbnail height (16:9). */
export const FILMSTRIP_THUMBNAIL_HEIGHT = 90;

export interface FilmstripConfig {
  /** Time interval between thumbnails in seconds. */
  intervalSeconds: number;
  /** Thumbnail width in pixels. */
  thumbnailWidth: number;
  /** Thumbnail height in pixels (aspect-ratio corrected). */
  thumbnailHeight: number;
  /** Total number of thumbnails to generate. */
  totalThumbnails: number;
}

export interface FilmstripBuildParams {
  videoDuration: number;
  pixelsPerSecond: number;
  sourceWidth: number;
  sourceHeight: number;
}

/**
 * Compute the thumbnail sampling interval based on timeline zoom level.
 * - Low zoom (<20 px/s): 10s intervals — ~30 thumbnails for 5 min
 * - Medium zoom (20–100 px/s): 2s intervals — ~150 thumbnails for 5 min
 * - High zoom (>100 px/s): 0.5s intervals — ~600 thumbnails for 5 min
 */
export function computeThumbnailInterval(pixelsPerSecond: number): number {
  if (pixelsPerSecond < 20) return 10;
  if (pixelsPerSecond <= 100) return 2;
  return 0.5;
}

/**
 * Compute the number of thumbnails needed for a video duration at a given interval.
 * Always returns at least 1.
 */
export function computeThumbnailCount(durationSeconds: number, intervalSeconds: number): number {
  return Math.max(1, Math.ceil(durationSeconds / intervalSeconds));
}

/**
 * Build a complete filmstrip configuration for a given video and zoom level.
 */
export function buildFilmstripConfig(params: FilmstripBuildParams): FilmstripConfig {
  const intervalSeconds = computeThumbnailInterval(params.pixelsPerSecond);
  const totalThumbnails = computeThumbnailCount(params.videoDuration, intervalSeconds);

  // Compute aspect-ratio-corrected thumbnail height when source dimensions are valid.
  // If metadata probing yields unknown/invalid dimensions, fall back to the default 16:9 height.
  const hasValidSourceDimensions =
    Number.isFinite(params.sourceWidth) &&
    Number.isFinite(params.sourceHeight) &&
    params.sourceWidth > 0 &&
    params.sourceHeight > 0;
  const thumbnailHeight = hasValidSourceDimensions
    ? Math.max(
        Math.round((FILMSTRIP_THUMBNAIL_WIDTH * params.sourceHeight) / params.sourceWidth),
        1,
      )
    : FILMSTRIP_THUMBNAIL_HEIGHT;

  return {
    intervalSeconds,
    thumbnailWidth: FILMSTRIP_THUMBNAIL_WIDTH,
    thumbnailHeight,
    totalThumbnails,
  };
}

/** Cache key for filmstrip data in IndexedDB. */
export function makeFilmstripCacheKey(
  projectId: string,
  clipId: string,
  intervalSeconds: number,
): string {
  return `filmstrip:${projectId}:${clipId}:${intervalSeconds}s`;
}

/**
 * Message types for the filmstrip Web Worker.
 * The Worker receives GenerateFilmstrip and responds with FilmstripProgress/FilmstripResult.
 */
export interface FilmstripWorkerRequest {
  type: 'generate';
  videoBlob: Blob;
  intervalSeconds: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
  codec: string;
}

export interface FilmstripWorkerProgress {
  type: 'progress';
  completed: number;
  total: number;
}

export interface FilmstripWorkerResult {
  type: 'result';
  /** Array of thumbnail ImageBitmaps at each interval timestamp. */
  thumbnails: ImageBitmap[];
  /** Timestamps (in seconds) corresponding to each thumbnail. */
  timestamps: number[];
}

export interface FilmstripWorkerError {
  type: 'error';
  message: string;
}

export type FilmstripWorkerMessage =
  | FilmstripWorkerProgress
  | FilmstripWorkerResult
  | FilmstripWorkerError;
