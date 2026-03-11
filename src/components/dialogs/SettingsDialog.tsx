import { useState, useEffect, useRef } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { listModels, initModel, getBackendUrl, setBackendUrl } from '../../services/aceStepApi';
import { DEFAULT_GENERATION, DEFAULT_MEASURES } from '../../constants/defaults';
import type { ModelEntry, LmModelEntry } from '../../types/api';

function modelSupportsThinking(modelName: string): boolean {
  return modelName.includes('turbo') || modelName.includes('sft');
}

export function SettingsDialog() {
  const show = useUIStore((s) => s.showSettingsDialog);
  const setShow = useUIStore((s) => s.setShowSettingsDialog);
  const project = useProjectStore((s) => s.project);

  const [bpm, setBpm] = useState(120);
  const [keyScale, setKeyScale] = useState('');
  const [timeSignature, setTimeSignature] = useState(4);
  const [measures, setMeasures] = useState(DEFAULT_MEASURES);
  const [globalCaption, setGlobalCaption] = useState('');
  const [steps, setSteps] = useState(DEFAULT_GENERATION.inferenceSteps);
  const [guidance, setGuidance] = useState(DEFAULT_GENERATION.guidanceScale);
  const [shift, setShift] = useState(DEFAULT_GENERATION.shift);
  const [thinking, setThinking] = useState(DEFAULT_GENERATION.thinking);
  const [model, setModel] = useState('');
  const [backendUrl, setBackendUrlLocal] = useState('');
  const [availableModels, setAvailableModels] = useState<ModelEntry[]>([]);
  const [availableLmModels, setAvailableLmModels] = useState<LmModelEntry[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const [llmInitialized, setLlmInitialized] = useState(false);
  const [selectedLmModel, setSelectedLmModel] = useState('');
  const [initMessage, setInitMessage] = useState('');
  const [initError, setInitError] = useState('');
  const prevShow = useRef(false);

  const handleModelChange = (newModel: string) => {
    setModel(newModel);
    if (!modelSupportsThinking(newModel)) {
      setThinking(false);
    }
  };

  const refreshModels = async (preferredModel?: string, preferredLmModel?: string) => {
    setModelsLoading(true);
    try {
      const resp = await listModels();
      const models = resp?.models ?? [];
      const lmModels = resp?.lm_models ?? [];
      setAvailableModels(models);
      setAvailableLmModels(lmModels);
      setLlmInitialized(Boolean(resp?.llm_initialized));

      let resolvedModel = preferredModel || '';
      if (!resolvedModel && resp?.default_model) {
        resolvedModel = resp.default_model;
      }
      if (!resolvedModel && models.length > 0) {
        resolvedModel = models[0].name;
      }
      if (resolvedModel && !models.some((m) => m.name === resolvedModel)) {
        resolvedModel = resp?.default_model ?? models[0]?.name ?? '';
      }
      if (resolvedModel) {
        setModel(resolvedModel);
        if (!modelSupportsThinking(resolvedModel)) {
          setThinking(false);
        }
      }

      let resolvedLm = preferredLmModel || '';
      if (!resolvedLm && resp?.loaded_lm_model) {
        resolvedLm = resp.loaded_lm_model;
      }
      if (!resolvedLm && lmModels.length > 0) {
        resolvedLm = lmModels[0].name;
      }
      setSelectedLmModel(resolvedLm);
    } catch {
      setAvailableModels([]);
      setAvailableLmModels([]);
      setLlmInitialized(false);
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    if (show && !prevShow.current) {
      const gen = project?.generationDefaults ?? DEFAULT_GENERATION;
      setBpm(project?.bpm ?? 120);
      setKeyScale(project?.keyScale ?? '');
      setTimeSignature(project?.timeSignature ?? 4);
      setMeasures(project?.measures ?? DEFAULT_MEASURES);
      setGlobalCaption(project?.globalCaption ?? '');
      setSteps(gen.inferenceSteps);
      setGuidance(gen.guidanceScale);
      setShift(gen.shift);
      setThinking(gen.thinking);
      setModel(gen.model);
      setBackendUrlLocal(getBackendUrl());
      setInitMessage('');
      setInitError('');
      setSelectedLmModel('');
      void refreshModels(gen.model);
    }
    prevShow.current = show;
  }, [show, project]);

  if (!show) return null;

  const handleSave = () => {
    const store = useProjectStore.getState();
    if (store.project) {
      store.updateProject({ bpm, keyScale, timeSignature, measures, globalCaption });
      useProjectStore.setState({
        project: {
          ...useProjectStore.getState().project!,
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

  const selectedModelEntry = availableModels.find((m) => m.name === model);
  const selectedLmEntry = availableLmModels.find((m) => m.name === selectedLmModel);

  const handleInitSelectedModel = async () => {
    if (!model) return;
    setInitLoading(true);
    setInitMessage('');
    setInitError('');
    try {
      const resp = await initModel({ model });
      setInitMessage(resp.message || `Initialized ${model}`);
      await refreshModels(model, selectedLmModel);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to initialize model';
      setInitError(msg);
    } finally {
      setInitLoading(false);
    }
  };

  const handleInitSelectedLm = async () => {
    if (!selectedLmModel) return;
    setInitLoading(true);
    setInitMessage('');
    setInitError('');
    try {
      const resp = await initModel({
        model,
        init_llm: true,
        lm_model_path: selectedLmModel,
      });
      setInitMessage(resp.message || `Initialized LLM ${selectedLmModel}`);
      await refreshModels(model, selectedLmModel);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to initialize LLM';
      setInitError(msg);
    } finally {
      setInitLoading(false);
    }
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

          <h3 className="text-xs font-medium text-zinc-300 pt-2">Project</h3>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">BPM</label>
              <input
                type="number"
                value={bpm}
                onChange={(e) => setBpm(parseInt(e.target.value) || 120)}
                min={40}
                max={300}
                className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Key / Scale</label>
              <input
                type="text"
                value={keyScale}
                onChange={(e) => setKeyScale(e.target.value)}
                placeholder="e.g. C major"
                className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent placeholder:text-zinc-600"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Time Sig</label>
              <input
                type="number"
                value={timeSignature}
                onChange={(e) => setTimeSignature(parseInt(e.target.value) || 4)}
                min={1}
                max={16}
                className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Measures</label>
              <input
                type="number"
                value={measures}
                onChange={(e) => setMeasures(Math.max(4, parseInt(e.target.value) || DEFAULT_MEASURES))}
                min={4}
                max={512}
                className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Global Song Description</label>
            <textarea
              value={globalCaption}
              onChange={(e) => setGlobalCaption(e.target.value)}
              rows={3}
              placeholder="Describe the overall song style, mood, genre…"
              className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent placeholder:text-zinc-600 resize-none"
            />
            <p className="mt-1 text-[10px] text-zinc-600">
              Used as fallback when a clip's global caption is empty. Auto-filled from the first generation if left blank.
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
              <label className={`flex items-center gap-2 ${modelSupportsThinking(model) ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                <input
                  type="checkbox"
                  checked={thinking}
                  onChange={(e) => setThinking(e.target.checked)}
                  disabled={!modelSupportsThinking(model)}
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
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={modelsLoading || initLoading}
              className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
            >
              {availableModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}{m.is_default ? ' (default)' : ''}{m.is_loaded ? ' (loaded)' : ''}
                </option>
              ))}
            </select>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-500">
                {selectedModelEntry?.is_loaded ? 'Model is loaded' : 'Model is not loaded'}
              </span>
              <button
                type="button"
                onClick={handleInitSelectedModel}
                disabled={initLoading || !model}
                className="px-2.5 py-1 text-[10px] font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {initLoading ? 'Initializing...' : (selectedModelEntry?.is_loaded ? 'Reinitialize' : 'Initialize')}
              </button>
            </div>
          </div>

          {modelSupportsThinking(model) && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">LM Model</label>
              <select
                value={selectedLmModel}
                onChange={(e) => setSelectedLmModel(e.target.value)}
                disabled={modelsLoading || initLoading}
                className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              >
                {availableLmModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}{m.is_loaded ? ' (loaded)' : ''}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-500">
                  {llmInitialized ? 'LLM initialized' : 'LLM not initialized'}
                </span>
                <button
                  type="button"
                  onClick={handleInitSelectedLm}
                  disabled={initLoading || !selectedLmModel}
                  className="px-2.5 py-1 text-[10px] font-medium bg-daw-surface-2 hover:bg-zinc-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {initLoading ? 'Initializing...' : (selectedLmEntry?.is_loaded ? 'Reinitialize LLM' : 'Initialize LLM')}
                </button>
              </div>
            </div>
          )}

          {initError && (
            <p className="text-[10px] text-red-400">{initError}</p>
          )}
          {initMessage && !initError && (
            <p className="text-[10px] text-emerald-400">{initMessage}</p>
          )}
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
