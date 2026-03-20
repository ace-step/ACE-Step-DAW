import { useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import type { ContextWindow } from '../../services/contextAudioExtractor';
import { openPostProduction } from '../../services/postProductionOrchestrator';

interface Props {
  trackId: string;
  startTime: number;
  duration: number;
  contextWindow: ContextWindow | null;
  onClose: () => void;
  clipId?: string;
}

export function AddLayerModal({ trackId, startTime, duration, contextWindow, onClose, clipId }: Props) {
  const getClipById = useProjectStore((s) => s.getClipById);
  const getTrackById = useProjectStore((s) => s.getTrackById);
  const openedRef = useRef(false);

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;

    const clip = clipId ? getClipById(clipId) : null;
    const track = getTrackById(trackId);

    openPostProduction('extend', {
      targetTrackIds: [trackId],
      targetClipIds: clipId ? [clipId] : [],
      timeRange: {
        startTime: clip?.startTime ?? startTime,
        endTime: (clip?.startTime ?? startTime) + (clip?.duration ?? duration),
      },
      prompt: clip?.prompt ?? track?.localCaption ?? track?.displayName ?? '',
      globalCaption: clip?.globalCaption ?? '',
      lyricsOverride: clip?.lyrics ?? '',
      contextMode: contextWindow ? 'context' : 'none',
    });
    onClose();
  }, [clipId, contextWindow, duration, getClipById, getTrackById, onClose, startTime, trackId]);

  return null;
}
