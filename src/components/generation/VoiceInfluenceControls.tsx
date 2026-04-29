import { useCallback, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useVoiceStore } from '../../store/voiceStore';
import {
  DEFAULT_AUDIO_INFLUENCE,
  DEFAULT_STYLE_INFLUENCE,
  VOICE_INFLUENCE_PRESETS,
  clampInfluence,
} from '../../types/voice';

/**
 * Audio/Style Influence sliders for voice-conditioned generation.
 * Rendered only when a voice profile is selected in the generation form.
 * Follows DAW interaction patterns: double-click to reset and real-time percentage feedback.
 */
export function VoiceInfluenceControls() {
  const selectedVoiceId = useVoiceStore((s) => s.selectedVoiceId);
  const voices = useVoiceStore((s) => s.voices);
  const updateVoice = useVoiceStore((s) => s.updateVoice);
  const selectedDefaultsRef = useRef({
    id: null as string | null,
    audioInfluence: DEFAULT_AUDIO_INFLUENCE,
    styleInfluence: DEFAULT_STYLE_INFLUENCE,
  });

  const selectedProfile = selectedVoiceId
    ? voices.find((p) => p.id === selectedVoiceId)
    : null;
  const audioInfluence = selectedProfile?.defaultAudioInfluence ?? DEFAULT_AUDIO_INFLUENCE;
  const styleInfluence = selectedProfile?.defaultStyleInfluence ?? DEFAULT_STYLE_INFLUENCE;

  useEffect(() => {
    if (!selectedProfile || selectedDefaultsRef.current.id === selectedProfile.id) {
      return;
    }

    selectedDefaultsRef.current = {
      id: selectedProfile.id,
      audioInfluence: clampInfluence(selectedProfile.defaultAudioInfluence ?? DEFAULT_AUDIO_INFLUENCE),
      styleInfluence: clampInfluence(selectedProfile.defaultStyleInfluence ?? DEFAULT_STYLE_INFLUENCE),
    };
  }, [selectedProfile]);

  const updateInfluence = useCallback(
    (updates: { defaultAudioInfluence?: number; defaultStyleInfluence?: number }) => {
      if (!selectedProfile) return;
      updateVoice(selectedProfile.id, updates);
    },
    [selectedProfile, updateVoice],
  );

  const handleAudioChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => updateInfluence({
      defaultAudioInfluence: clampInfluence(Number(e.target.value)),
    }),
    [updateInfluence],
  );

  const handleStyleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => updateInfluence({
      defaultStyleInfluence: clampInfluence(Number(e.target.value)),
    }),
    [updateInfluence],
  );

  const handleAudioDoubleClick = useCallback(
    () => updateInfluence({ defaultAudioInfluence: selectedDefaultsRef.current.audioInfluence }),
    [updateInfluence],
  );

  const handleStyleDoubleClick = useCallback(
    () => updateInfluence({ defaultStyleInfluence: selectedDefaultsRef.current.styleInfluence }),
    [updateInfluence],
  );

  // Don't render when no voice profile is selected
  if (!selectedVoiceId || !selectedProfile) return null;

  const isPresetActive = (audio: number, style: number) =>
    audioInfluence === audio && styleInfluence === style;

  return (
    <div className="space-y-2 rounded-md bg-[var(--daw-surface-2)] p-2">
      {/* Header with voice name */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase text-zinc-400">
          Voice Influence
        </span>
        <span className="text-[10px] text-[var(--daw-accent)] truncate max-w-[120px]">
          {selectedProfile.name}
        </span>
      </div>

      {/* Audio Influence slider */}
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <label
            htmlFor="audio-influence-slider"
            className="text-[10px] font-medium text-zinc-400"
          >
            Audio Influence
          </label>
          <span className="text-[10px] font-mono text-[var(--daw-accent)]">
            {audioInfluence}%
          </span>
        </div>
        <input
          id="audio-influence-slider"
          aria-label="Audio Influence"
          type="range"
          min={0}
          max={100}
          step={1}
          value={audioInfluence}
          onChange={handleAudioChange}
          onDoubleClick={handleAudioDoubleClick}
          className="w-full h-1.5 accent-[var(--daw-accent)] cursor-pointer"
        />
        <div className="flex justify-between text-[8px] text-zinc-600 mt-0.5">
          <span>AI voice</span>
          <span>Original voice</span>
        </div>
      </div>

      {/* Style Influence slider */}
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <label
            htmlFor="style-influence-slider"
            className="text-[10px] font-medium text-zinc-400"
          >
            Style Influence
          </label>
          <span className="text-[10px] font-mono text-[var(--daw-accent)]">
            {styleInfluence}%
          </span>
        </div>
        <input
          id="style-influence-slider"
          aria-label="Style Influence"
          type="range"
          min={0}
          max={100}
          step={1}
          value={styleInfluence}
          onChange={handleStyleChange}
          onDoubleClick={handleStyleDoubleClick}
          className="w-full h-1.5 accent-[var(--daw-accent)] cursor-pointer"
        />
        <div className="flex justify-between text-[8px] text-zinc-600 mt-0.5">
          <span>Neutral</span>
          <span>Full AI style</span>
        </div>
      </div>

      {/* Preset buttons */}
      <div className="flex gap-1">
        {VOICE_INFLUENCE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => updateInfluence({
              defaultAudioInfluence: preset.audioInfluence,
              defaultStyleInfluence: preset.styleInfluence,
            })}
            className={`flex-1 rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
              isPresetActive(preset.audioInfluence, preset.styleInfluence)
                ? 'bg-[var(--daw-accent)] text-white'
                : 'bg-[var(--daw-surface-3)] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
