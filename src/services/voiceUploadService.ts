import { useVoiceStore, ACCEPTED_VOICE_MIME_TYPES, MIN_VOICE_SAMPLE_DURATION } from '../store/voiceStore';

/**
 * Validates and processes an uploaded audio file for use as a voice profile.
 * Decodes audio to determine duration, then saves via voiceStore.
 *
 * @returns The created VoiceProfile, or null on validation/processing failure.
 */
export async function uploadVoiceFile(file: File): Promise<string | null> {
  const store = useVoiceStore.getState();

  // Validate MIME type
  const isAccepted = ACCEPTED_VOICE_MIME_TYPES.some((mime) => file.type === mime) ||
    /\.(wav|mp3|flac)$/i.test(file.name);
  if (!isAccepted) {
    store.setError(`Unsupported file type: ${file.type || 'unknown'}. Use WAV, MP3, or FLAC.`);
    return null;
  }

  store.setIsProcessing(true);
  store.setError(null);

  try {
    // Read file as ArrayBuffer and decode
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContext();
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } finally {
      await audioContext.close();
    }

    const duration = audioBuffer.duration;

    if (duration < MIN_VOICE_SAMPLE_DURATION) {
      store.setError(
        `Voice sample is ${Math.round(duration)}s — minimum is ${MIN_VOICE_SAMPLE_DURATION}s.`,
      );
      store.setIsProcessing(false);
      return null;
    }

    // Convert to WAV blob for consistent storage
    const wavBlob = audioBufferToWavBlob(audioBuffer);

    // Generate name from filename without extension
    const name = file.name.replace(/\.[^.]+$/, '') || 'Uploaded Voice';

    const profile = await store.saveVoiceFromBlob({ name, blob: wavBlob, duration });
    return profile?.id ?? null;
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Failed to process audio file.');
    store.setIsProcessing(false);
    return null;
  }
}

/**
 * Convert an AudioBuffer to a WAV Blob for consistent IndexedDB storage.
 * Supports mono and stereo buffers.
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channels and write 16-bit PCM samples
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = headerSize;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
