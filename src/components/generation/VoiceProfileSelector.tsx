import { useCallback } from 'react';
import { useGenerationStore } from '../../store/generationStore';

/**
 * Voice profile selector dropdown for the generation panel.
 * Hidden when no voice profiles exist.
 * Changing the selection loads per-voice default influence values.
 */
export function VoiceProfileSelector() {
  const voiceProfiles = useGenerationStore((s) => s.voiceProfiles);
  const selectedVoiceProfileId = useGenerationStore((s) => s.generationForm.selectedVoiceProfileId);
  const setSelectedVoiceProfile = useGenerationStore((s) => s.setSelectedVoiceProfile);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      setSelectedVoiceProfile(value || null);
    },
    [setSelectedVoiceProfile],
  );

  // Don't render when no voice profiles are available
  if (voiceProfiles.length === 0) return null;

  return (
    <div>
      <label
        htmlFor="voice-profile-select"
        className="mb-1 block text-[10px] font-medium uppercase text-zinc-400"
      >
        Voice Profile
      </label>
      <select
        id="voice-profile-select"
        aria-label="Voice Profile"
        value={selectedVoiceProfileId ?? ''}
        onChange={handleChange}
        className="w-full rounded bg-[var(--daw-surface-2)] px-2 py-1 text-[11px] text-zinc-200 border border-[var(--daw-border)] focus:border-[var(--daw-accent)] focus:outline-none"
      >
        <option value="">No voice</option>
        {voiceProfiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name}
          </option>
        ))}
      </select>
    </div>
  );
}
