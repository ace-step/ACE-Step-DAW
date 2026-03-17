import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import type { Track } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransportStore } from '../../store/transportStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { getSample, cacheUserSample } from '../../services/sampleManager';
import { DEFAULT_DRUM_KIT } from '../../constants/tracks';

const STEP_H = 24;
const ROW_LABEL_W = 90;
const VELOCITY_LANE_H = 44;
const TOOLBAR_H = 28;
const MIN_STEP_W = 14;

interface SequencerGridProps {
  track: Track;
  height: number;
}

export function SequencerGrid({ track, height }: SequencerGridProps) {
  const pattern = track.sequencerPattern;
  const project = useProjectStore((s) => s.project);
  const toggleStep = useProjectStore((s) => s.toggleSequencerStep);
  const setStepVelocity = useProjectStore((s) => s.setSequencerStepVelocity);
  const toggleRowMute = useProjectStore((s) => s.toggleSequencerRowMute);
  const setRowVolume = useProjectStore((s) => s.setSequencerRowVolume);
  const removeRow = useProjectStore((s) => s.removeSequencerRow);
  const clearRow = useProjectStore((s) => s.clearSequencerRow);
  const updateSwing = useProjectStore((s) => s.updateSequencerSwing);
  const setStepsPerBar = useProjectStore((s) => s.setSequencerStepsPerBar);
  const setBars = useProjectStore((s) => s.setSequencerBars);
  const addRow = useProjectStore((s) => s.addSequencerRow);
  const setRowSample = useProjectStore((s) => s.setSequencerRowSample);
  const initPattern = useProjectStore((s) => s.initSequencerPattern);

  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const currentTime = useTransportStore((s) => s.currentTime);

  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [samplePickerRow, setSamplePickerRow] = useState<string | null>(null);
  const [rowCtxMenu, setRowCtxMenu] = useState<{ rowId: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!pattern) initPattern(track.id);
  }, [pattern, track.id, initPattern]);

  if (!pattern || !project) return null;

  const bpm = project.bpm;
  const totalSteps = pattern.stepsPerBar * pattern.bars;
  const stepDuration = (60 / bpm) / (pattern.stepsPerBar / 4);
  const patternDuration = stepDuration * totalSteps;

  // Compute step width from BPM and zoom so it aligns with the timeline grid
  const stepW = Math.max(MIN_STEP_W, stepDuration * pixelsPerSecond);
  const patternWidthPx = totalSteps * stepW;
  const totalTimelineWidth = project.totalDuration * pixelsPerSecond;

  // How many times the pattern tiles across the timeline
  const tileCount = patternDuration > 0
    ? Math.ceil(totalTimelineWidth / patternWidthPx)
    : 1;

  // Current step highlight during playback
  const currentStep = isPlaying && patternDuration > 0
    ? Math.floor((currentTime % patternDuration) / stepDuration)
    : -1;

  const previewSample = useCallback(async (sampleKey: string, velocity: number) => {
    const engine = getAudioEngine();
    await engine.resume();
    const buf = await getSample(engine.ctx, sampleKey);
    if (!buf) return;
    const source = engine.ctx.createBufferSource();
    source.buffer = buf;
    const gain = engine.ctx.createGain();
    gain.gain.value = velocity;
    source.connect(gain);
    gain.connect(engine.ctx.destination);
    source.start();
  }, []);

  const handleStepClick = useCallback((rowId: string, stepIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toggleStep(track.id, rowId, stepIdx);

    const row = pattern?.rows.find((r) => r.id === rowId);
    if (row) {
      const step = row.steps[stepIdx];
      if (!step?.active) {
        previewSample(row.sampleKey, step?.velocity ?? 0.8);
      }
    }
  }, [track.id, toggleStep, pattern, previewSample]);

  const handleVelocityMouseDown = useCallback((rowId: string, stepIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const row = pattern?.rows.find((r) => r.id === rowId);
    const startVel = row?.steps[stepIdx]?.velocity ?? 0.8;
    const onMove = (ev: MouseEvent) => {
      const dy = startY - ev.clientY;
      const newVel = Math.max(0.05, Math.min(1, startVel + dy * 0.005));
      setStepVelocity(track.id, rowId, stepIdx, newVel);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [track.id, setStepVelocity, pattern]);

  const handleFileDrop = useCallback(async (rowId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('audio/')) return;
    const engine = getAudioEngine();
    await engine.resume();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await engine.ctx.decodeAudioData(arrayBuffer);
    const key = `user-sample-${Date.now()}-${file.name}`;
    cacheUserSample(key, audioBuffer);
    setRowSample(track.id, rowId, key);
  }, [track.id, setRowSample]);

  const handleRowContextMenu = useCallback((rowId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRowCtxMenu({ rowId, x: e.clientX, y: e.clientY });
  }, []);

  const availableSamples = useMemo(() => DEFAULT_DRUM_KIT, []);

  const gridRowsHeight = pattern.rows.length * STEP_H;
  const showVelocity = selectedRow !== null;

  return (
    <div
      className="flex flex-col select-none"
      data-sequencer-grid
      style={{ width: totalTimelineWidth, height, minHeight: height }}
      onMouseDownCapture={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {/* Toolbar — sticky to the left edge via position:sticky */}
      <div
        className="flex items-center gap-2 px-2 bg-zinc-900/90 border-b border-zinc-700/50 text-[10px] shrink-0 sticky left-0 z-20 backdrop-blur-sm"
        style={{ height: TOOLBAR_H }}
      >
        <span className="text-emerald-400 font-bold text-[11px]">SEQ</span>
        <div className="flex items-center gap-1">
          <span className="text-zinc-500">Steps:</span>
          <select
            value={pattern.stepsPerBar}
            onChange={(e) => setStepsPerBar(track.id, Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-300 text-[10px]"
          >
            <option value={8}>8</option>
            <option value={16}>16</option>
            <option value={32}>32</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-zinc-500">Bars:</span>
          <select
            value={pattern.bars}
            onChange={(e) => setBars(track.id, Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-zinc-300 text-[10px]"
          >
            {[1, 2, 4, 8].map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-zinc-500">Swing:</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(pattern.swing * 100)}
            onChange={(e) => updateSwing(track.id, Number(e.target.value) / 100)}
            className="w-14 h-1"
          />
          <span className="text-zinc-400 w-6 text-right">{Math.round(pattern.swing * 100)}%</span>
        </div>
        <button
          onClick={() => {
            const next = availableSamples[pattern.rows.length % availableSamples.length];
            addRow(track.id, next.id, next.name, next.color);
          }}
          className="ml-auto px-2 py-0.5 bg-emerald-700/40 hover:bg-emerald-700/60 text-emerald-300 rounded text-[10px] transition-colors"
        >
          + Row
        </button>
      </div>

      {/* Grid body — scrolls with the timeline horizontally */}
      <div className="flex-1 overflow-hidden relative" style={{ minHeight: 0 }}>
        <div className="flex" style={{ width: totalTimelineWidth }}>
          {/* Row labels — sticky to left */}
          <div className="sticky left-0 z-10 bg-zinc-900/95 shrink-0" style={{ width: ROW_LABEL_W }}>
            {pattern.rows.map((row) => (
              <div
                key={row.id}
                className={`flex items-center border-b border-zinc-800/50 cursor-pointer ${
                  selectedRow === row.id ? 'bg-zinc-800/50' : 'hover:bg-zinc-800/20'
                }`}
                style={{ height: STEP_H }}
                onClick={() => setSelectedRow(row.id === selectedRow ? null : row.id)}
                onContextMenu={(e) => handleRowContextMenu(row.id, e)}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                onDrop={(e) => handleFileDrop(row.id, e)}
              >
                <div className="w-1 h-full shrink-0" style={{ backgroundColor: row.color }} />
                <button
                  className="flex-1 text-left text-[10px] text-zinc-300 truncate px-1.5 hover:text-white transition-colors"
                  title={`${row.name} — click to change, drag audio to replace`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSamplePickerRow(samplePickerRow === row.id ? null : row.id);
                  }}
                >
                  {row.name}
                </button>
                <button
                  className={`w-5 h-4 text-[8px] font-bold rounded mr-0.5 transition-colors ${
                    row.muted ? 'bg-amber-600 text-white' : 'bg-zinc-800 text-zinc-600 hover:text-zinc-400'
                  }`}
                  onClick={(e) => { e.stopPropagation(); toggleRowMute(track.id, row.id); }}
                  title={row.muted ? 'Unmute' : 'Mute'}
                >
                  M
                </button>
                <div
                  className="w-6 h-3 bg-zinc-800 rounded-sm mr-1 cursor-ew-resize overflow-hidden"
                  title={`Vol: ${Math.round(row.volume * 100)}%`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const update = (ev: MouseEvent) => {
                      const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                      setRowVolume(track.id, row.id, pct);
                    };
                    update(e.nativeEvent);
                    const onUp = () => {
                      window.removeEventListener('mousemove', update);
                      window.removeEventListener('mouseup', onUp);
                    };
                    window.addEventListener('mousemove', update);
                    window.addEventListener('mouseup', onUp);
                  }}
                >
                  <div
                    className="h-full rounded-sm"
                    style={{ width: `${row.volume * 100}%`, backgroundColor: row.color + '80' }}
                  />
                </div>
              </div>
            ))}

            {samplePickerRow && (
              <SamplePickerDropdown
                currentKey={pattern.rows.find((r) => r.id === samplePickerRow)?.sampleKey ?? ''}
                onSelect={(key, name) => {
                  setRowSample(track.id, samplePickerRow, key);
                  const state = useProjectStore.getState();
                  if (state.project) {
                    const updatedTracks = state.project.tracks.map((t) => {
                      if (t.id !== track.id || !t.sequencerPattern) return t;
                      return {
                        ...t,
                        sequencerPattern: {
                          ...t.sequencerPattern,
                          rows: t.sequencerPattern.rows.map((r) =>
                            r.id === samplePickerRow ? { ...r, name } : r,
                          ),
                        },
                      };
                    });
                    useProjectStore.setState({
                      project: { ...state.project, tracks: updatedTracks, updatedAt: Date.now() },
                    });
                  }
                  setSamplePickerRow(null);
                }}
                onClose={() => setSamplePickerRow(null)}
                onPreview={(key) => previewSample(key, 0.8)}
              />
            )}
          </div>

          {/* Step grid — tiled across the full timeline width */}
          <div className="relative" style={{ width: totalTimelineWidth - ROW_LABEL_W }}>
            {pattern.rows.map((row) => (
              <div key={row.id} className="flex border-b border-zinc-800/30" style={{ height: STEP_H }}>
                {Array.from({ length: tileCount }).map((_, tileIdx) => (
                  <div key={tileIdx} className="flex shrink-0" style={{ width: patternWidthPx }}>
                    {row.steps.map((step, idx) => {
                      const isBeatStart = idx % (pattern.stepsPerBar / 4) === 0;
                      const isBarStart = idx % pattern.stepsPerBar === 0 && idx > 0;
                      const isCurrent = idx === currentStep && isPlaying;
                      return (
                        <div
                          key={idx}
                          className={`relative shrink-0 cursor-pointer ${
                            isBarStart
                              ? 'border-l border-l-zinc-500/50'
                              : isBeatStart
                                ? 'border-l border-l-zinc-700/40'
                                : 'border-l border-l-zinc-800/20'
                          } ${isCurrent ? 'ring-1 ring-inset ring-white/25' : ''}`}
                          style={{
                            width: stepW,
                            height: STEP_H,
                            backgroundColor: step.active
                              ? `${row.color}${Math.round(step.velocity * 180 + 55).toString(16).padStart(2, '0')}`
                              : isCurrent ? 'rgba(255,255,255,0.04)' : undefined,
                          }}
                          onClick={(e) => handleStepClick(row.id, idx, e)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleVelocityMouseDown(row.id, idx, e);
                          }}
                        >
                          {step.active && (
                            <div
                              className="absolute bottom-0 left-0 right-0 pointer-events-none"
                              style={{
                                height: `${step.velocity * 100}%`,
                                backgroundColor: row.color,
                                opacity: 0.25,
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Pattern tile separator lines */}
                {tileCount > 1 && Array.from({ length: tileCount - 1 }).map((_, i) => (
                  <div
                    key={`sep-${i}`}
                    className="absolute top-0 bottom-0 w-px bg-emerald-500/30 pointer-events-none"
                    style={{ left: (i + 1) * patternWidthPx }}
                  />
                ))}
              </div>
            ))}

            {/* Playhead overlay */}
            {isPlaying && currentStep >= 0 && (() => {
              const playheadX = currentTime * pixelsPerSecond - ROW_LABEL_W;
              if (playheadX < 0) return null;
              return (
                <div
                  className="absolute top-0 w-0.5 bg-white/40 pointer-events-none z-20"
                  style={{
                    left: playheadX,
                    height: gridRowsHeight,
                  }}
                />
              );
            })()}
          </div>
        </div>
      </div>

      {/* Velocity lane for selected row */}
      {showVelocity && selectedRow && (
        <VelocityLane
          track={track}
          rowId={selectedRow}
          pattern={pattern}
          stepW={stepW}
          patternWidthPx={patternWidthPx}
          tileCount={tileCount}
          totalTimelineWidth={totalTimelineWidth}
          currentStep={currentStep}
          isPlaying={isPlaying}
          onVelocityChange={(stepIdx, vel) => setStepVelocity(track.id, selectedRow, stepIdx, vel)}
        />
      )}

      {/* Row context menu */}
      {rowCtxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRowCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setRowCtxMenu(null); }} />
          <div
            className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded shadow-xl py-1 min-w-[140px]"
            style={{ left: Math.min(rowCtxMenu.x, window.innerWidth - 160), top: Math.min(rowCtxMenu.y, window.innerHeight - 100) }}
          >
            <button
              onClick={() => { clearRow(track.id, rowCtxMenu.rowId); setRowCtxMenu(null); }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Clear Steps
            </button>
            <button
              onClick={() => { previewSample(pattern.rows.find(r => r.id === rowCtxMenu.rowId)?.sampleKey ?? '', 0.8); }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Preview Sound
            </button>
            <div className="my-0.5 border-t border-zinc-800" />
            <button
              onClick={() => { removeRow(track.id, rowCtxMenu.rowId); setRowCtxMenu(null); if (selectedRow === rowCtxMenu.rowId) setSelectedRow(null); }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-900/30 transition-colors"
            >
              Delete Row
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Velocity Lane ──────────────────────────────────────────────────── */

interface VelocityLaneProps {
  track: Track;
  rowId: string;
  pattern: NonNullable<Track['sequencerPattern']>;
  stepW: number;
  patternWidthPx: number;
  tileCount: number;
  totalTimelineWidth: number;
  currentStep: number;
  isPlaying: boolean;
  onVelocityChange: (stepIdx: number, velocity: number) => void;
}

function VelocityLane({
  rowId, pattern, stepW, patternWidthPx, tileCount, totalTimelineWidth,
  currentStep, isPlaying, onVelocityChange,
}: VelocityLaneProps) {
  const row = pattern.rows.find((r) => r.id === rowId);
  if (!row) return null;

  return (
    <div className="flex shrink-0 border-t border-zinc-700/50 bg-zinc-900/60" style={{ height: VELOCITY_LANE_H }}>
      <div
        className="shrink-0 flex items-center px-2 text-[9px] text-zinc-500 font-medium sticky left-0 z-10 bg-zinc-900/95"
        style={{ width: ROW_LABEL_W }}
      >
        VEL — {row.name}
      </div>
      <div className="flex items-end" style={{ width: totalTimelineWidth - ROW_LABEL_W }}>
        {Array.from({ length: tileCount }).map((_, tileIdx) => (
          <div key={tileIdx} className="flex items-end shrink-0" style={{ width: patternWidthPx }}>
            {row.steps.map((step, idx) => {
              const isCurrent = idx === currentStep && isPlaying;
              return (
                <div
                  key={idx}
                  className={`shrink-0 flex items-end justify-center cursor-ns-resize ${
                    isCurrent ? 'bg-white/5' : ''
                  }`}
                  style={{ width: stepW, height: VELOCITY_LANE_H }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const update = (ev: MouseEvent) => {
                      const pct = 1 - Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
                      onVelocityChange(idx, Math.max(0.05, pct));
                    };
                    update(e.nativeEvent);
                    const onUp = () => {
                      window.removeEventListener('mousemove', update);
                      window.removeEventListener('mouseup', onUp);
                    };
                    window.addEventListener('mousemove', update);
                    window.addEventListener('mouseup', onUp);
                  }}
                >
                  {step.active && (
                    <div
                      className="rounded-t-sm"
                      style={{
                        width: Math.max(4, stepW * 0.5),
                        height: `${step.velocity * 100}%`,
                        backgroundColor: row.color,
                        opacity: 0.8,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Sample Picker Dropdown ─────────────────────────────────────────── */

interface SamplePickerDropdownProps {
  currentKey: string;
  onSelect: (key: string, name: string) => void;
  onClose: () => void;
  onPreview: (key: string) => void;
}

function SamplePickerDropdown({ currentKey, onSelect, onClose, onPreview }: SamplePickerDropdownProps) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 z-50 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 w-44">
        <div className="px-2 py-1 text-[9px] text-zinc-500 font-medium uppercase">Built-in Samples</div>
        {DEFAULT_DRUM_KIT.map((kit) => (
          <button
            key={kit.id}
            className={`w-full flex items-center gap-2 px-2 py-1.5 text-[10px] hover:bg-zinc-800 transition-colors text-left ${
              currentKey === kit.id ? 'text-emerald-400' : 'text-zinc-300'
            }`}
            onClick={() => onSelect(kit.id, kit.name)}
            onMouseEnter={() => onPreview(kit.id)}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: kit.color }} />
            <span>{kit.name}</span>
            {currentKey === kit.id && <span className="ml-auto text-emerald-400">✓</span>}
          </button>
        ))}
      </div>
    </>
  );
}
