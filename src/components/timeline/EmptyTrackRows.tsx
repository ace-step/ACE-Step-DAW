import { useRef, useCallback, useState, useLayoutEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { TempoEvent } from '../../types/project';
import { getBarDuration, snapToGrid } from '../../utils/time';
import { useAudioImport } from '../../hooks/useAudioImport';
import { getDragPayload, clearDragPayload } from '../../utils/dragPayload';
import { clientXToLaneX } from '../../utils/timelineCoords';
import { getArrangementEmptyTrackId } from '../arrangement/trackSlotLayout';
import { DEFAULT_ARRANGEMENT_ROW_HEIGHT } from '../arrangement/rowLayout';

const PLACEHOLDER_ROW_HEIGHT = DEFAULT_ARRANGEMENT_ROW_HEIGHT;
const EMPTY_TEMPO_MAP: TempoEvent[] = [];

export function ArrangementEmptyTrackHeaderRow({
  slotIndex,
  isCollapsed,
  isDropDisabled,
  isDragOver,
  onDragOver,
  onDrop,
}: {
  slotIndex: number;
  isCollapsed: boolean;
  isDropDisabled: boolean;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent, slotIndex: number) => void;
  onDrop: (e: React.DragEvent, slotIndex: number) => void;
}) {
  const setShowInstrumentPicker = useUIStore((s) => s.setShowInstrumentPicker);
  const selectTrack = useUIStore((s) => s.selectTrack);
  const selectedTrackIds = useUIStore((s) => s.selectedTrackIds);
  const virtualId = getArrangementEmptyTrackId(slotIndex);
  const isSelected = selectedTrackIds.has(virtualId);

  return (
    <div
      className="relative flex items-center justify-center border-b cursor-pointer group"
      style={{
        height: PLACEHOLDER_ROW_HEIGHT,
        borderColor: 'var(--color-daw-arrangement-separator)',
        backgroundColor: isDragOver ? 'rgba(94, 89, 255, 0.12)' : undefined,
        boxShadow: isDragOver ? 'inset 0 0 0 1px rgba(94, 89, 255, 0.45)' : undefined,
      }}
      onClick={() => {
        selectTrack(virtualId, false);
        setShowInstrumentPicker(true);
      }}
      onDragOver={isDropDisabled ? undefined : (e) => onDragOver(e, slotIndex)}
      onDrop={isDropDisabled ? undefined : (e) => onDrop(e, slotIndex)}
      aria-label={`Empty track slot ${slotIndex + 1}`}
      data-drop-disabled={isDropDisabled ? 'true' : 'false'}
      data-testid={`empty-header-row-${slotIndex}`}
    >
      {isSelected && (
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'rgba(94, 89, 255, 0.24)' }} />
      )}
      <span className={`text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity ${isCollapsed ? 'text-sm' : 'text-lg'}`}>+</span>
    </div>
  );
}

export function EmptyTrackRow({ slotIndex }: { slotIndex: number }) {
  const selectedTrackIds = useUIStore((s) => s.selectedTrackIds);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const setTrackLaneRect = useUIStore((s) => s.setTrackLaneRect);
  const removeTrackLaneRect = useUIStore((s) => s.removeTrackLaneRect);
  const hasProject = useProjectStore((s) => Boolean(s.project));
  const bpm = useProjectStore((s) => s.project?.bpm ?? 120);
  const timeSignature = useProjectStore((s) => s.project?.timeSignature ?? 4);
  const timeSignatureDenominator = useProjectStore((s) => s.project?.timeSignatureDenominator ?? 4);
  const tempoMap = useProjectStore((s) => s.project?.tempoMap ?? EMPTY_TEMPO_MAP);
  const addTrack = useProjectStore((s) => s.addTrack);
  const virtualId = getArrangementEmptyTrackId(slotIndex);
  const isSelected = selectedTrackIds.has(virtualId);
  const {
    importAudioToTrack,
    importLoopToTrack,
    importAudioFileAsNewQuickSampler,
    importAssetAsNewTrack,
  } = useAudioImport();

  const laneRef = useRef<HTMLDivElement>(null);
  const [dropGhost, setDropGhost] = useState<{ left: number; width: number; name: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const defaultClipDuration = hasProject
    ? getBarDuration(bpm, timeSignature, timeSignatureDenominator) * 4
    : 8;

  useLayoutEffect(() => {
    const el = laneRef.current;
    if (!el) return;

    const update = () => {
      const parentEl = el.offsetParent as HTMLElement | null;
      const parentOffset = parentEl ? parentEl.offsetTop : 0;
      setTrackLaneRect(virtualId, {
        top: el.offsetTop + parentOffset,
        height: el.offsetHeight,
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);

    return () => {
      ro.disconnect();
      removeTrackLaneRect(virtualId);
    };
  }, [removeTrackLaneRect, setTrackLaneRect, virtualId]);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (types.includes('Files') || types.includes('application/x-loop-id') || types.includes('application/x-asset-id')) {
      e.preventDefault();
      dragCounterRef.current++;
      setIsDragOver(true);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (types.includes('Files') || types.includes('application/x-loop-id') || types.includes('application/x-asset-id')) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';

      if (hasProject) {
        const payload = getDragPayload();
        const laneX = clientXToLaneX(e.clientX);
        const rawTime = laneX / pixelsPerSecond;
        const snappedTime = Math.max(0, snapToGrid(rawTime, bpm, 1, tempoMap));
        const ghostDuration = payload?.duration ?? defaultClipDuration;
        const ghostName = payload?.name ?? (types.includes('Files') ? 'Audio file' : 'Audio');
        setDropGhost({
          left: snappedTime * pixelsPerSecond,
          width: ghostDuration * pixelsPerSecond,
          name: ghostName,
        });
      }
    }
  }, [hasProject, pixelsPerSecond, defaultClipDuration, bpm, tempoMap]);

  const onDragLeave = useCallback(() => {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
      setDropGhost(null);
    }
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    setDropGhost(null);
    clearDragPayload();
    if (!hasProject) return;

    const laneX = clientXToLaneX(e.clientX);
    const rawTime = laneX / pixelsPerSecond;
    const startTime = Math.max(0, snapToGrid(rawTime, bpm, 1, tempoMap));

    const loopId = e.dataTransfer.getData('application/x-loop-id');
    if (loopId) {
      const newTrack = addTrack('custom', 'sample', { order: slotIndex + 1 });
      await importLoopToTrack(loopId, newTrack.id, startTime);
      return;
    }

    const assetId = e.dataTransfer.getData('application/x-asset-id');
    if (assetId) {
      await importAssetAsNewTrack(assetId, startTime, { order: slotIndex + 1 });
      return;
    }

    const wantsQuickSampler = e.altKey;
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      for (const file of Array.from(files)) {
        if (file.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|aac|m4a|webm)$/i.test(file.name)) {
          if (wantsQuickSampler) {
            await importAudioFileAsNewQuickSampler(file);
          } else {
            const newTrack = addTrack('custom', 'sample', { order: slotIndex + 1 });
            useProjectStore.getState().updateTrack(newTrack.id, {
              displayName: file.name.replace(/\.[^.]+$/, ''),
            });
            await importAudioToTrack(file, newTrack.id, startTime);
          }
        }
      }
    }
  }, [hasProject, pixelsPerSecond, addTrack, importAudioToTrack, importLoopToTrack, importAssetAsNewTrack, importAudioFileAsNewQuickSampler, bpm, tempoMap, slotIndex]);

  return (
    <div
      ref={laneRef}
      data-track-id={virtualId}
      data-timeline-lane
      className="relative"
      style={{
        height: PLACEHOLDER_ROW_HEIGHT,
        borderBottom: '1px solid var(--color-daw-arrangement-separator)',
        backgroundColor: isDragOver ? 'rgba(94, 89, 255, 0.08)' : undefined,
      }}
      data-testid={`empty-row-${slotIndex}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isSelected && (
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'rgba(94, 89, 255, 0.24)' }} />
      )}
      {dropGhost && (
        <div
          className="absolute top-1 bottom-1 rounded-md pointer-events-none z-30 flex items-center overflow-hidden"
          style={{
            left: dropGhost.left,
            width: Math.max(dropGhost.width, 4),
            backgroundColor: 'rgba(94, 89, 255, 0.30)',
            border: '1px dashed rgba(94, 89, 255, 0.7)',
          }}
        >
          <span className="text-[10px] text-white/70 px-2 truncate">{dropGhost.name}</span>
        </div>
      )}
    </div>
  );
}
