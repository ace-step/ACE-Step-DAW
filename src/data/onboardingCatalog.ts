import { DEFAULT_GENERATION } from '../constants/defaults';
import { createDefaultMasteringState } from '../utils/mastering';
import type { Clip, MidiNote, Project, ProjectTemplate, SequencerPattern, Track, TrackName, TrackType } from '../types/project';

export type OnboardingStarterKind = 'template' | 'demo';

export interface OnboardingStarter {
  id: string;
  kind: OnboardingStarterKind;
  title: string;
  genre: string;
  description: string;
  bpm: number;
  keyScale: string;
  summary: string;
  tracks: string[];
}

export interface OnboardingTutorialStep {
  id: string;
  selector: string;
  title: string;
  body: string;
}

export interface OnboardingTip {
  id: string;
  selector: string;
  title: string;
  body: string;
}

type TrackInput = {
  trackName: TrackName;
  trackType: TrackType;
  displayName?: string;
  color: string;
  synthPreset?: Track['synthPreset'];
  localCaption?: string;
  sequencerPattern?: SequencerPattern;
  clips?: Clip[];
};

const DEMO_LENGTH_BARS = 16;

function createSteps(activeIndexes: number[], length = 16) {
  return Array.from({ length }, (_, index) => ({
    active: activeIndexes.includes(index),
    velocity: activeIndexes.includes(index) ? 0.85 : 0,
  }));
}

function createSequencerPattern(name: string, rows: { id: string; name: string; color: string; active: number[] }[]): SequencerPattern {
  return {
    id: crypto.randomUUID(),
    name,
    bars: 1,
    stepsPerBar: 16,
    swing: 0.08,
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      sampleKey: row.id,
      steps: createSteps(row.active),
      volume: 0.8,
      pan: 0,
      muted: false,
      color: row.color,
    })),
  };
}

function createMidiClip(trackId: string, startTime: number, duration: number, prompt: string, notes: Omit<MidiNote, 'id'>[]): Clip {
  return {
    id: crypto.randomUUID(),
    trackId,
    startTime,
    duration,
    prompt,
    lyrics: '',
    generationStatus: 'empty',
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: null,
    waveformPeaks: null,
    midiData: {
      notes: notes.map((note) => ({ ...note, id: crypto.randomUUID() })),
      grid: '1/16',
    },
  };
}

function createTrack(order: number, input: TrackInput): Track {
  return {
    id: crypto.randomUUID(),
    trackName: input.trackName,
    trackType: input.trackType,
    displayName: input.displayName ?? input.trackName,
    color: input.color,
    order,
    volume: 0.8,
    muted: false,
    soloed: false,
    pan: 0,
    clips: input.clips ?? [],
    synthPreset: input.synthPreset,
    localCaption: input.localCaption,
    sequencerPattern: input.sequencerPattern,
  };
}

function createTemplate(id: string, name: string, description: string, bpm: number, keyScale: string, tracks: TrackInput[]): ProjectTemplate {
  return {
    id,
    name,
    description,
    createdAt: Date.now(),
    bpm,
    keyScale,
    timeSignature: 4,
    measures: 64,
    generationDefaults: structuredClone(DEFAULT_GENERATION),
    tracks: tracks.map((track) => ({
      trackName: track.trackName,
      trackType: track.trackType,
      displayName: track.displayName ?? track.trackName,
      color: track.color,
      volume: 0.8,
      pan: 0,
      synthPreset: track.synthPreset,
      localCaption: track.localCaption,
      sequencerPattern: track.sequencerPattern,
    })),
  };
}

export const ONBOARDING_STARTERS: OnboardingStarter[] = [
  {
    id: 'electronic-template',
    kind: 'template',
    title: 'Electronic Pulse',
    genre: 'Template',
    description: 'Fast lane for club, synthwave, and polished pop sketches with genr-ready starter tracks.',
    bpm: 124,
    keyScale: 'A minor',
    summary: 'Drum machine, bass synth, lead synth, and FX return ready for the first genr pass.',
    tracks: ['Drum Machine', 'Bass Synth', 'Lead Synth', 'FX'],
  },
  {
    id: 'hip-hop-template',
    kind: 'template',
    title: 'Late Night Hip Hop',
    genre: 'Template',
    description: 'Laid-back drums, warm keys, and a vocal lane prepped for lyric-first production.',
    bpm: 92,
    keyScale: 'D minor',
    summary: 'Boom-bap drum rack, bass, keys, and vocal stem lane with relaxed defaults.',
    tracks: ['Drums', 'Bass', 'Keys', 'Vocals'],
  },
  {
    id: 'songwriter-template',
    kind: 'template',
    title: 'Songwriter Session',
    genre: 'Template',
    description: 'A clean arrangement scaffold for guitar, keys, and vocal ideas without visual overload.',
    bpm: 108,
    keyScale: 'G major',
    summary: 'Verse/chorus-friendly starter layout with drums, guitar, keys, and lead vocals.',
    tracks: ['Drums', 'Guitar', 'Keys', 'Lead Vocal'],
  },
  {
    id: 'synthwave-demo',
    kind: 'demo',
    title: 'Neon Run Demo',
    genre: 'Demo Project',
    description: 'Open a fully seeded session with drums, bass, hooks, markers, and MIDI clips already in place.',
    bpm: 118,
    keyScale: 'E minor',
    summary: 'Shows a complete intro-to-drop arrangement with sequencer drums and MIDI hooks.',
    tracks: ['Drums', 'Bassline', 'Hook', 'Atmos'],
  },
  {
    id: 'lofi-demo',
    kind: 'demo',
    title: 'Lofi Sketch Demo',
    genre: 'Demo Project',
    description: 'A softer demo session with chords and melody clips so first-time users can explore editing immediately.',
    bpm: 78,
    keyScale: 'C major',
    summary: 'Ready-made beat, keys, and melody clips for timeline, piano roll, and mixer exploration.',
    tracks: ['Beat', 'Keys', 'Melody', 'Vocal Chop'],
  },
];

const TEMPLATE_MAP: Record<string, ProjectTemplate> = {
  'electronic-template': createTemplate(
    'electronic-template',
    'Electronic Pulse',
    'Club-ready starter with drum machine and synth lanes.',
    124,
    'A minor',
    [
      {
        trackName: 'drums',
        trackType: 'drumMachine',
        displayName: 'Drum Machine',
        color: '#ef4444',
        localCaption: 'punchy electronic drums, tight kick, crisp hats',
      },
      {
        trackName: 'bass',
        trackType: 'pianoRoll',
        displayName: 'Bass Synth',
        color: '#f97316',
        synthPreset: 'bass',
        localCaption: 'driving analog bass, sidechained, warm low end',
      },
      {
        trackName: 'synth',
        trackType: 'pianoRoll',
        displayName: 'Lead Synth',
        color: '#3b82f6',
        synthPreset: 'lead',
        localCaption: 'glossy synth lead with bright attack and motion',
      },
      {
        trackName: 'fx',
        trackType: 'stems',
        displayName: 'FX',
        color: '#8b5cf6',
        localCaption: 'riser, impacts, and transitional ear candy',
      },
    ],
  ),
  'hip-hop-template': createTemplate(
    'hip-hop-template',
    'Late Night Hip Hop',
    'Boom-bap oriented starter session with drums, keys, and vocal lane.',
    92,
    'D minor',
    [
      {
        trackName: 'drums',
        trackType: 'sequencer',
        displayName: 'Drums',
        color: '#ef4444',
        localCaption: 'dusty hip hop drums with pocket and swing',
        sequencerPattern: createSequencerPattern('Boom Bap', [
          { id: 'kick', name: 'Kick', color: '#ef4444', active: [0, 7, 8, 12] },
          { id: 'snare', name: 'Snare', color: '#f97316', active: [4, 12] },
          { id: 'closed_hh', name: 'Closed HH', color: '#eab308', active: [0, 2, 4, 6, 8, 10, 12, 14] },
        ]),
      },
      {
        trackName: 'bass',
        trackType: 'stems',
        displayName: 'Bass',
        color: '#f97316',
        localCaption: 'round sub bass, muted attack, deep groove',
      },
      {
        trackName: 'keyboard',
        trackType: 'pianoRoll',
        displayName: 'Keys',
        color: '#22c55e',
        synthPreset: 'piano',
        localCaption: 'jazzy electric piano chords with tape warmth',
      },
      {
        trackName: 'vocals',
        trackType: 'stems',
        displayName: 'Vocals',
        color: '#f43f5e',
        localCaption: 'intimate lead vocal, close mic, low-key delivery',
      },
    ],
  ),
  'songwriter-template': createTemplate(
    'songwriter-template',
    'Songwriter Session',
    'Clean arrangement-first template for writing around vocal and harmony.',
    108,
    'G major',
    [
      {
        trackName: 'drums',
        trackType: 'stems',
        displayName: 'Drums',
        color: '#ef4444',
        localCaption: 'natural indie-pop drums, light room, steady groove',
      },
      {
        trackName: 'guitar',
        trackType: 'stems',
        displayName: 'Guitar',
        color: '#eab308',
        localCaption: 'strummed acoustic guitar, open and warm',
      },
      {
        trackName: 'keyboard',
        trackType: 'pianoRoll',
        displayName: 'Keys',
        color: '#22c55e',
        synthPreset: 'piano',
        localCaption: 'supportive piano chords with dynamic phrasing',
      },
      {
        trackName: 'vocals',
        trackType: 'stems',
        displayName: 'Lead Vocal',
        color: '#f43f5e',
        localCaption: 'clear lead vocal, emotional delivery, close upfront tone',
      },
    ],
  ),
};

function createDemoProject(id: string): Project {
  const now = Date.now();
  if (id === 'synthwave-demo') {
    const drums = createTrack(0, {
      trackName: 'drums',
      trackType: 'sequencer',
      displayName: 'Drums',
      color: '#ef4444',
      localCaption: 'retro electronic kit with pulsing hats and snare fill',
      sequencerPattern: createSequencerPattern('Neon Beat', [
        { id: 'kick', name: 'Kick', color: '#ef4444', active: [0, 4, 8, 12] },
        { id: 'snare', name: 'Snare', color: '#f97316', active: [4, 12] },
        { id: 'closed_hh', name: 'Closed HH', color: '#eab308', active: [0, 2, 4, 6, 8, 10, 12, 14] },
        { id: 'clap', name: 'Clap', color: '#22c55e', active: [12] },
      ]),
    });
    const bass = createTrack(1, {
      trackName: 'bass',
      trackType: 'pianoRoll',
      displayName: 'Bassline',
      color: '#f97316',
      synthPreset: 'bass',
      localCaption: 'retro arpeggiated bass with sidechain space',
    });
    bass.clips = [
      createMidiClip(bass.id, 0, 8, 'syncopated bassline', [
        { pitch: 40, startBeat: 0, durationBeats: 1, velocity: 0.9 },
        { pitch: 43, startBeat: 2, durationBeats: 1, velocity: 0.82 },
        { pitch: 47, startBeat: 4, durationBeats: 1, velocity: 0.88 },
        { pitch: 43, startBeat: 6, durationBeats: 1, velocity: 0.8 },
      ]),
    ];
    const hook = createTrack(2, {
      trackName: 'synth',
      trackType: 'pianoRoll',
      displayName: 'Hook',
      color: '#3b82f6',
      synthPreset: 'lead',
      localCaption: 'glassy synth hook with 80s phrasing',
    });
    hook.clips = [
      createMidiClip(hook.id, 4, 8, 'anthem lead hook', [
        { pitch: 76, startBeat: 0, durationBeats: 1, velocity: 0.82 },
        { pitch: 79, startBeat: 1, durationBeats: 1, velocity: 0.84 },
        { pitch: 83, startBeat: 2, durationBeats: 2, velocity: 0.88 },
        { pitch: 79, startBeat: 4, durationBeats: 1, velocity: 0.8 },
      ]),
    ];
    const atmos = createTrack(3, {
      trackName: 'strings',
      trackType: 'pianoRoll',
      displayName: 'Atmos',
      color: '#06b6d4',
      synthPreset: 'pad',
      localCaption: 'wide pad with long swells and cinematic space',
    });
    atmos.clips = [
      createMidiClip(atmos.id, 0, 16, 'evolving pad bed', [
        { pitch: 64, startBeat: 0, durationBeats: 4, velocity: 0.62 },
        { pitch: 67, startBeat: 0, durationBeats: 4, velocity: 0.6 },
        { pitch: 71, startBeat: 0, durationBeats: 4, velocity: 0.58 },
      ]),
    ];

    return {
      id: crypto.randomUUID(),
      name: 'Neon Run Demo',
      createdAt: now,
      updatedAt: now,
      bpm: 118,
      keyScale: 'E minor',
      timeSignature: 4,
      totalDuration: DEMO_LENGTH_BARS * 2,
      measures: DEMO_LENGTH_BARS,
      tracks: [drums, bass, hook, atmos],
      generationDefaults: structuredClone(DEFAULT_GENERATION),
      globalCaption: 'synthwave night drive, glossy drums, cinematic retro hook',
      mastering: createDefaultMasteringState(),
      markers: [
        { id: crypto.randomUUID(), time: 0, name: 'Intro', color: '#6366f1' },
        { id: crypto.randomUUID(), time: 8, name: 'Build', color: '#22c55e' },
        { id: crypto.randomUUID(), time: 16, name: 'Drop', color: '#f97316' },
      ],
      trackPresets: [],
    };
  }

  const beat = createTrack(0, {
    trackName: 'drums',
    trackType: 'sequencer',
    displayName: 'Beat',
    color: '#ef4444',
    localCaption: 'dusty lo-fi drums with soft swing and vinyl texture',
    sequencerPattern: createSequencerPattern('Lofi Beat', [
      { id: 'kick', name: 'Kick', color: '#ef4444', active: [0, 6, 8, 13] },
      { id: 'snare', name: 'Snare', color: '#f97316', active: [4, 12] },
      { id: 'closed_hh', name: 'Closed HH', color: '#eab308', active: [0, 2, 4, 7, 8, 10, 12, 15] },
    ]),
  });
  const keys = createTrack(1, {
    trackName: 'keyboard',
    trackType: 'pianoRoll',
    displayName: 'Keys',
    color: '#22c55e',
    synthPreset: 'piano',
    localCaption: 'warm jazz chords with soft attack and room tone',
  });
  keys.clips = [
    createMidiClip(keys.id, 0, 16, 'jazzy lofi chords', [
      { pitch: 60, startBeat: 0, durationBeats: 4, velocity: 0.6 },
      { pitch: 64, startBeat: 0, durationBeats: 4, velocity: 0.58 },
      { pitch: 67, startBeat: 0, durationBeats: 4, velocity: 0.56 },
      { pitch: 62, startBeat: 4, durationBeats: 4, velocity: 0.6 },
      { pitch: 65, startBeat: 4, durationBeats: 4, velocity: 0.58 },
      { pitch: 69, startBeat: 4, durationBeats: 4, velocity: 0.56 },
    ]),
  ];
  const melody = createTrack(2, {
    trackName: 'synth',
    trackType: 'pianoRoll',
    displayName: 'Melody',
    color: '#3b82f6',
    synthPreset: 'lead',
    localCaption: 'tape-worn topline with sparse phrasing',
  });
  melody.clips = [
    createMidiClip(melody.id, 8, 8, 'gentle topline', [
      { pitch: 72, startBeat: 0, durationBeats: 1, velocity: 0.7 },
      { pitch: 74, startBeat: 1.5, durationBeats: 0.5, velocity: 0.65 },
      { pitch: 79, startBeat: 3, durationBeats: 1, velocity: 0.68 },
    ]),
  ];
  const vocal = createTrack(3, {
    trackName: 'vocals',
    trackType: 'stems',
    displayName: 'Vocal Chop',
    color: '#f43f5e',
    localCaption: 'airy vocal chop with distant reverb and pitch texture',
  });

  return {
    id: crypto.randomUUID(),
    name: 'Lofi Sketch Demo',
    createdAt: now,
    updatedAt: now,
    bpm: 78,
    keyScale: 'C major',
    timeSignature: 4,
    totalDuration: DEMO_LENGTH_BARS * 3,
    measures: DEMO_LENGTH_BARS,
    tracks: [beat, keys, melody, vocal],
    generationDefaults: structuredClone(DEFAULT_GENERATION),
    globalCaption: 'lofi study beat, dusty drums, mellow piano, intimate textures',
    mastering: createDefaultMasteringState(),
    markers: [
      { id: crypto.randomUUID(), time: 0, name: 'Intro', color: '#6366f1' },
      { id: crypto.randomUUID(), time: 12, name: 'Theme', color: '#22c55e' },
      { id: crypto.randomUUID(), time: 24, name: 'B Section', color: '#f97316' },
    ],
    trackPresets: [],
  };
}

export function getStarterTemplate(id: string) {
  return TEMPLATE_MAP[id];
}

export function instantiateDemoProject(id: string) {
  return createDemoProject(id);
}

export const ONBOARDING_TUTORIAL_STEPS: OnboardingTutorialStep[] = [
  {
    id: 'timeline',
    selector: '[data-onboarding-target="timeline"]',
    title: 'Timeline',
    body: 'Arrange clips here. Drag regions, make selections, and build the song structure from left to right.',
  },
  {
    id: 'transport',
    selector: '[data-onboarding-target="transport"]',
    title: 'Transport',
    body: 'Use Space to play and stop. Record, loop, and navigate from the transport bar while you sketch.',
  },
  {
    id: 'genr',
    selector: '[data-onboarding-target="genr-button"]',
    title: 'genr',
    body: 'Open genr with Cmd+G to generate a first pass for the current arrangement or starter template.',
  },
  {
    id: 'mixer',
    selector: '[data-onboarding-target="mixer-button"]',
    title: 'Mixer',
    body: 'Toggle the mixer with X to balance level, pan, and effects once the first ideas are in place.',
  },
  {
    id: 'assistant',
    selector: '[data-onboarding-target="assistant-button"]',
    title: 'Help In Context',
    body: 'Open the in-DAW assistant with Cmd+/ when you need workflow, arrangement, or mixing guidance.',
  },
];

export const ONBOARDING_TIPS: OnboardingTip[] = [
  {
    id: 'genr-first-pass',
    selector: '[data-onboarding-target="genr-button"]',
    title: 'Start with genr',
    body: 'Use Cmd+G to open genr and generate the first pass against your starter tracks instead of building from silence.',
  },
  {
    id: 'loop-browser',
    selector: '[data-onboarding-target="loop-browser-button"]',
    title: 'Quick Layering',
    body: 'Press O to open the loop browser and drag a texture or groove directly into the timeline.',
  },
  {
    id: 'timeline-selection',
    selector: '[data-onboarding-target="timeline"]',
    title: 'Fast Selection',
    body: 'Hold Cmd or Ctrl while dragging on the timeline to define a generate window for a focused genr pass.',
  },
];
