/**
 * VoiceLibrarySection — Collapsible voice profile library in the generation sidebar.
 *
 * Displays saved voice profiles with search, preview, selection, CRUD, and metadata editing.
 * Collapsed by default; shows voice count badge when collapsed.
 */
import { useState, useCallback, useRef } from 'react';
import { useVoiceStore } from '../../store/voiceStore';
import type { VoiceProfile } from '../../types/voiceProfile';

const SKILL_LEVELS: VoiceProfile['skillLevel'][] = ['beginner', 'intermediate', 'advanced', 'professional'];

interface VoiceLibrarySectionProps {
  disabled?: boolean;
}

export function VoiceLibrarySection({ disabled }: VoiceLibrarySectionProps) {
  const [expanded, setExpanded] = useState(false);
  const voices = useVoiceStore((s) => s.voices);
  const selectedVoiceId = useVoiceStore((s) => s.selectedVoiceId);
  const searchQuery = useVoiceStore((s) => s.searchQuery);
  const setSearchQuery = useVoiceStore((s) => s.setSearchQuery);
  const selectVoice = useVoiceStore((s) => s.selectVoice);
  const deselectVoice = useVoiceStore((s) => s.deselectVoice);
  const removeVoice = useVoiceStore((s) => s.removeVoice);
  const getFilteredVoices = useVoiceStore((s) => s.getFilteredVoices);
  const addVoice = useVoiceStore((s) => s.addVoice);
  const isCreating = useVoiceStore((s) => s.isCreating);
  const createError = useVoiceStore((s) => s.createError);

  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredVoices = getFilteredVoices();

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Compute duration from audio
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.src = url;
    await new Promise<void>((resolve) => {
      audio.addEventListener('loadedmetadata', () => resolve(), { once: true });
      audio.addEventListener('error', () => resolve(), { once: true });
    });
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    URL.revokeObjectURL(url);

    const blob = new Blob([await file.arrayBuffer()], { type: file.type });
    await addVoice({
      name: file.name.replace(/\.[^.]+$/, ''),
      audioBlob: blob,
      duration,
      skillLevel: 'intermediate',
      language: 'English',
      tags: [],
      source: 'upload',
    });
    setShowAddForm(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addVoice]);

  const handleDelete = useCallback(async (id: string) => {
    await removeVoice(id);
    setConfirmDeleteId(null);
  }, [removeVoice]);

  const handleSelect = useCallback((id: string) => {
    if (selectedVoiceId === id) {
      deselectVoice();
    } else {
      selectVoice(id);
    }
  }, [selectedVoiceId, selectVoice, deselectVoice]);

  return (
    <section className="space-y-1.5" data-testid="voice-library-section">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1 text-[11px] font-medium uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
        data-testid="voice-library-toggle"
      >
        <svg
          className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Voice Library
        {voices.length > 0 && (
          <span className="ml-1 rounded bg-indigo-500/15 px-1 py-0.5 text-[9px] font-normal normal-case text-indigo-400">
            {voices.length} {voices.length === 1 ? 'voice' : 'voices'}
          </span>
        )}
        {selectedVoiceId && !expanded && (
          <span className="ml-1 rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] font-normal normal-case text-emerald-400">
            active
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-2" data-testid="voice-library-content">
          {/* Search + Add */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search voices..."
              className="flex-1 rounded-md border border-daw-border bg-daw-surface-2 px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 focus:border-daw-accent focus:outline-none"
              data-testid="voice-library-search"
              disabled={disabled}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isCreating}
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-daw-border bg-daw-surface-2 text-zinc-400 transition-colors hover:bg-daw-hover hover:text-zinc-200 disabled:opacity-40"
              title="Upload voice sample"
              data-testid="voice-library-add"
              aria-label="Upload voice sample"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleUpload}
              className="hidden"
              data-testid="voice-library-file-input"
            />
          </div>

          {/* Error */}
          {createError && (
            <div className="rounded-md border border-red-500/40 bg-red-950/30 px-2 py-1 text-[10px] text-red-300" data-testid="voice-library-error">
              {createError}
            </div>
          )}

          {/* Voice list */}
          {filteredVoices.length === 0 ? (
            <div className="py-3 text-center text-[10px] text-zinc-600" data-testid="voice-library-empty">
              {voices.length === 0
                ? 'No voice profiles yet. Upload a vocal sample to get started.'
                : 'No voices match your search.'}
            </div>
          ) : (
            <div className="max-h-[160px] space-y-1 overflow-y-auto pr-0.5" data-testid="voice-library-list">
              {filteredVoices.map((voice) => (
                <VoiceCard
                  key={voice.id}
                  voice={voice}
                  isSelected={selectedVoiceId === voice.id}
                  confirmingDelete={confirmDeleteId === voice.id}
                  onSelect={() => handleSelect(voice.id)}
                  onRequestDelete={() => setConfirmDeleteId(voice.id)}
                  onConfirmDelete={() => handleDelete(voice.id)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                  disabled={disabled}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ── Voice Card ── */

interface VoiceCardProps {
  voice: VoiceProfile;
  isSelected: boolean;
  confirmingDelete: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  disabled?: boolean;
}

function VoiceCard({
  voice,
  isSelected,
  confirmingDelete,
  onSelect,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  disabled,
}: VoiceCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors cursor-pointer ${
        isSelected
          ? 'border-indigo-500/50 bg-indigo-500/10'
          : 'border-transparent bg-white/[0.03] hover:bg-white/[0.06]'
      }`}
      data-testid={`voice-card-${voice.id}`}
      aria-pressed={isSelected}
      aria-label={`Voice profile: ${voice.name}`}
    >
      {/* Waveform placeholder */}
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-white/[0.06] text-zinc-500">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
          <path d="M12 3v18M8 7v10M4 10v4M16 7v10M20 10v4" />
        </svg>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="truncate text-[11px] font-medium text-zinc-200">{voice.name}</span>
          {isSelected && (
            <span className="flex-shrink-0 rounded bg-indigo-500/20 px-1 py-0.5 text-[8px] text-indigo-300">selected</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[9px] text-zinc-500">{voice.language}</span>
          <span className="text-[9px] text-zinc-600">|</span>
          <span className="text-[9px] text-zinc-500">{formatDuration(voice.duration)}</span>
          {voice.tags.length > 0 && (
            <>
              <span className="text-[9px] text-zinc-600">|</span>
              <span className="truncate text-[9px] text-zinc-500">{voice.tags.slice(0, 2).join(', ')}</span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {confirmingDelete ? (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onConfirmDelete(); }}
              className="rounded px-1.5 py-0.5 text-[9px] font-medium text-red-400 hover:bg-red-500/20"
              data-testid={`voice-delete-confirm-${voice.id}`}
              aria-label="Confirm delete"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCancelDelete(); }}
              className="rounded px-1.5 py-0.5 text-[9px] text-zinc-500 hover:bg-white/10"
              aria-label="Cancel delete"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRequestDelete(); }}
            disabled={disabled}
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-600 hover:bg-red-500/15 hover:text-red-400 transition-colors disabled:opacity-30"
            title="Delete voice profile"
            data-testid={`voice-delete-${voice.id}`}
            aria-label={`Delete ${voice.name}`}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
