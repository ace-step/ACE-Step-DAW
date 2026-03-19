declare module 'libflacjs/dist/libflac.js' {
  export function create_libflac_encoder(
    sampleRate: number,
    channels: number,
    bitsPerSample: number,
    compressionLevel: number,
    totalSamples?: number,
    verify?: boolean,
    blockSize?: number,
  ): number;

  export function init_encoder_stream(
    encoder: number,
    writeCallback: (data: Uint8Array, numberOfBytes: number, samples: number, currentFrame: number) => void | false,
  ): number;

  export function FLAC__stream_encoder_process_interleaved(
    encoder: number,
    buffer: Int32Array,
    numSamples: number,
  ): boolean;

  export function FLAC__stream_encoder_finish(encoder: number): boolean;
  export function FLAC__stream_encoder_delete(encoder: number): void;
}
