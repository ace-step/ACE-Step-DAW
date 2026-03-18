import * as Tone from 'tone';
import type { DrumKitName } from '../types/project';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DrumVoice {
  trigger: (time?: number, velocity?: number) => void;
  dispose: () => void;
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
  '1', '2', '3', '4',
  'q', 'w', 'e', 'r',
  'a', 's', 'd', 'f',
  'z', 'x', 'c', 'v',
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

class DrumEngine {
  private voices = new Map<string, DrumVoice[]>();
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

    const voices = createDrumVoicesForKit(kit);
    this.voices.set(trackId, voices);
    this.currentKit.set(trackId, kit);
  }

  async triggerPad(trackId: string, padIndex: number, velocity = 100, kit: DrumKitName = '808') {
    await this.ensureTrack(trackId, kit);
    const voices = this.voices.get(trackId);
    if (!voices || padIndex < 0 || padIndex >= voices.length) return;
    const vel = Math.max(0, Math.min(127, velocity)) / 127;
    voices[padIndex].trigger(undefined, vel);
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
            if (voices[padIdx]) voices[padIdx].trigger(time, vel);
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
    this.currentKit.delete(trackId);
  }

  dispose() {
    for (const trackId of [...this.voices.keys()]) {
      this.disposeTrack(trackId);
    }
  }
}

export const drumEngine = new DrumEngine();
