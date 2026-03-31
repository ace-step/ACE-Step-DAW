/**
 * Pure function to compute trimmed audio samples from a source buffer.
 * Extracted from generationPipeline.ts for testability.
 *
 * Clamps startSample and endSample to valid buffer bounds to prevent
 * out-of-bounds reads that produce NaN in the output.
 */
export interface TrimParams {
  clipStart: number;
  ctxOffset: number;
  clipDuration: number;
  sampleRate: number;
  bufferLength: number;
}

export function trimAudioBuffer(src: Float32Array, params: TrimParams): Float32Array {
  const { clipStart, ctxOffset, clipDuration, sampleRate, bufferLength } = params;
  const startSample = Math.max(0, Math.round((clipStart - ctxOffset) * sampleRate));
  const endSample = Math.min(
    Math.round((clipStart - ctxOffset + clipDuration) * sampleRate),
    bufferLength,
  );
  const trimmedLength = Math.max(1, endSample - startSample);
  const dst = new Float32Array(trimmedLength);
  for (let i = 0; i < trimmedLength; i++) {
    const idx = startSample + i;
    dst[i] = idx < src.length ? src[idx] : 0;
  }
  return dst;
}
