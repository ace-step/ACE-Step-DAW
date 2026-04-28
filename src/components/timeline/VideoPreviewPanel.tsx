/**
 * VideoPreviewPanel — docked or floating video preview for video tracks.
 * Shows the current video frame synchronized with the transport position.
 * Phase 5 of the video track epic (#1144).
 */
import { memo, useRef, useMemo } from 'react';
import type { Track, VideoPreviewSize } from '../../types/project';
import { useTransportStore } from '../../store/transportStore';

const PREVIEW_SIZES: Record<VideoPreviewSize, { width: number; height: number }> = {
  small: { width: 320, height: 180 },
  medium: { width: 640, height: 360 },
  large: { width: 960, height: 540 },
};

interface VideoPreviewPanelProps {
  track: Track;
}

function VideoPreviewPanelInner({ track }: VideoPreviewPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentTime = useTransportStore((s) => s.currentTime);

  const settings = track.videoSettings;
  const previewSize = settings?.previewSize ?? 'medium';
  const showTimecode = settings?.showTimecodeOverlay ?? false;
  const { width, height } = PREVIEW_SIZES[previewSize];

  // Find the first video clip that covers current transport time
  const activeClip = useMemo(() => {
    return track.clips.find(
      (c) => currentTime >= c.startTime && currentTime < c.startTime + c.duration,
    );
  }, [track.clips, currentTime]);

  // Format timecode HH:MM:SS:FF using integer nominal frame rate
  // (e.g., 29.97fps → 30 nominal for SMPTE non-drop-frame display)
  const timecode = useMemo(() => {
    if (!activeClip?.videoMeta) return '00:00:00:00';
    const frameRate = activeClip.videoMeta.frameRate || 30;
    const nominalFps = Math.ceil(frameRate); // 29.97 → 30, 23.976 → 24
    const elapsed = currentTime - activeClip.startTime;
    const videoTime = (activeClip.videoMeta.sourceOffset || 0) + elapsed;
    const totalFrames = Math.floor(videoTime * frameRate);
    const hours = Math.floor(totalFrames / (nominalFps * 3600));
    const minutes = Math.floor((totalFrames % (nominalFps * 3600)) / (nominalFps * 60));
    const seconds = Math.floor((totalFrames % (nominalFps * 60)) / nominalFps);
    const frames = totalFrames % nominalFps;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  }, [activeClip, currentTime]);

  const hasVideo = !!activeClip?.videoMeta;

  return (
    <div
      className="relative flex-shrink-0 bg-black border-b border-[var(--daw-border)]"
      style={{ width, height }}
      data-testid="video-preview-panel"
    >
      {hasVideo ? (
        <>
          {/* Video element stub — not yet wired to IndexedDB blob or transport sync.
              Future PR will: load blob via videoStorageService → createObjectURL → set src,
              sync videoRef.currentTime via VideoSyncEngine on transport updates,
              and clean up object URLs on unmount. */}
          <video
            ref={videoRef}
            className="w-full h-full object-contain bg-black"
            muted
            playsInline
          />

          {/* Timecode overlay */}
          {showTimecode && (
            <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-0.5 rounded text-[11px] font-mono text-white/90 tracking-wider">
              {timecode}
            </div>
          )}
        </>
      ) : (
        /* Empty state — no active video clip */
        <div className="w-full h-full flex flex-col items-center justify-center gap-2">
          <span className="text-2xl opacity-30">🎬</span>
          <span className="text-xs text-white/30">No video at playhead</span>
        </div>
      )}
    </div>
  );
}

export const VideoPreviewPanel = memo(VideoPreviewPanelInner);
