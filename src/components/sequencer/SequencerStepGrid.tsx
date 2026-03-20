import { useRef } from 'react';
import type { SequencerPattern } from '../../types/project';
import { FL } from './SequencerConstants';
import { SequencerStepGridRow } from './SequencerStepGridRow';
import { Z } from '../../utils/zIndex';

interface StepSelection {
  rowStart: number;
  rowEnd: number;
  stepStart: number;
  stepEnd: number;
}

interface BatchStepOp {
  rowId: string; stepIndex: number; active: boolean; velocity: number;
}

interface SequencerStepGridProps {
  trackId: string;
  pattern: SequencerPattern;
  stepH: number;
  stepW: number;
  stepsPerBeat: number;
  currentStep: number;
  isPreviewPlaying: boolean;
  selection: StepSelection | null;
  copyGhostOffset: number | null;
  soloRowId: string | null;
  onSelectionChange: (selection: StepSelection | null) => void;
  onCopyGhostOffsetChange: (offset: number | null) => void;
  onToggleStep: (trackId: string, rowId: string, stepIdx: number) => void;
  onSetStepVelocity: (trackId: string, rowId: string, stepIdx: number, velocity: number) => void;
  onBatchSetSteps: (trackId: string, ops: BatchStepOp[]) => void;
  onPreviewSample: (sampleKey: string, velocity: number) => void;
  onAddBar: () => void;
}

export function SequencerStepGrid({
  trackId,
  pattern,
  stepH,
  stepW,
  stepsPerBeat,
  currentStep,
  isPreviewPlaying,
  selection,
  copyGhostOffset,
  soloRowId,
  onSelectionChange,
  onCopyGhostOffsetChange,
  onToggleStep,
  onSetStepVelocity,
  onBatchSetSteps,
  onPreviewSample,
  onAddBar,
}: SequencerStepGridProps) {
  const marqueeRef = useRef<{ anchorRowIdx: number; anchorStepIdx: number; active: boolean } | null>(null);
  const shiftDragRef = useRef<{
    origSelection: StepSelection;
    anchorStepIdx: number;
    lastOffset: number;
  } | null>(null);
  const patternRef = useRef(pattern);
  const selectionRef = useRef(selection);

  patternRef.current = pattern;
  selectionRef.current = selection;

  const isRowAudible = (rowId: string, muted: boolean) => (soloRowId ? rowId === soloRowId : !muted);

  const isInSelection = (rowIdx: number, stepIdx: number) => {
    if (!selectionRef.current) return false;
    const rMin = Math.min(selectionRef.current.rowStart, selectionRef.current.rowEnd);
    const rMax = Math.max(selectionRef.current.rowStart, selectionRef.current.rowEnd);
    const sMin = Math.min(selectionRef.current.stepStart, selectionRef.current.stepEnd);
    const sMax = Math.max(selectionRef.current.stepStart, selectionRef.current.stepEnd);
    return rowIdx >= rMin && rowIdx <= rMax && stepIdx >= sMin && stepIdx <= sMax;
  };

  const handleVelocityMouseDown = (rowId: string, stepIdx: number, e: React.MouseEvent | React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const row = patternRef.current.rows.find((candidate) => candidate.id === rowId);
    const startVel = row?.steps[stepIdx]?.velocity ?? 0.8;
    const onMove = (ev: MouseEvent) => {
      const dy = startY - ev.clientY;
      const newVel = Math.max(0.05, Math.min(1, startVel + dy * 0.005));
      onSetStepVelocity(trackId, rowId, stepIdx, newVel);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleGridMouseDown = (rowId: string, stepIdx: number, e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();

    const rowIdx = patternRef.current.rows.findIndex((row) => row.id === rowId);
    if (rowIdx < 0) return;

    if (e.shiftKey && selectionRef.current) {
      const currentSelection = selectionRef.current;
      const rMin = Math.min(currentSelection.rowStart, currentSelection.rowEnd);
      const rMax = Math.max(currentSelection.rowStart, currentSelection.rowEnd);
      const sMin = Math.min(currentSelection.stepStart, currentSelection.stepEnd);
      const sMax = Math.max(currentSelection.stepStart, currentSelection.stepEnd);

      if (rowIdx >= rMin && rowIdx <= rMax && stepIdx >= sMin && stepIdx <= sMax) {
        shiftDragRef.current = {
          origSelection: { rowStart: rMin, rowEnd: rMax, stepStart: sMin, stepEnd: sMax },
          anchorStepIdx: stepIdx,
          lastOffset: 0,
        };
        onCopyGhostOffsetChange(0);

        const onMove = (ev: MouseEvent) => {
          if (!shiftDragRef.current) return;
          const target = document.elementFromPoint(ev.clientX, ev.clientY);
          const stepEl = target instanceof HTMLElement
            ? target.closest('[data-seq-step]') as HTMLElement | null
            : null;
          if (!stepEl) return;
          const hoverStep = Number(stepEl.dataset.seqStep);
          if (Number.isNaN(hoverStep)) return;
          const offset = hoverStep - shiftDragRef.current.anchorStepIdx;
          shiftDragRef.current.lastOffset = offset;
          onCopyGhostOffsetChange(offset);
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          if (!shiftDragRef.current) return;
          const { origSelection, lastOffset } = shiftDragRef.current;
          shiftDragRef.current = null;
          onCopyGhostOffsetChange(null);
          if (lastOffset === 0) return;

          const ops: BatchStepOp[] = [];
          for (let ri = origSelection.rowStart; ri <= origSelection.rowEnd; ri++) {
            const row = patternRef.current.rows[ri];
            if (!row) continue;
            for (let si = origSelection.stepStart; si <= origSelection.stepEnd; si++) {
              const step = row.steps[si];
              if (!step?.active) continue;
              const destStep = si + lastOffset;
              if (destStep < 0 || destStep >= row.steps.length) continue;
              ops.push({ rowId: row.id, stepIndex: destStep, active: true, velocity: step.velocity });
            }
          }
          if (ops.length > 0) {
            onBatchSetSteps(trackId, ops);
            onSelectionChange({
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
      const stepEl = target instanceof HTMLElement
        ? target.closest('[data-seq-step]') as HTMLElement | null
        : null;
      if (!stepEl) return;
      const hoverRow = stepEl.dataset.seqRow;
      const hoverStep = Number(stepEl.dataset.seqStep);
      if (!hoverRow || Number.isNaN(hoverStep)) return;
      const hoverRowIdx = patternRef.current.rows.findIndex((row) => row.id === hoverRow);
      if (hoverRowIdx < 0) return;
      marqueeRef.current.active = true;
      onSelectionChange({
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
        onToggleStep(trackId, rowId, stepIdx);
        const row = patternRef.current.rows.find((candidate) => candidate.id === rowId);
        if (row) {
          const step = row.steps[stepIdx];
          if (!step?.active) onPreviewSample(row.sampleKey, step?.velocity ?? 0.8);
        }
      }
      marqueeRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="relative">
      <div className="flex" style={{ height: 18, borderBottom: `1px solid ${FL.border}` }}>
        {Array.from({ length: pattern.stepsPerBar * pattern.bars }).map((_, idx) => {
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
            width: stepW * 2,
            height: 18,
            background: 'transparent',
            border: 'none',
            borderLeft: `1px solid ${FL.borderLight}`,
            color: FL.textDim,
            fontSize: 10,
            fontWeight: 700,
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = FL.accentBright; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = FL.textDim; }}
          onClick={onAddBar}
          title="Add 1 bar"
        >
          +1
        </button>
      </div>

      {pattern.rows.map((row, rowIdx) => (
        <SequencerStepGridRow
          key={row.id}
          row={row}
          rowIdx={rowIdx}
          patternStepsPerBar={pattern.stepsPerBar}
          stepH={stepH}
          stepW={stepW}
          stepsPerBeat={stepsPerBeat}
          currentStep={currentStep}
          isPreviewPlaying={isPreviewPlaying}
          isAudible={isRowAudible(row.id, row.muted)}
          selection={selectionRef.current}
          copyGhostOffset={copyGhostOffset}
          isSelectedCell={isInSelection}
          onGridMouseDown={handleGridMouseDown}
          onVelocityMouseDown={handleVelocityMouseDown}
          onAddBar={onAddBar}
        />
      ))}

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
            zIndex: Z.clipContent,
            transition: 'left 60ms linear',
            borderRadius: 1,
          }}
        />
      )}
    </div>
  );
}
