import React from 'react';
import { createPortal } from 'react-dom';
import type { MidiClipData, StretchMode } from '../../types/project';
import { hexToRgba } from '../../utils/color';
import { Z } from '../../utils/zIndex';
import { CanvasClipWaveform } from './CanvasClipWaveform';
import { CanvasClipMidiThumbnail } from './CanvasClipMidiThumbnail';
import type { DragGhostInfo } from './useClipDrag';
import { HEADER_RAIL_HEIGHT_PX } from './useClipDrag';
import type { ClipPresentation } from './clipPresentation';

interface ClipDragGhostProps {
  dragGhost: DragGhostInfo;
  ghostLanding: boolean;
  clipColor: string;
  clipPresentation: ClipPresentation;
  left: number;
  width: number;
  peaks: number[] | null;
  audioDuration: number;
  audioOffset: number;
  clipDuration: number;
  contentOffset: number;
  timeStretchRate: number | undefined;
  stretchMode: StretchMode | undefined;
  isMidiClip: boolean;
  midiData: MidiClipData | undefined;
  bpm: number;
  prompt: string | undefined;
  displayName: string;
  trackVolume?: number;
}

export function ClipDragGhost({
  dragGhost,
  ghostLanding,
  clipColor,
  clipPresentation,
  left,
  width,
  peaks,
  audioDuration,
  audioOffset,
  clipDuration,
  contentOffset,
  timeStretchRate,
  stretchMode,
  isMidiClip,
  midiData,
  bpm,
  prompt,
  displayName,
  trackVolume,
}: ClipDragGhostProps) {
  if (!dragGhost.targetTrackId) return null;

  const isValid = dragGhost.isValidDrop !== false;
  const invalidColor = '#ef4444'; // red-500

  return createPortal(
    <>
      {dragGhost.sourceLaneRect && dragGhost.isShiftCopy && (
        <div
          className="fixed pointer-events-none"
          data-layer="drag-ghost-source"
          style={{
            zIndex: Z.dragGhost,
            left: left,
            top: dragGhost.sourceLaneRect.top + 4,
            width,
            height: dragGhost.sourceLaneRect.height - 8,
            border: `1.5px dashed ${hexToRgba(clipColor, 0.4)}`,
            borderRadius: 2,
            backgroundColor: hexToRgba(clipColor, 0.15),
          }}
        />
      )}

      <div
        className="fixed pointer-events-none rounded-sm overflow-hidden"
        style={{
          zIndex: Z.tooltip,
          left: dragGhost.x,
          top: dragGhost.y,
          width: dragGhost.width,
          height: dragGhost.height,
          background: clipPresentation.bodyBackground,
          borderLeft: `2px solid ${isValid ? clipColor : invalidColor}`,
          boxShadow: isValid
            ? `0 4px 20px ${hexToRgba(clipColor, 0.3)}, 0 0 0 1px ${clipPresentation.bodyBorderColor}`
            : `0 4px 20px ${hexToRgba(invalidColor, 0.3)}, 0 0 0 1px ${hexToRgba(invalidColor, 0.4)}`,
          opacity: ghostLanding ? 1 : isValid ? 0.5 : 0.35,
          transition: ghostLanding ? 'opacity 180ms ease-out' : undefined,
        }}
      >
        <div
          className="absolute left-0 right-0 top-0"
          style={{
            height: HEADER_RAIL_HEIGHT_PX,
            background: isValid ? clipPresentation.headerBackground : hexToRgba(invalidColor, 0.2),
            borderBottom: `1px solid ${hexToRgba(isValid ? clipColor : invalidColor, 0.38)}`,
          }}
        />
        <div
          className="absolute left-0 right-0 bottom-0 overflow-hidden"
          style={{ top: HEADER_RAIL_HEIGHT_PX }}
        >
          <CanvasClipWaveform
            peaks={peaks}
            audioKey={null}
            audioDuration={audioDuration}
            audioOffset={audioOffset}
            clipDuration={clipDuration}
            contentOffset={contentOffset}
            timeStretchRate={timeStretchRate}
            stretchMode={stretchMode}
            width={width}
            color={isValid ? clipPresentation.waveformColor : invalidColor}
            opacityClassName="opacity-85"
            trackVolume={trackVolume}
          />
        </div>
        {isMidiClip && midiData && (
          <CanvasClipMidiThumbnail
            midiData={midiData}
            width={dragGhost.width}
            duration={clipDuration}
            bpm={bpm}
            color={isValid ? clipPresentation.waveformColor : invalidColor}
          />
        )}
        <div
          className="absolute left-1.5 right-1.5 text-[10px] font-medium truncate leading-4 z-10"
          style={{ top: 1, color: clipPresentation.titleColor }}
        >
          {prompt || displayName}
        </div>
        {dragGhost.isShiftCopy && isValid && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow z-20">
            +
          </div>
        )}
        {!isValid && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow z-20">
            ✕
          </div>
        )}
      </div>

      {dragGhost.targetLaneRect && (
        <div
          className="fixed pointer-events-none"
          style={{
            zIndex: Z.dragGhost + 1,
            left: 0,
            top: dragGhost.targetLaneRect.top,
            width: '100vw',
            height: dragGhost.targetLaneRect.height,
            backgroundColor: isValid
              ? hexToRgba(clipColor, 0.08)
              : hexToRgba(invalidColor, 0.06),
            borderTop: `1px solid ${hexToRgba(isValid ? clipColor : invalidColor, isValid ? 0.4 : 0.25)}`,
            borderBottom: `1px solid ${hexToRgba(isValid ? clipColor : invalidColor, isValid ? 0.4 : 0.25)}`,
          }}
        />
      )}
    </>,
    document.body
  );
}
