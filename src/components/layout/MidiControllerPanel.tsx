/**
 * MidiControllerPanel — shows connected MIDI devices, active mappings,
 * MIDI Learn status, and activity indicator.
 *
 * Modeled after UndoHistoryPanel for consistent look/feel.
 */
import { useCallback, useEffect, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useMidiControllerStore } from '../../store/midiControllerStore';
import { WebMidiService } from '../../services/webMidiService';
import { downloadBlob } from '../../services/browserDownload';
import { Z } from '../../utils/zIndex';
import type { MidiMapping } from '../../types/midiController';

type Tab = 'devices' | 'mappings';

function ActivityDot({ active }: { active: boolean }) {
  return (
    <span
      data-testid="midi-activity-dot"
      className={`inline-block h-2 w-2 rounded-full transition-colors ${
        active ? 'bg-green-400 shadow-[0_0_4px_rgba(74,222,128,0.5)]' : 'bg-zinc-600'
      }`}
    />
  );
}

function DeviceRow({ name, manufacturer, state }: { name: string; manufacturer: string; state: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
      <span className={`inline-block h-2 w-2 rounded-full ${state === 'connected' ? 'bg-green-400' : 'bg-zinc-600'}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-zinc-200">{name}</div>
        <div className="text-[10px] text-zinc-400">{manufacturer}</div>
      </div>
      <span className="text-[9px] uppercase tracking-wider text-zinc-500">{state}</span>
    </div>
  );
}

function MappingRow({
  mapping,
  onRemove,
}: {
  mapping: MidiMapping;
  onRemove: (id: string) => void;
}) {
  const controlLabel =
    mapping.controlType === 'cc'
      ? `CC ${mapping.controlNumber}`
      : mapping.controlType === 'pitchBend'
        ? 'Pitch Bend'
        : `Note ${mapping.controlNumber}`;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-zinc-200">{mapping.targetLabel}</div>
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
          <span className="font-mono">{controlLabel}</span>
          <span>·</span>
          <span className="truncate">Ch {mapping.channel + 1}</span>
          <span>·</span>
          <span className="truncate">{mapping.deviceName}</span>
        </div>
      </div>
      <button
        aria-label={`Remove mapping for ${mapping.targetLabel}`}
        className="shrink-0 rounded p-1 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-300"
        onClick={() => onRemove(mapping.id)}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function LearnBadge() {
  const learnMode = useMidiControllerStore((s) => s.learnMode);
  const cancelLearnMode = useMidiControllerStore((s) => s.cancelLearnMode);

  if (!learnMode.active) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-daw-accent/30 bg-daw-accent/10 px-3 py-2">
      <span className="h-2 w-2 animate-pulse rounded-full bg-daw-accent" />
      <div className="flex-1 text-[11px] text-zinc-200">
        Waiting for MIDI input...
        {learnMode.targetLabel && (
          <span className="ml-1 text-zinc-400">({learnMode.targetLabel})</span>
        )}
      </div>
      <button
        aria-label="Cancel MIDI Learn"
        className="rounded px-2 py-0.5 text-[10px] text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
        onClick={cancelLearnMode}
      >
        Cancel
      </button>
    </div>
  );
}

export function MidiControllerPanel() {
  const show = useUIStore((s) => s.showMidiControllerPanel);
  const setShow = useUIStore((s) => s.setShowMidiControllerPanel);
  const devices = useMidiControllerStore((s) => s.devices);
  const mappings = useMidiControllerStore((s) => s.mappings);
  const enabled = useMidiControllerStore((s) => s.enabled);
  const setEnabled = useMidiControllerStore((s) => s.setEnabled);
  const removeMapping = useMidiControllerStore((s) => s.removeMapping);
  const clearAllMappings = useMidiControllerStore((s) => s.clearAllMappings);
  const lastActivity = useMidiControllerStore((s) => s.lastActivity);
  const learnMode = useMidiControllerStore((s) => s.learnMode);
  const connectionError = useMidiControllerStore((s) => s.connectionError);
  const exportMappings = useMidiControllerStore((s) => s.exportMappings);
  const importMappings = useMidiControllerStore((s) => s.importMappings);

  const [tab, setTab] = useState<Tab>('devices');
  const [error, setError] = useState<string | null>(null);
  const [activityFlash, setActivityFlash] = useState(false);

  // Check Web MIDI support on open (connection is handled by useMidiController hook)
  useEffect(() => {
    if (!show) return;
    if (!WebMidiService.isSupported()) {
      setError('Web MIDI not supported in this browser.');
    } else {
      setError(null);
    }
  }, [show]);

  // Flash activity dot briefly
  useEffect(() => {
    if (!lastActivity) return;
    setActivityFlash(true);
    const timer = setTimeout(() => setActivityFlash(false), 150);
    return () => clearTimeout(timer);
  }, [lastActivity]);

  const handleExport = useCallback(() => {
    const preset = exportMappings('MIDI Mappings');
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'midi-mappings.json');
  }, [exportMappings]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const preset = JSON.parse(text);
        importMappings(preset);
      } catch {
        setError('Failed to import mappings file.');
      }
    };
    input.click();
  }, [importMappings]);

  if (!show) return null;
  const displayedError = error ?? connectionError;

  return (
    <div
      data-testid="midi-controller-panel"
      className="fixed right-4 top-14 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-white/10 bg-[#141426]/95 shadow-2xl backdrop-blur"
      style={{ zIndex: Z.commandPalette }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <ActivityDot active={activityFlash} />
        <div className="flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-200">
            MIDI Controllers
          </div>
          <div className="text-[10px] text-zinc-400">
            {devices.length} device{devices.length !== 1 ? 's' : ''} · {mappings.length} mapping{mappings.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button
          aria-label={enabled ? 'Disable MIDI input' : 'Enable MIDI input'}
          className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
            enabled
              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
              : 'bg-zinc-700/50 text-zinc-500 hover:bg-zinc-700'
          }`}
          onClick={() => setEnabled(!enabled)}
        >
          {enabled ? 'ON' : 'OFF'}
        </button>
        <button
          aria-label="Close MIDI controller panel"
          className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
          onClick={() => setShow(false)}
        >
          ×
        </button>
      </div>

      {/* MIDI Learn indicator */}
      {learnMode.active && (
        <div className="border-b border-white/10 px-2 py-2">
          <LearnBadge />
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-white/10 px-2 py-2">
        {(['devices', 'mappings'] as Tab[]).map((t) => {
          const isActive = tab === t;
          const label = t === 'devices' ? `Devices (${devices.length})` : `Mappings (${mappings.length})`;
          return (
            <button
              key={t}
              className={`rounded-full px-2.5 py-1 text-[10px] transition-colors ${
                isActive
                  ? 'bg-daw-accent text-white'
                  : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
              }`}
              onClick={() => setTab(t)}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Error */}
      {displayedError && (
        <div className="mx-2 mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
          {displayedError}
        </div>
      )}

      {/* Content */}
      <div className="max-h-[420px] overflow-y-auto px-2 py-2">
        {tab === 'devices' && (
          <div className="flex flex-col gap-1">
            {devices.length === 0 && (
              <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-zinc-400">
                No MIDI devices detected. Connect a controller and toggle MIDI ON.
              </div>
            )}
            {devices.map((device) => (
              <DeviceRow key={device.id} name={device.name} manufacturer={device.manufacturer} state={device.state} />
            ))}
          </div>
        )}

        {tab === 'mappings' && (
          <div className="flex flex-col gap-1">
            {mappings.length === 0 && (
              <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-zinc-400">
                No mappings yet. Use MIDI Learn or add mappings from mixer controls.
              </div>
            )}
            {mappings.map((mapping) => (
              <MappingRow key={mapping.id} mapping={mapping} onRemove={removeMapping} />
            ))}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-1 border-t border-white/10 px-2 py-2">
        <button
          className="rounded px-2 py-1 text-[10px] text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
          onClick={handleExport}
          disabled={mappings.length === 0}
        >
          Export
        </button>
        <button
          className="rounded px-2 py-1 text-[10px] text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
          onClick={handleImport}
        >
          Import
        </button>
        {mappings.length > 0 && (
          <button
            className="ml-auto rounded px-2 py-1 text-[10px] text-red-400/80 transition-colors hover:bg-red-500/10 hover:text-red-300"
            onClick={clearAllMappings}
          >
            Clear All
          </button>
        )}
      </div>
    </div>
  );
}
