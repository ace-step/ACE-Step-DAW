import { useCallback, useRef } from 'react';
import { useVoiceStore, ACCEPTED_VOICE_EXTENSIONS } from '../../store/voiceStore';
import { uploadVoiceFile } from '../../services/voiceUploadService';

/** Format seconds as M:SS. */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Voice Library section for the generation side panel.
 * Allows uploading, listing, and managing voice profiles used
 * for voice-conditioned AI generation.
 */
export function VoiceLibrarySection() {
  const profiles = useVoiceStore((s) => s.profiles);
  const isProcessing = useVoiceStore((s) => s.isProcessing);
  const error = useVoiceStore((s) => s.error);
  const removeProfile = useVoiceStore((s) => s.removeProfile);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await uploadVoiceFile(file);
      // Reset input so same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [],
  );

  const handleDelete = useCallback(
    async (profileId: string) => {
      await removeProfile(profileId);
    },
    [removeProfile],
  );

  return (
    <section className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase text-zinc-400">
          Voice Library
        </span>
        <button
          type="button"
          onClick={handleUploadClick}
          disabled={isProcessing}
          className="rounded bg-[var(--daw-surface-3)] px-2 py-0.5 text-[10px] text-zinc-300 transition-colors hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isProcessing ? 'Processing...' : 'Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_VOICE_EXTENSIONS.join(',')}
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded border border-red-500/30 bg-red-950/20 px-2 py-1 text-[10px] text-red-300">
          {error}
        </div>
      )}

      {/* Profile list */}
      {profiles.length === 0 ? (
        <div className="rounded bg-[var(--daw-surface-2)] px-3 py-4 text-center text-[10px] text-zinc-500">
          No voice profiles yet. Upload a vocal sample (WAV, MP3, FLAC) to get started.
        </div>
      ) : (
        <div className="space-y-1">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="flex items-center justify-between rounded bg-[var(--daw-surface-2)] px-2 py-1.5 group"
            >
              <div className="flex items-center gap-2 min-w-0">
                {/* Mic icon */}
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="shrink-0 text-zinc-500"
                >
                  <rect x={9} y={1} width={6} height={13} rx={3} />
                  <path d="M5 10a7 7 0 0 0 14 0" />
                  <line x1={12} y1={19} x2={12} y2={23} />
                  <line x1={8} y1={23} x2={16} y2={23} />
                </svg>
                <span className="text-[11px] text-zinc-200 truncate">
                  {profile.name}
                </span>
                <span className="text-[9px] text-zinc-500 shrink-0">
                  {formatDuration(profile.duration)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(profile.id)}
                aria-label={`Delete ${profile.name}`}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-400 p-0.5"
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
