import { useCallback } from 'react';
import { useUIStore } from '../store/uiStore';
import { useProjectStore } from '../store/projectStore';
import { useTransportStore } from '../store/transportStore';
import { snapToGrid } from '../utils/time';
import { DEFAULT_DURATION } from '../constants/defaults';

export function useTimelineInteraction() {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const project = useProjectStore((s) => s.project);
  const addClip = useProjectStore((s) => s.addClip);

  const pixelsToSeconds = useCallback(
    (px: number) => px / pixelsPerSecond,
    [pixelsPerSecond],
  );

  const secondsToPixels = useCallback(
    (s: number) => s * pixelsPerSecond,
    [pixelsPerSecond],
  );

  const handleLaneClick = useCallback(
    (trackId: string, clickX: number, scrollX: number) => {
      if (!project) return;

      const rawTime = (clickX + scrollX) / pixelsPerSecond;
      const snappedTime = snapToGrid(rawTime, project.bpm, 1);
      const remainingTime = project.totalDuration - snappedTime;
      const defaultDuration = Math.min(DEFAULT_DURATION, Math.max(0.5, remainingTime));

      const clip = addClip(trackId, {
        startTime: Math.max(0, snappedTime),
        duration: defaultDuration,
        prompt: '',
        lyrics: '',
      });

      useUIStore.getState().setEditingClip(clip.id);
    },
    [project, pixelsPerSecond, addClip],
  );

  const handleTimelineClick = useCallback(
    (clickX: number, scrollX: number) => {
      if (!project) return;
      const time = (clickX + scrollX) / pixelsPerSecond;
      useTransportStore.getState().seek(Math.max(0, Math.min(time, project.totalDuration)));
    },
    [project, pixelsPerSecond],
  );

  return {
    pixelsToSeconds,
    secondsToPixels,
    handleLaneClick,
    handleTimelineClick,
  };
}
