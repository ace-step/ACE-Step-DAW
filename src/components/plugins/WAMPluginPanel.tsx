/**
 * WAMPluginPanel — Controls for an active WAM plugin instance.
 *
 * Shows enable/bypass, parameter sliders, preset management,
 * and an embedded custom GUI (if the plugin provides one).
 */
import { useCallback, useEffect, useRef } from 'react';
import { useWAMStore } from '../../store/wamStore';
import type { WAMParameterInfo } from '../../types/wam';
import type { WAMPluginAdapter } from '../../services/wam/WAMPluginAdapter';

// ── Inline icons ──────────────────────────────────────────────────────────────
const Power = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" />
  </svg>
);
const Trash2 = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
  </svg>
);
const WindowIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18" />
  </svg>
);

const DEBOUNCE_MS = 50;

interface WAMPluginPanelProps {
  instanceId: string;
}

export function WAMPluginPanel({ instanceId }: WAMPluginPanelProps) {
  const instance = useWAMStore((s) => s.instances[instanceId]);
  const toggleInstance = useWAMStore((s) => s.toggleInstance);
  const removeInstance = useWAMStore((s) => s.removeInstance);
  const setParameter = useWAMStore((s) => s.setParameter);
  const toggleGui = useWAMStore((s) => s.toggleGui);
  const savePreset = useWAMStore((s) => s.savePreset);
  const loadPreset = useWAMStore((s) => s.loadPreset);
  const getAdapter = useWAMStore((s) => s.getAdapter);

  if (!instance) {
    return (
      <div className="p-3 text-xs text-zinc-500" data-testid="wam-panel-empty">
        WAM plugin instance not found.
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col rounded-lg border border-white/10 bg-[rgba(255,255,255,0.03)] ${
        !instance.enabled ? 'opacity-40' : ''
      }`}
      data-testid="wam-plugin-panel"
      data-instance-id={instanceId}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 rounded-t-lg px-2 py-1.5 bg-[rgba(59,130,246,0.08)]">
        <span className="flex-1 truncate text-[11px] font-medium text-blue-300">
          {instance.pluginName}
        </span>
        <span className="text-[9px] text-zinc-500 truncate max-w-[80px]">
          {instance.vendor}
        </span>

        {/* Open custom GUI */}
        {instance.hasGui && (
          <button
            onClick={() => toggleGui(instanceId)}
            title={instance.guiVisible ? 'Hide plugin GUI' : 'Show plugin GUI'}
            aria-label={instance.guiVisible ? 'Hide plugin GUI' : 'Show plugin GUI'}
            data-testid="wam-toggle-gui-btn"
            className={`h-5 w-5 flex items-center justify-center ${
              instance.guiVisible ? 'text-blue-400' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <WindowIcon className="h-3 w-3" />
          </button>
        )}

        {/* Enable / bypass */}
        <button
          onClick={() => toggleInstance(instanceId)}
          title={instance.enabled ? 'Bypass plugin' : 'Enable plugin'}
          aria-label={instance.enabled ? 'Bypass plugin' : 'Enable plugin'}
          data-testid="wam-toggle-enable-btn"
          className={`h-5 w-5 flex items-center justify-center ${
            instance.enabled ? 'text-green-400' : 'text-zinc-500'
          }`}
        >
          <Power className="h-3 w-3" />
        </button>

        {/* Remove */}
        <button
          onClick={() => removeInstance(instanceId)}
          title="Remove plugin"
          aria-label="Remove plugin"
          data-testid="wam-remove-btn"
          className="h-5 w-5 flex items-center justify-center text-zinc-500 hover:text-red-400"
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      </div>

      {/* Preset selector */}
      <div className="flex items-center gap-1 border-b border-white/5 px-2 py-1">
        <select
          value={instance.activePreset ?? ''}
          onChange={(e) => {
            if (e.target.value) loadPreset(instanceId, e.target.value);
          }}
          aria-label="Select preset"
          data-testid="wam-preset-selector"
          className="flex-1 rounded border border-white/10 bg-transparent px-1 py-0.5 text-[10px] text-zinc-300 outline-none"
        >
          <option value="">-- No preset --</option>
          {instance.presets.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button
          onClick={() => {
            const name = `User Preset ${Date.now()}`;
            savePreset(instanceId, name);
          }}
          title="Save preset"
          aria-label="Save preset"
          data-testid="wam-save-preset-btn"
          className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-zinc-400 hover:bg-white/10 hover:text-white"
        >
          Save
        </button>
      </div>

      {/* Custom GUI embed area */}
      {instance.hasGui && instance.guiVisible && (
        <WAMGuiEmbed instanceId={instanceId} getAdapter={getAdapter} />
      )}

      {/* Parameters */}
      <div className="flex flex-col gap-1 overflow-y-auto max-h-[260px] p-2" data-testid="wam-param-list">
        {instance.parameters.map((param) => (
          <WAMParameterControl
            key={param.id}
            param={param}
            value={instance.parameterValues[param.id] ?? param.defaultValue}
            instanceId={instanceId}
            setParameter={setParameter}
          />
        ))}
        {instance.parameters.length === 0 && (
          <span className="text-[10px] text-zinc-600">No exposed parameters.</span>
        )}
      </div>
    </div>
  );
}

// ── GUI Embed ────────────────────────────────────────────────────────────────

interface WAMGuiAdapter {
  createGui: () => Promise<Element>;
  destroyGui: (gui: Element) => void;
}

function WAMGuiEmbed({
  instanceId,
  getAdapter,
}: {
  instanceId: string;
  getAdapter: (id: string) => WAMGuiAdapter | undefined;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const guiRef = useRef<Element | null>(null);

  useEffect(() => {
    const adapter = getAdapter(instanceId);
    if (!adapter || !containerRef.current) return;

    let mounted = true;

    adapter.createGui().then((gui: Element) => {
      if (!mounted || !containerRef.current) return;
      guiRef.current = gui;
      containerRef.current.appendChild(gui);
    });

    return () => {
      mounted = false;
      if (guiRef.current && adapter) {
        adapter.destroyGui(guiRef.current);
        guiRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [instanceId, getAdapter]);

  return (
    <div
      ref={containerRef}
      className="border-b border-white/5 overflow-auto max-h-[400px]"
      data-testid="wam-gui-embed"
    />
  );
}

// ── Parameter control ────────────────────────────────────────────────────────

function WAMParameterControl({
  param,
  value,
  instanceId,
  setParameter,
}: {
  param: WAMParameterInfo;
  value: number;
  instanceId: string;
  setParameter: (instanceId: string, paramId: string, value: number) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleChange = useCallback(
    (newValue: number) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setParameter(instanceId, param.id, newValue);
      }, DEBOUNCE_MS);
    },
    [instanceId, param.id, setParameter],
  );

  if (param.type === 'choice' && param.choices?.length) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-24 truncate text-[10px] text-zinc-400" title={param.label}>{param.label}</span>
        <select
          value={value}
          onChange={(e) => setParameter(instanceId, param.id, Number(e.target.value))}
          aria-label={param.label}
          data-testid="wam-param-enum"
          className="flex-1 rounded border border-white/10 bg-transparent px-1 py-0.5 text-[10px] text-zinc-300 outline-none"
        >
          {param.choices.map((label, i) => (
            <option key={i} value={i}>{label}</option>
          ))}
        </select>
      </div>
    );
  }

  if (param.type === 'boolean') {
    return (
      <div className="flex items-center gap-2">
        <span className="w-24 truncate text-[10px] text-zinc-400" title={param.label}>{param.label}</span>
        <button
          onClick={() => setParameter(instanceId, param.id, value > 0.5 ? 0 : 1)}
          aria-label={param.label}
          data-testid="wam-param-bool"
          className={`rounded px-2 py-0.5 text-[10px] font-medium ${
            value > 0.5
              ? 'bg-green-500/20 text-green-300'
              : 'bg-white/5 text-zinc-500'
          }`}
        >
          {value > 0.5 ? 'On' : 'Off'}
        </button>
      </div>
    );
  }

  // Float / Int slider
  const pct =
    param.maxValue > param.minValue
      ? ((value - param.minValue) / (param.maxValue - param.minValue)) * 100
      : 0;

  return (
    <div className="flex items-center gap-2">
      <span className="w-24 truncate text-[10px] text-zinc-400" title={param.label}>{param.label}</span>
      <input
        type="range"
        min={param.minValue}
        max={param.maxValue}
        step={param.discreteStep || (param.maxValue - param.minValue) / 1000 || 0.001}
        value={value}
        onChange={(e) => handleChange(Number(e.target.value))}
        aria-label={param.label}
        data-testid="wam-param-slider"
        className="flex-1 h-1 accent-blue-500"
        style={{
          background: `linear-gradient(to right, rgb(59 130 246) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`,
        }}
      />
      <span className="w-10 text-right text-[9px] text-zinc-500 tabular-nums">
        {param.type === 'int' ? Math.round(value) : value.toFixed(2)}
      </span>
    </div>
  );
}
