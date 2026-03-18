import { audioBufferToWavBlob } from '../utils/wav';

export async function exportMixToWav(
  clips: Array<{ startTime: number; buffer: AudioBuffer; volume: number; pan?: number }>,
  totalDuration: number,
  sampleRate: number = 48000,
): Promise<Blob> {
  const length = Math.ceil(totalDuration * sampleRate);
  const offlineCtx = new OfflineAudioContext(2, length, sampleRate);

  for (const clip of clips) {
    const source = offlineCtx.createBufferSource();
    source.buffer = clip.buffer;

    const gain = offlineCtx.createGain();
    gain.gain.value = clip.volume;

    // Apply stereo pan using a StereoPannerNode when pan is non-zero
    const pan = clip.pan ?? 0;
    if (pan !== 0) {
      const panner = offlineCtx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      source.connect(gain);
      gain.connect(panner);
      panner.connect(offlineCtx.destination);
    } else {
      source.connect(gain);
      gain.connect(offlineCtx.destination);
    }

    source.start(clip.startTime);
  }

  const rendered = await offlineCtx.startRendering();
  return audioBufferToWavBlob(rendered);
}
