/**
 * MPE Settings Panel — zone configuration UI for MPE controllers.
 *
 * Shows master/member channel assignments, pitch bend range,
 * and auto-detection status. Rendered inside the SettingsDialog.
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/960
 */

import { useMpeStore } from '../../store/mpeStore';

/** Visual representation of a 16-channel MIDI layout with zone highlighting. */
function ChannelMap() {
  const lowerMembers = useMpeStore((s) => s.lowerZoneMembers);
  const upperMembers = useMpeStore((s) => s.upperZoneMembers);

  const getChannelRole = (ch: number): 'lower-master' | 'lower-member' | 'upper-master' | 'upper-member' | 'unused' => {
    if (ch === 0 && lowerMembers > 0) return 'lower-master';
    if (ch >= 1 && ch <= lowerMembers) return 'lower-member';
    if (ch === 15 && upperMembers > 0) return 'upper-master';
    if (ch >= 15 - upperMembers && ch <= 14 && upperMembers > 0) return 'upper-member';
    return 'unused';
  };

  const roleColors: Record<string, string> = {
    'lower-master': 'bg-blue-600',
    'lower-member': 'bg-blue-400/60',
    'upper-master': 'bg-amber-600',
    'upper-member': 'bg-amber-400/60',
    'unused': 'bg-daw-surface-2',
  };

  const roleLabels: Record<string, string> = {
    'lower-master': 'Lower Master',
    'lower-member': 'Lower Member',
    'upper-master': 'Upper Master',
    'upper-member': 'Upper Member',
    'unused': 'Unused',
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-xs text-zinc-400">Channel Map</label>
      <div className="flex gap-0.5">
        {Array.from({ length: 16 }, (_, i) => {
          const role = getChannelRole(i);
          return (
            <div
              key={i}
              className={`flex-1 h-5 rounded-sm ${roleColors[role]} flex items-center justify-center`}
              title={`Ch ${i + 1}: ${roleLabels[role]}`}
            >
              <span className="text-[8px] font-mono text-white/80">{i + 1}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-blue-500 inline-block" /> Lower Zone
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-amber-500 inline-block" /> Upper Zone
        </span>
      </div>
    </div>
  );
}

export function MpeSettingsPanel() {
  const enabled = useMpeStore((s) => s.enabled);
  const lowerMembers = useMpeStore((s) => s.lowerZoneMembers);
  const upperMembers = useMpeStore((s) => s.upperZoneMembers);
  const pitchBendRange = useMpeStore((s) => s.pitchBendRange);
  const autoDetected = useMpeStore((s) => s.autoDetected);
  const setEnabled = useMpeStore((s) => s.setEnabled);
  const setLower = useMpeStore((s) => s.setLowerZoneMembers);
  const setUpper = useMpeStore((s) => s.setUpperZoneMembers);
  const setPbr = useMpeStore((s) => s.setPitchBendRange);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-zinc-300">MPE (Polyphonic Expression)</h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-daw-accent w-3.5 h-3.5"
          />
          <span className="text-xs text-zinc-400">{enabled ? 'On' : 'Off'}</span>
        </label>
      </div>

      {autoDetected && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-green-900/30 border border-green-700/40 rounded text-[10px] text-green-400">
          <span>MPE controller auto-detected</span>
        </div>
      )}

      {enabled && (
        <>
          <ChannelMap />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Lower Zone Members</label>
              <input
                type="number"
                value={lowerMembers}
                onChange={(e) => setLower(parseInt(e.target.value) || 0)}
                min={0}
                max={14}
                className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              />
              <p className="mt-0.5 text-[10px] text-zinc-600">
                Master: Ch 1 | Members: Ch 2–{Math.min(lowerMembers + 1, 15)}
              </p>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Upper Zone Members</label>
              <input
                type="number"
                value={upperMembers}
                onChange={(e) => setUpper(parseInt(e.target.value) || 0)}
                min={0}
                max={14}
                className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              />
              <p className="mt-0.5 text-[10px] text-zinc-600">
                Master: Ch 16 | Members: Ch {16 - upperMembers}–15
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Pitch Bend Range (semitones)</label>
            <input
              type="number"
              value={pitchBendRange}
              onChange={(e) => setPbr(parseInt(e.target.value) || 48)}
              min={1}
              max={96}
              className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
            />
            <p className="mt-0.5 text-[10px] text-zinc-600">
              MPE standard: 48 semitones (±4 octaves). Common: 24, 48, 96
            </p>
          </div>
        </>
      )}
    </div>
  );
}
