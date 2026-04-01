/**
 * modulationWave.ts — Pure math for LFO waveform visualization.
 *
 * Generates waveform data for the modulation effects (chorus, flanger, phaser)
 * to display animated LFO curves in their effect cards.
 */

export type LfoShape = 'sine' | 'triangle';

export interface ModulationWavePoint {
  /** Normalized X position (0–1) */
  x: number;
  /** Waveform value (-1 to +1) */
  y: number;
}

/**
 * Generate one cycle of an LFO waveform.
 *
 * @param shape    Waveform shape
 * @param steps    Number of points to generate
 * @param phase    Phase offset (0–1, where 0.25 = 90°)
 * @returns        Array of (x, y) points where y is -1..+1
 */
export function generateLfoWave(
  shape: LfoShape,
  steps: number = 100,
  phase: number = 0,
): ModulationWavePoint[] {
  const points: ModulationWavePoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    const t = (x + phase) % 1.0;
    let y: number;

    switch (shape) {
      case 'sine':
        y = Math.sin(t * 2 * Math.PI);
        break;
      case 'triangle':
        if (t < 0.25) y = t * 4;
        else if (t < 0.75) y = 2 - t * 4;
        else y = t * 4 - 4;
        break;
    }

    points.push({ x, y });
  }

  return points;
}

/**
 * Generate stereo LFO pair with phase offset for chorus visualization.
 *
 * @param rate       LFO rate in Hz (visual only — determines label)
 * @param depth      Modulation depth (0–1, scales the amplitude)
 * @param stereoOffset Phase offset between L and R (0–0.5, default 0.25 = 90°)
 * @param steps      Number of points
 */
export function generateStereoLfo(
  depth: number,
  stereoOffset: number = 0.25,
  steps: number = 100,
): { left: ModulationWavePoint[]; right: ModulationWavePoint[] } {
  const left = generateLfoWave('sine', steps, 0).map((p) => ({
    ...p,
    y: p.y * depth,
  }));
  const right = generateLfoWave('sine', steps, stereoOffset).map((p) => ({
    ...p,
    y: p.y * depth,
  }));

  return { left, right };
}

/**
 * Generate comb filter frequency sweep path for flanger visualization.
 *
 * @param centerDelay Center delay in ms
 * @param depth       Modulation depth (0–1)
 * @param feedback    Feedback amount (-1..+1)
 * @param steps       Number of points
 */
export function generateCombSweep(
  centerDelay: number,
  depth: number,
  feedback: number,
  steps: number = 100,
): { delayLine: ModulationWavePoint[]; feedbackLine: ModulationWavePoint[] } {
  const delayLine: ModulationWavePoint[] = [];
  const feedbackLine: ModulationWavePoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    const t = x * 2 * Math.PI;
    const lfo = Math.sin(t);
    const delay = centerDelay + lfo * centerDelay * depth;

    delayLine.push({
      x,
      y: delay / (centerDelay * 2), // Normalize to 0–1 range
    });

    feedbackLine.push({
      x,
      y: Math.abs(feedback), // Constant line showing feedback amount
    });
  }

  return { delayLine, feedbackLine };
}

/**
 * Generate frequency sweep arcs for phaser visualization.
 *
 * @param baseFreq   Base frequency in Hz
 * @param depth      Sweep depth (0–1, maps to octave range)
 * @param stages     Number of allpass stages (notch count = stages/2)
 * @param steps      Number of points
 */
export function generatePhaserSweep(
  baseFreq: number,
  depth: number,
  stages: number,
  steps: number = 100,
): { sweep: ModulationWavePoint[]; notchCount: number } {
  const sweep: ModulationWavePoint[] = [];
  const octaveRange = 3; // 3 octave sweep range

  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    const t = x * 2 * Math.PI;
    const lfo = Math.sin(t);
    // Frequency modulation in octave space
    const freqMod = baseFreq * Math.pow(2, lfo * depth * octaveRange);
    // Normalize to log scale for display (20Hz–20kHz → 0–1)
    const logMin = Math.log10(20);
    const logMax = Math.log10(20000);
    const normalized = (Math.log10(Math.max(20, Math.min(20000, freqMod))) - logMin) / (logMax - logMin);

    sweep.push({ x, y: normalized });
  }

  return { sweep, notchCount: Math.floor(stages / 2) };
}
