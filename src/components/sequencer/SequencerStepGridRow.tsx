import type { SequencerRow } from '../../types/project';
import { FL } from './SequencerConstants';

interface StepSelection {
  rowStart: number;
  rowEnd: number;
  stepStart: number;
  stepEnd: number;
}

interface SequencerStepGridRowProps {
  row: SequencerRow;
  rowIdx: number;
  patternStepsPerBar: number;
  stepH: number;
  stepW: number;
  stepsPerBeat: number;
  currentStep: number;
  isPreviewPlaying: boolean;
  isAudible: boolean;
  selection: StepSelection | null;
  copyGhostOffset: number | null;
  isSelectedCell: (rowIdx: number, stepIdx: number) => boolean;
  onGridMouseDown: (rowId: string, stepIdx: number, e: React.MouseEvent<HTMLDivElement>) => void;
  onVelocityMouseDown: (rowId: string, stepIdx: number, e: React.MouseEvent<HTMLDivElement>) => void;
  onStepContextMenu?: (rowId: string, stepIdx: number, x: number, y: number) => void;
  onAddBar: () => void;
}

export function SequencerStepGridRow({
  row,
  rowIdx,
  patternStepsPerBar,
  stepH,
  stepW,
  stepsPerBeat,
  currentStep,
  isPreviewPlaying,
  isAudible,
  selection,
  copyGhostOffset,
  isSelectedCell,
  onGridMouseDown,
  onVelocityMouseDown,
  onStepContextMenu,
  onAddBar,
}: SequencerStepGridRowProps) {
  return (
    <div className="flex" style={{ height: stepH, opacity: isAudible ? 1 : 0.3, borderBottom: `1px solid ${FL.border}` }}>
      {row.steps.map((step, idx) => {
        const isBeatStart = idx % stepsPerBeat === 0;
        const isBarStart = idx % patternStepsPerBar === 0;
        const isCurrent = idx === currentStep && isPreviewPlaying;
        const selected = isSelectedCell(rowIdx, idx);
        const isOddBeat = Math.floor(idx / stepsPerBeat) % 2 === 1;
        const hasProbability = step.active && step.probability < 1;
        const hasParamLocks = step.active && Object.keys(step.stepParams).length > 0;

        let isGhost = false;
        if (copyGhostOffset !== null && copyGhostOffset !== 0 && selection) {
          const rMin = Math.min(selection.rowStart, selection.rowEnd);
          const rMax = Math.max(selection.rowStart, selection.rowEnd);
          const sMin = Math.min(selection.stepStart, selection.stepEnd);
          const sMax = Math.max(selection.stepStart, selection.stepEnd);
          if (rowIdx >= rMin && rowIdx <= rMax) {
            const srcStep = idx - copyGhostOffset;
            isGhost = srcStep >= sMin && srcStep <= sMax && !!row.steps[srcStep]?.active;
          }
        }

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
              background: step.active ? undefined : isOddBeat ? FL.beatBg : FL.stepOff,
              cursor: 'pointer',
            }}
            onMouseDown={(e) => onGridMouseDown(row.id, idx, e)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (step.active && onStepContextMenu) {
                onStepContextMenu(row.id, idx, e.clientX, e.clientY);
              } else {
                onVelocityMouseDown(row.id, idx, e);
              }
            }}
          >
            {/* Step pad fill */}
            <div
              style={{
                position: 'absolute',
                left: 2,
                top: 2,
                right: 2,
                bottom: 2,
                borderRadius: 3,
                background: step.active ? row.color : isOddBeat ? '#393939' : '#363636',
                opacity: step.active ? 0.3 + step.velocity * 0.7 : undefined,
                boxShadow: step.active
                  ? 'inset 0 1px 0 rgba(255,255,255,0.15), 0 1px 2px rgba(0,0,0,0.3)'
                  : 'inset 0 1px 2px rgba(0,0,0,0.4), inset 0 -1px 0 rgba(255,255,255,0.03)',
              }}
            />

            {/* Probability indicator: dashed border for < 100% */}
            {hasProbability && (
              <div
                data-testid="probability-indicator"
                style={{
                  position: 'absolute',
                  left: 1,
                  top: 1,
                  right: 1,
                  bottom: 1,
                  borderRadius: 3,
                  border: '1.5px dashed rgba(255,255,255,0.5)',
                  pointerEvents: 'none',
                }}
              />
            )}

            {/* Probability percentage label for active steps with < 100% */}
            {hasProbability && stepW >= 24 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 1,
                  left: 0,
                  right: 0,
                  textAlign: 'center',
                  fontSize: 7,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.7)',
                  pointerEvents: 'none',
                  lineHeight: 1,
                }}
              >
                {Math.round(step.probability * 100)}%
              </div>
            )}

            {/* Parameter lock indicator dot */}
            {hasParamLocks && (
              <div
                data-testid="param-lock-indicator"
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 3,
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: '#fbbf24',
                  pointerEvents: 'none',
                }}
              />
            )}

            {isCurrent && <div style={{ position: 'absolute', inset: 0, border: '1px solid rgba(255,255,255,0.3)', borderRadius: 3, pointerEvents: 'none' }} />}
            {selected && <div style={{ position: 'absolute', inset: 0, border: '2px solid #3498db80', background: 'rgba(52,152,219,0.1)', pointerEvents: 'none' }} />}
            {isGhost && !step.active && (
              <div
                style={{
                  position: 'absolute',
                  left: 2,
                  top: 2,
                  right: 2,
                  bottom: 2,
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

      <div
        className="shrink-0 flex items-center justify-center cursor-pointer"
        style={{ width: stepW * 2, height: stepH, borderLeft: `1px solid ${FL.borderLight}`, color: FL.textDim, fontSize: 16 }}
        onMouseEnter={(e) => { e.currentTarget.style.color = FL.accentBright; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = FL.textDim; }}
        onClick={onAddBar}
        title="Add 1 bar"
      >
        +
      </div>
    </div>
  );
}
