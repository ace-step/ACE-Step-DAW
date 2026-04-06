import { useCallback } from 'react';
import { useProjectStore } from '../store/projectStore';
import { parseSfz } from '../utils/sfzParser';
import { createDefaultZone } from '../utils/sampleZones';
import type { SampleZone } from '../types/project';

/**
 * Hook to import SFZ files and convert them to sample zones.
 *
 * Note: SFZ import creates zone definitions with sample file paths.
 * The actual audio files still need to be loaded separately through
 * the audio import pipeline. This import sets up the zone layout.
 */
export function useSfzImport() {
  const setSampleZones = useProjectStore((s) => s.setSampleZones);

  const importSfzFile = useCallback(
    async (trackId: string) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.sfz';

      return new Promise<void>((resolve) => {
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) {
            resolve();
            return;
          }

          const text = await file.text();
          const result = parseSfz(text);

          const zones: SampleZone[] = result.regions.map((region) => {
            // Convert SFZ volume (dB) to linear gain
            const volumeDb = region.volume ?? 0;
            const volumeLinear = Math.pow(10, volumeDb / 20);

            // Convert SFZ pan (-100 to 100) to our range (-1 to 1)
            const panNormalized = (region.pan ?? 0) / 100;

            return createDefaultZone('', {
              sampleName: region.sample,
              rootNote: region.pitchKeycenter,
              lowKey: region.lokey,
              highKey: region.hikey,
              lowVelocity: region.lovel,
              highVelocity: region.hivel,
              volume: Math.min(1, Math.max(0, volumeLinear)),
              pan: Math.min(1, Math.max(-1, panNormalized)),
              tuneOffset: region.tune ?? 0,
            });
          });

          if (zones.length > 0) {
            setSampleZones(trackId, zones);
          }
          resolve();
        };

        input.click();
      });
    },
    [setSampleZones],
  );

  return { importSfzFile };
}
