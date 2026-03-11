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

  const draggedIdRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after'>('before');

  const handleDragStart = useCallback((id: string) => {
    draggedIdRef.current = id;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (!draggedIdRef.current || draggedIdRef.current === id) return;
    // Determine whether to insert before or after based on pointer position
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

  if (!project) return null;

  // Display tracks in visual order: lowest order at top
  const sortedTracks = [...project.tracks].sort((a, b) => a.order - b.order);

  return (
    <div
      className="flex flex-col w-[220px] min-w-[220px] bg-daw-surface border-r border-daw-border"
      onDragLeave={(e) => {
        // Clear highlight when pointer leaves the list container entirely
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOverId(null);
        }
      }}
    >
      {/* Header spacer aligned with TimeRuler */}
      <div className="h-6 border-b border-daw-border" />

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
    </div>
  );
}
