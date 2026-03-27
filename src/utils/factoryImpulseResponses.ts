/**
 * Factory impulse responses generated algorithmically using exponential decay noise buffers.
 * These provide built-in convolution reverb presets without requiring external audio files.
 */

export type FactoryIRType = 'smallRoom' | 'largeHall' | 'plate' | 'spring';

export interface FactoryIRPreset {
  label: string;
  duration: number;   // seconds
  decay: number;       // exponential decay rate (higher = faster decay)
  density: number;     // early reflection density multiplier (0–1)
  tonality: number;    // high-frequency dampening (0 = bright, 1 = dark)
}

export const FACTORY_IR_PRESETS: Record<FactoryIRType, FactoryIRPreset> = {
  smallRoom: {
    label: 'Small Room',
    duration: 0.8,
    decay: 4.0,
    density: 0.7,
    tonality: 0.3,
  },
  largeHall: {
    label: 'Large Hall',
    duration: 3.0,
    decay: 1.2,
    density: 0.5,
    tonality: 0.4,
  },
  plate: {
    label: 'Plate',
    duration: 1.5,
    decay: 2.5,
    density: 0.9,
    tonality: 0.15,
  },
  spring: {
    label: 'Spring',
    duration: 1.2,
    decay: 3.0,
    density: 0.4,
    tonality: 0.5,
  },
};

/**
 * Generate an impulse response buffer as a Float32Array.
 * Uses white noise shaped by exponential decay with optional HF dampening.
 */
export function generateImpulseResponse(
  preset: FactoryIRPreset,
  sampleRate: number,
): Float32Array {
  const length = Math.floor(preset.duration * sampleRate);
  const buffer = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    // Exponential decay envelope
    const envelope = Math.exp(-preset.decay * t);
    // White noise
    const noise = (Math.random() * 2 - 1);
    buffer[i] = noise * envelope * preset.density;
  }

  // Simple low-pass filtering for tonality (single-pole IIR)
  if (preset.tonality > 0) {
    const coefficient = preset.tonality * 0.95;
    for (let i = 1; i < length; i++) {
      buffer[i] = buffer[i] * (1 - coefficient) + buffer[i - 1] * coefficient;
    }
  }

  return buffer;
}
