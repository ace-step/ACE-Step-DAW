import { useCallback } from 'react';
import { useGenerationStore } from '../../store/generationStore';
import {
  DEFAULT_AUDIO_INFLUENCE,
  DEFAULT_STYLE_INFLUENCE,
  VOICE_INFLUENCE_PRESETS,
} from '../../types/voice';

/**
 * Audio/Style Influence sliders for voice-conditioned generation.
 * Rendered only when a voice profile is selected in the generation form.
 * Follows DAW interaction patterns: double-click to reset, real-time percentage tooltip.
 */
export function VoiceInfluenceControls() {
  const selectedVoiceProfileId = useGenerationStore((s) => s.generationForm.selectedVoiceProfileId);
  const audioInfluence = useGenerationStore((s) => s.generationForm.audioInfluence);
  const styleInfluence = useGenerationStore((s) => s.generationForm.styleInfluence);
  const voiceProfiles = useGenerationStore((s) => s.voiceProfiles);
  const setAudioInfluence = useGenerationStore((s) => s.setAudioInfluence);
  const setStyleInfluence = useGenerationStore((s) => s.setStyleInfluence);
  const applyPreset = useGenerationStore((s) => s.applyVoiceInfluencePreset);

  const selectedProfile = selectedVoiceProfileId
    ? voiceProfiles.find((p) => p.id === selectedVoiceProfileId)
    : null;

  const handleAudioChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setAudioInfluence(Number(e.target.value)),
    [setAudioInfluence],
  );

  const handleStyleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setStyleInfluence(Number(e.target.value)),
    [setStyleInfluence],
  );

  const handleAudioDoubleClick = useCallback(
    () => setAudioInfluence(DEFAULT_AUDIO_INFLUENCE),
    [setAudioInfluence],
  );

  const handleStyleDoubleClick = useCallback(
    () => setStyleInfluence(DEFAULT_STYLE_INFLUENCE),
    [setStyleInfluence],
  );

  // Don't render when no voice profile is selected
  if (!selectedVoiceProfileId || !selectedProfile) return null;

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
            onClick={() => applyPreset(preset.audioInfluence, preset.styleInfluence)}
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
