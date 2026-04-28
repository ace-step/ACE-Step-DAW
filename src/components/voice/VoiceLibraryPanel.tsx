import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { AddVoiceInput } from '../../store/voiceStore';
import { useVoiceStore } from '../../store/voiceStore';
import { useVoiceVerificationStore } from '../../store/voiceVerificationStore';
import { useUIStore } from '../../store/uiStore';
import { VoiceCard } from './VoiceCard';
import { VoiceEditDialog } from './VoiceEditDialog';
import { Button } from '../ui/Button';
import { VoiceRecordButton } from './VoiceRecordButton';
import {
  VOICE_ACCEPTED_EXTENSIONS,
  processVoiceAudioFile,
  isVoiceUploadError,
} from '../../services/voiceUploadService';
import { toastError, toastInfo, toastSuccess } from '../../hooks/useToast';

export function VoiceLibraryPanel() {
  const voices = useVoiceStore((s) => s.voices);
  const searchQuery = useVoiceStore((s) => s.searchQuery);
  const setSearchQuery = useVoiceStore((s) => s.setSearchQuery);
  const filterTag = useVoiceStore((s) => s.filterTag);
  const setFilterTag = useVoiceStore((s) => s.setFilterTag);
  const selectedVoiceId = useVoiceStore((s) => s.selectedVoiceId);
  const selectVoice = useVoiceStore((s) => s.selectVoice);
  const deselectVoice = useVoiceStore((s) => s.deselectVoice);
  const deleteVoice = useVoiceStore((s) => s.deleteVoice);
  const getFilteredVoices = useVoiceStore((s) => s.getFilteredVoices);
  const getAllTags = useVoiceStore((s) => s.getAllTags);
  const loadAudioBlob = useVoiceStore((s) => s.loadAudioBlob);
  const beginVerification = useVoiceVerificationStore((s) => s.beginVerification);
  const setShowVoiceVerificationModal = useUIStore((s) => s.setShowVoiceVerificationModal);

  const [editingVoiceId, setEditingVoiceId] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up audio playback and object URLs on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  const filteredVoices = getFilteredVoices();
  const allTags = getAllTags();

  // ─── Upload ───────────────────────────────────────────────
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const beginVoiceCreationVerification = useCallback(
    (input: AddVoiceInput, audioBlob: Blob) => {
      beginVerification(input, audioBlob);
      setShowVoiceVerificationModal(true);
      toastInfo('Verify voice identity to add this voice to the library');
    },
    [beginVerification, setShowVoiceVerificationModal],
  );

  const handleFileSelect = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsUploading(true);
      let ctx: AudioContext | null = null;
      try {
        ctx = new AudioContext();
        const result = await processVoiceAudioFile(file, ctx);

        if (isVoiceUploadError(result)) {
          toastError(result.message);
          return;
        }

        beginVoiceCreationVerification(
          {
            name: result.name,
            durationSeconds: result.durationSeconds,
            skillLevel: 'intermediate',
            source: result.source,
            tags: [],
            waveformPeaks: result.waveformPeaks,
          },
          result.blob,
        );
      } catch {
        toastError('Failed to process voice file');
      } finally {
        ctx?.close();
        setIsUploading(false);
        // Reset the input so the same file can be re-selected
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [beginVoiceCreationVerification],
  );

  // ─── Preview playback ────────────────────────────────────
  const handlePlay = useCallback(
    async (voiceId: string) => {
      // Stop current playback and revoke old URL
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }

      const blob = await loadAudioBlob(voiceId);
      if (!blob) {
        toastError('Could not load voice audio');
        return;
      }

      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audio.onended = () => {
        setPlayingVoiceId(null);
        URL.revokeObjectURL(url);
        audioUrlRef.current = null;
      };
      audio.onerror = () => {
        setPlayingVoiceId(null);
        URL.revokeObjectURL(url);
        audioUrlRef.current = null;
      };
      audioRef.current = audio;
      setPlayingVoiceId(voiceId);
      try {
        await audio.play();
      } catch {
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
        if (audioUrlRef.current === url) {
          URL.revokeObjectURL(url);
          audioUrlRef.current = null;
        }
        setPlayingVoiceId(null);
        toastError('Could not play voice audio');
      }
    },
    [loadAudioBlob],
  );

  const handleStop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setPlayingVoiceId(null);
  }, []);

  // ─── Delete with confirmation ────────────────────────────
  const handleDelete = useCallback(
    async (voiceId: string) => {
      const voice = voices.find((v) => v.id === voiceId);
      if (!voice) return;
      const confirmed = window.confirm(`Delete voice "${voice.name}"? This cannot be undone.`);
      if (!confirmed) return;

      if (playingVoiceId === voiceId) handleStop();
      await deleteVoice(voiceId);
      toastSuccess(`Voice "${voice.name}" deleted`);
    },
    [voices, deleteVoice, playingVoiceId, handleStop],
  );

  // ─── Select / Deselect ───────────────────────────────────
  const handleSelect = useCallback(
    (voiceId: string) => {
      if (selectedVoiceId === voiceId) {
        deselectVoice();
      } else {
        selectVoice(voiceId);
      }
    },
    [selectedVoiceId, selectVoice, deselectVoice],
  );

  return (
    <div className="flex flex-col" data-testid="voice-library-panel">
      {/* Header */}
      <div className="flex items-center h-7 px-3 border-b border-daw-border bg-daw-surface-2 shrink-0">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="mr-1.5 text-zinc-500 hover:text-zinc-300"
          aria-label={collapsed ? 'Expand voice library' : 'Collapse voice library'}
          data-testid="voice-library-toggle"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="currentColor"
            className={`transition-transform ${collapsed ? '' : 'rotate-90'}`}
          >
            <path d="M3 1l5 4-5 4V1z" />
          </svg>
        </button>
        <span className="text-[10px] uppercase tracking-wider font-medium text-zinc-400 flex-1">
          Voice Library
        </span>
        <span className="text-[9px] text-zinc-600 mr-2">{voices.length}</span>
        <VoiceRecordButton onCapturedVoice={beginVoiceCreationVerification} />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleUploadClick}
          loading={isUploading}
          className="!px-1.5 !py-0.5 !text-[9px]"
          data-testid="voice-upload-btn"
        >
          + Add
        </Button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={VOICE_ACCEPTED_EXTENSIONS}
        onChange={handleFileSelect}
        className="hidden"
        data-testid="voice-file-input"
      />

      {/* Collapsible body */}
      {!collapsed && (
        <div className="flex flex-col px-2 py-2 gap-2 max-h-64 overflow-y-auto">
          {/* Search input */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search voices..."
            className="w-full rounded border border-daw-border bg-daw-bg px-2 py-1 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:border-daw-accent focus:outline-none"
            data-testid="voice-search-input"
          />

          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setFilterTag(null)}
                className={`rounded px-1.5 py-0.5 text-[9px] transition-colors ${
                  filterTag === null
                    ? 'bg-daw-accent text-white'
                    : 'bg-daw-surface-2 text-zinc-500 hover:text-zinc-300'
                }`}
                data-testid="voice-tag-all"
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                  className={`rounded px-1.5 py-0.5 text-[9px] transition-colors ${
                    filterTag === tag
                      ? 'bg-daw-accent text-white'
                      : 'bg-daw-surface-2 text-zinc-500 hover:text-zinc-300'
                  }`}
                  data-testid={`voice-tag-${tag}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* Voice list */}
          {filteredVoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2" data-testid="voice-empty-state">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-600">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="12" y1="19" x2="12" y2="23" strokeLinecap="round" />
                <line x1="8" y1="23" x2="16" y2="23" strokeLinecap="round" />
              </svg>
              <span className="text-[10px] text-zinc-500">
                {voices.length === 0 ? 'No voices yet. Upload a vocal sample to get started.' : 'No voices match your search.'}
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5" data-testid="voice-grid">
              {filteredVoices.map((voice) => (
                <VoiceCard
                  key={voice.id}
                  voice={voice}
                  isSelected={selectedVoiceId === voice.id}
                  isPlaying={playingVoiceId === voice.id}
                  onSelect={handleSelect}
                  onPlay={handlePlay}
                  onStop={handleStop}
                  onEdit={setEditingVoiceId}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit dialog */}
      {editingVoiceId && (
        <VoiceEditDialog
          voiceId={editingVoiceId}
          onClose={() => setEditingVoiceId(null)}
        />
      )}
    </div>
  );
}
