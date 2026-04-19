/**
 * Drum engine — per-pad synthesized voices + effect chain.
 *
 * Phase 5N migration: voices use the existing native drum synth
 * classes in `dsp/NativeSynths.ts` (`NativeMembraneSynth`,
 * `NativeNoiseSynth`, `NativeMetalSynth`). The pad effect chain
 * swaps Tone.Filter / Distortion / Gain / Panner for native
 * primitives (BiquadFilterNode, WaveShaperNode, GainNode,
 * StereoPannerNode).
 *
 * Limitations introduced by this migration (tracked as follow-ups):
 * - `setDetune` is a no-op on the native drum voices — the native
 *   synth classes don't expose a live detune param. UI `tune` still
 *   persists to state; audible tune changes will land when the
 *   native drum synths grow a detune bus.
 * - `schedulePattern` uses setTimeout-based scheduling instead of
 *   Tone.Transport.scheduleRepeat. Close enough for the 1 or 2
 *   call sites that legacy-exercise pattern playback; the main
 *   sequencer path runs via `engine.scheduleMidiEvent` upstream.
 */
import type { DrumKitName, DrumPadFilter, DrumPadSend } from '../types/project';
import { getAudioEngine } from '../hooks/useAudioEngine';
import {
  NativeMembraneSynth,
  NativeNoiseSynth,
  NativeMetalSynth,
} from './dsp/NativeSynths';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DrumVoice {
  trigger: (time?: number, velocity?: number) => void;
  dispose: () => void;
  /** Set detune in semitones (-24 to +24). No-op on native voices. */
  setDetune?: (semitones: number) => void;
}

/** Per-pad chain: filter → distortion → volumeGain → decayGain → panner → output. */
interface PadEffectChain {
  filter: BiquadFilterNode;
  distortion: WaveShaperNode;
  /** Drive 0..1 controls the shaping curve strength via distortionGain. */
  distortionGain: GainNode;
  /** Store the drive level for later queries. */
  drive: number;
  /** Steady-state per-pad volume — synced from pad.volume via updatePadParams */
  volumeGain: GainNode;
  /** Decay envelope gain — ramped per trigger, separate from volume */
  decayGain: GainNode;
  panner: StereoPannerNode;
  /** Decay scale 0–1: controls how quickly decayGain fades after trigger */
  decayScale: number;
  /** Send amounts stored for return track routing */
  sendReverb: number;
  sendDelay: number;
  dispose: () => void;
}

function makeSoftClipCurve(amount: number): Float32Array<ArrayBuffer> {
  // Standard soft-clip curve. `amount` in [0, 1] increases the
  // saturation strength; 0 → near-linear, 1 → strong clip.
  const k = Math.max(0, Math.min(1, amount)) * 100;
  const samples = 1024;
  const curve = new Float32Array(samples);
  const denom = Math.PI + k;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
    curve[i] = curve[i] * (Math.PI / denom);
  }
  // Cast to the strict ArrayBuffer variant for WaveShaperNode.curve typing.
  return curve as Float32Array<ArrayBuffer>;
}

function createPadEffectChain(ctx: AudioContext, connectTo?: AudioNode): PadEffectChain {

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 20000;

  const distortion = ctx.createWaveShaper();
  distortion.curve = makeSoftClipCurve(0);
  const distortionGain = ctx.createGain();
  distortionGain.gain.value = 1;

  const volumeGain = ctx.createGain();
  volumeGain.gain.value = 1;

  const decayGain = ctx.createGain();
  decayGain.gain.value = 1;

  const panner = ctx.createStereoPanner();
  panner.pan.value = 0;

  // Chain: filter → distortion → distortionGain → volumeGain → decayGain → panner → output
  filter.connect(distortion);
  distortion.connect(distortionGain);
  distortionGain.connect(volumeGain);
  volumeGain.connect(decayGain);
  decayGain.connect(panner);
  panner.connect(connectTo ?? ctx.destination);

  return {
    filter,
    distortion,
    distortionGain,
    drive: 0,
    volumeGain,
    decayGain,
    panner,
    decayScale: 1,
    sendReverb: 0,
    sendDelay: 0,
    dispose() {
      try { filter.disconnect(); } catch { /* already disconnected */ }
      try { distortion.disconnect(); } catch { /* already disconnected */ }
      try { distortionGain.disconnect(); } catch { /* already disconnected */ }
      try { volumeGain.disconnect(); } catch { /* already disconnected */ }
      try { decayGain.disconnect(); } catch { /* already disconnected */ }
      try { panner.disconnect(); } catch { /* already disconnected */ }
    },
  };
}

export interface DrumPatternStep {
  active: boolean;
  velocity: number; // 0–127
}

export interface DrumPatternTrack {
  name: string;
  padIndex: number;
  steps: DrumPatternStep[];
  volume: number; // 0–1
  mute: boolean;
}

export interface DrumPattern {
  steps: number;
  swing: number; // 0–100
  tracks: DrumPatternTrack[];
}

export const DRUM_PAD_NAMES = [
  'Kick', 'Snare', 'Hi-Hat Closed', 'Hi-Hat Open',
  'Clap', 'Rim', 'Tom High', 'Tom Low',
  'Crash', 'Ride', 'Shaker', 'Cowbell',
  'Conga', 'Bongo', 'Tambourine', 'Perc',
];

export const BEAT_PAD_KEYS: string[] = [
  'z', 'x', 'c', 'v',
  'a', 's', 'd', 'f',
  'q', 'w', 'e', 'r',
  '1', '2', '3', '4',
];

// ─── Synthesized Drum Sound Generators ──────────────────────────────────────

function createKick808(ctx: AudioContext, connectTo?: AudioNode): DrumVoice {
  const synth = new NativeMembraneSynth(ctx, {
    pitchDecay: 0.08,
    octaves: 6,
    envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.5 },
  });
  synth.connectNative(connectTo ?? ctx.destination);
  return {
    trigger: (time, vel = 1) => synth.triggerAttackRelease('C1', 0.25, time, vel),
    dispose: () => synth.dispose(),
  };
}

function createKickAcoustic(ctx: AudioContext, connectTo?: AudioNode): DrumVoice {
  const synth = new NativeMembraneSynth(ctx, {
    pitchDecay: 0.05,
    octaves: 4,
    envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.3 },
  });
  synth.connectNative(connectTo ?? ctx.destination);
  return {
    trigger: (time, vel = 1) => synth.triggerAttackRelease('D1', 0.25, time, vel),
    dispose: () => synth.dispose(),
  };
}

function createSnare808(ctx: AudioContext, connectTo?: AudioNode): DrumVoice {
  const noise = new NativeNoiseSynth(ctx, {
    envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.15 },
  });
  const body = new NativeMembraneSynth(ctx, {
    pitchDecay: 0.03,
    octaves: 3,
    envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
  });
  const dest = connectTo ?? ctx.destination;
  noise.connectNative(dest);
  body.connectNative(dest);
  return {
    trigger: (time, vel = 1) => {
      noise.triggerAttackRelease(0.125, time, vel * 0.7);
      body.triggerAttackRelease('E2', 0.125, time, vel * 0.5);
    },
    dispose: () => { noise.dispose(); body.dispose(); },
  };
}

function createSnareAcoustic(ctx: AudioContext, connectTo?: AudioNode): DrumVoice {
  const noise = new NativeNoiseSynth(ctx, {
    envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
  });
  const body = new NativeMembraneSynth(ctx, {
    pitchDecay: 0.02,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.1 },
  });
  const dest = connectTo ?? ctx.destination;
  noise.connectNative(dest);
  body.connectNative(dest);
  return {
    trigger: (time, vel = 1) => {
      noise.triggerAttackRelease(0.125, time, vel * 0.8);
      body.triggerAttackRelease('G2', 0.125, time, vel * 0.4);
    },
    dispose: () => { noise.dispose(); body.dispose(); },
  };
}

function createHiHatClosed(ctx: AudioContext, connectTo?: AudioNode): DrumVoice {
  const noise = new NativeNoiseSynth(ctx, {
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.03 },
  });
  noise.connectNative(connectTo ?? ctx.destination);
  return {
    trigger: (time, vel = 1) => noise.triggerAttackRelease(0.0625, time, vel * 0.6),
    dispose: () => noise.dispose(),
  };
}

function createHiHatOpen(ctx: AudioContext, connectTo?: AudioNode): DrumVoice {
  const noise = new NativeNoiseSynth(ctx, {
    envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 },
  });
  noise.connectNative(connectTo ?? ctx.destination);
  return {
    trigger: (time, vel = 1) => noise.triggerAttackRelease(0.25, time, vel * 0.6),
    dispose: () => noise.dispose(),
  };
}

function createClap(ctx: AudioContext, connectTo?: AudioNode): DrumVoice {
  const noise = new NativeNoiseSynth(ctx, {
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 },
  });
  noise.connectNative(connectTo ?? ctx.destination);
  return {
    trigger: (time, vel = 1) => noise.triggerAttackRelease(0.125, time, vel * 0.8),
    dispose: () => noise.dispose(),
  };
}

function createRim(ctx: AudioContext, connectTo?: AudioNode): DrumVoice {
  const synth = new NativeMetalSynth(ctx, {
    frequency: 400,
    envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
    harmonicity: 5.1,
    modulationIndex: 10,
  });
  synth.connectNative(connectTo ?? ctx.destination);
  return {
    trigger: (time, vel = 1) => synth.triggerAttackRelease(0.0625, time, vel * 0.5),
    dispose: () => synth.dispose(),
  };
}

function createTomHigh(ctx: AudioContext, connectTo?: AudioNode): DrumVoice {
  const synth = new NativeMembraneSynth(ctx, {
    pitchDecay: 0.04,
    octaves: 3,
    envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.15 },
  });
  synth.connectNative(connectTo ?? ctx.destination);
  return {
    trigger: (time, vel = 1) => synth.triggerAttackRelease('G2', 0.25, time, vel),
    dispose: () => synth.dispose(),
  };
}

function createTomLow(ctx: AudioContext, connectTo?: AudioNode): DrumVoice {
  const synth = new NativeMembraneSynth(ctx, {
    pitchDecay: 0.04,
    octaves: 3,
    envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 },
  });
  synth.connectNative(connectTo ?? ctx.destination);
  return {
    trigger: (time, vel = 1) => synth.triggerAttackRelease('D2', 0.25, time, vel),
    dispose: () => synth.dispose(),
  };
}

function createCrash(ctx: AudioContext, connectTo?: AudioNode): DrumVoice {
  const noise = new NativeNoiseSynth(ctx, {
    envelope: { attack: 0.001, decay: 1.5, sustain: 0, release: 1.0 },
  });
  const metal = new NativeMetalSynth(ctx, {
    frequency: 300,
    envelope: { attack: 0.001, decay: 1.2, release: 0.5 },
    harmonicity: 5.1,
    modulationIndex: 32,
  });
  const dest = connectTo ?? ctx.destination;
  noise.connectNative(dest);
  metal.connectNative(dest);
  return {
    trigger: (time, vel = 1) => {
      noise.triggerAttackRelease(0.5, time, vel * 0.4);
      metal.triggerAttackRelease(0.5, time, vel * 0.3);
    },
    dispose: () => { noise.dispose(); metal.dispose(); },
  };
}

function createRide(ctx: AudioContext, connectTo?: AudioNode): DrumVoice {
  const metal = new NativeMetalSynth(ctx, {
    frequency: 400,
    envelope: { attack: 0.001, decay: 0.6, release: 0.3 },
    harmonicity: 5.1,
    modulationIndex: 20,
  });
  metal.connectNative(connectTo ?? ctx.destination);
  return {
    trigger: (time, vel = 1) => metal.triggerAttackRelease(0.25, time, vel * 0.4),
    dispose: () => metal.dispose(),
  };
}

function createShaker(ctx: AudioContext, connectTo?: AudioNode): DrumVoice {
  const noise = new NativeNoiseSynth(ctx, {
    envelope: { attack: 0.005, decay: 0.06, sustain: 0, release: 0.04 },
  });
  noise.connectNative(connectTo ?? ctx.destination);
  return {
    trigger: (time, vel = 1) => noise.triggerAttackRelease(0.0625, time, vel * 0.5),
    dispose: () => noise.dispose(),
  };
}

function createCowbell(ctx: AudioContext, connectTo?: AudioNode): DrumVoice {
  const synth = new NativeMetalSynth(ctx, {
    frequency: 560,
    envelope: { attack: 0.001, decay: 0.2, release: 0.1 },
    harmonicity: 1.4,
    modulationIndex: 2,
  });
  synth.connectNative(connectTo ?? ctx.destination);
  return {
    trigger: (time, vel = 1) => synth.triggerAttackRelease(0.125, time, vel * 0.6),
    dispose: () => synth.dispose(),
  };
}

function createConga(ctx: AudioContext, connectTo?: AudioNode): DrumVoice {
  const synth = new NativeMembraneSynth(ctx, {
    pitchDecay: 0.03,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
  });
  synth.connectNative(connectTo ?? ctx.destination);
  return {
    trigger: (time, vel = 1) => synth.triggerAttackRelease('A2', 0.125, time, vel * 0.7),
    dispose: () => synth.dispose(),
  };
}

function createBongo(ctx: AudioContext, connectTo?: AudioNode): DrumVoice {
  const synth = new NativeMembraneSynth(ctx, {
    pitchDecay: 0.02,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.08 },
  });
  synth.connectNative(connectTo ?? ctx.destination);
  return {
    trigger: (time, vel = 1) => synth.triggerAttackRelease('D3', 0.125, time, vel * 0.7),
    dispose: () => synth.dispose(),
  };
}

function createTambourine(ctx: AudioContext, connectTo?: AudioNode): DrumVoice {
  const noise = new NativeNoiseSynth(ctx, {
    envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.08 },
  });
  noise.connectNative(connectTo ?? ctx.destination);
  return {
    trigger: (time, vel = 1) => noise.triggerAttackRelease(0.125, time, vel * 0.5),
    dispose: () => noise.dispose(),
  };
}

function createPerc(ctx: AudioContext, connectTo?: AudioNode): DrumVoice {
  const synth = new NativeMetalSynth(ctx, {
    frequency: 200,
    envelope: { attack: 0.001, decay: 0.08, release: 0.04 },
    harmonicity: 3.1,
    modulationIndex: 8,
  });
  synth.connectNative(connectTo ?? ctx.destination);
  return {
    trigger: (time, vel = 1) => synth.triggerAttackRelease(0.0625, time, vel * 0.5),
    dispose: () => synth.dispose(),
  };
}

type VoiceFactory = (ctx: AudioContext, connectTo?: AudioNode) => DrumVoice;

const KIT_FACTORIES: Record<DrumKitName, VoiceFactory[]> = {
  '808': [
    createKick808, createSnare808, createHiHatClosed, createHiHatOpen,
    createClap, createRim, createTomHigh, createTomLow,
    createCrash, createRide, createShaker, createCowbell,
    createConga, createBongo, createTambourine, createPerc,
  ],
  acoustic: [
    createKickAcoustic, createSnareAcoustic, createHiHatClosed, createHiHatOpen,
    createClap, createRim, createTomHigh, createTomLow,
    createCrash, createRide, createShaker, createCowbell,
    createConga, createBongo, createTambourine, createPerc,
  ],
  electronic: [
    createKick808, createSnare808, createHiHatClosed, createHiHatOpen,
    createClap, createRim, createTomHigh, createTomLow,
    createCrash, createRide, createShaker, createCowbell,
    createConga, createBongo, createTambourine, createPerc,
  ],
  lofi: [
    createKickAcoustic, createSnareAcoustic, createHiHatClosed, createHiHatOpen,
    createClap, createRim, createTomHigh, createTomLow,
    createCrash, createRide, createShaker, createCowbell,
    createConga, createBongo, createTambourine, createPerc,
  ],
};

/**
 * Build voices for the given kit, bound to `ctx`. Pass the same ctx
 * as whichever AudioNode `connectTo` lives on (live or offline) to
 * avoid cross-context connection errors. When `ctx` is omitted, we
 * fall back to the live engine's context for back-compat with UI
 * call sites.
 */
export function createDrumVoicesForKit(
  kit: DrumKitName,
  connectTo?: AudioNode,
  ctx?: AudioContext,
): DrumVoice[] {
  const audioCtx = ctx ?? getAudioEngine().ctx;
  return KIT_FACTORIES[kit].map((factory) => factory(audioCtx, connectTo));
}

// ─── Pattern Presets ─────────────────────────────────────────────────────────

function emptySteps(n: number): DrumPatternStep[] {
  return Array.from({ length: n }, () => ({ active: false, velocity: 100 }));
}

function p(pattern: string): DrumPatternStep[] {
  return pattern.split('').map((ch) => ({
    active: ch !== '.',
    velocity: ch === 'X' ? 127 : ch === 'x' ? 100 : ch === 'o' ? 70 : 0,
  }));
}

function makePreset(name: string, patterns: Partial<Record<string, string>>): { name: string; pattern: DrumPattern } {
  const steps = Object.values(patterns)[0]?.length ?? 16;
  return {
    name,
    pattern: {
      steps,
      swing: 0,
      tracks: DRUM_PAD_NAMES.map((padName, i) => ({
        name: padName,
        padIndex: i,
        steps: patterns[padName] ? p(patterns[padName]!) : emptySteps(steps),
        volume: 0.8,
        mute: false,
      })),
    },
  };
}

export const DRUM_PRESETS = [
  makePreset('Rock 4/4', {
    'Kick':           'x...x...x...x...',
    'Snare':          '....x.......x...',
    'Hi-Hat Closed':  'x.x.x.x.x.x.x.x.',
  }),
  makePreset('Pop Beat', {
    'Kick':           'x...x...x..x....',
    'Snare':          '....x.......x...',
    'Hi-Hat Closed':  'x.x.x.x.x.x.x.x.',
    'Hi-Hat Open':    '..............x.',
  }),
  makePreset('Hip-Hop', {
    'Kick':           'x..x..x...x.....',
    'Snare':          '....x.......x...',
    'Hi-Hat Closed':  'x.xxx.x.x.xxx.x.',
    'Clap':           '....x.......x...',
  }),
  makePreset('EDM Four-on-the-floor', {
    'Kick':           'x...x...x...x...',
    'Clap':           '....x.......x...',
    'Hi-Hat Closed':  'x.x.x.x.x.x.x.x.',
    'Hi-Hat Open':    '..x...x...x...x.',
  }),
  makePreset('Reggae One-Drop', {
    'Kick':           '............x...',
    'Snare':          '............x...',
    'Hi-Hat Closed':  'x.x.x.x.x.x.x.x.',
    'Rim':            '....x.......x...',
  }),
  makePreset('Jazz Swing', {
    'Kick':           'x.....x.....x...',
    'Snare':          '........x.......',
    'Ride':           'x..x.xx..x.xx..x',
    'Hi-Hat Closed':  '....x.......x...',
  }),
  makePreset('Bossa Nova', {
    'Kick':           'x..x..x..x......',
    'Rim':            '...x..x...x..x..',
    'Hi-Hat Closed':  'x.x.x.x.x.x.x.x.',
    'Shaker':         'xxxxxxxxxxxxxxxx',
  }),
  {
    name: 'Empty',
    pattern: {
      steps: 16,
      swing: 0,
      tracks: DRUM_PAD_NAMES.map((name, i) => ({
        name,
        padIndex: i,
        steps: emptySteps(16),
        volume: 0.8,
        mute: false,
      })),
    },
  },
];

// ─── Drum Engine Class ──────────────────────────────────────────────────────

export interface PadParams {
  tune?: number;
  decay?: number;
  volume?: number;
  pan?: number;
  filter?: DrumPadFilter;
  drive?: number;
  send?: DrumPadSend;
}

class DrumEngine {
  private voices = new Map<string, DrumVoice[]>();
  private padChains = new Map<string, PadEffectChain[]>();
  private currentKit = new Map<string, DrumKitName>();
  private scheduledIntervals = new Map<string, ReturnType<typeof setTimeout>[]>();

  async ensureStarted() {
    const engine = getAudioEngine();
    if (engine?.ctx?.state && engine.ctx.state !== 'running') {
      await engine.resume();
    }
  }

  async ensureTrack(trackId: string, kit: DrumKitName = '808') {
    await this.ensureStarted();
    const existing = this.currentKit.get(trackId);
    if (existing === kit && this.voices.has(trackId)) return;

    this.disposeTrack(trackId);

    const ctx = getAudioEngine().ctx;
    const chains: PadEffectChain[] = [];
    const factories = KIT_FACTORIES[kit];
    const voices: DrumVoice[] = [];

    for (let i = 0; i < factories.length; i++) {
      const chain = createPadEffectChain(ctx);
      chains.push(chain);
      const voice = factories[i](ctx, chain.filter);
      voices.push(voice);
    }

    this.padChains.set(trackId, chains);
    this.voices.set(trackId, voices);
    this.currentKit.set(trackId, kit);
  }

  updatePadParams(trackId: string, padIndex: number, params: PadParams) {
    const chains = this.padChains.get(trackId);
    const voices = this.voices.get(trackId);
    if (!chains || padIndex < 0 || padIndex >= chains.length) return;

    const chain = chains[padIndex];

    if (params.volume !== undefined) {
      chain.volumeGain.gain.value = params.volume;
    }
    if (params.pan !== undefined) {
      chain.panner.pan.value = params.pan;
    }
    if (params.filter !== undefined) {
      if (params.filter.type === 'off') {
        chain.filter.frequency.value = 20000;
        chain.filter.type = 'lowpass';
      } else {
        chain.filter.type = params.filter.type;
        chain.filter.frequency.value = params.filter.cutoff;
      }
    }
    if (params.drive !== undefined) {
      chain.drive = params.drive;
      chain.distortion.curve = makeSoftClipCurve(params.drive);
    }
    if (params.tune !== undefined && voices) {
      // setDetune is a no-op on native drum voices (see file header).
      voices[padIndex].setDetune?.(params.tune);
    }
    if (params.decay !== undefined) {
      chain.decayScale = params.decay;
    }
    if (params.send !== undefined) {
      chain.sendReverb = params.send.reverb;
      chain.sendDelay = params.send.delay;
    }
  }

  syncTrackPadParams(trackId: string, pads: ReadonlyArray<{ volume: number; tune: number; decay: number; pan: number; filter: DrumPadFilter; drive: number; send: DrumPadSend }>) {
    if (!this.padChains.has(trackId)) return;
    for (let i = 0; i < pads.length; i++) {
      this.updatePadParams(trackId, i, {
        volume: pads[i].volume,
        pan: pads[i].pan,
        tune: pads[i].tune,
        decay: pads[i].decay,
        filter: pads[i].filter,
        drive: pads[i].drive,
        send: pads[i].send,
      });
    }
  }

  async ensureAndSyncPadParams(trackId: string, kit: DrumKitName, pads: ReadonlyArray<{ volume: number; tune: number; decay: number; pan: number; filter: DrumPadFilter; drive: number; send: DrumPadSend }>) {
    await this.ensureTrack(trackId, kit);
    this.syncTrackPadParams(trackId, pads);
  }

  private applyDecayEnvelope(chain: PadEffectChain, time: number) {
    if (chain.decayScale >= 0.999) return;
    const g = chain.decayGain.gain;
    g.cancelScheduledValues(time);
    g.setValueAtTime(1, time);
    const fadeTime = 0.02 + chain.decayScale * 1.98;
    g.linearRampToValueAtTime(0.001, time + fadeTime);
  }

  async triggerPad(
    trackId: string,
    padIndex: number,
    velocity = 100,
    kit: DrumKitName = '808',
    pads?: ReadonlyArray<{ volume: number; tune: number; decay: number; pan: number; filter: DrumPadFilter; drive: number; send: DrumPadSend }>,
  ) {
    await this.ensureTrack(trackId, kit);
    if (pads) this.syncTrackPadParams(trackId, pads);
    const voices = this.voices.get(trackId);
    const chains = this.padChains.get(trackId);
    if (!voices || padIndex < 0 || padIndex >= voices.length) return;
    const vel = Math.max(0, Math.min(127, velocity)) / 127;
    const ctx = getAudioEngine().ctx;
    const time = ctx.currentTime;

    if (chains) {
      this.applyDecayEnvelope(chains[padIndex], time);
    }

    voices[padIndex].trigger(time, vel);
  }

  /**
   * Schedule a drum pattern for playback. Native scheduling via
   * `setTimeout` — not sample-accurate, but adequate for the
   * legacy-only callers of this method (main sequencer path runs
   * through `engine.scheduleMidiEvent` upstream).
   */
  schedulePattern(
    trackId: string,
    pattern: DrumPattern,
    bpm: number,
    startTime: number,
    regionDuration: number,
  ) {
    this.unschedulePattern(trackId);
    const voices = this.voices.get(trackId);
    const chains = this.padChains.get(trackId);
    if (!voices) return;

    const ctx = getAudioEngine().ctx;
    const secondsPerStep = (60 / bpm) / 4;
    const patternDuration = pattern.steps * secondsPerStep;
    const ids: ReturnType<typeof setTimeout>[] = [];
    const regionEnd = startTime + regionDuration;
    const now = ctx.currentTime;

    for (const drumTrack of pattern.tracks) {
      if (drumTrack.mute) continue;
      for (let step = 0; step < drumTrack.steps.length; step++) {
        const s = drumTrack.steps[step];
        if (!s.active) continue;

        let stepOffset = step * secondsPerStep;
        if (step % 2 === 1 && pattern.swing > 0) {
          stepOffset += (pattern.swing / 100) * secondsPerStep * 0.5;
        }

        const vel = (s.velocity / 127) * drumTrack.volume;
        const padIdx = drumTrack.padIndex;
        const firstHit = startTime + stepOffset;

        // Schedule each loop iteration that falls within the region.
        let hit = firstHit;
        while (hit < regionEnd) {
          const delayMs = Math.max(0, (hit - now) * 1000);
          const scheduledHit = hit;
          const id = setTimeout(() => {
            if (voices[padIdx]) {
              if (chains?.[padIdx]) this.applyDecayEnvelope(chains[padIdx], ctx.currentTime);
              voices[padIdx].trigger(ctx.currentTime, vel);
            }
            // Keep TS happy — using the captured value silences
            // unused-var warnings if introduced later.
            void scheduledHit;
          }, delayMs);
          ids.push(id);
          hit += patternDuration;
        }
      }
    }

    this.scheduledIntervals.set(trackId, ids);
  }

  unschedulePattern(trackId: string) {
    const ids = this.scheduledIntervals.get(trackId);
    if (ids) {
      for (const id of ids) clearTimeout(id);
      this.scheduledIntervals.delete(trackId);
    }
  }

  disposeTrack(trackId: string) {
    this.unschedulePattern(trackId);
    const voices = this.voices.get(trackId);
    if (voices) {
      for (const v of voices) v.dispose();
      this.voices.delete(trackId);
    }
    const chains = this.padChains.get(trackId);
    if (chains) {
      for (const c of chains) c.dispose();
      this.padChains.delete(trackId);
    }
    this.currentKit.delete(trackId);
  }

  dispose() {
    for (const trackId of [...this.voices.keys()]) {
      this.disposeTrack(trackId);
    }
  }
}

export const drumEngine = new DrumEngine();
