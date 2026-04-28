import { useCallback, useEffect, useRef, useState } from 'react';
import { useGenerationStore } from '../../store/generationStore';
import { Button } from '../ui/Button';
import { toastSuccess } from '../../hooks/useToast';

const COMMON_TAGS = [
  'rock', 'pop', 'jazz', 'classical', 'electronic', 'hip-hop',
  'ambient', 'folk', 'r&b', 'metal', 'country', 'blues',
  'vocals', 'instrumental', 'bass', 'drums', 'guitar', 'piano',
  'synth', 'strings', 'upbeat', 'chill', 'dark', 'energetic',
];

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

interface SavePromptDialogProps {
  open: boolean;
  onClose: () => void;
  initialPrompt?: string;
  initialMetadata?: {
    bpm?: number;
    keyScale?: string;
    styleTags?: string[];
    lengthSeconds?: number;
  };
}

export function SavePromptDialog({
  open,
  onClose,
  initialPrompt = '',
  initialMetadata = {},
}: SavePromptDialogProps) {
  const saveToPromptLibrary = useGenerationStore((s) => s.saveToPromptLibrary);
  const existingCategories = useGenerationStore((s) => s.getPromptLibraryCategories);

  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState(initialPrompt);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(normalizeTags(initialMetadata.styleTags ?? []));
  const [category, setCategory] = useState('');
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setPrompt(initialPrompt);
      setTitle('');
      setTagInput('');
      setTags(normalizeTags(initialMetadata.styleTags ?? []));
      setCategory('');
    }
    wasOpenRef.current = open;
  }, [open, initialPrompt, initialMetadata.styleTags]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleAddTag = useCallback((tag: string) => {
    const normalized = tag.trim().toLowerCase();
    if (normalized) {
      setTags((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    }
    setTagInput('');
  }, []);

  const handleRemoveTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        handleAddTag(tagInput);
      }
    },
    [tagInput, handleAddTag],
  );

  const handleSave = useCallback(() => {
    if (!prompt.trim()) return;

    saveToPromptLibrary({
      prompt: prompt.trim(),
      title: title.trim(),
      tags,
      category: category.trim(),
      metadata: {
        bpm: initialMetadata.bpm,
        keyScale: initialMetadata.keyScale,
        styleTags: tags,
        lengthSeconds: initialMetadata.lengthSeconds,
      },
    });

    toastSuccess('Prompt saved to library');
    onClose();
  }, [prompt, title, tags, category, initialMetadata, saveToPromptLibrary, onClose]);

  if (!open) return null;

  const allCategories = existingCategories();
  const suggestedTags = COMMON_TAGS.filter((t) => !tags.includes(t));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Save prompt to library"
        className="w-full max-w-md rounded-xl border border-white/10 bg-[#1a1a1a] p-5 shadow-2xl"
      >
        <h2 className="mb-4 text-sm font-semibold text-zinc-100">Save to Prompt Library</h2>

        <div className="space-y-3">
          {/* Title */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase text-zinc-400">
              Title <span className="text-zinc-500">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Auto-generated from prompt if empty"
              className="w-full rounded-md border border-[#3a3a3a] bg-[#20242c] px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-indigo-500"
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase text-zinc-400">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-md border border-[#3a3a3a] bg-[#20242c] px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-indigo-500"
              placeholder="Describe the music..."
            />
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase text-zinc-400">
              Tags
            </label>
            <div className="flex flex-wrap gap-1 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] text-indigo-300"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="text-indigo-400 hover:text-white"
                    aria-label={`Remove tag ${tag}`}
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder="Type and press Enter to add tags"
              className="w-full rounded-md border border-[#3a3a3a] bg-[#20242c] px-3 py-1.5 text-xs text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-indigo-500"
            />
            {suggestedTags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {suggestedTags.slice(0, 12).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleAddTag(tag)}
                    className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 transition-colors hover:border-indigo-500/50 hover:text-indigo-300"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase text-zinc-400">
              Category <span className="text-zinc-500">(optional)</span>
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. bass, drums, vocals, ambient"
              list="prompt-library-categories"
              className="w-full rounded-md border border-[#3a3a3a] bg-[#20242c] px-3 py-1.5 text-xs text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-indigo-500"
            />
            {allCategories.length > 0 && (
              <datalist id="prompt-library-categories">
                {allCategories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            )}
          </div>

          {/* Metadata summary */}
          {(initialMetadata.bpm || initialMetadata.keyScale) && (
            <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-[11px] text-zinc-400">
              <span className="font-medium text-zinc-300">Auto-captured: </span>
              {initialMetadata.bpm && <span>BPM {initialMetadata.bpm}</span>}
              {initialMetadata.bpm && initialMetadata.keyScale && <span> | </span>}
              {initialMetadata.keyScale && <span>Key {initialMetadata.keyScale}</span>}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={!prompt.trim()}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
