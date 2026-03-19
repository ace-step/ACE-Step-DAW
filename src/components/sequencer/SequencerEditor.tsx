import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { ALL_DRUM_SAMPLES } from '../../constants/tracks';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { bounceSequencerToAudio } from '../../services/sequencerBounce';
import { getSample } from '../../services/sampleManager';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { FL, GRAPH_H, ROW_LABEL_W, ROW_SIZES } from './SequencerConstants';
import { MiniKnob } from './MiniKnob';
import { SamplePickerDropdown } from './SamplePicker';
import { SequencerContextMenu, type RowContextMenuState } from './SequencerContextMenu';
import { SequencerRowHeader } from './SequencerRowHeader';
import { SequencerStepGrid } from './SequencerStepGrid';
import { SequencerToolbar } from './SequencerToolbar';

export function SequencerEditor() {
  const trackId = useUIStore((s) => s.openSequencerTrackId);
  const editorHeight = useUIStore((s) => s.sequencerEditorHeight);
  const setEditorHeight = useUIStore((s) => s.setSequencerEditorHeight);
  const closeEditor = useUIStore((s) => s.setOpenSequencerTrackId);
  const setHistoryFocusScope = useUIStore((s) => s.setHistoryFocusScope);

  const project = useProjectStore((s) => s.project);
  const track = useMemo(() => project?.tracks.find((t) => t.id === trackId) ?? null, [project, trackId]);

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

  const [rowSize, setRowSize] = useState<keyof typeof ROW_SIZES>('normal');
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [samplePickerRow, setSamplePickerRow] = useState<string | null>(null);
  const [showAddInstrument, setShowAddInstrument] = useState(false);
  const [rowCtxMenu, setRowCtxMenu] = useState<RowContextMenuState | null>(null);
  const [isBouncing, setIsBouncing] = useState(false);
  const [soloRowId, setSoloRowId] = useState<string | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewStep, setPreviewStep] = useState(-1);
  const [selection, setSelection] = useState<{
    rowStart: number;
    rowEnd: number;
    stepStart: number;
    stepEnd: number;
  } | null>(null);
  const [copyGhostOffset, setCopyGhostOffset] = useState<number | null>(null);
  const [dragRowIdx, setDragRowIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [inlineRenameRowId, setInlineRenameRowId] = useState<string | null>(null);
  const [inlineRenameValue, setInlineRenameValue] = useState('');

  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const previewSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const previewRafRef = useRef<number | null>(null);
  const previewStartRef = useRef<{ ctxTime: number; loopDuration: number } | null>(null);
  const togglePreviewRef = useRef<() => void>(() => {});
  const selectionRef = useRef(selection);
  const inlineRenameInputRef = useRef<HTMLInputElement>(null);

  selectionRef.current = selection;

  useEffect(() => {
    if (track && !track.sequencerPattern) initPattern(track.id);
  }, [track, initPattern]);

  const stopPreview = useCallback(() => {
    for (const source of previewSourcesRef.current) {
      try { source.stop(); } catch {}
      source.disconnect();
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

  useEffect(() => () => stopPreview(), [trackId, stopPreview]);

  useEffect(() => {
    if (inlineRenameRowId && inlineRenameInputRef.current) {
      inlineRenameInputRef.current.focus();
      inlineRenameInputRef.current.select();
    }
  }, [inlineRenameRowId]);

  const pattern = track?.sequencerPattern ?? null;
  const bpm = project?.bpm ?? 120;
  const totalSteps = pattern ? pattern.stepsPerBar * pattern.bars : 0;
  const stepDuration = totalSteps > 0 ? (60 / bpm) / ((pattern?.stepsPerBar ?? 16) / 4) : 0;
  const patternDuration = stepDuration * totalSteps;

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

  const startPreview = useCallback(async () => {
    if (!pattern || patternDuration <= 0) return;
    stopPreview();

    const engine = getAudioEngine();
    await engine.resume();
    const ctx = engine.ctx;
    const sampleBuffers = new Map<string, AudioBuffer>();
    const isAudible = (rowId: string, muted: boolean) => (soloRowId ? rowId === soloRowId : !muted);

    for (const row of pattern.rows) {
      if (!isAudible(row.id, row.muted)) continue;
      const buf = await getSample(ctx, row.sampleKey);
      if (buf) sampleBuffers.set(row.sampleKey, buf);
    }

    const now = ctx.currentTime;
    const sources: AudioBufferSourceNode[] = [];
    for (let loop = 0; loop < 2; loop++) {
      const loopOffset = loop * patternDuration;
      for (const row of pattern.rows) {
        if (!isAudible(row.id, row.muted)) continue;
        const buffer = sampleBuffers.get(row.sampleKey);
        if (!buffer) continue;
        for (let stepIdx = 0; stepIdx < row.steps.length; stepIdx++) {
          const step = row.steps[stepIdx];
          if (!step.active) continue;
          const swingOffset = pattern.swing > 0 && stepIdx % 2 === 1
            ? stepDuration * pattern.swing * 0.5
            : 0;
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
      const elapsed = getAudioEngine().ctx.currentTime - previewStartRef.current.ctxTime;
      const pos = elapsed % previewStartRef.current.loopDuration;
      setPreviewStep(Math.floor(pos / stepDuration));
      if (elapsed >= previewStartRef.current.loopDuration * 2) {
        stopPreview();
        return;
      }
      previewRafRef.current = requestAnimationFrame(animate);
    };
    previewRafRef.current = requestAnimationFrame(animate);
  }, [pattern, patternDuration, stepDuration, soloRowId, stopPreview]);

  const togglePreview = useCallback(() => {
    if (isPreviewPlaying) stopPreview();
    else void startPreview();
  }, [isPreviewPlaying, startPreview, stopPreview]);

  togglePreviewRef.current = togglePreview;

  useEffect(() => {
    if (!trackId) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        togglePreviewRef.current();
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        if (selectionRef.current) setSelection(null);
        else {
          stopPreview();
          closeEditor(null);
        }
        return;
      }

      if (e.code !== 'Delete' && e.code !== 'Backspace') return;
      const currentSelection = selectionRef.current;
      if (!currentSelection) return;

      e.preventDefault();
      e.stopPropagation();
      const state = useProjectStore.getState();
      const currentTrack = state.project?.tracks.find((candidate) => candidate.id === trackId);
      const currentPattern = currentTrack?.sequencerPattern;
      if (!currentTrack || !currentPattern) return;

      const rMin = Math.min(currentSelection.rowStart, currentSelection.rowEnd);
      const rMax = Math.max(currentSelection.rowStart, currentSelection.rowEnd);
      const sMin = Math.min(currentSelection.stepStart, currentSelection.stepEnd);
      const sMax = Math.max(currentSelection.stepStart, currentSelection.stepEnd);
      const ops: { rowId: string; stepIndex: number; active: boolean; velocity: number }[] = [];

      for (let ri = rMin; ri <= rMax; ri++) {
        const row = currentPattern.rows[ri];
        if (!row) continue;
        for (let si = sMin; si <= sMax; si++) {
          const step = row.steps[si];
          if (step?.active) ops.push({ rowId: row.id, stepIndex: si, active: false, velocity: step.velocity });
        }
      }

      if (ops.length > 0) state.batchSetSequencerSteps(currentTrack.id, ops);
      setSelection(null);
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [trackId, closeEditor, stopPreview]);

  if (!trackId || !track || !project || !pattern) return null;

  const { stepH, stepW } = ROW_SIZES[rowSize];
  const currentStep = isPreviewPlaying ? previewStep : -1;
  const gridWidth = totalSteps * stepW;
  const stepsPerBeat = pattern.stepsPerBar / 4;

  const isRowAudible = (rowId: string, muted: boolean) => (soloRowId ? rowId === soloRowId : !muted);

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
      setEditorHeight(resizeRef.current.startH + resizeRef.current.startY - ev.clientY);
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
    if (inlineRenameRowId && inlineRenameValue.trim()) renameRow(track.id, inlineRenameRowId, inlineRenameValue.trim());
    setInlineRenameRowId(null);
    setInlineRenameValue('');
  };

  const openRenameMenu = (rowId: string) => {
    const row = pattern.rows.find((candidate) => candidate.id === rowId);
    setInlineRenameRowId(rowId);
    setInlineRenameValue(row?.name ?? '');
    setRowCtxMenu(null);
  };

  const updateSelectedRowSample = (rowId: string, key: string, name: string) => {
    setRowSample(track.id, rowId, key);
    const state = useProjectStore.getState();
    if (!state.project) return;
    const updatedTracks = state.project.tracks.map((candidate) => {
      if (candidate.id !== track.id || !candidate.sequencerPattern) return candidate;
      return {
        ...candidate,
        sequencerPattern: {
          ...candidate.sequencerPattern,
          rows: candidate.sequencerPattern.rows.map((row) => (row.id === rowId ? { ...row, name } : row)),
        },
      };
    });
    useProjectStore.setState({
      project: { ...state.project, tracks: updatedTracks, updatedAt: Date.now() },
    });
  };

  const renderVelocityLane = () => {
    if (!selectedRow) return null;
    const row = pattern.rows.find((candidate) => candidate.id === selectedRow);
    if (!row) return null;

    return (
      <div className="shrink-0 flex" style={{ height: GRAPH_H, borderTop: `1px solid ${FL.border}` }}>
        <div className="shrink-0 flex flex-col justify-center px-2" style={{ width: ROW_LABEL_W, background: FL.graphBg }}>
          <div className="flex items-center gap-1.5">
            <div style={{ width: 3, height: 12, borderRadius: 1, background: row.color }} />
            <span style={{ fontSize: 9, color: FL.text, fontWeight: 600 }}>VELOCITY</span>
          </div>
          <span style={{ fontSize: 8, color: FL.textDim, marginTop: 2 }}>{row.name}</span>
        </div>

        <div className="flex items-end overflow-hidden relative" style={{ background: FL.graphBg, flex: 1 }}>
          {[0.25, 0.5, 0.75].map((pct) => (
            <div
              key={pct}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: `${pct * 100}%`,
                height: 1,
                background: FL.graphGrid,
                pointerEvents: 'none',
              }}
            />
          ))}

          {row.steps.map((step, idx) => (
            <div
              key={idx}
              className="shrink-0 flex items-end justify-center cursor-ns-resize"
              style={{
                width: stepW,
                height: GRAPH_H,
                borderLeft: idx % stepsPerBeat === 0 ? `1px solid ${FL.graphGrid}` : undefined,
                background: idx === currentStep && isPreviewPlaying ? 'rgba(255,255,255,0.03)' : undefined,
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const update = (ev: MouseEvent) => {
                  const pct = 1 - Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
                  setStepVelocity(track.id, row.id, idx, Math.max(0.05, pct));
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
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className="flex flex-col select-none"
      style={{ height: editorHeight, background: FL.bg }}
      tabIndex={-1}
      onMouseDownCapture={() => setHistoryFocusScope('track')}
      onFocusCapture={() => setHistoryFocusScope('track')}
    >
      <div className="h-1 cursor-ns-resize shrink-0" style={{ background: FL.headerBg }} onMouseDown={onResizeStart}>
        <div className="mx-auto mt-px" style={{ width: 40, height: 2, borderRadius: 1, background: FL.borderLight }} />
      </div>

      <SequencerToolbar
        trackName={track.displayName}
        stepsPerBar={pattern.stepsPerBar}
        bars={pattern.bars}
        swing={pattern.swing}
        rowSize={rowSize}
        isPreviewPlaying={isPreviewPlaying}
        isBouncing={isBouncing}
        onSetStepsPerBar={(value) => setStepsPerBar(track.id, value)}
        onSetBars={(value) => setBars(track.id, value)}
        onSetSwing={(value) => updateSwing(track.id, value)}
        onSetRowSize={setRowSize}
        onTogglePreview={togglePreview}
        onBounce={() => void handleBounce()}
        onClose={() => { stopPreview(); closeEditor(null); }}
      />

      <div ref={gridScrollRef} className="flex-1 overflow-auto relative" style={{ minHeight: 0 }}>
        <div className="flex" style={{ minWidth: ROW_LABEL_W + gridWidth }}>
          <div className="sticky left-0 z-10 shrink-0" style={{ width: ROW_LABEL_W, background: FL.bg, borderRight: `1px solid ${FL.border}` }}>
            <div style={{ height: 18, borderBottom: `1px solid ${FL.border}` }} />
            {pattern.rows.map((row, rowIdx) => (
              <SequencerRowHeader
                key={row.id}
                row={row}
                rowIdx={rowIdx}
                stepH={stepH}
                isSelected={selectedRow === row.id}
                isSoloed={soloRowId === row.id}
                isAudible={isRowAudible(row.id, row.muted)}
                isDragTarget={dragOverIdx === rowIdx && dragRowIdx !== rowIdx}
                inlineRenameRowId={inlineRenameRowId}
                inlineRenameValue={inlineRenameValue}
                inlineRenameInputRef={inlineRenameInputRef}
                samplePickerRow={samplePickerRow}
                onSelectRow={(rowId) => setSelectedRow(rowId === selectedRow ? null : rowId)}
                onOpenContextMenu={(rowId, x, y) => setRowCtxMenu({ rowId, x, y })}
                onToggleMute={(rowId) => toggleRowMute(track.id, rowId)}
                onToggleSolo={(rowId) => setSoloRowId(soloRowId === rowId ? null : rowId)}
                onSetPan={(rowId, value) => setRowPan(track.id, rowId, value)}
                onSetVolume={(rowId, value) => setRowVolume(track.id, rowId, value)}
                onToggleSamplePicker={(rowId) => setSamplePickerRow(rowId || null)}
                onStartInlineRename={(rowData) => {
                  setInlineRenameRowId(rowData.id);
                  setInlineRenameValue(rowData.name);
                }}
                onInlineRenameChange={setInlineRenameValue}
                onCommitInlineRename={commitInlineRename}
                onCancelInlineRename={() => {
                  setInlineRenameRowId(null);
                  setInlineRenameValue('');
                }}
                onDragStart={(idx, e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(idx));
                  setDragRowIdx(idx);
                }}
                onDragOver={(idx, e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverIdx(idx);
                }}
                onDragEnd={() => {
                  setDragRowIdx(null);
                  setDragOverIdx(null);
                }}
                onDrop={(idx) => {
                  if (dragRowIdx !== null && dragRowIdx !== idx) reorderRows(track.id, dragRowIdx, idx);
                  setDragRowIdx(null);
                  setDragOverIdx(null);
                }}
              />
            ))}

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
                onMouseEnter={(e) => { e.currentTarget.style.color = FL.accentBright; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = FL.textDim; }}
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
                    const sample = ALL_DRUM_SAMPLES.find((candidate) => candidate.id === key);
                    addRow(track.id, key, name, sample?.color ?? '#71717a');
                    setShowAddInstrument(false);
                  }}
                  onClose={() => setShowAddInstrument(false)}
                  onPreview={(key) => void previewSample(key, 0.8)}
                />
              )}
            </div>

            {samplePickerRow && (
              <SamplePickerDropdown
                currentKey={pattern.rows.find((row) => row.id === samplePickerRow)?.sampleKey ?? ''}
                onSelect={(key, name) => {
                  updateSelectedRowSample(samplePickerRow, key, name);
                  setSamplePickerRow(null);
                }}
                onClose={() => setSamplePickerRow(null)}
                onPreview={(key) => void previewSample(key, 0.8)}
              />
            )}
          </div>

          <SequencerStepGrid
            trackId={track.id}
            pattern={pattern}
            stepH={stepH}
            stepW={stepW}
            stepsPerBeat={stepsPerBeat}
            currentStep={currentStep}
            isPreviewPlaying={isPreviewPlaying}
            selection={selection}
            copyGhostOffset={copyGhostOffset}
            soloRowId={soloRowId}
            onSelectionChange={setSelection}
            onCopyGhostOffsetChange={setCopyGhostOffset}
            onToggleStep={toggleStep}
            onSetStepVelocity={setStepVelocity}
            onBatchSetSteps={batchSetSteps}
            onPreviewSample={(key, velocity) => void previewSample(key, velocity)}
            onAddBar={() => setBars(track.id, pattern.bars + 1)}
          />
        </div>
      </div>

      {renderVelocityLane()}

      <SequencerContextMenu
        menu={rowCtxMenu}
        rows={pattern.rows}
        onClose={() => setRowCtxMenu(null)}
        onRename={openRenameMenu}
        onSetColor={(rowId, color) => {
          setRowColor(track.id, rowId, color);
          setRowCtxMenu(null);
        }}
        onClone={(rowId) => {
          cloneRow(track.id, rowId);
          setRowCtxMenu(null);
        }}
        onFill={(rowId, every) => {
          fillRow(track.id, rowId, every);
          setRowCtxMenu(null);
        }}
        onClear={(rowId) => {
          clearRow(track.id, rowId);
          setRowCtxMenu(null);
        }}
        onPreview={(rowId) => {
          const row = pattern.rows.find((candidate) => candidate.id === rowId);
          if (row) void previewSample(row.sampleKey, 0.8);
        }}
        onDelete={(rowId) => {
          if (soloRowId === rowId) setSoloRowId(null);
          removeRow(track.id, rowId);
          setRowCtxMenu(null);
          if (selectedRow === rowId) setSelectedRow(null);
        }}
      />
    </div>
  );
}
