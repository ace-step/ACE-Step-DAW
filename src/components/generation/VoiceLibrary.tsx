/**
 * Voice Library — browse, record, upload, and select voice profiles (#1087)
 *
 * Renders inside the generation side panel as a collapsible section.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useVoiceStore } from '../../store/voiceStore';
import { loadVoiceAudio } from '../../services/voiceProfileService';
import { ACCEPTED_VOICE_EXTENSIONS, MAX_VOICE_FILE_SIZE, MIN_VOICE_DURATION } from '../../types/voice';
import type { VoiceProfile } from '../../types/voice';

// ── Inline waveform mini-viz ──

function WaveformMini({ peaks }: { peaks: number[] }) {
  const count = peaks.length || 1;
  return (
    <div
      className="flex items-end gap-px h-5"
      aria-hidden="true"
      data-testid="voice-waveform-mini"
    >
      {peaks.map((p, i) => (
        <div
          key={i}
          className="w-[2px] rounded-sm bg-indigo-400/60"
          style={{ height: `${Math.max(2, p * 100)}%` }}
        />
      ))}
    </div>
  );
}

// ── Profile card ──

function VoiceProfileCard({
  profile,
  selected,
  playing,
  onSelect,
  onDelete,
  onRename,
  onTogglePreview,
}: {
  profile: VoiceProfile;
  selected: boolean;
  playing: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onTogglePreview: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(profile.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== profile.name) {
      onRename(trimmed);
    } else {
      setEditName(profile.name);
    }
    setEditing(false);
  };

  const durationLabel = profile.duration >= 60
    ? `${Math.floor(profile.duration / 60)}m ${Math.round(profile.duration % 60)}s`
    : `${Math.round(profile.duration)}s`;

  return (
    <div
      role="option"
      aria-selected={selected}
      className={`group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors ${
        selected
          ? 'bg-indigo-600/20 border border-indigo-500/40'
          : 'hover:bg-white/[0.04] border border-transparent'
      }`}
      onClick={onSelect}
      data-testid={`voice-profile-card-${profile.id}`}
    >
      {/* Play/Preview button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onTogglePreview(); }}
        className={`shrink-0 flex items-center justify-center w-6 h-6 rounded-full transition-colors ${
          playing
            ? 'bg-indigo-500/30 text-indigo-300'
            : 'bg-white/[0.06] text-zinc-400 hover:bg-white/[0.12] hover:text-zinc-200'
        }`}
        aria-label={playing ? `Stop preview ${profile.name}` : `Preview ${profile.name}`}
        data-testid={`voice-preview-${profile.id}`}
      >
        {playing ? (
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="3" width="4" height="10" rx="1" />
            <rect x="9" y="3" width="4" height="10" rx="1" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 2l10 6-10 6V2z" />
          </svg>
        )}
      </button>

      {/* Waveform */}
      <div className="shrink-0 w-10 overflow-hidden">
        <WaveformMini peaks={profile.waveformPeaks.slice(0, 16)} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setEditName(profile.name); setEditing(false); }
            }}
            className="w-full bg-transparent border-b border-indigo-500 text-[11px] text-zinc-100 outline-none"
            maxLength={100}
            data-testid="voice-rename-input"
          />
        ) : (
          <p
            className="text-[11px] text-zinc-200 truncate"
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
            title="Double-click to rename"
          >
            {profile.name}
          </p>
        )}
        <p className="text-[9px] text-zinc-500">
          {profile.source === 'recording' ? 'Recorded' : 'Uploaded'} &middot; {durationLabel}
        </p>
      </div>

      {/* Delete button with confirmation */}
      {confirmDelete ? (
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onDelete()}
            className="text-[9px] text-red-400 hover:text-red-300 px-1"
            data-testid={`voice-confirm-delete-${profile.id}`}
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="text-[9px] text-zinc-500 hover:text-zinc-300 px-1"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-400 p-0.5"
          aria-label={`Delete ${profile.name}`}
          data-testid={`voice-delete-${profile.id}`}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Recording overlay ──

function RecordingIndicator({ elapsed }: { elapsed: number }) {
  const label = `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`;
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded bg-red-950/30 border border-red-700/40" data-testid="voice-recording-indicator">
      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      <span className="text-[11px] text-red-300 font-mono">{label}</span>
      <span className="text-[9px] text-zinc-500">Recording...</span>
    </div>
  );
}

// ── Main component ──

export function VoiceLibrary({ disabled }: { disabled?: boolean }) {
  const profiles = useVoiceStore((s) => s.profiles);
  const selectedProfileId = useVoiceStore((s) => s.selectedProfileId);
  const recording = useVoiceStore((s) => s.recording);
  const loading = useVoiceStore((s) => s.loading);
  const error = useVoiceStore((s) => s.error);
  const {
    loadProfiles,
    addProfile,
    removeProfile,
    renameProfile,
    selectProfile,
    setRecording,
    clearError,
  } = useVoiceStore.getState();

  const [expanded, setExpanded] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef<number>(0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Load profiles on first expand
  useEffect(() => {
    if (expanded && profiles.length === 0 && !loading) {
      loadProfiles();
    }
  }, [expanded, profiles.length, loading, loadProfiles]);

  // ── Recording ──

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        setRecording(false);

        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        const elapsed = (Date.now() - recordingStartRef.current) / 1000;

        if (elapsed < MIN_VOICE_DURATION) {
          // Too short — discard
          return;
        }

        try {
          await addProfile(
            `Recording ${new Date().toLocaleTimeString()}`,
            'recording',
            blob,
            elapsed,
          );
        } catch {
          // Error handled by store
        }
      };

      mediaRecorderRef.current = recorder;
      recordingStartRef.current = Date.now();
      setRecordingElapsed(0);
      setRecording(true);
      recorder.start(250);

      recordingTimerRef.current = setInterval(() => {
        setRecordingElapsed((Date.now() - recordingStartRef.current) / 1000);
      }, 200);
    } catch {
      // Microphone permission denied or unavailable
    }
  }, [addProfile, setRecording]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  // ── File upload ──

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (file.size > MAX_VOICE_FILE_SIZE) return;
      if (!file.type.startsWith('audio/')) return;

      // Compute duration
      let durationSec = 30; // fallback
      try {
        const ctx = new OfflineAudioContext(1, 1, 44100);
        const buf = await file.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(buf);
        durationSec = audioBuf.duration;
      } catch {
        // Use fallback
      }

      const name = file.name.replace(/\.[^.]+$/, '');
      try {
        await addProfile(name, 'upload', file, durationSec);
      } catch {
        // Error handled by store
      }
    },
    [addProfile],
  );

  // ── Drop handling ──

  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      const audio = files.find(
        (f) => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|webm)$/i.test(f.name),
      );
      if (audio) handleFileUpload(audio);
    },
    [handleFileUpload],
  );

  // ── Audio preview ──

  const togglePreview = useCallback(async (profileId: string) => {
    // Stop current preview
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (previewingId === profileId) {
      setPreviewingId(null);
      return;
    }

    try {
      const blob = await loadVoiceAudio(profileId);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        setPreviewingId(null);
        URL.revokeObjectURL(url);
      };
      previewAudioRef.current = audio;
      setPreviewingId(profileId);
      await audio.play();
    } catch {
      setPreviewingId(null);
    }
  }, [previewingId]);

  // Cleanup preview on unmount
  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  // ── Search filter ──

  const filteredProfiles = searchQuery.trim()
    ? profiles.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : profiles;

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? null;

  return (
    <section className="space-y-1.5" data-testid="voice-library">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
        aria-expanded={expanded}
        data-testid="voice-library-toggle"
      >
        <span className="text-[11px] font-medium uppercase text-zinc-400 flex items-center gap-1.5">
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
          >
            <path d="M6 3l5 5-5 5V3z" />
          </svg>
          Voice Reference
          {selectedProfile && (
            <span className="text-[9px] text-indigo-400 font-normal normal-case">
              &middot; {selectedProfile.name}
            </span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="space-y-2">
          {/* Error banner */}
          {error && (
            <div className="flex items-center justify-between rounded bg-red-950/30 px-2 py-1 text-[10px] text-red-300" data-testid="voice-error">
              <span>{error}</span>
              <button type="button" onClick={clearError} className="text-red-500 hover:text-red-300 ml-2">&times;</button>
            </div>
          )}

          {/* Actions: Record + Upload */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={recording ? stopRecording : startRecording}
              disabled={disabled}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[10px] font-medium transition-colors ${
                recording
                  ? 'bg-red-600/20 text-red-300 border border-red-600/40 hover:bg-red-600/30'
                  : 'bg-white/[0.04] text-zinc-300 border border-transparent hover:bg-white/[0.08]'
              }`}
              data-testid="voice-record-btn"
            >
              {recording ? (
                <>
                  <div className="w-2 h-2 rounded-sm bg-red-400" />
                  Stop
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  Record
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || recording}
              className="flex-1 flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[10px] font-medium bg-white/[0.04] text-zinc-300 border border-transparent hover:bg-white/[0.08] transition-colors"
              data-testid="voice-upload-btn"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M8 10V3M5 5l3-3 3 3M3 13h10" />
              </svg>
              Upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_VOICE_EXTENSIONS}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = '';
              }}
              disabled={disabled}
              data-testid="voice-file-input"
            />
          </div>

          {/* Recording indicator */}
          {recording && <RecordingIndicator elapsed={recordingElapsed} />}

          {/* Search (only show when there are profiles) */}
          {profiles.length > 2 && (
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search voices..."
              className="w-full rounded border border-[#3a3a3a] bg-[#1a1a1e] px-2 py-1 text-[10px] text-zinc-300 placeholder-zinc-600 outline-none focus:border-indigo-500/50"
              data-testid="voice-search-input"
            />
          )}

          {/* Profile list or drop zone */}
          {profiles.length === 0 && !loading ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              className={`rounded border border-dashed px-3 py-4 text-center transition-colors ${
                isDragOver
                  ? 'border-indigo-500 bg-indigo-950/20 text-indigo-300'
                  : 'border-zinc-700 text-zinc-600'
              }`}
              data-testid="voice-drop-zone"
            >
              <p className="text-[10px]">No voice profiles yet</p>
              <p className="text-[9px] text-zinc-700 mt-0.5">
                Record or upload a vocal sample (min {MIN_VOICE_DURATION}s)
              </p>
            </div>
          ) : (
            <div
              role="listbox"
              aria-label="Voice profiles"
              className="space-y-0.5 max-h-40 overflow-y-auto"
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              data-testid="voice-profile-list"
            >
              {loading && (
                <p className="text-[10px] text-zinc-500 px-2 py-1">Loading...</p>
              )}
              {filteredProfiles.map((p) => (
                <VoiceProfileCard
                  key={p.id}
                  profile={p}
                  selected={p.id === selectedProfileId}
                  playing={p.id === previewingId}
                  onSelect={() => selectProfile(p.id === selectedProfileId ? null : p.id)}
                  onDelete={() => removeProfile(p.id)}
                  onRename={(name) => renameProfile(p.id, name)}
                  onTogglePreview={() => togglePreview(p.id)}
                />
              ))}
            </div>
          )}

          {/* Selected voice info */}
          {selectedProfile && (
            <div className="rounded bg-indigo-950/15 border border-indigo-500/20 px-2 py-1.5" data-testid="voice-selected-info">
              <p className="text-[9px] text-indigo-300">
                Voice reference: <span className="text-zinc-200">{selectedProfile.name}</span> will be used for generation
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
