const UPLOAD_SAMPLE_RATE = 16000;
const UPLOAD_CHANNELS = 1;

const SKIP_THRESHOLD_BYTES = 500_000; // 500KB — already small enough, skip

/**
 * Downsample a WAV blob to 16kHz mono for faster upload over slow networks.
 * The server resamples to its internal rate anyway, so we don't lose quality
 * that matters for generation context.
 */
export async function downsampleWavBlob(blob: Blob): Promise<Blob> {
  if (blob.size < SKIP_THRESHOLD_BYTES) {
    console.log(`[downsampleWavBlob] blob already small (${(blob.size / 1024).toFixed(0)}KB), skipping`);
    return blob;
  }
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new OfflineAudioContext(UPLOAD_CHANNELS, 1, UPLOAD_SAMPLE_RATE);
  let decoded: AudioBuffer;
  try {
    decoded = await audioCtx.decodeAudioData(arrayBuffer);
  } catch {
    console.warn('[downsampleWavBlob] decode failed, returning original blob');
    return blob;
  }

  const duration = decoded.duration;
  const targetLength = Math.ceil(duration * UPLOAD_SAMPLE_RATE);
  if (targetLength === 0) return blob;

  const offlineCtx = new OfflineAudioContext(UPLOAD_CHANNELS, targetLength, UPLOAD_SAMPLE_RATE);
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start(0);

  const rendered = await offlineCtx.startRendering();
  const result = audioBufferToWav16(rendered);

  console.log(
    `[downsampleWavBlob] ${(blob.size / 1024).toFixed(0)}KB → ${(result.size / 1024).toFixed(0)}KB` +
    ` (${decoded.sampleRate}Hz/${decoded.numberOfChannels}ch → ${UPLOAD_SAMPLE_RATE}Hz/${UPLOAD_CHANNELS}ch)`,
  );
  return result;
}

function audioBufferToWav16(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bitsPerSample = 16;
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = length * blockAlign;
  const bufSize = 44 + dataSize;

  const ab = new ArrayBuffer(bufSize);
  const v = new DataView(ab);

  writeStr(v, 0, 'RIFF');
  v.setUint32(4, bufSize - 8, true);
  writeStr(v, 8, 'WAVE');
  writeStr(v, 12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, numChannels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitsPerSample, true);
  writeStr(v, 36, 'data');
  v.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch));

  let off = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      off += 2;
    }
  }

  return new Blob([ab], { type: 'audio/wav' });
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}
