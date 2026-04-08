/**
 * Batch Export Service — Encode a single AudioBuffer to multiple formats.
 * Also provides auto-fill metadata from project state.
 */

import { audioBufferToWavBlob } from '../utils/wav';
import { encodeToMp3, encodeToFlac } from '../utils/audioEncoders';
import type { ExportFormat, BitDepth, Mp3Bitrate } from '../utils/audioEncoders';
import type { ExportMetadataExtended } from '../types/exportPresets';

export interface BatchEncodeOptions {
  bitDepth: BitDepth;
  mp3Bitrate: Mp3Bitrate;
  oggQuality: number;
  metadata?: ExportMetadataExtended;
}

export interface BatchExportResult {
  format: ExportFormat;
  blob: Blob;
}

/** Project context for auto-filling metadata. */
export interface ProjectMetadataContext {
  projectName?: string;
  bpm?: number;
  key?: string;
}

/**
 * Convert extended metadata (with BPM/key) to the format expected by encoders.
 * Maps bpm → TBPM (ID3) and key → TKEY (ID3) / BPM= and KEY= (Vorbis).
 */
function toEncoderMetadata(meta: ExportMetadataExtended): ExportMetadataExtended {
  return { ...meta };
}

/**
 * Encode an AudioBuffer to a single format synchronously (except OGG which is async).
 * For OGG, use the async variant in exportMix.ts.
 */
export function encodeBufferToFormat(
  buffer: AudioBuffer,
  format: ExportFormat,
  options: BatchEncodeOptions,
): Blob {
  const meta = options.metadata ? toEncoderMetadata(options.metadata) : undefined;

  switch (format) {
    case 'mp3':
      return encodeToMp3(buffer, options.mp3Bitrate, meta);
    case 'flac':
      return encodeToFlac(buffer, options.bitDepth, meta);
    case 'wav':
    default:
      return audioBufferToWavBlob(buffer, options.bitDepth);
  }
}

/**
 * Encode an AudioBuffer to multiple formats from a single render.
 * OGG is excluded from synchronous batch encoding (requires MediaRecorder).
 * Returns results for all synchronous formats.
 */
export function batchEncodeBuffer(
  buffer: AudioBuffer,
  formats: ExportFormat[],
  options: BatchEncodeOptions,
): BatchExportResult[] {
  return formats
    .filter((f) => f !== 'ogg') // OGG requires async MediaRecorder
    .map((format) => ({
      format,
      blob: encodeBufferToFormat(buffer, format, options),
    }));
}

/**
 * Build metadata by auto-filling from project state, merging with any manual overrides.
 * Manual values take precedence over auto-filled values.
 */
export function buildAutoFilledMetadata(
  project: ProjectMetadataContext,
  manual?: Partial<ExportMetadataExtended>,
): ExportMetadataExtended {
  const autoFilled: ExportMetadataExtended = {};

  if (project.projectName) {
    autoFilled.title = project.projectName;
  }
  if (project.bpm !== undefined) {
    autoFilled.bpm = project.bpm;
  }
  if (project.key) {
    autoFilled.key = project.key;
  }

  // Manual values override auto-filled
  return {
    ...autoFilled,
    ...manual,
    // Keep auto-filled BPM/key even if manual doesn't set them
    bpm: manual?.bpm ?? autoFilled.bpm,
    key: manual?.key ?? autoFilled.key,
  };
}
