import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import type { Track } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransportStore } from '../../store/transportStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { getSample, cacheUserSample } from '../../services/sampleManager';
import { DEFAULT_DRUM_KIT } from '../../constants/tracks';
import { ContextMenuWrapper, ContextMenuItem, ContextMenuSeparator } from '../ui/ContextMenu';

const FL = {
  bg: '#2a2a2a',
  rowBg: '#303030',
  rowBgAlt: '#2d2d2d',
  stepOff: '#3c3c3c',
  beatBg: '#353535',
  border: '#222222',
  borderLight: '#444444',
  barBorder: '#555555',
  text: '#c0c0c0',
  textDim: '#808080',
  accent: '#5a9a3c',
};

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
  const stepW = Math.max(MIN_STEP_W, stepDuration * pixelsPerSecond);
  const patternWidthPx = totalSteps * stepW;
  const totalTimelineWidth = project.totalDuration * pixelsPerSecond;
  const stepsPerBeat = pattern.stepsPerBar / 4;

  const tileCount = patternDuration > 0
    ? Math.ceil(totalTimelineWidth / patternWidthPx)
    : 1;

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
      style={{ width: totalTimelineWidth, height, minHeight: height, background: FL.bg }}
      onMouseDownCapture={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-2 shrink-0 sticky left-0 z-20"
        style={{ height: TOOLBAR_H, background: FL.bg, borderBottom: `1px solid ${FL.border}` }}
      >
        <span style={{ color: FL.accent, fontWeight: 700, fontSize: 11 }}>SEQ</span>
        <div className="flex items-center gap-1" style={{ fontSize: 10 }}>
          <span style={{ color: FL.textDim }}>Steps:</span>
          <select
            value={pattern.stepsPerBar}
            onChange={(e) => setStepsPerBar(track.id, Number(e.target.value))}
            style={{ background: FL.stepOff, border: `1px solid ${FL.borderLight}`, borderRadius: 2, padding: '0 4px', color: FL.text, fontSize: 10 }}
          >
            <option value={8}>8</option>
            <option value={16}>16</option>
            <option value={32}>32</option>
          </select>
        </div>
        <div className="flex items-center gap-1" style={{ fontSize: 10 }}>
          <span style={{ color: FL.textDim }}>Bars:</span>
          <select
            value={pattern.bars}
            onChange={(e) => setBars(track.id, Number(e.target.value))}
            style={{ background: FL.stepOff, border: `1px solid ${FL.borderLight}`, borderRadius: 2, padding: '0 4px', color: FL.text, fontSize: 10 }}
          >
            {[1, 2, 4, 8].map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1" style={{ fontSize: 10 }}>
          <span style={{ color: FL.textDim }}>Swing:</span>
          <input
            type="range" min={0} max={100}
            value={Math.round(pattern.swing * 100)}
            onChange={(e) => updateSwing(track.id, Number(e.target.value) / 100)}
            className="w-14 h-1"
          />
          <span style={{ color: FL.text, width: 24, textAlign: 'right' }}>{Math.round(pattern.swing * 100)}%</span>
        </div>
        <button
          onClick={() => {
            const next = availableSamples[pattern.rows.length % availableSamples.length];
            addRow(track.id, next.id, next.name, next.color);
          }}
          style={{
            marginLeft: 'auto', padding: '1px 8px', borderRadius: 3,
            background: FL.accent + '60', border: 'none', color: FL.accent, fontSize: 10,
            cursor: 'pointer', fontWeight: 600,
          }}
        >
          + Row
        </button>
      </div>

      {/* Grid body */}
      <div className="flex-1 overflow-hidden relative" style={{ minHeight: 0 }}>
        <div className="flex" style={{ width: totalTimelineWidth }}>
          {/* Row labels */}
          <div className="sticky left-0 z-10 shrink-0" style={{ width: ROW_LABEL_W, background: FL.bg }}>
            {pattern.rows.map((row, rowIdx) => (
              <div
                key={row.id}
                className="flex items-center"
                style={{
                  height: STEP_H,
                  background: selectedRow === row.id ? '#3a3a3a' : rowIdx % 2 === 0 ? FL.rowBg : FL.rowBgAlt,
                  borderBottom: `1px solid ${FL.border}`,
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedRow(row.id === selectedRow ? null : row.id)}
                onContextMenu={(e) => handleRowContextMenu(row.id, e)}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                onDrop={(e) => handleFileDrop(row.id, e)}
              >
                <div style={{ width: 2, height: '100%', background: row.color }} className="shrink-0" />
                <button
                  className="flex-1 text-left truncate"
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    fontSize: 10, color: FL.text, padding: '0 4px',
                  }}
                  title={`${row.name} — click to change`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSamplePickerRow(samplePickerRow === row.id ? null : row.id);
                  }}
                >
                  {row.name}
                </button>
                <button
                  style={{
                    width: 16, height: 14, fontSize: 8, fontWeight: 700, borderRadius: 2,
                    marginRight: 2, border: 'none', cursor: 'pointer',
                    background: row.muted ? '#c0392b' : FL.stepOff,
                    color: row.muted ? '#fff' : FL.textDim,
                  }}
                  onClick={(e) => { e.stopPropagation(); toggleRowMute(track.id, row.id); }}
                  title={row.muted ? 'Unmute' : 'Mute'}
                >
                  M
                </button>
                <div
                  style={{
                    width: 20, height: 10, background: FL.stepOff, borderRadius: 2,
                    marginRight: 2, cursor: 'ew-resize', overflow: 'hidden',
                  }}
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
                    style={{ height: '100%', borderRadius: 2, width: `${row.volume * 100}%`, background: row.color + '80' }}
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

          {/* Step grid */}
          <div className="relative" style={{ width: totalTimelineWidth - ROW_LABEL_W }}>
            {pattern.rows.map((row, rowIdx) => (
              <div key={row.id} className="flex" style={{ height: STEP_H, borderBottom: `1px solid ${FL.border}` }}>
                {Array.from({ length: tileCount }).map((_, tileIdx) => (
                  <div key={tileIdx} className="flex shrink-0" style={{ width: patternWidthPx }}>
                    {row.steps.map((step, idx) => {
                      const isBeatStart = idx % stepsPerBeat === 0;
                      const isBarStart = idx % pattern.stepsPerBar === 0 && idx > 0;
                      const isCurrent = idx === currentStep && isPlaying;
                      const beatIdx = Math.floor(idx / stepsPerBeat);
                      const isOddBeat = beatIdx % 2 === 1;
                      return (
                        <div
                          key={idx}
                          className="relative shrink-0"
                          style={{
                            width: stepW,
                            height: STEP_H,
                            borderLeft: isBarStart
                              ? `1px solid ${FL.barBorder}`
                              : isBeatStart
                                ? `1px solid ${FL.borderLight}`
                                : `1px solid ${FL.border}`,
                            background: step.active ? undefined : (isOddBeat ? FL.beatBg : FL.stepOff),
                            cursor: 'pointer',
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
                              style={{
                                position: 'absolute', left: 1, top: 1, right: 1, bottom: 1,
                                borderRadius: 2,
                                background: row.color,
                                opacity: 0.3 + step.velocity * 0.7,
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
                              }}
                            />
                          )}
                          {isCurrent && (
                            <div
                              style={{
                                position: 'absolute', inset: 0,
                                border: '1px solid rgba(255,255,255,0.25)',
                                pointerEvents: 'none',
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {tileCount > 1 && Array.from({ length: tileCount - 1 }).map((_, i) => (
                  <div
                    key={`sep-${i}`}
                    className="absolute top-0 bottom-0 pointer-events-none"
                    style={{ left: (i + 1) * patternWidthPx, width: 1, background: `${FL.accent}40` }}
                  />
                ))}
              </div>
            ))}

            {isPlaying && currentStep >= 0 && (() => {
              const playheadX = currentTime * pixelsPerSecond - ROW_LABEL_W;
              if (playheadX < 0) return null;
              return (
                <div
                  className="absolute top-0 pointer-events-none z-20"
                  style={{
                    left: playheadX, width: 2, height: gridRowsHeight,
                    background: 'rgba(255,255,255,0.4)', borderRadius: 1,
                  }}
                />
              );
            })()}
          </div>
        </div>
      </div>

      {/* Velocity lane */}
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
        <ContextMenuWrapper x={rowCtxMenu.x} y={rowCtxMenu.y} onClose={() => setRowCtxMenu(null)} minWidth={140}>
          <ContextMenuItem
            label="Clear Steps"
            onClick={() => { clearRow(track.id, rowCtxMenu.rowId); setRowCtxMenu(null); }}
          />
          <ContextMenuItem
            label="Preview Sound"
            onClick={() => { previewSample(pattern.rows.find(r => r.id === rowCtxMenu.rowId)?.sampleKey ?? '', 0.8); }}
          />
          <ContextMenuSeparator />
          <ContextMenuItem
            label="Delete Row"
            danger
            onClick={() => { removeRow(track.id, rowCtxMenu.rowId); setRowCtxMenu(null); if (selectedRow === rowCtxMenu.rowId) setSelectedRow(null); }}
          />
        </ContextMenuWrapper>
      )}
    </div>
  );
}

/* ── Velocity Lane ──────────────────────────────────────────────────── */


import { VelocityLane, SamplePickerDropdown } from './SequencerGridHelpers';
