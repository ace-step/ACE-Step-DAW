import { useCallback } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useTransportStore } from '../store/transportStore';
import { useUIStore } from '../store/uiStore';
import { toastError, toastInfo, toastSuccess } from './useToast';

export function useCaptureMidi() {
  const project = useProjectStore((s) => s.project);
  const captureMidi = useProjectStore((s) => s.captureMidi);
  const selectClip = useUIStore((s) => s.selectClip);
  const setOpenPianoRoll = useUIStore((s) => s.setOpenPianoRoll);
  const openTrackId = useUIStore((s) => s.openPianoRollTrackId);

  const triggerCaptureMidi = useCallback((options?: { quantize?: number }) => {
    if (!project) {
      toastError('Create a project first');
      return;
    }

    const transportTime = useTransportStore.getState().currentTime;
    const result = captureMidi({
      trackId: openTrackId ?? undefined,
      quantize: options?.quantize,
      transportTime,
    });

    if (result.status === 'no-track') {
      toastError('Select, arm, or monitor a piano-roll track first');
      return;
    }

    if (result.status === 'empty') {
      toastInfo('No recent MIDI phrase to capture');
      return;
    }

    if (result.trackId && result.clipId) {
      setOpenPianoRoll(result.trackId, result.clipId);
      selectClip(result.clipId, false);
    }

    toastSuccess(
      result.createdNewClip
        ? `Captured ${result.noteCount} MIDI note${result.noteCount === 1 ? '' : 's'}`
        : `Captured ${result.noteCount} MIDI note${result.noteCount === 1 ? '' : 's'} into existing clip`,
    );
  }, [captureMidi, openTrackId, project, selectClip, setOpenPianoRoll]);

  return { triggerCaptureMidi };
}
