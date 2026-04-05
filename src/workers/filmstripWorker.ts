/**
 * Filmstrip Worker — generates thumbnail images from video files.
 *
 * Primary path: WebCodecs VideoDecoder (Chrome, Edge, Safari)
 * Fallback: HTMLVideoElement seeking (Firefox, older browsers)
 *
 * Communication protocol:
 *   Main → Worker: { type: 'generate-filmstrip', request: FilmstripGenerationRequest }
 *   Worker → Main: { type: 'filmstrip-complete', result: FilmstripGenerationResult }
 *                 | { type: 'filmstrip-error', error: string }
 *                 | { type: 'filmstrip-progress', progress: number }
 */

interface GenerationRequest {
  videoBlob: Blob;
  videoData: {
    width: number;
    height: number;
    frameRate: number;
    fileDuration: number;
    codec: string;
  };
  intervalSeconds: number;
  thumbWidth: number;
  thumbHeight: number;
}

self.onmessage = async (e: MessageEvent) => {
  if (e.data.type !== 'generate-filmstrip') return;

  const request: GenerationRequest = e.data.request;

  try {
    // Placeholder implementation — generates timecode thumbnails.
    // Will be replaced with real decoding when mp4box.js demuxer is integrated.
    const thumbnails = await generatePlaceholderThumbnails(request);

    self.postMessage({
      type: 'filmstrip-complete',
      result: {
        thumbnails,
        frameCount: thumbnails.length,
        intervalSeconds: request.intervalSeconds,
      },
    });
  } catch (err) {
    self.postMessage({
      type: 'filmstrip-error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

/**
 * Generate placeholder thumbnails with timestamps.
 *
 * NOTE: This is a placeholder implementation. Real frame decoding requires
 * either mp4box.js demuxing + WebCodecs VideoDecoder (Chromium) or
 * HTMLVideoElement seeking on the main thread (all browsers).
 * These placeholders show timecodes and will be replaced by actual frames
 * when the demuxer integration is added.
 */
async function generatePlaceholderThumbnails(request: GenerationRequest): Promise<Blob[]> {
  const { videoData, intervalSeconds, thumbWidth, thumbHeight } = request;
  const frameCount = Math.ceil(videoData.fileDuration / intervalSeconds);
  const thumbnails: Blob[] = [];

  // Generate placeholder thumbnails with frame numbers
  // The main thread will replace these with actual frames
  const canvas = new OffscreenCanvas(thumbWidth, thumbHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot create OffscreenCanvas 2D context');

  for (let i = 0; i < frameCount; i++) {
    const timestamp = i * intervalSeconds;
    const progress = (i + 1) / frameCount;

    // Draw gradient placeholder
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, thumbWidth, thumbHeight);

    // Draw time indicator
    ctx.fillStyle = '#4a4a6a';
    ctx.fillRect(0, thumbHeight - 4, thumbWidth * progress, 4);

    // Draw timestamp text
    ctx.fillStyle = '#888';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    const minutes = Math.floor(timestamp / 60);
    const seconds = Math.floor(timestamp % 60);
    ctx.fillText(
      `${minutes}:${seconds.toString().padStart(2, '0')}`,
      thumbWidth / 2,
      thumbHeight / 2 + 4,
    );

    const blob = await canvas.convertToBlob({ type: 'image/png' });
    thumbnails.push(blob);

    // Report progress
    if (i % 10 === 0) {
      self.postMessage({
        type: 'filmstrip-progress',
        progress,
      });
    }
  }

  return thumbnails;
}
