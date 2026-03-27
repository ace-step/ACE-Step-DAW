import { useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { loadAudioBlobByKey } from '../../services/audioFileManager';
import { computeWaveformPeaks } from '../../utils/waveformPeaks';
import { CLIP_WAVEFORM_PEAK_COUNT } from '../../utils/clipAudio';

const waveformUpgradeInFlight = new Set<string>();

/**
 * Upgrades a clip's waveform peaks to high resolution when the clip
 * becomes ready and has an isolated audio key.
 */
export function useWaveformUpgrade(
  clipId: string,
  generationStatus: string,
  isolatedAudioKey: string | null | undefined,
  waveformPeaks: number[] | null,
  audioDuration: number | undefined,
) {
  useEffect(() => {
    if (generationStatus !== 'ready' || !isolatedAudioKey) return;
    if (waveformPeaks && waveformPeaks.length >= CLIP_WAVEFORM_PEAK_COUNT) return;
    if (waveformUpgradeInFlight.has(clipId)) return;

    let cancelled = false;
    waveformUpgradeInFlight.add(clipId);

    void (async () => {
      try {
        const blob = await loadAudioBlobByKey(isolatedAudioKey);
        if (!blob || cancelled) return;

        const buffer = await getAudioEngine().decodeAudioData(blob);
        if (cancelled) return;

        const upgradedPeaks = computeWaveformPeaks(buffer, CLIP_WAVEFORM_PEAK_COUNT);
        useProjectStore.setState((state) => {
          if (!state.project) return state;
          return {
            ...state,
            project: {
              ...state.project,
              updatedAt: Date.now(),
              tracks: state.project.tracks.map((candidate) => ({
                ...candidate,
                clips: candidate.clips.map((candidateClip) => (
                  candidateClip.id === clipId
                    ? {
                        ...candidateClip,
                        waveformPeaks: upgradedPeaks,
                        audioDuration: candidateClip.audioDuration ?? buffer.duration,
                      }
                    : candidateClip
                )),
              })),
            },
          };
        });
      } catch {
        // Keep the existing waveform if the upgrade pass fails.
      } finally {
        waveformUpgradeInFlight.delete(clipId);
      }
    })();

    return () => {
      cancelled = true;
      waveformUpgradeInFlight.delete(clipId);
    };
  }, [audioDuration, generationStatus, clipId, isolatedAudioKey, waveformPeaks]);
}
