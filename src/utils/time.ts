import type { TempoEvent, TimeSignatureEvent } from '../types/project';
import {
  beatToTime,
  timeToBeat,
  getBarAtBeat,
  getBeatAtBar,
  getTimeSignatureAtBar,
  getTimeSignatureBeatLength,
} from './tempoMap';

export function secondsToBeats(seconds: number, bpm: number): number {
  return (seconds / 60) * bpm;
}

export function beatsToSeconds(beats: number, bpm: number): number {
  return (beats / bpm) * 60;
}

export function secondsToBarsBeats(
  seconds: number,
  bpm: number,
  timeSignature: number,
  tempoMap?: TempoEvent[],
  timeSignatureMap?: TimeSignatureEvent[],
): { bars: number; beats: number; ticks: number } {
  const totalBeats = timeToBeat(seconds, tempoMap, bpm);
  const bar = getBarAtBeat(totalBeats, timeSignatureMap, timeSignature);
  const { numerator, denominator } = getTimeSignatureAtBar(timeSignatureMap, bar, timeSignature, 4);
  const barStartBeat = getBeatAtBar(bar, timeSignatureMap, timeSignature);
  const beatsIntoBar = totalBeats - barStartBeat;
  const beatLength = getTimeSignatureBeatLength(denominator);
  const beatInBar = Math.floor(beatsIntoBar / beatLength);
  const ticks = Math.round((((beatsIntoBar / beatLength) % 1) + Number.EPSILON) * 100);
  return { bars: bar, beats: Math.min(beatInBar, numerator - 1) + 1, ticks };
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
}

export function formatBarsBeats(
  seconds: number,
  bpm: number,
  timeSignature: number,
  tempoMap?: TempoEvent[],
  timeSignatureMap?: TimeSignatureEvent[],
): string {
  const { bars, beats, ticks } = secondsToBarsBeats(seconds, bpm, timeSignature, tempoMap, timeSignatureMap);
  return `${bars}.${beats}.${ticks.toString().padStart(2, '0')}`;
}

export function snapToGrid(
  time: number,
  bpm: number,
  division: number = 1,
  tempoMap?: TempoEvent[],
): number {
  if (!tempoMap || tempoMap.length === 0) {
    const beatDuration = 60 / bpm;
    const gridSize = beatDuration * division;
    return Math.round(time / gridSize) * gridSize;
  }
  const beat = timeToBeat(time, tempoMap, bpm);
  const snappedBeat = Math.round(beat / division) * division;
  return beatToTime(snappedBeat, tempoMap, bpm);
}

export function getBarDuration(bpm: number, timeSignature: number): number {
  return (60 / bpm) * timeSignature;
}

export function getBeatDuration(bpm: number): number {
  return 60 / bpm;
}
