import { useState, useCallback, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { TrackHeader } from './TrackHeader';
import { TrackInspector } from './TrackInspector';
import { AddTrackButton } from './AddTrackButton';

export function TrackList() {
  const project = useProjectStore((s) => s.project);
  const reorderTrack = useProjectStore((s) => s.reorderTrack);
  const expandedTrackId = useUIStore((s) => s.expandedTrackId);
  const trackListWidth = useUIStore((s) => s.trackListWidth);
  const setTrackListWidth = useUIStore((s) => s.setTrackListWidth);

  const draggedIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after'>('before');

  const handleDragStart = useCallback((id: string) => {
    draggedIdRef.current = id;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (!draggedIdRef.current || draggedIdRef.current === id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDragOverId(id);
    setDragOverPosition(e.clientY < midY ? 'before' : 'after');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = draggedIdRef.current;
    if (!draggedId || draggedId === targetId) {
      setDragOverId(null);
      draggedIdRef.current = null;
      return;
    }
    reorderTrack(draggedId, targetId, dragOverPosition);
    setDragOverId(null);
    draggedIdRef.current = null;
  }, [reorderTrack, dragOverPosition]);

  const handleDragEnd = useCallback(() => {
    draggedIdRef.current = null;
    setDragOverId(null);
  }, []);

  // Width resize handle
  const resizeDragRef = useRef<{ startX: number; startW: number } | null>(null);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeDragRef.current = { startX: e.clientX, startW: trackListWidth };
    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeDragRef.current) return;
      const delta = ev.clientX - resizeDragRef.current.startX;
      setTrackListWidth(resizeDragRef.current.startW + delta);
    };
    const onMouseUp = () => {
      resizeDragRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [trackListWidth, setTrackListWidth]);

  if (!project) return null;

  const sortedTracks = [...project.tracks].sort((a, b) => a.order - b.order);

  return (
    <div
      className="flex flex-col bg-daw-surface border-r border-daw-border relative shrink-0"
      style={{ width: trackListWidth }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOverId(null);
        }
      }}
    >
      {/* Header spacer aligned with TimeRuler */}
      <div className="h-6 border-b border-daw-border shrink-0" />

      <div className="flex-1 overflow-y-auto">
        {sortedTracks.map((track) => (
          <div key={track.id}>
            <TrackHeader
              track={track}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              isDragOver={dragOverId === track.id}
              dragOverPosition={dragOverId === track.id ? dragOverPosition : null}
            />
            {expandedTrackId === track.id && (
              <TrackInspector track={track} />
            )}
          </div>
        ))}
      </div>

      <AddTrackButton />

      {/* Right-edge resize handle */}
      <div
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize bg-transparent hover:bg-indigo-500/40 transition-colors z-10"
        onMouseDown={onResizeMouseDown}
      />
    </div>
  );
}
