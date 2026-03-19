import type { TrackName, TrackType } from '../types/project';

export interface TrackInfo {
  name: TrackName;
  displayName: string;
  emoji: string;
  color: string;
  defaultOrder: number;
}

export const TRACK_CATALOG: Record<TrackName, TrackInfo> = {
  drums:           { name: 'drums',           displayName: 'Drums',           emoji: '🥁', color: '#ef4444', defaultOrder: 12 },
  bass:            { name: 'bass',            displayName: 'Bass',            emoji: '🎸', color: '#f97316', defaultOrder: 11 },
  guitar:          { name: 'guitar',          displayName: 'Guitar',          emoji: '🎸', color: '#eab308', defaultOrder: 10 },
  keyboard:        { name: 'keyboard',        displayName: 'Keyboard',        emoji: '🎹', color: '#22c55e', defaultOrder: 9 },
  percussion:      { name: 'percussion',      displayName: 'Percussion',      emoji: '🪘', color: '#14b8a6', defaultOrder: 8 },
  strings:         { name: 'strings',         displayName: 'Strings',         emoji: '🎻', color: '#06b6d4', defaultOrder: 7 },
  synth:           { name: 'synth',           displayName: 'Synth',           emoji: '🎛️', color: '#3b82f6', defaultOrder: 6 },
  fx:              { name: 'fx',              displayName: 'FX',              emoji: '✨', color: '#8b5cf6', defaultOrder: 5 },
  brass:           { name: 'brass',           displayName: 'Brass',           emoji: '🎺', color: '#a855f7', defaultOrder: 4 },
  woodwinds:       { name: 'woodwinds',       displayName: 'Woodwinds',       emoji: '🎷', color: '#d946ef', defaultOrder: 3 },
  backing_vocals:  { name: 'backing_vocals',  displayName: 'Backing Vocals',  emoji: '🎙️', color: '#ec4899', defaultOrder: 2 },
  vocals:          { name: 'vocals',          displayName: 'Vocals',          emoji: '🎤', color: '#f43f5e', defaultOrder: 1 },
  custom:          { name: 'custom',          displayName: 'Audio',           emoji: '📁', color: '#71717a', defaultOrder: 0 },
};

export const TRACK_NAMES: TrackName[] = [
  'drums', 'bass', 'guitar', 'keyboard', 'percussion',
  'strings', 'synth', 'fx', 'brass', 'woodwinds',
  'backing_vocals', 'vocals',
];

export interface TrackTypeInfo {
  type: TrackType;
  label: string;
  abbr: string;
  emoji: string;
  color: string;
  description: string;
}

export const TRACK_TYPE_CATALOG: Record<TrackType, TrackTypeInfo> = {
  stems:     { type: 'stems',     label: 'Stems',      abbr: 'STM', emoji: '🎛️', color: '#3b82f6', description: 'AI-generated isolated instrument tracks' },
  sample:    { type: 'sample',    label: 'Sample',     abbr: 'SMP', emoji: '📁', color: '#f97316', description: 'User-imported audio clips' },
  sequencer: { type: 'sequencer', label: 'Sequencer',  abbr: 'SEQ', emoji: '🎹', color: '#22c55e', description: 'Step-based drum pattern editor' },
  pianoRoll: { type: 'pianoRoll', label: 'Piano Roll', abbr: 'PNO', emoji: '🎵', color: '#a855f7', description: 'MIDI note editor with built-in synth presets' },
  drumMachine: { type: 'drumMachine', label: 'Drum Machine', abbr: 'DRM', emoji: '🥁', color: '#ef4444', description: 'MPC-style 16-pad sample trigger instrument' },
};

export interface DrumKitSample {
  id: string;
  name: string;
  color: string;
}

export const DEFAULT_DRUM_KIT: DrumKitSample[] = [
  { id: 'kick',       name: 'Kick',       color: '#ef4444' },
  { id: 'snare',      name: 'Snare',      color: '#f97316' },
  { id: 'closed_hh',  name: 'Closed HH',  color: '#eab308' },
  { id: 'open_hh',    name: 'Open HH',    color: '#84cc16' },
];

export const ALL_DRUM_SAMPLES: DrumKitSample[] = [
  { id: 'kick',       name: 'Kick',       color: '#ef4444' },
  { id: 'snare',      name: 'Snare',      color: '#f97316' },
  { id: 'closed_hh',  name: 'Closed HH',  color: '#eab308' },
  { id: 'open_hh',    name: 'Open HH',    color: '#84cc16' },
  { id: 'clap',       name: 'Clap',       color: '#22c55e' },
  { id: 'rim',        name: 'Rim',        color: '#06b6d4' },
  { id: 'low_tom',    name: 'Low Tom',    color: '#3b82f6' },
  { id: 'high_tom',   name: 'High Tom',   color: '#8b5cf6' },
];

export const KEY_SCALES = [
  'C major', 'C minor', 'C# major', 'C# minor',
  'D major', 'D minor', 'D# major', 'D# minor',
  'E major', 'E minor',
  'F major', 'F minor', 'F# major', 'F# minor',
  'G major', 'G minor', 'G# major', 'G# minor',
  'A major', 'A minor', 'A# major', 'A# minor',
  'B major', 'B minor',
];

export const TIME_SIGNATURES = [2, 3, 4, 6];
