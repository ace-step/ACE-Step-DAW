import type { TempoEvent, TimeSignatureEvent } from '../types/project';

const TEMPO_CURVE_EPSILON = 0.01;
const TEMPO_CURVE_SAMPLES = 32;

export function getTimeSignatureBeatLength(denominator: number): number {
  return 4 / Math.max(1, denominator);
}

export function getTimeSignatureBarLength(numerator: number, denominator: number): number {
  return Math.max(1, numerator) * getTimeSignatureBeatLength(denominator);
}

export function clampTempoCurve(curve: number | undefined): number {
  return Math.max(-1, Math.min(1, curve ?? 0));
}

export function getTempoCurveProgress(progress: number, curve: number | undefined): number {
  const t = Math.max(0, Math.min(1, progress));
  const clampedCurve = clampTempoCurve(curve);
  if (Math.abs(clampedCurve) < TEMPO_CURVE_EPSILON) {
    return t;
  }

  return clampedCurve > 0
    ? Math.pow(t, 1 + clampedCurve * 3)
    : 1 - Math.pow(1 - t, 1 + Math.abs(clampedCurve) * 3);
}

export function interpolateTempoRamp(
  startBpm: number,
  endBpm: number,
  progress: number,
  curve: number | undefined,
): number {
  const curvedProgress = getTempoCurveProgress(progress, curve);
  return startBpm + (endBpm - startBpm) * curvedProgress;
}

function integrateTempoRamp(
  startBpm: number,
  endBpm: number,
  segmentBeats: number,
  partialBeats: number,
  curve: number | undefined,
): number {
  if (segmentBeats <= 0 || partialBeats <= 0) {
    return 0;
  }

  const beats = Math.max(0, Math.min(segmentBeats, partialBeats));
  const steps = Math.max(8, Math.ceil(TEMPO_CURVE_SAMPLES * (beats / segmentBeats)));
  const beatSize = beats / steps;
  let seconds = 0;

  for (let i = 0; i < steps; i++) {
    const beatMidpoint = (i + 0.5) * beatSize;
    const progress = beatMidpoint / segmentBeats;
    const bpm = Math.max(
      1e-6,
      interpolateTempoRamp(startBpm, endBpm, progress, curve),
    );
    seconds += (beatSize / bpm) * 60;
  }

  return seconds;
}

/**
 * Get the BPM at a specific beat position.
 * If a ramp is active, interpolates between the previous and current event BPMs.
 */
export function getTempoAtBeat(
  tempoMap: TempoEvent[] | undefined,
  beat: number,
  fallbackBpm: number,
): number {
  if (!tempoMap || tempoMap.length === 0) return fallbackBpm;

  let prevBpm = fallbackBpm;
  let prevBeat = 0;

  for (let i = 0; i < tempoMap.length; i++) {
    const ev = tempoMap[i];
    if (ev.beat > beat) {
      if (ev.ramp) {
        const range = ev.beat - prevBeat;
        if (range <= 0) return ev.bpm;
        const t = (beat - prevBeat) / range;
        return interpolateTempoRamp(prevBpm, ev.bpm, t, ev.curve);
      }
      return prevBpm;
    }
    prevBpm = ev.bpm;
    prevBeat = ev.beat;
  }

  return prevBpm;
}

/**
 * Convert a beat position to absolute time (seconds), accounting for tempo changes and ramps.
 */
export function beatToTime(
  beat: number,
  tempoMap: TempoEvent[] | undefined,
  fallbackBpm: number,
): number {
  if (!tempoMap || tempoMap.length === 0) {
    return (beat / fallbackBpm) * 60;
  }

  let time = 0;
  let currentBeat = 0;
  let currentBpm = fallbackBpm;

  for (const ev of tempoMap) {
    if (ev.beat >= beat) {
      if (ev.ramp && ev.beat > currentBeat) {
        const segBeats = beat - currentBeat;
        time += integrateTempoRamp(
          currentBpm,
          ev.bpm,
          ev.beat - currentBeat,
          segBeats,
          ev.curve,
        );
      } else {
        time += ((beat - currentBeat) / currentBpm) * 60;
      }
      return time;
    }

    const segBeats = ev.beat - currentBeat;
    if (segBeats > 0) {
      if (ev.ramp) {
        time += integrateTempoRamp(currentBpm, ev.bpm, segBeats, segBeats, ev.curve);
      } else {
        time += (segBeats / currentBpm) * 60;
      }
    }
    currentBeat = ev.beat;
    currentBpm = ev.bpm;
  }

  time += ((beat - currentBeat) / currentBpm) * 60;
  return time;
}

/**
 * Convert absolute time (seconds) to beat position, accounting for tempo changes and ramps.
 */
export function timeToBeat(
  targetTime: number,
  tempoMap: TempoEvent[] | undefined,
  fallbackBpm: number,
): number {
  if (!tempoMap || tempoMap.length === 0) {
    return (targetTime / 60) * fallbackBpm;
  }

  let time = 0;
  let currentBeat = 0;
  let currentBpm = fallbackBpm;

  for (const ev of tempoMap) {
    const segBeats = ev.beat - currentBeat;
    if (segBeats > 0) {
      let segTime: number;
      if (ev.ramp) {
        segTime = integrateTempoRamp(currentBpm, ev.bpm, segBeats, segBeats, ev.curve);
      } else {
        segTime = (segBeats / currentBpm) * 60;
      }

      if (time + segTime >= targetTime) {
        const remaining = targetTime - time;
        if (ev.ramp) {
          let lo = 0;
          let hi = segBeats;
          for (let iter = 0; iter < 24; iter++) {
            const mid = (lo + hi) / 2;
            const elapsed = integrateTempoRamp(currentBpm, ev.bpm, segBeats, mid, ev.curve);
            if (elapsed < remaining) {
              lo = mid;
            } else {
              hi = mid;
            }
          }
          return currentBeat + (lo + hi) / 2;
        } else {
          return currentBeat + (remaining / 60) * currentBpm;
        }
      }
      time += segTime;
    }
    currentBeat = ev.beat;
    currentBpm = ev.bpm;
  }

  const remaining = targetTime - time;
  return currentBeat + (remaining / 60) * currentBpm;
}

/**
 * Get the time signature at a specific bar (1-indexed).
 */
export function getTimeSignatureAtBar(
  tsMap: TimeSignatureEvent[] | undefined,
  bar: number,
  fallbackNumerator: number,
  fallbackDenominator: number,
): { numerator: number; denominator: number } {
  if (!tsMap || tsMap.length === 0) {
    return { numerator: fallbackNumerator, denominator: fallbackDenominator };
  }

  let numerator = fallbackNumerator;
  let denominator = fallbackDenominator;

  for (const ev of tsMap) {
    if (ev.bar > bar) break;
    numerator = ev.numerator;
    denominator = ev.denominator;
  }

  return { numerator, denominator };
}

/**
 * Get the bar number (1-indexed) at a given beat position.
 */
export function getBarAtBeat(
  beat: number,
  tsMap: TimeSignatureEvent[] | undefined,
  fallbackNumerator: number,
): number {
  if (!tsMap || tsMap.length === 0) {
    return Math.floor(beat / fallbackNumerator) + 1;
  }

  let currentBeat = 0;
  let currentBar = 1;
  let currentNum = fallbackNumerator;
  let currentDen = 4;

  for (const ev of tsMap) {
    const barsToEvent = ev.bar - currentBar;
    const beatsToEvent = barsToEvent * getTimeSignatureBarLength(currentNum, currentDen);
    const eventBeat = currentBeat + beatsToEvent;

    if (beat < eventBeat) {
      const beatsIntoSection = beat - currentBeat;
      return currentBar + Math.floor(beatsIntoSection / getTimeSignatureBarLength(currentNum, currentDen));
    }

    currentBeat = eventBeat;
    currentBar = ev.bar;
    currentNum = ev.numerator;
    currentDen = ev.denominator;
  }

  const beatsIntoSection = beat - currentBeat;
  return currentBar + Math.floor(beatsIntoSection / getTimeSignatureBarLength(currentNum, currentDen));
}

/**
 * Get the beat position at the start of a given bar (1-indexed).
 */
export function getBeatAtBar(
  bar: number,
  tsMap: TimeSignatureEvent[] | undefined,
  fallbackNumerator: number,
): number {
  if (!tsMap || tsMap.length === 0) {
    return (bar - 1) * fallbackNumerator;
  }

  let currentBeat = 0;
  let currentBar = 1;
  let currentNum = fallbackNumerator;
  let currentDen = 4;

  for (const ev of tsMap) {
    if (ev.bar > bar) break;
    const barsToEvent = ev.bar - currentBar;
    currentBeat += barsToEvent * getTimeSignatureBarLength(currentNum, currentDen);
    currentBar = ev.bar;
    currentNum = ev.numerator;
    currentDen = ev.denominator;
  }

  const remainingBars = bar - currentBar;
  return currentBeat + remainingBars * getTimeSignatureBarLength(currentNum, currentDen);
}
