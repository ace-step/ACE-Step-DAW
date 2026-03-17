import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import type { SequencerRow } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { getSample, cacheUserSample } from '../../services/sampleManager';
import { ALL_DRUM_SAMPLES } from '../../constants/tracks';
import { bounceSequencerToAudio } from '../../services/sequencerBounce';
import { MiniKnob } from './MiniKnob';

/* ── FL Studio-inspired palette ─────────────────────────────────────── */
const FL = {
  bg: '#2a2a2a',
  bgAlt: '#2d2d2d',
  rowBg: '#303030',
  rowBgAlt: '#2d2d2d',
  headerBg: '#1e1e1e',
  stepOff: '#3c3c3c',
  stepOffHover: '#454545',
  beatBg: '#353535',
  border: '#222222',
  borderLight: '#444444',
  barBorder: '#555555',
  text: '#c0c0c0',
  textDim: '#808080',
  textBright: '#e0e0e0',
  accent: '#5a9a3c',
  accentBright: '#7ec55a',
  muteLed: '#2a2a2a',
  muteActive: '#5a9a3c',
  graphBg: '#252525',
  graphGrid: '#333333',
};

type RowSize = 'compact' | 'normal' | 'expanded';
const ROW_SIZES: Record<RowSize, { stepH: number; stepW: number }> = {
  compact: { stepH: 20, stepW: 22 },
  normal: { stepH: 28, stepW: 28 },
  expanded: { stepH: 36, stepW: 34 },
};

const ROW_LABEL_W = 160;
const GRAPH_H = 64;

const ROW_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e',
];

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
  const setRowPan = useProjectStore((s) => s.setSequencerRowPan);
  const removeRow = useProjectStore((s) => s.removeSequencerRow);
  const clearRow = useProjectStore((s) => s.clearSequencerRow);
  const updateSwing = useProjectStore((s) => s.updateSequencerSwing);
  const setStepsPerBar = useProjectStore((s) => s.setSequencerStepsPerBar);
  const setBars = useProjectStore((s) => s.setSequencerBars);
  const addRow = useProjectStore((s) => s.addSequencerRow);
  const setRowSample = useProjectStore((s) => s.setSequencerRowSample);
  const initPattern = useProjectStore((s) => s.initSequencerPattern);
  const reorderRows = useProjectStore((s) => s.reorderSequencerRows);
  const cloneRow = useProjectStore((s) => s.cloneSequencerRow);
  const renameRow = useProjectStore((s) => s.renameSequencerRow);
  const setRowColor = useProjectStore((s) => s.setSequencerRowColor);
  const fillRow = useProjectStore((s) => s.fillSequencerRow);

  const [rowSize, setRowSize] = useState<RowSize>('normal');
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [samplePickerRow, setSamplePickerRow] = useState<string | null>(null);
  const [showAddInstrument, setShowAddInstrument] = useState(false);
  const [rowCtxMenu, setRowCtxMenu] = useState<{
    rowId: string; x: number; y: number;
    showColorPicker?: boolean; renamingName?: string;
  } | null>(null);
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

  const [selection, setSelection] = useState<{
    rowStart: number; rowEnd: number; stepStart: number; stepEnd: number;
  } | null>(null);
  const marqueeRef = useRef<{
    anchorRowIdx: number; anchorStepIdx: number; active: boolean;
  } | null>(null);
  const shiftDragRef = useRef<{
    origSelection: { rowStart: number; rowEnd: number; stepStart: number; stepEnd: number };
    anchorStepIdx: number;
    lastOffset: number;
  } | null>(null);
  const [copyGhostOffset, setCopyGhostOffset] = useState<number | null>(null);

  // Row drag-reorder state
  const [dragRowIdx, setDragRowIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Inline rename state
  const [inlineRenameRowId, setInlineRenameRowId] = useState<string | null>(null);
  const [inlineRenameValue, setInlineRenameValue] = useState('');
  const inlineRenameInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (inlineRenameRowId && inlineRenameInputRef.current) {
      inlineRenameInputRef.current.focus();
      inlineRenameInputRef.current.select();
    }
  }, [inlineRenameRowId]);

  if (!trackId || !track || !project) return null;

  const pattern = track.sequencerPattern;
  if (!pattern) return null;

  const { stepH, stepW } = ROW_SIZES[rowSize];
  const bpm = project.bpm;
  const totalSteps = pattern.stepsPerBar * pattern.bars;
  const stepDuration = (60 / bpm) / (pattern.stepsPerBar / 4);
  const patternDuration = stepDuration * totalSteps;
  const currentStep = isPreviewPlaying ? previewStep : -1;
  const gridWidth = totalSteps * stepW;
  const stepsPerBeat = pattern.stepsPerBar / 4;

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
          const pan = ctx.createStereoPanner();
          pan.pan.value = row.pan ?? 0;
          source.connect(gain);
          gain.connect(pan);
          pan.connect(ctx.destination);
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

  /* ── Grid interaction handlers ──────────────────────────────────────── */

  const handleGridMouseDown = (rowId: string, stepIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const rowIdx = getRowIdx(rowId);
    if (rowIdx < 0) return;

    if (e.shiftKey && selection) {
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

  const commitInlineRename = () => {
    if (inlineRenameRowId && inlineRenameValue.trim()) {
      renameRow(track.id, inlineRenameRowId, inlineRenameValue.trim());
    }
    setInlineRenameRowId(null);
    setInlineRenameValue('');
  };

  /* ── Row drag-reorder ───────────────────────────────────────────────── */

  const handleRowDragStart = (idx: number, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
    setDragRowIdx(idx);
  };

  const handleRowDragOver = (idx: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  };

  const handleRowDrop = (idx: number) => {
    if (dragRowIdx !== null && dragRowIdx !== idx) {
      reorderRows(track.id, dragRowIdx, idx);
    }
    setDragRowIdx(null);
    setDragOverIdx(null);
  };

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <div
      className="flex flex-col select-none"
      style={{ height: editorHeight, background: FL.bg }}
      tabIndex={-1}
    >
      {/* Resize handle */}
      <div
        className="h-1 cursor-ns-resize shrink-0"
        style={{ background: FL.headerBg }}
        onMouseDown={onResizeStart}
      >
        <div className="mx-auto mt-px" style={{ width: 40, height: 2, borderRadius: 1, background: FL.borderLight }} />
      </div>

      {/* ── Header toolbar ────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-3 shrink-0"
        style={{ height: 32, background: FL.headerBg, borderBottom: `1px solid ${FL.border}` }}
      >
        {/* Channel rack icon */}
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="5" height="5" rx="1" fill={FL.accent} />
            <rect x="8" y="1" width="5" height="5" rx="1" fill={FL.accent} opacity="0.5" />
            <rect x="1" y="8" width="5" height="5" rx="1" fill={FL.accent} opacity="0.5" />
            <rect x="8" y="8" width="5" height="5" rx="1" fill={FL.accent} opacity="0.3" />
          </svg>
          <span style={{ color: FL.accentBright, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
            CHANNEL RACK
          </span>
        </div>

        <span style={{ color: FL.textDim, fontSize: 10 }}>{track.displayName}</span>

        {/* Steps/bar segmented control */}
        <div className="flex items-center gap-1 ml-3" style={{ fontSize: 10 }}>
          <span style={{ color: FL.textDim }}>Steps:</span>
          <div className="flex" style={{ borderRadius: 3, overflow: 'hidden', border: `1px solid ${FL.borderLight}` }}>
            {[8, 16, 32].map((v) => (
              <button
                key={v}
                onClick={() => setStepsPerBar(track.id, v)}
                style={{
                  padding: '1px 6px',
                  fontSize: 10,
                  fontWeight: pattern.stepsPerBar === v ? 700 : 400,
                  color: pattern.stepsPerBar === v ? FL.textBright : FL.textDim,
                  background: pattern.stepsPerBar === v ? FL.accent : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Bars +/- */}
        <div className="flex items-center gap-1" style={{ fontSize: 10 }}>
          <span style={{ color: FL.textDim }}>Bars:</span>
          <button
            onClick={() => { if (pattern.bars > 1) setBars(track.id, pattern.bars - 1); }}
            disabled={pattern.bars <= 1}
            style={{
              width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: FL.stepOff, border: `1px solid ${FL.borderLight}`, borderRadius: 2,
              color: pattern.bars <= 1 ? FL.border : FL.text, cursor: pattern.bars <= 1 ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: 700, lineHeight: 1,
            }}
          >
            -
          </button>
          <span style={{ color: FL.textBright, width: 18, textAlign: 'center', fontWeight: 600 }}>{pattern.bars}</span>
          <button
            onClick={() => setBars(track.id, pattern.bars + 1)}
            style={{
              width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: FL.stepOff, border: `1px solid ${FL.borderLight}`, borderRadius: 2,
              color: FL.text, cursor: 'pointer', fontSize: 12, fontWeight: 700, lineHeight: 1,
            }}
          >
            +
          </button>
        </div>

        {/* Swing knob */}
        <div className="flex items-center gap-1">
          <MiniKnob
            value={pattern.swing}
            min={0}
            max={1}
            size={20}
            color={FL.accentBright}
            label="Swing"
            onChange={(v) => updateSwing(track.id, v)}
          />
        </div>

        {/* Row size toggle */}
        <div className="flex items-center gap-0.5 ml-2" style={{ fontSize: 9 }}>
          {(['compact', 'normal', 'expanded'] as RowSize[]).map((sz) => (
            <button
              key={sz}
              onClick={() => setRowSize(sz)}
              title={sz}
              style={{
                width: sz === 'compact' ? 12 : sz === 'normal' ? 14 : 16,
                height: sz === 'compact' ? 8 : sz === 'normal' ? 10 : 12,
                borderRadius: 2,
                border: `1px solid ${rowSize === sz ? FL.accentBright : FL.borderLight}`,
                background: rowSize === sz ? FL.accent + '60' : 'transparent',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Play / Bounce / Close */}
        <button
          onClick={togglePreview}
          style={{
            padding: '2px 10px', borderRadius: 3, fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: isPreviewPlaying ? '#c0392b' : FL.accent,
            color: '#fff',
          }}
          title="Space to toggle"
        >
          {isPreviewPlaying ? '■ Stop' : '▶ Play'}
        </button>
        <button
          onClick={handleBounce}
          disabled={isBouncing}
          style={{
            padding: '2px 10px', borderRadius: 3, fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: '#2980b9', color: '#fff', opacity: isBouncing ? 0.5 : 1,
          }}
        >
          {isBouncing ? 'Bouncing...' : 'Bounce'}
        </button>
        <button
          onClick={() => { stopPreview(); closeEditor(null); }}
          style={{
            padding: '2px 8px', borderRadius: 3, fontSize: 10, border: `1px solid ${FL.borderLight}`,
            background: 'transparent', color: FL.textDim, cursor: 'pointer',
          }}
          title="Esc"
        >
          ✕
        </button>
      </div>

      {/* ── Grid area ─────────────────────────────────────────────────── */}
      <div ref={gridScrollRef} className="flex-1 overflow-auto relative" style={{ minHeight: 0 }}>
        <div className="flex" style={{ minWidth: ROW_LABEL_W + gridWidth }}>

          {/* ── Row labels (sticky left) ──────────────────────────────── */}
          <div
            className="sticky left-0 z-10 shrink-0"
            style={{ width: ROW_LABEL_W, background: FL.bg, borderRight: `1px solid ${FL.border}` }}
          >
            {/* Beat header spacer */}
            <div style={{ height: 18, borderBottom: `1px solid ${FL.border}` }} />

            {pattern.rows.map((row, rowIdx) => {
              const isSoloed = soloRowId === row.id;
              const audible = isRowAudible(row.id, row.muted);
              const isSelected = selectedRow === row.id;
              const isDragTarget = dragOverIdx === rowIdx && dragRowIdx !== rowIdx;

              return (
                <div
                  key={row.id}
                  draggable
                  onDragStart={(e) => handleRowDragStart(rowIdx, e)}
                  onDragOver={(e) => handleRowDragOver(rowIdx, e)}
                  onDragEnd={() => { setDragRowIdx(null); setDragOverIdx(null); }}
                  onDrop={() => handleRowDrop(rowIdx)}
                  className="flex items-center"
                  style={{
                    height: stepH,
                    background: isSelected ? '#3a3a3a' : rowIdx % 2 === 0 ? FL.rowBg : FL.rowBgAlt,
                    borderBottom: `1px solid ${FL.border}`,
                    borderTop: isDragTarget ? `2px solid ${FL.accentBright}` : '2px solid transparent',
                    opacity: audible ? 1 : 0.35,
                    cursor: 'default',
                    gap: 2,
                    paddingLeft: 2,
                    paddingRight: 3,
                  }}
                  onClick={() => setSelectedRow(row.id === selectedRow ? null : row.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setRowCtxMenu({ rowId: row.id, x: e.clientX, y: e.clientY });
                  }}
                  onDragOverCapture={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                  onDropCapture={(dontUse) => { /* handled by onDrop */ }}
                >
                  {/* Drag handle + color bar */}
                  <div
                    className="shrink-0 cursor-grab"
                    style={{ width: 4, height: stepH - 4, borderRadius: 2, background: row.color }}
                    title="Drag to reorder"
                  />

                  {/* LED mute indicator */}
                  <div
                    className="shrink-0 cursor-pointer"
                    style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: row.muted ? FL.muteLed : isSoloed ? '#f1c40f' : FL.muteActive,
                      border: `1px solid ${FL.borderLight}`,
                      boxShadow: row.muted ? 'none' : isSoloed ? '0 0 4px #f1c40f80' : `0 0 4px ${FL.muteActive}80`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRowMute(track.id, row.id);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSoloRowId(isSoloed ? null : row.id);
                    }}
                    title={row.muted ? 'Unmute (click) / Solo (right-click)' : isSoloed ? 'Unsolo (right-click)' : 'Mute (click) / Solo (right-click)'}
                  />

                  {/* Pan knob */}
                  <MiniKnob
                    value={row.pan ?? 0}
                    min={-1}
                    max={1}
                    size={16}
                    color="#3498db"
                    onChange={(v) => setRowPan(track.id, row.id, v)}
                    bipolar
                  />

                  {/* Volume knob */}
                  <MiniKnob
                    value={row.volume}
                    min={0}
                    max={1}
                    size={16}
                    color={FL.accentBright}
                    onChange={(v) => setRowVolume(track.id, row.id, v)}
                  />

                  {/* Channel name button */}
                  {inlineRenameRowId === row.id ? (
                    <input
                      ref={inlineRenameInputRef}
                      value={inlineRenameValue}
                      onChange={(e) => setInlineRenameValue(e.target.value)}
                      onBlur={commitInlineRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitInlineRename();
                        if (e.key === 'Escape') { setInlineRenameRowId(null); setInlineRenameValue(''); }
                      }}
                      className="flex-1 min-w-0"
                      style={{
                        background: FL.stepOff, border: `1px solid ${FL.accent}`, borderRadius: 3,
                        color: FL.textBright, fontSize: 10, padding: '0 4px', outline: 'none',
                        height: Math.min(stepH - 6, 20),
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <button
                      className="flex-1 min-w-0 text-left truncate"
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: isSelected ? FL.textBright : FL.text,
                        fontSize: 10, fontWeight: isSelected ? 600 : 400,
                        padding: '0 3px', lineHeight: 1.2,
                      }}
                      title={`${row.name} — click to select, double-click to rename`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSamplePickerRow(samplePickerRow === row.id ? null : row.id);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setInlineRenameRowId(row.id);
                        setInlineRenameValue(row.name);
                      }}
                    >
                      {row.name}
                    </button>
                  )}
                </div>
              );
            })}

            {/* Add instrument row */}
            <div className="relative">
              <button
                className="flex items-center gap-2 w-full"
                style={{
                  height: stepH,
                  padding: '0 8px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${FL.border}`,
                  color: FL.textDim,
                  fontSize: 10,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = FL.accentBright; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = FL.textDim; }}
                onClick={() => setShowAddInstrument(!showAddInstrument)}
                title="Add instrument"
              >
                <span style={{ fontSize: 14, fontWeight: 700 }}>+</span>
                <span>Add Channel...</span>
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

          {/* ── Step grid ─────────────────────────────────────────────── */}
          <div className="relative">
            {/* Beat/bar number header */}
            <div className="flex" style={{ height: 18, borderBottom: `1px solid ${FL.border}` }}>
              {Array.from({ length: totalSteps }).map((_, idx) => {
                const isBeatStart = idx % stepsPerBeat === 0;
                const isBarStart = idx % pattern.stepsPerBar === 0;
                const beatNum = Math.floor(idx / stepsPerBeat) + 1;
                const barNum = Math.floor(idx / pattern.stepsPerBar) + 1;
                return (
                  <div
                    key={idx}
                    className="shrink-0 flex items-center justify-center"
                    style={{
                      width: stepW,
                      fontSize: 8,
                      fontWeight: isBarStart ? 700 : 500,
                      color: isBarStart ? FL.text : isBeatStart ? FL.textDim : 'transparent',
                      borderLeft: isBarStart
                        ? `1px solid ${FL.barBorder}`
                        : isBeatStart
                          ? `1px solid ${FL.borderLight}`
                          : `1px solid ${FL.border}`,
                    }}
                  >
                    {isBarStart ? `${barNum}` : isBeatStart ? `${beatNum}` : ''}
                  </div>
                );
              })}
              <button
                className="shrink-0 flex items-center justify-center"
                style={{
                  width: stepW * 2, height: 18,
                  background: 'transparent', border: 'none', borderLeft: `1px solid ${FL.borderLight}`,
                  color: FL.textDim, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = FL.accentBright; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = FL.textDim; }}
                onClick={() => setBars(track.id, pattern.bars + 1)}
                title="Add 1 bar"
              >
                +1
              </button>
            </div>

            {/* Step cells */}
            {pattern.rows.map((row, rowIdx) => {
              const audible = isRowAudible(row.id, row.muted);
              return (
                <div
                  key={row.id}
                  className="flex"
                  style={{
                    height: stepH,
                    opacity: audible ? 1 : 0.3,
                    borderBottom: `1px solid ${FL.border}`,
                  }}
                >
                  {row.steps.map((step, idx) => {
                    const isBeatStart = idx % stepsPerBeat === 0;
                    const isBarStart = idx % pattern.stepsPerBar === 0;
                    const isCurrent = idx === currentStep && isPreviewPlaying;
                    const selected = isInSelection(rowIdx, idx);
                    const beatIdx = Math.floor(idx / stepsPerBeat);
                    const isOddBeat = beatIdx % 2 === 1;

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

                    const cellBg = step.active
                      ? undefined
                      : isOddBeat ? FL.beatBg : FL.stepOff;

                    return (
                      <div
                        key={idx}
                        data-seq-step={idx}
                        data-seq-row={row.id}
                        className="shrink-0 relative"
                        style={{
                          width: stepW,
                          height: stepH,
                          borderLeft: isBarStart
                            ? `1px solid ${FL.barBorder}`
                            : isBeatStart
                              ? `1px solid ${FL.borderLight}`
                              : `1px solid ${FL.border}`,
                          background: cellBg,
                          cursor: 'pointer',
                        }}
                        onMouseDown={(e) => handleGridMouseDown(row.id, idx, e)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleVelocityMouseDown(row.id, idx, e);
                        }}
                      >
                        {/* Step button (FL-style rounded pill) */}
                        {step.active ? (
                          <div
                            style={{
                              position: 'absolute',
                              left: 2, top: 2,
                              right: 2, bottom: 2,
                              borderRadius: 3,
                              background: row.color,
                              opacity: 0.3 + step.velocity * 0.7,
                              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.15), 0 1px 2px rgba(0,0,0,0.3)`,
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              position: 'absolute',
                              left: 2, top: 2,
                              right: 2, bottom: 2,
                              borderRadius: 3,
                              background: isOddBeat ? '#393939' : '#363636',
                              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4), inset 0 -1px 0 rgba(255,255,255,0.03)',
                            }}
                          />
                        )}

                        {/* Playhead highlight */}
                        {isCurrent && (
                          <div
                            style={{
                              position: 'absolute', inset: 0,
                              border: '1px solid rgba(255,255,255,0.3)',
                              borderRadius: 3,
                              pointerEvents: 'none',
                            }}
                          />
                        )}

                        {/* Selection overlay */}
                        {selected && (
                          <div
                            style={{
                              position: 'absolute', inset: 0,
                              border: '2px solid #3498db80',
                              background: 'rgba(52,152,219,0.1)',
                              pointerEvents: 'none',
                            }}
                          />
                        )}

                        {/* Copy ghost */}
                        {isGhost && !step.active && (
                          <div
                            style={{
                              position: 'absolute',
                              left: 2, top: 2, right: 2, bottom: 2,
                              borderRadius: 3,
                              background: row.color,
                              opacity: 0.35,
                              border: '1px dashed rgba(52,152,219,0.6)',
                            }}
                          />
                        )}
                      </div>
                    );
                  })}

                  {/* Extend button */}
                  <div
                    className="shrink-0 flex items-center justify-center cursor-pointer"
                    style={{
                      width: stepW * 2, height: stepH,
                      borderLeft: `1px solid ${FL.borderLight}`,
                      color: FL.textDim, fontSize: 16,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = FL.accentBright; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = FL.textDim; }}
                    onClick={() => setBars(track.id, pattern.bars + 1)}
                    title="Add 1 bar"
                  >
                    +
                  </div>
                </div>
              );
            })}

            {/* Playhead line */}
            {isPreviewPlaying && currentStep >= 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: currentStep * stepW + stepW / 2,
                  top: 18,
                  width: 2,
                  height: pattern.rows.length * stepH,
                  background: 'rgba(255,255,255,0.5)',
                  pointerEvents: 'none',
                  zIndex: 20,
                  transition: 'left 60ms linear',
                  borderRadius: 1,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Graph Editor (velocity lane) ──────────────────────────────── */}
      {selectedRow && (() => {
        const row = pattern.rows.find((r) => r.id === selectedRow);
        if (!row) return null;
        return (
          <div className="shrink-0 flex" style={{ height: GRAPH_H, borderTop: `1px solid ${FL.border}` }}>
            {/* Label + tabs */}
            <div
              className="shrink-0 flex flex-col justify-center px-2"
              style={{ width: ROW_LABEL_W, background: FL.graphBg }}
            >
              <div className="flex items-center gap-1.5">
                <div style={{ width: 3, height: 12, borderRadius: 1, background: row.color }} />
                <span style={{ fontSize: 9, color: FL.text, fontWeight: 600 }}>VELOCITY</span>
              </div>
              <span style={{ fontSize: 8, color: FL.textDim, marginTop: 2 }}>{row.name}</span>
            </div>

            {/* Graph bars */}
            <div
              className="flex items-end overflow-hidden relative"
              style={{ background: FL.graphBg, flex: 1 }}
            >
              {/* Horizontal grid lines */}
              {[0.25, 0.5, 0.75].map((pct) => (
                <div
                  key={pct}
                  style={{
                    position: 'absolute',
                    left: 0, right: 0,
                    bottom: `${pct * 100}%`,
                    height: 1,
                    background: FL.graphGrid,
                    pointerEvents: 'none',
                  }}
                />
              ))}

              {row.steps.map((step, idx) => {
                const isCurrent = idx === currentStep && isPreviewPlaying;
                const isBeatStart = idx % stepsPerBeat === 0;
                return (
                  <div
                    key={idx}
                    className="shrink-0 flex items-end justify-center cursor-ns-resize"
                    style={{
                      width: stepW,
                      height: GRAPH_H,
                      borderLeft: isBeatStart ? `1px solid ${FL.graphGrid}` : undefined,
                      background: isCurrent ? 'rgba(255,255,255,0.03)' : undefined,
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const update = (ev: MouseEvent) => {
                        const pct = 1 - Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
                        setStepVelocity(track.id, selectedRow!, idx, Math.max(0.05, pct));
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
                        style={{
                          width: Math.max(4, stepW * 0.6),
                          height: `${step.velocity * 100}%`,
                          background: `linear-gradient(to top, ${row.color}, ${row.color}cc)`,
                          borderRadius: '2px 2px 0 0',
                          opacity: 0.9,
                          boxShadow: `0 0 4px ${row.color}40`,
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

      {/* ── Context menu ──────────────────────────────────────────────── */}
      {rowCtxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRowCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setRowCtxMenu(null); }} />
          <div
            className="fixed z-50 py-1"
            style={{
              left: Math.min(rowCtxMenu.x, window.innerWidth - 180),
              top: Math.min(rowCtxMenu.y, window.innerHeight - 260),
              background: FL.headerBg,
              border: `1px solid ${FL.borderLight}`,
              borderRadius: 4,
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              minWidth: 160,
            }}
          >
            <CtxMenuItem
              label="Rename / Color..."
              onClick={() => {
                setInlineRenameRowId(rowCtxMenu.rowId);
                const r = pattern.rows.find((r) => r.id === rowCtxMenu.rowId);
                setInlineRenameValue(r?.name ?? '');
                setRowCtxMenu(null);
              }}
            />
            <CtxMenuSep />

            {/* Color swatches */}
            <div style={{ padding: '4px 8px', display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {ROW_COLORS.map((c) => (
                <div
                  key={c}
                  style={{
                    width: 14, height: 14, borderRadius: 3, background: c, cursor: 'pointer',
                    border: pattern.rows.find((r) => r.id === rowCtxMenu.rowId)?.color === c
                      ? '2px solid #fff' : '1px solid rgba(255,255,255,0.1)',
                  }}
                  onClick={() => {
                    setRowColor(track.id, rowCtxMenu.rowId, c);
                    setRowCtxMenu(null);
                  }}
                />
              ))}
            </div>
            <CtxMenuSep />

            <CtxMenuItem
              label="Clone Channel"
              onClick={() => { cloneRow(track.id, rowCtxMenu.rowId); setRowCtxMenu(null); }}
            />
            <CtxMenuSep />

            <CtxMenuItem
              label="Fill every 2 steps"
              onClick={() => { fillRow(track.id, rowCtxMenu.rowId, 2); setRowCtxMenu(null); }}
            />
            <CtxMenuItem
              label="Fill every 4 steps"
              onClick={() => { fillRow(track.id, rowCtxMenu.rowId, 4); setRowCtxMenu(null); }}
            />
            <CtxMenuItem
              label="Fill every 8 steps"
              onClick={() => { fillRow(track.id, rowCtxMenu.rowId, 8); setRowCtxMenu(null); }}
            />
            <CtxMenuSep />

            <CtxMenuItem
              label="Clear Steps"
              onClick={() => { clearRow(track.id, rowCtxMenu.rowId); setRowCtxMenu(null); }}
            />
            <CtxMenuItem
              label="Preview Sound"
              onClick={() => {
                previewSample(pattern.rows.find((r) => r.id === rowCtxMenu.rowId)?.sampleKey ?? '', 0.8);
              }}
            />
            <CtxMenuSep />

            <CtxMenuItem
              label="Delete Channel"
              danger
              onClick={() => {
                if (soloRowId === rowCtxMenu.rowId) setSoloRowId(null);
                removeRow(track.id, rowCtxMenu.rowId);
                setRowCtxMenu(null);
                if (selectedRow === rowCtxMenu.rowId) setSelectedRow(null);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ── Context Menu Item ────────────────────────────────────────────── */

function CtxMenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '4px 12px', fontSize: 11, border: 'none', cursor: 'pointer',
        background: 'transparent',
        color: danger ? '#e74c3c' : FL.text,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = danger ? 'rgba(231,76,60,0.15)' : FL.stepOff;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      {label}
    </button>
  );
}

function CtxMenuSep() {
  return <div style={{ margin: '2px 8px', height: 1, background: FL.border }} />;
}

/* ── Sample Picker Dropdown ─────────────────────────────────────────── */

interface SamplePickerDropdownProps {
  currentKey: string;
  onSelect: (key: string, name: string) => void;
  onClose: () => void;
  onPreview: (key: string) => void;
}

function SamplePickerDropdown({ currentKey, onSelect, onClose, onPreview }: SamplePickerDropdownProps) {
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
      <div
        className="absolute left-0 z-50 mt-1 py-1"
        style={{
          background: FL.headerBg,
          border: `1px solid ${FL.borderLight}`,
          borderRadius: 4,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          width: 180,
        }}
      >
        <div style={{ padding: '4px 8px', fontSize: 9, color: FL.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Built-in Samples
        </div>
        {ALL_DRUM_SAMPLES.map((kit) => (
          <button
            key={kit.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              padding: '4px 8px', fontSize: 11, border: 'none', cursor: 'pointer',
              background: 'transparent', textAlign: 'left',
              color: currentKey === kit.id ? FL.accentBright : FL.text,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = FL.stepOff; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            onClick={() => onSelect(kit.id, kit.name)}
            onMouseDown={() => onPreview(kit.id)}
          >
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: kit.color }} />
            <span style={{ flex: 1 }}>{kit.name}</span>
            {currentKey === kit.id && <span style={{ color: FL.accentBright }}>✓</span>}
          </button>
        ))}
        <div style={{ margin: '2px 8px', height: 1, background: FL.border }} />
        <button
          style={{
            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
            padding: '4px 8px', fontSize: 11, border: 'none', cursor: 'pointer',
            background: 'transparent', textAlign: 'left', color: '#f39c12',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = FL.stepOff; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          onClick={() => fileInputRef.current?.click()}
        >
          <span style={{ fontSize: 12 }}>📂</span>
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
