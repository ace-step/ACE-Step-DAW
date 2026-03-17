/**
 * Procedural drum synthesis and sample caching for the step sequencer.
 * Each drum sound is synthesized from scratch using Web Audio API oscillators,
 * noise bursts, and envelopes — no external audio files required.
 */

const _cache = new Map<string, AudioBuffer>();

function createNoiseBuffer(ctx: BaseAudioContext, duration: number, sampleRate: number): AudioBuffer {
  const length = Math.floor(duration * sampleRate);
  const buf = ctx.createBuffer(1, length, sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

async function renderOffline(
  duration: number,
  sampleRate: number,
  build: (ctx: OfflineAudioContext) => void,
): Promise<AudioBuffer> {
  const length = Math.ceil(duration * sampleRate);
  const offCtx = new OfflineAudioContext(1, length, sampleRate);
  build(offCtx);
  return offCtx.startRendering();
}

function synthKick(sr: number): Promise<AudioBuffer> {
  return renderOffline(0.5, sr, (ctx) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, 0);
    osc.frequency.exponentialRampToValueAtTime(40, 0.12);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    osc.stop(0.5);
  });
}

function synthSnare(sr: number): Promise<AudioBuffer> {
  return renderOffline(0.3, sr, (ctx) => {
    // Tone body
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, 0);
    osc.frequency.exponentialRampToValueAtTime(100, 0.05);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.7, 0);
    oscGain.gain.exponentialRampToValueAtTime(0.001, 0.15);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(0);
    osc.stop(0.3);

    // Noise
    const noiseBuf = createNoiseBuffer(ctx, 0.3, sr);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1500;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.8, 0);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, 0.2);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(0);
  });
}

function synthClosedHH(sr: number): Promise<AudioBuffer> {
  return renderOffline(0.12, sr, (ctx) => {
    const noiseBuf = createNoiseBuffer(ctx, 0.12, sr);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5000;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 10000;
    bp.Q.value = 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.08);

    noise.connect(hp);
    hp.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    noise.start(0);
  });
}

function synthOpenHH(sr: number): Promise<AudioBuffer> {
  return renderOffline(0.4, sr, (ctx) => {
    const noiseBuf = createNoiseBuffer(ctx, 0.4, sr);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5000;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 10000;
    bp.Q.value = 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.35);

    noise.connect(hp);
    hp.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    noise.start(0);
  });
}

function synthClap(sr: number): Promise<AudioBuffer> {
  return renderOffline(0.3, sr, (ctx) => {
    const noiseBuf = createNoiseBuffer(ctx, 0.3, sr);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2500;
    bp.Q.value = 2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, 0);
    gain.gain.linearRampToValueAtTime(0.8, 0.005);
    gain.gain.setValueAtTime(0.3, 0.01);
    gain.gain.linearRampToValueAtTime(0.8, 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.25);

    noise.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    noise.start(0);
  });
}

function synthRim(sr: number): Promise<AudioBuffer> {
  return renderOffline(0.1, sr, (ctx) => {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.06);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 600;
    osc.connect(hp);
    hp.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    osc.stop(0.1);
  });
}

function synthLowTom(sr: number): Promise<AudioBuffer> {
  return renderOffline(0.4, sr, (ctx) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, 0);
    osc.frequency.exponentialRampToValueAtTime(60, 0.15);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.9, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    osc.stop(0.4);
  });
}

function synthHighTom(sr: number): Promise<AudioBuffer> {
  return renderOffline(0.3, sr, (ctx) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, 0);
    osc.frequency.exponentialRampToValueAtTime(100, 0.1);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.9, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    osc.stop(0.3);
  });
}

const SYNTH_MAP: Record<string, (sr: number) => Promise<AudioBuffer>> = {
  kick: synthKick,
  snare: synthSnare,
  closed_hh: synthClosedHH,
  open_hh: synthOpenHH,
  clap: synthClap,
  rim: synthRim,
  low_tom: synthLowTom,
  high_tom: synthHighTom,
};

export async function getSample(
  ctx: AudioContext,
  sampleKey: string,
): Promise<AudioBuffer | null> {
  const cached = _cache.get(sampleKey);
  if (cached) return cached;

  const synth = SYNTH_MAP[sampleKey];
  if (synth) {
    const buf = await synth(ctx.sampleRate);
    _cache.set(sampleKey, buf);
    return buf;
  }

  return null;
}

/**
 * Store a user-provided AudioBuffer in the sample cache.
 */
export function cacheUserSample(key: string, buffer: AudioBuffer) {
  _cache.set(key, buffer);
}

export function getBuiltInSampleIds(): string[] {
  return Object.keys(SYNTH_MAP);
}

export function clearSampleCache() {
  _cache.clear();
}
