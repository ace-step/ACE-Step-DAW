/**
 * Preset Preview Service — plays short MIDI phrases to audition instrument presets.
 *
 * Uses a dedicated preview voice that doesn't interrupt playback.
 * Supports subtractive, FM, and wavetable presets.
 */

import type { InstrumentPreset } from '../data/instrumentPresets';
import type { SubtractiveInstrumentSettings } from '../types/project';

// Genre-matched preview phrases per category (MIDI pitch arrays with durations)
export interface PreviewNote {
  pitch: number;
  duration: number;
  velocity: number;
  delay: number; // seconds from start
}

const PREVIEW_PHRASES: Record<string, PreviewNote[]> = {
  Bass: [
    { pitch: 36, duration: 0.3, velocity: 100, delay: 0 },
    { pitch: 38, duration: 0.2, velocity: 90, delay: 0.35 },
    { pitch: 40, duration: 0.3, velocity: 95, delay: 0.6 },
    { pitch: 36, duration: 0.4, velocity: 100, delay: 0.95 },
  ],
  Lead: [
    { pitch: 72, duration: 0.25, velocity: 90, delay: 0 },
    { pitch: 74, duration: 0.15, velocity: 85, delay: 0.3 },
    { pitch: 76, duration: 0.25, velocity: 95, delay: 0.5 },
    { pitch: 79, duration: 0.4, velocity: 100, delay: 0.8 },
  ],
  Pad: [
    { pitch: 60, duration: 1.5, velocity: 70, delay: 0 },
    { pitch: 64, duration: 1.5, velocity: 65, delay: 0 },
    { pitch: 67, duration: 1.5, velocity: 60, delay: 0 },
  ],
  Pluck: [
    { pitch: 60, duration: 0.15, velocity: 90, delay: 0 },
    { pitch: 64, duration: 0.15, velocity: 85, delay: 0.2 },
    { pitch: 67, duration: 0.15, velocity: 90, delay: 0.4 },
    { pitch: 72, duration: 0.15, velocity: 95, delay: 0.6 },
  ],
  Keys: [
    { pitch: 60, duration: 0.4, velocity: 80, delay: 0 },
    { pitch: 64, duration: 0.4, velocity: 75, delay: 0 },
    { pitch: 67, duration: 0.4, velocity: 70, delay: 0 },
    { pitch: 62, duration: 0.4, velocity: 80, delay: 0.5 },
    { pitch: 65, duration: 0.4, velocity: 75, delay: 0.5 },
    { pitch: 69, duration: 0.4, velocity: 70, delay: 0.5 },
  ],
  Bell: [
    { pitch: 72, duration: 0.5, velocity: 85, delay: 0 },
    { pitch: 76, duration: 0.4, velocity: 80, delay: 0.3 },
    { pitch: 79, duration: 0.6, velocity: 90, delay: 0.55 },
  ],
  FX: [
    { pitch: 60, duration: 1.0, velocity: 80, delay: 0 },
  ],
  Wavetable: [
    { pitch: 60, duration: 0.5, velocity: 85, delay: 0 },
    { pitch: 67, duration: 0.5, velocity: 80, delay: 0.55 },
    { pitch: 72, duration: 0.7, velocity: 90, delay: 1.1 },
  ],
  default: [
    { pitch: 60, duration: 0.3, velocity: 85, delay: 0 },
    { pitch: 64, duration: 0.3, velocity: 80, delay: 0.35 },
    { pitch: 67, duration: 0.4, velocity: 90, delay: 0.7 },
  ],
};

export function getPreviewPhrase(category: string): PreviewNote[] {
  return PREVIEW_PHRASES[category] ?? PREVIEW_PHRASES.default;
}

/**
 * Play a preview phrase for a preset using the SubtractiveEngine's preview mechanism.
 * Returns a cancel function to stop preview early.
 */
export async function playPresetPreview(
  preset: InstrumentPreset,
  previewFn: (pitch: number, velocity: number, duration: number, settings: SubtractiveInstrumentSettings) => Promise<void>,
): Promise<() => void> {
  const phrase = getPreviewPhrase(preset.category);
  let cancelled = false;
  const timeouts: ReturnType<typeof setTimeout>[] = [];

  for (const note of phrase) {
    const timeout = setTimeout(() => {
      if (cancelled) return;
      if (preset.instrumentKind === 'subtractive' && preset.instrument.kind === 'subtractive') {
        previewFn(note.pitch, note.velocity, note.duration, preset.instrument.settings);
      }
    }, note.delay * 1000);
    timeouts.push(timeout);
  }

  return () => {
    cancelled = true;
    timeouts.forEach(clearTimeout);
  };
}

/** Check if a preset supports preview (currently only subtractive). */
export function canPreview(preset: InstrumentPreset): boolean {
  return preset.instrumentKind === 'subtractive' && preset.instrument.kind === 'subtractive';
}
