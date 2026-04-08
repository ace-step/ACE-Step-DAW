import { useVoiceStore, ACCEPTED_VOICE_MIME_TYPES, MIN_VOICE_SAMPLE_DURATION } from '../store/voiceStore';
import { audioBufferToWavBlob } from '../utils/wav';

/**
 * Validates and processes an uploaded audio file for use as a voice profile.
 * Decodes audio to determine duration, then saves via voiceStore.
 *
 * @returns The created profile ID, or null on validation/processing failure.
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
