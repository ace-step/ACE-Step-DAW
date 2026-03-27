/**
 * Strudel conversion helpers.
 *
 * This module hosts both:
 * - Strudel event -> DAW-native data helpers used by freeze/export workflows
 * - DAW-native MIDI -> Strudel code generation used by the MIDI import flow
 */

import type { ParsedMidiFile } from '../utils/midi';
import type {
  Clip,
  MidiClipData,
  MidiNote,
  Project,
  SequencerPattern,
  SequencerRow,
  SequencerStep,
  StrudelFromMidiOptions,
  StrudelFromMidiResult,
  StrudelSoundMapping,
  Track,
} from '../types/project';
import type { StrudelEvent } from '../engine/strudelEngine';
import { timeToBeat } from '../utils/tempoMap';

// ─── Strudel -> DAW ──────────────────────────────────────────────────────────

/**
 * Convert Strudel events with note data to MidiNote objects.
 */
export function strudelEventsToMidiNotes(
  events: StrudelEvent[],
  beatsPerCycle: number = 4,
): MidiNote[] {
  return events
    .filter((event) => event.note !== undefined && !Number.isNaN(event.note))
    .map((event, index) => {
      const value = event.value as Record<string, unknown> | undefined;
      const velocity = typeof value?.velocity === 'number' ? value.velocity : 0.8;
      return {
        id: `strudel-midi-${index}-${Math.round(event.startCycle * 1000)}`,
        pitch: Math.round(event.note as number),
        startBeat: event.startCycle * beatsPerCycle,
        durationBeats: Math.max(0.125, event.durationCycles * beatsPerCycle),
        velocity: Math.max(0, Math.min(1, velocity)),
      };
    });
}

/** Map Strudel percussion short names to DAW drum sample keys. */
export const STRUDEL_TO_DAW_DRUM: Record<string, string> = {
  bd: 'kick',
  sd: 'snare',
  sn: 'snare',
  hh: 'closed_hh',
  ch: 'closed_hh',
  oh: 'open_hh',
  cp: 'clap',
  cl: 'claves',
  cb: 'cowbell',
  rim: 'rim',
  rs: 'rim',
  lt: 'low_tom',
  mt: 'mid_tom',
  ht: 'high_tom',
  cy: 'crash',
  cr: 'crash',
  rd: 'ride',
  rc: 'ride',
  ma: 'maracas',
  sh: 'shaker',
  perc: 'perc',
};

const DRUM_DISPLAY_NAMES: Record<string, string> = {
  kick: 'Kick',
  snare: 'Snare',
  closed_hh: 'Closed HH',
  open_hh: 'Open HH',
  clap: 'Clap',
  claves: 'Claves',
  cowbell: 'Cowbell',
  rim: 'Rim',
  low_tom: 'Low Tom',
  mid_tom: 'Mid Tom',
  high_tom: 'High Tom',
  crash: 'Crash',
  ride: 'Ride',
  maracas: 'Maracas',
  shaker: 'Shaker',
  perc: 'Perc',
};

export function strudelEventsToDrumPattern(
  events: StrudelEvent[],
  bars: number = 1,
  stepsPerBar: number = 16,
): SequencerPattern {
  const totalSteps = Math.max(1, bars * stepsPerBar);
  const groups = new Map<string, Array<{ stepIndex: number; velocity: number }>>();

  for (const event of events) {
    if (!event.sound || event.note !== undefined) continue;
    const sampleKey = STRUDEL_TO_DAW_DRUM[event.sound] ?? 'perc';
    const hits = groups.get(sampleKey) ?? [];
    const stepIndex = Math.max(0, Math.min(totalSteps - 1, Math.round(event.startCycle * stepsPerBar)));
    const value = event.value as Record<string, unknown> | undefined;
    const velocity = typeof value?.velocity === 'number' ? value.velocity : 0.8;
    hits.push({ stepIndex, velocity: Math.max(0, Math.min(1, velocity)) });
    groups.set(sampleKey, hits);
  }

  const rows: SequencerRow[] = [...groups.entries()].map(([sampleKey, hits]) => {
    const steps: SequencerStep[] = Array.from({ length: totalSteps }, () => ({
      active: false,
      velocity: 0.8,
      probability: 1,
      stepParams: {},
    }));
    for (const hit of hits) {
      steps[hit.stepIndex] = { active: true, velocity: hit.velocity, probability: 1, stepParams: {} };
    }
    return {
      id: `strudel-row-${sampleKey}-${hits.length}`,
      name: DRUM_DISPLAY_NAMES[sampleKey] ?? sampleKey,
      sampleKey,
      steps,
      volume: 0.8,
      pan: 0,
      muted: false,
      color: '#888888',
    };
  });

  return {
    id: `strudel-pattern-${rows.length}-${totalSteps}`,
    name: 'Strudel Pattern',
    rows,
    stepsPerBar,
    bars,
    swing: 0,
  };
}

/** Map DAW drum sample keys to GM drum MIDI pitches. */
export const DAW_DRUM_TO_MIDI_PITCH: Record<string, number> = {
  kick: 36,
  snare: 38,
  closed_hh: 42,
  open_hh: 46,
  clap: 39,
  rim: 37,
  high_tom: 50,
  mid_tom: 47,
  low_tom: 45,
  crash: 49,
  ride: 51,
  cowbell: 56,
  shaker: 70,
  claves: 75,
  maracas: 70,
  perc: 47,
};

export function sequencerPatternToMidiData(
  pattern: SequencerPattern,
  beatsPerBar: number = 4,
): MidiClipData {
  const notes: MidiNote[] = [];
  const beatsPerStep = beatsPerBar / Math.max(1, pattern.stepsPerBar);

  for (const row of pattern.rows) {
    if (row.muted) continue;
    const pitch = DAW_DRUM_TO_MIDI_PITCH[row.sampleKey] ?? 47;
    row.steps.forEach((step, index) => {
      if (!step.active) return;
      notes.push({
        id: `seq-midi-${row.sampleKey}-${index}`,
        pitch,
        startBeat: index * beatsPerStep,
        durationBeats: beatsPerStep,
        velocity: step.velocity,
      });
    });
  }

  return {
    notes,
    grid: pattern.stepsPerBar >= 32 ? '1/32' : pattern.stepsPerBar >= 16 ? '1/16' : '1/8',
  };
}

// ─── MIDI -> Strudel ─────────────────────────────────────────────────────────

interface NormalizedMidiTrack {
  name: string;
  notes: Array<Omit<MidiNote, 'id'>>;
  isDrum: boolean;
}

interface PreparedTrack {
  constName: string;
  patternName: string;
  code: string;
}

const SUBDIVISION_CANDIDATES = [8, 16, 32, 64];
const NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const DRUM_NOTE_TO_STRUDEL: Record<number, string> = {
  36: 'bd',
  35: 'bd',
  38: 'sd',
  40: 'sd',
  39: 'cp',
  37: 'rim',
  42: 'hh',
  44: 'hh',
  46: 'oh',
  49: 'cy',
  51: 'rd',
  45: 'lt',
  47: 'mt',
  50: 'ht',
  56: 'cb',
  70: 'sh',
  75: 'cl',
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function getQuarterNotesPerBar(projectLike: {
  timeSignature?: number;
  timeSignatureDenominator?: number;
}): number {
  const numerator = projectLike.timeSignature ?? 4;
  const denominator = Math.max(1, projectLike.timeSignatureDenominator ?? 4);
  return numerator * (4 / denominator);
}

function pitchToNoteName(pitch: number): string {
  const noteIndex = ((pitch % 12) + 12) % 12;
  const octave = Math.floor(pitch / 12) - 1;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

function sanitizeConstName(value: string, fallback: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const withPrefix = cleaned && !/^\d/.test(cleaned) ? cleaned : `${fallback}_${cleaned || 'track'}`;
  return withPrefix;
}

function splitTrackVoices(notes: Array<Omit<MidiNote, 'id'>>): Array<Array<Omit<MidiNote, 'id'>>> {
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);
  const voices: Array<Array<Omit<MidiNote, 'id'>>> = [];

  for (const note of sorted) {
    let placed = false;
    for (const voice of voices) {
      const last = voice[voice.length - 1];
      if (last.startBeat + last.durationBeats <= note.startBeat + 0.0001) {
        voice.push(note);
        placed = true;
        break;
      }
    }
    if (!placed) voices.push([note]);
  }

  return voices;
}

function splitNotesAtBarBoundaries(
  notes: Array<Omit<MidiNote, 'id'>>,
  barBeats: number,
): Array<Omit<MidiNote, 'id'>> {
  const segments: Array<Omit<MidiNote, 'id'>> = [];
  for (const note of notes) {
    let startBeat = note.startBeat;
    let remaining = note.durationBeats;
    while (remaining > 0.0001) {
      const barEnd = Math.ceil((startBeat + 0.0001) / barBeats) * barBeats;
      const segmentDuration = Math.min(remaining, barEnd - startBeat);
      segments.push({
        pitch: note.pitch,
        startBeat,
        durationBeats: Math.max(0.125, segmentDuration),
        velocity: note.velocity,
      });
      startBeat += segmentDuration;
      remaining -= segmentDuration;
    }
  }
  return segments;
}

function chooseStepsPerBar(notes: Array<Omit<MidiNote, 'id'>>, barBeats: number): number {
  if (notes.length === 0) return 16;
  const tolerance = 0.06;
  for (const stepsPerBar of SUBDIVISION_CANDIDATES) {
    const stepBeats = barBeats / stepsPerBar;
    const fits = notes.every((note) => {
      const startSteps = note.startBeat / stepBeats;
      const durationSteps = note.durationBeats / stepBeats;
      return (
        Math.abs(startSteps - Math.round(startSteps)) <= tolerance
        && Math.abs(durationSteps - Math.round(durationSteps)) <= tolerance
      );
    });
    if (fits) return stepsPerBar;
  }
  return 64;
}

function quantizeNotes(
  notes: Array<Omit<MidiNote, 'id'>>,
  stepBeats: number,
  quantize: boolean,
): Array<Omit<MidiNote, 'id'>> {
  return notes.map((note) => {
    const startBeat = quantize ? Math.round(note.startBeat / stepBeats) * stepBeats : note.startBeat;
    const rawEndBeat = note.startBeat + note.durationBeats;
    const endBeat = quantize ? Math.round(rawEndBeat / stepBeats) * stepBeats : rawEndBeat;
    const durationBeats = Math.max(stepBeats, endBeat - startBeat);
    return {
      pitch: note.pitch,
      startBeat,
      durationBeats,
      velocity: clamp01(note.velocity),
    };
  });
}

function parseKeyScale(keyScale?: string | null): { root: string; mode: 'major' | 'minor'; rootMidi: number } | null {
  if (!keyScale) return null;
  const splitIndex = keyScale.lastIndexOf(' ');
  if (splitIndex <= 0) return null;
  const root = keyScale.slice(0, splitIndex).trim().toLowerCase();
  const mode = keyScale.slice(splitIndex + 1).trim().toLowerCase();
  if (mode !== 'major' && mode !== 'minor') return null;
  const rootSemitone = NOTE_NAMES.findIndex((name) => name === root);
  if (rootSemitone < 0) return null;
  return {
    root,
    mode,
    rootMidi: 60 + rootSemitone,
  };
}

function pitchToScaleDegree(pitch: number, key: NonNullable<ReturnType<typeof parseKeyScale>>): number | null {
  const scale = key.mode === 'major' ? MAJOR_SCALE : MINOR_SCALE;
  const delta = pitch - key.rootMidi;
  const octaveOffset = Math.floor(delta / 12);
  const withinOctave = ((delta % 12) + 12) % 12;
  const scaleIndex = scale.indexOf(withinOctave);
  if (scaleIndex < 0) return null;
  return octaveOffset * scale.length + scaleIndex;
}

function getMelodicSound(trackName: string, soundMapping: StrudelSoundMapping): string {
  if (soundMapping !== 'auto') return soundMapping;
  const normalized = trackName.toLowerCase();
  if (normalized.includes('bass')) return 'sawtooth';
  if (normalized.includes('synth') || normalized.includes('lead') || normalized.includes('fx')) return 'square';
  if (normalized.includes('string') || normalized.includes('pad')) return 'triangle';
  return 'piano';
}

function buildWeightedSequence(
  notes: Array<Omit<MidiNote, 'id'>>,
  totalBeats: number,
  barBeats: number,
  stepsPerBar: number,
  tokenForNote: (note: Omit<MidiNote, 'id'>) => string,
  lineMode: 'bars' | 'flat',
  measuresPerLine: number,
): string {
  const stepBeats = barBeats / stepsPerBar;
  const totalBars = Math.max(1, Math.ceil(totalBeats / barBeats));
  const lines: string[] = [];

  for (let barIndex = 0; barIndex < totalBars; barIndex++) {
    const barStart = barIndex * barBeats;
    const barEnd = barStart + barBeats;
    const barNotes = notes
      .filter((note) => note.startBeat >= barStart - 0.0001 && note.startBeat < barEnd - 0.0001)
      .sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);

    const tokens: string[] = [];
    let cursorBeat = barStart;

    for (const note of barNotes) {
      if (note.startBeat > cursorBeat + 0.0001) {
        const restSteps = Math.max(1, Math.round((note.startBeat - cursorBeat) / stepBeats));
        tokens.push(restSteps > 1 ? `~@${restSteps}` : '~');
        cursorBeat += restSteps * stepBeats;
      }

      const durationSteps = Math.max(1, Math.round(note.durationBeats / stepBeats));
      const token = tokenForNote(note);
      tokens.push(durationSteps > 1 ? `${token}@${durationSteps}` : token);
      cursorBeat = note.startBeat + durationSteps * stepBeats;
    }

    if (cursorBeat < barEnd - 0.0001) {
      const tailSteps = Math.max(1, Math.round((barEnd - cursorBeat) / stepBeats));
      tokens.push(tailSteps > 1 ? `~@${tailSteps}` : '~');
    }

    lines.push(`[${tokens.join(' ')}]`);
  }

  if (lineMode === 'flat') {
    const grouped: string[] = [];
    for (let index = 0; index < lines.length; index += Math.max(1, measuresPerLine)) {
      grouped.push(lines.slice(index, index + Math.max(1, measuresPerLine)).join(' '));
    }
    return grouped.join('\n');
  }

  const grouped: string[] = [];
  for (let index = 0; index < lines.length; index += Math.max(1, measuresPerLine)) {
    grouped.push(lines.slice(index, index + Math.max(1, measuresPerLine)).join('\n'));
  }
  return grouped.join('\n');
}

function buildMelodicTracks(
  track: NormalizedMidiTrack,
  options: StrudelFromMidiOptions,
  totalBeats: number,
  barBeats: number,
  warnings: string[],
): PreparedTrack[] {
  const stepsPerBar = chooseStepsPerBar(track.notes, barBeats);
  const stepBeats = barBeats / stepsPerBar;
  const normalized = splitNotesAtBarBoundaries(quantizeNotes(track.notes, stepBeats, options.quantize), barBeats);
  const voices = splitTrackVoices(normalized);
  const lineMode = options.timingStyle === 'absoluteDuration' ? 'flat' : 'bars';
  const key = options.notationType === 'relative' ? parseKeyScale(options.keyScale) : null;
  let useRelative = Boolean(key);

  if (options.notationType === 'relative' && !key) {
    warnings.push(`Fell back to absolute notation for "${track.name}" because no supported key scale was available.`);
  }

  const tokenForAbsolute = (note: Omit<MidiNote, 'id'>) => pitchToNoteName(note.pitch);
  const tokenForRelative = (note: Omit<MidiNote, 'id'>) => {
    if (!key) return tokenForAbsolute(note);
    const degree = pitchToScaleDegree(note.pitch, key);
    if (degree === null) {
      useRelative = false;
      warnings.push(`Fell back to absolute notation for "${track.name}" because some notes are outside ${key.root} ${key.mode}.`);
      return tokenForAbsolute(note);
    }
    return String(degree);
  };

  const prepared: PreparedTrack[] = [];
  voices.forEach((voice, voiceIndex) => {
    const patternName = voiceIndex === 0
      ? track.name
      : voiceIndex === 1
        ? `${track.name} Harmony`
        : `${track.name} Harmony ${voiceIndex}`;
    const constName = sanitizeConstName(patternName, 'midi');
    const content = buildWeightedSequence(
      voice,
      totalBeats,
      barBeats,
      stepsPerBar,
      useRelative ? tokenForRelative : tokenForAbsolute,
      lineMode,
      options.measuresPerLine,
    );
    const sound = getMelodicSound(track.name, options.soundMapping);
    const code = useRelative && key
      ? `const ${constName} = n(\`\n${content}\n\`).scale("${key.root}:${key.mode}").sound("${sound}");`
      : `const ${constName} = note(\`\n${content}\n\`).sound("${sound}");`;
    prepared.push({ constName, patternName, code });
  });

  return prepared;
}

function buildDrumTracks(
  track: NormalizedMidiTrack,
  _options: StrudelFromMidiOptions,
  totalBeats: number,
  barBeats: number,
): PreparedTrack[] {
  const stepsPerBar = chooseStepsPerBar(track.notes, barBeats);
  const stepBeats = barBeats / stepsPerBar;
  const notes = splitNotesAtBarBoundaries(quantizeNotes(track.notes, stepBeats, true), barBeats);
  const grouped = new Map<string, Array<Omit<MidiNote, 'id'>>>();

  for (const note of notes) {
    const token = DRUM_NOTE_TO_STRUDEL[note.pitch] ?? 'perc';
    const list = grouped.get(token) ?? [];
    list.push(note);
    grouped.set(token, list);
  }

  return [...grouped.entries()].map(([token, tokenNotes], index) => {
    const patternName = index === 0 ? track.name : `${track.name} ${token}`;
    const constName = sanitizeConstName(patternName, 'drums');
    const content = buildWeightedSequence(
      tokenNotes,
      totalBeats,
      barBeats,
      stepsPerBar,
      () => token,
      'bars',
      Math.max(1, _options.measuresPerLine),
    );
    return {
      constName,
      patternName,
      code: `const ${constName} = s(\`\n${content}\n\`);`,
    };
  });
}

function buildHeader(
  label: string,
  bpm: number,
  timeSignature: { numerator: number; denominator: number },
  barBeats: number,
): string {
  const cpsDivisor = Number(barBeats.toFixed(6));
  return [
    `// MIDI to Strudel`,
    `// Source: ${label}`,
    `// Time: ${timeSignature.numerator}/${timeSignature.denominator}`,
    '',
    `const BPM = ${bpm};`,
    `setcps(BPM / 60 / ${cpsDivisor});`,
    '',
  ].join('\n');
}

function getSourceLabel(kind: StrudelFromMidiResult['sourceSummary']['sourceKind'], label: string): string {
  return kind === 'file' ? label : `${label}`;
}

function countDrumTracks(tracks: NormalizedMidiTrack[]) {
  return tracks.filter((track) => track.isDrum).length;
}

function totalNoteCount(tracks: NormalizedMidiTrack[]) {
  return tracks.reduce((sum, track) => sum + track.notes.length, 0);
}

function normalizeFileTracks(parsed: ParsedMidiFile): NormalizedMidiTrack[] {
  return parsed.tracks.map((track) => ({
    name: track.name,
    notes: track.notes.map((note) => ({
      pitch: note.pitch,
      startBeat: note.startBeat,
      durationBeats: note.durationBeats,
      velocity: note.velocity,
    })),
    isDrum: track.channel === 9 || /drum|perc/i.test(track.name),
  }));
}

function normalizeTrackClips(track: Track, project: Project): NormalizedMidiTrack | null {
  const bpm = project.bpm ?? 120;
  const notes = track.clips.flatMap((clip) => {
    if (!clip.midiData) return [];
    const clipOffsetBeats = timeToBeat(clip.startTime, project.tempoMap, bpm);
    return clip.midiData.notes.map((note) => ({
      pitch: note.pitch,
      startBeat: clipOffsetBeats + note.startBeat,
      durationBeats: note.durationBeats,
      velocity: note.velocity,
    }));
  });
  if (notes.length === 0) return null;
  return {
    name: track.displayName,
    notes,
    isDrum: track.trackType === 'sequencer' || track.trackName === 'drums' || /drum|perc/i.test(track.displayName),
  };
}

function normalizeClipSource(clip: Clip, track: Track, project: Project): NormalizedMidiTrack | null {
  if (!clip.midiData) return null;
  const clipOffsetBeats = timeToBeat(clip.startTime, project.tempoMap, project.bpm);
  return {
    name: `${track.displayName} Clip`,
    notes: clip.midiData.notes.map((note) => ({
      pitch: note.pitch,
      startBeat: clipOffsetBeats + note.startBeat,
      durationBeats: note.durationBeats,
      velocity: note.velocity,
    })),
    isDrum: track.trackType === 'sequencer' || track.trackName === 'drums' || /drum|perc/i.test(track.displayName),
  };
}

function buildResult(
  kind: StrudelFromMidiResult['sourceSummary']['sourceKind'],
  label: string,
  tracks: NormalizedMidiTrack[],
  bpm: number,
  timeSignature: { numerator: number; denominator: number },
  options: StrudelFromMidiOptions,
): StrudelFromMidiResult {
  const warnings: string[] = [];
  const barBeats = timeSignature.numerator * (4 / Math.max(1, timeSignature.denominator));
  const maxEndBeat = Math.max(
    barBeats,
    ...tracks.flatMap((track) => track.notes.map((note) => note.startBeat + note.durationBeats)),
  );
  const totalBars = Math.max(1, Math.ceil(maxEndBeat / barBeats));
  const totalBeats = totalBars * barBeats;
  const preparedTracks = tracks.flatMap((track) => (
    track.isDrum
      ? buildDrumTracks(track, options, totalBeats, barBeats)
      : buildMelodicTracks(track, options, totalBeats, barBeats, warnings)
  ));

  const header = buildHeader(getSourceLabel(kind, label), bpm, timeSignature, barBeats);
  const stackArgs = preparedTracks.map((track) => track.constName).join(',\n  ');
  const code = `${header}${preparedTracks.map((track) => `${track.code}\n`).join('\n')}stack(\n  ${stackArgs}\n);`;

  return {
    code,
    warnings: [...new Set(warnings)],
    sourceSummary: {
      sourceKind: kind,
      label,
      trackCount: tracks.length,
      noteCount: totalNoteCount(tracks),
      drumTrackCount: countDrumTracks(tracks),
    },
    bpm,
    timeSignature,
  };
}

export function convertMidiClipToStrudelCode(
  clip: Clip,
  track: Track,
  project: Project,
  options: StrudelFromMidiOptions,
): StrudelFromMidiResult | null {
  const normalized = normalizeClipSource(clip, track, project);
  if (!normalized) return null;
  return buildResult(
    'clip',
    `${track.displayName} / ${clip.prompt || 'MIDI Clip'}`,
    [normalized],
    project.bpm,
    {
      numerator: project.timeSignature,
      denominator: project.timeSignatureDenominator ?? 4,
    },
    options,
  );
}

export function convertMidiTrackToStrudelCode(
  track: Track,
  project: Project,
  options: StrudelFromMidiOptions,
): StrudelFromMidiResult | null {
  const normalized = normalizeTrackClips(track, project);
  if (!normalized) return null;
  return buildResult(
    'track',
    track.displayName,
    [normalized],
    project.bpm,
    {
      numerator: project.timeSignature,
      denominator: project.timeSignatureDenominator ?? 4,
    },
    options,
  );
}

export function convertParsedMidiFileToStrudelCode(
  parsed: ParsedMidiFile,
  fileName: string,
  options: StrudelFromMidiOptions,
): StrudelFromMidiResult | null {
  const tracks = normalizeFileTracks(parsed);
  if (tracks.length === 0) return null;
  return buildResult(
    'file',
    fileName,
    tracks,
    parsed.bpm ?? 120,
    {
      numerator: parsed.timeSignature?.numerator ?? 4,
      denominator: parsed.timeSignature?.denominator ?? 4,
    },
    options,
  );
}

export function createDefaultStrudelFromMidiOptions(project?: Project | null): StrudelFromMidiOptions {
  return {
    notationType: 'absolute',
    timingStyle: 'subdivision',
    quantize: true,
    measuresPerLine: 2,
    keyScale: project?.keyScale ?? null,
    soundMapping: 'auto',
    targetTrackMode: 'currentOrNew',
  };
}
