import { get, set, del } from 'idb-keyval';
import type { VideoClipData } from '../types/project';

/** Standard thumbnail dimensions (16:9). */
export const FILMSTRIP_THUMB_WIDTH = 160;
export const FILMSTRIP_THUMB_HEIGHT = 90;

/** Zoom-level adaptive density configuration. */
export interface FilmstripDensity {
  /** Minimum pixels-per-second threshold for this tier. */
  minPixelsPerSecond: number;
  /** Interval between thumbnails in seconds. */
  intervalSeconds: number;
}

export const FILMSTRIP_DENSITY_TIERS: FilmstripDensity[] = [
  { minPixelsPerSecond: 100, intervalSeconds: 0.5 },
  { minPixelsPerSecond: 20,  intervalSeconds: 2 },
  { minPixelsPerSecond: 0,   intervalSeconds: 10 },
];

/**
 * Get the thumbnail interval for a given zoom level (pixels per second).
 */
export function getFilmstripInterval(pixelsPerSecond: number): number {
  for (const tier of FILMSTRIP_DENSITY_TIERS) {
    if (pixelsPerSecond >= tier.minPixelsPerSecond) {
      return tier.intervalSeconds;
    }
  }
  return 10;
}

/**
 * Calculate how many frames to generate for a given duration and interval.
 */
export function calculateFrameCount(durationSeconds: number, intervalSeconds: number): number {
  if (durationSeconds <= 0 || intervalSeconds <= 0) return 0;
  return Math.ceil(durationSeconds / intervalSeconds);
}

/**
 * Calculate the timestamps (in seconds) at which to capture frames.
 */
export function calculateFrameTimestamps(
  durationSeconds: number,
  intervalSeconds: number,
): number[] {
  const count = calculateFrameCount(durationSeconds, intervalSeconds);
  const timestamps: number[] = [];
  for (let i = 0; i < count; i++) {
    timestamps.push(i * intervalSeconds);
  }
  return timestamps;
}

/**
 * Scale dimensions to fit within the standard thumbnail size while preserving aspect ratio.
 */
export function calculateThumbnailDimensions(
  sourceWidth: number,
  sourceHeight: number,
): { width: number; height: number } {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { width: FILMSTRIP_THUMB_WIDTH, height: FILMSTRIP_THUMB_HEIGHT };
  }
  const sourceAspect = sourceWidth / sourceHeight;
  const thumbAspect = FILMSTRIP_THUMB_WIDTH / FILMSTRIP_THUMB_HEIGHT;

  if (sourceAspect > thumbAspect) {
    // Source is wider — fit to width
    return {
      width: FILMSTRIP_THUMB_WIDTH,
      height: Math.round(FILMSTRIP_THUMB_WIDTH / sourceAspect),
    };
  }
  // Source is taller — fit to height
  return {
    width: Math.round(FILMSTRIP_THUMB_HEIGHT * sourceAspect),
    height: FILMSTRIP_THUMB_HEIGHT,
  };
}

// ─── IndexedDB Cache ─────────────────────────────────────────────────────────

/** Cache key format for filmstrip data. */
function makeFilmstripKey(projectId: string, clipId: string, intervalSeconds: number): string {
  return `filmstrip:${projectId}:${clipId}:${intervalSeconds}s`;
}

/** Stored filmstrip data in IndexedDB. */
export interface CachedFilmstrip {
  /** Array of thumbnail image blobs (PNG). */
  thumbnails: Blob[];
  /** Interval between frames in seconds. */
  intervalSeconds: number;
  /** Number of frames. */
  frameCount: number;
  /** Timestamp when generated. */
  generatedAt: number;
}

/**
 * Save filmstrip thumbnails to IndexedDB cache.
 */
export async function saveFilmstripCache(
  projectId: string,
  clipId: string,
  filmstrip: CachedFilmstrip,
): Promise<string> {
  const key = makeFilmstripKey(projectId, clipId, filmstrip.intervalSeconds);
  await set(key, filmstrip);
  return key;
}

/**
 * Load cached filmstrip from IndexedDB.
 */
export async function loadFilmstripCache(
  projectId: string,
  clipId: string,
  intervalSeconds: number,
): Promise<CachedFilmstrip | undefined> {
  const key = makeFilmstripKey(projectId, clipId, intervalSeconds);
  return get<CachedFilmstrip>(key);
}

/**
 * Delete cached filmstrip.
 */
export async function deleteFilmstripCache(
  projectId: string,
  clipId: string,
  intervalSeconds: number,
): Promise<void> {
  const key = makeFilmstripKey(projectId, clipId, intervalSeconds);
  await del(key);
}

// ─── Worker Management ───────────────────────────────────────────────────────

export interface FilmstripGenerationRequest {
  videoBlob: Blob;
  videoData: VideoClipData;
  intervalSeconds: number;
  thumbWidth: number;
  thumbHeight: number;
}

export interface FilmstripGenerationResult {
  thumbnails: ImageBitmap[] | Blob[];
  frameCount: number;
  intervalSeconds: number;
}

let filmstripWorker: Worker | null = null;

/**
 * Get or create the filmstrip worker instance.
 */
function getFilmstripWorker(): Worker {
  if (!filmstripWorker) {
    filmstripWorker = new Worker(
      new URL('../workers/filmstripWorker.ts', import.meta.url),
      { type: 'module' },
    );
  }
  return filmstripWorker;
}

/**
 * Generate filmstrip thumbnails in a background worker.
 * Returns a promise that resolves with thumbnail Blobs.
 */
export function generateFilmstrip(
  request: FilmstripGenerationRequest,
): Promise<FilmstripGenerationResult> {
  return new Promise((resolve, reject) => {
    const worker = getFilmstripWorker();

    const handler = (e: MessageEvent) => {
      if (e.data.type === 'filmstrip-complete') {
        worker.removeEventListener('message', handler);
        worker.removeEventListener('error', errorHandler);
        resolve(e.data.result as FilmstripGenerationResult);
      } else if (e.data.type === 'filmstrip-error') {
        worker.removeEventListener('message', handler);
        worker.removeEventListener('error', errorHandler);
        reject(new Error(e.data.error));
      }
    };

    const errorHandler = (e: ErrorEvent) => {
      worker.removeEventListener('message', handler);
      worker.removeEventListener('error', errorHandler);
      reject(new Error(`Filmstrip worker error: ${e.message}`));
    };

    worker.addEventListener('message', handler);
    worker.addEventListener('error', errorHandler);

    worker.postMessage({
      type: 'generate-filmstrip',
      request,
    });
  });
}

/**
 * Terminate the filmstrip worker (for cleanup).
 */
export function terminateFilmstripWorker(): void {
  if (filmstripWorker) {
    filmstripWorker.terminate();
    filmstripWorker = null;
  }
}
