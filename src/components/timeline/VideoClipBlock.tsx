/**
 * VideoClipBlock — renders a video clip in the timeline lane.
 * Shows filmstrip thumbnails as background with video metadata overlay.
 * Phase 5 of the video track epic (#1144).
 */
import { memo, useCallback, useState } from 'react';
import type { Clip, Track } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';

interface VideoClipBlockProps {
  clip: Clip;
  track: Track;
}

function VideoClipBlockInner({ clip, track }: VideoClipBlockProps) {
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const selectClip = useUIStore((s) => s.selectClip);
  const removeClip = useProjectStore((s) => s.removeClip);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const isSelected = selectedClipIds.has(clip.id);
  const left = clip.startTime * pixelsPerSecond;
  const width = clip.duration * pixelsPerSecond;
  const videoMeta = clip.videoMeta;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    selectClip(clip.id, e.shiftKey);
  }, [clip.id, selectClip]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Format resolution string
  const resLabel = videoMeta
    ? `${videoMeta.width}×${videoMeta.height}`
    : '';
  const fpsLabel = videoMeta ? `${videoMeta.frameRate}fps` : '';
  const codecLabel = videoMeta?.codec || '';

  return (
    <>
      <div
        className={`absolute top-0 bottom-0 rounded-sm overflow-hidden cursor-pointer border ${
          isSelected
            ? 'border-[var(--daw-accent)] ring-1 ring-[var(--daw-accent)]/30'
            : 'border-[var(--daw-border)]'
        }`}
        style={{ left, width, minWidth: 4 }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        data-testid="video-clip-block"
        data-clip-id={clip.id}
        data-track-id={track.id}
        aria-label={`Video clip: ${clip.prompt || 'Video Clip'}, ${Math.round(clip.duration)}s`}
      >
        {/* Filmstrip background placeholder — solid gradient until filmstrip generation */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, var(--daw-surface) 0%, var(--daw-surface-2) 50%, var(--daw-surface) 100%)',
            opacity: track.videoSettings?.filmstripOpacity ?? 0.8,
          }}
        />

        {/* Film icon pattern overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-20">
          <span className="text-3xl">🎬</span>
        </div>

        {/* Header bar */}
        <div className="relative z-10 flex items-center gap-1 px-1.5 py-0.5 bg-black/40 text-[10px] text-white/80 truncate">
          <span className="font-medium truncate">
            {clip.prompt || 'Video Clip'}
          </span>
        </div>

        {/* Bottom metadata bar */}
        {videoMeta && width > 80 && (
          <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center gap-1.5 px-1.5 py-0.5 bg-black/50 text-[9px] text-white/60">
            {codecLabel && <span>{codecLabel}</span>}
            {resLabel && <span>{resLabel}</span>}
            {fpsLabel && <span>{fpsLabel}</span>}
          </div>
        )}
      </div>

      {/* Context menu with click-outside-to-close */}
      {ctxMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setCtxMenu(null)}
          />
          <div
            className="fixed z-50 min-w-[160px] bg-[var(--daw-surface-2)] border border-[var(--daw-border)] rounded shadow-lg py-1"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-1 text-xs text-white/80 hover:bg-[var(--daw-surface-3)]"
              onClick={() => {
                removeClip(clip.id);
                setCtxMenu(null);
              }}
            >
              Remove Clip
            </button>
            <button
              className="w-full text-left px-3 py-1 text-xs text-white/80 hover:bg-[var(--daw-surface-3)]"
              onClick={() => setCtxMenu(null)}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </>
  );
}

export const VideoClipBlock = memo(VideoClipBlockInner);
