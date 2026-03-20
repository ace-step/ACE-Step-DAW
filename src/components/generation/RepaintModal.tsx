import { useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { openPostProduction } from '../../services/postProductionOrchestrator';

export function RepaintModal() {
  const repaintClipId = useUIStore((s) => s.repaintClipId);
  const repaintRange = useUIStore((s) => s.repaintRange);
  const setRepaintModal = useUIStore((s) => s.setRepaintModal);
  const getClipById = useProjectStore((s) => s.getClipById);
  const lastOpenedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!repaintClipId) {
      lastOpenedRef.current = null;
      return;
    }
    if (lastOpenedRef.current === repaintClipId) return;

    const clip = getClipById(repaintClipId);
    if (!clip) {
      setRepaintModal(null);
      return;
    }

    lastOpenedRef.current = repaintClipId;
    openPostProduction('repair', {
      targetClipIds: [repaintClipId],
      timeRange: {
        startTime: repaintRange?.start ?? clip.startTime,
        endTime: repaintRange?.end ?? clip.startTime + clip.duration,
      },
      prompt: clip.prompt ?? '',
      globalCaption: clip.globalCaption ?? '',
      lyricsOverride: clip.lyrics ?? '',
    });
    setRepaintModal(null);
  }, [getClipById, repaintClipId, repaintRange, setRepaintModal]);

  return null;
}
