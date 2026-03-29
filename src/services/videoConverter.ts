/**
 * VideoConverter — client-side WebM → MP4 conversion + trim using ffmpeg.wasm.
 * Loaded lazily on first use (~25MB WASM binary, cached by browser after first load).
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1180
 */
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let _ffmpeg: FFmpeg | null = null;
let _loading: Promise<FFmpeg> | null = null;

async function getFFmpeg(onProgress?: (ratio: number) => void): Promise<FFmpeg> {
  if (_ffmpeg?.loaded) return _ffmpeg;
  if (_loading) return _loading;

  _loading = (async () => {
    const ff = new FFmpeg();
    if (onProgress) {
      ff.on('progress', ({ progress }) => onProgress(progress));
    }
    await ff.load();
    _ffmpeg = ff;
    return ff;
  })();

  return _loading;
}

export interface ConvertOptions {
  /** Trim start in seconds (default 0) */
  trimStart?: number;
  /** Trim end in seconds (default = full duration) */
  trimEnd?: number;
  /** Output format */
  format: 'mp4' | 'webm';
  /** Progress callback (0–1) */
  onProgress?: (ratio: number) => void;
}

/**
 * Convert a WebM blob to MP4 (or trim WebM) using ffmpeg.wasm.
 * Runs entirely in the browser — no server needed.
 */
export async function convertVideo(
  inputBlob: Blob,
  options: ConvertOptions,
): Promise<Blob> {
  const ffmpeg = await getFFmpeg(options.onProgress);

  const inputName = 'input.webm';
  const outputExt = options.format === 'mp4' ? 'mp4' : 'webm';
  const outputName = `output.${outputExt}`;

  await ffmpeg.writeFile(inputName, await fetchFile(inputBlob));

  const args: string[] = [];

  // Trim: seek before input for fast seeking
  if (options.trimStart && options.trimStart > 0) {
    args.push('-ss', options.trimStart.toString());
  }

  args.push('-i', inputName);

  if (options.trimEnd && options.trimEnd > 0) {
    const duration = (options.trimEnd - (options.trimStart ?? 0));
    args.push('-t', duration.toString());
  }

  if (options.format === 'mp4') {
    args.push(
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
    );
  } else {
    // WebM trim — re-encode to ensure clean cut
    args.push('-c:v', 'copy', '-c:a', 'copy');
  }

  args.push(outputName);

  await ffmpeg.exec(args);

  const data = await ffmpeg.readFile(outputName);
  const mimeType = options.format === 'mp4' ? 'video/mp4' : 'video/webm';

  // Cleanup temp files
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  // readFile returns Uint8Array (with ArrayBufferLike); slice to get a proper ArrayBuffer for Blob
  const bytes = data as Uint8Array;
  return new Blob([bytes.slice().buffer as ArrayBuffer], { type: mimeType });
}

/** Check if ffmpeg.wasm has already been loaded (cached). */
export function isFFmpegLoaded(): boolean {
  return _ffmpeg?.loaded === true;
}
