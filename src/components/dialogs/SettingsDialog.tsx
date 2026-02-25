import { useState, useEffect, useRef } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { listModels, getBackendUrl, setBackendUrl } from '../../services/aceStepApi';
import { DEFAULT_GENERATION } from '../../constants/defaults';
import type { ModelEntry } from '../../types/api';

export function SettingsDialog() {
  const show = useUIStore((s) => s.showSettingsDialog);
  const setShow = useUIStore((s) => s.setShowSettingsDialog);
  const project = useProjectStore((s) => s.project);

  const [steps, setSteps] = useState(DEFAULT_GENERATION.inferenceSteps);
  const [guidance, setGuidance] = useState(DEFAULT_GENERATION.guidanceScale);
  const [shift, setShift] = useState(DEFAULT_GENERATION.shift);
  const [thinking, setThinking] = useState(DEFAULT_GENERATION.thinking);
  const [model, setModel] = useState('');
  const [backendUrl, setBackendUrlLocal] = useState('');
  const [availableModels, setAvailableModels] = useState<ModelEntry[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const prevShow = useRef(false);

  useEffect(() => {
    if (show && !prevShow.current) {
      const gen = project?.generationDefaults ?? DEFAULT_GENERATION;
      setSteps(gen.inferenceSteps);
      setGuidance(gen.guidanceScale);
      setShift(gen.shift);
      setThinking(gen.thinking);
      setModel(gen.model);
      setBackendUrlLocal(getBackendUrl());

      setModelsLoading(true);
      listModels()
        .then((resp) => setAvailableModels(resp?.models ?? []))
        .catch(() => setAvailableModels([]))
        .finally(() => setModelsLoading(false));
    }
    prevShow.current = show;
  }, [show, project]);

  if (!show) return null;

  const handleSave = () => {
    const store = useProjectStore.getState();
    if (store.project) {
      useProjectStore.setState({
        project: {
          ...store.project,
          updatedAt: Date.now(),
          generationDefaults: {
            ...store.project.generationDefaults,
            inferenceSteps: steps,
            guidanceScale: guidance,
            shift,
            thinking,
            model,
          },
        },
      });
    }
    setBackendUrl(backendUrl);
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onMouseDown={(e) => e.stopPropagation()}>
      <div className="w-[400px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 className="text-sm font-medium">Settings</h2>
          <button
            onClick={() => setShow(false)}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3">
          <h3 className="text-xs font-medium text-zinc-300">Backend Connection</h3>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Backend URL</label>
            <input
              type="text"
              value={backendUrl}
              onChange={(e) => setBackendUrlLocal(e.target.value)}
              placeholder="Leave empty to use dev proxy (default)"
              className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent placeholder:text-zinc-600"
            />
            <p className="mt-1 text-[10px] text-zinc-600">
              Direct URL to acestep-api server, e.g. http://127.0.0.1:8001
            </p>
          </div>

          <h3 className="text-xs font-medium text-zinc-300 pt-2">Generation Parameters</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Inference Steps</label>
              <input
                type="number"
                value={steps}
                onChange={(e) => setSteps(parseInt(e.target.value) || 50)}
                min={10}
                max={200}
                className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Guidance Scale</label>
              <input
                type="number"
                value={guidance}
                onChange={(e) => setGuidance(parseFloat(e.target.value) || 7.0)}
                min={1}
                max={20}
                step={0.5}
                className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Shift</label>
              <input
                type="number"
                value={shift}
                onChange={(e) => setShift(parseFloat(e.target.value) || 3.0)}
                min={0}
                max={10}
                step={0.5}
                className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={thinking}
                  onChange={(e) => setThinking(e.target.checked)}
                  className="w-4 h-4 rounded border-daw-border bg-daw-bg accent-daw-accent"
                />
                <span className="text-xs text-zinc-400">Thinking mode</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={modelsLoading}
              className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
            >
              <option value="">Server Default</option>
              {availableModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}{m.is_default ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end px-4 py-3 border-t border-daw-border gap-2">
          <button
            onClick={() => setShow(false)}
            className="px-4 py-1.5 text-xs font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-xs font-medium bg-daw-accent hover:bg-daw-accent-hover text-white rounded transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
