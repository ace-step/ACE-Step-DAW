import { useState } from 'react';
import {
  SOUND_DESIGN_TEMPLATES,
  getAllTemplateGenres,
  type SoundDesignTemplate,
} from '../../data/templates/soundDesignTemplates';

interface Props {
  onSelect: (template: SoundDesignTemplate) => void;
}

export function SoundDesignTemplateBrowser({ onSelect }: Props) {
  const genres = getAllTemplateGenres();
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

  const filtered = selectedGenre
    ? SOUND_DESIGN_TEMPLATES.filter((t) => t.genre === selectedGenre)
    : [...SOUND_DESIGN_TEMPLATES];

  return (
    <div>
      {/* Genre filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <button
          type="button"
          data-testid="genre-filter-btn"
          aria-pressed={selectedGenre === null}
          onClick={() => setSelectedGenre(null)}
          className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
            selectedGenre === null
              ? 'bg-daw-accent/20 border-daw-accent text-daw-accent'
              : 'border-daw-border/50 text-zinc-400 hover:text-zinc-300 hover:border-daw-border'
          }`}
        >
          All
        </button>
        {genres.map((genre) => (
          <button
            key={genre}
            type="button"
            data-testid="genre-filter-btn"
            aria-pressed={selectedGenre === genre}
            onClick={() => setSelectedGenre(genre)}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
              selectedGenre === genre
                ? 'bg-daw-accent/20 border-daw-accent text-daw-accent'
                : 'border-daw-border/50 text-zinc-400 hover:text-zinc-300 hover:border-daw-border'
            }`}
          >
            {genre}
          </button>
        ))}
      </div>

      {/* Template cards grid */}
      <div className="grid grid-cols-3 gap-2">
        {filtered.map((template) => (
          <button
            key={template.id}
            type="button"
            data-testid="sound-design-template-card"
            onClick={() => onSelect(template)}
            className="text-left rounded-lg border border-daw-border/50 hover:border-daw-accent/50 hover:bg-daw-surface-2 transition-colors p-2"
          >
            {/* Track color preview bar */}
            <div className="flex gap-0.5 mb-1.5 h-1.5 rounded overflow-hidden">
              {template.tracks.map((track, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{ backgroundColor: track.color }}
                />
              ))}
            </div>

            <div className="flex items-center justify-between gap-1 mb-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
                {template.genre}
              </span>
              <span className="text-[10px] text-zinc-500">
                {template.tracks.length} tracks
              </span>
            </div>

            <p className="text-xs text-zinc-200 font-medium">{template.name}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-2">
              {template.description}
            </p>

            {/* Track role pills */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {template.tracks.slice(0, 3).map((track, i) => (
                <span
                  key={i}
                  className="text-[9px] rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-zinc-400"
                >
                  {track.role}
                </span>
              ))}
              {template.tracks.length > 3 && (
                <span className="text-[9px] text-zinc-500">
                  +{template.tracks.length - 3}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
