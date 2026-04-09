import { useEffect, useRef } from 'react';
import type { AudioHealthSnapshot, AudioHealthStatus, AudioDeviceInfo } from '../../types/audioHealth';

const STATUS_COLORS: Record<AudioHealthStatus, string> = {
  good: 'text-emerald-400',
  warning: 'text-amber-400',
  error: 'text-red-400',
  inactive: 'text-zinc-500',
};

const STATE_LABELS: Record<string, string> = {
  running: 'Running',
  suspended: 'Suspended',
  closed: 'Closed',
};

interface MetricRowProps {
  label: string;
  value: string;
  warning?: boolean;
}

function MetricRow({ label, value, warning }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-zinc-400">{label}</span>
      <span className={`tabular-nums font-mono ${warning ? 'text-amber-400' : 'text-zinc-200'}`}>
        {value}
      </span>
    </div>
  );
}

interface DeviceListProps {
  title: string;
  devices: AudioDeviceInfo[];
}

function DeviceList({ title, devices }: DeviceListProps) {
  if (devices.length === 0) return null;

  return (
    <div>
      <h4 className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">{title}</h4>
      <div className="space-y-0.5">
        {devices.map((d) => (
          <div key={d.deviceId} className="flex items-center gap-1.5 text-zinc-300">
            <span className={`inline-block w-1 h-1 rounded-full shrink-0 ${d.isDefault ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
            <span className="truncate">{d.label}</span>
            {d.isDefault && (
              <span className="text-[8px] uppercase tracking-wide text-zinc-500 shrink-0">default</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface AudioHealthPanelProps {
  open: boolean;
  onClose: () => void;
  snapshot: AudioHealthSnapshot | null;
  status: AudioHealthStatus;
  devices: AudioDeviceInfo[];
  xrunCount: number;
  recentClipCount: number;
}

export function AudioHealthPanel({
  open,
  onClose,
  snapshot,
  status,
  devices,
  xrunCount,
  recentClipCount,
}: AudioHealthPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const inputDevices = devices.filter((d) => d.kind === 'audioinput');
  const outputDevices = devices.filter((d) => d.kind === 'audiooutput');

  return (
    <div
      ref={panelRef}
      data-testid="audio-health-panel"
      className="absolute bottom-8 right-2 z-50 w-[280px] rounded-lg border border-daw-border bg-daw-surface shadow-2xl"
      role="dialog"
      aria-label="Audio engine health details"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-daw-border">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" className={STATUS_COLORS[status]} aria-hidden="true">
            <path d="M8 2v12M4 5v6M12 5v6M2 7v2M14 7v2M6 3v10M10 3v10" strokeLinecap="round" />
          </svg>
          <h3 className="text-xs font-semibold text-zinc-100">Audio Engine</h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Close audio health panel"
          className="text-zinc-400 hover:text-zinc-200 transition-colors text-sm leading-none"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div className="px-3 py-2 text-[11px] space-y-3">
        {snapshot === null ? (
          <p className="text-zinc-500 text-center py-3">Audio engine not initialized</p>
        ) : (
          <>
            {/* Context & Performance */}
            <div>
              <h4 className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Status</h4>
              <MetricRow
                label="Context"
                value={STATE_LABELS[snapshot.contextState] ?? snapshot.contextState}
              />
              <MetricRow label="Sample Rate" value={`${snapshot.sampleRate} Hz`} />
              <MetricRow
                label="Master Level"
                value={`${snapshot.masterLevelDb === -Infinity ? '-∞' : snapshot.masterLevelDb.toFixed(1)} dB`}
                warning={snapshot.masterClipping}
              />
            </div>

            {/* Latency */}
            <div>
              <h4 className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Latency</h4>
              <MetricRow
                label="Base"
                value={snapshot.baseLatencyMs != null ? `${snapshot.baseLatencyMs.toFixed(1)} ms` : '—'}
              />
              <MetricRow
                label="Output"
                value={snapshot.outputLatencyMs != null ? `${snapshot.outputLatencyMs.toFixed(1)} ms` : '—'}
              />
              <MetricRow
                label="Total"
                value={snapshot.totalLatencyMs != null ? `${snapshot.totalLatencyMs.toFixed(1)} ms` : '—'}
                warning={snapshot.totalLatencyMs != null && snapshot.totalLatencyMs > 100}
              />
            </div>

            {/* Diagnostics */}
            <div>
              <h4 className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Diagnostics</h4>
              <MetricRow label="Buffer Xruns" value={String(xrunCount)} warning={xrunCount > 0} />
              <MetricRow label="Clip Events" value={String(recentClipCount)} warning={recentClipCount > 0} />
            </div>
          </>
        )}

        {/* Devices */}
        <div>
          <h4 className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Devices</h4>
          {devices.length === 0 ? (
            <p className="text-zinc-500 text-[10px]">No devices detected</p>
          ) : (
            <div className="space-y-2">
              <DeviceList title="Outputs" devices={outputDevices} />
              <DeviceList title="Inputs" devices={inputDevices} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
