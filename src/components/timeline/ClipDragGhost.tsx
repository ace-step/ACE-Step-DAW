import React from 'react';
import { createPortal } from 'react-dom';
import type { MidiClipData, StretchMode } from '../../types/project';
import { hexToRgba } from '../../utils/color';
import { Z } from '../../utils/zIndex';
import { ClipWaveform, ClipMidiThumbnail } from './ClipWaveform';
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
          borderLeft: `2px solid ${clipColor}`,
          boxShadow: `0 4px 20px ${hexToRgba(clipColor, 0.3)}, 0 0 0 1px ${clipPresentation.bodyBorderColor}`,
          opacity: ghostLanding ? 1 : 0.5,
          transition: ghostLanding ? 'opacity 180ms ease-out' : undefined,
        }}
      >
        <div
          className="absolute left-0 right-0 top-0"
          style={{
            height: HEADER_RAIL_HEIGHT_PX,
            background: clipPresentation.headerBackground,
            borderBottom: `1px solid ${hexToRgba(clipColor, 0.38)}`,
          }}
        />
        <div
          className="absolute left-0 right-0 bottom-0 overflow-hidden"
          style={{ top: HEADER_RAIL_HEIGHT_PX }}
        >
          <ClipWaveform
            peaks={peaks}
            audioDuration={audioDuration}
            audioOffset={audioOffset}
            clipDuration={clipDuration}
            contentOffset={contentOffset}
            timeStretchRate={timeStretchRate}
            stretchMode={stretchMode}
            width={width}
            color={clipPresentation.waveformColor}
            opacityClassName="opacity-85"
            trackVolume={trackVolume}
          />
        </div>
        {isMidiClip && midiData && (
          <ClipMidiThumbnail
            midiData={midiData}
            width={dragGhost.width}
            duration={clipDuration}
            bpm={bpm}
            color={clipPresentation.waveformColor}
          />
        )}
        <div
          className="absolute left-1.5 right-1.5 text-[10px] font-medium truncate leading-4 z-10"
          style={{ top: 1, color: clipPresentation.titleColor }}
        >
          {prompt || displayName}
        </div>
        {dragGhost.isShiftCopy && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow z-20">
            +
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
            backgroundColor: hexToRgba(clipColor, 0.06),
            borderTop: `1px solid ${hexToRgba(clipColor, 0.35)}`,
            borderBottom: `1px solid ${hexToRgba(clipColor, 0.35)}`,
          }}
        />
      )}
    </>,
    document.body
  );
}
