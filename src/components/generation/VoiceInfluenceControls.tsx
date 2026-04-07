/**
 * Voice Influence Controls — audio/style influence sliders (#1095)
 *
 * Only visible when a voice profile is selected. Controls how much the
 * reference voice (audio influence) and AI style (style influence) affect
 * the generated output.
 */

import { useCallback } from 'react';
import { useVoiceStore } from '../../store/voiceStore';
import { VOICE_INFLUENCE_PRESETS } from '../../types/voice';

export function VoiceInfluenceControls({ disabled }: { disabled?: boolean }) {
  const selectedProfileId = useVoiceStore((s) => s.selectedProfileId);
  const profiles = useVoiceStore((s) => s.profiles);
  const audioInfluence = useVoiceStore((s) => s.audioInfluence);
  const styleInfluence = useVoiceStore((s) => s.styleInfluence);
  const setAudioInfluence = useVoiceStore((s) => s.setAudioInfluence);
  const setStyleInfluence = useVoiceStore((s) => s.setStyleInfluence);
  const applyInfluencePreset = useVoiceStore((s) => s.applyInfluencePreset);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? null;
  const defaultAudio = selectedProfile?.defaultAudioInfluence ?? 0.4;
  const defaultStyle = selectedProfile?.defaultStyleInfluence ?? 0.6;

  const handleReset = useCallback(() => {
    setAudioInfluence(defaultAudio);
    setStyleInfluence(defaultStyle);
  }, [setAudioInfluence, setStyleInfluence, defaultAudio, defaultStyle]);

  if (!selectedProfileId) return null;

  return (
    <section className="space-y-2" data-testid="voice-influence-controls">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium uppercase text-zinc-400">
          Voice Influence
        </label>
        <button
          type="button"
          onClick={handleReset}
          className="text-[9px] text-zinc-500 hover:text-zinc-300 transition-colors"
          disabled={disabled}
          data-testid="voice-influence-reset"
        >
          Reset
        </button>
      </div>

      {/* Presets */}
      <div className="flex gap-1" data-testid="voice-influence-presets">
        {VOICE_INFLUENCE_PRESETS.map((preset) => {
          const isActive =
            Math.abs(audioInfluence - preset.audioInfluence) < 0.01 &&
            Math.abs(styleInfluence - preset.styleInfluence) < 0.01;
          return (
            <button
              key={preset.name}
              type="button"
              onClick={() => applyInfluencePreset(preset.audioInfluence, preset.styleInfluence)}
              disabled={disabled}
              className={`flex-1 rounded px-1.5 py-1 text-[9px] font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600/25 text-indigo-300 border border-indigo-500/40'
                  : 'bg-white/[0.04] text-zinc-400 border border-transparent hover:bg-white/[0.08]'
              }`}
              data-testid={`voice-preset-${preset.name.toLowerCase().replace(/\s/g, '-')}`}
            >
              {preset.name}
            </button>
          );
        })}
      </div>

      {/* Audio Influence slider */}
      <div className="space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-zinc-500">Audio (Voice Fidelity)</span>
          <span className="text-[9px] text-zinc-400 font-mono w-8 text-right" data-testid="voice-audio-influence-value">
            {Math.round(audioInfluence * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={audioInfluence}
          onChange={(e) => setAudioInfluence(parseFloat(e.target.value))}
          onDoubleClick={() => setAudioInfluence(defaultAudio)}
          disabled={disabled}
          className="w-full h-1 accent-indigo-400"
          title={`Audio influence: ${Math.round(audioInfluence * 100)}%`}
          data-testid="voice-audio-influence-slider"
        />
      </div>

      {/* Style Influence slider */}
      <div className="space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-zinc-500">Style (AI Styling)</span>
          <span className="text-[9px] text-zinc-400 font-mono w-8 text-right" data-testid="voice-style-influence-value">
            {Math.round(styleInfluence * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={styleInfluence}
          onChange={(e) => setStyleInfluence(parseFloat(e.target.value))}
          onDoubleClick={() => setStyleInfluence(defaultStyle)}
          disabled={disabled}
          className="w-full h-1 accent-violet-400"
          title={`Style influence: ${Math.round(styleInfluence * 100)}%`}
          data-testid="voice-style-influence-slider"
        />
      </div>
    </section>
  );
}
