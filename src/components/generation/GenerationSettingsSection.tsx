import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { listModels, initModel, getBackendUrl, setBackendUrl } from '../../services/aceStepApi';
import { DEFAULT_GENERATION } from '../../constants/defaults';
import { Button } from '../ui/Button';
import { normalizePlaybackLatencySettings } from '../../utils/playbackLatency';
import type { LmModelEntry, ModelEntry } from '../../types/api';
import { useCustomModelStore } from '../../store/customModelStore';

function modelSupportsThinking(modelName: string): boolean {
  return modelName.includes('turbo') || modelName.includes('sft');
}

export function GenerationSettingsSection({ active }: { active: boolean }) {
  const project = useProjectStore((s) => s.project);
  const customModels = useCustomModelStore((s) => s.customModels);
  const [globalCaption, setGlobalCaption] = useState('');
  const [manualLatencyText, setManualLatencyText] = useState('');
  const [steps, setSteps] = useState(DEFAULT_GENERATION.inferenceSteps);
  const [guidance, setGuidance] = useState(DEFAULT_GENERATION.guidanceScale);
  const [shift, setShift] = useState(DEFAULT_GENERATION.shift);
  const [thinking, setThinking] = useState(DEFAULT_GENERATION.thinking);
  const [model, setModel] = useState('');
  const [backendUrl, setBackendUrlInput] = useState('');
  const [availableModels, setAvailableModels] = useState<ModelEntry[]>([]);
  const [availableLmModels, setAvailableLmModels] = useState<LmModelEntry[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const [llmInitialized, setLlmInitialized] = useState(false);
  const [selectedLmModel, setSelectedLmModel] = useState('');
  const [initMessage, setInitMessage] = useState('');
  const [initError, setInitError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const prevActiveRef = useRef(false);

  const handleModelChange = useCallback((newModel: string) => {
    setModel(newModel);
    if (!modelSupportsThinking(newModel)) {
      setThinking(false);
    }
  }, []);

  const refreshModels = useCallback(async (preferredModel?: string, preferredLmModel?: string) => {
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
      if (resolvedModel && !models.some((entry) => entry.name === resolvedModel)) {
        resolvedModel = resp?.default_model ?? models[0]?.name ?? '';
      }
      setModel(resolvedModel);
      if (resolvedModel && !modelSupportsThinking(resolvedModel)) {
        setThinking(false);
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
  }, []);

  const hydrateFromProject = useCallback(() => {
    const generationDefaults = project?.generationDefaults ?? DEFAULT_GENERATION;
    setGlobalCaption(project?.globalCaption ?? '');
    setManualLatencyText(
      project?.playbackLatency?.manualOverrideMs !== null && project?.playbackLatency?.manualOverrideMs !== undefined
        ? String(project.playbackLatency.manualOverrideMs)
        : '',
    );
    setSteps(generationDefaults.inferenceSteps);
    setGuidance(generationDefaults.guidanceScale);
    setShift(generationDefaults.shift);
    setThinking(generationDefaults.thinking);
    setModel(generationDefaults.model);
    setBackendUrlInput(getBackendUrl());
    setInitMessage('');
    setInitError('');
    setSaveMessage('');
    void refreshModels(generationDefaults.model);
  }, [project, refreshModels]);

  useEffect(() => {
    if (active && !prevActiveRef.current) {
      hydrateFromProject();
    }
    prevActiveRef.current = active;
  }, [active, hydrateFromProject]);

  const selectedModelEntry = availableModels.find((entry) => entry.name === model);
  const selectedLmEntry = availableLmModels.find((entry) => entry.name === selectedLmModel);
  const playbackLatency = normalizePlaybackLatencySettings(project?.playbackLatency);
  const manualLatencyValue = manualLatencyText.trim() === '' ? null : Number.parseFloat(manualLatencyText);
  const pendingManualOverrideMs =
    manualLatencyValue !== null && Number.isFinite(manualLatencyValue)
      ? normalizePlaybackLatencySettings({ manualOverrideMs: manualLatencyValue }).manualOverrideMs
      : null;
  const hasPendingManualOverride =
    manualLatencyText.trim() !== ''
    && pendingManualOverrideMs !== null
    && pendingManualOverrideMs !== playbackLatency.manualOverrideMs;

  const handleInitSelectedModel = useCallback(async () => {
    if (!model) return;
    setInitLoading(true);
    setInitMessage('');
    setInitError('');
    try {
      const resp = await initModel({ model });
      setInitMessage(resp.message || `Initialized ${model}`);
      await refreshModels(model, selectedLmModel);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize model';
      setInitError(message);
    } finally {
      setInitLoading(false);
    }
  }, [model, refreshModels, selectedLmModel]);

  const handleInitSelectedLm = useCallback(async () => {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize LLM';
      setInitError(message);
    } finally {
      setInitLoading(false);
    }
  }, [model, refreshModels, selectedLmModel]);

  const handleSave = useCallback(() => {
    const store = useProjectStore.getState();
    if (store.project) {
      store.updateProject({ globalCaption });
      const parsedManualLatency = manualLatencyText.trim() === '' ? null : Number.parseFloat(manualLatencyText);
      store.setPlaybackLatencyOverride(Number.isFinite(parsedManualLatency) ? parsedManualLatency : null);
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
    setSaveMessage('Generate settings saved to this project.');
  }, [backendUrl, globalCaption, guidance, manualLatencyText, model, shift, steps, thinking]);

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3" data-testid="generation-settings-section">
      <section className="rounded-lg border border-[#353535] bg-[#232323] p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Model & Backend</h3>
            <p className="text-[11px] text-zinc-400">Keep model selection and ACE-Step backend controls inside Generate.</p>
          </div>
          <button
            type="button"
            onClick={() => void refreshModels(model, selectedLmModel)}
            className="rounded border border-[#444] px-2 py-1 text-[10px] text-zinc-300 transition-colors hover:border-[#555] hover:text-white"
          >
            Refresh
          </button>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase text-zinc-400">Backend URL</label>
          <input
            type="text"
            value={backendUrl}
            onChange={(event) => setBackendUrlInput(event.target.value)}
            placeholder="Leave empty to use dev proxy"
            className="w-full rounded border border-[#444] bg-[#2a2a2a] px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase text-zinc-400">Model</label>
          <select
            value={model}
            onChange={(event) => handleModelChange(event.target.value)}
            disabled={modelsLoading || initLoading}
            className="w-full rounded border border-[#444] bg-[#2a2a2a] px-3 py-1.5 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
          >
            {availableModels.length === 0 && customModels.length === 0 && <option value="">No models available</option>}
            {availableModels.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.name}{entry.is_default ? ' (default)' : ''}{entry.is_loaded ? ' (loaded)' : ''}
              </option>
            ))}
            {customModels.length > 0 && (
              <optgroup label="Custom Models">
                {customModels.map((cm) => (
                  <option key={cm.id} value={cm.name}>
                    {cm.name} (custom)
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-zinc-400">
              {selectedModelEntry?.is_loaded ? 'Model is loaded' : 'Model is not loaded'}
            </span>
            <button
              type="button"
              onClick={() => void handleInitSelectedModel()}
              disabled={initLoading || !model}
              className="rounded bg-[#343434] px-2.5 py-1 text-[10px] font-medium text-zinc-200 transition-colors hover:bg-[#454545] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {initLoading ? 'Initializing...' : (selectedModelEntry?.is_loaded ? 'Reinitialize' : 'Initialize')}
            </button>
          </div>
        </div>

        {modelSupportsThinking(model) && (
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase text-zinc-400">LM Model</label>
            <select
              value={selectedLmModel}
              onChange={(event) => setSelectedLmModel(event.target.value)}
              disabled={modelsLoading || initLoading}
              className="w-full rounded border border-[#444] bg-[#2a2a2a] px-3 py-1.5 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
            >
              {availableLmModels.length === 0 && <option value="">No LM models available</option>}
              {availableLmModels.map((entry) => (
                <option key={entry.name} value={entry.name}>
                  {entry.name}{entry.is_loaded ? ' (loaded)' : ''}
                </option>
              ))}
            </select>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-400">
                {llmInitialized ? 'LLM initialized' : 'LLM not initialized'}
              </span>
              <button
                type="button"
                onClick={() => void handleInitSelectedLm()}
                disabled={initLoading || !selectedLmModel}
                className="rounded bg-[#343434] px-2.5 py-1 text-[10px] font-medium text-zinc-200 transition-colors hover:bg-[#454545] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {initLoading ? 'Initializing...' : (selectedLmEntry?.is_loaded ? 'Reinitialize LLM' : 'Initialize LLM')}
              </button>
            </div>
          </div>
        )}

        {initError && <p className="text-[10px] text-red-400">{initError}</p>}
        {initMessage && !initError && <p className="text-[10px] text-emerald-400">{initMessage}</p>}
      </section>

      <section className="rounded-lg border border-[#353535] bg-[#232323] p-3 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Song Context</h3>
          <p className="text-[11px] text-zinc-400">Keep prompt-like guidance here. Tempo, key, time signature, and bar count now live in the top toolbar.</p>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase text-zinc-400">Global Song Description</label>
          <textarea
            value={globalCaption}
            onChange={(event) => setGlobalCaption(event.target.value)}
            rows={3}
            placeholder="Describe the overall song style, mood, and genre..."
            className="w-full resize-none rounded border border-[#444] bg-[#2a2a2a] px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
          />
          <p className="mt-2 text-[10px] text-zinc-500">
            Use this as project-wide generation guidance when you want every new prompt to inherit the same mood or instrumentation.
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-[#353535] bg-[#232323] p-3 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Generation Defaults</h3>
          <p className="text-[11px] text-zinc-400">These defaults feed new requests before per-generation overrides.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase text-zinc-400">Inference Steps</label>
            <input
              type="number"
              value={steps}
              onChange={(event) => setSteps(parseInt(event.target.value, 10) || 50)}
              min={10}
              max={200}
              className="w-full rounded border border-[#444] bg-[#2a2a2a] px-3 py-1.5 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase text-zinc-400">Guidance Scale</label>
            <input
              type="number"
              value={guidance}
              onChange={(event) => setGuidance(parseFloat(event.target.value) || 7.0)}
              min={1}
              max={20}
              step={0.5}
              className="w-full rounded border border-[#444] bg-[#2a2a2a] px-3 py-1.5 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase text-zinc-400">Shift</label>
            <input
              type="number"
              value={shift}
              onChange={(event) => setShift(parseFloat(event.target.value) || 3.0)}
              min={0}
              max={10}
              step={0.5}
              className="w-full rounded border border-[#444] bg-[#2a2a2a] px-3 py-1.5 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex items-end pb-1">
            <label className={`flex items-center gap-2 ${modelSupportsThinking(model) ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
              <input
                type="checkbox"
                checked={thinking}
                onChange={(event) => setThinking(event.target.checked)}
                disabled={!modelSupportsThinking(model)}
                className="h-4 w-4 rounded border-[#444] bg-[#2a2a2a] accent-indigo-500"
              />
              <span className="text-[11px] uppercase text-zinc-400">Thinking mode</span>
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[#353535] bg-[#232323] p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Playback Latency</h3>
            <p className="text-[11px] text-zinc-400">Keep audio compensation close to generation setup while tuning the project.</p>
          </div>
          <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            {playbackLatency.source === 'manual' ? 'Manual' : playbackLatency.source === 'auto' ? 'Auto' : 'Fallback'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase text-zinc-400">Detected</label>
            <div className="rounded border border-[#444] bg-black/20 px-3 py-1.5 text-sm text-zinc-200 tabular-nums">
              {playbackLatency.detectedLatencyMs !== null ? `${playbackLatency.detectedLatencyMs.toFixed(1)} ms` : 'Unavailable'}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase text-zinc-400" htmlFor="manual-playback-latency-inline">
              Manual Override
            </label>
            <input
              id="manual-playback-latency-inline"
              aria-label="Manual playback latency"
              type="number"
              value={manualLatencyText}
              onChange={(event) => setManualLatencyText(event.target.value)}
              min={0}
              max={500}
              step={0.1}
              placeholder="Use detected value"
              className="w-full rounded border border-[#444] bg-[#2a2a2a] px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <p className="text-[10px] text-zinc-400 tabular-nums">Active compensation: {playbackLatency.compensationMs.toFixed(1)} ms</p>
        {hasPendingManualOverride ? (
          <p className="text-[10px] text-zinc-500 tabular-nums">Pending manual override after save: {pendingManualOverrideMs?.toFixed(1)} ms</p>
        ) : null}
      </section>

      {saveMessage && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
          {saveMessage}
        </div>
      )}

      <div className="sticky bottom-0 -mx-3 border-t border-[#333] bg-[#1e1e1e]/95 px-3 pb-3 pt-3 backdrop-blur">
        <div className="flex justify-center">
          <Button variant="primary" size="md" onClick={handleSave}>
            Apply Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
