import React, { useCallback } from 'react';
import type { SessionClipSlot } from '../../types/session';
import { useSessionStore } from '../../store/sessionStore';

interface SessionClipSlotViewProps {
  slot: SessionClipSlot;
  trackColor: string;
}

export const SessionClipSlotView = React.memo(function SessionClipSlotView({ slot, trackColor }: SessionClipSlotViewProps) {
  const launchSlot = useSessionStore((s) => s.launchSlot);
  const stopSlot = useSessionStore((s) => s.stopSlot);

  const handleClick = useCallback(() => {
    if (slot.state === 'playing') {
      stopSlot(slot.id);
    } else if (slot.clipId) {
      launchSlot(slot.id);
    }
  }, [slot.id, slot.clipId, slot.state, launchSlot, stopSlot]);

  const isEmpty = !slot.clipId;
  const isPlaying = slot.state === 'playing';
  const bgColor = slot.color ?? trackColor;

  return (
    <button
      className={`
        w-full h-12 rounded border text-xs font-medium
        transition-all duration-100 cursor-pointer
        flex items-center justify-center gap-1
        ${isEmpty
          ? 'border-zinc-700 bg-zinc-800/50 text-zinc-600 hover:bg-zinc-700/50'
          : isPlaying
            ? 'border-green-500 text-white shadow-[0_0_8px_rgba(34,197,94,0.3)]'
            : 'border-zinc-600 text-zinc-200 hover:brightness-110'
        }
      `}
      style={!isEmpty ? { backgroundColor: `${bgColor}33` } : undefined}
      onClick={handleClick}
      data-testid={`session-slot-${slot.id}`}
      data-slot-id={slot.id}
      data-track-id={slot.trackId}
      title={isEmpty ? 'Empty slot' : isPlaying ? 'Click to stop' : 'Click to launch'}
      aria-label={
        isEmpty
          ? `Empty slot, scene ${slot.sceneIndex + 1}`
          : isPlaying
            ? `Stop clip in scene ${slot.sceneIndex + 1}`
            : `Launch clip in scene ${slot.sceneIndex + 1}`
      }
    >
      {isPlaying && (
        <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      )}
      {!isEmpty && !isPlaying && (
        <span
          className="inline-block w-0 h-0 border-l-[6px] border-t-[4px] border-b-[4px] border-l-current border-t-transparent border-b-transparent"
        />
      )}
      {isEmpty && <span className="text-zinc-600">+</span>}
    </button>
  );
});
