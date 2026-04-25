import { useState, useEffect, useRef, useCallback } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useModelStore } from '../../store/modelStore';
import { listModels, initModel, getBackendUrl, setBackendUrl } from '../../services/aceStepApi';
import { DEFAULT_GENERATION, DEFAULT_MEASURES } from '../../constants/defaults';
import { Button } from '../ui/Button';
import { MpeSettingsPanel } from '../midi/MpeSettingsPanel';
import { normalizePlaybackLatencySettings, latencyMsToSamples } from '../../utils/playbackLatency';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import type { ModelEntry, LmModelEntry } from '../../types/api';
import { THEME_LIST } from '../../themes';
import type { ThemeId } from '../../themes';

function ThemeSelector() {
  const currentTheme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <div className="flex gap-2">
      {THEME_LIST.map((theme) => {
        const isActive = currentTheme === theme.id;
        return (
          <button
            key={theme.id}
            onClick={() => setTheme(theme.id as ThemeId)}
            className={`flex flex-col items-center gap-1 p-1.5 rounded transition-colors ${
              isActive
                ? 'ring-1 ring-daw-accent bg-daw-hover'
                : 'hover:bg-daw-hover-subtle'
            }`}
            title={theme.description}
          >
            <div
              className="w-14 h-9 rounded border border-daw-border overflow-hidden flex flex-col"
              style={{ backgroundColor: theme.tokens['daw-bg'] }}
            >
              <div className="flex-1 flex items-end p-1 gap-0.5">
                <div
                  className="w-2 h-3 rounded-sm"
                  style={{ backgroundColor: theme.tokens['daw-surface-2'] }}
                />
                <div
                  className="w-2 h-4 rounded-sm"
                  style={{ backgroundColor: theme.tokens['daw-accent'] }}
                />
                <div
                  className="w-2 h-2 rounded-sm"
                  style={{ backgroundColor: theme.tokens['daw-surface-2'] }}
                />
              </div>
              <div
                className="h-1"
                style={{ backgroundColor: theme.tokens['daw-accent'] }}
              />
            </div>
            <span className="text-[9px] text-zinc-400 whitespace-nowrap">
              {theme.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SettingsDialog() {
  const show = useUIStore((s) => s.showSettingsDialog);
  const setShow = useUIStore((s) => s.setShowSettingsDialog);
  const project = useProjectStore((s) => s.project);

  const [bpm, setBpm] = useState(120);
  const [bpmText, setBpmText] = useState('120');
  const tapTimesRef = useRef<number[]>([]);
  const tapResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTapTempo = useCallback(() => {
    void getAudioEngine().previewMetronomeClick();
    const now = Date.now();
    const taps = tapTimesRef.current;

    // Reset if last tap was more than 3 seconds ago
    if (taps.length > 0 && now - taps[taps.length - 1] > 3000) {
      tapTimesRef.current = [];
    }

    tapTimesRef.current = [...tapTimesRef.current, now];

    // Clear auto-reset timer
    if (tapResetRef.current) clearTimeout(tapResetRef.current);
    tapResetRef.current = setTimeout(() => { tapTimesRef.current = []; }, 3000);

    // Need at least 2 taps to calculate
    if (tapTimesRef.current.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < tapTimesRef.current.length; i++) {
        intervals.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / avgInterval);
      const clamped = Math.min(300, Math.max(40, calculatedBpm));
      setBpm(clamped);
      setBpmText(String(clamped));
    }
  }, []);

  const [keyScale, setKeyScale] = useState('');
  const [timeSignature, setTimeSignature] = useState(4);
  const [measures, setMeasures] = useState(DEFAULT_MEASURES);
  const [globalCaption, setGlobalCaption] = useState('');
  const [manualLatencyText, setManualLatencyText] = useState('');
  const [steps, setSteps] = useState(DEFAULT_GENERATION.inferenceSteps);
  const [guidance, setGuidance] = useState(DEFAULT_GENERATION.guidanceScale);
  const [shift, setShift] = useState(DEFAULT_GENERATION.shift);
  const [text2musicModel, setText2musicModel] = useState('');
  const [legoModel, setLegoModel] = useState('');
  const [backendUrl, setBackendUrlLocal] = useState('');
  const [availableModels, setAvailableModels] = useState<ModelEntry[]>([]);
  const [availableLmModels, setAvailableLmModels] = useState<LmModelEntry[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [initLoadingT2m, setInitLoadingT2m] = useState(false);
  const [initLoadingLego, setInitLoadingLego] = useState(false);
  const [initLoadingLm, setInitLoadingLm] = useState(false);
  const [llmInitialized, setLlmInitialized] = useState(false);
  const settingsDialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(settingsDialogRef, show);
  const [selectedLmModel, setSelectedLmModel] = useState('');
  const [initMessage, setInitMessage] = useState('');
  const [initError, setInitError] = useState('');
  const prevShow = useRef(false);

  const handleText2musicModelChange = (newModel: string) => {
    setText2musicModel(newModel);
  };

  const handleLegoModelChange = (newModel: string) => {
    setLegoModel(newModel);
  };

  /** Refresh model lists from backend. Only sets dropdown values on first load (empty state). */
  const refreshModels = async () => {
    setModelsLoading(true);
    try {
      const resp = await listModels();
      const models = resp?.models ?? [];
      const lmModels = resp?.lm_models ?? [];
      setAvailableModels(models);
      setAvailableLmModels(lmModels);
      setLlmInitialized(Boolean(resp?.llm_initialized));

      // Only resolve dropdown values if they haven't been set yet (first open).
      // After init, the user's current selection is preserved.
      setText2musicModel((prev) => {
        if (prev && models.some((m) => m.name === prev)) return prev;
        const overrides = useModelStore.getState().categoryModelOverrides;
        if (overrides.text2music && models.some((m) => m.name === overrides.text2music)) return overrides.text2music!;
        if (resp?.default_model && models.some((m) => m.name === resp.default_model)) return resp.default_model;
        return models[0]?.name ?? '';
      });

      setLegoModel((prev) => {
        if (prev && models.some((m) => m.name === prev)) return prev;
        const overrides = useModelStore.getState().categoryModelOverrides;
        if (overrides.lego && models.some((m) => m.name === overrides.lego)) return overrides.lego!;
        const legoHit = models.find((m) => m.name.toLowerCase().includes('lego'));
        return legoHit?.name ?? models[0]?.name ?? '';
      });

      setSelectedLmModel((prev) => {
        if (prev && lmModels.some((m) => m.name === prev)) return prev;
        if (resp?.loaded_lm_model) return resp.loaded_lm_model;
        return lmModels[0]?.name ?? '';
      });
    } catch (err) {
      setAvailableModels([]);
      setAvailableLmModels([]);
      setLlmInitialized(false);
      const isNetworkError = err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('network'));
      if (!isNetworkError) {
        setInitError('Failed to load models — check backend connection.');
      } else {
        setInitError('Backend offline — model list unavailable.');
      }
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    if (show && !prevShow.current) {
      const gen = project?.generationDefaults ?? DEFAULT_GENERATION;
      const projectBpm = project?.bpm ?? 120;
      setBpm(projectBpm);
      setBpmText(String(projectBpm));
      setKeyScale(project?.keyScale ?? '');
      setTimeSignature(project?.timeSignature ?? 4);
      setMeasures(project?.measures ?? DEFAULT_MEASURES);
      setGlobalCaption(project?.globalCaption ?? '');
      setManualLatencyText(
        project?.playbackLatency?.manualOverrideMs !== null && project?.playbackLatency?.manualOverrideMs !== undefined
          ? String(project.playbackLatency.manualOverrideMs)
          : '',
      );
      setSteps(gen.inferenceSteps);
      setGuidance(gen.guidanceScale);
      setShift(gen.shift);
      setBackendUrlLocal(getBackendUrl());
      setInitMessage('');
      setInitError('');
      setSelectedLmModel('');
      void refreshModels();
    }
    prevShow.current = show;
  }, [show, project]);

  if (!show) return null;

  const handleSave = () => {
    const store = useProjectStore.getState();
    if (store.project) {
      store.updateProject({ bpm, keyScale, timeSignature, measures, globalCaption });
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
          },
        },
      });
    }
    setBackendUrl(backendUrl);

    // Persist model category overrides so intent routing uses user's choices
    const ms = useModelStore.getState();
    if (text2musicModel) ms.setCategoryModelOverride('text2music', text2musicModel);
    if (legoModel) ms.setCategoryModelOverride('lego', legoModel);

    setShow(false);
  };

  const selectedT2mEntry = availableModels.find((m) => m.name === text2musicModel);
  const selectedLegoEntry = availableModels.find((m) => m.name === legoModel);
  const selectedLmEntry = availableLmModels.find((m) => m.name === selectedLmModel);
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

  const handleInitT2m = async () => {
    if (!text2musicModel) return;
    setInitLoadingT2m(true);
    setInitMessage('');
    setInitError('');
    try {
      const resp = await initModel({ model: text2musicModel });
      setInitMessage(resp.message || `Initialized ${text2musicModel}`);
      await refreshModels();
      await useModelStore.getState().refreshModels();
    } catch (e) {
      setInitError(e instanceof Error ? e.message : 'Failed to initialize model');
    } finally {
      setInitLoadingT2m(false);
    }
  };

  const handleInitLego = async () => {
    if (!legoModel) return;
    setInitLoadingLego(true);
    setInitMessage('');
    setInitError('');
    try {
      const resp = await initModel({ model: legoModel });
      setInitMessage(resp.message || `Initialized ${legoModel}`);
      await refreshModels();
      await useModelStore.getState().refreshModels();
    } catch (e) {
      setInitError(e instanceof Error ? e.message : 'Failed to initialize model');
    } finally {
      setInitLoadingLego(false);
    }
  };

  const handleInitSelectedLm = async () => {
    if (!selectedLmModel) return;
    setInitLoadingLm(true);
    setInitMessage('');
    setInitError('');
    try {
      const resp = await initModel({
        model: text2musicModel || undefined,
        init_llm: true,
        lm_model_path: selectedLmModel,
      });
      setInitMessage(resp.message || `Initialized LLM ${selectedLmModel}`);
      await refreshModels();
      await useModelStore.getState().refreshModels();
    } catch (e) {
      setInitError(e instanceof Error ? e.message : 'Failed to initialize LLM');
    } finally {
      setInitLoadingLm(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title" onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setShow(false); }}>
      <div ref={settingsDialogRef} className="w-[400px] bg-daw-surface rounded-lg border border-daw-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-daw-border">
          <h2 id="settings-dialog-title" className="text-sm font-medium">Settings</h2>
          <button
            onClick={() => setShow(false)}
            className="text-zinc-400 hover:text-zinc-300 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto">
          <h3 className="text-xs font-medium text-zinc-300">Appearance</h3>
          <ThemeSelector />

          <div className="border-t border-daw-border my-3" />
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs text-zinc-400 mb-1">BPM</label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  value={bpmText}
                  onChange={(e) => setBpmText(e.target.value)}
                  onBlur={() => {
                    const parsed = parseInt(bpmText);
                    const valid = isNaN(parsed) ? 120 : Math.min(300, Math.max(30, parsed));
                    setBpm(valid);
                    setBpmText(String(valid));
                  }}
                  min={40}
                  max={300}
                  className="flex-1 min-w-[3.5rem] px-2 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
                />
                <button
                  type="button"
                  onClick={handleTapTempo}
                  className="px-2 py-1.5 text-xs font-medium text-zinc-300 bg-daw-bg border border-daw-border rounded hover:border-daw-accent hover:text-white transition-colors select-none"
                  title="Tap to detect BPM (T)"
                  aria-label="Tap tempo"
                >
                  TAP
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Key</label>
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

          <div className="rounded-md border border-daw-border bg-daw-bg/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-medium text-zinc-300">Playback Latency</h3>
              <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-400">
                {playbackLatency.source === 'manual' ? 'Manual override' : playbackLatency.source === 'auto' ? 'Auto-detected' : 'Fallback'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              {playbackLatency.browserSupport === 'available'
                ? `Detected ${playbackLatency.detectedLatencyMs?.toFixed(1) ?? '0.0'} ms from Web Audio (${playbackLatency.detectedBaseLatencyMs?.toFixed(1) ?? '0.0'} ms base + ${playbackLatency.detectedOutputLatencyMs?.toFixed(1) ?? '0.0'} ms output).`
                : 'Browser latency unavailable. Enter a manual playback compensation value if timing feels late.'}
            </p>
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Detected Latency</label>
                <div className="rounded border border-daw-border bg-black/20 px-3 py-1.5 text-sm text-zinc-200 whitespace-nowrap">
                  {playbackLatency.detectedLatencyMs !== null
                    ? `${playbackLatency.detectedLatencyMs.toFixed(1)} ms (${latencyMsToSamples(playbackLatency.detectedLatencyMs, getAudioEngine().sampleRate)} smp)`
                    : 'Unavailable'}
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1 whitespace-nowrap" htmlFor="manual-playback-latency">
                  Override (ms)
                </label>
                <input
                  id="manual-playback-latency"
                  aria-label="Manual playback latency"
                  type="number"
                  value={manualLatencyText}
                  onChange={(e) => setManualLatencyText(e.target.value)}
                  min={0}
                  max={500}
                  step={0.1}
                  placeholder="Use detected value"
                  className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent placeholder:text-zinc-600"
                />
              </div>
              <button
                type="button"
                data-testid="auto-detect-latency"
                onClick={() => {
                  const engine = getAudioEngine();
                  const latency = engine.refreshPlaybackLatencyCompensation();
                  const store = useProjectStore.getState();
                  store.detectPlaybackLatency(latency);
                  engine.setPlaybackLatencyCompensation(
                    store.project?.playbackLatency?.compensationMs
                      ? store.project.playbackLatency.compensationMs / 1000
                      : 0,
                  );
                }}
                className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-daw-surface-2 border border-daw-border rounded hover:border-daw-accent hover:text-white transition-colors whitespace-nowrap"
                title="Re-measure audio output latency from Web Audio API"
              >
                Re-detect
              </button>
            </div>
             <p className="text-[10px] text-zinc-400">
               Active compensation: {playbackLatency.compensationMs.toFixed(1)} ms ({latencyMsToSamples(playbackLatency.compensationMs, getAudioEngine().sampleRate)} samples @ {getAudioEngine().sampleRate} Hz)
             </p>
             {hasPendingManualOverride ? (
               <p className="text-[10px] text-zinc-400">
                 Pending manual override after save: {pendingManualOverrideMs.toFixed(1)} ms
               </p>
             ) : null}
           </div>

          <div className="border-t border-daw-border my-3" />
          <MpeSettingsPanel />

          <div className="border-t border-daw-border my-3" />
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

          {/* Text2Music Model — used for Full Song (Mix) generation */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Text2Music Model <span className="text-[9px] text-zinc-600">(Full Song)</span></label>
            <select
              value={text2musicModel}
              onChange={(e) => handleText2musicModelChange(e.target.value)}
              disabled={modelsLoading || initLoadingT2m}
              className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
            >
              {availableModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}{m.is_default ? ' (default)' : ''}{m.is_loaded ? ' (loaded)' : ''}
                </option>
              ))}
            </select>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-400">
                {selectedT2mEntry?.is_loaded ? 'Model is loaded' : 'Model is not loaded'}
              </span>
              <button
                type="button"
                onClick={handleInitT2m}
                disabled={initLoadingT2m || !text2musicModel}
                className="px-2.5 py-1 text-[10px] font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {initLoadingT2m ? 'Initializing...' : (selectedT2mEntry?.is_loaded ? 'Reinitialize' : 'Initialize')}
              </button>
            </div>
          </div>

          {/* Lego Model — used for Single Track / Stems generation */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Lego Model <span className="text-[9px] text-zinc-600">(Single Track / Stems)</span></label>
            <select
              value={legoModel}
              onChange={(e) => handleLegoModelChange(e.target.value)}
              disabled={modelsLoading || initLoadingLego}
              className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
            >
              {availableModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}{m.is_loaded ? ' (loaded)' : ''}
                </option>
              ))}
            </select>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-400">
                {selectedLegoEntry?.is_loaded ? 'Model is loaded' : 'Model is not loaded'}
              </span>
              <button
                type="button"
                onClick={handleInitLego}
                disabled={initLoadingLego || !legoModel}
                className="px-2.5 py-1 text-[10px] font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {initLoadingLego ? 'Initializing...' : (selectedLegoEntry?.is_loaded ? 'Reinitialize' : 'Initialize')}
              </button>
            </div>
          </div>

          {/* LM Model — used for Thinking / CoT in text2music */}
          {availableLmModels.length > 0 && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">LM Model <span className="text-[9px] text-zinc-600">(Thinking / CoT)</span></label>
              <select
                value={selectedLmModel}
                onChange={(e) => setSelectedLmModel(e.target.value)}
                disabled={modelsLoading || initLoadingLm}
                className="w-full px-3 py-1.5 text-sm text-zinc-200 bg-daw-bg border border-daw-border rounded focus:outline-none focus:border-daw-accent"
              >
                {availableLmModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}{m.is_loaded ? ' (loaded)' : ''}
                  </option>
                ))}
              </select>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-400">
                  {llmInitialized ? 'LLM initialized' : 'LLM not initialized'}
                </span>
                <button
                  type="button"
                  onClick={handleInitSelectedLm}
                  disabled={initLoadingLm || !selectedLmModel}
                  className="px-2.5 py-1 text-[10px] font-medium bg-daw-surface-2 hover:bg-[#484848] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {initLoadingLm ? 'Initializing...' : (selectedLmEntry?.is_loaded ? 'Reinitialize LLM' : 'Initialize LLM')}
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

        <div className="px-4 pt-3 pb-1 space-y-2">
          <a
            href="https://acestudio.ai/"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full px-3 py-2 rounded bg-gradient-to-r from-violet-900/40 to-indigo-900/40 border border-violet-700/30 hover:border-violet-600/50 transition-colors text-center"
          >
            <span className="text-[11px] text-zinc-400">For the best experience, try </span>
            <span className="text-[11px] font-medium text-violet-300 hover:text-violet-200">ACE Studio →</span>
          </a>
        </div>

        <div className="flex justify-end px-4 py-3 border-t border-daw-border gap-2">
          <Button variant="default" size="md" onClick={() => setShow(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
