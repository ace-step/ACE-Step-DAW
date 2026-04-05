import { useState, useCallback, useRef } from 'react';
import {
  createTimbreReference,
  validateTimbreStrength,
  type TimbreReference,
} from '../../services/timbreTransfer';

interface TimbreReferenceSelectorProps {
  timbreRef: TimbreReference | null;
  onTimbreRefChange: (ref: TimbreReference | null) => void;
  disabled?: boolean;
}

export function TimbreReferenceSelector({
  timbreRef,
  onTimbreRefChange,
  disabled,
}: TimbreReferenceSelectorProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(
    async (file: File) => {
      // Persist audio in IndexedDB so references survive page reload.
      // Falls back to blob URL if storage fails.
      let audioKey: string;
      try {
        const { set } = await import('idb-keyval');
        audioKey = `timbre:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await set(audioKey, file);
      } catch {
        audioKey = URL.createObjectURL(file);
      }
      const ref = createTimbreReference({
        sourceType: 'upload',
        audioKey,
        name: file.name.replace(/\.[^.]+$/, ''),
      });
      onTimbreRefChange(ref);
    },
    [onTimbreRefChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      // Check for clip data from timeline drag
      const clipData = e.dataTransfer.getData('application/x-ace-clip');
      if (clipData) {
        try {
          const parsed = JSON.parse(clipData);
          if (parsed.audioKey) {
            const ref = createTimbreReference({
              sourceType: 'clip',
              audioKey: parsed.audioKey,
              name: parsed.name || 'Timeline Clip',
            });
            onTimbreRefChange(ref);
            return;
          }
        } catch { /* ignore parse errors */ }
      }

      // Check for file drops
      const files = Array.from(e.dataTransfer.files);
      const audioFile = files.find((f) =>
        f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(f.name),
      );
      if (audioFile) {
        handleFileUpload(audioFile);
      }
    },
    [handleFileUpload, onTimbreRefChange],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleStrengthChange = useCallback(
    (value: number) => {
      if (!timbreRef) return;
      onTimbreRefChange({
        ...timbreRef,
        strength: validateTimbreStrength(value),
      });
    },
    [timbreRef, onTimbreRefChange],
  );

  const handleClear = useCallback(() => {
    onTimbreRefChange(null);
  }, [onTimbreRefChange]);

  return (
    <section className="space-y-1.5" data-testid="timbre-reference-selector">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium uppercase text-zinc-400">
          Timbre Reference
        </label>
        {timbreRef && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear timbre reference"
            className="text-[9px] text-zinc-500 hover:text-zinc-300 transition-colors"
            disabled={disabled}
          >
            Clear
          </button>
        )}
      </div>

      {timbreRef ? (
        /* Active reference display */
        <div className="rounded border border-emerald-600/30 bg-emerald-950/10 p-2" data-testid="timbre-ref-active">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-emerald-400" title="Timbre reference active">
              &#9835;
            </span>
            <span className="text-[11px] text-zinc-200 font-medium truncate">
              {timbreRef.name}
            </span>
            <span className="text-[9px] text-zinc-600 shrink-0">
              {timbreRef.sourceType === 'clip' ? 'from clip' : 'uploaded'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-zinc-500 shrink-0">Strength</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={timbreRef.strength}
              onChange={(e) => handleStrengthChange(parseFloat(e.target.value))}
              className="flex-1 h-1 accent-emerald-400"
              disabled={disabled}
              data-testid="timbre-strength-slider"
            />
            <span className="text-[9px] text-zinc-400 w-8 text-right font-mono">
              {Math.round(timbreRef.strength * 100)}%
            </span>
          </div>
        </div>
      ) : (
        /* Drop zone */
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`rounded border border-dashed px-3 py-3 text-center transition-colors ${
            isDragOver
              ? 'border-emerald-500 bg-emerald-950/20 text-emerald-300'
              : 'border-zinc-700 text-zinc-600 hover:border-zinc-500 hover:text-zinc-400'
          } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          onClick={() => !disabled && fileInputRef.current?.click()}
          data-testid="timbre-drop-zone"
        >
          <p className="text-[10px]">
            {isDragOver
              ? 'Drop audio here'
              : 'Drop audio or clip here, or click to upload'}
          </p>
          <p className="text-[9px] text-zinc-700 mt-0.5">
            Use a reference audio to influence the generated timbre
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = '';
            }}
            disabled={disabled}
          />
        </div>
      )}
    </section>
  );
}
