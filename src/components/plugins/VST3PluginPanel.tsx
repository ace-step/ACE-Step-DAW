import { useCallback, useEffect, useRef } from 'react';
import { useVST3Store } from '../../store/vst3Store';
import type { VST3ActiveInstance, VST3Parameter } from '../../types/vst3';

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
const ExternalLink = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const DEBOUNCE_MS = 50;

interface VST3PluginPanelProps {
  instanceId: string;
}

export function VST3PluginPanel({ instanceId }: VST3PluginPanelProps) {
  const instance = useVST3Store((s) => s.instances[instanceId]) as VST3ActiveInstance | undefined;
  const toggleInstance = useVST3Store((s) => s.toggleInstance);
  const removeInstance = useVST3Store((s) => s.removeInstance);
  const openEditor = useVST3Store((s) => s.openEditor);
  const setParameter = useVST3Store((s) => s.setParameter);
  const selectPreset = useVST3Store((s) => s.selectPreset);
  const savePreset = useVST3Store((s) => s.savePreset);

  if (!instance) {
    return (
      <div className="p-3 text-xs text-zinc-500" data-testid="plugin-panel-empty">
        Plugin instance not found.
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col rounded-lg border border-white/10 bg-[rgba(255,255,255,0.03)] ${
        !instance.enabled ? 'opacity-40' : ''
      }`}
      data-testid="plugin-panel"
      data-instance-id={instanceId}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 rounded-t-lg px-2 py-1.5 bg-[rgba(139,92,246,0.08)]">
        <span className="flex-1 truncate text-[11px] font-medium text-violet-300">
          {instance.pluginName}
        </span>
        <span className="text-[9px] text-zinc-500 truncate max-w-[80px]">
          {instance.vendor}
        </span>

        {/* Open native editor */}
        <button
          onClick={() => openEditor(instanceId)}
          title="Open plugin editor"
          aria-label="Open editor"
          data-testid="open-editor-btn"
          className="h-5 w-5 flex items-center justify-center text-zinc-400 hover:text-white"
        >
          <ExternalLink className="h-3 w-3" />
        </button>

        {/* Enable / bypass */}
        <button
          onClick={() => toggleInstance(instanceId)}
          title={instance.enabled ? 'Bypass plugin' : 'Enable plugin'}
          aria-label={instance.enabled ? 'Bypass plugin' : 'Enable plugin'}
          data-testid="toggle-enable-btn"
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
          data-testid="remove-plugin-btn"
          className="h-5 w-5 flex items-center justify-center text-zinc-500 hover:text-red-400"
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      </div>

      {/* Preset selector */}
      <div className="flex items-center gap-1 border-b border-white/5 px-2 py-1">
        <select
          value={instance.activePreset ?? ''}
          onChange={(e) => selectPreset(instanceId, e.target.value)}
          aria-label="Select preset"
          data-testid="preset-selector"
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
          data-testid="save-preset-btn"
          className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-zinc-400 hover:bg-white/10 hover:text-white"
        >
          Save
        </button>
      </div>

      {/* Parameters */}
      <div className="flex flex-col gap-1 overflow-y-auto max-h-[260px] p-2" data-testid="param-list">
        {instance.parameters.map((param) => (
          <ParameterControl
            key={param.id}
            param={param}
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

// ── Individual parameter control ──────────────────────────────────────────────

function ParameterControl({
  param,
  instanceId,
  setParameter,
}: {
  param: VST3Parameter;
  instanceId: string;
  setParameter: (instanceId: string, paramId: number, value: number) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Clean up debounce timer on unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleChange = useCallback(
    (value: number) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setParameter(instanceId, param.id, value);
      }, DEBOUNCE_MS);
    },
    [instanceId, param.id, setParameter],
  );

  const isEnum = param.enumValues.length > 0;

  if (isEnum) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-24 truncate text-[10px] text-zinc-400" title={param.name}>{param.name}</span>
        <select
          value={param.value}
          onChange={(e) => {
            setParameter(instanceId, param.id, Number(e.target.value));
          }}
          aria-label={param.name}
          data-testid="param-enum"
          className="flex-1 rounded border border-white/10 bg-transparent px-1 py-0.5 text-[10px] text-zinc-300 outline-none"
        >
          {param.enumValues.map((label, i) => (
            <option key={i} value={i}>{label}</option>
          ))}
        </select>
      </div>
    );
  }

  // Float slider
  const pct = param.maxValue > param.minValue
    ? ((param.value - param.minValue) / (param.maxValue - param.minValue)) * 100
    : 0;

  return (
    <div className="flex items-center gap-2">
      <span className="w-24 truncate text-[10px] text-zinc-400" title={param.name}>{param.name}</span>
      <input
        type="range"
        min={param.minValue}
        max={param.maxValue}
        step={(param.maxValue - param.minValue) / 1000 || 0.001}
        value={param.value}
        onChange={(e) => handleChange(Number(e.target.value))}
        aria-label={param.name}
        data-testid="param-slider"
        className="flex-1 h-1 accent-violet-500"
        style={{
          background: `linear-gradient(to right, rgb(139 92 246) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`,
        }}
      />
      <span className="w-10 text-right text-[9px] text-zinc-500 tabular-nums">
        {param.value.toFixed(2)}
      </span>
    </div>
  );
}
