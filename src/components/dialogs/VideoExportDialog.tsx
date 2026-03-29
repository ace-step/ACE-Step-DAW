import { useEffect, useRef, useState, useCallback } from 'react';
import { useUIStore } from '../../store/uiStore';
import { downloadBlob } from '../../services/browserDownload';
import { formatDurationMSS } from '../../utils/time';
import { Button } from '../ui/Button';
import { toastError } from '../../hooks/useToast';

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildFileName(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  return `ACE-Step-DAW_Recording_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.webm`;
}

function formatMimeType(mimeType: string | null): string {
  if (!mimeType) return 'WebM';
  if (mimeType.includes('vp9')) return 'WebM (VP9 + Opus)';
  if (mimeType.includes('vp8')) return 'WebM (VP8 + Opus)';
  if (mimeType.includes('h264')) return 'WebM (H.264 + Opus)';
  return 'WebM';
}

// ── Trim Bar ────────────────────────────────────────────────

function TrimBar({
  duration,
  trimStart,
  trimEnd,
  onTrimChange,
}: {
  duration: number;
  trimStart: number;
  trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'start' | 'end' | null>(null);

  const posToTime = useCallback(
    (clientX: number) => {
      if (!barRef.current) return 0;
      const rect = barRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * duration);
    },
    [duration],
  );

  useEffect(() => {
    if (!dragging.current) return;
    const onMove = (e: MouseEvent) => {
      const t = posToTime(e.clientX);
      if (dragging.current === 'start') {
        onTrimChange(Math.min(t, trimEnd - 1), trimEnd);
      } else {
        onTrimChange(trimStart, Math.max(t, trimStart + 1));
      }
    };
    const onUp = () => { dragging.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  });

  if (duration <= 0) return null;

  const startPct = (trimStart / duration) * 100;
  const endPct = (trimEnd / duration) * 100;
  const isTrimmed = trimStart > 0 || trimEnd < duration;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
        <span>Trim</span>
        {isTrimmed && (
          <button
            className="text-blue-400 hover:text-blue-300"
            onClick={() => onTrimChange(0, duration)}
          >
            Reset
          </button>
        )}
      </div>
      <div ref={barRef} className="relative h-5 rounded bg-white/5 cursor-pointer select-none">
        {/* Greyed-out left region */}
        {trimStart > 0 && (
          <div
            className="absolute inset-y-0 left-0 rounded-l bg-black/40"
            style={{ width: `${startPct}%` }}
          />
        )}
        {/* Greyed-out right region */}
        {trimEnd < duration && (
          <div
            className="absolute inset-y-0 right-0 rounded-r bg-black/40"
            style={{ width: `${100 - endPct}%` }}
          />
        )}
        {/* Active region */}
        <div
          className="absolute inset-y-0 border-y border-blue-500/40"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />
        {/* Start handle */}
        <div
          className="absolute top-0 bottom-0 w-1.5 cursor-col-resize rounded-l bg-blue-500 hover:bg-blue-400"
          style={{ left: `${startPct}%` }}
          onMouseDown={(e) => { e.preventDefault(); dragging.current = 'start'; }}
        />
        {/* End handle */}
        <div
          className="absolute top-0 bottom-0 w-1.5 cursor-col-resize rounded-r bg-blue-500 hover:bg-blue-400"
          style={{ left: `calc(${endPct}% - 6px)` }}
          onMouseDown={(e) => { e.preventDefault(); dragging.current = 'end'; }}
        />
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-zinc-500">
        <span>{formatDurationMSS(trimStart)}</span>
        <span>{formatDurationMSS(trimEnd)}</span>
      </div>
    </div>
  );
}

// ── Main Dialog ─────────────────────────────────────────────

export function VideoExportDialog() {
  const videoRecording = useUIStore((s) => s.videoRecording);
  const dismissVideoRecording = useUIStore((s) => s.dismissVideoRecording);
  const startVideoRecording = useUIStore((s) => s.startVideoRecording);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [exportFormat, setExportFormat] = useState<'webm' | 'mp4'>('webm');
  const [converting, setConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState(0);

  const { status, blob, duration, mimeType } = videoRecording;
  const show = status === 'done' && blob !== null;

  // Create object URL for preview
  useEffect(() => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setDownloaded(false);
      setTrimStart(0);
      setTrimEnd(duration);
      return () => URL.revokeObjectURL(url);
    } else {
      setVideoUrl(null);
    }
  }, [blob, duration]);

  // Constrain video playback to trim region
  useEffect(() => {
    const video = videoRef.current;
    if (!video || trimEnd <= 0) return;
    const onTimeUpdate = () => {
      if (video.currentTime < trimStart) video.currentTime = trimStart;
      if (video.currentTime >= trimEnd) {
        video.pause();
        video.currentTime = trimStart;
      }
    };
    video.addEventListener('timeupdate', onTimeUpdate);
    return () => video.removeEventListener('timeupdate', onTimeUpdate);
  }, [trimStart, trimEnd]);

  if (!show) return null;

  const isTrimmed = trimStart > 0 || trimEnd < duration;
  const trimmedDuration = trimEnd - trimStart;

  const handleTrimChange = (start: number, end: number) => {
    setTrimStart(start);
    setTrimEnd(end);
    if (videoRef.current && videoRef.current.currentTime < start) {
      videoRef.current.currentTime = start;
    }
  };

  const needsConversion = exportFormat === 'mp4' || isTrimmed;

  const handleDownload = async () => {
    if (!blob) return;

    if (!needsConversion) {
      // Direct download — no conversion needed
      downloadBlob(blob, buildFileName().replace('.webm', '.webm'));
      setDownloaded(true);
      return;
    }

    // Use ffmpeg.wasm for conversion/trim
    setConverting(true);
    setConvertProgress(0);
    try {
      const { convertVideo } = await import('../../services/videoConverter');
      const result = await convertVideo(blob, {
        format: exportFormat,
        trimStart: isTrimmed ? trimStart : undefined,
        trimEnd: isTrimmed ? trimEnd : undefined,
        onProgress: setConvertProgress,
      });
      const ext = exportFormat === 'mp4' ? '.mp4' : '.webm';
      downloadBlob(result, buildFileName().replace('.webm', ext));
      setDownloaded(true);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Video conversion failed.');
    } finally {
      setConverting(false);
    }
  };

  const handleRecordNew = () => {
    dismissVideoRecording();
    void startVideoRecording();
  };

  const handleClose = () => {
    if (!downloaded && blob && blob.size > 0) {
      const confirmed = window.confirm('You haven\'t downloaded the recording yet. Discard it?');
      if (!confirmed) return;
    }
    dismissVideoRecording();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="relative flex w-full max-w-2xl flex-col gap-4 rounded-2xl border border-white/10 bg-[#1a1c20] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-100">Video Recording</h2>
          <button
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>

        {/* Video Preview */}
        {videoUrl && (
          <div className="overflow-hidden rounded-lg border border-white/5 bg-black">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              className="w-full"
              style={{ maxHeight: '400px' }}
            />
          </div>
        )}

        {/* Trim Bar */}
        {duration > 1 && (
          <TrimBar
            duration={duration}
            trimStart={trimStart}
            trimEnd={trimEnd}
            onTrimChange={handleTrimChange}
          />
        )}

        {/* Info + Format */}
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <span>
            Duration: {formatDurationMSS(trimmedDuration)}
            {isTrimmed && <span className="ml-1 text-blue-400">(trimmed)</span>}
          </span>
          {blob && <span>Size: {formatFileSize(blob.size)}</span>}
          <label className="flex items-center gap-1.5">
            <span>Format:</span>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'webm' | 'mp4')}
              className="rounded bg-white/8 px-1.5 py-0.5 text-[11px] text-zinc-200 outline-none"
              disabled={converting}
            >
              <option value="webm">{formatMimeType(mimeType)}</option>
              <option value="mp4">MP4 (H.264 + AAC)</option>
            </select>
          </label>
        </div>

        {/* Conversion progress */}
        {converting && (
          <div className="flex flex-col gap-1">
            <div className="text-[11px] text-zinc-400">
              {convertProgress < 0.05 ? 'Loading encoder...' : `Converting... ${Math.round(convertProgress * 100)}%`}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${Math.max(2, convertProgress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={handleRecordNew} disabled={converting}>
            Record New
          </Button>
          <Button variant="primary" size="sm" onClick={() => void handleDownload()} disabled={converting}>
            {converting ? 'Converting...' : downloaded ? 'Downloaded' : needsConversion ? 'Convert & Download' : 'Download'}
          </Button>
        </div>
      </div>
    </div>
  );
}
