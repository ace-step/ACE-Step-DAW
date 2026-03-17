import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import type { Track } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { getSample, cacheUserSample } from '../../services/sampleManager';
import { ALL_DRUM_SAMPLES } from '../../constants/tracks';
import { bounceSequencerToAudio } from '../../services/sequencerBounce';

const STEP_W = 36;
const STEP_H = 40;
const ROW_LABEL_W = 200;
const VELOCITY_LANE_H = 56;

export function SequencerEditor() {
  const trackId = useUIStore((s) => s.openSequencerTrackId);
  const editorHeight = useUIStore((s) => s.sequencerEditorHeight);
  const setEditorHeight = useUIStore((s) => s.setSequencerEditorHeight);
  const closeEditor = useUIStore((s) => s.setOpenSequencerTrackId);

  const project = useProjectStore((s) => s.project);
  const track = useMemo(
    () => project?.tracks.find((t) => t.id === trackId) ?? null,
    [project, trackId],
  );

  const toggleStep = useProjectStore((s) => s.toggleSequencerStep);
  const setStepVelocity = useProjectStore((s) => s.setSequencerStepVelocity);
  const batchSetSteps = useProjectStore((s) => s.batchSetSequencerSteps);
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

  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [samplePickerRow, setSamplePickerRow] = useState<string | null>(null);
  const [showAddInstrument, setShowAddInstrument] = useState(false);
  const [rowCtxMenu, setRowCtxMenu] = useState<{ rowId: string; x: number; y: number } | null>(null);
  const [isBouncing, setIsBouncing] = useState(false);
  const [soloRowId, setSoloRowId] = useState<string | null>(null);
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);

  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewStep, setPreviewStep] = useState(-1);
  const previewSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const previewRafRef = useRef<number | null>(null);
  const previewStartRef = useRef<{ ctxTime: number; loopDuration: number } | null>(null);
  const togglePreviewRef = useRef<() => void>(() => {});
  const paintStateRef = useRef<{ rowId: string; paintActive: boolean } | null>(null);

  // Marquee selection state
  const [selection, setSelection] = useState<{
    rowStart: number; rowEnd: number; stepStart: number; stepEnd: number;
  } | null>(null);
  const marqueeRef = useRef<{
    anchorRowIdx: number; anchorStepIdx: number; active: boolean;
  } | null>(null);
  // Shift-drag copy state
  const shiftDragRef = useRef<{
    origSelection: { rowStart: number; rowEnd: number; stepStart: number; stepEnd: number };
    anchorStepIdx: number;
    lastOffset: number;
  } | null>(null);
  const [copyGhostOffset, setCopyGhostOffset] = useState<number | null>(null);

  useEffect(() => {
    if (track && !track.sequencerPattern) {
      initPattern(track.id);
    }
  }, [track, initPattern]);

  const stopPreview = useCallback(() => {
    for (const s of previewSourcesRef.current) {
      try { s.stop(); } catch { /* already stopped */ }
      s.disconnect();
    }
    previewSourcesRef.current = [];
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
    previewStartRef.current = null;
    setIsPreviewPlaying(false);
    setPreviewStep(-1);
  }, []);

  useEffect(() => {
    return () => stopPreview();
  }, [trackId, stopPreview]);

  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const isInSelection = useCallback(
    (rowIdx: number, stepIdx: number) => {
      if (!selection) return false;
      const rMin = Math.min(selection.rowStart, selection.rowEnd);
      const rMax = Math.max(selection.rowStart, selection.rowEnd);
      const sMin = Math.min(selection.stepStart, selection.stepEnd);
      const sMax = Math.max(selection.stepStart, selection.stepEnd);
      return rowIdx >= rMin && rowIdx <= rMax && stepIdx >= sMin && stepIdx <= sMax;
    },
    [selection],
  );

  // Keyboard shortcuts: Space = play/stop, Escape = close or clear selection
  useEffect(() => {
    if (!trackId) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        togglePreviewRef.current();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        if (selectionRef.current) {
          setSelection(null);
        } else {
          stopPreview();
          closeEditor(null);
        }
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        const sel = selectionRef.current;
        if (!sel) return;
        e.preventDefault();
        e.stopPropagation();
        const state = useProjectStore.getState();
        const t = state.project?.tracks.find((tr) => tr.id === trackId);
        const pat = t?.sequencerPattern;
        if (!t || !pat) return;
        const rMin = Math.min(sel.rowStart, sel.rowEnd);
        const rMax = Math.max(sel.rowStart, sel.rowEnd);
        const sMin = Math.min(sel.stepStart, sel.stepEnd);
        const sMax = Math.max(sel.stepStart, sel.stepEnd);
        const ops: { rowId: string; stepIndex: number; active: boolean; velocity: number }[] = [];
        for (let ri = rMin; ri <= rMax; ri++) {
          const row = pat.rows[ri];
          if (!row) continue;
          for (let si = sMin; si <= sMax; si++) {
            const step = row.steps[si];
            if (step?.active) {
              ops.push({ rowId: row.id, stepIndex: si, active: false, velocity: step.velocity });
            }
          }
        }
        if (ops.length > 0) {
          state.batchSetSequencerSteps(t.id, ops);
        }
        setSelection(null);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [trackId, closeEditor, stopPreview]);

  if (!trackId || !track || !project) return null;

  const pattern = track.sequencerPattern;
  if (!pattern) return null;

  const bpm = project.bpm;
  const totalSteps = pattern.stepsPerBar * pattern.bars;
  const stepDuration = (60 / bpm) / (pattern.stepsPerBar / 4);
  const patternDuration = stepDuration * totalSteps;
  const currentStep = isPreviewPlaying ? previewStep : -1;
  const gridWidth = totalSteps * STEP_W;

  function isRowAudible(rowId: string, muted: boolean): boolean {
    if (soloRowId) return rowId === soloRowId;
    return !muted;
  }

  async function startPreview() {
    if (!pattern || patternDuration <= 0) return;
    stopPreview();

    const engine = getAudioEngine();
    await engine.resume();
    const ctx = engine.ctx;

    const sampleBuffers = new Map<string, AudioBuffer>();
    for (const row of pattern.rows) {
      if (!isRowAudible(row.id, row.muted)) continue;
      const buf = await getSample(ctx, row.sampleKey);
      if (buf) sampleBuffers.set(row.sampleKey, buf);
    }

    const now = ctx.currentTime;
    const sources: AudioBufferSourceNode[] = [];

    for (let loop = 0; loop < 2; loop++) {
      const loopOffset = loop * patternDuration;
      for (const row of pattern.rows) {
        if (!isRowAudible(row.id, row.muted)) continue;
        const buffer = sampleBuffers.get(row.sampleKey);
        if (!buffer) continue;
        for (let stepIdx = 0; stepIdx < row.steps.length; stepIdx++) {
          const step = row.steps[stepIdx];
          if (!step.active) continue;
          let swingOffset = 0;
          if (pattern.swing > 0 && stepIdx % 2 === 1) {
            swingOffset = stepDuration * pattern.swing * 0.5;
          }
          const time = now + loopOffset + stepIdx * stepDuration + swingOffset;
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          const gain = ctx.createGain();
          gain.gain.value = step.velocity * row.volume;
          source.connect(gain);
          gain.connect(ctx.destination);
          source.start(time);
          sources.push(source);
        }
      }
    }

    previewSourcesRef.current = sources;
    previewStartRef.current = { ctxTime: now, loopDuration: patternDuration };
    setIsPreviewPlaying(true);

    const animate = () => {
      if (!previewStartRef.current) return;
      const eng = getAudioEngine();
      const elapsed = eng.ctx.currentTime - previewStartRef.current.ctxTime;
      const pos = elapsed % previewStartRef.current.loopDuration;
      const s = Math.floor(pos / stepDuration);
      setPreviewStep(s);
      if (elapsed >= previewStartRef.current.loopDuration * 2) {
        stopPreview();
        return;
      }
      previewRafRef.current = requestAnimationFrame(animate);
    };
    previewRafRef.current = requestAnimationFrame(animate);
  }

  const togglePreview = () => {
    if (isPreviewPlaying) stopPreview();
    else startPreview();
  };

  togglePreviewRef.current = togglePreview;

  const previewSample = async (sampleKey: string, velocity: number) => {
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
  };

  const getRowIdx = (rowId: string): number => pattern.rows.findIndex((r) => r.id === rowId);

  const handleGridMouseDown = (rowId: string, stepIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const rowIdx = getRowIdx(rowId);
    if (rowIdx < 0) return;

    if (e.shiftKey && selection) {
      // Shift+drag on existing selection: start copy-drag
      const rMin = Math.min(selection.rowStart, selection.rowEnd);
      const rMax = Math.max(selection.rowStart, selection.rowEnd);
      const sMin = Math.min(selection.stepStart, selection.stepEnd);
      const sMax = Math.max(selection.stepStart, selection.stepEnd);

      if (rowIdx >= rMin && rowIdx <= rMax && stepIdx >= sMin && stepIdx <= sMax) {
        shiftDragRef.current = {
          origSelection: { rowStart: rMin, rowEnd: rMax, stepStart: sMin, stepEnd: sMax },
          anchorStepIdx: stepIdx,
          lastOffset: 0,
        };
        setCopyGhostOffset(0);

        const onMove = (ev: MouseEvent) => {
          if (!shiftDragRef.current) return;
          const target = document.elementFromPoint(ev.clientX, ev.clientY);
          if (!target) return;
          const stepEl = (target as HTMLElement).closest('[data-seq-step]') as HTMLElement | null;
          if (!stepEl) return;
          const hoverStep = Number(stepEl.dataset.seqStep);
          if (isNaN(hoverStep)) return;
          const offset = hoverStep - shiftDragRef.current.anchorStepIdx;
          shiftDragRef.current.lastOffset = offset;
          setCopyGhostOffset(offset);
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          if (!shiftDragRef.current || !pattern) return;
          const { origSelection, lastOffset } = shiftDragRef.current;
          shiftDragRef.current = null;
          setCopyGhostOffset(null);

          if (lastOffset === 0) return;

          const ops: { rowId: string; stepIndex: number; active: boolean; velocity: number }[] = [];
          for (let ri = origSelection.rowStart; ri <= origSelection.rowEnd; ri++) {
            const row = pattern.rows[ri];
            if (!row) continue;
            for (let si = origSelection.stepStart; si <= origSelection.stepEnd; si++) {
              const step = row.steps[si];
              if (!step || !step.active) continue;
              const destStep = si + lastOffset;
              if (destStep < 0 || destStep >= row.steps.length) continue;
              ops.push({ rowId: row.id, stepIndex: destStep, active: true, velocity: step.velocity });
            }
          }
          if (ops.length > 0) {
            batchSetSteps(track.id, ops);
            setSelection({
              rowStart: origSelection.rowStart,
              rowEnd: origSelection.rowEnd,
              stepStart: origSelection.stepStart + lastOffset,
              stepEnd: origSelection.stepEnd + lastOffset,
            });
          }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return;
      }
    }

    // Not shift-drag-copy: prepare for marquee or single-click toggle
    marqueeRef.current = { anchorRowIdx: rowIdx, anchorStepIdx: stepIdx, active: false };

    const onMove = (ev: MouseEvent) => {
      if (!marqueeRef.current) return;
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      if (!target) return;
      const stepEl = (target as HTMLElement).closest('[data-seq-step]') as HTMLElement | null;
      if (!stepEl) return;
      const hoverRow = stepEl.dataset.seqRow;
      const hoverStep = Number(stepEl.dataset.seqStep);
      if (!hoverRow || isNaN(hoverStep)) return;
      const hoverRowIdx = pattern.rows.findIndex((r) => r.id === hoverRow);
      if (hoverRowIdx < 0) return;
      marqueeRef.current.active = true;
      setSelection({
        rowStart: marqueeRef.current.anchorRowIdx,
        rowEnd: hoverRowIdx,
        stepStart: marqueeRef.current.anchorStepIdx,
        stepEnd: hoverStep,
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (marqueeRef.current && !marqueeRef.current.active) {
        toggleStep(track.id, rowId, stepIdx);
        const row = pattern.rows.find((r) => r.id === rowId);
        if (row) {
          const step = row.steps[stepIdx];
          if (!step?.active) previewSample(row.sampleKey, step?.velocity ?? 0.8);
        }
      }
      marqueeRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleStepMouseDown = (rowId: string, stepIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (e.shiftKey) {
      // Shift+click: start paint mode — toggle this step and drag to paint same state
      const row = pattern.rows.find((r) => r.id === rowId);
      if (!row) return;
      const wasActive = row.steps[stepIdx]?.active ?? false;
      const paintActive = !wasActive;
      toggleStep(track.id, rowId, stepIdx);
      if (paintActive) previewSample(row.sampleKey, row.steps[stepIdx]?.velocity ?? 0.8);
      paintStateRef.current = { rowId, paintActive };

      const onMove = (ev: MouseEvent) => {
        if (!paintStateRef.current) return;
        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        if (!target) return;
        const stepEl = target.closest('[data-seq-step]') as HTMLElement | null;
        if (!stepEl) return;
        const stepRow = stepEl.dataset.seqRow;
        const stepIndex = Number(stepEl.dataset.seqStep);
        if (stepRow !== paintStateRef.current.rowId || isNaN(stepIndex)) return;
        const currentRow = pattern.rows.find((r) => r.id === stepRow);
        if (!currentRow) return;
        const isActive = currentRow.steps[stepIndex]?.active ?? false;
        if (isActive !== paintStateRef.current.paintActive) {
          toggleStep(track.id, stepRow, stepIndex);
        }
      };
      const onUp = () => {
        paintStateRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    } else {
      // Normal click: toggle single step
      toggleStep(track.id, rowId, stepIdx);
      const row = pattern.rows.find((r) => r.id === rowId);
      if (row) {
        const step = row.steps[stepIdx];
        if (!step?.active) previewSample(row.sampleKey, step?.velocity ?? 0.8);
      }
    }
  };

  const handleVelocityMouseDown = (rowId: string, stepIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const row = pattern.rows.find((r) => r.id === rowId);
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
  };

  const handleFileDrop = async (rowId: string, e: React.DragEvent) => {
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
  };

  const handleBounce = async () => {
    setIsBouncing(true);
    try {
      await bounceSequencerToAudio(track.id, pattern, bpm);
    } finally {
      setIsBouncing(false);
    }
  };

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startY: e.clientY, startH: editorHeight };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startY - ev.clientY;
      setEditorHeight(resizeRef.current.startH + delta);
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const stepsPerBeat = pattern.stepsPerBar / 4;

  return (
    <div
      className="border-t border-zinc-700 bg-zinc-900 flex flex-col select-none"
      style={{ height: editorHeight }}
      tabIndex={-1}
    >
      {/* Resize handle */}
      <div
        className="h-1 cursor-ns-resize bg-zinc-800 hover:bg-indigo-500/40 transition-colors shrink-0"
        onMouseDown={onResizeStart}
      />

      {/* Header bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <span className="text-emerald-400 font-bold text-xs">STEP SEQUENCER</span>
        <span className="text-zinc-500 text-[10px]">{track.displayName}</span>

        <div className="flex items-center gap-2 ml-4">
          <label className="flex items-center gap-1 text-[10px] text-zinc-400">
            Steps/Bar:
            <select
              value={pattern.stepsPerBar}
              onChange={(e) => setStepsPerBar(track.id, Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-200 text-[10px]"
            >
              <option value={8}>8</option>
              <option value={16}>16</option>
              <option value={32}>32</option>
            </select>
          </label>
          <div className="flex items-center gap-1 text-[10px] text-zinc-400">
            Bars:
            <button
              onClick={() => { if (pattern.bars > 1) setBars(track.id, pattern.bars - 1); }}
              disabled={pattern.bars <= 1}
              className="w-5 h-5 flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-[10px] font-bold"
            >
              -
            </button>
            <span className="text-zinc-200 w-5 text-center font-medium">{pattern.bars}</span>
            <button
              onClick={() => setBars(track.id, pattern.bars + 1)}
              className="w-5 h-5 flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-700 text-[10px] font-bold"
            >
              +
            </button>
          </div>
          <label className="flex items-center gap-1 text-[10px] text-zinc-400">
            Swing:
            <input
              type="range" min={0} max={100}
              value={Math.round(pattern.swing * 100)}
              onChange={(e) => updateSwing(track.id, Number(e.target.value) / 100)}
              className="w-16 h-1"
            />
            <span className="text-zinc-300 w-8 text-right">{Math.round(pattern.swing * 100)}%</span>
          </label>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={togglePreview}
            className={`px-3 py-1 rounded text-[10px] font-medium transition-colors ${
              isPreviewPlaying
                ? 'bg-amber-600/80 hover:bg-amber-600 text-white'
                : 'bg-zinc-700/80 hover:bg-zinc-600 text-zinc-200'
            }`}
            title="Space to toggle"
          >
            {isPreviewPlaying ? '■ Stop' : '▶ Play'}
          </button>
          <button
            onClick={handleBounce}
            disabled={isBouncing}
            className="px-3 py-1 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded text-[10px] font-medium transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            {isBouncing ? 'Bouncing...' : 'Bounce to Audio'}
          </button>
          <button
            onClick={() => { stopPreview(); closeEditor(null); }}
            className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded text-[10px] transition-colors"
            title="Esc"
          >
            Close
          </button>
        </div>
      </div>

      {/* Grid area */}
      <div ref={gridScrollRef} className="flex-1 overflow-auto relative" style={{ minHeight: 0 }}>
        <div className="flex" style={{ minWidth: ROW_LABEL_W + gridWidth }}>
          {/* Row labels (sticky left, Logic Pro-inspired layout) */}
          <div className="sticky left-0 z-10 bg-zinc-900 shrink-0 border-r border-zinc-800/60" style={{ width: ROW_LABEL_W }}>
            {/* Header spacer aligned with beat numbers */}
            <div className="border-b border-zinc-700/40" style={{ height: 18 }} />

            {pattern.rows.map((row) => {
              const isSoloed = soloRowId === row.id;
              const audible = isRowAudible(row.id, row.muted);
              return (
                <div
                  key={row.id}
                  className={`grid items-center border-b border-zinc-800/50 group ${
                    selectedRow === row.id ? 'bg-zinc-800/60' : 'hover:bg-zinc-800/20'
                  }`}
                  style={{
                    height: STEP_H,
                    gridTemplateColumns: '4px 24px 1fr 24px 24px',
                    gap: '0 4px',
                    paddingRight: 6,
                    opacity: audible ? 1 : 0.4,
                  }}
                  onClick={() => setSelectedRow(row.id === selectedRow ? null : row.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setRowCtxMenu({ rowId: row.id, x: e.clientX, y: e.clientY });
                  }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                  onDrop={(e) => handleFileDrop(row.id, e)}
                >
                  {/* Color indicator */}
                  <div className="h-full rounded-r" style={{ backgroundColor: row.color }} />

                  {/* Play preview button */}
                  <button
                    className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-white rounded hover:bg-zinc-700/60 transition-colors"
                    onClick={(e) => { e.stopPropagation(); previewSample(row.sampleKey, 0.8); }}
                    title="Preview sound"
                  >
                    <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
                      <path d="M0 0 L10 6 L0 12 Z" />
                    </svg>
                  </button>

                  {/* Instrument name */}
                  <button
                    className="text-left text-xs text-zinc-200 truncate px-1 hover:text-white transition-colors font-medium cursor-pointer"
                    title={`${row.name} — click to pick sample`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSamplePickerRow(samplePickerRow === row.id ? null : row.id);
                    }}
                  >
                    {row.name}
                  </button>

                  {/* Mute button */}
                  <button
                    className={`w-6 h-6 text-[10px] font-bold rounded flex items-center justify-center transition-colors ${
                      row.muted
                        ? 'bg-amber-600 text-white'
                        : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700'
                    }`}
                    onClick={(e) => { e.stopPropagation(); toggleRowMute(track.id, row.id); }}
                    title={row.muted ? 'Unmute' : 'Mute'}
                  >
                    M
                  </button>

                  {/* Solo button */}
                  <button
                    className={`w-6 h-6 text-[10px] font-bold rounded flex items-center justify-center transition-colors ${
                      isSoloed
                        ? 'bg-yellow-500 text-zinc-900'
                        : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSoloRowId(isSoloed ? null : row.id);
                    }}
                    title={isSoloed ? 'Unsolo' : 'Solo'}
                  >
                    S
                  </button>
                </div>
              );
            })}

            {/* Add instrument row */}
            <div className="relative">
              <button
                className="flex items-center gap-2 w-full px-3 border-b border-zinc-800/50 text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800/40 transition-colors"
                style={{ height: STEP_H }}
                onClick={() => setShowAddInstrument(!showAddInstrument)}
                title="Add instrument"
              >
                <span className="text-sm font-bold">+</span>
                <span className="text-[11px]">Add Instrument...</span>
              </button>
              {showAddInstrument && (
                <SamplePickerDropdown
                  currentKey=""
                  onSelect={(key, name) => {
                    const sample = ALL_DRUM_SAMPLES.find((s) => s.id === key);
                    addRow(track.id, key, name, sample?.color ?? '#71717a');
                    setShowAddInstrument(false);
                  }}
                  onClose={() => setShowAddInstrument(false)}
                  onPreview={(key) => previewSample(key, 0.8)}
                />
              )}
            </div>

            {/* Sample picker dropdown for existing rows */}
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
          <div className="relative">
            {/* Beat/bar number header */}
            <div className="flex border-b border-zinc-700/40" style={{ height: 18 }}>
              {Array.from({ length: totalSteps }).map((_, idx) => {
                const isBeatStart = idx % stepsPerBeat === 0;
                const isBarStart = idx % pattern.stepsPerBar === 0;
                const beatNum = Math.floor(idx / stepsPerBeat) + 1;
                const barNum = Math.floor(idx / pattern.stepsPerBar) + 1;
                return (
                  <div
                    key={idx}
                    className="shrink-0 flex items-center justify-center text-[8px] font-medium border-l"
                    style={{
                      width: STEP_W,
                      borderColor: isBarStart ? 'rgba(161,161,170,0.4)' : isBeatStart ? 'rgba(113,113,122,0.25)' : 'rgba(63,63,70,0.15)',
                      color: isBarStart ? '#a1a1aa' : isBeatStart ? '#71717a' : 'transparent',
                    }}
                  >
                    {isBarStart ? `${barNum}` : isBeatStart ? `${beatNum}` : ''}
                  </div>
                );
              })}
              {/* Extend button in header row */}
              <button
                className="shrink-0 flex items-center justify-center text-zinc-600 hover:text-emerald-400 hover:bg-zinc-800/60 transition-colors border-l border-zinc-700/30"
                style={{ width: STEP_W * 2, height: 18 }}
                onClick={() => setBars(track.id, pattern.bars + 1)}
                title="Add 1 bar"
              >
                <span className="text-[10px] font-bold">+1</span>
              </button>
            </div>

            {/* Step cells */}
            {pattern.rows.map((row, rowIdx) => {
              const audible = isRowAudible(row.id, row.muted);
              return (
                <div
                  key={row.id}
                  className="flex border-b border-zinc-800/30"
                  style={{ height: STEP_H, opacity: audible ? 1 : 0.35 }}
                >
                  {row.steps.map((step, idx) => {
                    const isBeatStart = idx % stepsPerBeat === 0;
                    const isBarStart = idx % pattern.stepsPerBar === 0;
                    const isCurrent = idx === currentStep && isPreviewPlaying;
                    const selected = isInSelection(rowIdx, idx);

                    let isGhost = false;
                    if (copyGhostOffset !== null && copyGhostOffset !== 0 && selection) {
                      const rMin = Math.min(selection.rowStart, selection.rowEnd);
                      const rMax = Math.max(selection.rowStart, selection.rowEnd);
                      const sMin = Math.min(selection.stepStart, selection.stepEnd);
                      const sMax = Math.max(selection.stepStart, selection.stepEnd);
                      if (rowIdx >= rMin && rowIdx <= rMax) {
                        const srcStep = idx - copyGhostOffset;
                        if (srcStep >= sMin && srcStep <= sMax) {
                          const srcRow = pattern.rows[rowIdx];
                          if (srcRow?.steps[srcStep]?.active) {
                            isGhost = true;
                          }
                        }
                      }
                    }

                    return (
                      <div
                        key={idx}
                        data-seq-step={idx}
                        data-seq-row={row.id}
                        className={`relative shrink-0 cursor-pointer transition-all duration-75 ${
                          isBarStart
                            ? 'border-l border-l-zinc-500/40'
                            : isBeatStart
                              ? 'border-l border-l-zinc-700/30'
                              : 'border-l border-l-zinc-800/15'
                        } ${isCurrent ? 'ring-1 ring-inset ring-white/30' : ''}`}
                        style={{
                          width: STEP_W,
                          height: STEP_H,
                          backgroundColor: step.active
                            ? `${row.color}${Math.round(step.velocity * 180 + 55).toString(16).padStart(2, '0')}`
                            : isCurrent ? 'rgba(255,255,255,0.03)' : undefined,
                        }}
                        onMouseDown={(e) => handleGridMouseDown(row.id, idx, e)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleVelocityMouseDown(row.id, idx, e);
                        }}
                      >
                        {step.active && (
                          <div
                            className="absolute inset-1 rounded-sm pointer-events-none"
                            style={{
                              backgroundColor: row.color,
                              opacity: 0.2 + step.velocity * 0.5,
                            }}
                          />
                        )}
                        {selected && (
                          <div
                            className="absolute inset-0 pointer-events-none border-2 border-cyan-400/60"
                            style={{ backgroundColor: 'rgba(34,211,238,0.08)' }}
                          />
                        )}
                        {isGhost && !step.active && (
                          <div
                            className="absolute inset-1 rounded-sm pointer-events-none"
                            style={{
                              backgroundColor: row.color,
                              opacity: 0.35,
                              border: '1px dashed rgba(34,211,238,0.5)',
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                  {/* Extend button per row */}
                  <div
                    className="shrink-0 flex items-center justify-center text-zinc-700 hover:text-emerald-400 hover:bg-zinc-800/40 cursor-pointer transition-colors border-l border-zinc-700/30"
                    style={{ width: STEP_W * 2, height: STEP_H }}
                    onClick={() => setBars(track.id, pattern.bars + 1)}
                    title="Add 1 bar"
                  >
                    <span className="text-lg font-light">+</span>
                  </div>
                </div>
              );
            })}

            {/* Playhead */}
            {isPreviewPlaying && currentStep >= 0 && (
              <div
                className="absolute w-0.5 bg-white/50 pointer-events-none z-20"
                style={{
                  left: currentStep * STEP_W + STEP_W / 2,
                  top: 18,
                  height: pattern.rows.length * STEP_H,
                  transition: 'left 60ms linear',
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Velocity lane for selected row */}
      {selectedRow && (() => {
        const row = pattern.rows.find((r) => r.id === selectedRow);
        if (!row) return null;
        return (
          <div className="flex shrink-0 border-t border-zinc-700/50 bg-zinc-900/80" style={{ height: VELOCITY_LANE_H }}>
            <div
              className="shrink-0 flex items-center px-2 text-[9px] text-zinc-500 font-medium bg-zinc-900"
              style={{ width: ROW_LABEL_W }}
            >
              VEL — {row.name}
            </div>
            <div className="flex items-end overflow-hidden">
              {row.steps.map((step, idx) => {
                const isCurrent = idx === currentStep && isPreviewPlaying;
                return (
                  <div
                    key={idx}
                    className={`shrink-0 flex items-end justify-center cursor-ns-resize ${
                      isCurrent ? 'bg-white/5' : ''
                    }`}
                    style={{ width: STEP_W, height: VELOCITY_LANE_H }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const update = (ev: MouseEvent) => {
                        const pct = 1 - Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
                        setStepVelocity(track.id, selectedRow, idx, Math.max(0.05, pct));
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
                          width: Math.max(6, STEP_W * 0.5),
                          height: `${step.velocity * 100}%`,
                          backgroundColor: row.color,
                          opacity: 0.85,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Row context menu */}
      {rowCtxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRowCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setRowCtxMenu(null); }} />
          <div
            className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded shadow-xl py-1 min-w-[150px]"
            style={{ left: Math.min(rowCtxMenu.x, window.innerWidth - 170), top: Math.min(rowCtxMenu.y, window.innerHeight - 120) }}
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
              onClick={() => {
                if (soloRowId === rowCtxMenu.rowId) setSoloRowId(null);
                removeRow(track.id, rowCtxMenu.rowId);
                setRowCtxMenu(null);
                if (selectedRow === rowCtxMenu.rowId) setSelectedRow(null);
              }}
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

/* ── Sample Picker Dropdown ─────────────────────────────────────────── */

interface SamplePickerDropdownProps {
  currentKey: string;
  onSelect: (key: string, name: string) => void;
  onClose: () => void;
  onPreview: (key: string) => void;
  onImportFile?: () => void;
}

function SamplePickerDropdown({ currentKey, onSelect, onClose, onPreview, onImportFile }: SamplePickerDropdownProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('audio/')) return;
    const engine = getAudioEngine();
    await engine.resume();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await engine.ctx.decodeAudioData(arrayBuffer);
    const key = `user-sample-${Date.now()}-${file.name}`;
    cacheUserSample(key, audioBuffer);
    const displayName = file.name.replace(/\.[^.]+$/, '');
    onSelect(key, displayName);
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 z-50 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 w-48">
        <div className="px-2 py-1 text-[9px] text-zinc-500 font-medium uppercase">Built-in Samples</div>
        {ALL_DRUM_SAMPLES.map((kit) => (
          <button
            key={kit.id}
            className={`w-full flex items-center gap-2 px-2 py-1.5 text-[11px] hover:bg-zinc-800 transition-colors text-left ${
              currentKey === kit.id ? 'text-emerald-400' : 'text-zinc-300'
            }`}
            onClick={() => onSelect(kit.id, kit.name)}
            onMouseEnter={() => onPreview(kit.id)}
          >
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: kit.color }} />
            <span>{kit.name}</span>
            {currentKey === kit.id && <span className="ml-auto text-emerald-400">✓</span>}
          </button>
        ))}
        <div className="my-0.5 border-t border-zinc-800" />
        <button
          className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-amber-400 hover:bg-zinc-800 transition-colors text-left"
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="text-sm">📂</span>
          <span>Import Audio...</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </>
  );
}
