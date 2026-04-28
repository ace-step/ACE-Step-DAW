import { useCallback, useEffect, useState } from 'react';
import { useVoiceStore } from '../../store/voiceStore';
import type { VoiceSkillLevel } from '../../types/voice';
import { Button } from '../ui/Button';

const SKILL_LEVELS: VoiceSkillLevel[] = ['beginner', 'intermediate', 'advanced', 'professional'];

interface VoiceEditDialogProps {
  voiceId: string;
  onClose: () => void;
}

export function VoiceEditDialog({ voiceId, onClose }: VoiceEditDialogProps) {
  const voice = useVoiceStore((s) => s.voices.find((v) => v.id === voiceId));
  const updateVoice = useVoiceStore((s) => s.updateVoice);

  const [name, setName] = useState(voice?.name ?? '');
  const [skillLevel, setSkillLevel] = useState<VoiceSkillLevel>(voice?.skillLevel ?? 'intermediate');
  const [language, setLanguage] = useState(voice?.language ?? '');
  const [tagsInput, setTagsInput] = useState(voice?.tags.join(', ') ?? '');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSave = useCallback(() => {
    if (!voice) return;
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    updateVoice(voiceId, {
      name: name.trim() || voice.name,
      skillLevel,
      language: language.trim() || undefined,
      tags,
    });
    onClose();
  }, [voice, voiceId, name, skillLevel, language, tagsInput, updateVoice, onClose]);

  if (!voice) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Edit Voice Profile"
      data-testid="voice-edit-dialog"
    >
      <div
        className="w-80 rounded-lg border border-daw-border bg-daw-surface p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="voice-edit-title" className="text-sm font-semibold text-zinc-100 mb-3">Edit Voice Profile</h3>

        <div className="space-y-3">
          {/* Name */}
          <div>
            <label htmlFor="voice-edit-name-input" className="text-[10px] text-zinc-400 uppercase tracking-wider">Name</label>
            <input
              id="voice-edit-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border border-daw-border bg-daw-surface-2 px-2 py-1.5 text-xs text-zinc-200 focus:border-daw-accent focus:outline-none"
              data-testid="voice-edit-name"
            />
          </div>

          {/* Skill Level */}
          <div>
            <label className="text-[10px] text-zinc-400 uppercase tracking-wider">Skill Level</label>
            <div className="mt-1 grid grid-cols-2 gap-1" role="radiogroup" aria-label="Skill level">
              {SKILL_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={skillLevel === level}
                  onClick={() => setSkillLevel(level)}
                  className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                    skillLevel === level
                      ? 'bg-daw-accent text-white'
                      : 'bg-daw-surface-2 text-zinc-400 hover:bg-daw-hover-subtle hover:text-zinc-200'
                  }`}
                  data-testid={`voice-edit-skill-${level}`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div>
            <label htmlFor="voice-edit-language-input" className="text-[10px] text-zinc-400 uppercase tracking-wider">Language</label>
            <input
              id="voice-edit-language-input"
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="e.g. English, Chinese"
              className="mt-1 w-full rounded border border-daw-border bg-daw-surface-2 px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-daw-accent focus:outline-none"
              data-testid="voice-edit-language"
            />
          </div>

          {/* Tags */}
          <div>
            <label htmlFor="voice-edit-tags-input" className="text-[10px] text-zinc-400 uppercase tracking-wider">Tags (comma-separated)</label>
            <input
              id="voice-edit-tags-input"
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="rock, energetic, female"
              className="mt-1 w-full rounded border border-daw-border bg-daw-surface-2 px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-daw-accent focus:outline-none"
              data-testid="voice-edit-tags"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="voice-edit-cancel">
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} data-testid="voice-edit-save">
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
