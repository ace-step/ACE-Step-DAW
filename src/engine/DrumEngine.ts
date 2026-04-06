import * as Tone from 'tone';
import type { DrumKitName, DrumPadFilter, DrumPadSend } from '../types/project';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DrumVoice {
  trigger: (time?: number, velocity?: number) => void;
  dispose: () => void;
  /** Set detune in semitones (-24 to +24) */
  setDetune?: (semitones: number) => void;
}

/** Per-pad audio effect chain: filter → distortion → volumeGain → decayGain → panner → output.
 * volumeGain: per-pad level (synced from store), decayGain: envelope ramp per trigger. */
interface PadEffectChain {
  filter: Tone.Filter;
  distortion: Tone.Distortion;
  /** Steady-state per-pad volume — synced from pad.volume via updatePadParams */
  volumeGain: Tone.Gain;
  /** Decay envelope gain — ramped per trigger, separate from volume */
  decayGain: Tone.Gain;
  panner: Tone.Panner;
  /** Decay scale 0–1: controls how quickly decayGain fades after trigger */
  decayScale: number;
  /** Send amounts stored for return track routing */
  sendReverb: number;
  sendDelay: number;
  dispose: () => void;
}

function createPadEffectChain(connectTo?: Tone.InputNode): PadEffectChain {
  const filter = new Tone.Filter({ frequency: 20000, type: 'lowpass' });
  const distortion = new Tone.Distortion(0);
  // Neutral defaults: volume=1 and decay=1 preserve pre-#950 behavior
  // until explicit syncTrackPadParams applies user-selected values
  const volumeGain = new Tone.Gain(1);
  const decayGain = new Tone.Gain(1);
  const panner = new Tone.Panner(0);

  // Chain: filter → distortion → volumeGain → decayGain → panner → output
  filter.connect(distortion);
  distortion.connect(volumeGain);
  volumeGain.connect(decayGain);
  decayGain.connect(panner);
  if (connectTo) {
    panner.connect(connectTo);
  } else {
    panner.toDestination();
  }

  return {
    filter,
    distortion,
    volumeGain,
    decayGain,
    panner,
    decayScale: 1,
    sendReverb: 0,
    sendDelay: 0,
    dispose() {
      filter.dispose();
      distortion.dispose();
      volumeGain.dispose();
      decayGain.dispose();
      panner.dispose();
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

function connectDrumNode<T extends Tone.ToneAudioNode>(node: T, connectTo?: Tone.InputNode): T {
  if (connectTo) {
    node.connect(connectTo);
  } else {
    node.toDestination();
  }
  return node;
}

function createKick808(connectTo?: Tone.InputNode): DrumVoice {
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.08, octaves: 6,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.5 },
  });
  connectDrumNode(synth, connectTo);
  return {
    trigger: (time, vel = 1) => synth.triggerAttackRelease('C1', '8n', time, vel),
    dispose: () => synth.dispose(),
    setDetune: (semitones) => { synth.detune.value = semitones * 100; },
  };
}

function createKickAcoustic(connectTo?: Tone.InputNode): DrumVoice {
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.05, octaves: 4,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.3 },
  });
  connectDrumNode(synth, connectTo);
  return {
    trigger: (time, vel = 1) => synth.triggerAttackRelease('D1', '8n', time, vel),
    dispose: () => synth.dispose(),
    setDetune: (semitones) => { synth.detune.value = semitones * 100; },
  };
}

function createSnare808(connectTo?: Tone.InputNode): DrumVoice {
  const noise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.15 },
  });
  const body = new Tone.MembraneSynth({
    pitchDecay: 0.03, octaves: 3,
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
  });
  connectDrumNode(noise, connectTo);
  connectDrumNode(body, connectTo);
  return {
    trigger: (time, vel = 1) => {
      noise.triggerAttackRelease('16n', time, vel * 0.7);
      body.triggerAttackRelease('E2', '16n', time, vel * 0.5);
    },
    dispose: () => { noise.dispose(); body.dispose(); },
    setDetune: (semitones) => { body.detune.value = semitones * 100; },
  };
}

function createSnareAcoustic(connectTo?: Tone.InputNode): DrumVoice {
  const noise = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
  });
  const body = new Tone.MembraneSynth({
    pitchDecay: 0.02, octaves: 2,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.1 },
  });
  connectDrumNode(noise, connectTo);
  connectDrumNode(body, connectTo);
  return {
    trigger: (time, vel = 1) => {
      noise.triggerAttackRelease('16n', time, vel * 0.8);
      body.triggerAttackRelease('G2', '16n', time, vel * 0.4);
    },
    dispose: () => { noise.dispose(); body.dispose(); },
    setDetune: (semitones) => { body.detune.value = semitones * 100; },
  };
}

function createHiHatClosed(connectTo?: Tone.InputNode): DrumVoice {
  const noise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.03 },
  });
  connectDrumNode(noise, connectTo);
  return {
    trigger: (time, vel = 1) => noise.triggerAttackRelease('32n', time, vel * 0.6),
    dispose: () => noise.dispose(),
  };
}

function createHiHatOpen(connectTo?: Tone.InputNode): DrumVoice {
  const noise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 },
  });
  connectDrumNode(noise, connectTo);
  return {
    trigger: (time, vel = 1) => noise.triggerAttackRelease('8n', time, vel * 0.6),
    dispose: () => noise.dispose(),
  };
}

function createClap(connectTo?: Tone.InputNode): DrumVoice {
  const noise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 },
  });
  connectDrumNode(noise, connectTo);
  return {
    trigger: (time, vel = 1) => noise.triggerAttackRelease('16n', time, vel * 0.8),
    dispose: () => noise.dispose(),
  };
}

function createRim(connectTo?: Tone.InputNode): DrumVoice {
  const synth = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
    harmonicity: 5.1, modulationIndex: 10, resonance: 8000, octaves: 0.5,
  });
  connectDrumNode(synth, connectTo);
  return {
    trigger: (time, vel = 1) => synth.triggerAttackRelease(400, '32n', time, vel * 0.5),
    dispose: () => synth.dispose(),
    setDetune: (semitones) => { synth.detune.value = semitones * 100; },
  };
}

function createTomHigh(connectTo?: Tone.InputNode): DrumVoice {
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.04, octaves: 3,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.15 },
  });
  connectDrumNode(synth, connectTo);
  return {
    trigger: (time, vel = 1) => synth.triggerAttackRelease('G2', '8n', time, vel),
    dispose: () => synth.dispose(),
    setDetune: (semitones) => { synth.detune.value = semitones * 100; },
  };
}

function createTomLow(connectTo?: Tone.InputNode): DrumVoice {
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.04, octaves: 3,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 },
  });
  connectDrumNode(synth, connectTo);
  return {
    trigger: (time, vel = 1) => synth.triggerAttackRelease('D2', '8n', time, vel),
    dispose: () => synth.dispose(),
    setDetune: (semitones) => { synth.detune.value = semitones * 100; },
  };
}

function createCrash(connectTo?: Tone.InputNode): DrumVoice {
  const noise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 1.5, sustain: 0, release: 1.0 },
  });
  const metal = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 1.2, release: 0.5 },
    harmonicity: 5.1, modulationIndex: 32, resonance: 6000, octaves: 1.5,
  });
  connectDrumNode(noise, connectTo);
  connectDrumNode(metal, connectTo);
  return {
    trigger: (time, vel = 1) => {
      noise.triggerAttackRelease('4n', time, vel * 0.4);
      metal.triggerAttackRelease(300, '4n', time, vel * 0.3);
    },
    dispose: () => { noise.dispose(); metal.dispose(); },
    setDetune: (semitones) => { metal.detune.value = semitones * 100; },
  };
}

function createRide(connectTo?: Tone.InputNode): DrumVoice {
  const metal = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.6, release: 0.3 },
    harmonicity: 5.1, modulationIndex: 20, resonance: 5000, octaves: 1.0,
  });
  connectDrumNode(metal, connectTo);
  return {
    trigger: (time, vel = 1) => metal.triggerAttackRelease(400, '8n', time, vel * 0.4),
    dispose: () => metal.dispose(),
    setDetune: (semitones) => { metal.detune.value = semitones * 100; },
  };
}

function createShaker(connectTo?: Tone.InputNode): DrumVoice {
  const noise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.005, decay: 0.06, sustain: 0, release: 0.04 },
  });
  connectDrumNode(noise, connectTo);
  return {
    trigger: (time, vel = 1) => noise.triggerAttackRelease('32n', time, vel * 0.5),
    dispose: () => noise.dispose(),
  };
}

function createCowbell(connectTo?: Tone.InputNode): DrumVoice {
  const synth = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.2, release: 0.1 },
    harmonicity: 1.4, modulationIndex: 2, resonance: 4000, octaves: 0.5,
  });
  connectDrumNode(synth, connectTo);
  return {
    trigger: (time, vel = 1) => synth.triggerAttackRelease(560, '16n', time, vel * 0.6),
    dispose: () => synth.dispose(),
    setDetune: (semitones) => { synth.detune.value = semitones * 100; },
  };
}

function createConga(connectTo?: Tone.InputNode): DrumVoice {
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.03, octaves: 2,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
  });
  connectDrumNode(synth, connectTo);
  return {
    trigger: (time, vel = 1) => synth.triggerAttackRelease('A2', '16n', time, vel * 0.7),
    dispose: () => synth.dispose(),
    setDetune: (semitones) => { synth.detune.value = semitones * 100; },
  };
}

function createBongo(connectTo?: Tone.InputNode): DrumVoice {
  const synth = new Tone.MembraneSynth({
    pitchDecay: 0.02, octaves: 2,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.08 },
  });
  connectDrumNode(synth, connectTo);
  return {
    trigger: (time, vel = 1) => synth.triggerAttackRelease('D3', '16n', time, vel * 0.7),
    dispose: () => synth.dispose(),
    setDetune: (semitones) => { synth.detune.value = semitones * 100; },
  };
}

function createTambourine(connectTo?: Tone.InputNode): DrumVoice {
  const noise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.08 },
  });
  connectDrumNode(noise, connectTo);
  return {
    trigger: (time, vel = 1) => noise.triggerAttackRelease('16n', time, vel * 0.5),
    dispose: () => noise.dispose(),
  };
}

function createPerc(connectTo?: Tone.InputNode): DrumVoice {
  const synth = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.08, release: 0.04 },
    harmonicity: 3.1, modulationIndex: 8, resonance: 3000, octaves: 0.5,
  });
  connectDrumNode(synth, connectTo);
  return {
    trigger: (time, vel = 1) => synth.triggerAttackRelease(200, '32n', time, vel * 0.5),
    dispose: () => synth.dispose(),
    setDetune: (semitones) => { synth.detune.value = semitones * 100; },
  };
}

type VoiceFactory = (connectTo?: Tone.InputNode) => DrumVoice;

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

export function createDrumVoicesForKit(kit: DrumKitName, connectTo?: Tone.InputNode): DrumVoice[] {
  return KIT_FACTORIES[kit].map((factory) => factory(connectTo));
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

/** Parameters for updating a single pad's effect chain.
 * Volume is managed via a dedicated volumeGain node, so callers don't need
 * to pre-scale velocity — all trigger paths get consistent pad volume. */
export interface PadParams {
  tune?: number;
  /** Relative decay 0–1: scales the decayGain envelope (0 = very short, 1 = full ring-out) */
  decay?: number;
  /** Per-pad volume 0–1: applied via dedicated volumeGain node */
  volume?: number;
  pan?: number;
  filter?: DrumPadFilter;
  drive?: number;
  /** Send amounts for reverb/delay buses. Currently stored per-pad; routing to
   * return tracks will be wired when ReturnTrackNode integration is added. */
  send?: DrumPadSend;
}

class DrumEngine {
  private voices = new Map<string, DrumVoice[]>();
  private padChains = new Map<string, PadEffectChain[]>();
  private currentKit = new Map<string, DrumKitName>();
  private scheduledIds = new Map<string, number[]>();

  async ensureStarted() {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
  }

  async ensureTrack(trackId: string, kit: DrumKitName = '808') {
    await this.ensureStarted();
    const existing = this.currentKit.get(trackId);
    if (existing === kit && this.voices.has(trackId)) return;

    this.disposeTrack(trackId);

    // Create per-pad effect chains and route voices through them
    const chains: PadEffectChain[] = [];
    const factories = KIT_FACTORIES[kit];
    const voices: DrumVoice[] = [];

    for (let i = 0; i < factories.length; i++) {
      const chain = createPadEffectChain();
      chains.push(chain);
      const voice = factories[i](chain.filter);
      voices.push(voice);
    }

    this.padChains.set(trackId, chains);
    this.voices.set(trackId, voices);
    this.currentKit.set(trackId, kit);
  }

  /** Update per-pad effect parameters in real-time */
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
      chain.distortion.distortion = params.drive;
    }
    if (params.tune !== undefined && voices) {
      const voice = voices[padIndex];
      voice.setDetune?.(params.tune);
    }
    if (params.decay !== undefined) {
      chain.decayScale = params.decay;
    }
    if (params.send !== undefined) {
      // Store send amounts — routing to return track buses will use these values
      // when ReturnTrackNode integration is wired up.
      chain.sendReverb = params.send.reverb;
      chain.sendDelay = params.send.delay;
    }
  }

  /** Sync all pad parameters from project state to the engine.
   * Safely no-ops if the track hasn't been initialized yet — call
   * ensureAndSyncPadParams after ensureTrack to apply params to a new track. */
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

  /** Async version: ensures the track is initialized, then syncs pad params. */
  async ensureAndSyncPadParams(trackId: string, kit: DrumKitName, pads: ReadonlyArray<{ volume: number; tune: number; decay: number; pan: number; filter: DrumPadFilter; drive: number; send: DrumPadSend }>) {
    await this.ensureTrack(trackId, kit);
    this.syncTrackPadParams(trackId, pads);
  }

  /** Apply the decay envelope on a pad's decayGain node at the given time.
   * Used by both triggerPad and schedulePattern for consistent behavior.
   * Neutral/default decay (>=0.999) is a no-op to avoid unnecessary
   * automation for pads whose parameters were never explicitly synced. */
  private applyDecayEnvelope(chain: PadEffectChain, time: number) {
    if (chain.decayScale >= 0.999) return;

    chain.decayGain.gain.cancelScheduledValues(time);
    chain.decayGain.gain.setValueAtTime(1, time);
    const fadeTime = 0.02 + chain.decayScale * 1.98;
    chain.decayGain.gain.linearRampToValueAtTime(0.001, time + fadeTime);
  }

  /** Trigger a drum pad.
   * UI callers that already sync params may omit `pads`.
   * Non-UI callers (e.g. transport) can pass `pads` to ensure per-pad
   * params are applied before the trigger. */
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
    const time = Tone.now();

    if (chains) {
      this.applyDecayEnvelope(chains[padIndex], time);
    }

    voices[padIndex].trigger(time, vel);
  }

  /** Schedule a drum pattern for looping playback. */
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

    const secondsPerStep = (60 / bpm) / 4; // 16th notes
    const patternDuration = pattern.steps * secondsPerStep;
    const ids: number[] = [];

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

        const id = Tone.getTransport().scheduleRepeat(
          (time) => {
            if (voices[padIdx]) {
              if (chains?.[padIdx]) this.applyDecayEnvelope(chains[padIdx], time);
              voices[padIdx].trigger(time, vel);
            }
          },
          patternDuration,
          startTime + stepOffset,
          regionDuration,
        );
        ids.push(id);
      }
    }

    this.scheduledIds.set(trackId, ids);
  }

  unschedulePattern(trackId: string) {
    const ids = this.scheduledIds.get(trackId);
    if (ids) {
      for (const id of ids) Tone.getTransport().clear(id);
      this.scheduledIds.delete(trackId);
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
