import { BITS_PER_SAMPLE } from '../constants/defaults';

const SILENCE_UPLOAD_RATE = 16000;
const SILENCE_UPLOAD_CHANNELS = 1;
const SILENCE_UPLOAD_DURATION = 0.1;

/**
 * Generate a minimal silence WAV for upload.
 * The actual generation duration is controlled by the audio_duration API param,
 * so we only need a tiny placeholder (0.1s at 16kHz mono = ~3.2KB instead of
 * full-duration 48kHz stereo which can exceed 11MB).
 *
 * The full-quality version is still available via generateSilenceWavFull() for
 * local playback/mixing.
 */
export function generateSilenceWav(_durationSeconds: number): Blob {
  const numSamples = Math.ceil(SILENCE_UPLOAD_RATE * SILENCE_UPLOAD_DURATION);
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const blockAlign = SILENCE_UPLOAD_CHANNELS * bytesPerSample;
  const dataSize = numSamples * blockAlign;
  const bufferSize = 44 + dataSize;

  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // RIFF header
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeStr(view, 8, 'WAVE');

  // fmt chunk
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);                               // PCM
  view.setUint16(22, SILENCE_UPLOAD_CHANNELS, true);
  view.setUint32(24, SILENCE_UPLOAD_RATE, true);
  view.setUint32(28, SILENCE_UPLOAD_RATE * blockAlign, true);  // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);

  // data chunk (all zeros = silence)
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  // The ArrayBuffer is already zero-initialized

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
