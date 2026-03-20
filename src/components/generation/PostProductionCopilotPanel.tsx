import { useMemo } from 'react';
import { usePostProductionStore } from '../../store/postProductionStore';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import {
  buildPostProductionTask,
  runNextPostProductionStep,
  runPostProductionTask,
} from '../../services/postProductionOrchestrator';
import type { LoudnessTarget, MasteringPreset } from '../../types/project';
import type { PostProductionTaskType } from '../../types/postProduction';
import { MasteringPanel } from '../mixer/MasteringPanel';

const TASKS: Array<{ id: PostProductionTaskType; title: string; blurb: string }> = [
  { id: 'repair', title: 'Repair', blurb: 'Keep the good 95% and regenerate only the broken section.' },
  { id: 'extend', title: 'Extend', blurb: 'Continue the song or add a new layer from the current context.' },
  { id: 'polish', title: 'Polish', blurb: 'Analyze, master, and push the song closer to delivery quality.' },
];

const PRESETS: MasteringPreset[] = ['balanced', 'loud', 'warm', 'bright'];
const TARGETS: LoudnessTarget[] = [-14, -11, -8];

function formatSeconds(value: number | null | undefined) {
  if (typeof value !== 'number') return '--';
  return `${value.toFixed(2)}s`;
}

export function PostProductionCopilotPanel() {
  const project = useProjectStore((s) => s.project);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const selectedTrackIds = useUIStore((s) => s.selectedTrackIds);
  const contextWindow = useUIStore((s) => s.contextWindow);
  const selectWindow = useUIStore((s) => s.selectWindow);
  const isOpen = usePostProductionStore((s) => s.isOpen);
  const step = usePostProductionStore((s) => s.step);
  const task = usePostProductionStore((s) => s.task);
  const close = usePostProductionStore((s) => s.close);
  const setStep = usePostProductionStore((s) => s.setStep);
  const setTaskType = usePostProductionStore((s) => s.setTaskType);
  const replaceTask = usePostProductionStore((s) => s.replaceTask);
  const updateTaskInput = usePostProductionStore((s) => s.updateTaskInput);

  const trackOptions = project?.tracks ?? [];
  const selectedClipId = task.targetClipIds[0] ?? [...selectedClipIds][0] ?? null;
  const selectedClip = selectedClipId ? useProjectStore.getState().getClipById(selectedClipId) : null;
  const taskSummary = useMemo(() => ({
    clipCount: task.targetClipIds.length,
    trackCount: task.targetTrackIds.length,
    timeRange: task.timeRange,
  }), [task.targetClipIds.length, task.targetTrackIds.length, task.timeRange]);

  if (!project || !isOpen) return null;

  return (
    <div className="fixed inset-0 z-[160] bg-black/55 backdrop-blur-sm">
      <div className="absolute inset-y-4 right-4 w-[430px] rounded-2xl border border-[#3a3a3a] bg-[#171717] shadow-2xl flex flex-col overflow-hidden">
        <div className="border-b border-[#2f2f2f] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-400">AI Post-Production Copilot</div>
              <div className="mt-1 text-sm font-semibold text-white">Repair, extend, and polish one song in one place</div>
            </div>
            <button
              onClick={close}
              aria-label="Close post-production copilot"
              className="rounded-md px-2 py-1 text-zinc-400 transition-colors hover:bg-[#252525] hover:text-zinc-100"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1 text-[10px]">
            {[
              { id: 1, label: 'Task' },
              { id: 2, label: 'Target' },
              { id: 3, label: 'Setup' },
              { id: 4, label: 'Run' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setStep(item.id as 1 | 2 | 3 | 4)}
                className={`rounded-md px-2 py-1.5 transition-colors ${
                  step === item.id
                    ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-400/40'
                    : 'bg-[#202020] text-zinc-400 border border-transparent hover:text-zinc-200'
                }`}
              >
                {item.id}. {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-xs text-zinc-300">
          {step === 1 && (
            <div className="space-y-3">
              {TASKS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTaskType(item.id);
                    replaceTask(buildPostProductionTask(item.id));
                    setStep(2);
                  }}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                    task.taskType === item.id
                      ? 'border-cyan-400/50 bg-cyan-500/10'
                      : 'border-[#333] bg-[#202020] hover:border-[#4a4a4a]'
                  }`}
                >
                  <div className="text-sm font-semibold text-white">{item.title}</div>
                  <div className="mt-1 text-[11px] text-zinc-400">{item.blurb}</div>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="rounded-xl border border-[#333] bg-[#202020] p-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Current defaults</div>
                <div className="mt-2 space-y-1.5 text-[11px]">
                  <div>Selected clips: {selectedClipIds.size}</div>
                  <div>Selected tracks: {selectedTrackIds.size}</div>
                  <div>Select window: {selectWindow ? `${formatSeconds(selectWindow.startTime)} - ${formatSeconds(selectWindow.endTime)}` : 'None'}</div>
                  <div>Context window: {contextWindow ? `${formatSeconds(contextWindow.startTime)} - ${formatSeconds(contextWindow.endTime)}` : 'None'}</div>
                </div>
              </div>

              <div className="rounded-xl border border-[#333] bg-[#202020] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Task target</div>
                    <div className="mt-1 text-sm font-semibold text-white capitalize">{task.taskType}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => replaceTask(buildPostProductionTask(task.taskType))}
                    className="rounded-md border border-[#444] bg-[#252525] px-2 py-1 text-[10px] text-zinc-200 hover:bg-[#2d2d2d]"
                  >
                    Refresh defaults
                  </button>
                </div>
                <div className="mt-3 space-y-1.5 text-[11px] text-zinc-400">
                  <div>Target clips: {taskSummary.clipCount || 'None'}</div>
                  <div>Target tracks: {taskSummary.trackCount || 'None'}</div>
                  <div>
                    Time range: {taskSummary.timeRange
                      ? `${formatSeconds(taskSummary.timeRange.startTime)} - ${formatSeconds(taskSummary.timeRange.endTime)}`
                      : 'None'}
                  </div>
                  {task.taskType === 'repair' && selectedClip && (
                    <div>Repair clip: {selectedClip.prompt || selectedClip.id}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {task.taskType === 'extend' && (
                <div className="rounded-xl border border-[#333] bg-[#202020] p-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Target tracks</div>
                  <div className="mt-2 space-y-2">
                    {trackOptions.map((track) => {
                      const checked = task.targetTrackIds.includes(track.id);
                      return (
                        <label key={track.id} className="flex items-center gap-2 text-[11px]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const nextIds = event.target.checked
                                ? [...task.targetTrackIds, track.id]
                                : task.targetTrackIds.filter((id) => id !== track.id);
                              updateTaskInput({ targetTrackIds: nextIds });
                            }}
                          />
                          <span>{track.displayName}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {(task.taskType === 'repair' || task.taskType === 'extend') && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Start</span>
                    <input
                      type="number"
                      value={task.timeRange?.startTime ?? 0}
                      onChange={(event) => updateTaskInput({
                        timeRange: {
                          startTime: Number(event.target.value),
                          endTime: task.timeRange?.endTime ?? Number(event.target.value),
                        },
                      })}
                      className="w-full rounded-lg border border-[#3b3b3b] bg-[#141414] px-2 py-2 text-zinc-100"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">End</span>
                    <input
                      type="number"
                      value={task.timeRange?.endTime ?? 0}
                      onChange={(event) => updateTaskInput({
                        timeRange: {
                          startTime: task.timeRange?.startTime ?? 0,
                          endTime: Number(event.target.value),
                        },
                      })}
                      className="w-full rounded-lg border border-[#3b3b3b] bg-[#141414] px-2 py-2 text-zinc-100"
                    />
                  </label>
                </div>
              )}

              {(task.taskType === 'repair' || task.taskType === 'extend') && (
                <>
                  <label className="block space-y-1">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Prompt</span>
                    <textarea
                      value={task.prompt}
                      rows={4}
                      onChange={(event) => updateTaskInput({ prompt: event.target.value })}
                      className="w-full rounded-xl border border-[#3b3b3b] bg-[#141414] px-3 py-2 text-zinc-100"
                      placeholder={task.taskType === 'repair' ? 'Describe the section you want repaired...' : 'Describe what should be continued or added...'}
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Global caption</span>
                    <textarea
                      value={task.globalCaption}
                      rows={3}
                      onChange={(event) => updateTaskInput({ globalCaption: event.target.value })}
                      className="w-full rounded-xl border border-[#3b3b3b] bg-[#141414] px-3 py-2 text-zinc-100"
                      placeholder="Song-level description for the whole track..."
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Lyrics override</span>
                    <textarea
                      value={task.lyricsOverride}
                      rows={3}
                      onChange={(event) => updateTaskInput({ lyricsOverride: event.target.value })}
                      className="w-full rounded-xl border border-[#3b3b3b] bg-[#141414] px-3 py-2 text-zinc-100"
                      placeholder="Optional lyric guidance for the repaired or extended section..."
                    />
                  </label>
                </>
              )}

              {task.taskType === 'extend' && (
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Context mode</span>
                  <select
                    value={task.contextMode}
                    onChange={(event) => updateTaskInput({ contextMode: event.target.value as typeof task.contextMode })}
                    className="w-full rounded-lg border border-[#3b3b3b] bg-[#141414] px-2 py-2 text-zinc-100"
                  >
                    <option value="auto">Auto</option>
                    <option value="context">Use context window</option>
                    <option value="selection">Selection only</option>
                    <option value="none">From silence</option>
                  </select>
                </label>
              )}

              {task.taskType === 'polish' && (
                <>
                  <div className="rounded-xl border border-[#333] bg-[#202020] p-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Preset</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => updateTaskInput({ masteringPreset: preset })}
                          className={`rounded-lg border px-3 py-2 text-left capitalize transition-colors ${
                            task.masteringPreset === preset
                              ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100'
                              : 'border-[#3b3b3b] bg-[#141414] hover:border-[#505050]'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#333] bg-[#202020] p-3">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Loudness target</div>
                    <div className="mt-2 flex gap-2">
                      {TARGETS.map((target) => (
                        <button
                          key={target}
                          type="button"
                          onClick={() => updateTaskInput({ loudnessTarget: target })}
                          className={`flex-1 rounded-lg border px-3 py-2 font-mono transition-colors ${
                            task.loudnessTarget === target
                              ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100'
                              : 'border-[#3b3b3b] bg-[#141414] hover:border-[#505050]'
                          }`}
                        >
                          {target}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#333] bg-[#202020] p-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Task status</div>
                <div className="mt-2 text-sm font-semibold text-white capitalize">{task.status}</div>
                {task.lastError && (
                  <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-100">
                    <div className="font-semibold">{task.lastError.message}</div>
                    <div className="mt-1 text-red-200/80">{task.lastError.recoverySuggestions.join(' ')}</div>
                  </div>
                )}
                {task.lastResult && (
                  <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-100">
                    <div className="font-semibold">{task.lastResult.summary}</div>
                    <div className="mt-1">
                      Suggested next step: {task.lastResult.nextSuggestedTaskType ?? 'None'}
                    </div>
                  </div>
                )}
                {task.status === 'running' && (
                  <div className="mt-3 text-[11px] text-cyan-300">The copilot is executing the current task...</div>
                )}
              </div>

              {task.taskType === 'polish' && <MasteringPanel />}
            </div>
          )}
        </div>

        <div className="border-t border-[#2f2f2f] px-4 py-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setStep(step > 1 ? ((step - 1) as 1 | 2 | 3 | 4) : 1)}
            disabled={step === 1}
            className="rounded-lg border border-[#3b3b3b] bg-[#202020] px-3 py-2 text-[11px] text-zinc-200 disabled:opacity-40"
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            {step < 4 && (
              <button
                type="button"
                onClick={() => setStep((Math.min(4, step + 1)) as 1 | 2 | 3 | 4)}
                className="rounded-lg border border-[#3b3b3b] bg-[#202020] px-3 py-2 text-[11px] text-zinc-200"
              >
                Next
              </button>
            )}
            {step === 4 && task.lastResult?.nextSuggestedTaskType && (
              <button
                type="button"
                onClick={() => {
                  runNextPostProductionStep();
                }}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-[11px] text-emerald-100"
              >
                Open Next Step
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (step !== 4) setStep(4);
                void runPostProductionTask();
              }}
              disabled={task.status === 'running'}
              className="rounded-lg bg-cyan-600 px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              {task.status === 'running' ? 'Running...' : step === 4 ? 'Run Again' : 'Run Task'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
