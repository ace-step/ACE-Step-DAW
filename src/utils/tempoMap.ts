import type { TempoEvent, TimeSignatureEvent } from '../types/project';

export function getTimeSignatureBeatLength(denominator: number): number {
  return 4 / Math.max(1, denominator);
}

export function getTimeSignatureBarLength(numerator: number, denominator: number): number {
  return Math.max(1, numerator) * getTimeSignatureBeatLength(denominator);
}

/**
 * Get the BPM at a specific beat position.
 * If a ramp is active, interpolates linearly between the previous and current event BPMs.
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
        return prevBpm + (ev.bpm - prevBpm) * t;
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
        const fullSegBeats = ev.beat - currentBeat;
        const t = segBeats / fullSegBeats;
        const startBpm = currentBpm;
        const endBpm = currentBpm + (ev.bpm - currentBpm) * t;
        const avgBpm = (startBpm + endBpm) / 2;
        time += (segBeats / avgBpm) * 60;
      } else {
        time += ((beat - currentBeat) / currentBpm) * 60;
      }
      return time;
    }

    const segBeats = ev.beat - currentBeat;
    if (segBeats > 0) {
      if (ev.ramp) {
        const avgBpm = (currentBpm + ev.bpm) / 2;
        time += (segBeats / avgBpm) * 60;
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
        const avgBpm = (currentBpm + ev.bpm) / 2;
        segTime = (segBeats / avgBpm) * 60;
      } else {
        segTime = (segBeats / currentBpm) * 60;
      }

      if (time + segTime >= targetTime) {
        const remaining = targetTime - time;
        if (ev.ramp) {
          const bpmRate = (ev.bpm - currentBpm) / segBeats;
          let b = remaining * currentBpm / 60;
          for (let iter = 0; iter < 10; iter++) {
            const endBpm = currentBpm + bpmRate * b;
            const avgBpm = (currentBpm + endBpm) / 2;
            const actualTime = (b / avgBpm) * 60;
            const error = remaining - actualTime;
            if (Math.abs(error) < 1e-9) break;
            b += error * currentBpm / 60;
          }
          return currentBeat + Math.max(0, b);
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
  fallbackDenominator: number = 4,
): number {
  if (!tsMap || tsMap.length === 0) {
    return Math.floor(beat / getTimeSignatureBarLength(fallbackNumerator, fallbackDenominator)) + 1;
  }

  let currentBeat = 0;
  let currentBar = 1;
  let currentNum = fallbackNumerator;
  let currentDen = fallbackDenominator;

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
  fallbackDenominator: number = 4,
): number {
  if (!tsMap || tsMap.length === 0) {
    return (bar - 1) * getTimeSignatureBarLength(fallbackNumerator, fallbackDenominator);
  }

  let currentBeat = 0;
  let currentBar = 1;
  let currentNum = fallbackNumerator;
  let currentDen = fallbackDenominator;

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
