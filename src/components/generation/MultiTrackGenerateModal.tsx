import { useEffect, useRef } from 'react';
import type { ContextWindow } from '../../services/contextAudioExtractor';
import { openPostProduction } from '../../services/postProductionOrchestrator';

interface Props {
  selectWindow: { startTime: number; endTime: number; trackIds?: string[] };
  contextWindow: (ContextWindow & { trackIds?: string[] }) | null;
  onClose: () => void;
}

export function MultiTrackGenerateModal({ selectWindow, contextWindow, onClose }: Props) {
  const openedRef = useRef(false);

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;

    openPostProduction('extend', {
      targetTrackIds: selectWindow.trackIds ?? [],
      timeRange: {
        startTime: selectWindow.startTime,
        endTime: selectWindow.endTime,
      },
      contextMode: contextWindow ? 'context' : 'none',
    });
    onClose();
  }, [contextWindow, onClose, selectWindow.endTime, selectWindow.startTime, selectWindow.trackIds]);

  return null;
}
