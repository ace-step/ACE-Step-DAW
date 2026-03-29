import { useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { downloadBlob } from '../../services/browserDownload';
import { formatDurationMSS } from '../../utils/time';
import { Button } from '../ui/Button';

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

export function VideoExportDialog() {
  const videoRecording = useUIStore((s) => s.videoRecording);
  const dismissVideoRecording = useUIStore((s) => s.dismissVideoRecording);
  const startVideoRecording = useUIStore((s) => s.startVideoRecording);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  const { status, blob, duration, mimeType } = videoRecording;
  const show = status === 'done' && blob !== null;

  // Create object URL for preview
  useEffect(() => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setDownloaded(false);
      return () => URL.revokeObjectURL(url);
    } else {
      setVideoUrl(null);
    }
  }, [blob]);

  if (!show) return null;

  const handleDownload = () => {
    if (!blob) return;
    downloadBlob(blob, buildFileName());
    setDownloaded(true);
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

        {/* Info */}
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <span>Duration: {formatDurationMSS(duration)}</span>
          {blob && <span>Size: {formatFileSize(blob.size)}</span>}
          <span>Format: {formatMimeType(mimeType)}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={handleRecordNew}>
            Record New
          </Button>
          <Button variant="primary" size="sm" onClick={handleDownload}>
            {downloaded ? 'Downloaded' : 'Download'}
          </Button>
        </div>
      </div>
    </div>
  );
}
